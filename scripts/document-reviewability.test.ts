import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
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
/** Document trees whose own README must reach every sibling Markdown document. */
const documentRegistries = [
  "docs/archived",
  "docs/capsules",
  "docs/experiments",
  "docs/research",
] as const;

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

/** Heading owning the atomic-change inventory required of every capsule proposal. */
const bindingInventoryHeading = "## Versioning consequences";
/** Extensions the module-size boundaries apply to, so a named owner is a real change site. */
const sourceOwnerExtensions = new Set([".cjs", ".java", ".js", ".lean", ".mjs", ".ts"]);

function headingSection(markdown: string, heading: string): string | null {
  const start = markdown.indexOf(`${heading}\n`);
  if (start === -1) {
    return null;
  }
  const end = markdown.indexOf("\n## ", start + heading.length);
  return end === -1 ? markdown.slice(start) : markdown.slice(start, end);
}

/** Repository-relative targets of every inline Markdown link, without any heading anchor. */
function linkedPaths(
  section: string,
  documentDirectory: string,
): ReadonlyArray<string> {
  return [...section.matchAll(/\]\(([^)\s]+)\)/gu)]
    .flatMap(([, target]) => (target === undefined ? [] : [target]))
    .filter((target) => !/^[a-z]+:/u.test(target) && !target.startsWith("#"))
    .map((target) =>
      path.normalize(path.join(documentDirectory, target.split("#")[0] ?? target))
    );
}

async function exists(repositoryPath: string): Promise<boolean> {
  try {
    await access(path.join(projectRoot, repositoryPath));
    return true;
  } catch {
    return false;
  }
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

// Same reachability contract for document trees: a capsule, research record, experiment, or
// archived document must be linked from its own directory README, not only from the top-level
// documentation registry. Currently satisfied everywhere, so this locks it before it drifts.
test("links every tree document from its own directory README", async () => {
  const unlinked: string[] = [];
  for (const registry of documentRegistries) {
    const readme = await readFile(
      path.join(projectRoot, registry, "README.md"),
      "utf8",
    );
    const entries = await readdir(path.join(projectRoot, registry));
    for (const entry of entries) {
      if (entry.endsWith(".md") && entry !== "README.md" && !readme.includes(entry)) {
        unlinked.push(`${registry}/${entry}`);
      }
    }
  }

  assert.deepEqual(unlinked.sort(), []);
});

// Contract: a capsule whose implementation is still ahead must name the constraints that already
// bound it — the executable oracles its planned artifacts must satisfy, and the source owners it will
// grow — as links that resolve. The oracle is the filesystem, so a renamed guard or owner fails here.
//
// The obligation is pre-implementation, which is why it binds proposals and not specifications: once a
// capsule graduates, the constraints have already been met and re-asserting them is churn. Enforcing
// that the owners are *named* composes with the size gate, which then reports their headroom without
// the capsule having to keep a figure current. `node scripts/what-binds.ts <path>...` derives both
// lists mechanically; nothing here trusts recall.
test("every capsule proposal names the guards and owners that already bind it", async () => {
  const capsuleRoot = path.join(projectRoot, "docs/capsules");
  const proposals = (await readdir(capsuleRoot))
    .filter((entry) => entry.endsWith("-PROPOSAL.md"));
  const findings: string[] = [];
  for (const proposal of proposals) {
    const markdown = await readFile(path.join(capsuleRoot, proposal), "utf8");
    const section = headingSection(markdown, bindingInventoryHeading);
    if (section === null) {
      findings.push(`${proposal}: no ${bindingInventoryHeading} section`);
      continue;
    }
    const linked = [...new Set(linkedPaths(section, "docs/capsules"))];
    const unresolved: string[] = [];
    for (const target of linked) {
      if (!await exists(target)) {
        unresolved.push(target);
      }
    }
    const resolved = linked.filter((target) => !unresolved.includes(target));
    if (unresolved.length > 0) {
      findings.push(`${proposal}: unresolved ${unresolved.sort().join(", ")}`);
    }
    if (!resolved.some((target) => target.endsWith(".test.ts"))) {
      findings.push(`${proposal}: names no executable guard or test oracle`);
    }
    if (
      !resolved.some((target) =>
        !target.endsWith(".test.ts") &&
        sourceOwnerExtensions.has(path.extname(target))
      )
    ) {
      findings.push(`${proposal}: names no source owner it will grow`);
    }
  }

  assert.deepEqual(
    { proposalCount: proposals.length > 0, findings },
    { proposalCount: true, findings: [] },
  );
});

// Same reachability contract one level down: a scenario family README must link each of its own
// scenario documents. Adding a scenario then forces the README edit, which is the drift trigger.
//
// This reaches a prose-inventory class that a lexical rule cannot: it needs no count word and no
// family naming convention, only the filesystem. It deliberately does not reach a cross-cutting
// enumeration such as a registry listing every family in prose, whose names are not derivable —
// those are kept out of maintained prose instead of guarded.
test("links every scenario document from its own family README", async () => {
  const unlinked: string[] = [];
  const families = await readdir(path.join(projectRoot, "scenarios"), {
    withFileTypes: true,
  });
  for (const family of families.filter((entry) => entry.isDirectory())) {
    const familyRoot = path.join(projectRoot, "scenarios", family.name);
    const readme = await readFile(path.join(familyRoot, "README.md"), "utf8");
    for (const entry of await readdir(familyRoot)) {
      if (entry.endsWith("scenario.json") && !readme.includes(`(${entry})`)) {
        unlinked.push(`scenarios/${family.name}/${entry}`);
      }
    }
  }

  assert.deepEqual(unlinked.sort(), []);
});
