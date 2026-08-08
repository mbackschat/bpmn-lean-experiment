/**
 * Requires an ordered-work item's status label to agree with what the resume point says blocks it.
 *
 * [PLAN.md](../docs/PLAN.md) states each item's status twice by design: once as the item's own label,
 * and once as a resume-point sentence naming what blocks it. The two are written at different times,
 * so an approval or a landed lane updates one and leaves the other. That happened: item 13 read
 * *"Blocked on owner approval … the only thing blocking implementation"* for eleven commits after the
 * same document recorded it as *"blocked on nothing"* and owner-approved, and an independent reviewer
 * found it rather than a gate.
 *
 * Its limit is deliberate. It compares two statements the document already makes; it cannot tell
 * whether either is true. A label and a resume sentence that are consistently wrong pass, and keeping
 * status current against the tree remains a review obligation.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const planPath = path.join(projectRoot, "docs/PLAN.md");
const implementationMapPath = path.join(projectRoot, "docs/IMPLEMENTATION-MAP.md");
const orderedWorkHeading = "## Ordered work";
const blockedLabelPrefix = "Blocked";
const unblockedClaim = "nothing";
const milestoneIds = ["M0", "M1", "M2", "M3", "M4", "M5"] as const;
const milestoneStatusValues = ["closed", "in progress", "not started"] as const;

type MilestoneStatus = (typeof milestoneStatusValues)[number];

function milestoneStatuses(markdown: string): ReadonlyMap<string, MilestoneStatus> {
  const statuses = new Map<string, MilestoneStatus>();
  for (const milestoneId of milestoneIds) {
    const heading = new RegExp(`^### ${milestoneId} (?:\\u2014|-) .+$`, "mu");
    const headingMatch = heading.exec(markdown);
    if (headingMatch === null) {
      continue;
    }
    const bodyStart = headingMatch.index + headingMatch[0].length;
    const nextHeading = markdown.indexOf("\n### ", bodyStart);
    const body = markdown.slice(bodyStart, nextHeading < 0 ? markdown.length : nextHeading);
    const statusMatch = /^\*\*Status: (closed|in progress|not started)\.\*\*/mu.exec(body);
    if (statusMatch?.[1] !== undefined) {
      statuses.set(milestoneId, statusMatch[1] as MilestoneStatus);
    }
  }
  return statuses;
}

function platformImplementationIsAbsent(implementationMap: string): boolean {
  const platformStart = implementationMap.indexOf("### BPM platform");
  if (platformStart < 0) {
    return false;
  }
  const nextSection = implementationMap.indexOf("\n### ", platformStart + 1);
  const platformSection = implementationMap.slice(
    platformStart,
    nextSection < 0 ? implementationMap.length : nextSection,
  );
  return platformSection.includes("- Nothing. No part of product 2 exists.");
}

function milestoneContradictions(
  plan: string,
  implementationMap: string,
): ReadonlyArray<string> {
  const statuses = milestoneStatuses(plan);
  const findings: string[] = [];
  if (platformImplementationIsAbsent(implementationMap) && statuses.get("M1") === "closed") {
    findings.push("M1 is closed while the BPM platform implementation is absent");
  }
  return findings;
}

/** The status word an ordered-work item leads with, before its em-dashed subject or closing colon. */
function orderedWorkLabels(markdown: string): ReadonlyMap<number, string> {
  const start = markdown.indexOf(orderedWorkHeading);
  const labels = new Map<number, string>();
  if (start < 0) {
    return labels;
  }
  const afterHeading = start + orderedWorkHeading.length;
  const nextHeading = markdown.indexOf("\n## ", afterHeading);
  const section = markdown.slice(
    afterHeading,
    nextHeading < 0 ? markdown.length : nextHeading,
  );
  for (const [, ordinal, label] of section.matchAll(
    /^(\d+)\. \*\*([^—:*]+?) *[—:]/gmu,
  )) {
    if (ordinal !== undefined && label !== undefined) {
      labels.set(Number(ordinal), label);
    }
  }
  return labels;
}

function orderedWorkSection(markdown: string): string {
  const start = markdown.indexOf(orderedWorkHeading);
  if (start < 0) {
    return "";
  }
  const afterHeading = start + orderedWorkHeading.length;
  const nextHeading = markdown.indexOf("\n## ", afterHeading);
  return markdown.slice(afterHeading, nextHeading < 0 ? markdown.length : nextHeading);
}

/** Numbered entries in the section, regardless of whether their label parsed. */
function orderedWorkEntryCount(markdown: string): number {
  return [...orderedWorkSection(markdown).matchAll(/^\d+\. /gmu)].length;
}

/** Ordinals in written order, for the contiguity check. */
function orderedWorkOrdinals(markdown: string): ReadonlyArray<number> {
  return [...orderedWorkSection(markdown).matchAll(/^(\d+)\. /gmu)].map(
    ([, ordinal]) => Number(ordinal),
  );
}

/** Resume-point sentences of the form `Item 13 is **blocked on nothing**`. */
function blockedClaims(markdown: string): ReadonlyMap<number, string> {
  const claims = new Map<number, string>();
  for (const [, ordinal, blocker] of markdown.matchAll(
    /Item (\d+) is \*\*blocked on ([^*]+)\*\*/gu,
  )) {
    if (ordinal !== undefined && blocker !== undefined) {
      claims.set(Number(ordinal), blocker.trim());
    }
  }
  return claims;
}

function disagreements(markdown: string): ReadonlyArray<string> {
  const labels = orderedWorkLabels(markdown);
  const found: string[] = [];
  for (const [ordinal, blocker] of blockedClaims(markdown)) {
    const label = labels.get(ordinal);
    if (label === undefined) {
      found.push(`item ${ordinal} is claimed blocked but has no ordered-work entry`);
      continue;
    }
    const labelBlocks = label.startsWith(blockedLabelPrefix);
    if (blocker === unblockedClaim && labelBlocks) {
      found.push(`item ${ordinal} is labelled "${label}" but claimed blocked on nothing`);
    }
    if (blocker !== unblockedClaim && !labelBlocks) {
      found.push(`item ${ordinal} is labelled "${label}" but claimed blocked on ${blocker}`);
    }
  }
  return found;
}

test("keeps every ordered-work status label consistent with its resume-point claim", async () => {
  const markdown = await readFile(planPath, "utf8");

  // Anti-vacuity covers the label discovery only. A plan with nothing blocked is a legitimate state
  // and produces no resume-point claim, so requiring one would fail the moment the last blocker
  // cleared; the negative test below keeps the comparison itself honest instead.
  //
  // This compares the parser against the section's own entry count rather than a minimum, because a
  // minimum makes the plan's size load-bearing for a check about parsing. The earlier form required
  // more than five labels and would have failed the subtraction pass that cut the section to three.
  const labels = orderedWorkLabels(markdown);
  assert.equal(
    labels.size,
    orderedWorkEntryCount(markdown),
    "the label parser must see every numbered ordered-work entry",
  );

  assert.deepEqual(disagreements(markdown), []);
});

test("keeps showcase milestone status consistent with the implementation boundary", async () => {
  const [plan, implementationMap] = await Promise.all([
    readFile(planPath, "utf8"),
    readFile(implementationMapPath, "utf8"),
  ]);
  const statuses = milestoneStatuses(plan);

  assert.deepEqual(
    [...statuses.keys()],
    milestoneIds,
    "every showcase milestone must carry one explicit status",
  );
  assert.deepEqual(milestoneContradictions(plan, implementationMap), []);
});

test("rejects closing M1 while the BPM platform implementation is absent", () => {
  const plan = [
    "### M0 - shipped floor",
    "",
    "**Status: closed.**",
    "",
    "### M1 - third-party deployment",
    "",
    "**Status: closed.**",
    "",
    "### M2 - cycles",
    "",
    "**Status: not started.**",
    "",
    "### M3 - data",
    "",
    "**Status: not started.**",
    "",
    "### M4 - incidents",
    "",
    "**Status: not started.**",
    "",
    "### M5 - history",
    "",
    "**Status: not started.**",
  ].join("\n");
  const implementationMap = [
    "### BPM platform",
    "",
    "#### Implemented",
    "",
    "- Nothing. No part of product 2 exists.",
    "",
    "### A12 Workflows downstream adoption",
  ].join("\n");

  assert.deepEqual(milestoneContradictions(plan, implementationMap), [
    "M1 is closed while the BPM platform implementation is absent",
  ]);
  const inProgress = plan.replace(
    "### M1 - third-party deployment\n\n**Status: closed.**",
    "### M1 - third-party deployment\n\n**Status: in progress.**",
  );
  assert.deepEqual(
    milestoneContradictions(inProgress, implementationMap),
    [],
  );
});

/**
 * Keeps the plan a control document rather than a feature-history board.
 *
 * [DOC-DISCIPLINE.md](../docs/DOC-DISCIPLINE.md) says `PLAN.md` owns immediate execution order and is
 * not a history board, and the plan itself carried a paragraph instructing its resume point to stay
 * pruned. Both are prose, and both failed: the file reached 19,758 words with a section that had been
 * pruned once re-accumulating to 2,786. These bounds exist because the third restatement of the same
 * rule is a guard, not another sentence.
 *
 * The word bounds are backstops behind the structural checks, not the mechanism. Compression
 * satisfies a count while making the document worse, which is why deleting completed entries and
 * resolving the next-item reference are checked directly.
 */
const planWordBackstop = 6000;
const resumeWordBackstop = 500;

function sectionWords(markdown: string, heading: string): number {
  const start = markdown.indexOf(heading);
  assert.notEqual(start, -1, `PLAN.md must contain ${heading}`);
  const afterHeading = start + heading.length;
  const nextHeading = markdown.indexOf("\n## ", afterHeading);
  const body = markdown.slice(afterHeading, nextHeading < 0 ? markdown.length : nextHeading);
  return body.split(/\s+/u).filter(Boolean).length;
}

test("keeps the plan sized and shaped as a control document", async () => {
  const markdown = await readFile(planPath, "utf8");

  const completed = [...orderedWorkSection(markdown).matchAll(/^\d+\. \*\*Completed/gmu)];
  assert.deepEqual(
    completed.map(([entry]) => entry),
    [],
    "a completed entry belongs to its specification, ledger, or Git, not to ordered work",
  );

  const ordinals = orderedWorkOrdinals(markdown);
  assert.deepEqual(
    ordinals,
    ordinals.map((_, index) => index + 1),
    `ordered work must be numbered contiguously from 1, found ${ordinals.join(", ")}`,
  );

  const resumeWords = sectionWords(markdown, "## Exact resume point");
  assert.ok(
    resumeWords <= resumeWordBackstop,
    `the resume point is ${resumeWords} words against a ${resumeWordBackstop}-word backstop`,
  );

  const planWords = markdown.split(/\s+/u).filter(Boolean).length;
  assert.ok(
    planWords <= planWordBackstop,
    `PLAN.md is ${planWords} words against a ${planWordBackstop}-word backstop`,
  );
});

/** Every ordinal the resume point names as next must resolve to an entry that exists. */
test("resolves the resume point's next-item reference to a real entry", async () => {
  const markdown = await readFile(planPath, "utf8");
  const resume = markdown.slice(markdown.indexOf("## Exact resume point"));
  const ordinals = new Set(orderedWorkOrdinals(markdown));
  const dangling = [...resume.matchAll(/ordered-work item (\d+)/gu)]
    .map(([, ordinal]) => Number(ordinal))
    .filter((ordinal) => !ordinals.has(ordinal));
  assert.deepEqual(dangling, [], "the resume point names an ordered-work item that does not exist");
});

/** Locks the shape checks against the exact states the plan shipped. */
test("rejects a completed entry, a numbering gap, and a dangling next reference", () => {
  const shipped = [
    orderedWorkHeading,
    "1. **Next — open the admission proposal:** not started.",
    "",
    "## Exact resume point",
    "",
    "Next action: ordered-work item 1.",
  ].join("\n");
  assert.deepEqual(orderedWorkOrdinals(shipped), [1]);

  const withCompleted = shipped.replace(
    "1. **Next — open",
    "1. **Completed — closed the capsule:** done.\n2. **Next — open",
  );
  assert.equal(
    [...orderedWorkSection(withCompleted).matchAll(/^\d+\. \*\*Completed/gmu)].length,
    1,
  );

  const gapped = shipped.replace("1. **Next", "2. **Next");
  assert.deepEqual(orderedWorkOrdinals(gapped), [2]);

  const dangling = shipped.replace("ordered-work item 1.", "ordered-work item 9.");
  const ordinals = new Set(orderedWorkOrdinals(dangling));
  assert.equal(ordinals.has(9), false);
});

/** Locks the detector against the exact contradiction the plan shipped, in both directions. */
test("rejects a blocked label beside an unblocked claim, and the reverse", () => {
  const shipped = [
    orderedWorkHeading,
    "13. **Blocked on owner approval — interrupting Activity boundary Timer capsule:** owner",
    "approval remains outstanding and is the only thing blocking implementation.",
    "",
    "## Exact resume point",
    "",
    "Item 13 is **blocked on nothing**. The proposal is owner-approved.",
  ].join("\n");
  assert.equal(disagreements(shipped).length, 1);

  const reversed = shipped
    .replace("Blocked on owner approval — ", "In progress — ")
    .replace("blocked on nothing", "blocked on owner approval");
  assert.equal(disagreements(reversed).length, 1);

  const consistent = shipped.replace("Blocked on owner approval — ", "In progress — ");
  assert.deepEqual(disagreements(consistent), []);
});
