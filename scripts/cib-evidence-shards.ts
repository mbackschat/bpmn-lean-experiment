/**
 * The shards of the retained-CIB-evidence replay and the hand-off of their evidence between hosted jobs.
 *
 * The replay (`replace-cibseven-evidence.ts`) cost one hosted job more than its 20-minute limit as the retained scenarios
 * grew (Verify run 43375697737, after 15.5 minutes in run 43370273960), so each shard replays its own deterministic part
 * of the cases in a job of its own. A shard stages the evidence files of its part under `shard-<i>-of-<n>/`; the consumers
 * (the runtime job of the same run and `cib-evidence-branch.yml`) install every shard's files into one tree.
 *
 * Usage: `node scripts/cib-evidence-shards.ts stage <i>/<n> <directory>` or `... install <directory>`.
 *
 * Rule 2 declaration of `install`, the only command that writes repository files:
 *   scope: exactly the `*cibseven-evidence.json` files of `oracleEvidenceCases` and `populationEvidenceCases` that the
 *   downloaded shard directories hold; it never touches any other file and refuses a shard directory that holds one.
 *   target effect: at most one file per evidence case; the shard set is validated whole before the first file is written.
 */
import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { populationEvidenceCases } from "./cibseven-population-evidence.ts";
import type { PopulationEvidenceCase } from "./cibseven-population-evidence.ts";
import { oracleEvidenceCases } from "./contract-artifact-cases.ts";
import type { ArtifactCase } from "./contract-artifact-cases.ts";
import { compareCanonicalStrings } from "./strict-json.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

/** Shard `index` of `count`, 1-based. */
export type Shard = Readonly<{ index: number; count: number }>;

const shardText = /^([1-9][0-9]*)\/([1-9][0-9]*)$/u;
const shardDirectoryName = /^shard-([1-9][0-9]*)-of-([1-9][0-9]*)$/u;

export function parseShard(text: string): Shard {
  const match = shardText.exec(text);
  const index = Number(match?.[1]);
  const count = Number(match?.[2]);
  if (match === null || !Number.isSafeInteger(index) || !Number.isSafeInteger(count) || index > count) {
    throw new Error(`--shard needs <i>/<n> with 1 <= i <= n, both positive integers without leading zeros, not ${JSON.stringify(text)}`);
  }
  return { index, count };
}

/**
 * The items of one shard: sorted by key and dealt round-robin, so the partition depends on no input order and neighbours of
 * one family, which tend to cost alike, land in different shards instead of one shard taking a whole expensive family.
 */
export function selectShard<Item>(items: ReadonlyArray<Item>, key: (item: Item) => string, shard: Shard): ReadonlyArray<Item> {
  return [...items]
    .sort((left, right) => compareCanonicalStrings(key(left), key(right)))
    .filter((_, position) => position % shard.count === shard.index - 1);
}

export type ShardCases = Readonly<{
  scenarios: ReadonlyArray<ArtifactCase>;
  populations: ReadonlyArray<PopulationEvidenceCase>;
}>;

/** The cases a replay covers: all of them without a shard, else the shard's part of the scenarios and of the populations. */
export function shardCases(shard: Shard | undefined): ShardCases {
  const populations = populationEvidenceCases(projectRoot);
  if (shard === undefined) return { scenarios: oracleEvidenceCases, populations };
  const byScenario = ({ scenarioRelativePath }: Readonly<{ scenarioRelativePath: string }>): string => scenarioRelativePath;
  return { scenarios: selectShard(oracleEvidenceCases, byScenario, shard), populations: selectShard(populations, byScenario, shard) };
}

/** The evidence files a shard's replay may write, as repository-relative paths. */
export function shardEvidencePaths(shard: Shard): ReadonlyArray<string> {
  const { scenarios, populations } = shardCases(shard);
  return [...scenarios, ...populations].map(({ evidenceRelativePath }) => evidenceRelativePath);
}

const shardDirectory = ({ index, count }: Shard): string => `shard-${String(index)}-of-${String(count)}`;

/**
 * Copies the evidence files of `shard` that exist under `sourceRoot` into `<outputRoot>/shard-<i>-of-<n>/`, at their
 * repository-relative paths, and returns how many. A scenario the replay could not run keeps whatever file it had, and a
 * new one has none; neither blocks the hand-off, which is what an unsharded replay's upload carried as well.
 */
export async function stageShardEvidence(shard: Shard, sourceRoot: string, outputRoot: string): Promise<number> {
  let staged = 0;
  for (const relativePath of shardEvidencePaths(shard)) {
    const source = path.join(sourceRoot, relativePath);
    if (!existsSync(source)) continue;
    const target = path.join(outputRoot, shardDirectory(shard), relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(source, target);
    staged += 1;
  }
  if (staged === 0) throw new Error(`shard ${String(shard.index)} of ${String(shard.count)} has no evidence file to stage`);
  return staged;
}

type DownloadedShard = Readonly<{ shard: Shard; directory: string }>;

/**
 * The shard directories of a download: directly under it, or one level down, where `gh run download` puts each
 * artifact when several were fetched.
 */
async function downloadedShards(downloadRoot: string): Promise<ReadonlyArray<DownloadedShard>> {
  const found: DownloadedShard[] = [];
  const collect = async (directory: string, descend: boolean): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const entryPath = path.join(directory, entry.name);
      const match = shardDirectoryName.exec(entry.name);
      if (match !== null) found.push({ shard: { index: Number(match[1]), count: Number(match[2]) }, directory: entryPath });
      else if (descend) await collect(entryPath, false);
    }
  };
  await collect(downloadRoot, true);
  return found;
}

async function filesUnder(directory: string): Promise<ReadonlyArray<string>> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile())
    .map((entry) => path.relative(directory, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"))
    .sort(compareCanonicalStrings);
}

/**
 * Installs the evidence of every shard under `downloadRoot` into `targetRoot` and returns how many files it wrote. The set
 * must be exactly shards 1 to n of one count, each shard once, and each shard may hold only files of its own partition,
 * which makes the installed files disjoint by construction; any breach throws before the first file is written, so a lost
 * shard artifact never produces a partial evidence commit.
 */
export async function installShardEvidence(downloadRoot: string, targetRoot: string): Promise<number> {
  const downloaded = await downloadedShards(downloadRoot);
  if (downloaded.length === 0) throw new Error(`no shard-<i>-of-<n> directory under ${downloadRoot}`);
  const counts = [...new Set(downloaded.map(({ shard }) => shard.count))].sort((left, right) => left - right);
  if (counts.length !== 1) throw new Error(`shard artifacts disagree on the shard count: ${counts.join(", ")}`);
  const count = counts[0]!;
  for (let index = 1; index <= count; index += 1) {
    const arrivals = downloaded.filter(({ shard }) => shard.index === index).length;
    if (arrivals === 0) throw new Error(`shard ${String(index)} of ${String(count)} is missing`);
    if (arrivals > 1) throw new Error(`shard ${String(index)} of ${String(count)} arrives twice`);
  }
  const copies: Array<Readonly<{ from: string; to: string }>> = [];
  for (const { shard, directory } of downloaded) {
    const own = new Set(shardEvidencePaths(shard));
    for (const relativePath of await filesUnder(directory)) {
      if (!own.has(relativePath)) {
        throw new Error(`shard ${String(shard.index)} of ${String(shard.count)} holds ${relativePath}, which is not one of its evidence files`);
      }
      copies.push({ from: path.join(directory, relativePath), to: path.join(targetRoot, relativePath) });
    }
  }
  for (const { from, to } of copies) {
    await mkdir(path.dirname(to), { recursive: true });
    await copyFile(from, to);
  }
  return copies.length;
}

const invokedPath = process.argv[1] && path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  const [command, first, second, ...extra] = process.argv.slice(2);
  if (command === "stage" && first !== undefined && second !== undefined && extra.length === 0) {
    const shard = parseShard(first);
    const staged = await stageShardEvidence(shard, projectRoot, path.resolve(second));
    process.stdout.write(`staged ${String(staged)} evidence files of shard ${first}\n`);
  } else if (command === "install" && first !== undefined && second === undefined) {
    const installed = await installShardEvidence(path.resolve(first), projectRoot);
    process.stdout.write(`installed ${String(installed)} evidence files\n`);
  } else {
    throw new Error("usage: cib-evidence-shards.ts stage <i>/<n> <directory> | install <directory>");
  }
}
