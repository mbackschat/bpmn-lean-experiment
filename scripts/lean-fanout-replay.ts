/**
 * Replays ordinary semantic commits against the fan-out model of the checked-out tree, the measure of the
 * [build modularity residual](../docs/LEAN-BUILD-MODULARITY-SPEC.md#current-boundary) that
 * [`lean-fanout-replay-residual.test.ts`](lean-fanout-replay-residual.test.ts) ratchets.
 *
 * The sample is fixed by its anchor: the `count` most recent commits reachable from the anchor whose Conventional
 * type is `feat` or `fix` and that add or modify between 1 and 100 files under `BpmnSemantics/`. Each such file that
 * is a module of today's graph counts as a body edit, so a commit costs the modules both library roots build that
 * its edited modules and their body-edit importers reach, and the recorded serial seconds
 * ([`lean-module-cost.ts`](lean-module-cost.ts)) of the fixtures among them. Interface edits cost more and proof-only
 * edits less, so the replay compares trees, not commits. Owner decision 1's target (mean 118, p90 490) came from a
 * replay whose method was not recorded and cannot be reproduced; this script exists so that the next comparison can be.
 *
 * Usage: node scripts/lean-fanout-replay.ts [--anchor 2d8db0e7] [--count 67] [--universe <commit>]
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { leanBodyEditFanouts, leanLibraryModules, parseRealizedLeaks } from "./lean-fanout.ts";
import { leanModuleCostRecord } from "./lean-module-cost.ts";
import { worktreeLeanSourceFiles } from "./lean-source-analysis.ts";
import { readWorktreeSources } from "./worktree-source-read.ts";

/** The modules an edit of `edited` rebuilds: each edited module and its body-edit importers, counted once. */
function rebuiltModules(edited: ReadonlyArray<string>, fanouts: ReadonlyMap<string, ReadonlyArray<string>>): Set<string> {
  const rebuilt = new Set<string>();
  for (const module of edited) {
    const importers = fanouts.get(module);
    if (importers === undefined) continue;
    for (const candidate of [module, ...importers]) rebuilt.add(candidate);
  }
  return rebuilt;
}

/** The built modules an edit of `edited` rebuilds: each edited module and its body-edit importers, counted once. */
export function replayCommitCost(edited: ReadonlyArray<string>, fanouts: ReadonlyMap<string, ReadonlyArray<string>>,
  built: ReadonlySet<string>): number {
  return [...rebuiltModules(edited, fanouts)].filter((module) => built.has(module)).length;
}

/** The recorded serial seconds of the fixtures an edit of `edited` rebuilds; a module without a cost row adds none. */
export function replayCommitFixtureSeconds(edited: ReadonlyArray<string>,
  fanouts: ReadonlyMap<string, ReadonlyArray<string>>, seconds: ReadonlyMap<string, number>): number {
  return [...rebuiltModules(edited, fanouts)].reduce((sum, module) => sum + (seconds.get(module) ?? 0), 0);
}

/** The recorded fixtures an edit of `edited` rebuilds, counted once each. */
export function replayCommitFixtures(edited: ReadonlyArray<string>, fanouts: ReadonlyMap<string, ReadonlyArray<string>>,
  fixtures: ReadonlySet<string>): number {
  return [...rebuiltModules(edited, fanouts)].filter((module) => fixtures.has(module)).length;
}

export type ReplayStatistics = { commits: number; mean: number; p50: number; p90: number; max: number; above500: number };

export type ReplayFixtureStatistics = { median: number; p90: number; above900: number };

/** The nearest-rank percentile of an ascending list. */
function nearestRank(sorted: ReadonlyArray<number>, quantile: number): number {
  return sorted[Math.ceil(quantile * sorted.length) - 1]!;
}

/** Mean to one decimal and nearest-rank percentiles of the per-commit costs. */
export function replayStatistics(costs: ReadonlyArray<number>): ReplayStatistics {
  const sorted = [...costs].sort((left, right) => left - right);
  const mean = Math.round((sorted.reduce((sum, cost) => sum + cost, 0) / sorted.length) * 10) / 10;
  return { commits: sorted.length, mean, p50: nearestRank(sorted, 0.5), p90: nearestRank(sorted, 0.9), max: sorted.at(-1)!, above500: sorted.filter((cost) => cost > 500).length };
}

/** Whole-second nearest-rank percentiles of the per-commit fixture seconds and the commits above contract item 5's 900. */
export function replayFixtureStatistics(seconds: ReadonlyArray<number>): ReplayFixtureStatistics {
  const sorted = [...seconds].sort((left, right) => left - right);
  return { median: Math.round(nearestRank(sorted, 0.5)), p90: Math.round(nearestRank(sorted, 0.9)), above900: sorted.filter((cost) => cost > 900).length };
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

export type ReplayResidual = {
  builtModules: number; modules: ReplayStatistics; fixtures: ReplayStatistics; fixtureSeconds: ReplayFixtureStatistics;
};

/** The modules of `commit`'s tree, the two library roots included, by the module name each source file declares. */
function modulesAt(commit: string): Set<string> {
  return new Set(git("ls-tree", "-r", "--name-only", commit, "--", "BpmnSemantics", "BpmnSemantics.lean", "BpmnConformance.lean")
    .trim().split("\n")
    .filter((file) => file.endsWith(".lean")).map((file) => file.slice(0, -".lean".length).replaceAll("/", ".")));
}

/**
 * The replay of the checked-out tree: per-commit rebuilt modules, fixtures and fixture seconds over the fixed sample,
 * counting only built modules and, given a `universe` commit, only the modules that existed there, so that a module
 * added since is left to the per-module fan-out bounds instead of moving these aggregates.
 */
export function measureReplayResidual(anchor = "2d8db0e7", count = 67, universe?: string): ReplayResidual {
  const sources = readWorktreeSources(worktreeLeanSourceFiles().filter((file) => file.startsWith("BpmnSemantics/") || !file.includes("/")));
  const leaks = parseRealizedLeaks(readFileSync("scripts/lean-realized-leaks.tsv", "utf8"));
  const fanouts = leanBodyEditFanouts(sources, leaks);
  const scope = universe === undefined ? undefined : modulesAt(universe);
  const built = new Set([...leanLibraryModules(sources, "BpmnSemantics"), ...leanLibraryModules(sources, "BpmnConformance")]
    .filter((module) => scope === undefined || scope.has(module)));
  const seconds = new Map(leanModuleCostRecord.rows.filter((row) => built.has(row.module))
    .map((row) => [row.module, row.elapsedSeconds] as const));
  const sample = replaySample(anchor, count);
  return {
    builtModules: built.size,
    modules: replayStatistics(sample.map(({ modules }) => replayCommitCost(modules, fanouts, built))),
    fixtures: replayStatistics(sample.map(({ modules }) => replayCommitFixtures(modules, fanouts, new Set(seconds.keys())))),
    fixtureSeconds: replayFixtureStatistics(sample.map(({ modules }) => replayCommitFixtureSeconds(modules, fanouts, seconds))),
  };
}

function main(): void {
  const args = process.argv.slice(2);
  const option = (name: string, fallback: string) => {
    const index = args.indexOf(name);
    return index === -1 ? fallback : args[index + 1] ?? fallback;
  };
  const anchor = option("--anchor", "2d8db0e7");
  const universe = args.includes("--universe") ? option("--universe", "") : undefined;
  console.log(JSON.stringify({ anchor, universe, ...measureReplayResidual(anchor, Number(option("--count", "67")), universe) }));
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && path.resolve(invokedPath) === fileURLToPath(import.meta.url)) main();
