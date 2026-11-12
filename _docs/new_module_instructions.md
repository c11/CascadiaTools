# Adding a new module for Claude, OpenCode, and Hermes

A new analysis module should be implemented once in the shared toolkit. The
multi-host builder then places the same tracked payload into:

- Claude: `modules/<id>/`
- OpenCode: `toolkit/modules/<id>/`
- Hermes: `toolkit/modules/<id>/`

No host-specific module implementation is normally needed. The host adapters
handle registration, paths, skills, and privacy hooks. This behavior is defined
by [`tools/multi_host.py`](../tools/multi_host.py).

## 1. Choose the module ID and create its directory

Use a lowercase, hyphenated ID such as `dynamic-occupancy`.

From the repository root:

```sh
MODULE_ID=dynamic-occupancy
mkdir -p "plugins/cascadia-tools/modules/$MODULE_ID"
cp plugins/cascadia-tools/modules/_template/module.R \
   "plugins/cascadia-tools/modules/$MODULE_ID/module.R"
mkdir -p "plugins/cascadia-tools/modules/$MODULE_ID/example"
```

Start from
[`modules/_template/module.R`](../plugins/cascadia-tools/modules/_template/module.R)
and follow the complete contract in
[`MODULE_SPEC.md`](../plugins/cascadia-tools/docs/MODULE_SPEC.md).

Expected structure:

```text
plugins/cascadia-tools/modules/dynamic-occupancy/
├── module.R
├── README.md
├── VALIDATION.md
├── model.R                 # optional engine/helper code
├── python/                 # optional Python implementation
└── example/
    ├── config.yaml
    ├── recovery.yaml       # recommended
    ├── README_data.md
    ├── WALKTHROUGH.md
    └── example-data.csv
```

## 2. Document the scientific model before implementing it

Create the module's `README.md` with the required frontmatter:

```markdown
---
id: dynamic-occupancy
title: Dynamic occupancy
when_to_use: Repeated detection/non-detection surveys across multiple seasons...
not_for: Single-season surveys...
data_needed: Site-by-season detection histories, survey effort, and covariates
engine: nimble
---
```

Then document:

1. Question answered
2. Model equations
3. Assumptions and failure conditions
4. Input columns and formats
5. Every configuration key
6. Outputs and estimands
7. Simulation and power controls
8. Pitfalls
9. Primary references

The model ID must match the directory name and the `id` passed to
`ecomodule()`.

## 3. Implement the module contract

Edit `module.R` so it assigns:

```r
module <- ecomodule(
  id = "dynamic-occupancy",
  ...
)
```

At minimum, implement:

- `simulate(params, design, seed)`
- `fit(data, settings)`
- `defaults$params`
- `defaults$design`

For a usable real-data module, also implement:

- `read_data(config)`
- `check_data(data)`
- `interpret(fit, data)`
- `figures(fit, data, opts)`
- `methods_text(fit, data, settings)`
- `power_params`
- `null_values`, if a no-effect value is not zero
- `fast_settings`, if recovery needs cheaper settings

The exact return shapes are defined by
[`ecomodule`](../plugins/cascadia-tools/core/R/contract.R):

```r
simulate(...) -> list(
  data = ...,
  truth = c(parameter_name = numeric_value)
)

fit(...) -> list(
  estimates = data.frame(
    param,
    estimate,
    sd,
    lower,
    upper
  ),
  diagnostics = list(
    converged = TRUE,
    rhat_max = ...,
    ess_min = ...,
    notes = character()
  ),
  object = ...
)
```

Important invariants:

- `simulate()$data` and `read_data()` must return the same structure.
- Every name in `simulate()$truth` must match an `estimates$param`.
- Results must be deterministic for a given seed.
- Parameters should have descriptive names rather than engine-specific indices.
- Helper files should be loaded relative to `MODULE_DIR`, not the current
  working directory.

The loader automatically discovers any non-underscore directory containing
`module.R`; no central registry is required. See
[`list_modules()`](../plugins/cascadia-tools/core/R/contract.R).

## 4. Add realistic example data and configurations

The example should use the same format expected from researchers, not an
internal engine matrix.

A minimal `example/config.yaml` might be:

```yaml
data:
  detections: detections.csv
  sites: sites.csv

settings:
  seed: 417
  nchains: 4
  niter: 12000
  nburnin: 2000

figures:
  formats:
    - png
  dpi: 300
```

Relative data paths are resolved against `config$.dir`.

Also add:

- `README_data.md`: source, license, columns, units, and missing values
- `WALKTHROUGH.md`: exact reproducible commands
- `recovery.yaml`: default planted-truth design
- A harder-design configuration
- A null-effect configuration for the false-positive check

## 5. Confirm discovery and run the short contract test

Run from the shared toolkit directory:

```sh
cd plugins/cascadia-tools

scripts/Rscript core/run.R list
scripts/Rscript core/run.R describe dynamic-occupancy

scripts/Rscript core/run.R selftest dynamic-occupancy \
  --nsim 4 \
  --cores 1 \
  --out ../../../dev/dynamic-occupancy/selftest
```

The first two commands prove that the loader discovers the module. The
self-test exercises simulation, fitting, estimates, diagnostics, recovery
machinery, and report generation through
[`core/run.R`](../plugins/cascadia-tools/core/run.R).

For heavy models, use the repository's job wrapper rather than running on a
constrained login node:

```sh
scripts/ejob -c 4 -m 16 -t 1:00:00 -- \
  scripts/Rscript core/run.R selftest dynamic-occupancy \
  --nsim 4 \
  --cores 4 \
  --out ../../../dev/dynamic-occupancy/selftest
```

## 6. Complete scientific validation

A package build proves only that files are portable; it does not prove that the
module is scientifically valid.

Run the following checks in order.

### Default-design recovery

```sh
scripts/ejob -c 16 -m 32 -t 4:00:00 -- \
  scripts/Rscript core/run.R recover dynamic-occupancy \
  --config modules/dynamic-occupancy/example/recovery.yaml \
  --nsim 100 \
  --cores 16 \
  --out ../../../dev/dynamic-occupancy/recovery-default
```

### Harder-design recovery

```sh
scripts/ejob -c 16 -m 32 -t 4:00:00 -- \
  scripts/Rscript core/run.R recover dynamic-occupancy \
  --config modules/dynamic-occupancy/example/recovery-hard.yaml \
  --nsim 100 \
  --cores 16 \
  --out ../../../dev/dynamic-occupancy/recovery-hard
```

### Example-data fit

```sh
scripts/Rscript core/run.R fit dynamic-occupancy \
  --config modules/dynamic-occupancy/example/config.yaml \
  --out ../../../dev/dynamic-occupancy/example-fit
```

Open and inspect:

- The generated HTML report
- Every exported figure
- Convergence diagnostics
- Interpretation text against the actual estimates

### Power curve

```sh
scripts/ejob -c 16 -m 32 -t 4:00:00 -- \
  scripts/Rscript core/run.R power dynamic-occupancy \
  --config modules/dynamic-occupancy/example/recovery.yaml \
  --vary n_sites=50,100,200 \
  --what design \
  --nsim 100 \
  --cores 16 \
  --out ../../../dev/dynamic-occupancy/power
```

Also perform:

1. A null-effect power check; rejection should be near 0.05.
2. A deliberately misspecified fit; the recovery gate must fail.
3. An independent comparison against an established package or a second
   implementation.
4. For Bayesian models, verify R-hat `< 1.01`, bulk ESS `>= 400`, and inspect
   the chains.

Record numerical results, commands, limitations, and the final `DONE` or `OPEN`
verdict in `VALIDATION.md`. The thresholds are documented in
[`eco-acceptance-gate`](../plugins/cascadia-tools/skills/eco-acceptance-gate/SKILL.md).

## 7. Add the module to the catalog

The catalog is generated from each module's `README.md` frontmatter:

```sh
cd plugins/cascadia-tools
python3 tools/make_catalog.py
cd ../..
```

This updates:

- [`catalog.md`](../plugins/cascadia-tools/catalog.md)
- [`docs/catalog.json`](../plugins/cascadia-tools/docs/catalog.json)

For the module to appear in a named scientific domain, add its ID to the
appropriate group in `DOMAINS` in
[`make_catalog.py`](../plugins/cascadia-tools/tools/make_catalog.py). Otherwise,
the generator places it under **Other modules** and omits it from
`catalog.json`.

Rerun:

```sh
python3 plugins/cascadia-tools/tools/make_catalog.py
```

Review the generated catalog entry to ensure its selection guidance is clear.

## 8. Track every new file in Git before packaging

This is mandatory. The multi-host builder uses `git ls-files`, so untracked
module files are excluded from all packages.

```sh
git add \
  "plugins/cascadia-tools/modules/dynamic-occupancy" \
  plugins/cascadia-tools/catalog.md \
  plugins/cascadia-tools/docs/catalog.json

# Add this only if its domain mapping changed:
git add plugins/cascadia-tools/tools/make_catalog.py

git status --short
```

A commit is not technically required for a local build, but all module files
must at least be in the Git index. A release should be built from a reviewed
commit.

## 9. Bump the package version for a release

Update `version` in
[`plugin.json`](../plugins/cascadia-tools/.claude-plugin/plugin.json). That
value is authoritative for all three packages and their archive names.

For example:

```json
"version": "0.3.0"
```

Use the release versioning policy appropriate to the project. Adding a major
new analysis family would normally warrant at least a minor version bump.

## 10. Build all three host packages

From the repository root:

```sh
uv sync --locked

uv run --locked python tools/multi_host.py build --host all
uv run --locked python tools/multi_host.py check --host all
```

The builder will:

1. Enumerate tracked toolkit payload files.
2. Copy the module unchanged into the Claude package.
3. Copy it under `toolkit/` for OpenCode and Hermes.
4. Render host-specific skills.
5. Add native host adapters and manifests.
6. Generate checksums and deterministic archives.
7. Assert that all hosts have identical scientific payloads.

Outputs appear under `dist/multi-host/`:

```text
dist/multi-host/
├── claude/modules/dynamic-occupancy/
├── opencode/toolkit/modules/dynamic-occupancy/
├── hermes/toolkit/modules/dynamic-occupancy/
├── cascadia-tools-claude-<version>.tar.gz
├── cascadia-tools-opencode-<version>.tar.gz
└── cascadia-tools-hermes-<version>.tar.gz
```

## 11. Run packaging and adapter tests

```sh
uv run --locked python -m unittest discover -s tests/multi_host -v
node --test tests/multi_host/opencode.test.mjs
```

These verify package integrity, relocation, skill rendering, adapters, privacy
behavior, and deterministic archives. The principal package parity test is
[`test_packages.py`](../tests/multi_host/test_packages.py).

The existing cross-host scientific smoke uses `glm`, so it does not by itself
exercise the new module. Run the new module directly from every built toolkit:

```sh
for host in claude opencode hermes; do
  if [ "$host" = claude ]; then
    root="$PWD/dist/multi-host/claude"
  else
    root="$PWD/dist/multi-host/$host/toolkit"
  fi

  CASCADIATOOLS_ROOT="$root" \
    "$root/scripts/Rscript" "$root/core/run.R" \
    selftest dynamic-occupancy \
    --nsim 4 \
    --cores 1 \
    --out "$PWD/dev/dynamic-occupancy/package-$host"
done
```

For stronger parity, fit the same deterministic synthetic dataset through all
three bundles and compare the resulting estimates numerically, following the
pattern in
[`scientific_smoke.R`](../tests/multi_host/scientific_smoke.R).

## 12. Verify each host installation

### Claude Code

The Claude package remains a normal Claude plugin. Validate it:

```sh
claude plugin validate plugins/cascadia-tools
claude plugin validate .
```

Install or update through the existing CascadiaTools marketplace/plugin flow,
restart Claude Code, and verify that it can list and describe the new module.

### OpenCode

Copy the entire generated directory to a stable versioned location:

```sh
cp -R dist/multi-host/opencode \
  "$HOME/.local/share/cascadia-tools/opencode-0.3.0"
```

Add its absolute path to the project's existing `opencode.json` or
`opencode.jsonc`:

```json
{
  "plugins": [
    "/Users/you/.local/share/cascadia-tools/opencode-0.3.0"
  ]
}
```

Restart OpenCode and ask it to list or describe the new module. Do not
separately install the adapter or rendered skills.

### Hermes

Install the whole package into the active Hermes profile:

```sh
profile="${HERMES_HOME:-$HOME/.hermes}"

test ! -e "$profile/plugins/cascadia-tools" &&
  mkdir -p "$profile/plugins" &&
  cp -R dist/multi-host/hermes "$profile/plugins/cascadia-tools"

hermes plugins doctor "$profile/plugins/cascadia-tools" --ci
hermes plugins enable cascadia-tools
hermes plugins list
```

Restart the active Hermes gateway/session. Then verify that
`cascadia-tools:eco-analyze` can list and describe the new module.

Complete OpenCode and Hermes installation details are in
[`integrations/README.md`](../integrations/README.md).

## Final readiness checklist

The module is ready only when all of these are true:

- [ ] `module.R` satisfies the `ecomodule` contract.
- [ ] README frontmatter and full scientific documentation exist.
- [ ] Realistic example data and configurations exist.
- [ ] `selftest` passes.
- [ ] Default and hard-design recovery results are documented.
- [ ] Null and misspecification controls were run.
- [ ] An independent implementation agrees numerically.
- [ ] The example fit, report, interpretations, and figures were inspected.
- [ ] Catalog files were regenerated.
- [ ] Every new file is tracked by Git.
- [ ] The release version was updated.
- [ ] `build --host all` and `check --host all` pass.
- [ ] Python and OpenCode adapter tests pass.
- [ ] The new module runs from each relocated built package.
- [ ] Claude, OpenCode, and Hermes each discover and invoke it after restart.
