import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = await realpath(process.env.CASCADIA_TEST_PLUGIN_ROOT ?? dirname(dirname(fileURLToPath(import.meta.url))));

async function waitFor<T>(check: () => Promise<T | undefined>): Promise<T> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const result = await check();
    if (result !== undefined) return result;
    await delay(100);
  }
  throw new Error("OpenCode did not become ready within 60 seconds.");
}

test("OpenCode loads the plugin and enforces private-mode permissions and shell hooks", { timeout: 120_000 }, async (t) => {
  const scratch = await realpath(await mkdtemp(join(tmpdir(), "cascadia-opencode-")));
  const project = join(scratch, "project");
  const home = join(scratch, "home");
  await Promise.all([
    mkdir(home),
    mkdir(join(project, ".cascadia"), { recursive: true }),
    mkdir(join(project, "data_raw"), { recursive: true }),
    mkdir(join(project, "results"), { recursive: true }),
  ]);
  const settings = join(project, ".cascadia/private.json");
  await writeFile(join(project, "opencode.json"), JSON.stringify({ plugins: [root] }));
  await writeFile(settings, '{"private":true}');
  const server = spawn("opencode", ["serve", "--hostname", "127.0.0.1", "--port", "0"], {
    cwd: project,
    env: {
      PATH: process.env.PATH,
      HOME: home,
      XDG_CONFIG_HOME: join(home, "config"),
      XDG_DATA_HOME: join(home, "data"),
      XDG_CACHE_HOME: join(home, "cache"),
      XDG_STATE_HOME: join(home, "state"),
      ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let spawnError: Error | undefined;
  server.on("error", (error) => { spawnError = error; });
  server.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
  server.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });
  t.after(async () => {
    if (server.pid && server.exitCode === null && server.signalCode === null) {
      const exited = once(server, "exit");
      server.kill("SIGTERM");
      await exited;
    }
    await rm(scratch, { recursive: true, force: true });
  });
  const { url, password } = await waitFor(async () => {
    if (spawnError) throw spawnError;
    assert.equal(server.exitCode, null, "OpenCode exited during startup.");
    const url = /server listening on (http:\/\/\S+)/.exec(output)?.[1];
    const password = /server password (\S+)/.exec(output)?.[1];
    return url && password ? { url, password } : undefined;
  });
  const headers = {
    authorization: `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`,
    "content-type": "application/json",
  };
  const request = (path: string, body?: unknown) => fetch(`${url}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10_000),
  });
  await waitFor(async () => {
    const response = await request("/api/plugin");
    assert.equal(response.status, 200);
    const result = await response.json();
    const plugin = result.data.find((entry: { id: string }) => entry.id === "cascadia-tools");
    if (plugin?.state.status === "error") assert.fail(JSON.stringify(plugin.state));
    return plugin?.state.status === "active" ? true : undefined;
  });
  const skillResponse = await request("/api/skill");
  assert.equal(skillResponse.status, 200);
  const skillResult = await skillResponse.json();
  const skills = skillResult.data.filter((skill: { path: string }) => skill.path.startsWith(join(root, "skills")));
  assert.equal(skills.length, 14);
  assert.ok(skills.every((skill: { content: string }) => !skill.content.includes("${CASCADIATOOLS_ROOT}")));

  const sessionResponse = await request("/api/session", { location: { directory: project } });
  assert.equal(sessionResponse.status, 200);
  const session = (await sessionResponse.json()).data;
  const permissionResponse = await request(`/api/session/${session.id}/permission`, {
    action: "read",
    resources: ["data_raw/records.csv"],
    save: [],
  });
  assert.equal(permissionResponse.status, 200);
  const permission = await permissionResponse.json();
  assert.match(JSON.stringify(permission), /deny/);

  const blockedShell = await request("/api/shell", { command: "printf data_raw", cwd: project });
  assert.notEqual(blockedShell.status, 200);
  const allowedShell = await request("/api/shell", { command: 'printf "%s" "$CASCADIATOOLS_ROOT"', cwd: project });
  assert.equal(allowedShell.status, 200);
  const shell = (await allowedShell.json()).data;
  await waitFor(async () => {
    const response = await request(`/api/shell/${shell.id}`);
    assert.equal(response.status, 200);
    const result = (await response.json()).data;
    return result.status === "running" ? undefined : result;
  });
  assert.equal(await readFile(shell.file, "utf8"), root);
  await writeFile(settings, '{"private":false}');
  const resumedShell = await request("/api/shell", { command: "printf data_raw", cwd: project });
  assert.equal(resumedShell.status, 200);
  await writeFile(settings, "{broken");
  const invalidShell = await request("/api/shell", { command: "printf ok", cwd: project });
  assert.notEqual(invalidShell.status, 200);
});
