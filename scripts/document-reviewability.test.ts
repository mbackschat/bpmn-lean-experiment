import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const surfaceSectionStart = "## Implemented and absent surfaces";
const surfaceSectionEnd = "## Current evidence";
const maximumReviewUnitWords = 120;
const profileCapabilitySectionStart = "## Current profile capabilities";
const profileCapabilitySectionEnd = "## Structural validators";
const semanticProfileMapStart =
  "export const SemanticProfileId = Object.freeze({";
const semanticProfileMapEnd = "} as const);";
const familyMapSectionStart = "## Process Execution mechanism-family map";
const familyMapSectionEnd = "## Reviewer proto-MVP dependency map";
const reviewedRequirementSectionStart = "## Reviewed requirements";
const reviewedRequirementSectionEnd = "## Growth rule";
const familyIdPrefix = "BPMN-MECH-";
const closedSliceCell = 5;
const dispositionCell = 4;
const decidedDispositions: ReadonlySet<string> = new Set([
  "supported",
  "rejected",
]);
/** Artifact trees whose registry README must reach every one of their directories. */
const artifactRegistries = ["profiles", "scenarios"] as const;

function surfaceSection(markdown: string): string {
  const start = markdown.indexOf(surfaceSectionStart);
  const end = markdown.indexOf(surfaceSectionEnd, start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return markdown.slice(start, end);
}

function wordCount(value: string): number {
  return value.trim().split(/\s+/u).filter(Boolean).length;
}

function profileCapabilityRows(markdown: string): ReadonlyArray<string> {
  const start = markdown.indexOf(profileCapabilitySectionStart);
  const end = markdown.indexOf(profileCapabilitySectionEnd, start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return markdown.slice(start, end).split("\n").filter((line) =>
    line.startsWith("| ") &&
    !line.startsWith("| Profile |") &&
    !line.startsWith("|---")
  );
}

function registeredSemanticProfileIds(source: string): ReadonlyArray<string> {
  const start = source.indexOf(semanticProfileMapStart);
  const end = source.indexOf(semanticProfileMapEnd, start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const section = source.slice(start, end);
  const profileIds = [...section.matchAll(/:\s*"([^"]+)"/gu)].map(
    (match) => {
      const profileId = match[1];
      if (profileId === undefined) {
        throw new Error("Semantic profile registry entry has no string value.");
      }
      return profileId;
    },
  );
  assert.equal(new Set(profileIds).size, profileIds.length);
  return profileIds;
}

function markdownTableRows(
  markdown: string,
  sectionStart: string,
  sectionEnd: string,
  expectedCellCount: number,
): ReadonlyArray<ReadonlyArray<string>> {
  const start = markdown.indexOf(sectionStart);
  const end = markdown.indexOf(sectionEnd, start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return markdown
    .slice(start, end)
    .split("\n")
    .filter((line) => line.startsWith("| ") && !line.startsWith("|---"))
    .slice(1)
    .map((line) => {
      const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
      // A changed column count would leave the fixed cell indices below
      // addressing a different claim while still comparing two equal lists.
      assert.equal(cells.length, expectedCellCount);
      return cells;
    });
}

function citedRequirementIds(cell: string): ReadonlyArray<string> {
  return [...cell.matchAll(/`(BPMN-[A-Z0-9-]+)`/gu)]
    .map((match) => {
      const requirementId = match[1];
      if (requirementId === undefined) {
        throw new Error("Requirement citation matched without an identifier.");
      }
      return requirementId;
    })
    .filter((requirementId) => !requirementId.startsWith(familyIdPrefix));
}

function withoutBackticks(cell: string): string {
  return cell.replaceAll("`", "");
}

test("keeps implementation surfaces reviewable outside dense table cells", async () => {
  const implementationMap = await readFile(
    path.join(projectRoot, "docs/IMPLEMENTATION-MAP.md"),
    "utf8",
  );
  const section = surfaceSection(implementationMap);
  const tableRows = section
    .split("\n")
    .filter((line) => line.trimStart().startsWith("|"));
  const oversizedUnits = section
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return (
        trimmed.length > 0 &&
        !trimmed.startsWith("#") &&
        wordCount(trimmed) > maximumReviewUnitWords
      );
    })
    .map((line) => wordCount(line));

  assert.deepEqual(tableRows, []);
  assert.deepEqual(oversizedUnits, []);
});

test("covers every registered semantic profile in the admission capability table", async () => {
  const admissionSpecification = await readFile(
    path.join(projectRoot, "docs/PROFILE-PARAMETERIZED-ADMISSION-SPEC.md"),
    "utf8",
  );
  const profileSource = await readFile(
    path.join(
      projectRoot,
      "packages/semantic-core/src/semantic-process-profile.ts",
    ),
    "utf8",
  );
  const rows = profileCapabilityRows(admissionSpecification);
  const profileIds = registeredSemanticProfileIds(profileSource);
  const rowCounts = new Map(
    profileIds.map((profileId) => [
      profileId,
      rows.filter((row) => row.includes(`\`${profileId}\``)).length,
    ]),
  );

  assert.deepEqual(
    {
      rowCount: rows.length,
      missingOrDuplicateProfiles: profileIds.filter(
        (profileId) => rowCounts.get(profileId) !== 1,
      ),
    },
    {
      rowCount: profileIds.length,
      missingOrDuplicateProfiles: [],
    },
  );
});

// Contract: a requirement the mechanism-family map cites as a closed reviewed
// slice must carry a decided disposition in the same ledger. The oracle is the
// ledger itself, so this detects a row whose disposition was never advanced
// when its capsule closed rather than judging the disposition's correctness.
//
// The check is deliberately one-directional. Requiring every `supported` row to
// be cited back would turn the prose closed-slice column into a second copy of
// the requirement inventory, and it would wrongly reject a row such as
// `BPMN-RECEIVE-TASK-IMPLEMENTATION-01`, which links an implemented
// specification while its own Web-service requirement stays unsupported.
test("keeps every closed reviewed slice consistent with its requirement disposition", async () => {
  const ledger = await readFile(
    path.join(projectRoot, "docs/BPMN-REQUIREMENT-LEDGER.md"),
    "utf8",
  );
  const familyRows = markdownTableRows(
    ledger,
    familyMapSectionStart,
    familyMapSectionEnd,
    6,
  );
  const requirementRows = markdownTableRows(
    ledger,
    reviewedRequirementSectionStart,
    reviewedRequirementSectionEnd,
    7,
  );
  const dispositionByRequirementId = new Map(
    requirementRows.map((cells) => [
      withoutBackticks(cells[0] ?? ""),
      withoutBackticks(cells[dispositionCell] ?? ""),
    ]),
  );
  const citedRequirements = [
    ...new Set(
      familyRows.flatMap((cells) =>
        citedRequirementIds(cells[closedSliceCell] ?? "")
      ),
    ),
  ].sort();

  assert.deepEqual(
    {
      // A restructured table that cites nothing would satisfy both lists below.
      citedRequirementCount: citedRequirements.length > 0,
      unknownRequirementIds: citedRequirements.filter(
        (requirementId) => !dispositionByRequirementId.has(requirementId),
      ),
      undecidedClosedSlices: citedRequirements.filter((requirementId) => {
        const disposition = dispositionByRequirementId.get(requirementId);
        return (
          disposition !== undefined && !decidedDispositions.has(disposition)
        );
      }),
    },
    {
      citedRequirementCount: true,
      unknownRequirementIds: [],
      undecidedClosedSlices: [],
    },
  );
});

// Contract: every artifact directory under a registered tree is linked from that tree's registry
// README. The oracle is the directory listing, so a newly registered profile or scenario family
// fails here instead of leaving a reader-facing index that silently understates the artifact set.
//
// Only reachability is checked. Registry prose deliberately describes families in its own words,
// and asserting that wording would turn a navigational index into a second inventory.
test("links every artifact directory from its registry README", async () => {
  const unlinked: string[] = [];
  for (const registry of artifactRegistries) {
    const readme = await readFile(
      path.join(projectRoot, registry, "README.md"),
      "utf8",
    );
    const entries = await readdir(path.join(projectRoot, registry), {
      withFileTypes: true,
    });
    for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
      if (!readme.includes(`(${entry.name}/`)) {
        unlinked.push(`${registry}/${entry.name}`);
      }
    }
  }

  assert.deepEqual(unlinked.sort(), []);
});
