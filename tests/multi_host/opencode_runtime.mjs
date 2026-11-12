// Optional real-host probe. No model calls or user-profile changes.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { once } from "node:events";

const source = resolve(process.argv[2] ?? "dist/multi-host/opencode");
const root = await mkdtemp(join(tmpdir(), "cascadia native opencode "));
let child;
try {
  const installDirectory = join(root, "installed");
  await cp(source, installDirectory, { recursive: true });
  const packageRoot = await realpath(installDirectory);
  const projects = ["private", "public"].map((name) => join(root, name));
  const environmentSentinel = join(root, "user-environment.txt");
  await writeFile(environmentSentinel, "preserve user environment");
  for (const project of projects) {
    await mkdir(join(project, "results"), { recursive: true });
    execFileSync("git", ["init", "--quiet", project]);
    await writeFile(join(project, "opencode.json"), JSON.stringify({ plugins: [packageRoot] }));
  }
  await mkdir(join(projects[0], ".cascadia"));
  await writeFile(join(projects[0], ".cascadia/private.json"), '{"private":true}');
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const port = listener.address().port;
  await new Promise((done) => listener.close(done));
  const password = randomBytes(24).toString("hex");
  child = spawn("opencode", ["serve", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: projects[0], stdio: "ignore",
    env: {
      PATH: process.env.PATH, HOME: root, TMPDIR: tmpdir(), NO_COLOR: "1",
      XDG_CONFIG_HOME: join(root, "config"), XDG_DATA_HOME: join(root, "data"),
      XDG_CACHE_HOME: join(root, "cache"), XDG_STATE_HOME: join(root, "state"),
      OPENCODE_SERVER_PASSWORD: password,
      CASCADIATOOLS_R: process.env.CASCADIATOOLS_R,
      R_LIBS: process.env.R_LIBS, R_LIBS_USER: process.env.R_LIBS_USER,
    },
  });
  let spawnError;
  child.on("error", (error) => { spawnError = error; });
  async function api(path, body) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`,
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`OpenCode ${path}: HTTP ${response.status}`);
    return response.json();
  }
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (spawnError) throw spawnError;
    if (child.exitCode !== null) throw new Error(`OpenCode exited: ${child.exitCode}`);
    try {
      await api("/openapi.json");
      ready = true;
      break;
    } catch (error) {
      if (attempt === 119) throw error;
      await sleep(500);
    }
  }
  assert.ok(ready, "server did not become ready");
  const sessions = [];
  async function waitForPlugin(project, active) {
    let result;
    for (let attempt = 0; attempt < 150; attempt++) {
      result = await api(`/api/plugin?location[directory]=${encodeURIComponent(project)}`);
      const plugin = result.data.find((entry) => entry.id === "cascadia-tools");
      if ((plugin?.state.status === "active") === active) return result;
      await sleep(100);
    }
    throw new Error(`Plugin readiness mismatch: ${JSON.stringify(result.data.filter(
      (entry) => entry.id === "cascadia-tools"))}`);
  }
  for (const project of projects) {
    const query = `?location[directory]=${encodeURIComponent(project)}`;
    const session = await api("/api/session", {
      location: { directory: project },
      permissions: [
        { action: "*", resource: "*", effect: "allow" },
        { action: "read", resource: join(project, "user-only.csv"), effect: "deny" },
      ],
    });
    sessions.push(session.data.id);
    const plugins = await waitForPlugin(project, true);
    const skills = await api(`/api/skill${query}`);
    assert.equal(skills.data.filter((skill) => skill.path.startsWith(packageRoot)).length, 14,
      JSON.stringify({ plugins: plugins.data.filter((plugin) => plugin.id === "cascadia-tools"),
        skills: skills.data.map(({ id, path }) => ({ id, path })) }));
  }
  async function permission(session, action, resources) {
    const result = (await api(`/api/session/${session}/permission`, { action, resources })).data;
    return result.effect;
  }
  assert.equal(await permission(sessions[0], "read", [join(projects[0], "data_raw/synthetic.csv")]), "deny");
  assert.equal(await permission(sessions[0], "read", [join(projects[0], "results/public.csv")]), "allow");
  assert.equal(await permission(sessions[0], "shell", ["cat data_raw/synthetic.csv"]), "deny");
  assert.equal(await permission(sessions[0], "subagent", ["general"]), "deny");
  assert.equal(await permission(sessions[1], "shell", ["cat data_raw/synthetic.csv"]), "allow");
  assert.equal(await permission(sessions[1], "read", [join(projects[1], "user-only.csv")]), "deny");
  await writeFile(join(projects[0], "opencode.json"),
    JSON.stringify({ plugins: [packageRoot, "-cascadia-tools"] }));
  await waitForPlugin(projects[0], false);
  assert.equal(await permission(sessions[0], "shell", ["cat data_raw/synthetic.csv"]), "allow");
  const updatedDirectory = join(root, "updated");
  await cp(source, updatedDirectory, { recursive: true });
  await writeFile(join(projects[0], "opencode.json"), JSON.stringify({ plugins: [updatedDirectory] }));
  await waitForPlugin(projects[0], true);
  assert.equal(await permission(sessions[0], "read", [join(projects[0], "data_raw/synthetic.csv")]), "deny");
  await writeFile(join(projects[0], "opencode.json"), JSON.stringify({ plugins: [] }));
  await waitForPlugin(projects[0], false);
  assert.equal(await permission(sessions[0], "read", [join(projects[0], "user-only.csv")]), "deny");
  assert.equal(await readFile(join(projects[0], ".cascadia/private.json"), "utf8"), '{"private":true}');
  assert.equal(await readFile(environmentSentinel, "utf8"), "preserve user environment");
  console.log(JSON.stringify({ registered_skills_per_project: 14, protected_read: "deny",
    protected_shell: "deny", delegation: "deny", public_project: "allow",
    disable_update_remove: "passed", user_state: "preserved" }));
} finally {
  if (child && child.exitCode === null && child.pid) {
    child.kill("SIGTERM");
    await once(child, "exit");
  }
  await rm(root, { recursive: true });
}
