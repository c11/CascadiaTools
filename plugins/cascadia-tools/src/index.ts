import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Plugin } from "@opencode/plugin";
import { assertPrivateShell, assertPrivateTool, loadPrivatePolicy, privatePathReason } from "./private-guard.ts";
import { loadSkills } from "./skills.ts";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

export default Plugin.define({
  id: "cascadia-tools",
  async setup(ctx) {
    const skills = await loadSkills(root);
    await ctx.skill.transform((editor) => {
      for (const skill of skills) editor.add(skill);
    });

    await ctx.session.hook("context", (event) => {
      event.system.push({
        type: "text",
        text: `CascadiaTools is installed at ${root}. Load cascadia-start for orientation, ` +
          "cascadia-setup for dependencies, eco-analyze for an analysis, or cascadia-private for sensitive data. " +
          "Keep work and outputs in the researcher's project, never in the toolkit.",
      });
    });

    await ctx.tool.hook("execute.before", async (event) => {
      if (!["read", "edit", "write", "patch", "glob", "grep", "shell"].includes(event.tool)) return;
      const session = await ctx.session.get({ sessionID: event.sessionID });
      await assertPrivateTool(session.location.directory, ctx.location.project.directory, event.tool, event.input);
    });

    await ctx.permission.hook("evaluate", async (event) => {
      if (event.action !== "read" && event.action !== "edit") return;
      const session = await ctx.session.get({ sessionID: event.sessionID });
      const directory = session.location.directory;
      const policy = await loadPrivatePolicy(directory, ctx.location.project.directory);
      if (!policy) return;
      for (const resource of event.resources) {
        const reason = await privatePathReason(policy, resource, directory);
        if (reason) {
          event.effect = "deny";
          event.message = reason;
          return;
        }
      }
    });

    await ctx.shell.hook("create.before", async (event) => {
      await assertPrivateShell(event.cwd, ctx.location.project.directory, event.command);
      event.env.CASCADIATOOLS_ROOT = root;
    });
  },
});
