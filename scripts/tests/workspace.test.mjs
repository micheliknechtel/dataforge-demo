import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { packageRoot, resolveWorkspace } from "../workspace.mjs";

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "dataforge-workspace-")));
  mkdirSync(join(root, ".git"));
  mkdirSync(join(root, "assets"));
  mkdirSync(join(root, "example"));
  writeFileSync(join(root, "assets", "dataforge.manifest.yaml"), "generic example");
  writeFileSync(join(root, "example", "dataforge.manifest.yaml"), "project:\n  repository: \"demo/rehearsal\"\n");
  writeFileSync(join(root, "dataforge.workspace.json"), JSON.stringify({
    manifest: "example/dataforge.manifest.yaml", repository: "demo/rehearsal",
  }));
  return root;
}

test("root and nested CWD select the same seed, never the assets example", () => {
  const root = fixture();
  try {
    const a = resolveWorkspace(root);
    const b = resolveWorkspace(join(root, "example"));
    assert.deepEqual(a, b);
    assert.equal(a.seed, join(root, "example", "dataforge.manifest.yaml"));
    assert.equal(a.hasResolved, false);
    writeFileSync(join(root, "assets", "dataforge.manifest.resolved.yaml"), "wrong pair");
    assert.equal(resolveWorkspace(root).hasResolved, false);
    writeFileSync(a.resolved, "right pair");
    assert.equal(resolveWorkspace(root).hasResolved, true);
  } finally { rmSync(root, { recursive: true }); }
});

test("invalid selectors and symlinks cannot silently select another workspace", () => {
  const root = fixture();
  const outside = mkdtempSync(join(tmpdir(), "dataforge-outside-"));
  try {
    writeFileSync(join(root, "dataforge.workspace.json"), JSON.stringify({ manifest: "missing.yaml", repository: "demo/rehearsal" }));
    assert.throws(() => resolveWorkspace(root), /ENOENT/);
    writeFileSync(join(outside, "seed.yaml"), "external");
    symlinkSync(join(outside, "seed.yaml"), join(root, "link.yaml"));
    writeFileSync(join(root, "dataforge.workspace.json"), JSON.stringify({ manifest: "link.yaml", repository: "demo/rehearsal" }));
    assert.throws(() => resolveWorkspace(root), /inside the workspace/);
  } finally { rmSync(root, { recursive: true }); rmSync(outside, { recursive: true }); }
});

test("unconfigured workspaces prefer their seed and stop at the Git boundary", () => {
  const root = fixture();
  try {
    rmSync(join(root, "dataforge.workspace.json"));
    assert.equal(resolveWorkspace(join(root, "example")).projectRoot, join(root, "example"));
    mkdirSync(join(root, "nested"));
    mkdirSync(join(root, "nested", ".git"));
    assert.equal(resolveWorkspace(join(root, "nested")), null);
  } finally { rmSync(root, { recursive: true }); }
});

test("all generated agent and skill links resolve to bundled canonical files", () => {
  for (const name of ["forge-init", "forge-builder", "forge-dbx", "forge-lint"]) {
    for (const file of [
      join(packageRoot, ".github", "agents", `${name}.agent.md`),
      join(packageRoot, ".github", "skills", name, "SKILL.md"),
    ]) {
      for (const match of readFileSync(file, "utf8").matchAll(/\]\(([^)]+)\)/g)) {
        const target = match[1].split("#")[0];
        if (!target || /^https?:/.test(target)) continue;
        assert.ok(existsSync(resolve(dirname(file), target)), `${file}: ${target}`);
      }
    }
  }
});

test("GitHub guard injects only the own repo and rejects overrides, foreign URLs and remotes", () => {
  const root = fixture();
  try {
    mkdirSync(join(root, "scripts"));
    mkdirSync(join(root, "bin"));
    for (const name of ["workspace.mjs", "github.mjs"]) copyFileSync(join(packageRoot, "scripts", name), join(root, "scripts", name));
    writeFileSync(join(root, "bin", "git"), `#!${process.execPath}\nconsole.log(process.env.TEST_REMOTE || "https://github.com/demo/rehearsal.git");\n`, { mode: 0o755 });
    writeFileSync(join(root, "bin", "gh"), `#!${process.execPath}\nconsole.log(JSON.stringify(process.argv.slice(2)));\n`, { mode: 0o755 });
    const run = (args, extra = {}) => spawnSync(process.execPath, [join(root, "scripts", "github.mjs"), ...args], {
      cwd: root, encoding: "utf8", env: { ...process.env, GH_HOST: "github.com", GH_REPO: "demo/rehearsal", PATH: `${join(root, "bin")}:${process.env.PATH}`, ...extra },
    });
    let result = run(["issue", "view", "1"]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), ["issue", "view", "1", "--repo", "demo/rehearsal"]);
    result = run(["repo", "view", "--json", "nameWithOwner"]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), ["repo", "view", "demo/rehearsal", "--json", "nameWithOwner"]);
    for (const args of [
      ["issue", "view", "1", "--repo", "foreign/repo"],
      ["issue", "view", "https://github.com/foreign/repo/issues/1"],
      ["repo", "view", "foreign/repo"],
      ["pr", "merge", "1"],
    ]) assert.notEqual(run(args).status, 0);
    assert.notEqual(run(["issue", "view", "1"], { TEST_REMOTE: "https://github.com/foreign/repo.git" }).status, 0);
    assert.notEqual(run(["issue", "view", "1"], { GH_REPO: "foreign/repo" }).status, 0);
    assert.notEqual(run(["issue", "view", "1"], { GH_HOST: "foreign.example" }).status, 0);
    writeFileSync(join(root, "example", "dataforge.manifest.resolved.yaml"), 'project:\n  repository: "foreign/repo"\n');
    assert.notEqual(run(["issue", "view", "1"]).status, 0);
    writeFileSync(join(root, "example", "dataforge.manifest.resolved.yaml"), 'project: {name: "demo", repository: "demo/rehearsal"}\n');
    assert.equal(run(["issue", "view", "1"]).status, 0);
    writeFileSync(join(root, "example", "dataforge.manifest.resolved.yaml"), 'project:\n  repository: null\nplatform:\n  repository: "demo/rehearsal"\n');
    assert.notEqual(run(["issue", "view", "1"]).status, 0);
  } finally { rmSync(root, { recursive: true }); }
});
