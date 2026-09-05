import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { parseOrderedWork } from "./document-control-plane.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

const releaseCandidateContent = [
  ["SEQUENTIAL-MULTI-INSTANCE", "satisfied"],
  ["INTERNAL-COMMUTATION", "queued"],
  ["PARALLEL-MULTI-INSTANCE", "satisfied"],
  ["MECHANISM-MATURITY-EVIDENCE", "queued"],
  ["DATA-AND-TASK-MECHANISMS", "active"],
  ["EVENT-SUBSCRIPTIONS", "queued"],
  ["COMPENSATION-TRANSACTIONS", "queued"],
] as const;

const unfinishedExecutionOrder = [
  "DATA-AND-TASK-MECHANISMS",
  "INTERNAL-COMMUTATION",
  "EVENT-SUBSCRIPTIONS",
  "COMPENSATION-TRANSACTIONS",
  "MECHANISM-MATURITY-EVIDENCE",
  "MUE-RELEASE-CANDIDATE",
] as const;

test("makes the MUE Release Candidate content and risk-first execution path explicit", async () => {
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
  assert.equal(rows.filter(([, state]) => state === "active").length, 1);
  assert.doesNotMatch(
    rows.map(([id]) => id).join("\n"),
    /^(?:H3-WORKLOAD-ISOLATION|CONFORMANCE-CLOSURE|MUE-RELEASE-CANDIDATE)$/mu,
    "later maturity work and the RC delivery checkpoint are not MUE content",
  );
  assert.match(section, /^Integration state: `queued`\.$/mu);
  assert.match(section, /feature surface freezes only after all seven rows are `satisfied`/u);
  assert.match(section, /H3-WORKLOAD-ISOLATION[^\n]+Engine `v0\.3`/u);
  assert.match(section, /CONFORMANCE-CLOSURE[^\n]+Engine `v0\.9`/u);

  const orderedIds = parseOrderedWork(plan)
    .filter(({ id }) => unfinishedExecutionOrder.includes(id as typeof unfinishedExecutionOrder[number]))
    .map(({ id }) => id);
  assert.deepEqual(orderedIds, unfinishedExecutionOrder, "ordered work must carry the RC risk-first sequence");
  assert.equal(parseOrderedWork(plan).find(({ state }) => state === "active")?.id, "DATA-AND-TASK-MECHANISMS");
});

test("rejects a chore-first RC path and a broader hidden denominator", async () => {
  const plan = await readFile(path.join(projectRoot, "docs/PLAN.md"), "utf8");
  const movedEvidenceFirst = plan
    .replace("`COMPENSATION-TRANSACTIONS` · **queued**", "`TEMP-RC-SLOT` · **queued**")
    .replace("`MECHANISM-MATURITY-EVIDENCE` · **queued**", "`COMPENSATION-TRANSACTIONS` · **queued**")
    .replace("`TEMP-RC-SLOT` · **queued**", "`MECHANISM-MATURITY-EVIDENCE` · **queued**");
  const rcMarker = "### MUE Release Candidate critical path\n";
  const rcStart = plan.indexOf(rcMarker);
  assert.notEqual(rcStart, -1);
  const broadened = plan.slice(0, rcStart) + plan.slice(rcStart).replace(
    "| `EVENT-SUBSCRIPTIONS` | `queued` |",
    "| `H3-WORKLOAD-ISOLATION` | `queued` | Later only. | [Maturity ladder](PROJECT-DESIGN.md#engine-maturity-roadmap-labels) |\n| `EVENT-SUBSCRIPTIONS` | `queued` |",
  );

  assert.throws(() => assertReleaseCandidatePath(movedEvidenceFirst), /risk-first sequence/u);
  assert.throws(() => assertReleaseCandidatePath(broadened), /MUE content/u);
});

function assertReleaseCandidatePath(plan: string): void {
  const section = releaseCandidateSection(plan);
  const ids = section.split("\n")
    .filter((line) => line.startsWith("| `"))
    .map((line) => /^\| `([A-Z][A-Z0-9-]*)` \|/u.exec(line)?.[1]);
  assert.deepEqual(ids, releaseCandidateContent.map(([id]) => id), "RC table must retain exactly the selected MUE content");
  const orderedIds = parseOrderedWork(plan)
    .filter(({ id }) => unfinishedExecutionOrder.includes(id as typeof unfinishedExecutionOrder[number]))
    .map(({ id }) => id);
  assert.deepEqual(orderedIds, unfinishedExecutionOrder, "ordered work must retain the RC risk-first sequence");
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
