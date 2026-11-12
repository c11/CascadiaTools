# Claude-to-OpenCode migration notes

Date: 2026-11-12

## Summary and scope

CascadiaTools was converted from a Claude Code marketplace plugin to a native
OpenCode 2 plugin. The original integration consisted of marketplace/plugin
metadata, 14 Markdown skills, and a Bash/R `PreToolUse` privacy hook.

The migration replaces that integration, preserves the scientific toolkit, and
updates installation, privacy, and example-running guidance. A subsequent
repository-wide audit addressed remaining migration-related references and
toolkit-root assumptions.

The package name and version remain `cascadia-tools` and `0.2.1`. No npm
publication, deployment, or release was performed.

## Compatibility

| Component | Requirement or implementation |
|---|---|
| OpenCode | 2.2 or newer; tested with OpenCode 2.2.0 |
| OpenCode SDK | `@opencode/plugin` pinned to `2.2.0` |
| Node.js | 22.18 or newer for package development and tests |
| R | 4.5 or newer for scientific analyses |
| Shell | Bash; Git for Windows supplies it on Windows |
| Python | Optional, for the existing NumPyro engines and supporting tools |

OpenCode 1.x is not supported. This implementation uses the native V2 API,
including `Plugin.define`, context-domain hooks, and skill transforms. It is not
a V1 plugin with renamed configuration.

## Removed Claude-specific files

The following obsolete integration files were deleted:

| Removed path | Previous role |
|---|---|
| `.claude-plugin/marketplace.json` | Claude marketplace declaration |
| `plugins/cascadia-tools/.claude-plugin/plugin.json` | Claude plugin manifest |
| `plugins/cascadia-tools/.claude-plugin/icon.png` | Claude marketplace icon |
| `plugins/cascadia-tools/hooks/hooks.json` | Claude `PreToolUse` hook registration |
| `plugins/cascadia-tools/scripts/private_guard` | Bash launcher for the old privacy hook |
| `plugins/cascadia-tools/scripts/private_guard.R` | R implementation of the old privacy hook |

OpenCode does not use these manifests, marketplace commands, or Claude settings.
Remaining references to Claude in the active repository explain the migration
or check that obsolete placeholders cannot reach loaded skills.

## Added OpenCode integration and packaging

### Repository configuration

Added [opencode.json](../opencode.json) at the repository root:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["./plugins/cascadia-tools"]
}
```

This enables the local plugin when OpenCode is opened in this repository.
Other research projects must configure the installed plugin directory
separately.

Updated [.gitignore](../.gitignore) to exclude generated `node_modules/` and
`dist/` directories.

### Plugin package

Added these files under `plugins/cascadia-tools/`:

| Added file | Purpose |
|---|---|
| [package.json](../plugins/cascadia-tools/package.json) | ESM package metadata, source entrypoint, distributed assets, dependencies, and development commands |
| [package-lock.json](../plugins/cascadia-tools/package-lock.json) | Reproducible npm dependency installation |
| [tsconfig.json](../plugins/cascadia-tools/tsconfig.json) | Strict TypeScript compilation from `src/` to `dist/` |
| [src/index.ts](../plugins/cascadia-tools/src/index.ts) | Native OpenCode plugin definition and lifecycle registrations |
| [src/skills.ts](../plugins/cascadia-tools/src/skills.ts) | Bundled skill discovery, metadata validation, and toolkit-path substitution |
| [src/private-guard.ts](../plugins/cascadia-tools/src/private-guard.ts) | Native privacy policy loading and path/command checks |
| [test/plugin.test.ts](../plugins/cascadia-tools/test/plugin.test.ts) | Focused skill, privacy, and R startup regression tests |
| [test/opencode-smoke.ts](../plugins/cascadia-tools/test/opencode-smoke.ts) | Isolated native OpenCode integration test |
| [LICENSE](../plugins/cascadia-tools/LICENSE) | Copy of the root MIT license for package distribution |
| [LICENSE-docs](../plugins/cascadia-tools/LICENSE-docs) | Copy of the documentation/example CC BY 4.0 notice for package distribution |

The runtime dependencies are `@opencode/plugin` and `yaml`. Development
dependencies are TypeScript and Node.js type definitions. The package repository
metadata points to `c11/CascadiaTools`, with the plugin subdirectory recorded.
Original authorship, scientific attribution, and license notices are preserved.

The default export resolves to `src/index.ts`; OpenCode loads TypeScript source
directly. The build emits compiled output and declarations as an additional
compile check. Source and compiled entrypoints derive the same toolkit root.
Strict checks include unchecked indexed access and exact optional properties;
erasable TypeScript syntax and rewritten relative import extensions support the
source/build arrangement.

The package includes `src/`, `skills/`, `core/`, `modules/`, `scripts/`, `tools/`,
`docs/`, the module catalog, and both license notices. Generated dependencies,
build output, and development tests are not shipped.

## Native plugin behavior

The stable plugin ID is `cascadia-tools`.

| OpenCode API | Migration behavior |
|---|---|
| `ctx.skill.transform` | Registers all 14 bundled skills with their descriptions and source paths |
| `ctx.session.hook("context", ...)` | Adds toolkit location and workflow guidance to the agent's model context |
| `ctx.tool.hook("execute.before", ...)` | Checks supported native file, search, patch, and shell tool operations in private mode |
| `ctx.permission.hook("evaluate", ...)` | Denies protected read/edit resources after native permission evaluation |
| `ctx.shell.hook("create.before", ...)` | Checks shell commands and supplies `CASCADIATOOLS_ROOT` in the shell environment |

Tool and permission checks obtain the session's actual location rather than
assuming every operation belongs to the location where the plugin loaded.
Shell checks use the operation's working directory.

Work, temporary analysis scripts, and outputs remain in the researcher's project,
not inside the installed toolkit.

## Skill migration

All 14 existing skills are registered:

- `cascadia-private`
- `cascadia-setup`
- `cascadia-start`
- `eco-acceptance-gate`
- `eco-analysis-plan`
- `eco-analyze`
- `eco-convergence`
- `eco-data-intake`
- `eco-figures`
- `eco-interpretation`
- `eco-model-checking`
- `eco-new-module`
- `eco-planted-truth`
- `eco-power`

The loader reads each skill's YAML frontmatter, requires its name to match its
directory, requires a non-empty description, and registers the body without
frontmatter. Invalid skill definitions fail explicitly.

Replaced `${CLAUDE_PLUGIN_ROOT}` with `${CASCADIATOOLS_ROOT}` in the ten changed
skill files:

| Skill | Changes |
|---|---|
| `cascadia-private` | Native privacy behavior, OpenCode permission rules, limitations, and safe removal of only mode-specific rules |
| `cascadia-setup` | Toolkit-root paths, removal of Claude `allowed-tools` frontmatter, OpenCode restart guidance, and Windows Bash configuration |
| `cascadia-start` | Toolkit-root paths and current example-running guidance instead of replaying historical commands |
| `eco-acceptance-gate` | Toolkit-root references for recovery commands and thresholds |
| `eco-analysis-plan` | Toolkit-root reference to the module catalog |
| `eco-analyze` | Toolkit-root references to the catalog, modules, R runner, and job runner |
| `eco-figures` | Toolkit-root paths and the native `read` tool name |
| `eco-new-module` | Toolkit-root references to the module specification, template, and catalog |
| `eco-planted-truth` | Toolkit-root references in recovery commands |
| `eco-power` | Toolkit-root references in power-analysis commands |

At load time, the loader replaces `${CASCADIATOOLS_ROOT}` in skill bodies with the
installed toolkit's absolute path. Separately, the shell hook sets the environment
variable for shell commands. Skill instructions therefore do not depend on the
research project's working directory.

The other four skill files were retained without content changes.

## Privacy migration and intentional behavior changes

The existing project-level configuration is preserved:

```json
{
  "private": true,
  "data_dirs": ["data_raw", "data"]
}
```

Store it as `.cascadia/private.json` in the research project. Omitting `data_dirs`
uses the defaults above. Setting `"private": false` disables the guard. Policies
are read on each relevant operation, so changes do not require a plugin restart.

The native guard:

- Runs in the plugin runtime without launching R or requiring `jsonlite`.
- Looks for policy settings in the operation's directory and applicable project
  ancestors.
- Resolves protected paths, including symlinks and existing parents of paths that
  have not been created yet.
- Checks native reads, edits, writes, searches, shell operations, and read/edit
  permission resources, including mutation resources used by patches.
- Refuses relevant operations when settings cannot be read or are invalid.
- Allows ordinary results/config workflows outside protected folders.

Two deliberate restrictions are stronger than the old hook:

1. Searches whose scope includes a protected folder are blocked, including
   project-wide searches.
2. Naming protected folders in a shell command is blocked even if the command also
   contains a toolkit invocation. The old blanket pipeline exemption was removed.
   Use configs outside protected folders instead.

The private-mode skill now describes OpenCode's ordered `permissions` rules using
`read`/`edit`, `resource`, and `effect: "deny"`. These replace instructions to edit
`.claude/settings.json`. Existing Claude permission settings are not automatically
converted; merge equivalent rules into OpenCode configuration and verify denial.
Turning private mode off must remove only its own rules, not unrelated settings.

These are pattern-based safeguards, not a sandbox or a security boundary. Custom
tools, prompt attachments, obfuscated shell commands, and data copied elsewhere
are not guaranteed to be covered. Summaries and results can still reach the model
provider. The strictest cases should use the toolkit without AI.

## Documentation and scientific asset audit

### Installation and repository guidance

Updated [the root README](../README.md) and
[the plugin README](../plugins/cascadia-tools/README.md) to cover:

- Native OpenCode installation and directory-based plugin configuration.
- OpenCode/Node.js/R/Bash requirements and lack of OpenCode 1.x support.
- Windows configuration using Git for Windows Bash.
- Current example execution using copied configs and absolute toolkit paths.
- Privacy limitations and conservative guard behavior.
- Plugin architecture, development commands, package contents, and retained
  scientific/support file roles.

### Module authoring

Updated [MODULE_SPEC.md](../plugins/cascadia-tools/docs/MODULE_SPEC.md):

- Uses CascadiaTools/OpenCode terminology.
- Links to the real analysis and acceptance-gate skills instead of missing
  legacy protocol locations.
- Uses the native `read` tool name.
- Documents `CASCADIATOOLS_ROOT`, the R wrapper, and the R 4.5+ requirement.
- Places reusable checks under module validation directories and temporary work
  in the research project.
- Explains local and SLURM execution through the existing job runner.

### Walkthroughs and historical provenance

All 29 `modules/<id>/example/WALKTHROUGH.md` files now warn that reproduction
commands are historical validation records. Some refer to unbundled `dev/`
scripts or the old `ecotools/` workspace and must not be executed verbatim.
Existing prompts addressed to Claude were changed to OpenCode where present.

The affected module IDs are:

```text
abund-interactions  causal             cjs                community
distance           fisheries-growth   fisheries-stock    glm
ipm                jolly-seber        jsdm               movement-hmm
movement-ssf       multistate          nmixture           occu-rota
occu-single        occu-spatial        occu-waddle        popgen-ne
popgen-structure   pva                scr                scr-open
scr-search         scr-smr            sdm-presence-only  sem
timeseries
```

Historical commands and scientific results were preserved rather than replaced
with invented scripts or newly generated datasets. The `cascadia-start` skill now
directs the agent to read the narrative and limits, copy the example to the
project, and use the bundled CLI with the copied config/recovery files.

Updated
[scr-open/VALIDATION.md](../plugins/cascadia-tools/modules/scr-open/VALIDATION.md)
to remove the reference to a nonexistent `../CLAUDE.md` and identify the original
SCR benchmark and its dataset as external, unbundled historical material. The
reported numerical results were not changed.

### R helper startup fixes

Two JSDM support scripts previously looked only at `ECOTOOLS_ROOT` and otherwise
assumed the toolkit was the working directory:

- [example/make_example.R](../plugins/cascadia-tools/modules/jsdm/example/make_example.R)
- [validation/crosscheck_glmmtmb.R](../plugins/cascadia-tools/modules/jsdm/validation/crosscheck_glmmtmb.R)

Their initial loader now checks `CASCADIATOOLS_ROOT` first and retains
`ECOTOOLS_ROOT` as a compatibility fallback. This supports startup from a research
project using the environment supplied by OpenCode. Their scientific calculations
were not modified.

### Retained assets

The audit inventoried 673 source files before this notes file was added, excluding
generated dependencies and build output. Of these, 621 are module assets and 52
are integration, repository, or supporting files.

The following remain relevant and were not removed:

- The 29 scientific modules and the module-authoring template.
- R/Python/C++ engine code, example datasets, and example/recovery configs.
- Validation scripts, validation records, and the larger-recovery study record.
- Shared core R utilities, R launchers, and the local/SLURM job runner.
- The module catalogs and their generator.
- Dependency setup tools, optional Python requirements, and worked-example
  publication tooling.
- Scientific citation metadata and licensing/attribution.

No model equations, likelihoods, priors, acceptance thresholds, or bundled datasets
were changed.

## Files carried over from the Claude implementation

The complete inventory below distinguishes direct, unchanged carry-over from
files inherited from the Claude implementation and adapted for OpenCode.
All paths are relative to the repository root.

- **Unchanged carry-over:** 616 pre-existing files retained without migration edits.
- **Adapted carry-over:** 46 pre-existing files retained with the changes described
  in the preceding sections.
- **Total inherited files:** 662, comprising 657 files in the original plugin
  directory and 5 repository-level documentation, attribution, or configuration
  files.

The six removed integration files are listed under "Removed Claude-specific
files." Newly implemented OpenCode files and this notes file are excluded from
the inherited-file inventory. The two new package-local license files are copies
of the original root notices, as documented under "Plugin package."

The lists are a migration snapshot, not an instruction to copy the removed Claude
manifests or hooks into an OpenCode installation.

<!-- BEGIN CLAUDE CARRYOVER FILE INVENTORY -->

Inventory baseline: pre-migration Git commit `e1e01a9`; classification reflects
the completed migration worktree on 2026-11-12.

### Unchanged carry-over (616 files)

<details>
<summary>Expand the complete file list</summary>

#### Repository root (3 files)

```text
CITATION.cff
LICENSE
LICENSE-docs
```

#### Plugin root (1 files)

```text
plugins/cascadia-tools/catalog.md
```

#### core/ (8 files)

```text
plugins/cascadia-tools/core/R/contract.R
plugins/cascadia-tools/core/R/env.R
plugins/cascadia-tools/core/R/figures.R
plugins/cascadia-tools/core/R/mcmc.R
plugins/cascadia-tools/core/R/recovery.R
plugins/cascadia-tools/core/R/report.R
plugins/cascadia-tools/core/load.R
plugins/cascadia-tools/core/run.R
```

#### docs/ (3 files)

```text
plugins/cascadia-tools/docs/FIGURES.md
plugins/cascadia-tools/docs/LARGE_RECOVERY_PLAN.md
plugins/cascadia-tools/docs/catalog.json
```

#### Module: _template (1 files)

```text
plugins/cascadia-tools/modules/_template/module.R
```

#### Module: abund-interactions (15 files)

```text
plugins/cascadia-tools/modules/abund-interactions/R/engines.R
plugins/cascadia-tools/modules/abund-interactions/R/gof.R
plugins/cascadia-tools/modules/abund-interactions/R/io.R
plugins/cascadia-tools/modules/abund-interactions/R/prep.R
plugins/cascadia-tools/modules/abund-interactions/R/report.R
plugins/cascadia-tools/modules/abund-interactions/README.md
plugins/cascadia-tools/modules/abund-interactions/VALIDATION.md
plugins/cascadia-tools/modules/abund-interactions/example/README_data.md
plugins/cascadia-tools/modules/abund-interactions/example/TRUTH.md
plugins/cascadia-tools/modules/abund-interactions/example/config.yaml
plugins/cascadia-tools/modules/abund-interactions/example/deployments.csv
plugins/cascadia-tools/modules/abund-interactions/example/records.csv
plugins/cascadia-tools/modules/abund-interactions/example/recovery.yaml
plugins/cascadia-tools/modules/abund-interactions/example/sites.csv
plugins/cascadia-tools/modules/abund-interactions/module.R
```

#### Module: causal (33 files)

```text
plugins/cascadia-tools/modules/causal/README.md
plugins/cascadia-tools/modules/causal/VALIDATION.md
plugins/cascadia-tools/modules/causal/dag.R
plugins/cascadia-tools/modules/causal/engine.R
plugins/cascadia-tools/modules/causal/example/README_data.md
plugins/cascadia-tools/modules/causal/example/config.yaml
plugins/cascadia-tools/modules/causal/example/config_panel.yaml
plugins/cascadia-tools/modules/causal/example/recovery.yaml
plugins/cascadia-tools/modules/causal/example/snail_panel.csv
plugins/cascadia-tools/modules/causal/example/stream_trout_reaches.csv
plugins/cascadia-tools/modules/causal/module.R
plugins/cascadia-tools/modules/causal/output.R
plugins/cascadia-tools/modules/causal/simulate.R
plugins/cascadia-tools/modules/causal/validation/binary_binomial.yaml
plugins/cascadia-tools/modules/causal/validation/binary_whatif.yaml
plugins/cascadia-tools/modules/causal/validation/ci_bootstrap.yaml
plugins/cascadia-tools/modules/causal/validation/ci_delta.yaml
plugins/cascadia-tools/modules/causal/validation/default.yaml
plugins/cascadia-tools/modules/causal/validation/force_collider.yaml
plugins/cascadia-tools/modules/causal/validation/force_mediator.yaml
plugins/cascadia-tools/modules/causal/validation/force_omit_confounder.yaml
plugins/cascadia-tools/modules/causal/validation/gaussian_direct.yaml
plugins/cascadia-tools/modules/causal/validation/hard_small.yaml
plugins/cascadia-tools/modules/causal/validation/null_effect.yaml
plugins/cascadia-tools/modules/causal/validation/panel_fixed_gaussian.yaml
plugins/cascadia-tools/modules/causal/validation/panel_oneway.yaml
plugins/cascadia-tools/modules/causal/validation/panel_pooled.yaml
plugins/cascadia-tools/modules/causal/validation/panel_twoway.yaml
plugins/cascadia-tools/modules/causal/validation/panel_whatif.yaml
plugins/cascadia-tools/modules/causal/validation/poisson_default.yaml
plugins/cascadia-tools/modules/causal/validation/poisson_modelvcov.yaml
plugins/cascadia-tools/modules/causal/validation/poisson_optimal.yaml
plugins/cascadia-tools/modules/causal/validation/whatif_controls.yaml
```

#### Module: cjs (21 files)

```text
plugins/cascadia-tools/modules/cjs/R/engines.R
plugins/cascadia-tools/modules/cjs/R/fit.R
plugins/cascadia-tools/modules/cjs/R/io.R
plugins/cascadia-tools/modules/cjs/R/prep.R
plugins/cascadia-tools/modules/cjs/R/report.R
plugins/cascadia-tools/modules/cjs/R/sim.R
plugins/cascadia-tools/modules/cjs/README.md
plugins/cascadia-tools/modules/cjs/VALIDATION.md
plugins/cascadia-tools/modules/cjs/example/README_data.md
plugins/cascadia-tools/modules/cjs/example/TRUTH.txt
plugins/cascadia-tools/modules/cjs/example/config.yaml
plugins/cascadia-tools/modules/cjs/example/config_dipper.yaml
plugins/cascadia-tools/modules/cjs/example/config_nimble.yaml
plugins/cascadia-tools/modules/cjs/example/dipper_captures.csv
plugins/cascadia-tools/modules/cjs/example/dipper_years.csv
plugins/cascadia-tools/modules/cjs/example/recovery.yaml
plugins/cascadia-tools/modules/cjs/example/sosp_birds.csv
plugins/cascadia-tools/modules/cjs/example/sosp_captures.csv
plugins/cascadia-tools/modules/cjs/example/sosp_years.csv
plugins/cascadia-tools/modules/cjs/module.R
plugins/cascadia-tools/modules/cjs/tmb/cjsre_tmb.cpp
```

#### Module: community (19 files)

```text
plugins/cascadia-tools/modules/community/README.md
plugins/cascadia-tools/modules/community/VALIDATION.md
plugins/cascadia-tools/modules/community/engine.R
plugins/cascadia-tools/modules/community/example/README_data.md
plugins/cascadia-tools/modules/community/example/cascades_bird_counts.csv
plugins/cascadia-tools/modules/community/example/cascades_stations.csv
plugins/cascadia-tools/modules/community/example/config.yaml
plugins/cascadia-tools/modules/community/example/recovery.yaml
plugins/cascadia-tools/modules/community/io.R
plugins/cascadia-tools/modules/community/module.R
plugins/cascadia-tools/modules/community/output.R
plugins/cascadia-tools/modules/community/simulate.R
plugins/cascadia-tools/modules/community/validation/dispersion_unbalanced.yaml
plugins/cascadia-tools/modules/community/validation/hard_small.yaml
plugins/cascadia-tools/modules/community/validation/misspec_unadjusted.yaml
plugins/cascadia-tools/modules/community/validation/misspec_unadjusted_small.yaml
plugins/cascadia-tools/modules/community/validation/null_effects.yaml
plugins/cascadia-tools/modules/community/validation/presence.yaml
plugins/cascadia-tools/modules/community/validation/strong_gradient.yaml
```

#### Module: distance (19 files)

```text
plugins/cascadia-tools/modules/distance/R/detfun.R
plugins/cascadia-tools/modules/distance/R/engine_ds.R
plugins/cascadia-tools/modules/distance/R/engine_hds.R
plugins/cascadia-tools/modules/distance/R/engine_rlik.R
plugins/cascadia-tools/modules/distance/R/fit.R
plugins/cascadia-tools/modules/distance/R/io.R
plugins/cascadia-tools/modules/distance/R/prep.R
plugins/cascadia-tools/modules/distance/R/report.R
plugins/cascadia-tools/modules/distance/R/sim.R
plugins/cascadia-tools/modules/distance/README.md
plugins/cascadia-tools/modules/distance/VALIDATION.md
plugins/cascadia-tools/modules/distance/example/README_data.md
plugins/cascadia-tools/modules/distance/example/config.yaml
plugins/cascadia-tools/modules/distance/example/config_mcds.yaml
plugins/cascadia-tools/modules/distance/example/deer_observations.csv
plugins/cascadia-tools/modules/distance/example/deer_transects.csv
plugins/cascadia-tools/modules/distance/example/recovery.yaml
plugins/cascadia-tools/modules/distance/example/study_area_grid.csv
plugins/cascadia-tools/modules/distance/module.R
```

#### Module: fisheries-growth (28 files)

```text
plugins/cascadia-tools/modules/fisheries-growth/README.md
plugins/cascadia-tools/modules/fisheries-growth/VALIDATION.md
plugins/cascadia-tools/modules/fisheries-growth/engine_nimble.R
plugins/cascadia-tools/modules/fisheries-growth/engine_nls.R
plugins/cascadia-tools/modules/fisheries-growth/example/README_data.md
plugins/cascadia-tools/modules/fisheries-growth/example/config.yaml
plugins/cascadia-tools/modules/fisheries-growth/example/config_hierarchical.yaml
plugins/cascadia-tools/modules/fisheries-growth/example/config_si.yaml
plugins/cascadia-tools/modules/fisheries-growth/example/recovery.yaml
plugins/cascadia-tools/modules/fisheries-growth/example/sim_walleye_2014.csv
plugins/cascadia-tools/modules/fisheries-growth/example/sim_walleye_2014_truth.json
plugins/cascadia-tools/modules/fisheries-growth/example/walleye_lake_erie.csv
plugins/cascadia-tools/modules/fisheries-growth/example/year_covariates.csv
plugins/cascadia-tools/modules/fisheries-growth/lw.R
plugins/cascadia-tools/modules/fisheries-growth/module.R
plugins/cascadia-tools/modules/fisheries-growth/output.R
plugins/cascadia-tools/modules/fisheries-growth/simulate.R
plugins/cascadia-tools/modules/fisheries-growth/validation/additive_nls.yaml
plugins/cascadia-tools/modules/fisheries-growth/validation/default_nimble_fixed.yaml
plugins/cascadia-tools/modules/fisheries-growth/validation/default_nls.yaml
plugins/cascadia-tools/modules/fisheries-growth/validation/hard_hier.yaml
plugins/cascadia-tools/modules/fisheries-growth/validation/hard_nimble_fixed.yaml
plugins/cascadia-tools/modules/fisheries-growth/validation/hard_nls.yaml
plugins/cascadia-tools/modules/fisheries-growth/validation/hier_nimble.yaml
plugins/cascadia-tools/modules/fisheries-growth/validation/misspec_selectivity.yaml
plugins/cascadia-tools/modules/fisheries-growth/validation/null_hier.yaml
plugins/cascadia-tools/modules/fisheries-growth/validation/null_nls.yaml
plugins/cascadia-tools/modules/fisheries-growth/validation/power_nls.yaml
```

#### Module: fisheries-stock (18 files)

```text
plugins/cascadia-tools/modules/fisheries-stock/R/catch_curve.R
plugins/cascadia-tools/modules/fisheries-stock/R/common.R
plugins/cascadia-tools/modules/fisheries-stock/R/stock_recruit.R
plugins/cascadia-tools/modules/fisheries-stock/R/surplus_production.R
plugins/cascadia-tools/modules/fisheries-stock/README.md
plugins/cascadia-tools/modules/fisheries-stock/VALIDATION.md
plugins/cascadia-tools/modules/fisheries-stock/example/README_data.md
plugins/cascadia-tools/modules/fisheries-stock/example/config.yaml
plugins/cascadia-tools/modules/fisheries-stock/example/config_multiyear.yaml
plugins/cascadia-tools/modules/fisheries-stock/example/config_stock_recruit.yaml
plugins/cascadia-tools/modules/fisheries-stock/example/config_surplus_production.yaml
plugins/cascadia-tools/modules/fisheries-stock/example/longline_catch_cpue.csv
plugins/cascadia-tools/modules/fisheries-stock/example/multiyear_ages.csv
plugins/cascadia-tools/modules/fisheries-stock/example/recovery.yaml
plugins/cascadia-tools/modules/fisheries-stock/example/recovery_multiyear.yaml
plugins/cascadia-tools/modules/fisheries-stock/example/sockeye_brood_table.csv
plugins/cascadia-tools/modules/fisheries-stock/example/walleye_fall_gillnet_ages.csv
plugins/cascadia-tools/modules/fisheries-stock/module.R
```

#### Module: glm (30 files)

```text
plugins/cascadia-tools/modules/glm/README.md
plugins/cascadia-tools/modules/glm/VALIDATION.md
plugins/cascadia-tools/modules/glm/engine.R
plugins/cascadia-tools/modules/glm/example/README_data.md
plugins/cascadia-tools/modules/glm/example/config.yaml
plugins/cascadia-tools/modules/glm/example/config_beta.yaml
plugins/cascadia-tools/modules/glm/example/config_binomial.yaml
plugins/cascadia-tools/modules/glm/example/nest_hatching.csv
plugins/cascadia-tools/modules/glm/example/recovery.yaml
plugins/cascadia-tools/modules/glm/example/seagrass_cover.csv
plugins/cascadia-tools/modules/glm/example/wood_thrush_counts.csv
plugins/cascadia-tools/modules/glm/figures.R
plugins/cascadia-tools/modules/glm/module.R
plugins/cascadia-tools/modules/glm/output.R
plugins/cascadia-tools/modules/glm/simulate.R
plugins/cascadia-tools/modules/glm/validation/beta_glmm.yaml
plugins/cascadia-tools/modules/glm/validation/binomial_glmm.yaml
plugins/cascadia-tools/modules/glm/validation/binomial_trials_glm.yaml
plugins/cascadia-tools/modules/glm/validation/gamma_glmm.yaml
plugins/cascadia-tools/modules/glm/validation/gaussian_lmm.yaml
plugins/cascadia-tools/modules/glm/validation/hard_binomial_small.yaml
plugins/cascadia-tools/modules/glm/validation/hard_nb_small.yaml
plugins/cascadia-tools/modules/glm/validation/hard_zinb_small.yaml
plugins/cascadia-tools/modules/glm/validation/interaction_glmm.yaml
plugins/cascadia-tools/modules/glm/validation/misspec_norandom.yaml
plugins/cascadia-tools/modules/glm/validation/misspec_poisson.yaml
plugins/cascadia-tools/modules/glm/validation/null_effects.yaml
plugins/cascadia-tools/modules/glm/validation/poisson_glm.yaml
plugins/cascadia-tools/modules/glm/validation/zinb_glmm.yaml
plugins/cascadia-tools/modules/glm/validation/zip_glmm.yaml
```

#### Module: ipm (17 files)

```text
plugins/cascadia-tools/modules/ipm/R/derived.R
plugins/cascadia-tools/modules/ipm/R/fit.R
plugins/cascadia-tools/modules/ipm/R/io.R
plugins/cascadia-tools/modules/ipm/R/model.R
plugins/cascadia-tools/modules/ipm/R/report.R
plugins/cascadia-tools/modules/ipm/R/simulate.R
plugins/cascadia-tools/modules/ipm/README.md
plugins/cascadia-tools/modules/ipm/VALIDATION.md
plugins/cascadia-tools/modules/ipm/example/README_data.md
plugins/cascadia-tools/modules/ipm/example/TRUTH.txt
plugins/cascadia-tools/modules/ipm/example/config.yaml
plugins/cascadia-tools/modules/ipm/example/recovery.yaml
plugins/cascadia-tools/modules/ipm/example/sahel_rainfall.csv
plugins/cascadia-tools/modules/ipm/example/shrike_broods.csv
plugins/cascadia-tools/modules/ipm/example/shrike_captures.csv
plugins/cascadia-tools/modules/ipm/example/shrike_counts.csv
plugins/cascadia-tools/modules/ipm/module.R
```

#### Module: jolly-seber (16 files)

```text
plugins/cascadia-tools/modules/jolly-seber/R/io.R
plugins/cascadia-tools/modules/jolly-seber/R/marked_engine.R
plugins/cascadia-tools/modules/jolly-seber/R/nimble_engines.R
plugins/cascadia-tools/modules/jolly-seber/R/post.R
plugins/cascadia-tools/modules/jolly-seber/R/prepare.R
plugins/cascadia-tools/modules/jolly-seber/R/report.R
plugins/cascadia-tools/modules/jolly-seber/R/simulate.R
plugins/cascadia-tools/modules/jolly-seber/README.md
plugins/cascadia-tools/modules/jolly-seber/VALIDATION.md
plugins/cascadia-tools/modules/jolly-seber/example/README_data.md
plugins/cascadia-tools/modules/jolly-seber/example/TRUTH.txt
plugins/cascadia-tools/modules/jolly-seber/example/config.yaml
plugins/cascadia-tools/modules/jolly-seber/example/recovery.yaml
plugins/cascadia-tools/modules/jolly-seber/example/turtle_captures.csv
plugins/cascadia-tools/modules/jolly-seber/example/turtle_seasons.csv
plugins/cascadia-tools/modules/jolly-seber/module.R
```

#### Module: jsdm (14 files)

```text
plugins/cascadia-tools/modules/jsdm/R/fit.R
plugins/cascadia-tools/modules/jsdm/R/io.R
plugins/cascadia-tools/modules/jsdm/R/report.R
plugins/cascadia-tools/modules/jsdm/R/sim.R
plugins/cascadia-tools/modules/jsdm/README.md
plugins/cascadia-tools/modules/jsdm/VALIDATION.md
plugins/cascadia-tools/modules/jsdm/example/README_data.md
plugins/cascadia-tools/modules/jsdm/example/bird_detections.csv
plugins/cascadia-tools/modules/jsdm/example/bird_traits.csv
plugins/cascadia-tools/modules/jsdm/example/config.yaml
plugins/cascadia-tools/modules/jsdm/example/recovery.yaml
plugins/cascadia-tools/modules/jsdm/example/stations.csv
plugins/cascadia-tools/modules/jsdm/example/truth.csv
plugins/cascadia-tools/modules/jsdm/module.R
```

#### Module: movement-hmm (14 files)

```text
plugins/cascadia-tools/modules/movement-hmm/README.md
plugins/cascadia-tools/modules/movement-hmm/VALIDATION.md
plugins/cascadia-tools/modules/movement-hmm/example/README_data.md
plugins/cascadia-tools/modules/movement-hmm/example/config.yaml
plugins/cascadia-tools/modules/movement-hmm/example/elk_gps.csv
plugins/cascadia-tools/modules/movement-hmm/example/recovery.yaml
plugins/cascadia-tools/modules/movement-hmm/hmm_engine.R
plugins/cascadia-tools/modules/movement-hmm/module.R
plugins/cascadia-tools/modules/movement-hmm/output.R
plugins/cascadia-tools/modules/movement-hmm/validation/hard_short.yaml
plugins/cascadia-tools/modules/movement-hmm/validation/hard_weak.yaml
plugins/cascadia-tools/modules/movement-hmm/validation/negctrl_2on3.yaml
plugins/cascadia-tools/modules/movement-hmm/validation/null_forest.yaml
plugins/cascadia-tools/modules/movement-hmm/validation/three_state.yaml
```

#### Module: movement-ssf (20 files)

```text
plugins/cascadia-tools/modules/movement-ssf/README.md
plugins/cascadia-tools/modules/movement-ssf/VALIDATION.md
plugins/cascadia-tools/modules/movement-ssf/engine.R
plugins/cascadia-tools/modules/movement-ssf/example/README_data.md
plugins/cascadia-tools/modules/movement-ssf/example/config.yaml
plugins/cascadia-tools/modules/movement-ssf/example/elevation.tif
plugins/cascadia-tools/modules/movement-ssf/example/elk_gps_2024.csv
plugins/cascadia-tools/modules/movement-ssf/example/forest_cover.tif
plugins/cascadia-tools/modules/movement-ssf/example/recovery.yaml
plugins/cascadia-tools/modules/movement-ssf/module.R
plugins/cascadia-tools/modules/movement-ssf/output.R
plugins/cascadia-tools/modules/movement-ssf/simulate.R
plugins/cascadia-tools/modules/movement-ssf/validation/hard_few.yaml
plugins/cascadia-tools/modules/movement-ssf/validation/negctrl_no_random_slopes.yaml
plugins/cascadia-tools/modules/movement-ssf/validation/negctrl_one_control.yaml
plugins/cascadia-tools/modules/movement-ssf/validation/negctrl_rsf.yaml
plugins/cascadia-tools/modules/movement-ssf/validation/no_attraction.yaml
plugins/cascadia-tools/modules/movement-ssf/validation/null_elevation.yaml
plugins/cascadia-tools/modules/movement-ssf/validation/plugin_centre.yaml
plugins/cascadia-tools/modules/movement-ssf/validation/power_base.yaml
```

#### Module: multistate (22 files)

```text
plugins/cascadia-tools/modules/multistate/R/derive.R
plugins/cascadia-tools/modules/multistate/R/engine_nimble.R
plugins/cascadia-tools/modules/multistate/R/gof.R
plugins/cascadia-tools/modules/multistate/R/io.R
plugins/cascadia-tools/modules/multistate/R/loglik_r.R
plugins/cascadia-tools/modules/multistate/R/output.R
plugins/cascadia-tools/modules/multistate/R/prep.R
plugins/cascadia-tools/modules/multistate/R/simulate.R
plugins/cascadia-tools/modules/multistate/README.md
plugins/cascadia-tools/modules/multistate/VALIDATION.md
plugins/cascadia-tools/modules/multistate/example/README_data.md
plugins/cascadia-tools/modules/multistate/example/config.yaml
plugins/cascadia-tools/modules/multistate/example/frog_captures.csv
plugins/cascadia-tools/modules/multistate/example/frog_individuals.csv
plugins/cascadia-tools/modules/multistate/example/recovery.yaml
plugins/cascadia-tools/modules/multistate/example/survey_years.csv
plugins/cascadia-tools/modules/multistate/module.R
plugins/cascadia-tools/modules/multistate/validation/as_default.yaml
plugins/cascadia-tools/modules/multistate/validation/hard_uncertain.yaml
plugins/cascadia-tools/modules/multistate/validation/negctrl_assign.yaml
plugins/cascadia-tools/modules/multistate/validation/null_effects.yaml
plugins/cascadia-tools/modules/multistate/validation/three_state.yaml
```

#### Module: nmixture (19 files)

```text
plugins/cascadia-tools/modules/nmixture/R/engines.R
plugins/cascadia-tools/modules/nmixture/R/fit.R
plugins/cascadia-tools/modules/nmixture/R/io.R
plugins/cascadia-tools/modules/nmixture/R/lik.R
plugins/cascadia-tools/modules/nmixture/R/prep.R
plugins/cascadia-tools/modules/nmixture/R/report.R
plugins/cascadia-tools/modules/nmixture/R/sim.R
plugins/cascadia-tools/modules/nmixture/README.md
plugins/cascadia-tools/modules/nmixture/VALIDATION.md
plugins/cascadia-tools/modules/nmixture/example/README_data.md
plugins/cascadia-tools/modules/nmixture/example/config.yaml
plugins/cascadia-tools/modules/nmixture/example/config_dynamic.yaml
plugins/cascadia-tools/modules/nmixture/example/config_nimble.yaml
plugins/cascadia-tools/modules/nmixture/example/point_counts.csv
plugins/cascadia-tools/modules/nmixture/example/points.csv
plugins/cascadia-tools/modules/nmixture/example/reaches.csv
plugins/cascadia-tools/modules/nmixture/example/recovery.yaml
plugins/cascadia-tools/modules/nmixture/example/stream_counts.csv
plugins/cascadia-tools/modules/nmixture/module.R
```

#### Module: occu-rota (16 files)

```text
plugins/cascadia-tools/modules/occu-rota/R/design.R
plugins/cascadia-tools/modules/occu-rota/R/engines.R
plugins/cascadia-tools/modules/occu-rota/R/figures.R
plugins/cascadia-tools/modules/occu-rota/R/gof.R
plugins/cascadia-tools/modules/occu-rota/R/io.R
plugins/cascadia-tools/modules/occu-rota/R/report.R
plugins/cascadia-tools/modules/occu-rota/README.md
plugins/cascadia-tools/modules/occu-rota/VALIDATION.md
plugins/cascadia-tools/modules/occu-rota/example/README_data.md
plugins/cascadia-tools/modules/occu-rota/example/camera_detections.csv
plugins/cascadia-tools/modules/occu-rota/example/camera_sites.csv
plugins/cascadia-tools/modules/occu-rota/example/config.yaml
plugins/cascadia-tools/modules/occu-rota/example/config_3species.yaml
plugins/cascadia-tools/modules/occu-rota/example/config_nimble.yaml
plugins/cascadia-tools/modules/occu-rota/example/recovery.yaml
plugins/cascadia-tools/modules/occu-rota/module.R
```

#### Module: occu-single (20 files)

```text
plugins/cascadia-tools/modules/occu-single/R/design.R
plugins/cascadia-tools/modules/occu-single/R/engines.R
plugins/cascadia-tools/modules/occu-single/R/figures.R
plugins/cascadia-tools/modules/occu-single/R/gof.R
plugins/cascadia-tools/modules/occu-single/R/io.R
plugins/cascadia-tools/modules/occu-single/R/report.R
plugins/cascadia-tools/modules/occu-single/README.md
plugins/cascadia-tools/modules/occu-single/VALIDATION.md
plugins/cascadia-tools/modules/occu-single/example/README_data.md
plugins/cascadia-tools/modules/occu-single/example/config.yaml
plugins/cascadia-tools/modules/occu-single/example/config_dynamic.yaml
plugins/cascadia-tools/modules/occu-single/example/config_dynamic_nimble.yaml
plugins/cascadia-tools/modules/occu-single/example/config_nimble.yaml
plugins/cascadia-tools/modules/occu-single/example/detections.csv
plugins/cascadia-tools/modules/occu-single/example/dynamic_detections.csv
plugins/cascadia-tools/modules/occu-single/example/dynamic_pond_years.csv
plugins/cascadia-tools/modules/occu-single/example/dynamic_ponds.csv
plugins/cascadia-tools/modules/occu-single/example/recovery.yaml
plugins/cascadia-tools/modules/occu-single/example/sites.csv
plugins/cascadia-tools/modules/occu-single/module.R
```

#### Module: occu-spatial (18 files)

```text
plugins/cascadia-tools/modules/occu-spatial/R/fit.R
plugins/cascadia-tools/modules/occu-spatial/R/io.R
plugins/cascadia-tools/modules/occu-spatial/R/report.R
plugins/cascadia-tools/modules/occu-spatial/R/sim.R
plugins/cascadia-tools/modules/occu-spatial/README.md
plugins/cascadia-tools/modules/occu-spatial/VALIDATION.md
plugins/cascadia-tools/modules/occu-spatial/example/README_data.md
plugins/cascadia-tools/modules/occu-spatial/example/camera_stations.csv
plugins/cascadia-tools/modules/occu-spatial/example/config.yaml
plugins/cascadia-tools/modules/occu-spatial/example/config_integrated.yaml
plugins/cascadia-tools/modules/occu-spatial/example/config_multispecies.yaml
plugins/cascadia-tools/modules/occu-spatial/example/fisher_detections.csv
plugins/cascadia-tools/modules/occu-spatial/example/mesocarnivore_detections.csv
plugins/cascadia-tools/modules/occu-spatial/example/prediction_grid_1km.csv
plugins/cascadia-tools/modules/occu-spatial/example/recovery.yaml
plugins/cascadia-tools/modules/occu-spatial/example/warbler_detections.csv
plugins/cascadia-tools/modules/occu-spatial/example/warbler_points.csv
plugins/cascadia-tools/modules/occu-spatial/module.R
```

#### Module: occu-waddle (14 files)

```text
plugins/cascadia-tools/modules/occu-waddle/R/design.R
plugins/cascadia-tools/modules/occu-waddle/R/engines.R
plugins/cascadia-tools/modules/occu-waddle/R/gof.R
plugins/cascadia-tools/modules/occu-waddle/R/io.R
plugins/cascadia-tools/modules/occu-waddle/R/report.R
plugins/cascadia-tools/modules/occu-waddle/R/simulate.R
plugins/cascadia-tools/modules/occu-waddle/README.md
plugins/cascadia-tools/modules/occu-waddle/VALIDATION.md
plugins/cascadia-tools/modules/occu-waddle/example/README_data.md
plugins/cascadia-tools/modules/occu-waddle/example/config.yaml
plugins/cascadia-tools/modules/occu-waddle/example/pipe_surveys.csv
plugins/cascadia-tools/modules/occu-waddle/example/recovery.yaml
plugins/cascadia-tools/modules/occu-waddle/example/sites.csv
plugins/cascadia-tools/modules/occu-waddle/module.R
```

#### Module: popgen-ne (20 files)

```text
plugins/cascadia-tools/modules/popgen-ne/README.md
plugins/cascadia-tools/modules/popgen-ne/VALIDATION.md
plugins/cascadia-tools/modules/popgen-ne/design_grid.csv
plugins/cascadia-tools/modules/popgen-ne/engine.R
plugins/cascadia-tools/modules/popgen-ne/example/README_data.md
plugins/cascadia-tools/modules/popgen-ne/example/bulltrout_microsats.csv
plugins/cascadia-tools/modules/popgen-ne/example/config.yaml
plugins/cascadia-tools/modules/popgen-ne/example/config_snp.yaml
plugins/cascadia-tools/modules/popgen-ne/example/known_relationships.csv
plugins/cascadia-tools/modules/popgen-ne/example/recovery.yaml
plugins/cascadia-tools/modules/popgen-ne/example/snp_panel_dosage.csv
plugins/cascadia-tools/modules/popgen-ne/io.R
plugins/cascadia-tools/modules/popgen-ne/module.R
plugins/cascadia-tools/modules/popgen-ne/output.R
plugins/cascadia-tools/modules/popgen-ne/simulate.R
plugins/cascadia-tools/modules/popgen-ne/validation/hard_msat.yaml
plugins/cascadia-tools/modules/popgen-ne/validation/large_ne.yaml
plugins/cascadia-tools/modules/popgen-ne/validation/misspec_plan2.yaml
plugins/cascadia-tools/modules/popgen-ne/validation/misspec_sibs.yaml
plugins/cascadia-tools/modules/popgen-ne/validation/null_infinite.yaml
```

#### Module: popgen-structure (23 files)

```text
plugins/cascadia-tools/modules/popgen-structure/README.md
plugins/cascadia-tools/modules/popgen-structure/VALIDATION.md
plugins/cascadia-tools/modules/popgen-structure/engine.R
plugins/cascadia-tools/modules/popgen-structure/example/README_data.md
plugins/cascadia-tools/modules/popgen-structure/example/config.yaml
plugins/cascadia-tools/modules/popgen-structure/example/recovery.yaml
plugins/cascadia-tools/modules/popgen-structure/example/tailed_frog_microsats.csv
plugins/cascadia-tools/modules/popgen-structure/example/tailed_frog_sites.csv
plugins/cascadia-tools/modules/popgen-structure/example/true_values.csv
plugins/cascadia-tools/modules/popgen-structure/io.R
plugins/cascadia-tools/modules/popgen-structure/module.R
plugins/cascadia-tools/modules/popgen-structure/output.R
plugins/cascadia-tools/modules/popgen-structure/simulate.R
plugins/cascadia-tools/modules/popgen-structure/validation/default_expected_truth.yaml
plugins/cascadia-tools/modules/popgen-structure/validation/hard_small.yaml
plugins/cascadia-tools/modules/popgen-structure/validation/island_ibd_null.yaml
plugins/cascadia-tools/modules/popgen-structure/validation/linear_1d.yaml
plugins/cascadia-tools/modules/popgen-structure/validation/misspec_naive.yaml
plugins/cascadia-tools/modules/popgen-structure/validation/panmixia.yaml
plugins/cascadia-tools/modules/popgen-structure/validation/selfing.yaml
plugins/cascadia-tools/modules/popgen-structure/validation/snp_island.yaml
plugins/cascadia-tools/modules/popgen-structure/validation/snp_small.yaml
plugins/cascadia-tools/modules/popgen-structure/validation/weak_power.yaml
```

#### Module: pva (28 files)

```text
plugins/cascadia-tools/modules/pva/R/count.R
plugins/cascadia-tools/modules/pva/R/matrix.R
plugins/cascadia-tools/modules/pva/R/report.R
plugins/cascadia-tools/modules/pva/README.md
plugins/cascadia-tools/modules/pva/VALIDATION.md
plugins/cascadia-tools/modules/pva/example/README_data.md
plugins/cascadia-tools/modules/pva/example/annual_monitoring.csv
plugins/cascadia-tools/modules/pva/example/config.yaml
plugins/cascadia-tools/modules/pva/example/config_matrix.yaml
plugins/cascadia-tools/modules/pva/example/config_matrix_monitoring.yaml
plugins/cascadia-tools/modules/pva/example/config_state_space.yaml
plugins/cascadia-tools/modules/pva/example/recovery.yaml
plugins/cascadia-tools/modules/pva/example/shorebird_breeding_pairs.csv
plugins/cascadia-tools/modules/pva/example/vital_rates.csv
plugins/cascadia-tools/modules/pva/example/yellowstone_grizzly_females.csv
plugins/cascadia-tools/modules/pva/module.R
plugins/cascadia-tools/modules/pva/validation/count_default.yaml
plugins/cascadia-tools/modules/pva/validation/count_neg.yaml
plugins/cascadia-tools/modules/pva/validation/count_null.yaml
plugins/cascadia-tools/modules/pva/validation/count_short.yaml
plugins/cascadia-tools/modules/pva/validation/count_ss.yaml
plugins/cascadia-tools/modules/pva/validation/count_ss_null.yaml
plugins/cascadia-tools/modules/pva/validation/count_ss_short.yaml
plugins/cascadia-tools/modules/pva/validation/matrix_corr.yaml
plugins/cascadia-tools/modules/pva/validation/matrix_default.yaml
plugins/cascadia-tools/modules/pva/validation/matrix_neg.yaml
plugins/cascadia-tools/modules/pva/validation/matrix_null.yaml
plugins/cascadia-tools/modules/pva/validation/matrix_short.yaml
```

#### Module: scr-open (17 files)

```text
plugins/cascadia-tools/modules/scr-open/R/io.R
plugins/cascadia-tools/modules/scr-open/R/nimble_engines.R
plugins/cascadia-tools/modules/scr-open/R/other_engines.R
plugins/cascadia-tools/modules/scr-open/R/post.R
plugins/cascadia-tools/modules/scr-open/R/ppc.R
plugins/cascadia-tools/modules/scr-open/R/prepare.R
plugins/cascadia-tools/modules/scr-open/R/report.R
plugins/cascadia-tools/modules/scr-open/R/simulate.R
plugins/cascadia-tools/modules/scr-open/README.md
plugins/cascadia-tools/modules/scr-open/example/README_data.md
plugins/cascadia-tools/modules/scr-open/example/config.yaml
plugins/cascadia-tools/modules/scr-open/example/habitat_grid.csv
plugins/cascadia-tools/modules/scr-open/example/hair_snares.csv
plugins/cascadia-tools/modules/scr-open/example/marten_genotypes.csv
plugins/cascadia-tools/modules/scr-open/example/recovery.yaml
plugins/cascadia-tools/modules/scr-open/module.R
plugins/cascadia-tools/modules/scr-open/python/scro_numpyro.py
```

#### Module: scr-search (17 files)

```text
plugins/cascadia-tools/modules/scr-search/R/io.R
plugins/cascadia-tools/modules/scr-search/R/nimble_engine.R
plugins/cascadia-tools/modules/scr-search/R/post.R
plugins/cascadia-tools/modules/scr-search/R/prepare.R
plugins/cascadia-tools/modules/scr-search/R/report.R
plugins/cascadia-tools/modules/scr-search/R/secr_engine.R
plugins/cascadia-tools/modules/scr-search/R/simulate.R
plugins/cascadia-tools/modules/scr-search/README.md
plugins/cascadia-tools/modules/scr-search/VALIDATION.md
plugins/cascadia-tools/modules/scr-search/example/README_data.md
plugins/cascadia-tools/modules/scr-search/example/config.yaml
plugins/cascadia-tools/modules/scr-search/example/fisher_scats.csv
plugins/cascadia-tools/modules/scr-search/example/habitat_grid.csv
plugins/cascadia-tools/modules/scr-search/example/recovery.yaml
plugins/cascadia-tools/modules/scr-search/example/search_tracks_gps.csv
plugins/cascadia-tools/modules/scr-search/example/track_field_sheet.csv
plugins/cascadia-tools/modules/scr-search/module.R
```

#### Module: scr-smr (25 files)

```text
plugins/cascadia-tools/modules/scr-smr/R/io.R
plugins/cascadia-tools/modules/scr-smr/R/nimble_engine.R
plugins/cascadia-tools/modules/scr-smr/R/post.R
plugins/cascadia-tools/modules/scr-smr/R/prepare.R
plugins/cascadia-tools/modules/scr-smr/R/report.R
plugins/cascadia-tools/modules/scr-smr/R/secr_engine.R
plugins/cascadia-tools/modules/scr-smr/R/simulate.R
plugins/cascadia-tools/modules/scr-smr/README.md
plugins/cascadia-tools/modules/scr-smr/VALIDATION.md
plugins/cascadia-tools/modules/scr-smr/example/README_data.md
plugins/cascadia-tools/modules/scr-smr/example/box_trap_captures.csv
plugins/cascadia-tools/modules/scr-smr/example/box_traps.csv
plugins/cascadia-tools/modules/scr-smr/example/cameras.csv
plugins/cascadia-tools/modules/scr-smr/example/config.yaml
plugins/cascadia-tools/modules/scr-smr/example/fisher_photos.csv
plugins/cascadia-tools/modules/scr-smr/example/gps_fixes.csv
plugins/cascadia-tools/modules/scr-smr/example/habitat_grid.csv
plugins/cascadia-tools/modules/scr-smr/example/recovery.yaml
plugins/cascadia-tools/modules/scr-smr/module.R
plugins/cascadia-tools/modules/scr-smr/validation/gsmr.yaml
plugins/cascadia-tools/modules/scr-smr/validation/hard_few_marked.yaml
plugins/cascadia-tools/modules/scr-smr/validation/hard_few_marked_telemetry.yaml
plugins/cascadia-tools/modules/scr-smr/validation/neg_ignore_marking.yaml
plugins/cascadia-tools/modules/scr-smr/validation/null.yaml
plugins/cascadia-tools/modules/scr-smr/validation/power_n_marked.yaml
```

#### Module: scr (24 files)

```text
plugins/cascadia-tools/modules/scr/R/io.R
plugins/cascadia-tools/modules/scr/R/nimble_engines.R
plugins/cascadia-tools/modules/scr/R/other_engines.R
plugins/cascadia-tools/modules/scr/R/post.R
plugins/cascadia-tools/modules/scr/R/prepare.R
plugins/cascadia-tools/modules/scr/R/report.R
plugins/cascadia-tools/modules/scr/R/simulate.R
plugins/cascadia-tools/modules/scr/README.md
plugins/cascadia-tools/modules/scr/VALIDATION.md
plugins/cascadia-tools/modules/scr/example/README_data.md
plugins/cascadia-tools/modules/scr/example/bobcat_detections.csv
plugins/cascadia-tools/modules/scr/example/cameras.csv
plugins/cascadia-tools/modules/scr/example/config.yaml
plugins/cascadia-tools/modules/scr/example/habitat_grid.csv
plugins/cascadia-tools/modules/scr/example/ngs/config.yaml
plugins/cascadia-tools/modules/scr/example/ngs/habitat.tif
plugins/cascadia-tools/modules/scr/example/ngs/hair_samples.csv
plugins/cascadia-tools/modules/scr/example/ngs/hair_snares.csv
plugins/cascadia-tools/modules/scr/example/ngs/snare_effort.csv
plugins/cascadia-tools/modules/scr/example/ngs/study_area.gpkg
plugins/cascadia-tools/modules/scr/example/recovery.yaml
plugins/cascadia-tools/modules/scr/example/recovery_matched_n.yaml
plugins/cascadia-tools/modules/scr/module.R
plugins/cascadia-tools/modules/scr/python/scr_numpyro.py
```

#### Module: sdm-presence-only (16 files)

```text
plugins/cascadia-tools/modules/sdm-presence-only/R/engines.R
plugins/cascadia-tools/modules/sdm-presence-only/R/fit.R
plugins/cascadia-tools/modules/sdm-presence-only/R/post.R
plugins/cascadia-tools/modules/sdm-presence-only/R/prepare.R
plugins/cascadia-tools/modules/sdm-presence-only/R/simulate.R
plugins/cascadia-tools/modules/sdm-presence-only/README.md
plugins/cascadia-tools/modules/sdm-presence-only/VALIDATION.md
plugins/cascadia-tools/modules/sdm-presence-only/example/README_data.md
plugins/cascadia-tools/modules/sdm-presence-only/example/TRUTH.txt
plugins/cascadia-tools/modules/sdm-presence-only/example/camera_survey.csv
plugins/cascadia-tools/modules/sdm-presence-only/example/config.yaml
plugins/cascadia-tools/modules/sdm-presence-only/example/config_integrated.yaml
plugins/cascadia-tools/modules/sdm-presence-only/example/covariate_grid.csv
plugins/cascadia-tools/modules/sdm-presence-only/example/presence_records.csv
plugins/cascadia-tools/modules/sdm-presence-only/example/recovery.yaml
plugins/cascadia-tools/modules/sdm-presence-only/module.R
```

#### Module: sem (25 files)

```text
plugins/cascadia-tools/modules/sem/README.md
plugins/cascadia-tools/modules/sem/VALIDATION.md
plugins/cascadia-tools/modules/sem/engine_lavaan.R
plugins/cascadia-tools/modules/sem/engine_piecewise.R
plugins/cascadia-tools/modules/sem/example/README_data.md
plugins/cascadia-tools/modules/sem/example/burned_forest_plots.csv
plugins/cascadia-tools/modules/sem/example/config.yaml
plugins/cascadia-tools/modules/sem/example/config_lavaan.yaml
plugins/cascadia-tools/modules/sem/example/grassland_plots.csv
plugins/cascadia-tools/modules/sem/example/recovery.yaml
plugins/cascadia-tools/modules/sem/graph.R
plugins/cascadia-tools/modules/sem/module.R
plugins/cascadia-tools/modules/sem/output.R
plugins/cascadia-tools/modules/sem/simulate.R
plugins/cascadia-tools/modules/sem/validation/binary_mediator.yaml
plugins/cascadia-tools/modules/sem/validation/bootstrap_ci.yaml
plugins/cascadia-tools/modules/sem/validation/count_mediator.yaml
plugins/cascadia-tools/modules/sem/validation/delta_ci.yaml
plugins/cascadia-tools/modules/sem/validation/glmm_poisson.yaml
plugins/cascadia-tools/modules/sem/validation/hard_small_binary.yaml
plugins/cascadia-tools/modules/sem/validation/lavaan_latent.yaml
plugins/cascadia-tools/modules/sem/validation/lavaan_latent_small.yaml
plugins/cascadia-tools/modules/sem/validation/misspec_omitted_path.yaml
plugins/cascadia-tools/modules/sem/validation/nbinom_counts.yaml
plugins/cascadia-tools/modules/sem/validation/null_effects.yaml
```

#### Module: timeseries (20 files)

```text
plugins/cascadia-tools/modules/timeseries/R/bayes.R
plugins/cascadia-tools/modules/timeseries/R/common.R
plugins/cascadia-tools/modules/timeseries/R/figures.R
plugins/cascadia-tools/modules/timeseries/R/kalman.R
plugins/cascadia-tools/modules/timeseries/R/loglinear.R
plugins/cascadia-tools/modules/timeseries/R/marss.R
plugins/cascadia-tools/modules/timeseries/R/reml.R
plugins/cascadia-tools/modules/timeseries/R/uni.R
plugins/cascadia-tools/modules/timeseries/README.md
plugins/cascadia-tools/modules/timeseries/VALIDATION.md
plugins/cascadia-tools/modules/timeseries/example/README_data.md
plugins/cascadia-tools/modules/timeseries/example/config.yaml
plugins/cascadia-tools/modules/timeseries/example/config_exponential.yaml
plugins/cascadia-tools/modules/timeseries/example/config_gompertz.yaml
plugins/cascadia-tools/modules/timeseries/example/config_loglinear.yaml
plugins/cascadia-tools/modules/timeseries/example/config_marss.yaml
plugins/cascadia-tools/modules/timeseries/example/herd_counts.csv
plugins/cascadia-tools/modules/timeseries/example/herds_multi.csv
plugins/cascadia-tools/modules/timeseries/example/recovery.yaml
plugins/cascadia-tools/modules/timeseries/module.R
```

#### scripts/ (4 files)

```text
plugins/cascadia-tools/scripts/R
plugins/cascadia-tools/scripts/Rscript
plugins/cascadia-tools/scripts/_find_r.sh
plugins/cascadia-tools/scripts/ejob
```

#### skills/ (4 files)

```text
plugins/cascadia-tools/skills/eco-convergence/SKILL.md
plugins/cascadia-tools/skills/eco-data-intake/SKILL.md
plugins/cascadia-tools/skills/eco-interpretation/SKILL.md
plugins/cascadia-tools/skills/eco-model-checking/SKILL.md
```

#### tools/ (4 files)

```text
plugins/cascadia-tools/tools/build_si.py
plugins/cascadia-tools/tools/install_packages.R
plugins/cascadia-tools/tools/make_catalog.py
plugins/cascadia-tools/tools/requirements-numpyro.txt
```

</details>

### Adapted carry-over (46 files)

<details>
<summary>Expand the complete file list</summary>

#### Repository root (2 files)

```text
.gitignore
README.md
```

#### Plugin root (1 files)

```text
plugins/cascadia-tools/README.md
```

#### docs/ (1 files)

```text
plugins/cascadia-tools/docs/MODULE_SPEC.md
```

#### Module: abund-interactions (1 files)

```text
plugins/cascadia-tools/modules/abund-interactions/example/WALKTHROUGH.md
```

#### Module: causal (1 files)

```text
plugins/cascadia-tools/modules/causal/example/WALKTHROUGH.md
```

#### Module: cjs (1 files)

```text
plugins/cascadia-tools/modules/cjs/example/WALKTHROUGH.md
```

#### Module: community (1 files)

```text
plugins/cascadia-tools/modules/community/example/WALKTHROUGH.md
```

#### Module: distance (1 files)

```text
plugins/cascadia-tools/modules/distance/example/WALKTHROUGH.md
```

#### Module: fisheries-growth (1 files)

```text
plugins/cascadia-tools/modules/fisheries-growth/example/WALKTHROUGH.md
```

#### Module: fisheries-stock (1 files)

```text
plugins/cascadia-tools/modules/fisheries-stock/example/WALKTHROUGH.md
```

#### Module: glm (1 files)

```text
plugins/cascadia-tools/modules/glm/example/WALKTHROUGH.md
```

#### Module: ipm (1 files)

```text
plugins/cascadia-tools/modules/ipm/example/WALKTHROUGH.md
```

#### Module: jolly-seber (1 files)

```text
plugins/cascadia-tools/modules/jolly-seber/example/WALKTHROUGH.md
```

#### Module: jsdm (3 files)

```text
plugins/cascadia-tools/modules/jsdm/example/WALKTHROUGH.md
plugins/cascadia-tools/modules/jsdm/example/make_example.R
plugins/cascadia-tools/modules/jsdm/validation/crosscheck_glmmtmb.R
```

#### Module: movement-hmm (1 files)

```text
plugins/cascadia-tools/modules/movement-hmm/example/WALKTHROUGH.md
```

#### Module: movement-ssf (1 files)

```text
plugins/cascadia-tools/modules/movement-ssf/example/WALKTHROUGH.md
```

#### Module: multistate (1 files)

```text
plugins/cascadia-tools/modules/multistate/example/WALKTHROUGH.md
```

#### Module: nmixture (1 files)

```text
plugins/cascadia-tools/modules/nmixture/example/WALKTHROUGH.md
```

#### Module: occu-rota (1 files)

```text
plugins/cascadia-tools/modules/occu-rota/example/WALKTHROUGH.md
```

#### Module: occu-single (1 files)

```text
plugins/cascadia-tools/modules/occu-single/example/WALKTHROUGH.md
```

#### Module: occu-spatial (1 files)

```text
plugins/cascadia-tools/modules/occu-spatial/example/WALKTHROUGH.md
```

#### Module: occu-waddle (1 files)

```text
plugins/cascadia-tools/modules/occu-waddle/example/WALKTHROUGH.md
```

#### Module: popgen-ne (1 files)

```text
plugins/cascadia-tools/modules/popgen-ne/example/WALKTHROUGH.md
```

#### Module: popgen-structure (1 files)

```text
plugins/cascadia-tools/modules/popgen-structure/example/WALKTHROUGH.md
```

#### Module: pva (1 files)

```text
plugins/cascadia-tools/modules/pva/example/WALKTHROUGH.md
```

#### Module: scr-open (2 files)

```text
plugins/cascadia-tools/modules/scr-open/VALIDATION.md
plugins/cascadia-tools/modules/scr-open/example/WALKTHROUGH.md
```

#### Module: scr-search (1 files)

```text
plugins/cascadia-tools/modules/scr-search/example/WALKTHROUGH.md
```

#### Module: scr-smr (1 files)

```text
plugins/cascadia-tools/modules/scr-smr/example/WALKTHROUGH.md
```

#### Module: scr (1 files)

```text
plugins/cascadia-tools/modules/scr/example/WALKTHROUGH.md
```

#### Module: sdm-presence-only (1 files)

```text
plugins/cascadia-tools/modules/sdm-presence-only/example/WALKTHROUGH.md
```

#### Module: sem (1 files)

```text
plugins/cascadia-tools/modules/sem/example/WALKTHROUGH.md
```

#### Module: timeseries (1 files)

```text
plugins/cascadia-tools/modules/timeseries/example/WALKTHROUGH.md
```

#### skills/ (10 files)

```text
plugins/cascadia-tools/skills/cascadia-private/SKILL.md
plugins/cascadia-tools/skills/cascadia-setup/SKILL.md
plugins/cascadia-tools/skills/cascadia-start/SKILL.md
plugins/cascadia-tools/skills/eco-acceptance-gate/SKILL.md
plugins/cascadia-tools/skills/eco-analysis-plan/SKILL.md
plugins/cascadia-tools/skills/eco-analyze/SKILL.md
plugins/cascadia-tools/skills/eco-figures/SKILL.md
plugins/cascadia-tools/skills/eco-new-module/SKILL.md
plugins/cascadia-tools/skills/eco-planted-truth/SKILL.md
plugins/cascadia-tools/skills/eco-power/SKILL.md
```

</details>

<!-- END CLAUDE CARRYOVER FILE INVENTORY -->

## Validation performed

From `plugins/cascadia-tools/`:

```sh
npm run typecheck
npm test
npm run build
npm run test:opencode
npm pack --dry-run --json
```

Results at the end of the follow-up audit:

| Check | Result |
|---|---|
| TypeScript typecheck and build | Passed |
| Focused unit/regression tests | 5 passed; none skipped in the migration environment |
| Native OpenCode smoke test | Passed with OpenCode 2.2.0 |
| Required runtime/support package assets | All 658 present |
| Package contents | 663 files; no Claude integration, generated dependencies, build output, or development tests |
| Walkthrough warnings | Present in all 29 walkthroughs |
| YAML configs | All 206 parsed successfully |
| Module catalog | All 29 entries matched their modules' metadata and required assets |
| Local Markdown links | No broken links found during the audit |
| Patch whitespace checks | Passed |

The focused tests cover skill loading and metadata failures, installation paths
with spaces, private-path and search checks, symlinks, shell denial, invalid
settings, disabling private mode, custom external directories, project isolation,
and the two R support scripts' loader startup from outside the toolkit.

The native smoke test starts its own temporary server and project, verifies all
14 skills, checks read-permission and shell enforcement, verifies the toolkit
environment variable and policy changes, and cleans up without calling a model.
It can also target a separately installed package using
`CASCADIA_TEST_PLUGIN_ROOT`.

During the initial conversion, an npm tarball was installed separately and passed
the native smoke test, confirming that discovery and toolkit paths did not rely
on the working copy. After the follow-up audit, the updated source tests and
package-content checks were rerun successfully.

The one absent data-path reference found in the YAML audit is the time-series
example's optional generated power-curve CSV. Its config already documents that
the curve is drawn only when the file exists; it is not a missing bundled input.

Full scientific recovery/model-validation suites were not rerun as part of this
migration. Existing scientific validation records were retained, not recertified.

## Installation transition and known limits

1. Install the supported OpenCode, Node.js, R, and Bash prerequisites.
2. From the repository root, install the plugin dependencies:
   ```sh
   npm --prefix plugins/cascadia-tools ci
   ```
3. Merge a plugin-directory entry into the research project's or global OpenCode
   configuration:
   ```json
   {
     "$schema": "https://opencode.ai/config.json",
     "plugins": ["/absolute/path/CascadiaTools/plugins/cascadia-tools"]
   }
   ```
4. On Windows, also configure the actual Git Bash executable, for example
   `"shell": "C:/Program Files/Git/bin/bash.exe"`.
5. Restart OpenCode and start with `cascadia-start` or `cascadia-setup`.
6. For private projects, retain `.cascadia/private.json`, merge the native
   permission rules, and verify that protected reads are refused.

Use the plugin directory, not the individual entrypoint file. No marketplace,
separate skill copying, or external hook registration is required. Existing Claude
installations do not become OpenCode installations merely by retaining their old
marketplace/settings entries.

During dependency installation, npm reported 24 moderate advisory findings.
Dependency advisory remediation was not part of this migration, and those findings
were not resolved. Privacy limitations and historical/unbundled reproduction paths
described above also remain applicable.
