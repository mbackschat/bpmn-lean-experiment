/**
 * Enumerates the implementation maps, executable guards, and registries that constrain a path.
 *
 * A passing gate suite says nothing about which of its oracles will judge the *next* change. Guards in
 * this repository constrain artifact shape by tree as often as by file — an exact-multiset example
 * oracle, a registry-reachability check, a module-size ceiling — so a plan written from memory can
 * name a change site whose bound it never read, and the bound then surfaces mid-edit.
 *
 * This is a planning report rather than a product gate. Its implementation-map route fails closed.
 * A guard is reported as a named binding (it names or imports the path), as a scanning guard (it
 * enumerates a file set containing the path), or only counted as an unbound mention; the tier
 * decisions live in {@link classifyGuard}. A registry is reported for the tree it indexes.
 *
 * Usage: `node scripts/what-binds.ts [--mentions] <path>...`
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { compareCanonicalStrings } from "../packages/semantic-core/src/wire.ts";
import {
  classifyGuard,
  describeEvidence,
  evidenceStrength,
  type GuardEvidence,
  GuardTier,
  isGuardPath,
  searchTerms,
  targetProfile,
} from "./what-binds-classification.ts";
import {
  type CorpusFile,
  indexCorpus,
  isImportGraphModule,
} from "./what-binds-source-facts.ts";
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

export type { CorpusFile };
export { searchTerms };

/** A tier that makes a guard a binding; a mention never does. */
export type BindingTier = typeof GuardTier.Named | typeof GuardTier.Scanning;

export type Binding =
  | Readonly<{
    kind: typeof BindingKind.Guard;
    tier: BindingTier;
    path: string;
    evidence: GuardEvidence;
  }>
  | Readonly<{
    kind: typeof BindingKind.Registry;
    path: string;
    /** The tree term this registry indexes. */
    matchedTerm: string;
  }>;

/** A guard whose text matches only a name or tree word: reported as a count, never as a binding. */
export type UnboundMention = Readonly<{
  path: string;
  evidence: GuardEvidence;
}>;

export type ChangeBindings = Readonly<{
  target: string;
  owner: SourceMeasurement | null;
  bindings: ReadonlyArray<Binding>;
  mentions: ReadonlyArray<UnboundMention>;
}>;

function corpusKind(candidate: string): BindingKind | null {
  if (isGuardPath(candidate)) {
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
 * The tree term a registry indexes, or `undefined` when it places no requirement on the target.
 *
 * A registry's obligation comes from where it sits: `scenarios/README.md` indexes the `scenarios`
 * tree whether or not its prose happens to spell the directory. Matching it by text would miss
 * exactly the case that matters, an index that describes its members in its own words.
 */
function registryTerm(file: CorpusFile, terms: ReadonlyArray<string>): string | undefined {
  const registryTree = path.dirname(file.path);
  // The repository-root README is a durable front door barred from live inventories, so it
  // carries no same-change obligation for an artifact and would otherwise match every target.
  return registryTree === "." || registryTree === ""
    ? undefined
    : terms.find((term) => term === registryTree);
}

function compareBindings(left: Binding, right: Binding): number {
  if (left.kind !== right.kind) {
    return compareCanonicalStrings(left.kind, right.kind);
  }
  const strength = left.kind === BindingKind.Guard && right.kind === BindingKind.Guard
    ? evidenceStrength(left.evidence) - evidenceStrength(right.evidence)
    : 0;
  return strength !== 0 ? strength : compareCanonicalStrings(left.path, right.path);
}

/**
 * Classifies every corpus file against the target in one pass: guards into named and scanning
 * bindings or unbound mentions, registries into bindings by the tree they index.
 */
export function classifyBindings(
  target: string,
  corpus: ReadonlyArray<CorpusFile>,
): Readonly<{ bindings: ReadonlyArray<Binding>; mentions: ReadonlyArray<UnboundMention> }> {
  const profile = targetProfile(target);
  const index = indexCorpus(corpus);
  const bindings: Binding[] = [];
  const mentions: UnboundMention[] = [];
  for (const file of corpus) {
    const kind = corpusKind(file.path);
    if (kind === null || file.path === target) {
      continue;
    }
    switch (kind) {
      case BindingKind.Guard: {
        const classification = classifyGuard(profile, file, index);
        if (classification === null) {
          break;
        }
        if (classification.tier === GuardTier.Mention) {
          mentions.push({ path: file.path, evidence: classification.evidence });
        } else {
          bindings.push({
            kind,
            tier: classification.tier,
            path: file.path,
            evidence: classification.evidence,
          });
        }
        break;
      }
      case BindingKind.Registry: {
        const matchedTerm = registryTerm(file, profile.mentionTerms);
        if (matchedTerm !== undefined) {
          bindings.push({ kind, path: file.path, matchedTerm });
        }
        break;
      }
    }
  }
  return {
    bindings: bindings.sort(compareBindings),
    mentions: mentions.sort((left, right) => compareCanonicalStrings(left.path, right.path)),
  };
}

export function bindingsFor(
  target: string,
  corpus: ReadonlyArray<CorpusFile>,
): ReadonlyArray<Binding> {
  return classifyBindings(target, corpus).bindings;
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

/**
 * Guards and registries are what is reported; every other TypeScript source is read only so import
 * chains and imported enumeration helpers can be followed.
 */
export function presentBindingCorpusCandidates(
  candidates: ReadonlyArray<string>,
  isPresent: (candidate: string) => boolean,
): ReadonlyArray<string> {
  return candidates
    .filter((candidate) => corpusKind(candidate) !== null || isImportGraphModule(candidate))
    .filter(isPresent);
}

function counted(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function describeBinding(binding: Binding): string {
  switch (binding.kind) {
    case BindingKind.Guard:
      return `${binding.kind}[${binding.tier}] ${binding.path} (${describeEvidence(binding.evidence)})`;
    case BindingKind.Registry:
      return `${binding.kind} ${binding.path} (matched ${JSON.stringify(binding.matchedTerm)})`;
  }
}

/**
 * The report body for one target. Mentions are always counted but listed only on request, because
 * a directory word such as `scripts` matches most guards and a list of them would bury the bindings.
 */
export function reportLines(
  result: ChangeBindings,
  options: Readonly<{ listMentions: boolean }> = { listMentions: false },
): ReadonlyArray<string> {
  const guards = result.bindings.filter((binding) => binding.kind === BindingKind.Guard);
  const ofTier = (tier: BindingTier): number =>
    guards.filter((binding) => binding.kind === BindingKind.Guard && binding.tier === tier).length;
  const registries = result.bindings.length - guards.length;
  return [
    `TARGET ${result.target}`,
    ...(result.owner === null
      ? []
      : [`OWNER ${result.owner.path} ${headroomDescription(result.owner.lines)}`]),
    ...result.bindings.map(describeBinding),
    ...(options.listMentions
      ? result.mentions.map(({ path: mentionPath, evidence }) =>
        `MENTION ${mentionPath} (${describeEvidence(evidence)})`
      )
      : []),
    `BINDINGS ${counted(guards.length, "guard", "guards")} (${ofTier(GuardTier.Named)} named, ${
      ofTier(GuardTier.Scanning)
    } scanning), ${counted(registries, "registry", "registries")}, ${
      counted(result.mentions.length, "unbound mention", "unbound mentions")
    } (not bindings)`,
  ];
}

/** Tracked guard, registry and TypeScript source files, read once so several targets share one scan. */
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

async function main(args: ReadonlyArray<string>): Promise<void> {
  const listMentions = args.includes("--mentions");
  const targets = args.filter((arg) => arg !== "--mentions");
  if (targets.length === 0) {
    process.stderr.write("usage: node scripts/what-binds.ts [--mentions] <path>...\n");
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
      ...classifyBindings(target, corpus),
    }, { listMentions });
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
