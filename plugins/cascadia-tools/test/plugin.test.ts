import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { assertPrivateShell, assertPrivateTool, loadPrivatePolicy } from "../src/private-guard.ts";
import { loadSkills } from "../src/skills.ts";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("all bundled skills load with usable toolkit paths and no Claude placeholders", async () => {
  const skills = await loadSkills(root);
  assert.equal(skills.length, 14);
  assert.equal(new Set(skills.map((skill) => skill.id)).size, skills.length);
  for (const skill of skills) {
    assert.ok(skill.description);
    assert.doesNotMatch(skill.content, /CLAUDE_PLUGIN_ROOT|\$\{CASCADIATOOLS_ROOT\}|allowed-tools:/);
    assert.ok((await readFile(skill.path, "utf8")).startsWith("---"));
  }
  assert.ok(skills.find((skill) => skill.id === "eco-analyze")?.content.includes(join(root, "core/run.R")));
});

test("skill loading handles install paths containing spaces and rejects malformed skills", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "cascadia skills "));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "skills", "example");
  await mkdir(path, { recursive: true });
  const file = join(path, "SKILL.md");
  await writeFile(file, '---\nname: example\ndescription: "A skill: with a colon"\n---\n"${CASCADIATOOLS_ROOT}/scripts/Rscript"');
  const [skill] = await loadSkills(directory);
  assert.equal(skill?.content, `"${directory}/scripts/Rscript"`);
  await writeFile(file, "---\nname: wrong\ndescription: test\n---\nbody");
  await assert.rejects(loadSkills(directory), /Skill name must match/);
  await writeFile(file, "No frontmatter");
  await assert.rejects(loadSkills(directory), /Missing skill frontmatter/);
});

test("R support scripts load from a project using the OpenCode toolkit-root environment", async (t) => {
  const project = await mkdtemp(join(tmpdir(), "cascadia-r-root-"));
  t.after(() => rm(project, { recursive: true, force: true }));
  const files = [
    "modules/jsdm/example/make_example.R",
    "modules/jsdm/validation/crosscheck_glmmtmb.R",
  ].map((file) => JSON.stringify(join(root, file))).join(", ");
  const expression = `for (file in c(${files})) {
    eval(parse(file = file)[[1]], envir = globalenv())
    stopifnot(normalizePath(eco_root()) == normalizePath(Sys.getenv("CASCADIATOOLS_ROOT")))
  }`;
  const result = spawnSync("bash", [join(root, "scripts/Rscript"), "-e", expression], {
    cwd: project,
    env: { ...process.env, CASCADIATOOLS_ROOT: root, ECOTOOLS_ROOT: "" },
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.ifError(result.error);
  if (result.status === 127 && result.stderr.includes("R not found:")) {
    t.skip("R is not installed; native plugin tests do not require it.");
    return;
  }
  assert.equal(result.status, 0, result.stderr);
});

test("private mode follows project settings and blocks native file, search, and shell operations", async (t) => {
  const project = await mkdtemp(join(tmpdir(), "cascadia-private-"));
  t.after(() => rm(project, { recursive: true, force: true }));
  await mkdir(join(project, ".cascadia"));
  await mkdir(join(project, "data_raw"));
  await mkdir(join(project, "results"));
  await mkdir(join(project, "work"));
  const settings = join(project, ".cascadia/private.json");
  const denied = /Data-private mode is on/;
  const check = (tool: string, input: unknown, cwd = project) => assertPrivateTool(cwd, project, tool, input);

  await check("read", { path: "data_raw/records.csv" });
  await writeFile(settings, '{"private":true,"data_dirs":["data_raw","data"]}');
  for (const tool of ["read", "edit", "write"]) {
    await assert.rejects(check(tool, { path: "data_raw/records.csv" }), denied);
    await assert.rejects(check(tool, { filePath: join(project, "data/new.csv") }), denied);
    await check(tool, { path: "results/estimates.csv" });
    await check(tool, { path: "data_raw_backup/records.csv" });
  }
  await assert.rejects(check("read", { path: "../data_raw/records.csv" }, join(project, "work")), denied);
  for (const tool of ["glob", "grep"]) {
    await assert.rejects(check(tool, { pattern: "*.csv" }), denied);
    await assert.rejects(check(tool, { path: ".", pattern: "record" }), denied);
    await assert.rejects(check(tool, { path: "data_raw", pattern: "record" }), denied);
    await check(tool, { path: "results", pattern: "*.csv" });
  }
  await symlink(join(project, "data_raw"), join(project, "alias"), "dir");
  await assert.rejects(check("read", { path: "alias/new.csv" }), denied);
  await assert.rejects(check("shell", { command: "cat data_raw/records.csv" }), denied);
  await assert.rejects(assertPrivateShell(join(project, "data_raw"), project, "cat records.csv"), denied);
  await assert.rejects(assertPrivateShell(project, project, 'Rscript core/run.R fit glm; cat "data_raw/records.csv"'), denied);
  await assert.rejects(assertPrivateShell(project, project, `cat "${join(project, "data_raw/records.csv")}"`), denied);
  await assertPrivateShell(project, project, `"${root}/scripts/Rscript" "${root}/core/run.R" fit glm --config config.yaml`);
  await assertPrivateShell(project, project, "cat results/estimates.csv");

  await writeFile(settings, '{"private":false}');
  await check("read", { path: "data_raw/records.csv" });
  await assertPrivateShell(project, project, "cat data_raw/records.csv");
  await writeFile(settings, "{broken");
  await assert.rejects(check("read", { path: "results/estimates.csv" }), /Invalid private-mode settings/);
  for (const data_dirs of [[], [""], "data_raw", [42]]) {
    await writeFile(settings, JSON.stringify({ private: true, data_dirs }));
    await assert.rejects(loadPrivatePolicy(project, project), /Invalid private-mode settings/);
  }
});

test("private mode supports custom external directories without affecting other projects", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "cascadia-custom-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const project = join(directory, "project");
  const other = join(directory, "other");
  const sensitive = join(directory, "sensitive records");
  await Promise.all([mkdir(join(project, ".cascadia"), { recursive: true }), mkdir(other), mkdir(sensitive)]);
  await writeFile(join(project, ".cascadia/private.json"), JSON.stringify({ private: true, data_dirs: [sensitive] }));
  await assert.rejects(assertPrivateTool(project, project, "read", { path: join(sensitive, "x.csv") }), /Data-private/);
  await assert.rejects(assertPrivateShell(project, project, `cat "${sensitive}/x.csv"`), /Data-private/);
  await assertPrivateTool(other, other, "read", { path: "data_raw/x.csv" });
});
