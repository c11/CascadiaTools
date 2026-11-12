# CascadiaTools plugin

Validated analysis modules and working protocols that let AI coding agents run ecological,
wildlife, fisheries and conservation-genetic analyses correctly: every analysis checks that
the method recovers known truth at your study design before your data are interpreted, and
ends with a plain-language report, publication figures and a methods paragraph.

This directory remains the directly installable Claude source plugin and the
shared scientific/protocol source. OpenCode and Hermes use complete rendered
bundles, not separate copies of the statistical code.

Install in Claude Code:

```
/plugin install cascadia-tools --marketplace taaltree/CascadiaTools
```

(or `/plugin marketplace add taaltree/CascadiaTools` then `/plugin install cascadia-tools@cascadia`).
In the Claude desktop app you can instead open the plugins window (**+** → **Add plugins**), add the
marketplace `taaltree/CascadiaTools` and install **cascadia-tools** from it.

Start with *"Show me what CascadiaTools can do"* (skill `cascadia-start`), or
*"Set up CascadiaTools"* (skill `cascadia-setup`) on a new computer. Requires R 4.5+.

## OpenCode and Hermes (experimental)

From the repository root, build with uv:

```sh
uv sync --locked
uv run --locked python tools/multi_host.py build --host all
```

Install the entire appropriate package from `dist/multi-host/` outside the
checkout. Follow the [host installation guide](../../integrations/README.md)
for OpenCode's `plugins` config or Hermes profile installation/enablement, plus
update, disable, removal, and optional uv-based Python setup.
Tested: OpenCode 2.2.0 and Hermes 0.23.0 on macOS, with R 4.6.1.
Model-backed scientific acceptance, other platforms, remote execution, and GPU
support remain unverified. Keep project outputs and environments outside bundles.

The native adapter must be active for private mode: perform synthetic read and
shell refusal probes. Unknown tools/delegation are refused; this is a pattern
guard, not a sandbox, and summaries/results may still reach the model provider.
Real-data results still require the unchanged planted-truth and acceptance gates.

## Shared skills

Skills: `eco-analyze` (end-to-end workflow), `eco-planted-truth`, `eco-acceptance-gate`,
`eco-analysis-plan`, `eco-data-intake`, `eco-convergence`, `eco-model-checking`,
`eco-interpretation`, `eco-power`, `eco-figures`, `eco-new-module`, `cascadia-start`,
`cascadia-setup`, `cascadia-private`. Module index: `catalog.md`.

Guide and examples: https://cascadiawildlifelab.org/tools/ · Cascadia Wildlife Lab, Oregon State University.
