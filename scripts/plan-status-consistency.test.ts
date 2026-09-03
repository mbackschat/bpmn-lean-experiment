import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertPlanControlPlane,
  parseOrderedWork,
} from "./document-control-plane.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const planPath = path.join(projectRoot, "docs/PLAN.md");

const muePreviewBetaCriticalPath = [
  ["SEQUENTIAL-MULTI-INSTANCE", "satisfied"],
  ["INTERNAL-COMMUTATION", "satisfied"],
  ["PARALLEL-MULTI-INSTANCE", "satisfied"],
  ["MECHANISM-MATURITY-EVIDENCE", "satisfied"],
  ["DATA-AND-TASK-MECHANISMS", "satisfied"],
  ["EVENT-SUBSCRIPTIONS", "active"],
  ["COMPENSATION-TRANSACTIONS", "satisfied"],
] as const;

const muePreviewBetaRiskBands = [
  ["Subscription population/concurrency", "satisfied"],
  ["Subscription delivery/recovery", "satisfied"],
  ["Boundary-handler eligibility/lifetime", "satisfied"],
  ["Event Sub-Process snapshots", "satisfied"],
  ["Compensation order/cancellation", "satisfied"],
  ["Cross-Workflow durability", "satisfied"],
  ["Capability and evidence closure", "active"],
  ["Beta integration", "queued"],
] as const;

function muePreviewBetaSection(plan: string): string {
  const marker = "### MUE Preview Beta critical path\n";
  const start = plan.indexOf(marker);
  assert.notEqual(start, -1, `missing ${marker.trim()}`);
  const bodyStart = start + marker.length;
  const remainder = plan.slice(bodyStart);
  const nextHeading = remainder.search(/\n##(?:#)? /u);
  return remainder.slice(0, nextHeading === -1 ? undefined : nextHeading).trim();
}

function assertMuePreviewBetaCriticalPath(plan: string): void {
  const section = muePreviewBetaSection(plan);
  assert.match(
    section,
    /^\| Content ID \| State \| Exact Beta boundary \| Evidence or next-gate owner \|$/mu,
    "the MUE Preview Beta table needs its stable four-column contract",
  );
  const rows = section.split("\n").filter((line) => line.startsWith("| `")).map((line) => {
    const match = /^\| `([A-Z][A-Z0-9-]*)` \| `(satisfied|active|queued)` \| (\S.+) \| (\S.+) \|$/u.exec(line);
    assert.ok(match !== null, `every MUE Preview Beta content row must use the stable row contract: ${line}`);
    const [, id, state, boundary, evidence] = match;
    assert.ok(id !== undefined && state !== undefined && boundary !== undefined && evidence !== undefined);
    assert.ok(boundary.trim().length > 0, `${id} needs an exact Beta boundary`);
    assert.match(evidence, /\[[^\]]+\]\([^)]+\)/u, `${id} needs an evidence or next-gate owner`);
    return { id, state };
  });
  assert.equal(new Set(rows.map(({ id }) => id)).size, rows.length, "duplicate MUE Preview Beta content ID");
  assert.doesNotMatch(
    rows.map(({ id }) => id).join("\n"),
    /^(?:H3-WORKLOAD-ISOLATION|MUE-PREVIEW-BETA)$/mu,
    "delivery checkpoints and Engine v0.3 work are not MUE Beta content",
  );
  assert.deepEqual(
    rows.map(({ id, state }) => [id, state]),
    muePreviewBetaCriticalPath,
    "the MUE Preview Beta table must retain all seven authoritative content IDs and their current states",
  );
  const orderedActive = parseOrderedWork(plan).find(({ state }) => state === "active");
  assert.equal(rows.find(({ state }) => state === "active")?.id, orderedActive?.id, "the Beta path must identify the active ordered work ID");
  assert.match(section, /^Integration state: `blocked`\.$/mu, "Beta integration must remain blocked while a content row is active or queued");

  const riskMarker = "#### Risk-first execution bands\n";
  const riskStart = section.indexOf(riskMarker);
  assert.notEqual(riskStart, -1, `missing ${riskMarker.trim()}`);
  const riskRows = section.slice(riskStart + riskMarker.length)
    .split("\n")
    .filter((line) => /^\| \d+ \|/u.test(line))
    .map((line, index) => {
      const match = /^\| (\d+) \| `(satisfied|active|queued)` \| ([^|]+) \| \S.+ \|$/u.exec(line);
      assert.ok(match !== null, `every risk band must use the stable four-column contract: ${line}`);
      const [, order, state, band] = match;
      assert.equal(Number(order), index + 1, "risk bands must retain contiguous priority order");
      assert.ok(state !== undefined && band !== undefined);
      return [band.trim(), state] as const;
    });
  assert.deepEqual(
    riskRows,
    muePreviewBetaRiskBands,
    "the MUE Preview Beta risk bands must retain their current risk-first handoff",
  );
  const activeRiskBand = riskRows.find(([, state]) => state === "active");
  assert.equal(
    `Risk band: ${activeRiskBand?.[0]}.`,
    /^Risk band: .+\.$/mu.exec(plan)?.[0],
    "the exact resume point must name the active risk band",
  );
}

test("keeps the plan as one compact execution control document", async () => {
  const plan = await readFile(planPath, "utf8");
  assert.doesNotThrow(() => assertPlanControlPlane(plan));
});

test("rejects multiple active items, malformed states, duplicate IDs, and a dangling resume", async () => {
  const plan = await readFile(planPath, "utf8");
  const entries = parseOrderedWork(plan);
  const activeEntry = entries.find((entry) => entry.state === "active");
  const queuedEntry = entries.find((entry) => entry.state === "queued");
  assert.ok(activeEntry !== undefined);
  assert.ok(queuedEntry !== undefined);
  assert.throws(
    () => assertPlanControlPlane(plan.replace(
      `\`${queuedEntry.id}\` · **queued**`,
      `\`${queuedEntry.id}\` · **active**`,
    )),
    /exactly one active/u,
  );
  assert.throws(
    () => assertPlanControlPlane(plan.replace(
      `\`${queuedEntry.id}\` · **queued**`,
      `\`${queuedEntry.id}\` · **completed**`,
    )),
    /stable work contract/u,
  );
  assert.throws(
    () => assertPlanControlPlane(plan.replace(
      `\`${queuedEntry.id}\` · **queued**`,
      `\`${activeEntry.id}\` · **queued**`,
    )),
    /duplicate work ID/u,
  );
  assert.throws(
    () => assertPlanControlPlane(plan.replace(
      `Active work ID: \`${activeEntry.id}\`.`,
      "Active work ID: `UNKNOWN-WORK`.",
    )),
    /resume work ID/u,
  );
});

test("makes the complete MUE Preview Beta critical path executable", async () => {
  const plan = await readFile(planPath, "utf8");
  assert.doesNotThrow(() => assertMuePreviewBetaCriticalPath(plan));
  assert.throws(
    () => assertMuePreviewBetaCriticalPath(plan.replace(/^\| `MECHANISM-MATURITY-EVIDENCE` \|.*\n/mu, "")),
    /seven authoritative content IDs/u,
  );
  assert.throws(
    () => assertMuePreviewBetaCriticalPath(plan.replace(
      "| `EVENT-SUBSCRIPTIONS` |",
      "| `H3-WORKLOAD-ISOLATION` | `queued` | Engine v0.3 only. | [Maturity ladder](PROJECT-DESIGN.md#engine-maturity-roadmap-labels) |\n| `EVENT-SUBSCRIPTIONS` |",
    )),
    /Engine v0\.3 work/u,
  );
  assert.throws(
    () => assertMuePreviewBetaCriticalPath(plan.replace("Integration state: `blocked`.", "Integration state: `ready`.")),
    /must remain blocked/u,
  );
  assert.throws(
    () => assertMuePreviewBetaCriticalPath(plan.replace(
      "| 7 | `active` | Capability and evidence closure |",
      "| 7 | `queued` | Capability and evidence closure |",
    )),
    /risk-first handoff/u,
  );
  assert.throws(
    () => assertMuePreviewBetaCriticalPath(plan.replace(
      "Risk band: Capability and evidence closure.",
      "Risk band: Cross-Workflow durability.",
    )),
    /active risk band/u,
  );
});

test("keeps the binding showcase ladder in its decision owner", async () => {
  const ladder = await readFile(
    path.join(projectRoot, "docs/SHOWCASE-MILESTONE-LADDER-DECISION.md"),
    "utf8",
  );
  const milestones = [...ladder.matchAll(/^### (M[0-6]) /gmu)].map((match) => match[1]);
  assert.deepEqual(milestones, ["M0", "M1", "M2", "M3", "M4", "M5", "M6"]);
  for (const milestone of milestones) {
    const start = ladder.indexOf(`### ${milestone} `);
    const next = ladder.indexOf("\n### ", start + 4);
    const section = ladder.slice(start, next === -1 ? undefined : next);
    assert.match(section, /\*\*Status: closed\.\*\*/u, milestone);
  }
});

test("keeps the root README free of volatile implementation status", async () => {
  const readme = await readFile(path.join(projectRoot, "README.md"), "utf8");
  assert.doesNotMatch(readme, /^## Current state$/mu);
  assert.doesNotMatch(readme, /^\| Active work \|/mu);
  for (const link of [
    "docs/PLAN.md",
    "docs/IMPLEMENTATION-MAP.md",
    "docs/BPM-PLATFORM-IMPLEMENTATION-MAP.md",
    "model-corpus/README.md",
  ]) assert.match(readme, new RegExp(link.replaceAll("/", "\\/"), "u"));
});
