import { execFile } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const packageRoot = dirname(fileURLToPath(import.meta.url));
const toolkit = join(packageRoot, "toolkit");

export function projectRoot(cwd) {
  let directory = realpathSync(cwd);
  while (true) {
    if (existsSync(join(directory, ".cascadia/private.json"))) return directory;
    const parent = dirname(directory);
    if (parent === directory) return realpathSync(cwd);
    directory = parent;
  }
}

function runGuard(request, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = execFile("bash", [
      join(toolkit, "scripts/Rscript"), join(toolkit, "scripts/private_guard.R"), "--neutral",
    ], {
      cwd, env: { ...process.env, CASCADIATOOLS_ROOT: toolkit },
      timeout: 20_000, maxBuffer: 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Cascadia privacy guard failed: ${stderr.trim() || error.message}`));
        return;
      }
      try {
        const result = JSON.parse(stdout);
        if (result.decision === "allow") resolvePromise();
        else if (result.decision === "deny" && result.reason) reject(new Error(result.reason));
        else reject(new Error("Invalid Cascadia privacy decision"));
      } catch (parseError) {
        reject(parseError);
      }
    });
    child.stdin.on("error", reject);
    child.stdin.end(JSON.stringify(request));
  });
}

export async function enforce(cwd, operation, details = {}) {
  if (typeof cwd !== "string" || !isAbsolute(cwd)) throw new Error("Missing absolute session directory");
  const project = projectRoot(cwd);
  if (!existsSync(join(project, ".cascadia/private.json"))) return;
  await runGuard({ version: 1, host: "opencode", project, toolkit, operation, ...details }, cwd);
}

function toolRequest(tool, input, cwd, skills) {
  if (!input || typeof input !== "object") throw new Error("Invalid tool arguments");
  if (["read", "write", "edit"].includes(tool)) {
    const path = input.path ?? input.filePath;
    if (typeof path !== "string" || !path) throw new Error("Missing tool file path");
    return [tool === "read" ? "read" : "write", { paths: [resolve(cwd, path)] }];
  }
  if (tool === "shell") return ["shell", { command: input.command }];
  if (tool === "skill" && skills.includes(input.id)) return ["passive", {}];
  if (["question", "todo"].includes(tool)) return ["passive", {}];
  return ["unsupported", {}];
}

export default {
  id: "cascadia-tools",
  async setup(ctx) {
    if (!/^2\.2\./.test(ctx.app.version)) throw new Error("CascadiaTools requires tested OpenCode 2.2.x");
    const manifest = JSON.parse(readFileSync(join(packageRoot, "cascadia-build.json"), "utf8"));
    if (manifest.host !== "opencode" || !existsSync(join(toolkit, "core/run.R"))) {
      throw new Error("Install the complete built OpenCode package, not the adapter source");
    }
    const definitions = manifest.skills.map((id) => {
      const path = join(packageRoot, "skills", id, "SKILL.md");
      const text = readFileSync(path, "utf8");
      const match = /^---\n[\s\S]*?description: ([^\n]+)\n---\n([\s\S]*)$/.exec(text);
      if (!match) throw new Error(`Invalid CascadiaTools skill: ${id}`);
      return {
        id, name: id, path, description: match[1], autoinvoke: true,
        content: `Toolkit absolute directory: ${toolkit}\n\n${match[2]}`,
      };
    });
    await ctx.skill.transform((editor) => {
      for (const skill of definitions) {
        if (editor.get(skill.id)) throw new Error(`Duplicate CascadiaTools skill: ${skill.id}`);
        editor.add(skill);
      }
    });
    await ctx.tool.hook("execute.before", async (event) => {
      const session = await ctx.session.get({ sessionID: event.sessionID });
      const cwd = session.location.directory;
      if (!existsSync(join(projectRoot(cwd), ".cascadia/private.json"))) return;
      const [operation, details] = toolRequest(event.tool, event.input, cwd, manifest.skills);
      await enforce(cwd, operation, details);
    });
    await ctx.permission.hook("evaluate", async (event) => {
      try {
        const session = await ctx.session.get({ sessionID: event.sessionID });
        const cwd = session.location.directory;
        if (!existsSync(join(projectRoot(cwd), ".cascadia/private.json"))) return;
        if (["read", "edit", "external_directory"].includes(event.action)) {
          await enforce(cwd, event.action === "edit" ? "write" : "read", {
            paths: event.resources.map((path) => resolve(cwd, path)),
          });
        } else if (event.action === "shell") {
          for (const command of event.resources) await enforce(cwd, "shell", { command });
        } else if ((event.action === "skill" && event.resources.every((id) => manifest.skills.includes(id)))
          || ["question", "todo"].includes(event.action)) {
          await enforce(cwd, "passive");
        } else {
          await enforce(cwd, "unsupported");
        }
      } catch (error) {
        event.effect = "deny";
        event.message = error instanceof Error ? error.message : "Cascadia privacy enforcement failed";
      }
    });
  },
};
