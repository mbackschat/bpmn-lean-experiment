import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertPlanControlPlane,
  parseOrderedWork,
} from "./document-control-plane.ts";
import { muePreviewBetaTestOracle } from "./mue-preview-beta-test-oracle.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const planPath = path.join(projectRoot, "docs/PLAN.md");
const betaPath = path.join(projectRoot, "docs/MUE-PREVIEW-BETA-SPEC.md");

const muePreviewBetaRiskBands = [
  ["Subscription population/concurrency", "satisfied"],
  ["Subscription delivery/recovery", "satisfied"],
  ["Boundary-handler eligibility/lifetime", "satisfied"],
  ["Event Sub-Process snapshots", "satisfied"],
  ["Compensation order/cancellation", "satisfied"],
  ["Cross-Workflow durability", "satisfied"],
  ["Capability and evidence closure", "satisfied"],
  ["Beta integration", "satisfied"],
] as const;

function muePreviewBetaSection(specification: string): string {
  const marker = "### Historical Beta content boundary\n";
  const start = specification.indexOf(marker);
  assert.notEqual(start, -1, `missing ${marker.trim()}`);
  const bodyStart = start + marker.length;
  const remainder = specification.slice(bodyStart);
  const nextHeading = remainder.search(/\n##(?:#)? /u);
  return remainder.slice(0, nextHeading === -1 ? undefined : nextHeading).trim();
}

function assertMuePreviewBetaCriticalPath(specification: string): void {
  const section = muePreviewBetaSection(specification);
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
    muePreviewBetaTestOracle.map(({ id }) => [id, "satisfied"]),
    "the MUE Preview Beta table must retain all seven authoritative content IDs and their current states",
  );
  assert.ok(rows.every(({ state }) => state === "satisfied"), "every Beta content boundary must be satisfied before integration");
  assert.match(section, /^Integration state: `satisfied`\.$/mu, "Beta integration must remain closed after every content row is satisfied");

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
  assert.ok(riskRows.every(([, state]) => state === "satisfied"), "every Beta risk band must remain satisfied after closure");
}

function assertForwardPlan(plan: string): void {
  assert.doesNotMatch(plan, /^#{2,6} (?:MUE Preview Beta critical path|MUE Release Candidate critical path|Risk-first execution bands)$/mu,
    "closed milestone sections belong in their historical owners");
  assert.doesNotMatch(plan, /^\|[^\n]*\| `satisfied` \|/mu,
    "satisfied milestone rows belong in their historical owners");
  assert.doesNotMatch(plan, /^Integration state: `satisfied`\.$/mu,
    "closed integration state belongs in its historical owner");
  assert.doesNotMatch(plan, /^Risk band: Beta integration\.$/mu,
    "the exact resume point must leave the closed Beta risk band");
}

test("keeps completed milestone tables in their owners and out of forward PLAN work", async () => {
  const plan = await readFile(planPath, "utf8");
  assertForwardPlan(plan);
  for (const history of [
    "### MUE Preview Beta critical path\n",
    "### MUE Release Candidate critical path\n",
    "#### Risk-first execution bands\n",
    "| `SEQUENTIAL-MULTI-INSTANCE` | `satisfied` | Closed boundary. | [Owner](MUE-PREVIEW-BETA-SPEC.md) |\n",
    "| 8 | `satisfied` | Beta integration | Closed boundary. |\n",
    "Integration state: `satisfied`.\n",
  ]) assert.throws(() => assertForwardPlan(plan.replace("## Current checkpoint\n", `## Current checkpoint\n\n${history}`)),
    /historical owner/u);
});

test("keeps the plan as one compact execution control document", async () => {
  const plan = await readFile(planPath, "utf8");
  assert.doesNotThrow(() => assertPlanControlPlane(plan));
});

test("rejects supporting work without a deliverable, acceptance blockers or finite effort budget", async () => {
  const current = await readFile(planPath, "utf8");
  const plan = current.replace(/^Deliverable:.*\n|^Acceptance blockers:.*\n|^Effort budget:.*\n/gmu, "")
    .replace("## Exact resume point\n", "## Exact resume point\n\nDeliverable: Accepted admission correspondence.\n\nAcceptance blockers: Start identity disagreement.\n\nEffort budget: 20 minutes; stop and reassess at the limit.\n");
  assert.doesNotThrow(() => assertPlanControlPlane(plan));
  for (const field of ["Deliverable", "Acceptance blockers", "Effort budget"]) {
    assert.throws(() => assertPlanControlPlane(plan.replace(new RegExp(`^${field}:.*\\n`, "mu"), "")),
      /deliverable|acceptance blockers|finite effort budget/u);
  }
  for (const budget of ["unlimited", "0 minutes", "-1 minutes", "Infinity hours"]) {
    assert.throws(() => assertPlanControlPlane(plan.replace("20 minutes", budget)), /finite effort budget/u);
  }
});

test("rejects multiple active items, malformed states, duplicate IDs, and a dangling resume", async () => {
  const plan = await readFile(planPath, "utf8");
  const entries = parseOrderedWork(plan);
  const activeEntry = entries.find((entry) => entry.state === "active");
  const inactiveEntry = entries.find((entry) => entry.state !== "active");
  assert.ok(activeEntry !== undefined);
  assert.ok(inactiveEntry !== undefined);
  assert.throws(
    () => assertPlanControlPlane(plan.replace(
      `\`${inactiveEntry.id}\` · **${inactiveEntry.state}**`,
      `\`${inactiveEntry.id}\` · **active**`,
    )),
    /exactly one active/u,
  );
  assert.throws(
    () => assertPlanControlPlane(plan.replace(
      `\`${inactiveEntry.id}\` · **${inactiveEntry.state}**`,
      `\`${inactiveEntry.id}\` · **completed**`,
    )),
    /stable work contract/u,
  );
  assert.throws(
    () => assertPlanControlPlane(plan.replace(
      `\`${inactiveEntry.id}\` · **${inactiveEntry.state}**`,
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
  const specification = await readFile(betaPath, "utf8");
  assert.doesNotThrow(() => assertMuePreviewBetaCriticalPath(specification));
  assert.throws(
    () => assertMuePreviewBetaCriticalPath(specification.replaceAll(/^\| `MECHANISM-MATURITY-EVIDENCE` \|.*\n/gmu, "")),
    /seven authoritative content IDs/u,
  );
  assert.throws(
    () => assertMuePreviewBetaCriticalPath(specification.replaceAll(
      "| `EVENT-SUBSCRIPTIONS` |",
      "| `H3-WORKLOAD-ISOLATION` | `queued` | Engine v0.3 only. | [Maturity ladder](PROJECT-DESIGN.md#engine-maturity-roadmap-labels) |\n| `EVENT-SUBSCRIPTIONS` |",
    )),
    /Engine v0\.3 work/u,
  );
  assert.throws(
    () => assertMuePreviewBetaCriticalPath(specification.replace("Integration state: `satisfied`.", "Integration state: `blocked`.")),
    /must remain closed/u,
  );
  assert.throws(
    () => assertMuePreviewBetaCriticalPath(specification.replace(
      "| 8 | `satisfied` | Beta integration |",
      "| 8 | `queued` | Beta integration |",
    )),
    /risk-first handoff/u,
  );
});

test("rejects an unfinished or duplicated historical Beta content boundary", async () => {
  const specification = await readFile(betaPath, "utf8");
  assert.throws(() => assertMuePreviewBetaCriticalPath(specification.replace(
    "| `EVENT-SUBSCRIPTIONS` | `satisfied` |", "| `EVENT-SUBSCRIPTIONS` | `queued` |",
  )), /seven authoritative content IDs/u);
  assert.throws(() => assertMuePreviewBetaCriticalPath(specification.replace(
    "| `EVENT-SUBSCRIPTIONS` | `satisfied` |", "| `PARALLEL-MULTI-INSTANCE` | `satisfied` |",
  )), /duplicate MUE Preview Beta content ID/u);
});

test("keeps the MUE Preview Beta testing contract aligned with the closed integration handoff", async () => {
  const testingSpec = await readFile(path.join(projectRoot, "docs/PLATFORM-VERIFICATION-POLICY.md"), "utf8");
  assert.match(
    testingSpec,
    /activates integration only after all seven content boundaries are satisfied/u,
    "the testing owner must retain the content-to-integration handoff",
  );
  assert.doesNotMatch(
    testingSpec,
    /blocked integration while Event Subscriptions or Compensation and Transactions remain open/u,
    "the testing owner must not retain the completed content-stage condition",
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
