---
name: cascadia-private
description: Turn on data-private mode for this project so the AI agent works from data structure, check messages and results without reading raw records (sensitive species locations, data under agreements, human-subjects data). Use when the user says their data are sensitive, confidential or must not be shared, or asks how to keep data private.
---

# cascadia-private — analyse data without reading the raw records

**What it does.** The R toolkit runs on the user's computer. The AI model does not:
anything the agent reads or prints goes to the model provider. Private mode keeps raw
records out of the conversation. The agent sees only column names, dimensions, value
ranges, missing-value counts, `check_data()` messages and aggregated results.

## Turn it on

1. Ask which folders hold sensitive data. Default: `data_raw/` and `data/` in the project.
2. Write `.cascadia/private.json` in the project root:
   `{"private": true, "data_dirs": ["data_raw", "data"]}` (the folders the user named).
   The OpenCode plugin rereads this file before tool and shell operations. It refuses
   reads, edits and searches of those folders, searches whose scope includes them,
   and shell commands that name them. The guard runs in the plugin runtime without R.
   CascadiaTools commands using a config outside the protected folders can still run
   and report summaries and results.
3. Add read/edit-deny rules to the project's `opencode.json` or `opencode.jsonc`
   (create it if missing, merge if present). Append rules to `permissions` for each
   protected folder and its descendants:
   ```json
   {
     "permissions": [
       {"action": "read", "resource": "data_raw", "effect": "deny"},
       {"action": "read", "resource": "data_raw/*", "effect": "deny"},
       {"action": "edit", "resource": "data_raw", "effect": "deny"},
       {"action": "edit", "resource": "data_raw/*", "effect": "deny"},
       {"action": "read", "resource": "data", "effect": "deny"},
       {"action": "read", "resource": "data/*", "effect": "deny"},
       {"action": "edit", "resource": "data", "effect": "deny"},
       {"action": "edit", "resource": "data/*", "effect": "deny"}
     ]
   }
   ```
   These examples use location-relative paths; use canonical absolute paths for
   protected directories outside the project. OpenCode uses last-matching-rule wins,
   so check for later agent overrides. The plugin's own guard remains active too.
   Then test it: try to read a file in one of those folders, and show the user that it is refused.
   If it isn't refused, say so plainly and don't describe the data as protected.
4. Tell the user, plainly, what this does and does not protect:
   - Guarded: native file/search tools and obvious shell commands are refused; the
     agent works through summaries.
   - Still sent: summaries, column names, error messages, estimates and figures.
   - Not a guarantee: these are pattern-based guards, not a security boundary. A
     command written to evade them, custom tools, prompt attachments, or copies outside
     the protected folders could still expose data. For the strictest cases,
     run the toolkit without an AI model (`Rscript core/run.R ...` and the protocols
     as a written checklist), or use coordinates shifted and rotated before analysis.
   - Also check the model provider's data terms for their account or institution.

## While private mode is on

- Describe data with summaries only, e.g.
  `"${CASCADIATOOLS_ROOT}/scripts/Rscript" -e 'd <- read.csv("data_raw/x.csv"); str(d[0, ]); print(dim(d)); print(colSums(is.na(d)))'`
  is still blocked (it names a private folder): use the module's `check_data` through
  `core/run.R fit` instead, which reports problems without printing records.
- Never paste rows, coordinates or identifiers into the conversation, a report or a commit.
- Reports go to the project's `results/` folder; remind the user to review them before sharing.

## Turn it off

Delete `.cascadia/private.json` and only the deny rules added for this mode, only when
the user asks. Never remove unrelated OpenCode permissions or plugin configuration.
