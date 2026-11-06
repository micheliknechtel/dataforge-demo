#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolveWorkspace } from "./workspace.mjs";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr?.trim() || `${command} failed (${result.status})`);
  return result.stdout;
}

const context = resolveWorkspace();
if (!context?.repository) throw new Error("An explicit workspace repository is required");
const repo = context.repository;
function projectRepository(text) {
  const block = `${text}\n`.match(/^project:[ \t]*\r?\n((?:[ \t]+[^\n]*\n|\r?\n)*)/m)?.[1];
  const flow = text.match(/^project:[ \t]*\{([^\n]*)\}[ \t]*$/m)?.[1];
  return (block ?? flow)?.match(/(?:^|[, \t])repository:[ \t]*["']?([\w.-]+\/[\w.-]+)["']?(?=[ \t]*(?:$|,))/m)?.[1];
}
const seed = readFileSync(context.seed, "utf8");
const declared = projectRepository(seed);
if (declared !== repo) throw new Error("Seed repository differs from the workspace allowlist");
if (context.hasResolved) {
  const resolved = readFileSync(context.resolved, "utf8");
  if (projectRepository(resolved) !== repo) {
    throw new Error("Resolved manifest repository differs from the workspace allowlist; refresh forge-init");
  }
}
if (process.env.GH_HOST && process.env.GH_HOST !== "github.com") throw new Error("GH_HOST must be github.com");
if (process.env.GH_REPO && process.env.GH_REPO !== repo) throw new Error("GH_REPO differs from the workspace repository");
const remotes = run("git", ["remote", "get-url", "--all", "origin"], { cwd: context.packageRoot }).trim().split("\n");
const pushRemotes = run("git", ["remote", "get-url", "--push", "--all", "origin"], { cwd: context.packageRoot }).trim().split("\n");
const allowed = new Set([`https://github.com/${repo}.git`, `https://github.com/${repo}`, `git@github.com:${repo}.git`]);
if (![...remotes, ...pushRemotes].every((url) => allowed.has(url))) {
  throw new Error("origin fetch/push must point exclusively at the allowlisted GitHub repository");
}

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "check") {
  run("gh", ["auth", "status", "--hostname", "github.com"]);
  const info = JSON.parse(run("gh", ["repo", "view", repo, "--json", "nameWithOwner,defaultBranchRef"]));
  if (info.nameWithOwner !== repo || !info.defaultBranchRef?.name) throw new Error("Unexpected GitHub repository context");
  console.log(JSON.stringify({ repository: repo, defaultBranch: info.defaultBranchRef.name }, null, 2));
} else {
  const commands = {
    issue: ["view", "list", "create", "comment", "edit", "close", "reopen"],
    label: ["list", "create", "edit"],
    pr: ["view", "list", "create", "comment", "edit", "checks"],
    repo: ["view"],
  };
  if (!commands[args[0]]?.includes(args[1])) throw new Error("Unsupported rehearsal GitHub command");
  for (let i = 2; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--repo" || arg === "-R" || arg.startsWith("--repo=") || arg.startsWith("-R")) {
      throw new Error("Do not supply --repo; the wrapper fixes the destination");
    }
    if (/^https?:\/\//.test(arg) && !arg.startsWith(`https://github.com/${repo}/`)) {
      throw new Error("External GitHub URLs are not allowed");
    }
  }
  if (args[0] === "repo" && args.slice(2).some((arg) => !arg.startsWith("-") && /^[\w.-]+\/[\w.-]+$/.test(arg))) {
    throw new Error("Do not supply a repository positional argument");
  }
  const commandArgs = args[0] === "repo"
    ? ["repo", "view", repo, ...args.slice(2)]
    : [...args, "--repo", repo];
  const result = spawnSync("gh", commandArgs, { cwd: context.projectRoot, stdio: "inherit" });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
