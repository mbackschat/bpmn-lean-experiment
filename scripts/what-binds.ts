/**
 * Enumerates the implementation maps, executable guards, and registries that constrain a path.
 *
 * A passing gate suite says nothing about which of its oracles will judge the *next* change. Guards in
 * this repository constrain artifact shape by tree as often as by file — an exact-multiset example
 * oracle, a registry-reachability check, a module-size ceiling — so a plan written from memory can
 * name a change site whose bound it never read, and the bound then surfaces mid-edit.
 *
 * This is a planning report rather than a product gate. Its implementation-map route fails closed,
 * while guard and registry discovery is biased toward recall: a term such as `scenarios` also matches
 * that word in prose. Over-reporting costs a line of reading; under-reporting costs discarded work.
 *
 * Usage: `node scripts/what-binds.ts <path>...`
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { compareCanonicalStrings } from "../packages/semantic-core/src/wire.ts";
import {
  headroomDescription,
  isHandWrittenSourcePath,
  nonblankLines,
  type SourceMeasurement,
} from "./source-measure.ts";
import {
  assertCanonicalRepositoryPath,
  implementationMapRoutes,
} from "./document-control-plane.ts";
import { parseImplementationMapDirectory } from "./structural-map-routes.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const runCommand = promisify(execFile);

export const BindingKind = {
  /** An executable oracle whose assertions can reject the planned shape. */
  Guard: "GUARD",
  /** An index with a same-change obligation when the tree gains or loses a member. */
  Registry: "REGISTRY",
} as const;

export type BindingKind = typeof BindingKind[keyof typeof BindingKind];

export type CorpusFile = Readonly<{
  path: string;
  text: string;
}>;

export type Binding = Readonly<{
  kind: BindingKind;
  path: string;
  /** The most specific search term that reached this file. */
  matchedTerm: string;
}>;

export type ChangeBindings = Readonly<{
  target: string;
  owner: SourceMeasurement | null;
  bindings: ReadonlyArray<Binding>;
}>;

/**
 * Terms from most to least specific: the exact path, its basename, then each ancestor tree.
 *
 * Ancestor trees are essential rather than a convenience. A file that does not exist yet cannot be
 * named by any guard, so the tree it will join is the only term that can reach its constraints.
 */
export function searchTerms(target: string): ReadonlyArray<string> {
  assertCanonicalRepositoryPath(target);
  const segments = target.split("/");
  const basename = segments[segments.length - 1] ?? target;
  const ancestors = segments
    .slice(0, -1)
    .map((_, index) => segments.slice(0, index + 1).join("/"))
    .reverse();
  return [...new Set([target, basename, ...ancestors])];
}

/**
 * Every executable-guard filename suffix this repository uses.
 *
 * Every suffix is matched because a guard's suffix records which lane runs it, never whether it
 * constrains a change. Recognising only `.test.ts` hid seventeen guards, and one of them pins the
 * exact text of the root commands, so a change to those commands could be planned without ever
 * being told about it.
 */
const guardSuffixPattern = /\.(?:test|platform-test|temporal-test|temporal-serial-test)\.ts$/u;

function corpusKind(candidate: string): BindingKind | null {
  if (guardSuffixPattern.test(candidate)) {
    return BindingKind.Guard;
  }
  // Only registries, never every document mentioning the tree: a README and a source map each carry
  // the same-change obligation, while ordinary prose mentioning a directory places no requirement on
  // the change. A source map assigns ownership member by member, so a tree that gains a source file
  // and leaves its map alone has silently dropped that file from the index that exists to claim it.
  const registryNames = new Set(["README.md", "SOURCE-MAP.md"]);
  return registryNames.has(path.basename(candidate)) ? BindingKind.Registry : null;
}

/**
 * The term reaching one corpus file, or `undefined` when it places no requirement on the target.
 *
 * The two kinds are matched differently on purpose. A guard constrains whatever its assertions name,
 * so only its text can say whether it reaches the target. A registry's obligation instead comes from
 * where it sits: `scenarios/README.md` indexes the `scenarios` tree whether or not its prose happens
 * to spell the directory. Matching a registry by text misses exactly the case that matters, an index
 * that describes its members in its own words.
 */
function matchedTerm(
  kind: BindingKind,
  file: CorpusFile,
  terms: ReadonlyArray<string>,
): string | undefined {
  switch (kind) {
    case BindingKind.Guard:
      return terms.find((term) => file.text.includes(term));
    case BindingKind.Registry: {
      const registryTree = path.dirname(file.path);
      // The repository-root README is a durable front door barred from live inventories, so it
      // carries no same-change obligation for an artifact and would otherwise match every target.
      return registryTree === "." || registryTree === ""
        ? undefined
        : terms.find((term) => term === registryTree);
    }
  }
}

export function bindingsFor(
  target: string,
  corpus: ReadonlyArray<CorpusFile>,
): ReadonlyArray<Binding> {
  const terms = searchTerms(target);
  return corpus
    .flatMap((file) => {
      const kind = corpusKind(file.path);
      if (kind === null || file.path === target) {
        return [];
      }
      const term = matchedTerm(kind, file, terms);
      return term === undefined
        ? []
        : [{ kind, path: file.path, matchedTerm: term }];
    })
    .sort((left, right) =>
      left.kind === right.kind
        ? compareCanonicalStrings(left.path, right.path)
        : compareCanonicalStrings(left.kind, right.kind)
    );
}

export function ownerMeasurement(
  target: string,
  source: string | null,
): SourceMeasurement | null {
  assertCanonicalRepositoryPath(target);
  return source === null || !isHandWrittenSourcePath(target)
    ? null
    : { path: target, lines: nonblankLines(source) };
}

export function presentBindingCorpusCandidates(
  candidates: ReadonlyArray<string>,
  isPresent: (candidate: string) => boolean,
): ReadonlyArray<string> {
  return candidates
    .filter((candidate) => corpusKind(candidate) !== null)
    .filter(isPresent);
}

function counted(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function reportLines(
  result: ChangeBindings,
): ReadonlyArray<string> {
  const ofKind = (kind: BindingKind): number =>
    result.bindings.filter((binding) => binding.kind === kind).length;
  return [
    `TARGET ${result.target}`,
    ...(result.owner === null
      ? []
      : [`OWNER ${result.owner.path} ${headroomDescription(result.owner.lines)}`]),
    ...result.bindings.map(({ kind, path: bindingPath, matchedTerm }) =>
      `${kind} ${bindingPath} (matched ${JSON.stringify(matchedTerm)})`
    ),
    `BINDINGS ${counted(ofKind(BindingKind.Guard), "guard", "guards")}, ${
      counted(ofKind(BindingKind.Registry), "registry", "registries")
    }`,
  ];
}

/** Tracked guard and registry files, read once so several targets share one scan. */
export async function loadBindingCorpus(): Promise<ReadonlyArray<CorpusFile>> {
  const { stdout } = await runCommand(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard"],
    { cwd: projectRoot, maxBuffer: 16 * 1024 * 1024 },
  );
  const candidates = presentBindingCorpusCandidates(
    stdout.split("\n"),
    (candidate) => existsSync(path.join(projectRoot, candidate)),
  );
  return Promise.all(
    candidates.map(async (candidate) => ({
      path: candidate,
      text: await readFile(path.join(projectRoot, candidate), "utf8"),
    })),
  );
}

async function readIfPresent(target: string): Promise<string | null> {
  try {
    return await readFile(path.join(projectRoot, target), "utf8");
  } catch {
    return null;
  }
}

async function main(targets: ReadonlyArray<string>): Promise<void> {
  if (targets.length === 0) {
    process.stderr.write("usage: node scripts/what-binds.ts <path>...\n");
    process.exitCode = 2;
    return;
  }
  for (const target of targets) assertCanonicalRepositoryPath(target);
  const corpus = await loadBindingCorpus();
  const rootMap = await readFile(path.join(projectRoot, "docs/IMPLEMENTATION-MAP.md"), "utf8");
  const parsedDirectory = parseImplementationMapDirectory(rootMap);
  if (parsedDirectory.errors.length > 0) {
    throw new Error(parsedDirectory.errors.join("\n"));
  }
  for (const target of targets) {
    const bindingLines = reportLines({
      target,
      owner: ownerMeasurement(target, await readIfPresent(target)),
      bindings: bindingsFor(target, corpus),
    });
    const [targetLine, ...remainingLines] = bindingLines;
    const lines = [
      targetLine,
      ...implementationMapRoutes(target, parsedDirectory.directory).map(({ id, file }) =>
        `MAP ${id} ${file}`
      ),
      ...remainingLines,
    ];
    process.stdout.write(`${lines.join("\n")}\n`);
  }
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  try {
    await main(process.argv.slice(2));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`WHAT_BINDS_ERROR ${message}\n`);
    process.exitCode = 1;
  }
}
