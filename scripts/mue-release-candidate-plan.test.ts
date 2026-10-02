import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { parseOrderedWork } from "./document-control-plane.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

const releaseCandidateContent = [
  ["SEQUENTIAL-MULTI-INSTANCE", "satisfied"],
  ["INTERNAL-COMMUTATION", "satisfied"],
  ["PARALLEL-MULTI-INSTANCE", "satisfied"],
  ["MECHANISM-MATURITY-EVIDENCE", "satisfied"],
  ["DATA-AND-TASK-MECHANISMS", "satisfied"],
  ["EVENT-SUBSCRIPTIONS", "satisfied"],
  ["COMPENSATION-TRANSACTIONS", "satisfied"],
] as const;

const unfinishedExecutionOrder = ["MUE-ACCEPTANCE"] as const;

test("freezes all seven selected RC capabilities before integration", async () => {
  const plan = await readFile(path.join(projectRoot, "docs/PLAN.md"), "utf8");
  const section = releaseCandidateSection(plan);
  const rows = section.split("\n").filter((line) => line.startsWith("| `")).map((line) => {
    const match = /^\| `([A-Z][A-Z0-9-]*)` \| `(satisfied|active|queued)` \| (\S.+) \| (\S.+) \|$/u.exec(line);
    assert.ok(match !== null, `every RC content row must use the stable four-column contract: ${line}`);
    const [, id, state, boundary, owner] = match;
    assert.ok(id !== undefined && state !== undefined && boundary !== undefined && owner !== undefined);
    assert.match(owner, /\[[^\]]+\]\([^)]+\)/u, `${id} needs a linked evidence or closure owner`);
    return [id, state] as const;
  });

  assert.deepEqual(rows, releaseCandidateContent);
  assert.equal(rows.filter(([, state]) => state === "satisfied").length, 7);
  assert.doesNotMatch(
    rows.map(([id]) => id).join("\n"),
    /^(?:H3-WORKLOAD-ISOLATION|CONFORMANCE-CLOSURE|MUE-RELEASE-CANDIDATE)$/mu,
    "later maturity work and the RC delivery checkpoint are not MUE content",
  );
  assert.match(section, /^Integration state: `satisfied`\.$/mu);
  assert.match(section, /feature surface freezes only after all seven rows are `satisfied`/u);
  assert.match(section, /H3-WORKLOAD-ISOLATION[^\n]+Engine `v0\.3`/u);
  assert.match(section, /CONFORMANCE-CLOSURE[^\n]+Engine `v0\.9`/u);

  const orderedIds = parseOrderedWork(plan)
    .filter(({ id }) => unfinishedExecutionOrder.includes(id as typeof unfinishedExecutionOrder[number]))
    .map(({ id }) => id);
  assert.deepEqual(orderedIds, unfinishedExecutionOrder, "ordered work must retain frozen integration");
  assertSemanticsWindow(plan);
});

test("keeps pulled-forward semantics ordered outside deferred MUE acceptance", async () => {
  const plan = await readFile(path.join(projectRoot, "docs/PLAN.md"), "utf8");
  assertSemanticsWindow(plan);
  assert.throws(() => assertSemanticsWindow(plan.replace(
    "`STRUCTURED-PROCESS-COMPOSITION` · **active**",
    "`STRUCTURED-PROCESS-COMPOSITION` · **queued**",
  )), /semantic work/u);
  assert.throws(() => assertSemanticsWindow(plan.replace(
    "`MUE-ACCEPTANCE` · **later**",
    "`MUE-ACCEPTANCE` · **active**",
  )), /deferred MUE/u);
  assert.throws(() => assertSemanticsWindow(plan.replaceAll(
    "CALL-ACTIVITY-DATA-BOUNDARIES", "UNSELECTED-CAPABILITY",
  )), /selected order/u);
});

function assertSemanticsWindow(plan: string): void {
  const entries = parseOrderedWork(plan);
  assert.equal(entries.find(({ state }) => state === "active")?.id,
    "STRUCTURED-PROCESS-COMPOSITION", "semantic work must be active during the owner-selected window");
  assert.equal(entries.find(({ id }) => id === "MUE-ACCEPTANCE")?.state,
    "later", "deferred MUE acceptance must remain open outside semantic work");
  assert.deepEqual(entries.slice(0, 3).map(({ id }) => id), [
    "STRUCTURED-PROCESS-COMPOSITION",
    "CALL-ACTIVITY-DATA-BOUNDARIES",
    "INTERRUPTING-MESSAGE-EVENT-SUBPROCESS",
  ], "pulled-forward capabilities must retain the selected order");
}

test("rejects unfinished content, premature later work and a broader hidden denominator", async () => {
  const plan = await readFile(path.join(projectRoot, "docs/PLAN.md"), "utf8");
  const prematureLaterWork = plan.replace("`MUE-ACCEPTANCE` · **later**", "`CONFORMANCE-CLOSURE` · **later**");
  const rcMarker = "### MUE Release Candidate critical path\n";
  const rcStart = plan.indexOf(rcMarker);
  assert.notEqual(rcStart, -1);
  const broadened = plan.slice(0, rcStart) + plan.slice(rcStart).replace(
    "| `EVENT-SUBSCRIPTIONS` | `satisfied` |",
    "| `H3-WORKLOAD-ISOLATION` | `queued` | Later only. | [Maturity ladder](PROJECT-DESIGN.md#engine-maturity-roadmap-labels) |\n| `EVENT-SUBSCRIPTIONS` | `satisfied` |",
  );

  const unfinished = plan.slice(0, rcStart) + plan.slice(rcStart).replace(
    "| `COMPENSATION-TRANSACTIONS` | `satisfied` |",
    "| `COMPENSATION-TRANSACTIONS` | `queued` |",
  );
  assert.throws(() => assertReleaseCandidatePath(unfinished), /satisfied/u);
  assert.throws(() => assertReleaseCandidatePath(prematureLaterWork), /frozen integration/u);
  assert.throws(() => assertReleaseCandidatePath(broadened), /MUE content/u);
});

function assertReleaseCandidatePath(plan: string): void {
  const section = releaseCandidateSection(plan);
  const ids = section.split("\n")
    .filter((line) => line.startsWith("| `"))
    .map((line) => /^\| `([A-Z][A-Z0-9-]*)` \|/u.exec(line)?.[1]);
  assert.deepEqual(ids, releaseCandidateContent.map(([id]) => id), "RC table must retain exactly the selected MUE content");
  assert.ok(section.split("\n").filter((line) => line.startsWith("| `"))
    .every((line) => /^\| `[^`]+` \| `satisfied` \|/u.test(line)), "all seven RC boundaries must be satisfied before integration");
  const orderedIds = parseOrderedWork(plan)
    .filter(({ id }) => unfinishedExecutionOrder.includes(id as typeof unfinishedExecutionOrder[number]))
    .map(({ id }) => id);
  assert.deepEqual(orderedIds, unfinishedExecutionOrder, "ordered work must retain frozen integration");
}

function releaseCandidateSection(plan: string): string {
  const marker = "### MUE Release Candidate critical path\n";
  const start = plan.indexOf(marker);
  assert.notEqual(start, -1, `missing ${marker.trim()}`);
  const bodyStart = start + marker.length;
  const remainder = plan.slice(bodyStart);
  const nextHeading = remainder.search(/\n##(?:#)? /u);
  return remainder.slice(0, nextHeading === -1 ? undefined : nextHeading).trim();
}
