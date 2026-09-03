import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { markdownTableRows, withoutBackticks } from "./markdown-tables.ts";
import { reviewedDetailMapWordBudget } from "./document-control-plane.ts";
import {
  headroom,
  isHandWrittenSourcePath,
  nonblankLines,
} from "./source-measure.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const maximumReviewUnitWords = 120;
const rootImplementationMap = "docs/IMPLEMENTATION-MAP.md";
const detailImplementationMaps = [
  "docs/ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md",
  "docs/ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md",
  "docs/TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md",
  "docs/BPM-PLATFORM-IMPLEMENTATION-MAP.md",
  "docs/ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md",
] as const;
const profileCapabilitySectionStart = "## Current profile capabilities";
const profileCapabilitySectionEnd = "## Structural validators";
const semanticProfileMapStart =
  "export const SemanticProfileId = Object.freeze({";
const semanticProfileMapEnd = "} as const);";
const semanticProcessIlSpecPath = path.join(
  projectRoot,
  "docs/SEMANTIC-PROCESS-IL-SPEC.md",
);

test("rejects generic tracked INDEX.md documentation owners", () => {
  const trackedPaths = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    {
      cwd: projectRoot,
      encoding: "utf8",
    },
  ).split("\0").filter((trackedPath) =>
    trackedPath.length > 0 && existsSync(path.join(projectRoot, trackedPath))
  );

  assert.deepEqual(
    trackedPaths.filter((trackedPath) => path.basename(trackedPath) === "INDEX.md"),
    [],
  );
});
/** Artifact trees whose registry README must reach every one of their directories. */
const artifactRegistries = ["profiles", "scenarios"] as const;
/** Document trees whose own README must reach every sibling Markdown document. */
const documentRegistries = [
  "docs/archived",
  "docs/capsules",
  "docs/experiments",
  "docs/research",
] as const;

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




/** Heading owning the atomic-change inventory required of every capsule proposal. */
const bindingInventoryHeading = "## Versioning consequences";
/** Subsection whose rows pair one source owner with its measured remaining headroom. */
const ownerInventoryHeading = "### Owners this implementation grows";
/** Closed disposition set of the process-assessment ledger, with the dispositions prose may use once. */
const processDispositions = [
  "executable guard",
  "review question",
  "accepted risk",
  "unguardable",
] as const;
type ProcessDisposition = typeof processDispositions[number];
const executableDisposition: ProcessDisposition = "executable guard";

type ProcessFinding = Readonly<{
  finding: string;
  instances: string;
  disposition: string;
  evidence: string;
}>;

function isExecutableLink(target: string): boolean {
  return target.endsWith(".test.ts") ||
    (target.startsWith("../scripts/") && target.endsWith(".ts"));
}

/**
 * Rejects a ledger row whose disposition cannot hold the weight its instance count places on it.
 *
 * The escalation rule is the whole mechanism: a finding seen twice has already refuted the prose that
 * was supposed to prevent it, so the second instance must be answered by a gate. Checking that here
 * keeps the rule from being the next piece of prose nobody enforces.
 */
function assessProcessFindings(
  rows: ReadonlyArray<ProcessFinding>,
): ReadonlyArray<string> {
  return rows.flatMap((row) => {
    const label = row.finding.slice(0, 48);
    const instances = Number(row.instances);
    const disposition = withoutBackticks(row.disposition);
    const links = [...row.evidence.matchAll(/\]\(([^)\s]+)\)/gu)]
      .flatMap(([, target]) => (target === undefined ? [] : [target]));
    if (!Number.isInteger(instances) || instances < 1) {
      return [`${label}: instance count ${JSON.stringify(row.instances)} is not a positive integer`];
    }
    if (!processDispositions.includes(disposition as ProcessDisposition)) {
      return [`${label}: disposition ${JSON.stringify(disposition)} is outside the closed set`];
    }
    if (links.length === 0) {
      return [`${label}: disposition cites no evidence link`];
    }
    // `unguardable` is the escape hatch the escalation rule needs: some findings are about the
    // agent's own reporting, which no repository fact can observe. Forcing those to name a guard would
    // buy a fabricated link instead of enforcement.
    if (
      instances >= 2 &&
      disposition !== executableDisposition &&
      disposition !== "unguardable"
    ) {
      return [
        `${label}: ${instances} instances refute a ${JSON.stringify(disposition)} disposition and require an executable guard`,
      ];
    }
    if (disposition === executableDisposition && !links.some(isExecutableLink)) {
      return [`${label}: claims an executable guard but links no guard or script`];
    }
    return [];
  });
}

function headingSection(markdown: string, heading: string): string | null {
  const start = markdown.indexOf(`${heading}\n`);
  if (start === -1) {
    return null;
  }
  const boundary = `\n${"#".repeat(heading.indexOf(" "))} `;
  const end = markdown.indexOf(boundary, start + heading.length);
  return end === -1 ? markdown.slice(start) : markdown.slice(start, end);
}

/**
 * Recomputes every headroom figure a capsule states about a source owner it plans to grow.
 *
 * This is the whole point of the check rather than a tidiness rule. A structural claim such as "this
 * owner is full, so extract before adding semantics" is true only under a measurement, and recording
 * the conclusion without re-deriving the measurement is what lets it outlive its own premise. Because
 * the figure is recomputed on every run, changing an owner's size forces the capsule to be revisited
 * instead of leaving a stale requirement that reads as permanent.
 *
 * It cannot decide whether the capsule really needs to grow a named owner. That stays a review
 * question, because no measurement distinguishes a demonstrated change site from a predicted one.
 */
async function staleOwnerHeadroom(
  section: string,
  documentDirectory: string,
  measure: (repositoryPath: string) => Promise<number | null>,
): Promise<ReadonlyArray<string>> {
  const findings: string[] = [];
  for (const line of section.split("\n")) {
    if (!line.startsWith("| [") || line.startsWith("| Owner ")) {
      continue;
    }
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    const [ownerCell, statedCell] = cells;
    const target = linkedPaths(ownerCell ?? "", documentDirectory)[0];
    const stated = Number(statedCell);
    if (target === undefined || !Number.isInteger(stated)) {
      findings.push(`${line.slice(0, 60)}: needs one owner link and an integer headroom`);
      continue;
    }
    const measured = await measure(target);
    if (measured === null) {
      findings.push(`${target}: not a measurable source owner`);
    } else if (measured !== stated) {
      findings.push(`${target}: states ${stated} lines of headroom, measures ${measured}`);
    }
  }
  return findings;
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

test("keeps the routed implementation maps reviewable", async () => {
  for (const [relativePath, maximumWords, permitsRoutingTable] of [
    [rootImplementationMap, 2000, true],
    ...detailImplementationMaps.map((relativePath) =>
      [relativePath, reviewedDetailMapWordBudget(relativePath), false] as const),
  ] as const) {
    const document = await readFile(path.join(projectRoot, relativePath), "utf8");
    const lines = document.split("\n");
    const tableRows = lines.filter((line) => line.trimStart().startsWith("|"));
    const oversizedUnits = lines
      .filter((line) => {
        const trimmed = line.trim();
        return trimmed.length > 0 &&
          !trimmed.startsWith("#") &&
          !trimmed.startsWith("|") &&
          wordCount(trimmed) > maximumReviewUnitWords;
      })
      .map((line) => wordCount(line));

    if (!permitsRoutingTable) assert.deepEqual(tableRows, [], relativePath);
    assert.deepEqual(oversizedUnits, [], relativePath);
    assert.ok(
      wordCount(document) <= maximumWords,
      `${relativePath} is ${wordCount(document)} words against a ${maximumWords}-word backstop`,
    );
  }
});

test("keeps the owner-approved detail-map budget exceptions exactly scoped", () => {
  assert.equal(
    reviewedDetailMapWordBudget(
      "docs/ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md",
    ),
    5200,
  );
  assert.equal(
    reviewedDetailMapWordBudget(
      "docs/TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md",
    ),
    7000,
  );
  assert.equal(
    reviewedDetailMapWordBudget(
      "docs/ENGINE-SEMANTIC-FAMILY-IMPLEMENTATION-MAP.md",
    ),
    4000,
  );
  assert.equal(
    reviewedDetailMapWordBudget(
      "docs/ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md",
    ),
    4500,
  );
});

test("covers every registered semantic profile in the admission capability table", async () => {
  const admissionSpecification = await readFile(
    path.join(projectRoot, "docs/PROFILE-PARAMETERIZED-ADMISSION-SPEC.md"),
    "utf8",
  );
  const profileSource = await readFile(
    path.join(
      projectRoot,
      "packages/semantic-core/src/semantic-profile-catalog.ts",
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

test("keeps the registered Timer Start capability visible in the exact IL contract", async () => {
  const specification = await readFile(semanticProcessIlSpecPath, "utf8");

  assert.match(
    specification,
    /registered Timer Start capability/u,
  );
  assert.match(
    specification,
    /kind: "timerStartEvent";\s+id: string;\s+durationLiteral: "PT1S";/u,
  );
  assert.match(
    specification,
    /one exact top-level `PT1S` Timer Start Event/u,
  );
});

test("keeps the Terminate End checked node visible in the exact IL contract", async () => {
  const specification = await readFile(semanticProcessIlSpecPath, "utf8");

  assert.match(
    specification,
    /kind: "terminateEndEvent";\s+id: string;/u,
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

// Contract: the escalation rule of the process-assessment ledger is executable, so a repeated finding
// cannot be answered with another reminder. The oracle is the closed disposition set plus the row's own
// instance count; the correctness of a disposition is a review judgment this cannot make.
test("the process-assessment escalation rule rejects every weak disposition", () => {
  assert.deepEqual(
    assessProcessFindings([
      {
        finding: "guarded recurrence",
        instances: "3",
        disposition: "`executable guard`",
        evidence: "[guard](../scripts/what-binds.test.ts)",
      },
      {
        finding: "single occurrence answered by a question",
        instances: "1",
        disposition: "`review question`",
        evidence: "[question](#self-assessment-questions)",
      },
      {
        finding: "repeated but still only a question",
        instances: "2",
        disposition: "`review question`",
        evidence: "[question](#self-assessment-questions)",
      },
      {
        finding: "claims a guard without one",
        instances: "2",
        disposition: "`executable guard`",
        evidence: "[prose](PLAN.md)",
      },
      {
        finding: "invented disposition",
        instances: "1",
        disposition: "`will be careful`",
        evidence: "[prose](PLAN.md)",
      },
      {
        finding: "no evidence at all",
        instances: "1",
        disposition: "`accepted risk`",
        evidence: "none",
      },
      {
        finding: "unusable instance count",
        instances: "several",
        disposition: "`review question`",
        evidence: "[question](#self-assessment-questions)",
      },
    ]),
    [
      'repeated but still only a question: 2 instances refute a "review question" disposition and require an executable guard',
      "claims a guard without one: claims an executable guard but links no guard or script",
      'invented disposition: disposition "will be careful" is outside the closed set',
      "no evidence at all: disposition cites no evidence link",
      'unusable instance count: instance count "several" is not a positive integer',
    ],
  );
});

test("the maintained process-assessment ledger satisfies its own escalation rule", async () => {
  const ledger = await readFile(
    path.join(projectRoot, "docs/PROCESS-ASSESSMENT-LEDGER.md"),
    "utf8",
  );
  const rows = markdownTableRows(ledger, "## Findings", "## Update rule", 5).map(
    (cells) => ({
      finding: cells[0] ?? "",
      instances: cells[2] ?? "",
      disposition: cells[3] ?? "",
      evidence: cells[4] ?? "",
    }),
  );

  assert.deepEqual(
    { rowCount: rows.length > 0, findings: assessProcessFindings(rows) },
    { rowCount: true, findings: [] },
  );
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
  // Two trees with different obligations. `docs/capsules` carries the full binding-inventory contract.
  // A root-placed proposal carries only the owner-headroom staleness half, and that asymmetry is
  // deliberate rather than lazy: the section contract was written for capsules and four older root
  // proposals predate it, while a stale headroom figure is wrong wherever it sits. A cross-cutting
  // proposal at `docs/` root had left this jurisdiction entirely and carried six stale figures plus a
  // sentence claiming this guard recomputed them.
  const proposalTrees = ["docs/capsules", "docs"] as const;
  const capsules: Array<{ tree: string; entry: string }> = [];
  for (const tree of proposalTrees) {
    for (const entry of await readdir(path.join(projectRoot, tree))) {
      if (entry.endsWith("-PROPOSAL.md") || entry.endsWith("-SPEC.md")) {
        capsules.push({ tree, entry });
      }
    }
  }
  const proposals = capsules.filter(({ entry }) => entry.endsWith("-PROPOSAL.md"));
  const findings: string[] = [];
  for (const { tree: capsuleRoot, entry: proposal } of proposals) {
    const markdown = await readFile(path.join(projectRoot, capsuleRoot, proposal), "utf8");
    const headroomOnly = capsuleRoot === "docs";
    const section = headingSection(markdown, bindingInventoryHeading);
    if (section === null && !headroomOnly) {
      findings.push(`${proposal}: no ${bindingInventoryHeading} section`);
      continue;
    }
    const linked = [...new Set(linkedPaths(section ?? "", capsuleRoot))];
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
    if (!headroomOnly && !resolved.some((target) => target.endsWith(".test.ts"))) {
      findings.push(`${proposal}: names no executable guard or test oracle`);
    }
    if (
      !headroomOnly &&
      !resolved.some((target) =>
        !target.endsWith(".test.ts") &&
        isHandWrittenSourcePath(target)
      )
    ) {
      findings.push(`${proposal}: names no source owner it will grow`);
    }
    // The section contract requires the owner table *inside* the binding section, and that requirement
    // applies to capsules only. The headroom half then looks the table up document-wide, because
    // reaching it through the binding section made a second placement decide jurisdiction one level
    // down: a root proposal without that section escaped the staleness check entirely. Row scoping
    // stays at the heading rather than the whole document, because other tables also open with a link
    // cell and would be read as malformed headroom rows.
    if (section !== null && !headroomOnly && headingSection(section, ownerInventoryHeading) === null) {
      findings.push(`${proposal}: no ${ownerInventoryHeading} subsection`);
      continue;
    }
    const owners = headingSection(markdown, ownerInventoryHeading);
    if (owners === null) {
      continue;
    }
    findings.push(
      ...(await staleOwnerHeadroom(owners, capsuleRoot, async (target) => {
        if (!isHandWrittenSourcePath(target) || !await exists(target)) {
          return null;
        }
        return headroom(
          nonblankLines(await readFile(path.join(projectRoot, target), "utf8")),
        );
      })).map((finding) => `${proposal}: ${finding}`),
    );
  }

  // Anti-vacuity guards the discovery, not the project's current state: every capsule graduating to
  // `-SPEC` is a legitimate outcome and leaves zero proposals, while a broken glob must still fail.
  assert.deepEqual(
    { capsuleCount: capsules.length > 0, findings },
    { capsuleCount: true, findings: [] },
  );
});

// Same reachability contract one level down: a scenario family README must link each of its own
// scenario documents. Adding a scenario then forces the README edit, which is the drift trigger.
//
// This reaches a prose-inventory class that a lexical rule cannot: it needs no count word and no
// family naming convention, only the filesystem. It deliberately does not reach a cross-cutting
// enumeration such as a registry listing every family in prose, whose names are not derivable —
// those are kept out of maintained prose instead of guarded.
/**
 * A graduated specification must retain no owner-headroom figure at all.
 *
 * The inventory guard above reads proposals only, because headroom figures constrain a *plan*. A
 * graduated capsule therefore leaves that jurisdiction silently and its figures drift while the
 * table's own preamble still promises they are recomputed, which is a false claim about coverage
 * rather than a stale number. That happened: the interrupting Activity boundary Timer specification
 * carried seven wrong figures out of eight after graduation, and the first attempt to record *that*
 * defect miscounted it as three of four by reading only the first rows of the table it described.
 *
 * This matches the measured row shape rather than one heading string, so renaming the table does not
 * evade it and a stray figure outside a table is still caught.
 */
function retainedHeadroomFigures(markdown: string): ReadonlyArray<string> {
  return markdown.split("\n").flatMap((line, index) => {
    const row = /^\|\s*\[[^\]]+\]\((\.\.\/[^)]+)\)\s*\|\s*(\d+)\s*\|/u.exec(line);
    return row === null ? [] : [`line ${index + 1}: ${row[1]} states ${row[2]}`];
  });
}

test("no graduated specification retains an owner-headroom figure", async () => {
  const capsuleRoot = path.join(projectRoot, "docs/capsules");
  const specifications = (await readdir(capsuleRoot))
    .filter((entry) => entry.endsWith("-SPEC.md"));
  assert.ok(
    specifications.length > 5,
    `specification enumeration returned ${specifications.length} files`,
  );
  const findings: string[] = [];
  for (const specification of specifications) {
    const markdown = await readFile(path.join(capsuleRoot, specification), "utf8");
    findings.push(
      ...retainedHeadroomFigures(markdown).map((finding) => `${specification}: ${finding}`),
    );
  }

  assert.deepEqual(
    findings,
    [],
    "graduation drops owner-headroom figures; record the extractions the capsule forced instead",
  );
});

test("the graduation policy matches a headroom row and ignores prose and guard rows", () => {
  assert.deepEqual(
    retainedHeadroomFigures([
      "| [runtime](../../packages/semantic-core/src/semantic-process-runtime.ts) | 47 | Sufficient. |",
      "| [guard](../../scripts/capsule-roundtrip.test.ts) | Every artifact is registered. |",
      "Prose naming [an owner](../../packages/semantic-core/src/index.ts) with 47 lines spare.",
      "| Owner | Headroom | Consequence |",
    ].join("\n")),
    ["line 1: ../../packages/semantic-core/src/semantic-process-runtime.ts states 47"],
  );
});

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
