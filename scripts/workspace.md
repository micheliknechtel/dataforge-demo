# Workspace contract (all four skills)

Resolve the project before reading any manifest, issuing a query, or writing
artifacts. From the repository root run `node scripts/workspace.mjs`; from a
nested project use the absolute path to this script in the installed package.
Read its JSON output as `context`.

- `context.packageRoot` owns canonical `skills/`, references, scripts and
  `skills/forge-builder/.build-state/`. Resolve Markdown links relative to the
  containing file. Do not interpret a skill path relative to the project CWD.
- `context.seed` is the selected seed, and `context.resolved` is its paired
  generated manifest **in the same directory**. Never substitute the generic
  `assets/dataforge.manifest.yaml` for the selected project seed.
- `context.projectRoot` owns the metric store, warehouse and pipeline artifacts.
  Run discovery, SQL, runners and `verify.py` with this directory as CWD.
  Invoke `verify.py` by its absolute path under `context.packageRoot`.
- `dataforge.workspace.json` explicitly selects the project when opening the
  whole repository. Without it, the resolver checks the nearest seed or
  `assets/` seed, stopping at the Git boundary. Invalid selectors are errors,
  not an excuse to fall back to a different project.

Initialize if the paired resolved file is missing, older than the selected
seed, or its recorded seed checksum no longer matches. Write the resolved file
only after the discovery summary has been reviewed. Corrections belong in
`context.seed`; do not edit generated manifests. A legacy full seed is copied
to `context.resolved`, not to a hardcoded assets directory.

For this rehearsal, the manifest repository must equal `context.repository`.
Before GitHub or Git writes, run `node <packageRoot>/scripts/github.mjs check`.
STOP on a mismatch or a foreign issue/PR URL. Use
`node <packageRoot>/scripts/github.mjs issue view <NUMBER>` and analogous
`issue`, `label`, `pr` or `repo view` commands; the wrapper supplies `--repo`,
ignores no permission checks, and validates the remote before writes.
Never fetch missing skills from an unpinned registry: all four canonical skills
are bundled here; report an incomplete checkout instead.

This contract applies to every phase and reference, including historical
examples mentioning `assets/`, `.build-state/` or `skills/`. Project paths and
package paths have different roots. Human approval gates remain mandatory.
