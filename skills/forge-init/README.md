# Forge Init

forge-init is the config boundary: the cold-start discovery engine that keeps business context out of every other skill.
It turns a short seed manifest into the full project configuration the rest of dataforge reads: zones, catalogs, schemas, grains, jobs, domains, and naming conventions.
Because it exists, no other skill needs to know a single catalog name, domain, or table prefix.

## Getting it

forge-init ships as part of dataforge:

```bash
git clone https://github.com/micheliknechtel/dataforge-demo.git
cd dataforge-demo && node scripts/package.mjs
```

See the [repository README](../../README.md) for how to point Claude Code, Cursor, or GitHub Copilot at the generated packages.

## What it does

Instead of hand-authoring every catalog and job, supply the selected project
seed. [The workspace contract](../../scripts/workspace.md) resolves its path;
the generic assets example is not the support-desk configuration.
forge-init reads that seed and does the rest by querying the platform CLI and scanning the codebase: it lists zones and profiles, discovers catalogs and classifies them as source or target, reads table schemas to infer grain definitions, matches job names to their store prefix, and walks the directory tree to infer domains, entity structure, and column naming conventions.

You can trigger it directly ("initialize dataforge", "resolve manifest"), but most of the time you never call it by name.
Every other skill checks the resolved file paired with that selected seed,
invoking forge-init if it is missing or stale.

## What to expect

Before running discovery, forge-init validates the Tier 1 fields in the seed and asks for anything missing or still set to a placeholder value.

On the `databricks` engine it needs the Databricks CLI installed and at least one profile authenticated (`databricks configure --profile <name>`); with no valid profile, it stops and asks you to authenticate first.
On the `duckdb` engine it needs the DuckDB CLI on `PATH` and at least one `.duckdb` file under `platform.duckdb_dir`.

Discovery itself runs through zones, catalogs, schemas, grains, jobs, domains, and naming in sequence, using the platform CLI and codebase scans rather than guesswork.
At the end it prints a discovery summary, catalogs found, domains and tools, grains, jobs matched, and any unresolved items, and waits for you to confirm or correct it before the manifest is considered final.
Corrections go into the `overrides` section of the seed file, not the resolved manifest directly, so a re-run stays reproducible.

## Output

forge-init writes the resolved configuration beside the selected seed:
`examples/support-desk/dataforge.manifest.resolved.yaml` in this rehearsal.
Its header identifies the seed and checksum. If required seed values are
supplied interactively, update only that selected seed.
Neither file is committed automatically; that stays your call.

## Related skills

[`forge-dbx`](../forge-dbx/) executes the `DESCRIBE TABLE` queries forge-init uses to infer grain definitions, and handles the platform CLI calls for SQL execution more generally.
