import { readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { Error as ToolError } from "@opencode/plugin/promise/tool";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasCode(error: unknown, code: string): boolean {
  return isRecord(error) && error.code === code;
}

function contains(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

async function canonical(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch (error) {
    if (!hasCode(error, "ENOENT")) throw error;
    const parent = dirname(path);
    if (parent === path) throw error;
    return join(await canonical(parent), relative(parent, path));
  }
}

function expand(path: string, directory: string): string {
  return resolve(directory, path.startsWith("~/") ? join(homedir(), path.slice(2)) : path);
}

export interface PrivatePolicy {
  directory: string;
  paths: string[];
  names: string[];
  message: string;
}

export async function loadPrivatePolicy(directory: string, projectRoot: string): Promise<PrivatePolicy | undefined> {
  let current = resolve(directory);
  const boundary = resolve(projectRoot);
  while (true) {
    const configPath = join(current, ".cascadia", "private.json");
    let text: string;
    try {
      text = await readFile(configPath, "utf8");
    } catch (error) {
      if (!hasCode(error, "ENOENT")) {
        throw new ToolError({ message: `Cannot read private-mode settings at ${configPath}. Tool call refused.`, error });
      }
      const parent = dirname(current);
      if (parent === current || !contains(boundary, parent)) return undefined;
      current = parent;
      continue;
    }
    try {
      const config: unknown = JSON.parse(text);
      if (!isRecord(config) || (config.private !== undefined && typeof config.private !== "boolean")) {
        throw new Error("Expected an object with a boolean private field.");
      }
      if (config.private === false) return undefined;
      const dirs: unknown = config.data_dirs ?? ["data_raw", "data"];
      if (!Array.isArray(dirs) || !dirs.length || !dirs.every((dir): dir is string => typeof dir === "string" && !!dir.trim())) {
        throw new Error("data_dirs must be a non-empty array of directory paths.");
      }
      const names = dirs.map((dir) => dir.trim().replaceAll("\\", "/").replace(/\/+$/, "") || "/");
      const paths = await Promise.all(names.map((dir) => canonical(expand(dir, current))));
      return {
        directory: current,
        names,
        paths,
        message: "Data-private mode is on: raw records stay out of the conversation. " +
          "Use CascadiaTools through a config outside the protected folders to obtain summaries and results.",
      };
    } catch (error) {
      throw new ToolError({ message: `Invalid private-mode settings at ${configPath}. Tool call refused.`, error });
    }
  }
}

export async function privatePathReason(
  policy: PrivatePolicy,
  path: string,
  directory: string,
  includeParents = false,
): Promise<string | undefined> {
  const target = await canonical(expand(path, directory));
  return policy.paths.some((protectedPath) =>
    contains(protectedPath, target) || (includeParents && contains(target, protectedPath)),
  ) ? policy.message : undefined;
}

export async function assertPrivateTool(
  directory: string,
  projectRoot: string,
  tool: string,
  input: unknown,
): Promise<void> {
  if (!["read", "edit", "write", "patch", "glob", "grep", "shell"].includes(tool)) return;
  const policy = await loadPrivatePolicy(directory, projectRoot);
  if (!policy) return;
  if (!isRecord(input)) throw new ToolError({ message: "Cannot inspect tool input while data-private mode is on." });
  if (tool === "shell") {
    if (typeof input.command !== "string") throw new ToolError({ message: "Cannot inspect private-mode shell command." });
    await assertPrivateShell(directory, projectRoot, input.command);
    return;
  }
  const search = tool === "glob" || tool === "grep";
  const paths = [input.path, input.filePath, input.file_path].filter((path): path is string => typeof path === "string");
  if (search && !paths.length) paths.push(directory);
  for (const path of paths) {
    const reason = await privatePathReason(policy, path, directory, search);
    if (reason) throw new ToolError({ message: reason });
  }
}

export async function assertPrivateShell(directory: string, projectRoot: string, command: string): Promise<void> {
  const policy = await loadPrivatePolicy(directory, projectRoot);
  if (!policy) return;
  if (await privatePathReason(policy, directory, directory)) throw new ToolError({ message: policy.message });
  const normalized = command.replaceAll("\\", "/");
  const names = [...policy.names, ...policy.paths.map((path) => path.replaceAll("\\", "/"))];
  if (names.some((name) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[\\s"'=/()])${escaped}(?=$|[/\\s"';&|<>()])`, process.platform === "win32" ? "i" : "").test(normalized);
  })) {
    throw new ToolError({ message: policy.message });
  }
}
