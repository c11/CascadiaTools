# OpenCode and Hermes installation (experimental)

Claude Code keeps its existing marketplace/source installation. These adapters
use the same 14 protocols and scientific toolkit; they do not replace Claude.
Tested locally: OpenCode 2.2.0 (V2 API), Hermes 0.23.0, macOS, R 4.6.1.
The adapters require OpenCode 2.2.x / Hermes >=0.23.0,<0.24.0 respectively.
Other host versions, Linux, new-host Windows, remote execution, GPU execution,
and model-backed end-to-end scientific acceptance remain unverified.

## Build once

Install R 4.5+, Bash, Git, and [uv](https://docs.astral.sh/uv/).
Python tooling requires Python 3.11+ and has no third-party dependencies.
OpenCode's JavaScript adapter requires Node 22+ for standalone tests.

```sh
uv sync --locked
uv run --locked python tools/multi_host.py build --host all
uv run --locked python tools/multi_host.py check --host all
```

Packages and version-matched archives are under `dist/multi-host/`. Copy the
**whole** selected directory to a stable, user-owned location outside the
checkout, or unpack its archive (top-level directory: `cascadia-tools`).
Never install only an adapter file or only the skills.
The build command replaces only its own marked generated directories.
Do not keep projects, R libraries, or Python environments inside these bundles.

## OpenCode

Copy `dist/multi-host/opencode/` to a new directory, for example
`$HOME/.local/share/cascadia-tools/opencode-0.2.1/`. Add its absolute directory
to the existing project's `opencode.json(c)` **plugins** array, preserving
all other settings and entries:

```json
{
  "plugins": ["/absolute/user-owned/path/opencode-0.2.1"]
}
```

This is the V2 plugin API, not the V1 `@opencode-ai/plugin` API. No npm install
is needed for this adapter. Do not separately copy/register its rendered skills:
the native plugin registers them and the privacy hooks together.

Restart OpenCode, wait for the plugin to become active, and confirm all 14
CascadiaTools skills appear, including `cascadia-start` and `eco-analyze`.
Then request "Set up CascadiaTools". A failed/unloaded plugin offers **no**
privacy enforcement; a server that has only started listening is not ready yet.
Existing allow/ask/deny settings remain owned by the user; this plugin only
narrows decisions while private mode is active.

Update by building/unpacking a new complete version directory, changing that
single configured path, and restarting. Disable/remove the path (or add
`"-cascadia-tools"` after it) and restart to unload the plugin. Do not overwrite
the entire config or delete permission rules. Only delete an old bundle after
checking that no active configuration references it.

## Hermes

Use the active profile's `HERMES_HOME` (normally `$HOME/.hermes`), not a
project-local `.hermes/plugins/` directory: gateway sessions do not load those.
For a **new** installation:

```sh
profile="${HERMES_HOME:-$HOME/.hermes}"
test ! -e "$profile/plugins/cascadia-tools" &&
  mkdir -p "$profile/plugins" &&
  cp -R dist/multi-host/hermes "$profile/plugins/cascadia-tools"
hermes plugins doctor "$profile/plugins/cascadia-tools" --ci
hermes plugins enable cascadia-tools
hermes plugins list
```

Stop if copying/doctor/enable fails; do not assume a listed skill means hooks
are enabled. Restart the active Hermes gateway/session after installation or
changes. Confirm the plugin is active and its 14 qualified skills are visible,
for example `cascadia-tools:cascadia-start` and `cascadia-tools:eco-analyze`.
Request `cascadia-tools:cascadia-setup` to finish R setup.
The adapter needs no pip install and never installs dependencies at registration.

Disable with `hermes plugins disable cascadia-tools` and restart. For updates,
stop/disable the plugin, keep a backup of its old directory outside `plugins/`,
copy a complete new bundle into the same profile directory, run doctor, enable,
and restart. For removal, disable and restart first, then use
`hermes plugins remove cascadia-tools` or remove only that verified plugin
directory. Preserve the profile's other plugins, configuration, and project data.

## Execution and private mode

Follow the rendered skill's toolkit-root instruction **in every shell call**;
do not assume environment/cwd changes persist. Shells may use:

```sh
export CASCADIATOOLS_ROOT="/absolute/installed/bundle/toolkit"; "$CASCADIATOOLS_ROOT/scripts/Rscript" "$CASCADIATOOLS_ROOT/core/run.R" list
```

Keep the active cwd and outputs in the research project. R/jsonlite must be
available to the host process. If its environment differs from your terminal,
configure `CASCADIATOOLS_R` and `R_LIBS`/`R_LIBS_USER` explicitly before launching
it. Missing R, malformed config/events, and guard timeouts fail closed.
Complete setup before turning private mode on: package installation and
arbitrary R expressions are intentionally outside its shell allowlist.
For analysis packages in a shared external library, set `CASCADIATOOLS_RLIB`.
For optional NumPyro/GPU setup, use the rendered setup skill's `uv venv` /
`uv pip install --python ...` instructions and set `CASCADIATOOLS_PYTHON`;
keep that environment outside the plugin. GPU/CUDA is not certified here.

### Long jobs

Use the rendered `ejob -c ... -m ... -t ... -- ...` command, with the toolkit
root exported, in the active project. Local jobs keep their log under `logs/`;
no SLURM/remote execution is certified for these adapters. Do not retry a fit
just because a foreground call returns before its job finishes.

- **OpenCode:** the native `shell` tool supports `background: true` and a
  millisecond `timeout`. Record its returned job identity; use the host's UI
  to observe/interrupt it and read the saved project log/report after completion.
- **Hermes:** use `terminal`, a generous seconds-based `timeout`, and, when
  needed, `background: true`. Record the returned session/process identity and
  honor completion notifications. Verify the backend is local before starting.
- **Private-mode limitation:** process-management, Code Mode, and arbitrary
  `kill`/status shell commands are not allowlisted. Use the user's native
  interrupt controls or their own terminal for cancellation/status. Do not
  bypass the guard by launching a second fit or delegating process control.

Retrieve the saved HTML report through its actual project path and check the
exit status/log before reporting success. Cancellation/failure remains OPEN;
a report from an earlier run is not evidence that the interrupted job finished.

Private mode uses the nearest active-project ancestor's
`.cascadia/private.json`:

```json
{"private": true, "data_dirs": ["data_raw", "data"]}
```

Before using sensitive records, perform **both** synthetic protected-read and
protected-shell refusal probes from `cascadia-private`. Verify native refusals
after every host/plugin update. Stop if the plugin is absent, inactive, or
fails a probe. Unknown/delegated tools are refused in private mode; new-host
shell commands are restricted to the installed toolkit CLI (optionally its
`ejob` wrapper). Arbitrary scripts, command composition, and unsupported
search/delegation are not supported there. Do not weaken rules to bypass a
refusal.
OpenCode Code Mode (`execute`) is also unsupported/refused in private mode.
Use direct supported tools; if necessary, explicitly disable Code Mode with
a user-owned native permission rule as described in the
[OpenCode tools guide](https://opencode.ai/docs/tools/). The adapter does not
silently rewrite your configuration to do this.

This is a pattern guard, **not a security sandbox**. Summaries, estimates,
figures, error text, and anything already in conversation history can reach
the model provider. Use the R CLI without AI for strict confidentiality.
Turn privacy off only at the user's explicit request; do not edit someone
else's permissions. Neither adapter adds persistent host permission rules.

## Verification

```sh
uv run --locked python -m unittest discover -s tests/multi_host -v
node --test tests/multi_host/opencode.test.mjs
# Optional installed OpenCode probe: no model calls; uses a temporary HOME.
R_LIBS="$(Rscript -e 'cat(.libPaths(), sep=.Platform$path.sep)')" \
  node tests/multi_host/opencode_runtime.mjs
```

The optional `hermes_runtime.py` probe requires the installed Hermes source,
its interpreter/bootstrap, a built package, and a synthetic private project.
`scientific_smoke.R <packages> <fresh-output-directory>` runs identical synthetic
GLM fits/reports and four-replicate execution checks from relocated packages,
comparing estimates to tolerance `1e-10`. It requires the GLM/R report packages.
After that pilot, `bayesian_smoke.R <scientific-smoke-output>` runs a bounded
Nimble occupancy workflow through the local `ejob` runner from all three bundles.
It needs a C++ compiler, Nimble, and posterior, with external libraries supplied
through `CASCADIATOOLS_RLIB` as needed. Its four replicates/three short chains
test execution/report retrieval and numeric parity, not scientific acceptance.
The standard Python suite includes local job error/log/cancellation probes;
these never submit jobs to a shared SLURM scheduler.
These are deterministic integration checks, **not** scientific acceptance or
evidence that an arbitrary model follows every protocol. Real-data DONE status
still requires the unchanged planted-truth, convergence, and acceptance gates.
