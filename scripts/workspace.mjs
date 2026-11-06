import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function resolveWorkspace(start = process.cwd()) {
  const ancestors = [];
  for (let dir = resolve(start); ; dir = dirname(dir)) {
    ancestors.push(dir);
    if (existsSync(join(dir, ".git")) || dirname(dir) === dir) break;
  }
  const owner = ancestors.find((dir) => existsSync(join(dir, "dataforge.workspace.json")));
  let seed;
  let repository = null;
  if (owner) {
    const config = JSON.parse(readFileSync(join(owner, "dataforge.workspace.json"), "utf8"));
    if (typeof config.manifest !== "string" || isAbsolute(config.manifest)) {
      throw new Error("dataforge.workspace.json requires a relative manifest path");
    }
    seed = realpathSync(resolve(owner, config.manifest));
    const path = relative(realpathSync(owner), seed);
    if (path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path)) {
      throw new Error("The selected manifest must stay inside the workspace");
    }
    if (typeof config.repository !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(config.repository)) {
      throw new Error("dataforge.workspace.json requires repository in owner/name form");
    }
    repository = config.repository;
  } else {
    for (const dir of ancestors) {
      seed = [join(dir, "dataforge.manifest.yaml"), join(dir, "assets", "dataforge.manifest.yaml")]
        .find(existsSync);
      if (seed) break;
    }
    if (!seed) return null;
    seed = realpathSync(seed);
  }
  const resolved = join(dirname(seed), "dataforge.manifest.resolved.yaml");
  const projectRoot = dirname(seed).endsWith(`${sep}assets`) ? dirname(dirname(seed)) : dirname(seed);
  return { packageRoot, projectRoot, seed, resolved, hasResolved: existsSync(resolved), repository };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const context = resolveWorkspace();
  if (!context) throw new Error("No project manifest found; initialize the workspace configuration first");
  console.log(JSON.stringify(context, null, 2));
}
