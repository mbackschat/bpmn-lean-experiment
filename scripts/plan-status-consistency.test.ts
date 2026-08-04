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
const orderedWorkHeading = "## Ordered work";
const blockedLabelPrefix = "Blocked";
const unblockedClaim = "nothing";

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
  const labels = orderedWorkLabels(markdown);
  assert.ok(labels.size > 5, `only ${labels.size} ordered-work labels parsed`);

  assert.deepEqual(disagreements(markdown), []);
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
