# Claude, OpenCode, and Hermes support plan

Status: implementation in progress; phase evidence is recorded below.
Documentation reviewed: 2026-11-12.

## 1. Objective and boundaries

Support Claude Code, OpenCode, and Nous Research's Hermes Agent from one
repository, using one scientific engine and one source of analysis protocols.
Preserve the existing Claude marketplace installation and standalone R CLI.

Here, "multi-tenants" means multiple agent hosts, not a hosted service with
security-isolated customers. Project state must remain separate, but these
integrations do not establish operating-system or infrastructure isolation.

Success means each supported host can discover CascadiaTools, complete setup,
select a module, follow its validation protocol, execute an analysis, and deliver
the resulting report without maintaining host-specific statistical code.

Non-goals for the first release:

- Rewriting the R engine, changing statistical methods, or relaxing acceptance gates.
- A mandatory MCP server, web service, database, or background daemon.
- Supporting every historical host version or every model/provider combination.
- Remote backends, messaging gateways, and scheduled analyses as launch requirements.
- Replacing R package management with Python tooling.

## 2. Current implementation

| Area | Existing implementation | Treatment |
| --- | --- | --- |
| Claude distribution | [Marketplace](../.claude-plugin/marketplace.json) and [plugin manifest](../plugins/cascadia-tools/.claude-plugin/plugin.json) | Preserve package identity and installation flow |
| Scientific engine | [R CLI](../plugins/cascadia-tools/core/run.R), [loader](../plugins/cascadia-tools/core/load.R), and 29 [modules](../plugins/cascadia-tools/modules/) | Share without host-specific forks |
| Agent workflows | 14 [skills](../plugins/cascadia-tools/skills/) | Keep one authoritative protocol source |
| Execution | [Rscript wrapper](../plugins/cascadia-tools/scripts/Rscript) and [local/SLURM runner](../plugins/cascadia-tools/scripts/ejob) | Reuse commands, logging, and exit status |
| Privacy | [Claude hook](../plugins/cascadia-tools/hooks/hooks.json), [guard](../plugins/cascadia-tools/scripts/private_guard.R), and [privacy skill](../plugins/cascadia-tools/skills/cascadia-private/SKILL.md) | Separate policy from host event/response formats |
| Python | Existing helper scripts and optional [NumPyro requirements](../plugins/cascadia-tools/tools/requirements-numpyro.txt); no tracked `pyproject.toml` or `uv.lock` found | Use `uv` for new Python tooling and documented Python environments |

Important existing couplings:

- Skills use `${CLAUDE_PLUGIN_ROOT}`; setup also declares Claude `allowed-tools`.
- Private mode writes `.claude/settings.json` and consumes Claude tool events.
- The R wrapper already understands `CASCADIATOOLS_ROOT`; keep that mechanism.
- Analysis outputs belong in the researcher's project, not the plugin installation.
- The current privacy guard is pattern-based, not a security boundary.

## 3. Architecture

### Shared source, thin host adapters

Retain `plugins/cascadia-tools/` as the shared toolkit and the working Claude
source package. Add adapter source and packaging tooling alongside it:

```text
CascadiaTools/
  .claude-plugin/marketplace.json       existing Claude marketplace
  plugins/cascadia-tools/              shared toolkit + existing Claude package
    .claude-plugin/plugin.json         authoritative toolkit version
    core/
    modules/
    scripts/
    skills/                           authoritative workflow source
    hooks/
    tools/
  integrations/                       proposed
    hermes/                           native manifest, registration, overlays
    opencode/                         JS/TS plugin package, config, overlays
  tools/multi_host.py                  proposed build/check entry point
  tests/multi_host/                    proposed focused compatibility tests
  pyproject.toml                      proposed uv-managed development project
  uv.lock                             proposed committed lockfile
  dist/multi-host/                     generated, ignored release bundles
  _docs/multi-tenants-support.md       this plan
```

These are proposed additions, not files that already exist. Reuse the repository's
existing ignore rule for `dist`; also ignore new virtual environments.

Responsibilities:

1. **Scientific layer:** existing R interfaces, modules, reports, and thresholds.
2. **Protocol layer:** module selection, intake, planning, recovery, convergence,
   checking, interpretation, and the final DONE/OPEN verdict.
3. **Host layer:** skill discovery, installation, path resolution, permissions,
   tool-event translation, and background-job interaction.
4. **Packaging layer:** assemble complete, version-matched host packages.

Do not introduce a general agent framework. Initially, adapters should invoke
the existing CLI through the host's normal execution tools. Add custom analysis
tools only if a demonstrated host limitation requires them.

### Skill reuse without breaking Claude

For the first release, keep the current Claude-compatible skill files as the
authoritative source. Do not move them or introduce unresolved neutral template
tokens into the directly installed Claude package.

The build step will render OpenCode and Hermes variants using explicit,
tested substitutions and small host-specific overlays:

- Resolve toolkit paths independently of the user's working directory.
- Translate skill references to each host's actual IDs; account for Hermes
  plugin-qualified names and OpenCode's path-derived IDs.
- Translate tool-specific setup and execution instructions.
- Replace Claude-only permission metadata with verified host equivalents.
- Supply host-specific setup and privacy sections while retaining shared
  scientific instructions.

Do not use unrestricted search-and-replace across the repository. Rendering must
fail on unrecognized host-specific constructs or unresolved path placeholders.
Changes to acceptance thresholds or scientific procedure require review and must
never be introduced by rendering or autonomous skill updates.

### Packaging and installation

- **Claude:** keep the existing marketplace source and commands working.
- **Hermes:** build a self-contained native plugin with `plugin.yaml`,
  `__init__.py`, registered skills, and a bundled `toolkit/` payload.
- **OpenCode:** build a self-contained local plugin package with its JS/TS entry
  point, rendered skills, and the same `toolkit/` payload. Use documented plugin
  configuration and skill-source discovery for the selected host release.

Use the existing plugin version as the single toolkit version. Generated package
metadata must carry that version and the source revision. Verify shared payload
hashes across bundles. Package from an explicit runtime-file allowlist; exclude
local environments, `node_modules`, results, user data, and build products.

Start with release archives and documented local-directory installation for the
new hosts. Hermes must be installed in its supported user/profile plugin location
and explicitly enabled; do not rely on project-local plugin discovery.
OpenCode local plugin configuration must reference the complete built directory.

A source-only adapter directory is not an installable release if its payload is
elsewhere in the repository. Prove installation from outside the checkout before
publishing Git-subdirectory, npm, or catalog installation instructions.

## 4. Runtime and privacy contracts

### Paths, execution, and state

- Resolve the toolkit from the installed package location and pass
  `CASCADIATOOLS_ROOT` explicitly to child processes where necessary.
- Resolve the project from the active session/event, not a server's global
  working directory. Do not mutate process-global environment variables or cwd
  per session in long-lived, concurrent hosts.
- Keep configs, data, logs, recovery results, and reports under that project.
- Keep user environments and durable state outside replaceable plugin payloads.
- Preserve command arguments, exit codes, stderr, and report paths. A failed
  process or missing report must not produce a success-shaped response.
- Reuse `ejob` for long jobs. Define host-specific launch, status, cancellation,
  and result-retrieval instructions without automatically retrying whole fits.
- Test paths containing spaces, interrupted jobs, and package updates.

### Shared privacy policy, separate host bindings

Refactor only the tightly coupled guard boundary: retain the R-based policy
implementation, but give it a host-neutral JSON request and decision format.
Keep the existing Claude wrapper as a compatible translator.

The internal request should carry the project root, operation category, target
paths/search scope, command and working directory where applicable, plus host/tool
identity. The response should distinguish allow, deny, and evaluation failure with
an explicit reason. Adapters validate events and translate decisions into their
host's documented blocking mechanism.

Bindings:

- **Claude:** retain `PreToolUse` behavior and merge existing permission settings.
- **Hermes:** register a documented `pre_tool_call` plugin hook and verify actual
  blocking, exception, and timeout semantics on the supported release.
- **OpenCode:** verify a supported pre-execution interception API and combine it
  with native permission rules. Do not assume Claude hook names or copy an
  unverified plugin example. Current OpenCode documentation distinguishes V1
  and V2 permission schemas; support only the version explicitly tested.

Private mode must cover relevant file reads/searches/mutations, shell execution,
and delegated execution paths, not only CascadiaTools commands. Tools outside the
verified coverage, including external tools and alternate execution routes, must
be disabled or cause private mode to be declared unsupported for that session.
Do not treat broad command-substring matches as a new security guarantee.

When private mode is active, malformed events, unavailable R/jsonlite, guard
failures, or evaluation timeouts must not silently allow the operation. Native
deny settings provide defense in depth where supported; merge them without
overwriting user policy or removing unrelated rules when private mode is disabled.

If a host cannot reliably enforce or verify these controls, do not label it
private-mode capable. Refuse the protected analysis workflow and explain the
limitation. A failed or unloaded plugin cannot be assumed to block host tools.

Before claiming private mode works, perform a synthetic protected-file refusal
probe and inspect the actual result. Preserve the existing explanation that
summaries/results still reach the model and pattern-based guards are not a
sandbox. Strict confidentiality still requires stronger isolation or using the
toolkit without AI. Never include sensitive records in probes or test logs.

## 5. Python dependency management: uv

Use `uv` for all new project-owned Python environments, dependencies, lockfiles,
build helpers, and tests. Do not use global pip, introduce Poetry/Pipenv, or install
into a host's Python environment.

### Development and packaging

- Add a root `pyproject.toml` and committed `uv.lock` when Python tooling is
  implemented; select a Python support range verified against the intended hosts.
- Prefer standard-library packaging helpers and `unittest` initially. Add a
  third-party dependency only when it is needed.
- Add dependencies with `uv add`; use `uv add --dev` for development-only needs.
- Use `uv sync --locked` and `uv run --locked` for reproducible developer/CI runs.
- Keep the OpenCode runtime in JS/TS and use its supported package tooling;
  `uv` manages Python, not JavaScript or R.

Proposed commands, once the corresponding files exist:

```bash
uv sync --locked
uv run --locked python tools/multi_host.py build --host all
uv run --locked python tools/multi_host.py check --host all
uv run --locked python -m unittest discover -s tests/multi_host
```

### Hermes runtime

Keep the Hermes registration shim standard-library-only where possible; use
Hermes's documented context APIs rather than depending on its private internals.
It runs in Hermes's interpreter: a repository `.venv` is not automatically
available to an in-process plugin.

If a future adapter requires third-party Python packages, run that functionality
in a separate uv-managed process with an explicit interpreter and protocol rather
than modifying Hermes's environment. This is not required for the initial shim.

### Optional scientific Python/GPU support

Retain NumPyro/GPU execution as optional; ordinary R workflows must not require
Python or `uv`. Update host setup instructions to use `uv` for the optional Python
environment and set `CASCADIATOOLS_PYTHON` to its actual interpreter.

When making that setup reproducible, migrate the existing requirements into a
separate optional GPU project's `pyproject.toml` and committed `uv.lock`, without
unrelated dependency upgrades. Keep GPU packages out of the default development
and Hermes environments. Validate JAX/CUDA/platform compatibility separately;
do not imply that one GPU lock works on every platform.

The environment must live in a user-owned location outside the plugin. For
example, use `UV_PROJECT_ENVIRONMENT` with `uv sync --project <gpu-project>
--locked`; point `CASCADIATOOLS_PYTHON` at that environment's platform-appropriate
Python executable. Do not create a replaceable `.venv` inside an installed plugin.

## 6. Implementation phases and exit criteria

Every phase must also satisfy the
[Git documentation and checkpoint requirement](#11-required-git-checkpoint-at-the-end-of-each-phase)
before it is considered complete or a dependent phase begins.

### Phase 0: establish supported host contracts

1. Record tested host versions and select the supported OpenCode major version.
2. Verify public APIs for skills, installation, interception, background jobs,
   active project resolution, and child/delegated sessions.
3. Record current Claude behavior and use synthetic fixtures for comparisons.
4. Confirm packaging requirements and choose supported OS/shell combinations.

Exit: a concrete compatibility matrix and verified blocking mechanism per host.
Unverified features remain explicitly unsupported, not inferred from documentation.

### Phase 1: packaging and skill rendering

Depends on Phase 0.

1. Add uv-managed development tooling and deterministic bundle assembly.
2. Implement bounded skill rendering and setup/privacy overlays.
3. Package all 14 skills and the shared runtime; validate IDs, references,
   executable permissions, metadata, versions, and payload hashes.
4. Keep the existing Claude source installation working without a build step.

Exit: complete packages build from a clean checkout, with no external-checkout
references, accidental data, missing resources, or unresolved host tokens.

### Phase 2: privacy boundary and execution compatibility

Depends on Phases 0 and 1.

1. Extract the neutral guard request/decision boundary with focused tests.
2. Preserve Claude decisions for existing supported event cases.
3. Define session-scoped paths, errors, and long-job behavior for both new hosts.
4. Prepare synthetic allow/deny fixtures and native refusal probes.

Exit: shared policy behavior and Claude compatibility pass; new adapters have
explicit contracts for mapping events, decisions, failures, and session state.

### Phase 3: implement OpenCode and Hermes adapters

Depends on Phase 2. The two adapters can be implemented independently.

- **OpenCode:** register/configure rendered skill discovery, integrate the
  verified interception surface, merge native permissions safely, and document
  installation, update, reload, and removal.
- **Hermes:** implement native registration, qualified skill references,
  `pre_tool_call` translation, explicit enablement, and profile/session-aware
  state handling. Keep registration free of package installation and analysis.

Exit per host: installation outside the checkout, all skills discoverable, a
synthetic GLM workflow produces its report, protected-file probes are refused,
and runtime failures are visible.

### Phase 4: cross-host validation and release

Depends on both Phase 3 adapters.

1. Run the test matrix below from built artifacts and the Claude source package.
2. Exercise one Bayesian/long-running workflow after the lightweight GLM pilot.
3. Verify updates preserve user data, configs, environments, and project outputs.
4. Update the root/plugin READMEs with separate host installation instructions,
   uv-based optional Python setup, support limitations, and privacy caveats.
5. Publish version-matched artifacts and mark new hosts experimental until their
   complete acceptance checks pass.

Exit: all release acceptance checks pass; document exact tested combinations.

## 7. Validation strategy

No tracked general test suite or CI configuration was found during this review.
Add focused compatibility tests rather than introducing a broad tooling stack.

| Layer | Required checks |
| --- | --- |
| Packaging | Clean build, complete payload, all 14 skill IDs, valid cross-references, no unresolved placeholders, executable wrappers, matching version/hash |
| Shared guard | Allow/deny decisions, malformed events/config, missing R/jsonlite, failure/timeout handling, relative/absolute paths, symlink/path boundaries |
| Host adapters | Real tool-event mapping, native denial result, visible errors, safe permission merge/removal, unknown-tool handling |
| Session state | Two projects with different privacy settings; no cwd, config, environment, or output leakage between concurrent sessions |
| Execution | Exit codes, stdout/stderr, paths with spaces, missing packages, cancellation, long-job status and report retrieval |
| Installation | Outside-checkout install, enable/disable, update/restart, user state preservation, unavailable/failed adapter detection |
| Scientific invariants | Identical module/config/seed and payload; compare numeric outputs with declared tolerances, not narrative wording |
| Workflow compliance | Plan before real-data fit; planted-truth and convergence checks; failure stays OPEN; report numbers trace to saved outputs |

Start with deterministic fixtures and a small `glm` self-test. A four-replicate
self-test is a packaging/execution smoke check, not scientific validation.
End-to-end analysis acceptance must retain the existing
[acceptance gate](../plugins/cascadia-tools/skills/eco-acceptance-gate/SKILL.md),
including its recovery sample sizes and convergence thresholds. Record seeds,
settings, host/model identity, toolkit revision, R/package versions, and outputs.

Use synthetic data and fake host credentials for automated checks. Real
model-backed acceptance runs must be explicit, bounded, and cost-aware; they
supplement deterministic tests rather than making ordinary CI require API keys.
Do not claim all models are equivalent because one host/model pair passed.

Initial target: local macOS/Linux execution for all three hosts. Preserve existing
Claude Windows guidance; claim new-host Windows support only after validating
the required Bash/R toolchain. Test SLURM or remote execution only on an
explicitly available, authorized environment, not as part of routine CI.

## 8. Release acceptance checklist

- [ ] Existing Claude marketplace identity and source installation still work.
- [ ] Standalone R commands retain their existing behavior.
- [ ] All three hosts discover the expected 14 skills without duplicate IDs.
- [ ] One shared scientific payload/version is used by every package.
- [ ] New-host packages install and run outside the source checkout.
- [ ] Setup, GLM report delivery, and one long-running workflow pass per host.
- [ ] The actual DONE/OPEN protocol is preserved; smoke tests are not mislabeled.
- [ ] Private-mode refusal probes and failure cases pass on every claimed host.
- [ ] Unsupported tool paths/features are disabled or explicitly refused in private mode.
- [ ] Concurrent projects keep their paths and privacy settings separate.
- [ ] Updating/removing a plugin does not erase project data or user environments.
- [ ] New Python dependencies/environments use uv with reviewed lockfiles.
- [ ] Tested host/model/OS combinations and remaining limitations are documented.
- [ ] Each completed phase has a Git checkpoint with detailed changes and validation results.

## 9. Risks and rollout decisions

| Risk | Mitigation |
| --- | --- |
| Host APIs and configuration change | Pin tested versions; use public APIs; gate release on compatibility tests |
| Skills become three independent copies | One authoritative source, deterministic rendering, minimal reviewed overlays |
| Adapter installs without its toolkit | Self-contained bundles and outside-checkout installation tests |
| Privacy appears enabled but is ineffective | Actual refusal probes, explicit coverage, no supported status on missing controls |
| Long-lived hosts mix project state | Request-scoped context and concurrent-project tests |
| Different models skip scientific steps | Preserve protocols and run bounded model-backed acceptance scenarios |
| Automatic skill edits alter validated procedure | Version and review source protocols; rebuild packages rather than accepting silent drift |
| Python packages conflict with Hermes | Minimal in-process shim; uv-managed external runtime only if needed |

Roll out additively: Claude remains supported throughout; OpenCode and Hermes
graduate individually from experimental after their acceptance checks pass.
Rollback disables or replaces the affected adapter/package without changing the
shared analysis engine or deleting user state.

## 10. Reference documentation

Verify these contracts again when implementation starts; documentation and host
releases can change independently of this plan.

- [Claude Code plugins](https://code.claude.com/docs/en/plugins)
- [Hermes plugin development](https://hermes-agent.nousresearch.com/docs/developer-guide/plugins)
- [Hermes plugin installation and enablement](https://hermes-agent.nousresearch.com/docs/user-guide/features/plugins)
- [Hermes skills](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills)
- [Hermes hooks](https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks)
- [OpenCode plugins](https://opencode.ai/docs/plugins/)
- [OpenCode skills](https://opencode.ai/docs/skills/)
- [OpenCode permissions](https://opencode.ai/docs/permissions/)
- [uv projects](https://docs.astral.sh/uv/guides/projects/)

## 11. Required Git checkpoint at the end of each phase

At the end of every phase, including Phase 0, use Git to document the completed
work in one or more phase-scoped commits with detailed commit messages. A short
status message or an uncommitted worktree is not a phase-completion checkpoint.
For Phase 0, commit the verified compatibility findings as documentation or test
fixtures. Phase 3 may have separate OpenCode and Hermes commits; both adapters
must meet their exit criteria before that phase is closed.

Required process:

1. Complete the phase's exit criteria and run its applicable validation.
2. Inspect `git status` and the relevant diff. Stage only files belonging to the
   phase, preserving unrelated work. Do not stage credentials, user data,
   environments, logs, or ignored release bundles.
3. Review the staged diff and run `git diff --cached --check`.
4. Create a commit with a clear phase identifier and a detailed body describing:
   - What changed and the affected components.
   - Why the changes were needed and any design decisions or deviations.
   - Compatibility and privacy behavior preserved or intentionally changed.
   - Exact validation commands/checks and their actual results.
   - Remaining limitations, skipped checks with reasons, and follow-up work.
5. Confirm the commit exists and report its SHA in the phase handoff, together
   with any remaining phase-owned changes. Do not mark the phase complete while
   required changes remain uncommitted.

Suggested commit-message structure:

```text
phase <N>: <specific completed outcome>

Changes:
- <changes made and affected components>

Rationale and compatibility:
- <decisions, preserved behavior, and intentional deviations>

Validation:
- <exact command or check>: <actual result>

Limitations and follow-up:
- <remaining limitations, or none>

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

Never describe a failed or skipped check as passing. If an exit criterion is
blocked, report the blocker and do not start dependent phases or claim the phase
is complete. Do not amend existing commits, rewrite history, or push to a remote
unless separately requested. This requirement governs implementation phases;
editing this plan alone does not authorize starting them.

## 12. Implementation evidence

### Phase 0: verified contracts

Local baseline on 2026-11-12: macOS, R 4.6.1, uv 0.10.0, Node 26.5.0.
No existing tracked dependency manifests, general tests, or CI were found.

| Host | Verified version | Integration contract and evidence |
| --- | --- | --- |
| Claude Code | 2.1.304 | Existing `PreToolUse` wrapper returned a native deny decision for a synthetic `Read` of `data_raw/synthetic.csv` |
| OpenCode | 2.2.0 | V2 default-export `{ id, setup(ctx) }`; native `permission.hook("evaluate")` changed an allowed synthetic read into `effect: deny` in an isolated running server |
| Hermes | 0.23.0, local revision `2bd378ed1b8d`, Python 3.14.9 | Real `PluginContext.register_hook("pre_tool_call", ...)` plus the host's directive dispatcher returned `("block", reason)` in an isolated profile |

OpenCode V2 has `skill.transform`, `tool.hook("execute.before")`, and
`permission.hook("evaluate")`; do not use the unrelated V1
`@opencode-ai/plugin` API. A plain JavaScript plugin can use the documented
default-export contract without adding SDK runtime dependencies.
Session roots come from `ctx.session.get({ sessionID })`, not `ctx.location`
alone. Await location plugin readiness before interpreting direct API probes.

Hermes supports read-only, plugin-qualified skills through `register_skill`;
its `agent.runtime_cwd.resolve_agent_cwd()` is the documented session-aware cwd
accessor. Import/register must not perform analyses or install dependencies.
Tests may bootstrap the installed host in an isolated profile, but adapters must
not modify host internals.

The existing R privacy guard and `jsonlite`/`yaml` are available. The default GLM
engine dependencies `glmmTMB`/`reformulas`, DHARMa, and Nimble are not installed in
the default R library; restore only dependencies required by chosen validation
commands into an isolated test library. No real-data or paid model calls were
made for these contract probes. Remote execution and new-host Windows support
remain unverified.

### Phase 1: packaging and rendering

Implemented `tools/multi_host.py` with deterministic archives, integrity
manifests, a tracked runtime-file allowlist, identical scientific payloads,
executable wrapper preservation, and guarded replacement of generated packages.
All 14 skills render from the existing sources; Claude retains its original
format. New-host skills resolve the relocatable toolkit relative to their own
skill directory and explicitly export `CASCADIATOOLS_ROOT` in each shell call.
That documented shell variable is not an unresolved build placeholder.

Added a dependency-free uv project/lockfile and focused standard-library tests.
Optional GPU setup now uses uv outside the replaceable plugin directory; a GPU
lock and CUDA validation remain outside this CPU-host integration release.

Validation: `uv sync --locked`, four package/renderer tests, all-host bundle
build/integrity checks, and Pylance syntax checks passed. Native adapter entry
points are intentionally added in Phase 3; these intermediate bundles are not
published or advertised as installable native plugins yet.
