/**
 * Replays ordinary semantic commits against the fan-out model of the checked-out tree, the measure of the
 * [build modularity residual](../docs/LEAN-BUILD-MODULARITY-SPEC.md#current-boundary) and of the hub fix
 * that [PLAN](../docs/PLAN.md#lean-build-follow-ups) schedules against it.
 *
 * The sample is fixed by its anchor: the `count` most recent commits reachable from the anchor whose Conventional
 * type is `feat` or `fix` and that add or modify between 1 and 100 files under `BpmnSemantics/`. Each such file that
 * is a module of today's graph counts as a body edit, so a commit costs the modules both library roots build that
 * its edited modules and their body-edit importers reach. Interface edits cost more and proof-only edits less, so
 * the replay compares trees, not commits. Owner decision 1's target (mean 118, p90 490) came from a replay whose
 * method was not recorded and cannot be reproduced; this script exists so that the next comparison can be.
 *
 * Usage: node scripts/lean-fanout-replay.ts [--anchor 2d8db0e7] [--count 67]
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { leanBodyEditFanouts, leanLibraryModules, parseRealizedLeaks } from "./lean-fanout.ts";
import { worktreeLeanSourceFiles } from "./lean-source-analysis.ts";
import { readWorktreeSources } from "./worktree-source-read.ts";

/** The built modules an edit of `edited` rebuilds: each edited module and its body-edit importers, counted once. */
export function replayCommitCost(edited: ReadonlyArray<string>, fanouts: ReadonlyMap<string, ReadonlyArray<string>>,
  built: ReadonlySet<string>): number {
  const rebuilt = new Set<string>();
  for (const module of edited) {
    const importers = fanouts.get(module);
    if (importers === undefined) continue;
    for (const candidate of [module, ...importers]) if (built.has(candidate)) rebuilt.add(candidate);
  }
  return rebuilt.size;
}

export type ReplayStatistics = { commits: number; mean: number; p50: number; p90: number; max: number; above500: number };

/** Mean to one decimal and nearest-rank percentiles of the per-commit costs. */
export function replayStatistics(costs: ReadonlyArray<number>): ReplayStatistics {
  const sorted = [...costs].sort((left, right) => left - right);
  const rank = (quantile: number) => sorted[Math.ceil(quantile * sorted.length) - 1]!;
  const mean = Math.round((sorted.reduce((sum, cost) => sum + cost, 0) / sorted.length) * 10) / 10;
  return { commits: sorted.length, mean, p50: rank(0.5), p90: rank(0.9), max: sorted.at(-1)!, above500: sorted.filter((cost) => cost > 500).length };
}

function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 1 << 28 });
}

/** The fixed sample: commits with the Lean files each adds or modifies. */
function replaySample(anchor: string, count: number): { commit: string; modules: string[] }[] {
  const sample: { commit: string; modules: string[] }[] = [];
  for (const line of git("log", "--format=%h %s", "--no-merges", anchor, "--", "BpmnSemantics").trim().split("\n")) {
    const [commit, ...subject] = line.split(" ");
    if (!/^(feat|fix)[(!:]/u.test(subject.join(" "))) continue;
    const files = git("diff-tree", "--no-commit-id", "-r", "--diff-filter=AM", "--name-only", commit!, "--", "BpmnSemantics")
      .trim().split("\n").filter((file) => file.endsWith(".lean"));
    if (files.length === 0 || files.length > 100) continue;
    sample.push({ commit: commit!, modules: files.map((file) => file.slice(0, -".lean".length).replaceAll("/", ".")) });
    if (sample.length === count) break;
  }
  return sample;
}

function main(): void {
  const args = process.argv.slice(2);
  const option = (name: string, fallback: string) => {
    const index = args.indexOf(name);
    return index === -1 ? fallback : args[index + 1] ?? fallback;
  };
  const anchor = option("--anchor", "2d8db0e7");
  const count = Number(option("--count", "67"));
  const sources = readWorktreeSources(worktreeLeanSourceFiles().filter((file) => file.startsWith("BpmnSemantics/") || !file.includes("/")));
  const leaks = parseRealizedLeaks(readFileSync("scripts/lean-realized-leaks.tsv", "utf8"));
  const fanouts = leanBodyEditFanouts(sources, leaks);
  const built = new Set([...leanLibraryModules(sources, "BpmnSemantics"), ...leanLibraryModules(sources, "BpmnConformance")]);
  const sample = replaySample(anchor, count);
  const costs = sample.map(({ modules }) => replayCommitCost(modules, fanouts, built));
  console.log(JSON.stringify({ anchor, builtModules: built.size, ...replayStatistics(costs) }));
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && path.resolve(invokedPath) === fileURLToPath(import.meta.url)) main();
