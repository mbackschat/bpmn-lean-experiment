/**
 * Decides how strongly one executable guard binds a change target.
 *
 * A guard's text containing a directory word such as `scripts` says nothing about whether the guard
 * can reject a change to a file below it, while a guard that enumerates every Lean source never
 * names any of them. Text alone therefore misreports in both directions, so evidence comes in three
 * tiers that a planner reads differently:
 *
 * - named: the guard names the target (path, basename, Lean module name) or imports it directly or
 *   through one intermediate module, so its assertions concern this file;
 * - scanning: the guard enumerates a file set that contains the target, so it constrains every
 *   member without naming any;
 * - mention: only a name or tree word matches. This is explicitly not a binding.
 *
 * Detection is lexical (see {@link SourceFacts}); the evidence a classification carries names the
 * mechanism that matched, so a reader can reject a false positive without rerunning anything.
 */

import path from "node:path";

import { assertCanonicalRepositoryPath } from "./document-control-plane.ts";
import {
  type CorpusFile,
  type CorpusIndex,
  type Enumeration,
  EnumerationKind,
  escapeRegExp,
  pathspecCovers,
  type SourceFacts,
} from "./what-binds-source-facts.ts";

export const GuardTier = {
  Named: "named",
  Scanning: "scan",
  Mention: "mention",
} as const;

export type GuardTier = typeof GuardTier[keyof typeof GuardTier];

export const EvidenceKind = {
  Text: "text",
  Import: "import",
  Scan: "scan",
} as const;

export type GuardEvidence =
  | Readonly<{ kind: typeof EvidenceKind.Text; term: string }>
  /** `via` is the intermediate module, or `null` when the guard imports the target itself. */
  | Readonly<{ kind: typeof EvidenceKind.Import; via: string | null }>
  /** `via` is the imported helper holding the enumeration, or `null` when the guard enumerates. */
  | Readonly<{
    kind: typeof EvidenceKind.Scan;
    enumeration: EnumerationKind;
    scope: string;
    via: string | null;
  }>;

export type GuardClassification = Readonly<{
  tier: GuardTier;
  evidence: GuardEvidence;
}>;

/**
 * Number of import edges between a guard and the target that still count as evidence: the guard
 * imports a module that imports the target. Every further hop adds modules a change cannot plausibly
 * reach, and a hub module such as a wire codec would otherwise bind most of the repository.
 */
export const maxImportDepth = 2;

/**
 * Terms from most to least specific: the exact path, its basename, then each ancestor tree.
 *
 * Ancestor trees remain a term because a file that does not exist yet cannot be named by any guard,
 * so the tree it will join is the only text that can reach a registry covering it.
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
const guardSuffixPattern =
  /\.(?:test|platform-test|temporal-test|temporal-serial-test|integration-test|type-test)\.ts$/u;

export function isGuardPath(candidate: string): boolean {
  return guardSuffixPattern.test(candidate);
}

export type TargetProfile = Readonly<{
  path: string;
  extension: string | null;
  mentionTerms: ReadonlyArray<string>;
  /** Terms a guard's text may use to name this exact file, most specific first. */
  namingPatterns: ReadonlyArray<Readonly<{ term: string; pattern: RegExp }>>;
}>;

function leanModuleName(target: string): string | null {
  const moduleName = target.endsWith(".lean")
    ? target.slice(0, -".lean".length).replaceAll("/", ".")
    : null;
  // A top-level module name is a bare word that every path below it also contains.
  return moduleName !== null && moduleName.includes(".") ? moduleName : null;
}

export function targetProfile(target: string): TargetProfile {
  const basename = path.posix.basename(target);
  const moduleName = leanModuleName(target);
  const dot = basename.lastIndexOf(".");
  return {
    path: target,
    extension: dot === -1 ? null : basename.slice(dot + 1),
    mentionTerms: searchTerms(target),
    namingPatterns: [
      {
        term: target,
        pattern: new RegExp(`(?<![\\w.-])${escapeRegExp(target)}(?![\\w-]|\\.\\w)`, "u"),
      },
      ...(moduleName === null
        ? []
        : [{
          term: moduleName,
          pattern: new RegExp(
            `(?<![\\w.])${escapeRegExp(moduleName)}(?!\\w|\\.[A-Za-z_])`,
            "u",
          ),
        }]),
      {
        term: basename,
        pattern: new RegExp(`(?<![\\w.-])${escapeRegExp(basename)}(?![\\w-]|\\.\\w)`, "u"),
      },
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// Named
// ---------------------------------------------------------------------------------------------

/**
 * How the guard reaches the target through relative imports within `maxImportDepth` edges, with the
 * guard's own first hop as `via`, or `undefined` when it does not.
 */
function importVia(
  target: string,
  guardPath: string,
  facts: SourceFacts,
  index: CorpusIndex,
): string | null | undefined {
  const direct = facts.imports.map(({ path: imported }) => imported);
  if (direct.includes(target)) {
    return null;
  }
  const seen = new Set([guardPath, ...direct]);
  let frontier = direct.map((module) => ({ module, hop: module }));
  for (let depth = 2; depth <= maxImportDepth; depth += 1) {
    const next: Array<{ module: string; hop: string }> = [];
    for (const { module, hop } of frontier) {
      const imports = (index.facts(module)?.imports ?? []).map(({ path: imported }) => imported);
      if (imports.includes(target)) {
        return hop;
      }
      for (const imported of imports) {
        if (!seen.has(imported)) {
          seen.add(imported);
          next.push({ module: imported, hop });
        }
      }
    }
    frontier = next;
  }
  return undefined;
}

function namedEvidence(
  profile: TargetProfile,
  guard: CorpusFile,
  facts: SourceFacts | undefined,
  index: CorpusIndex,
): GuardEvidence | null {
  const named = profile.namingPatterns.find(({ pattern }) => pattern.test(guard.text));
  if (named !== undefined) {
    return { kind: EvidenceKind.Text, term: named.term };
  }
  const via = facts === undefined
    ? undefined
    : importVia(profile.path, guard.path, facts, index);
  return via === undefined ? null : { kind: EvidenceKind.Import, via };
}

// ---------------------------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------------------------

/** The enumerations one file contributes to a guard, with the scope text surrounding them. */
type EnumerationUnit = Readonly<{
  /** The imported helper, or `null` for the guard itself. */
  via: string | null;
  enumerations: ReadonlyArray<Enumeration>;
  scopeLiterals: ReadonlyArray<string>;
  extensionTokens: ReadonlySet<string>;
}>;

/**
 * The guard's own enumerations plus, for each imported helper, only those it reaches through the
 * names it imports. A helper with other exports that happen to enumerate files contributes nothing
 * but its extension filters, which is how `source-measure.ts` tells a hygiene scan which files count.
 */
function enumerationUnits(guardFacts: SourceFacts, index: CorpusIndex): ReadonlyArray<EnumerationUnit> {
  const helpers = guardFacts.imports.flatMap((edge): ReadonlyArray<EnumerationUnit> => {
    const facts = isGuardPath(edge.path) ? undefined : index.facts(edge.path);
    if (facts === undefined) {
      return [];
    }
    const reached = edge.names === null
      ? facts.enumerations
      : [...new Set([...edge.names].flatMap((name) => facts.exportedEnumerations.get(name) ?? []))];
    return [{
      via: edge.path,
      enumerations: reached,
      scopeLiterals: facts.scopeLiterals,
      extensionTokens: facts.extensionTokens,
    }];
  });
  return [
    {
      via: null,
      enumerations: guardFacts.enumerations,
      scopeLiterals: guardFacts.scopeLiterals,
      extensionTokens: guardFacts.extensionTokens,
    },
    ...helpers,
  ];
}

function scan(enumeration: EnumerationKind, scope: string, via: string | null): GuardEvidence {
  return { kind: EvidenceKind.Scan, enumeration, scope, via };
}

/**
 * The enumeration that reaches the target, from the guard's own code or an imported helper.
 *
 * Three cases, strongest first. An explicit pathspec decides alone, because it bounds what that call
 * lists. A directory read, a glob or a pathspec-free listing takes its scope from a path literal in
 * the guard or its own file that covers the target. A pathspec-free listing additionally covers every
 * file of an extension the guard or any imported helper filters on, which is how a repository-wide
 * Lean scanner reaches a file it never names.
 *
 * Extension filters narrow only the third case. A guard that reads a tree and also mentions an
 * unrelated extension may filter on it or may merely compare it elsewhere, and a lexical pass cannot
 * tell which; excluding it would hide a real scanner, while including it costs one line of reading.
 */
function scanEvidence(
  profile: TargetProfile,
  guardFacts: SourceFacts | undefined,
  index: CorpusIndex,
): GuardEvidence | null {
  if (guardFacts === undefined) {
    return null;
  }
  const units = enumerationUnits(guardFacts, index);
  const [guardUnit] = units;
  const listed = units.flatMap((unit) =>
    unit.enumerations.map((enumeration) => ({ unit, enumeration }))
  );
  for (const { unit, enumeration } of listed) {
    const spec = enumeration.pathspecs.find((candidate) => pathspecCovers(candidate, profile.path));
    if (spec !== undefined) {
      return scan(enumeration.kind, `pathspec "${spec}"`, unit.via);
    }
  }
  const unscoped = listed.filter(({ enumeration }) => enumeration.pathspecs.length === 0);
  for (const { unit, enumeration } of unscoped) {
    const literal = [...(guardUnit?.scopeLiterals ?? []), ...unit.scopeLiterals].find(
      (candidate) => pathspecCovers(candidate, profile.path),
    );
    if (literal !== undefined) {
      return scan(enumeration.kind, `root "${literal}"`, unit.via);
    }
  }
  const whole = unscoped.find(({ enumeration }) => enumeration.kind === EnumerationKind.GitListing);
  const extension = profile.extension;
  if (whole === undefined || extension === null || !units.some((unit) => unit.extensionTokens.has(extension))) {
    return null;
  }
  return scan(EnumerationKind.GitListing, `whole repository filtered by ".${extension}"`, whole.unit.via);
}

// ---------------------------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------------------------

/**
 * The strongest tier that applies to one guard, or `null` when it has no connection at all.
 *
 * Mention accepts any search term, ancestor trees included, and is deliberately the weakest tier: a
 * guard the stronger tiers miss stays visible to anyone who asks for it without being claimed as a
 * constraint.
 */
export function classifyGuard(
  profile: TargetProfile,
  guard: CorpusFile,
  index: CorpusIndex,
): GuardClassification | null {
  if (guard.path === profile.path) {
    return null;
  }
  const facts = index.facts(guard.path);
  const named = namedEvidence(profile, guard, facts, index);
  if (named !== null) {
    return { tier: GuardTier.Named, evidence: named };
  }
  const scanning = scanEvidence(profile, facts, index);
  if (scanning !== null) {
    return { tier: GuardTier.Scanning, evidence: scanning };
  }
  const term = profile.mentionTerms.find((candidate) => guard.text.includes(candidate));
  return term === undefined
    ? null
    : { tier: GuardTier.Mention, evidence: { kind: EvidenceKind.Text, term } };
}

/**
 * Orders evidence from most to least direct: the guard names the target, imports it, reaches it
 * through one module, then scans a file set containing it.
 */
export function evidenceStrength(evidence: GuardEvidence): number {
  switch (evidence.kind) {
    case EvidenceKind.Text:
      return 0;
    case EvidenceKind.Import:
      return evidence.via === null ? 1 : 2;
    case EvidenceKind.Scan:
      return 3;
  }
}

export function describeEvidence(evidence: GuardEvidence): string {
  switch (evidence.kind) {
    case EvidenceKind.Text:
      return `matched ${JSON.stringify(evidence.term)}`;
    case EvidenceKind.Import:
      return evidence.via === null
        ? "imports the target"
        : `imports via ${JSON.stringify(evidence.via)}`;
    case EvidenceKind.Scan:
      return `${evidence.enumeration}, ${evidence.scope}${
        evidence.via === null ? "" : `, enumerated in ${JSON.stringify(evidence.via)}`
      }`;
  }
}
