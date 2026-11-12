# CascadiaTools plugin

Validated analysis modules and working protocols that let OpenCode 2 run ecological,
wildlife, fisheries and conservation-genetic analyses correctly: every analysis checks that
the method recovers known truth at your study design before your data are interpreted, and
ends with a plain-language report, publication figures and a methods paragraph.

## Install

Requires OpenCode 2.2+, Node.js 22.18+ with npm, R 4.5+, and Bash (Git for Windows on Windows).
OpenCode 1.x is not supported. From this directory run `npm ci`, then merge the following
into your project's or global OpenCode configuration:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["/absolute/path/CascadiaTools/plugins/cascadia-tools"]
}
```

Use the plugin **directory**, not its entrypoint file. Restart OpenCode after installation.
When working in the repository itself, the root configuration already enables the plugin.

Start with *"Show me what CascadiaTools can do"* (skill `cascadia-start`), or
*"Set up CascadiaTools"* (skill `cascadia-setup`) on a new computer. Requires R 4.5+.

Skills: `eco-analyze` (end-to-end workflow), `eco-planted-truth`, `eco-acceptance-gate`,
`eco-analysis-plan`, `eco-data-intake`, `eco-convergence`, `eco-model-checking`,
`eco-interpretation`, `eco-power`, `eco-figures`, `eco-new-module`, `cascadia-start`,
`cascadia-setup`, `cascadia-private`. Module index: `catalog.md`.

## Running examples in OpenCode

Ask OpenCode to run an example using `cascadia-start`. It copies the complete
`modules/<id>/example/` folder to a new `examples/<id>/` directory in your project,
reads the walkthrough for its scientific context, and runs the bundled CLI with
those copied configs. Do not overwrite an existing example directory.

For example, after copying the GLM example, these commands run from the research
project, not from the toolkit:

```sh
"${CASCADIATOOLS_ROOT}/scripts/Rscript" "${CASCADIATOOLS_ROOT}/core/run.R" recover glm \
  --config examples/glm/recovery.yaml --nsim 100 --out recovery/glm
"${CASCADIATOOLS_ROOT}/scripts/Rscript" "${CASCADIATOOLS_ROOT}/core/run.R" fit glm \
  --config examples/glm/config.yaml --out results/glm
```

OpenCode supplies `CASCADIATOOLS_ROOT` in its shell environment. Outside OpenCode,
set it to the installed `cascadia-tools` directory. Run the recovery first and inspect
its gate before fitting or interpreting results; a failed gate remains OPEN. Use the
job runner described by `eco-analyze` for Bayesian models or long runs.

Walkthrough reproduction sections and validation records preserve the original
scientific provenance. Paths such as `dev/`, `logs/`, `results/`, and the old
`ecotools/` workspace may refer to historical files that are not distributed.
They are not OpenCode installation instructions: do not execute absent scripts,
regenerate bundled datasets, or write into the installed plugin to replay them.

Guide and examples: https://cascadiawildlifelab.org/tools/ · Cascadia Wildlife Lab, Oregon State University.
Code is MIT licensed; documentation, protocols, and examples are CC BY 4.0 (see
`LICENSE` and `LICENSE-docs`).

## Implementation and migration

The original Claude plugin was a collection of 14 Markdown skills plus a `PreToolUse`
hook. The analysis engine, R wrappers, and job runner were already independent of Claude.
Their statistical behavior is preserved; helper paths and example guidance have been
updated for OpenCode.

The OpenCode entrypoint is `src/index.ts`, using the native `@opencode/plugin` 2.2 API:

- A skill transform registers every bundled skill, preserving its description for discovery.
  `${CASCADIATOOLS_ROOT}` in skill bodies is resolved to the installed toolkit's absolute
  path at load time; it does not depend on the research project's working directory.
- A session-context hook points the agent to the toolkit and its workflow skills.
- Tool and permission hooks protect private data paths. A shell hook checks commands
  and sets `CASCADIATOOLS_ROOT` for the existing R wrappers.
- Private-mode checks run in the plugin runtime, not an R subprocess. Invalid settings
  fail closed with an explicit error. Settings are reread on every operation, so enabling
  or disabling private mode takes effect without restarting.

Keep `.cascadia/private.json` in the research project root. Private mode blocks searches
whose scope includes protected folders, including project-wide searches. Shell commands
that name protected folders are refused even if they also contain a toolkit command;
use a config outside those folders instead. This is deliberately more conservative than
the old hook's pipeline exemption. These are pattern-based checks, not a security boundary:
custom tools, prompt attachments, obfuscated shell commands, and files copied elsewhere
are not guaranteed to be covered. Use the toolkit without AI for the strictest cases.

Existing Claude installations must replace their marketplace entry with the configuration
above. Existing `.cascadia/private.json` files still work; OpenCode does not use Claude
settings or marketplace manifests.

## Repository contents

Every retained source group supports the plugin or its validated analyses:

| Files | Role |
|---|---|
| `src/`, `skills/`, `package.json` | Native OpenCode integration, privacy hooks, skill registration, and runtime dependencies |
| `core/`, `scripts/` | Shared R engine, portable R launchers, and local/SLURM job execution |
| `modules/` | 29 analysis modules, one authoring template, engine helpers, example data/configs, and validation checks/records |
| `catalog.md`, `docs/catalog.json`, `tools/make_catalog.py` | Module selection metadata and its generator |
| `docs/`, `tools/build_si.py` | Authoring/figure guidance, validation provenance, and optional worked-example publication tooling |
| `tools/install_packages.R`, `tools/requirements-numpyro.txt` | Analysis dependency setup, including optional Python engines |
| `test/`, `tsconfig.json`, `package-lock.json` | Regression tests, compile checks, and reproducible dependency installation |
| Licenses and the repository's `CITATION.cff` | Attribution and distribution requirements for the toolkit and its scientific documentation |

Generated `node_modules/` and `dist/` directories are local development artifacts,
not source assets. Remaining mentions of Claude describe the migration or test
that old placeholders cannot reach loaded skills; they are not active integrations.

## Development

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run test:opencode
```

OpenCode loads the TypeScript source directly; the build is an additional compile check.
Package exports and runtime paths work from either source or compiled output. `npm pack`
includes the skills and the full analysis toolkit, not just the entrypoint.
The optional native smoke test requires the `opencode` executable. It starts an isolated
server, checks skill discovery and privacy enforcement without calling a model, and
stops the server and removes its temporary project afterward.
