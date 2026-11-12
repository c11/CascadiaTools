import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Skill } from "@opencode/plugin";
import { parse } from "yaml";

export async function loadSkills(root: string): Promise<Skill.Info[]> {
  const entries = await readdir(join(root, "skills"), { withFileTypes: true });
  return Promise.all(
    entries.filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name)).map(async (entry) => {
      const path = join(root, "skills", entry.name, "SKILL.md");
      const source = await readFile(path, "utf8");
      const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(source);
      if (!match) throw new Error(`Missing skill frontmatter: ${path}`);
      const metadata: unknown = parse(match[1]!);
      if (
        typeof metadata !== "object" || metadata === null ||
        !("name" in metadata) || metadata.name !== entry.name ||
        !("description" in metadata) || typeof metadata.description !== "string" ||
        !metadata.description.trim()
      ) {
        throw new Error(`Skill name must match its directory and have a description: ${path}`);
      }
      return {
        id: Skill.ID.make(entry.name),
        name: Skill.Name.make(metadata.name),
        description: metadata.description,
        path: Skill.Info.fields.path.make(path),
        content: match[2]!.replaceAll("${CASCADIATOOLS_ROOT}", root.replaceAll("\\", "/")),
      };
    }),
  );
}
