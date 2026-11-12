# CascadiaTools

**Validated ecological analysis for AI coding agents.** CascadiaTools lets an AI agent
(Claude Code, with experimental OpenCode and Hermes adapters) run wildlife,
fisheries, occupancy, abundance, movement, causal and
conservation-genetic analyses for you, using statistical code that has been written once,
checked by simulation and independently verified, instead of new, unchecked code every time.

You describe your data and your question in plain language. The agent:

1. checks your files and describes them back to you;
2. writes a short analysis plan;
3. simulates data like yours with known answers and confirms the method recovers them
   (*planted truth*); if it can't, you are told, with numbers;
4. fits your data, checks convergence and goodness of fit;
5. gives you a report with plain-language results, publication-ready figures and a
   methods paragraph.

Made by [Taal Levi](https://levi.cascadiawildlifelab.org) at the
[Cascadia Wildlife Lab](https://cascadiawildlifelab.org), Oregon State University.
Beginner's guide, examples and validation results: **https://cascadiawildlifelab.org/tools/**

## What it covers (29 modules)

| Area | Modules |
|---|---|
| Regression and causal inference | GLMs/GLMMs with biological interpretation; causal effects from DAGs; structural equation models |
| Occupancy | single-season and dynamic; multispecies (Rota); two-species conditional (Waddle); spatial (spOccupancy); abundance-mediated interactions |
| Abundance | N-mixture; distance sampling |
| Spatial capture-recapture | closed SCR (camera traps, hair snares, Poisson/binomial, masks, covariates); mark-resight and generalized mark-resight; search-encounter (sign search along tracks); open-population SCR |
| Demography | Cormack-Jolly-Seber; multistate; Jolly-Seber; integrated population models; population trends; population viability analysis |
| Distribution and community | presence-only SDMs; joint species distribution models (HMSC); ordination, PERMANOVA, beta diversity |
| Movement | hidden Markov models; step-selection analysis and home ranges |
| Conservation genetics | diversity and population structure; effective population size and relatedness |
| Fisheries | growth (von Bertalanffy) and condition; catch curves, stock-recruitment, surplus production |

Every module has a worked example (`plugins/cascadia-tools/modules/<module>/example/WALKTHROUGH.md`)
and a validation record (`VALIDATION.md`) with its recovery results and known limits.

## Install (about 30 minutes, once)

### Claude Code

1. **Install R 4.5 or newer** from https://cran.r-project.org.
   Windows: also install Rtools and [Git for Windows](https://git-scm.com/downloads/win) (the run
   scripts need its Bash shell). Mac: run `xcode-select --install` in Terminal.
2. **Install Claude Code**: the Claude desktop app (Code tab) or the terminal version;
   see https://claude.com/claude-code.
3. **Add CascadiaTools.**
   - *Desktop app (point and click):* in the Code tab, open the plugins window (the **+** button →
     **Add plugins**, or type `/plugin` and press Enter). Under **Marketplaces**, choose **Add marketplace**
     and enter `taaltree/CascadiaTools`; then find **cascadia-tools** under **Discover** and click **Install**.
   - *Typed commands (desktop app or terminal):*
     ```
     /plugin marketplace add taaltree/CascadiaTools
     /plugin install cascadia-tools@cascadia
     ```
   Then type `/reload-plugins` or start a new session.
4. **Finish setup.** Open a folder for your project in Claude Code and type
   *"Set up CascadiaTools"*. It installs the R packages and runs a test.

Then try: *"Show me what CascadiaTools can do"*, or *"Run the occupancy example"*,
or describe your own data and question.

**Without the plugin system:** clone this repository and in Claude Code type
`/plugin marketplace add /path/to/CascadiaTools`, then install as above.
**Without any AI:** `Rscript plugins/cascadia-tools/core/run.R list` shows the modules;
each module's walkthrough lists the commands.

### OpenCode and Hermes (experimental)

The same repository builds complete native packages for OpenCode 2.2.x and
Hermes >=0.23.0,<0.24.0, using the existing 14 skills and one shared R toolkit.
Claude's marketplace installation remains unchanged.

```sh
uv sync --locked
uv run --locked python tools/multi_host.py build --host all
uv run --locked python tools/multi_host.py check --host all
```

Copy the **whole** chosen package from `dist/multi-host/` to a stable location
outside the checkout. OpenCode loads its package directory through the
`plugins` array in `opencode.json(c)`. Hermes loads its complete bundle from
the active profile's `plugins/cascadia-tools/` directory, with explicit enablement.
See the [installation/update/removal guide](integrations/README.md) for exact
steps, required restarts, R library configuration, and privacy refusal probes.
Python tooling/environments use **uv**, not global pip.

Verified locally with OpenCode 2.2.0, Hermes 0.23.0, and R 4.6.1 on macOS:
native skill registration/privacy, relocated GLM and Bayesian job/report smoke,
numeric parity, cancellation, and update/removal preservation. These checks do
not certify model-backed scientific acceptance. New-host Linux/Windows,
remote execution, and GPU/CUDA remain unverified. Full evidence and remaining
release gates are in the [multi-host plan](./_docs/multi-tenants-support.md).

## Your data and privacy

The statistical code runs on your computer. The AI model does not: whatever the agent
reads or prints is sent to the model provider. For sensitive data, type
*"Turn on private mode"*: the agent then works from summaries and results without reading
raw records (see the `cascadia-private` skill for exactly what this does and does not protect).
For OpenCode/Hermes, the native plugin must be active and both synthetic
protected-read and protected-shell probes must actually be refused. Skills alone
do not enforce privacy. Private mode is a pattern guard, not a sandbox; unsupported
tools/delegation are refused, and summaries/results may still reach the provider.
For the most sensitive data, use the toolkit without AI.

## Citing

Please cite CascadiaTools (see `CITATION.cff`) and the packages each report lists.

## Licence

Code: MIT (`LICENSE`). Documentation, protocols and examples: CC BY 4.0 (`LICENSE-docs`).
