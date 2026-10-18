import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { withoutBackticks } from "./markdown-tables.ts";
import { processFindingSections, type ProcessFinding } from "./process-assessment-ledger.ts";
import { headingSection } from "./markdown-sections.ts";
import { reviewedDetailMapWordBudget } from "./document-control-plane.ts";
import { isHandWrittenSourcePath } from "./source-measure.ts";

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
/** Subsection naming each source owner the implementation grows and the condition that constrains it. */
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

function isExecutableLink(target: string): boolean {
  return target.endsWith(".test.ts") || target.endsWith(".spec.ts") ||
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
    5400,
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
      "docs/ENGINE-DATA-FAMILY-IMPLEMENTATION-MAP.md",
    ),
    4000,
  );
  assert.equal(
    reviewedDetailMapWordBudget(
      "docs/ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md",
    ),
    4500,
  );
  assert.equal(
    reviewedDetailMapWordBudget(
      "docs/ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md",
    ),
    4300,
  );
});

test("routes verification detail to one task owner instead of duplicating the manual", async () => {
  const entry = await readFile(path.join(projectRoot, "docs/TESTING-SPEC.md"), "utf8");
  const guide = await readFile(path.join(projectRoot, "CLAUDE.md"), "utf8");
  const routes = [
    ["REVIEW-POLICY.md", "Independent cold-review gate"],
    ["SEMANTIC-VERIFICATION-POLICY.md", "Current Lean and semantic-core gate"],
    ["CIB-OBSERVATION-POLICY.md", "Canonical CIB observation fidelity"],
    ["TEMPORAL-VERIFICATION-POLICY.md", "Current Temporal gate"],
    ["PLATFORM-VERIFICATION-POLICY.md", "Browser acceptance"],
    ["VERIFICATION-INFRASTRUCTURE-POLICY.md", "Long-running JavaScript and TypeScript commands"],
  ] as const;
  const assertRouting = (document: string): void => {
    for (const [owner, heading] of routes) {
      assert.ok(document.includes(`](${owner})`), `entry must route to ${owner}`);
      assert.ok(!document.includes(`## ${heading}\n`), `detail belongs in ${owner}`);
    }
    for (const heading of ["Select the task owner", "Three-level verification policy", "Focused gate matrix", "Profile release-readiness gate"]) {
      assert.ok(document.includes(`## ${heading}\n`), `missing entry contract: ${heading}`);
    }
  };
  assertRouting(entry);
  for (const [owner, heading] of routes) {
    const detail = await readFile(path.join(projectRoot, "docs", owner), "utf8");
    assert.ok(detail.includes(`## ${heading}\n`), `${owner} must own its routed contract`);
    assert.throws(() => assertRouting(entry.replace(`](${owner})`, "](missing.md)")));
    assert.throws(() => assertRouting(`${entry}\n## ${heading}\n`));
  }
  assert.match(guide, /TESTING-SPEC\.md#select-the-task-owner/u);
  assert.match(guide, /Do not import every testing policy for ordinary work/u);
  const infrastructure = await readFile(path.join(projectRoot, "docs/VERIFICATION-INFRASTRUCTURE-POLICY.md"), "utf8");
  assert.match(infrastructure, /Documentation discipline\]\(DOC-DISCIPLINE\.md\).*reviewability budgets/u);
  assert.doesNotMatch(entry, /4,500 for contracts\/source|5,000 for the exact Temporal-hosting/u);
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
        finding: "browser-guarded recurrence",
        instances: "2",
        disposition: "`executable guard`",
        evidence: "[browser check](../showcase/platform-ui-quality/e2e/action-history.spec.ts)",
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
  const rows = processFindingSections(ledger);

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
// capsule graduates, the constraints have already been met and re-asserting them is churn. Only the
// owners' *names* are required: `node scripts/what-binds.ts <path>...` reports each named owner's
// current headroom, so the capsule keeps no figure of its own (see the ban below).
test("every capsule proposal names the guards and owners that already bind it", async () => {
  const capsuleRoot = "docs/capsules";
  const entries = await readdir(path.join(projectRoot, capsuleRoot));
  const proposals = entries.filter((entry) => entry.endsWith("-PROPOSAL.md"));
  const findings: string[] = [];
  for (const proposal of proposals) {
    const markdown = await readFile(path.join(projectRoot, capsuleRoot, proposal), "utf8");
    const section = headingSection(markdown, bindingInventoryHeading);
    if (section === null) {
      findings.push(`${proposal}: no ${bindingInventoryHeading} section`);
      continue;
    }
    const linked = [...new Set(linkedPaths(section, capsuleRoot))];
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
    if (!resolved.some((target) => !target.endsWith(".test.ts") && isHandWrittenSourcePath(target))) {
      findings.push(`${proposal}: names no source owner it will grow`);
    }
    if (headingSection(section, ownerInventoryHeading) === null) {
      findings.push(`${proposal}: no ${ownerInventoryHeading} subsection`);
    }
  }

  // Anti-vacuity guards the discovery, not the project's current state: every capsule graduating to
  // `-SPEC` is a legitimate outcome and leaves zero proposals, while a broken glob must still fail.
  assert.deepEqual(
    { capsuleCount: entries.some((entry) => entry.endsWith("-SPEC.md")), findings },
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
 * A living proposal or specification keeps no owner-headroom figure at all.
 *
 * Headroom has one owner: `node scripts/what-binds.ts <path>...` measures it from the source at the
 * moment a change is planned. A figure copied into a document is a second copy of a fact that changes
 * whenever any capsule grows the shared owner, so it went stale in documents unrelated to the change:
 * fifteen documents carried about 250 such rows, a guard recomputed them on every run, and growing one
 * core file failed the gate for capsules that never touched it. Recomputation kept the copies true but
 * still made every size change edit unrelated documents; removing the copies removes that coupling.
 * A structural condition stays expressible without a figure ("extract before growth would exceed the
 * review target"), which is the form a plan needs.
 *
 * The match is on any table's column header rather than one heading string, so a renamed owner table
 * stays inside the ban. A dated record of lines a past change *added* is history, not a headroom
 * copy, and its header names no headroom.
 */
function retainedHeadroomFigures(markdown: string): ReadonlyArray<string> {
  const lines = markdown.split("\n");
  return lines.flatMap((line, index) => {
    const header = /^\|[\s:|-]+\|\s*$/u.test(lines[index + 1] ?? "");
    return header && /headroom|before (?:the )?800/iu.test(line)
      ? [`line ${index + 1}: table column states owner headroom`]
      : [];
  });
}

test("no living proposal or specification retains an owner-headroom figure", async () => {
  const documents: string[] = [];
  for (const tree of ["docs", "docs/capsules"] as const) {
    for (const entry of await readdir(path.join(projectRoot, tree))) {
      if (entry.endsWith("-PROPOSAL.md") || entry.endsWith("-SPEC.md")) {
        documents.push(`${tree}/${entry}`);
      }
    }
  }
  assert.ok(documents.length > 5, `document enumeration returned ${documents.length} files`);
  const findings: string[] = [];
  for (const document of documents) {
    const markdown = await readFile(path.join(projectRoot, document), "utf8");
    findings.push(...retainedHeadroomFigures(markdown).map((finding) => `${document}: ${finding}`));
  }

  assert.deepEqual(
    findings,
    [],
    "name the owner and the structural condition; `what-binds` owns its current headroom",
  );
});

test("the headroom ban matches headroom columns and ignores prose, guard rows and history", () => {
  assert.deepEqual(
    retainedHeadroomFigures([
      "| Owner | Headroom | Consequence |",
      "|---|---:|---|",
      "| [runtime](../../packages/semantic-core/src/semantic-process-runtime.ts) | 47 | Sufficient. |",
      "",
      "| Owner | Remaining nonblank lines before the 800-line review target |",
      "|---|---:|",
      "",
      "| Existing helper owner | Added nonblank lines | Proven function contract |",
      "|---|---:|---|",
      "| [what-binds](../../scripts/what-binds.test.ts) | Reports current headroom. |",
      "Prose naming [an owner](../../packages/semantic-core/src/index.ts) with 47 lines of headroom.",
    ].join("\n")),
    ["line 1: table column states owner headroom", "line 5: table column states owner headroom"],
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
