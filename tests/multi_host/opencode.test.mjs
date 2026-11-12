import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const packageRoot = resolve(process.env.CASCADIA_OPENCODE_PACKAGE ?? "dist/multi-host/opencode");
const { default: plugin, enforce } = await import(pathToFileURL(join(packageRoot, "index.js")));

async function fixture(t) {
  const project = await mkdtemp(join(tmpdir(), "cascadia opencode "));
  t.after(() => rm(project, { recursive: true }));
  await mkdir(join(project, ".cascadia"));
  await mkdir(join(project, "results"));
  await writeFile(join(project, ".cascadia/private.json"), '{"private":true}');
  return project;
}

test("registers complete skills and enforces session-specific privacy without rewriting permissions", async (t) => {
  const project = await fixture(t);
  const publicProject = await mkdtemp(join(tmpdir(), "cascadia public "));
  t.after(() => rm(publicProject, { recursive: true }));
  const definitions = new Map(), hooks = new Map();
  await plugin.setup({
    app: { version: "2.2.0" },
    skill: { async transform(callback) { callback({
      get: (id) => definitions.get(id), add: (skill) => definitions.set(skill.id, skill),
    }); } },
    tool: { async hook(name, callback) { hooks.set(`tool:${name}`, callback); } },
    permission: { async hook(name, callback) { hooks.set(`permission:${name}`, callback); } },
    session: { async get({ sessionID }) {
      return { location: { directory: sessionID === "private" ? project : publicProject } };
    } },
  });
  assert.equal(definitions.size, 14);
  assert.ok(definitions.get("eco-analyze").content.includes("Toolkit absolute directory:"));
  const before = hooks.get("tool:execute.before");
  await assert.rejects(before({
    sessionID: "private", tool: "read", input: { path: "data_raw/synthetic.csv" },
  }), /private mode/i);
  await before({ sessionID: "private", tool: "read", input: { path: "results/public.txt" } });
  await before({ sessionID: "public", tool: "subagent", input: {} });
  const permission = hooks.get("permission:evaluate");
  const denied = { sessionID: "private", action: "read", resources: ["data_raw/synthetic.csv"], effect: "allow" };
  await permission(denied);
  assert.equal(denied.effect, "deny");
  const allowed = { sessionID: "private", action: "read", resources: ["results/public.csv"], effect: "ask" };
  await permission(allowed);
  assert.equal(allowed.effect, "ask");
  const [privateEvent, publicEvent] = ["private", "public"].map((sessionID) => ({
    sessionID, action: "subagent", resources: ["general"], effect: "allow",
  }));
  await Promise.all([permission(privateEvent), permission(publicEvent)]);
  assert.equal(privateEvent.effect, "deny");
  assert.equal(publicEvent.effect, "allow");
});

test("guard errors are visible and cannot become allow decisions", async (t) => {
  const project = await fixture(t);
  await writeFile(join(project, ".cascadia/private.json"), "{");
  await assert.rejects(enforce(project, "read", { paths: ["results/public.csv"] }), /guard failed/);
  await assert.rejects(enforce("", "read"), /session directory/);
});

test("refuses incompatible OpenCode major before registering", async () => {
  await assert.rejects(plugin.setup({ app: { version: "1.19.5" } }), /requires tested OpenCode/);
});
