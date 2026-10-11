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

const deferredCheckpoints = [
  "STRUCTURED-PROCESS-COMPOSITION",
  "CALL-ACTIVITY-DATA-BOUNDARIES",
  "INTERRUPTING-MESSAGE-EVENT-SUBPROCESS",
] as const;

test("retains all seven closed RC capabilities in their historical milestone owner", async () => {
  const design = await read("docs/PROJECT-DESIGN.md");
  assertReleaseCandidateBoundary(design);
  const section = releaseCandidateSection(design);
  assert.match(section, /feature surface freezes only after all seven rows are `satisfied`/u);
  assert.match(section, /H3-WORKLOAD-ISOLATION[^\n]+Engine `v0\.3`/u);
  assert.match(section, /CONFORMANCE-CLOSURE[^\n]+Engine `v0\.9`/u);
  assert.match(section, /`v0\.2\.0-rc\.1` distribution at `16c5b9f6`/u);
  assert.match(section, /existing bounded native-runtime risk exception/u);
  assert.match(section, /MUE acceptance has not passed[^\n]+no further tag move is authorized/u);
});

test("puts practical delivery first and retains only genuinely deferred private checkpoints", async () => {
  const plan = await read("docs/PLAN.md");
  assertForwardWork(plan);
  for (const invalid of [
    plan.replace("`CIB7-PRACTICAL-COVERAGE` · **active**", "`CIB7-PRACTICAL-COVERAGE` · **queued**"),
    plan.replace("`CIB7-PRACTICAL-COVERAGE` ·", "`MUE-ACCEPTANCE` ·"),
    plan.replaceAll("CALL-ACTIVITY-DATA-BOUNDARIES", "UNSELECTED-CAPABILITY"),
    plan.replace("`STRUCTURED-PROCESS-COMPOSITION` · **later**", "`STRUCTURED-PROCESS-COMPOSITION` · **active**"),
    plan.replace("`CALL-ACTIVITY-DATA-BOUNDARIES` · **later**", "`CALL-ACTIVITY-DATA-BOUNDARIES` · **queued**"),
  ]) assert.throws(() => assertForwardWork(invalid), /practical|deferred|MUE acceptance/u);
});

test("rejects a deferred checkpoint ahead of the selected delivery outcome", async () => {
  const plan = await read("docs/PLAN.md");
  const lines = plan.split("\n");
  const activeIndex = lines.findIndex(line => line.startsWith("1. `CIB7-PRACTICAL-COVERAGE`"));
  const deferredIndex = lines.findIndex(line => line.startsWith("2. `STRUCTURED-PROCESS-COMPOSITION`"));
  const activeLine = lines[activeIndex];
  const deferredLine = lines[deferredIndex];
  assert.ok(activeLine !== undefined && deferredLine !== undefined);
  lines[activeIndex] = deferredLine;
  lines[deferredIndex] = activeLine;
  assert.throws(() => assertForwardWork(lines.join("\n")), /practical delivery must precede/u);
});

test("routes PLAN history to its existing owners", async () => {
  const plan = await read("docs/PLAN.md");
  for (const owner of [
    "MUE-PREVIEW-BETA-SPEC.md#historical-beta-content-boundary",
    "PROJECT-DESIGN.md#historical-rc-content-boundary",
  ]) {
    assertHistoryRoute(plan, owner);
    assert.throws(() => assertHistoryRoute(plan.replace(owner, "PLAN.md#ordered-work"), owner), /historical owner/u);
  }
});

test("the checklist retains both required Sub-Process outcomes without duplicating PLAN states", async () => {
  const [plan, coverage] = await Promise.all([read("docs/PLAN.md"), read("docs/PRACTICAL-CIB7-COVERAGE-TARGET.md")]);
  assert.match(plan, /PRACTICAL-CIB7-COVERAGE-TARGET\.md#delivery-task-list/u);
  assert.match(plan, /PROJECT-DESIGN\.md#cib-seven-220-breadth-ordering/u);
  for (const id of ["PC-MI-04", "PC-MI-05"] as const) {
    assertPracticalSubprocessOutcome(coverage, id);
    const row = coverage.split("\n").find(line => line.startsWith("| `" + id + "` |"));
    assert.ok(row !== undefined);
    assert.throws(() => assertPracticalSubprocessOutcome(coverage.replace(row, ""), id), /required checklist/u);
    assert.throws(() => assertPracticalSubprocessOutcome(coverage.replace(row, row + "\n" + row), id), /required checklist/u);
    assert.throws(() => assertPracticalSubprocessOutcome(coverage.replace(row, row.replace(
      id === "PC-MI-04" ? "SEQUENTIAL-MULTI-INSTANCE-SUBPROCESS" : "PARALLEL-MULTI-INSTANCE-SUBPROCESS",
      "CALL-ACTIVITY-DATA-BOUNDARIES",
    )), id), /semantic owner/u);
    const acceptance = row.split("|")[2];
    assert.ok(acceptance !== undefined);
    assert.throws(() => assertPracticalSubprocessOutcome(coverage.replace(row, row.replace(acceptance, " ")), id),
      /required acceptance/u);
  }
});

test("rejects missing, unfinished, duplicate and hidden broader historical RC content", async () => {
  const design = await read("docs/PROJECT-DESIGN.md");
  const row = releaseCandidateSection(design).split("\n").find(line => line.startsWith("| `EVENT-SUBSCRIPTIONS` |"));
  assert.ok(row !== undefined);
  for (const invalid of [
    design.replace(row, ""),
    design.replace("| `COMPENSATION-TRANSACTIONS` | `satisfied` |", "| `COMPENSATION-TRANSACTIONS` | `queued` |"),
    design.replace(row, row + "\n" + row),
    design.replace(row, "| `H3-WORKLOAD-ISOLATION` | `queued` | Later only. | [Maturity ladder](#engine-maturity-roadmap-labels) |\n" + row),
    design.replace("Integration state: `satisfied`.", "Integration state: `blocked`."),
  ]) assert.throws(() => assertReleaseCandidateBoundary(invalid), /MUE content|satisfied|integration/u);
});

function assertForwardWork(plan: string): void {
  const entries = parseOrderedWork(plan);
  assert.ok(!entries.some(({ id }) => id === "MUE-ACCEPTANCE"),
    "MUE acceptance must not be a separate work item or prerequisite");
  assert.equal(entries[0]?.id, "CIB7-PRACTICAL-COVERAGE", "practical delivery must precede deferred checkpoints");
  assert.equal(entries[0]?.state, "active", "practical delivery must retain its sole active work ID");
  assert.deepEqual(entries.slice(1).map(({ id }) => id), deferredCheckpoints,
    "deferred work must retain only the three unresolved private checkpoints");
  assert.ok(entries.slice(1).every(({ state }) => state === "later"), "private checkpoints must remain deferred");
}

function assertHistoryRoute(plan: string, owner: string): void {
  assert.ok(plan.includes("](" + owner + ")"), "PLAN must link its historical owner " + owner);
}

function assertPracticalSubprocessOutcome(coverage: string, id: "PC-MI-04" | "PC-MI-05"): void {
  const rows = coverage.split("\n").filter(line => line.startsWith("| `" + id + "` |"));
  assert.equal(rows.length, 1, id + " must retain one required checklist outcome");
  const row = rows[0] ?? "";
  const acceptance = row.split("|")[2]?.trim();
  assert.ok(acceptance !== undefined && acceptance.length > 0, id + " must retain its required acceptance");
  const owner = id === "PC-MI-04"
    ? "capsules/SEQUENTIAL-MULTI-INSTANCE-SUBPROCESS-PROPOSAL.md"
    : "capsules/PARALLEL-MULTI-INSTANCE-SUBPROCESS-PROPOSAL.md";
  assert.ok(row.includes("](" + owner + ")") || row.includes("](" + owner + "#"),
    id + " must retain its linked semantic owner");
}

function assertReleaseCandidateBoundary(design: string): void {
  const section = releaseCandidateSection(design);
  assert.match(section, /^\| Content ID \| State \| Exact RC closure boundary \| Evidence or closure owner \|$/mu);
  const rows = section.split("\n").filter(line => line.startsWith("| `")).map(line => {
    const match = /^\| `([A-Z][A-Z0-9-]*)` \| `(satisfied|active|queued)` \| (\S.+) \| (\S.+) \|$/u.exec(line);
    assert.ok(match !== null, "every RC content row must use the stable four-column contract: " + line);
    const [, id, state, boundary, owner] = match;
    assert.ok(id !== undefined && state !== undefined && boundary !== undefined && owner !== undefined);
    assert.match(owner, /\[[^\]]+\]\([^)]+\)/u, id + " needs a linked evidence or closure owner");
    return [id, state] as const;
  });
  assert.deepEqual(rows.map(([id]) => id), releaseCandidateContent.map(([id]) => id),
    "RC table must retain exactly the selected MUE content");
  assert.deepEqual(rows, releaseCandidateContent, "all seven RC boundaries must remain satisfied");
  assert.match(section, /^Integration state: `satisfied`\.$/mu, "historical RC integration must remain satisfied");
}

function releaseCandidateSection(design: string): string {
  const marker = "#### Historical RC content boundary\n";
  const start = design.indexOf(marker);
  assert.notEqual(start, -1, "missing " + marker.trim());
  const remainder = design.slice(start + marker.length);
  const nextHeading = remainder.search(/\n#{1,4} /u);
  return remainder.slice(0, nextHeading === -1 ? undefined : nextHeading).trim();
}

async function read(relativePath: string): Promise<string> {
  return await readFile(path.join(projectRoot, relativePath), "utf8");
}
