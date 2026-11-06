# Agent guidelines for this repository

This repository holds four agent skills. If you are here to *use* them, start
at [README.md](README.md). This file is for working *on* them.

## Rehearsal safety and workspace

Read [the shared workspace contract](scripts/workspace.md) before using any
skill. `node scripts/workspace.mjs` selects the support-desk seed, even when
Copilot opens the repository root. Never use the generic assets manifest for
this demo. Run project commands in the reported projectRoot, and verifier
commands by their absolute packageRoot path.

All GitHub writes are restricted to the repository in
`dataforge.workspace.json`, using `scripts/github.mjs`. Check its remote and
manifest guard before Git writes as well. Do not create issues, labels,
commits or PRs in either source repository. Do not deploy or approve a phase
on the user's behalf. Do not publish agent logs, local caches or real data.

## The one rule

No business-specific value belongs in `skills/`. Not a catalog name, not a
table name, not a domain noun, not a zone id. If a skill needs to know one, it
reads it from the resolved manifest; if the manifest cannot supply it,
`forge-init` must learn to discover it.

This is the property the whole design rests on, and it is easy to erode one
convenient hardcoded string at a time. Before committing, run:

```bash
scripts/leak_scan.sh
```

That script holds the only copy of the pattern list, and CI runs the same one,
so a pattern added for one is added for both. Example values in documentation
are exempt only when they come from the support-desk vocabulary the example
project uses.

## Layout

| Path | Owns |
| --- | --- |
| `skills/<name>/SKILL.md` | The skill. The only hand-maintained packaging source. |
| `skills/<name>/references/` | Detail loaded on demand so the main file stays readable. |
| `assets/` | The seed manifest and its documented example. |
| `hooks/` | Session-start hooks that check existence and notify; no manifest-content read or forge-init execution. |
| `scripts/` | `package.mjs` (generation), `validate_contracts.py` and `leak_scan.sh` (checks). |
| `examples/support-desk/` | The runnable DuckDB project and demo script. |
| `.github/agents/`, `.github/skills/`, `.claude-plugin/`, `.cursor-plugin/` | Generated. Never edit. |

## Making a change

1. Edit `skills/<name>/SKILL.md` or its references.
2. Run `node scripts/package.mjs` and commit the regenerated targets.
3. Run the checks below.
4. Update [CHANGELOG.md](CHANGELOG.md) when behavior changes.

```bash
node scripts/package.mjs --check          # generated targets match source
python scripts/validate_contracts.py      # manifest and reference contracts
python scripts/tests/test_verify.py       # forge-builder artifact verification
python scripts/tests/test_validate_contracts.py
node hooks/scripts/session-start.test.mjs
scripts/leak_scan.sh                      # no business context in skills/ or assets/
cd examples/support-desk && python seed.py --check
```

## Writing skill content

Skills are read by a model under a context budget, so length has a real cost.
Keep `SKILL.md` to the decision path and push procedure, templates, and
edge cases into `references/`, linked from the phase or step that needs them.

Two conventions that carry weight:

- **STOP markers** are hard gates. An agent must not continue past one without
  the stated confirmation. Add them where a wrong guess is expensive, not
  where it is merely annoying.
- **Guardrails** are numbered and referenced by id across files. When you add
  one, update every table that lists it rather than only the nearest.

## Adding a platform engine

Both `forge-init` and `forge-dbx` branch on `platform.engine`. A new engine
needs an adapter section in each, and must declare what it cannot do rather
than approximate it — DuckDB marking `orchestration` engine-unsupported is the
pattern to follow. Anything the adapter fakes becomes a bug report from
someone who trusted the manifest.
