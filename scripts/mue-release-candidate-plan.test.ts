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

const unfinishedExecutionOrder = ["CIB7-PRACTICAL-COVERAGE"] as const;
const semanticExecutionOrder = [
  "STRUCTURED-PROCESS-COMPOSITION",
  "CALL-ACTIVITY-DATA-BOUNDARIES",
  "INTERRUPTING-MESSAGE-EVENT-SUBPROCESS",
  "CIB7-PRACTICAL-COVERAGE",
] as const;

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
  assert.deepEqual(orderedIds, unfinishedExecutionOrder, "ordered work must retain practical coverage planning");
  assertSemanticsWindow(plan);
});

test("keeps the current semantic checkpoint ahead of practical coverage planning", async () => {
  const plan = await readFile(path.join(projectRoot, "docs/PLAN.md"), "utf8");
  assertSemanticsWindow(plan);
  const active = parseOrderedWork(plan).find(({ state }) => state === "active");
  assert.ok(active !== undefined);
  assert.throws(() => assertSemanticsWindow(plan.replace(
    `\`${active.id}\` · **active**`,
    `\`${active.id}\` · **queued**`,
  )), /semantic work/u);
  assert.throws(() => assertSemanticsWindow(plan.replace(
    "`CIB7-PRACTICAL-COVERAGE` · **queued**",
    "`MUE-ACCEPTANCE` · **queued**",
  )), /MUE acceptance/u);
  assert.throws(() => assertSemanticsWindow(plan.replaceAll(
    "CALL-ACTIVITY-DATA-BOUNDARIES", "UNSELECTED-CAPABILITY",
  )), /selected order/u);
});

test("the semantic window permits every selected queue advance", async () => {
  const plan = await readFile(path.join(projectRoot, "docs/PLAN.md"), "utf8");
  for (const activeIndex of [1, 2, 3]) {
    const advanced = parseOrderedWork(plan).slice(0, semanticExecutionOrder.length).reduce((text, entry, index) => text.replace(
      `\`${entry.id}\` · **${entry.state}**`,
      `\`${entry.id}\` · **${index < activeIndex ? "later" : index === activeIndex ? "active" : "queued"}**`,
    ), plan);
    assert.doesNotThrow(() => assertSemanticsWindow(advanced));
  }
});

test("the semantic window rejects skipped predecessors, deferred successors and multiple active items", async () => {
  const plan = await readFile(path.join(projectRoot, "docs/PLAN.md"), "utf8");
  for (const states of [
    ["queued", "active", "queued", "queued"],
    ["later", "queued", "active", "queued"],
    ["active", "later", "queued", "queued"],
    ["later", "active", "later", "queued"],
    ["active", "active", "queued", "queued"],
    ["later", "later", "later", "later"],
    ["later", "later", "queued", "active"],
  ]) {
    const invalid = parseOrderedWork(plan).slice(0, semanticExecutionOrder.length).reduce((text, entry, index) => text.replace(
      `\`${entry.id}\` · **${entry.state}**`, `\`${entry.id}\` · **${states[index]}**`,
    ), plan);
    assert.throws(() => assertSemanticsWindow(invalid), /semantic (queue|work)/u);
  }
});

function assertSemanticsWindow(plan: string): void {
  const entries = parseOrderedWork(plan);
  assert.ok(!entries.some(({ id }) => id === "MUE-ACCEPTANCE"),
    "MUE acceptance must not be a separate work item or prerequisite");
  assert.deepEqual(entries.slice(0, semanticExecutionOrder.length).map(({ id }) => id),
    semanticExecutionOrder, "pulled-forward capabilities must retain the selected order");
  const selected = entries.slice(0, semanticExecutionOrder.length);
  const activeIndex = selected.findIndex(({ state }) => state === "active");
  assert.ok(activeIndex >= 0 && entries.filter(({ state }) => state === "active").length === 1,
    "exactly one selected semantic work item must be active");
  assert.deepEqual(selected.map(({ state }) => state), selected.map((_, index) =>
    index < activeIndex ? "later" : index === activeIndex ? "active" : "queued"),
  "semantic queue must retain deferred predecessors and queued successors");
}

test("practical coverage retains both subprocess forms without forcing their priority", async () => {
  const plan = await readFile(path.join(projectRoot, "docs/PLAN.md"), "utf8");
  const assertExtension = (document: string): void => {
    const section = document.split("### Practical CIB7 Coverage goal\n")[1]?.split("\n## ")[0];
    assert.ok(section !== undefined);
    const rows = section.split("\n").filter(line => line.startsWith("| `"));
    assert.deepEqual(rows.map(line => /^\| `([^`]+)` \| `(queued|active|satisfied)` \|/u.exec(line)?.slice(1)), [
      ["SEQUENTIAL-MULTI-INSTANCE-SUBPROCESS", "queued"],
      ["PARALLEL-MULTI-INSTANCE-SUBPROCESS", "queued"],
    ], "both practical coverage obligations must remain explicit and unfinished");
    assert.match(section, /2026-10-03/u);
    assert.match(section, /PROJECT-DESIGN\.md#cib-seven-220-breadth-ordering/u);
  };
  assertExtension(plan);
  for (const id of ["SEQUENTIAL-MULTI-INSTANCE-SUBPROCESS", "PARALLEL-MULTI-INSTANCE-SUBPROCESS"]) {
    assert.throws(() => assertExtension(plan.replace(`| \`${id}\` | \`queued\` |`, `| \`${id}\` | \`satisfied\` |`)), /unfinished/u);
    assert.throws(() => assertExtension(plan.split("\n").filter(line => !line.startsWith(`| \`${id}\` |`)).join("\n")), /unfinished/u);
  }
});

test("rejects unfinished content, premature later work and a broader hidden denominator", async () => {
  const plan = await readFile(path.join(projectRoot, "docs/PLAN.md"), "utf8");
  const prematureLaterWork = plan.replace("`CIB7-PRACTICAL-COVERAGE` · **queued**", "`MUE-ACCEPTANCE` · **queued**");
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
  assert.throws(() => assertReleaseCandidatePath(prematureLaterWork), /practical coverage planning/u);
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
  assert.deepEqual(orderedIds, unfinishedExecutionOrder, "ordered work must retain practical coverage planning");
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
