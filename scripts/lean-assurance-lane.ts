import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { type LeanDeclaration, leanDeclarations } from "./lean-declarations.ts";
import { maskMarkdownIgnoredRegions } from "./markdown-link-lexer.ts";
import { headingSection } from "./markdown-sections.ts";

const leanAssuranceHeading = "## Lean assurance lane";
/** Where a capsule's lane Evidence line is written, so its relative links resolve from here. */
const capsuleDirectory = "docs/capsules";
export const runtimeProofMap = "docs/ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md";
/** Capsule file suffix of an unimplemented design; every other capsule is an implemented specification. */
const proposalSuffix = "-PROPOSAL.md";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

/** A local link in the Evidence line; `declaration` is the `#fragment`, absent when none is written. */
type EvidenceTarget = Readonly<{ repositoryPath: string; declaration: string | null }>;

/**
 * Answers which declarations a repository-relative Lean module contains, or `null` when it is absent.
 *
 * Injected so the parser can be tested against synthetic modules; the default reads the working tree.
 */
export type DeclarationLookup = (
  repositoryPath: string,
) => ReadonlyArray<LeanDeclaration> | null;

const readModuleDeclarations: DeclarationLookup = (repositoryPath) => {
  try {
    return leanDeclarations(readFileSync(path.join(projectRoot, repositoryPath), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
};

function evidenceTargets(evidence: string): ReadonlyArray<EvidenceTarget> {
  return [...evidence.matchAll(/\]\(([^)\s]+)\)/gu)]
    .flatMap(([, target]) => (target === undefined ? [] : [target]))
    .filter((target) => !/^[a-z]+:/u.test(target) && !target.startsWith("#"))
    .map((target) => {
      const [linkPath = target, declaration] = target.split("#");
      return {
        repositoryPath: path.normalize(path.join(capsuleDirectory, linkPath)),
        declaration: declaration ?? null,
      };
    });
}

function isLeanModule({ repositoryPath }: EvidenceTarget): boolean {
  return repositoryPath.startsWith("BpmnSemantics/") && repositoryPath.endsWith(".lean");
}

/**
 * Checks the declarations an evidence line names, and for a specification that it names one.
 *
 * A bare module link cannot distinguish a theorem owner from an aggregation module that declares
 * nothing (AA-15 found four lanes resting on such modules), so a specification's proved or checked
 * lane must carry at least one `#declarationName` fragment. A proposal declares its lane before the
 * guarantee exists and its Evidence may cite only starting owners, so naming is optional there; any
 * fragment either kind writes must still name a declaration present in that module.
 */
function namedDeclarationFindings(
  entry: string,
  shape: string,
  leanTargets: ReadonlyArray<EvidenceTarget>,
  declarationsOf: DeclarationLookup,
  mustName: boolean,
): ReadonlyArray<string> {
  const named = leanTargets.filter(({ declaration }) => declaration !== null);
  if (named.length === 0) {
    return mustName
      ? [
        `${entry}: ${shape} lane names no guaranteeing declaration; link it as Module.lean#declarationName`,
      ]
      : [];
  }
  return named.flatMap(({ repositoryPath, declaration }) => {
    const declarations = declarationsOf(repositoryPath);
    if (declarations === null) {
      return [`${entry}: ${repositoryPath}#${declaration} names a module that does not exist`];
    }
    return declarations.some(({ name }) => name === declaration)
      ? []
      : [`${entry}: ${repositoryPath}#${declaration} names no declaration in that module`];
  });
}

/**
 * Checks one capsule's `## Lean assurance lane` section and returns its findings.
 *
 * The section must be unique, carry exactly one closed `Lane shape:` field first and a single
 * `Evidence:` paragraph directly after it, and no other level-two heading may own Lean or proof
 * material. A proved or checked lane must link a Lean owner, and a specification's lane must name its
 * guaranteeing declaration as `Module.lean#declarationName`; a deliberately open lane must link the
 * runtime/proof implementation map that owns its reason and reopen trigger.
 */
export function leanAssuranceFindings(
  markdown: string,
  entry: string,
  declarationsOf: DeclarationLookup = readModuleDeclarations,
): ReadonlyArray<string> {
  const visibleMarkdown = maskMarkdownIgnoredRegions(markdown);
  const headings = visibleMarkdown.split("\n").filter((line) => line === leanAssuranceHeading);
  if (headings.length !== 1) {
    return [`${entry}: expected one ${leanAssuranceHeading}, found ${headings.length}`];
  }
  const competingHeadings = visibleMarkdown.split("\n").filter((line) =>
    /^## .*(?:\bLean\b|\bassurance\b|proof[- ]boundar(?:y|ies)|\blaws?\b|\bdeclarative relation\b)/iu.test(line)
      && line !== leanAssuranceHeading
  );
  if (competingHeadings.length > 0) {
    return [`${entry}: noncanonical Lean assurance heading ${JSON.stringify(competingHeadings[0])}`];
  }
  const section = headingSection(visibleMarkdown, leanAssuranceHeading);
  if (section === null) {
    return [`${entry}: ${leanAssuranceHeading} has no readable section`];
  }
  const laneLines = section.split("\n").filter((line) =>
    line.startsWith("Lane shape:")
  );
  if (laneLines.length !== 1) {
    return [`${entry}: expected one Lane shape field, found ${laneLines.length}`];
  }
  const contentLines = section
    .slice(leanAssuranceHeading.length)
    .split("\n")
    .filter((line) => line.length > 0);
  const firstContentLine = contentLines[0];
  const match = /^Lane shape: (proved|checked|deliberately open)$/u.exec(firstContentLine ?? "");
  if (match === null) {
    return [`${entry}: invalid first Lean assurance line ${JSON.stringify(firstContentLine)}`];
  }
  const [, shape = ""] = match;
  const evidenceLines = section.split("\n").filter((line) => line.startsWith("Evidence: "));
  if (evidenceLines.length !== 1) {
    return [`${entry}: expected one Lean Evidence statement, found ${evidenceLines.length}`];
  }
  const evidence = evidenceLines[0] ?? "";
  if (contentLines[1] !== evidence) {
    return [`${entry}: Lean Evidence statement must immediately follow the Lane shape field`];
  }
  const targets = evidenceTargets(evidence);
  if (shape === "deliberately open") {
    return targets.some(({ repositoryPath }) => repositoryPath === runtimeProofMap)
      ? []
      : [`${entry}: deliberately open lane does not link ${runtimeProofMap}`];
  }
  const leanTargets = targets.filter(isLeanModule);
  return leanTargets.length === 0
    ? [`${entry}: ${shape} lane does not link a Lean evidence owner`]
    : namedDeclarationFindings(
      entry,
      shape,
      leanTargets,
      declarationsOf,
      !entry.endsWith(proposalSuffix),
    );
}
