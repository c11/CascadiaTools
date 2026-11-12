# cascadia-private: host-integrated private mode

The R toolkit runs locally. Anything the agent reads or prints can reach the
model provider. Private mode is a pattern-based guard, not a sandbox or a
guarantee against intentionally evasive commands.

1. Confirm which project-relative folders hold sensitive records; default to
   `data_raw` and `data`. Do not read their contents.
2. Verify that the CascadiaTools native plugin is active. Skills alone do not
   provide enforcement. If it is absent or failed, stop the protected workflow.
3. Write `.cascadia/private.json` in the active project:
   `{"private": true, "data_dirs": ["data_raw", "data"]}`.
4. Create a synthetic probe file outside the protected folders, then copy it
   into a protected folder using the user's own terminal. Attempt to read the
   protected synthetic file through the host's normal read tool. Confirm an
   actual refusal, not merely an instruction to avoid reading. If it is not
   refused, stop and say private mode is unavailable.
5. Also test a shell command that would print the synthetic file. Confirm refusal.
   Never use real sensitive records as a probe.
6. Work through toolkit commands that print summaries/results. Do not print raw
   records, coordinates, or identifiers. Native guards reject unsupported tools
   and delegation while private mode is on; do not work around a refusal.
7. Summaries, names of columns, estimates, figures, and error messages may still
   reach the provider. Review reports before sharing and check provider terms.
   Strict confidentiality requires stronger isolation or using the R CLI without AI.

Disable private mode only when the user explicitly asks: remove the marker and
only permission rules owned by CascadiaTools, if any. Do not overwrite or remove
the user's other permissions. Do not use privacy status from a different project.
