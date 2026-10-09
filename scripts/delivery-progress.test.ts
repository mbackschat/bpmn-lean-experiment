import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, symlink, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  compareDeliverySnapshots,
  loadDeliverySnapshot,
  readRequirementTrackerRows,
  requireDeliverySnapshot,
} from "./delivery-progress.ts";
import type { DeliverySnapshot, TrackerRow } from "./delivery-progress.ts";
import { requireExecutableModelCorpusManifest } from "./executable-model-corpus-manifest.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const current = await loadDeliverySnapshot(projectRoot, "2026-10-09T12:00:00.000Z");

function row(id: string, stage: string, scopeValue = "bounded variant"): TrackerRow {
  const scope = { boundary: scopeValue };
  return {
    id, stage, facts: {},
    scopeSha256: createHash("sha256").update(JSON.stringify(scope)).digest("hex"),
  };
}

function snapshot(rows: ReadonlyArray<TrackerRow>, capturedAt = "2026-10-08T12:00:00.000Z"): DeliverySnapshot {
  return { ...current, capturedAt, tracks: {
    ...current.tracks,
    bpmnRequirements: { ...current.tracks.bpmnRequirements, rows },
  } };
}

test("separates denominator additions/removals and same-ID scope drift from stage movement", () => {
  const before = snapshot([
    row("unchanged", "supported"), row("closed", "unsupported"),
    row("reopened", "supported"), row("drifted", "unsupported", "old boundary"),
    row("removed", "unsupported"),
  ]);
  const after = snapshot([
    row("unchanged", "supported"), row("closed", "supported"),
    row("reopened", "unsupported"), row("drifted", "supported", "new boundary"),
    row("added", "supported"), row("added-open", "unsupported"),
  ], "2026-10-09T12:00:00.000Z");
  const comparison = compareDeliverySnapshots(before, after);
  const delta = comparison.tracks.bpmnRequirements;
  assert.equal(comparison.elapsedWindowMs, 86_400_000);
  assert.equal(delta.beforeTotal, 5);
  assert.equal(delta.afterTotal, 6);
  assert.deepEqual(delta.addedIds, ["added", "added-open"]);
  assert.deepEqual(delta.removedIds, ["removed"]);
  assert.deepEqual(delta.scopeChangedIds, ["drifted"]);
  assert.equal(delta.stableScopeCount, 3);
  assert.deepEqual(delta.enteredStageIds, ["closed"]);
  assert.deepEqual(delta.leftStageIds, ["reopened"]);
  assert.deepEqual(delta.afterRemainingStageIds, ["added-open", "reopened"]);
  assert.equal(comparison.deliveryAcceptance.closedVariantIds, null);
  assert.equal(comparison.deliveryAcceptance.ratePerDay, null);
});

test("a disappearing unsupported record cannot be reported as progress", () => {
  const comparison = compareDeliverySnapshots(snapshot([row("open", "unsupported")]),
    snapshot([], "2026-10-09T12:00:00.000Z"));
  assert.deepEqual(comparison.tracks.bpmnRequirements.removedIds, ["open"]);
  assert.deepEqual(comparison.tracks.bpmnRequirements.enteredStageIds, []);
});

test("a changed selected requirement interpretation is scope drift even when the normative obligation is unchanged", () => {
  const ledger = (interpretation: string, disposition: string) => `## Reviewed requirements
| Requirement ID | Normative source | Machine-readable anchor | Requirement or conflict | Disposition | Owning semantic decision | Evidence status |
|---|---|---|---|---|---|---|
| \`BPMN-EXAMPLE-01\` | Clause 13 | CMOF Task | Complete an Activity. | \`${disposition}\` | ${interpretation} | A bounded witness. |
## Growth rule`;
  const before = snapshot(readRequirementTrackerRows(ledger("One User Task only.", "unsupported")));
  const after = snapshot(readRequirementTrackerRows(ledger("Repeated mixed activities.", "supported")), "2026-10-09T12:00:00.000Z");
  const delta = compareDeliverySnapshots(before, after).tracks.bpmnRequirements;
  assert.deepEqual(delta.scopeChangedIds, ["BPMN-EXAMPLE-01"]);
  assert.deepEqual(delta.enteredStageIds, []);
});

test("rejects duplicate IDs, malformed scope digests, invalid stages and reversed windows", () => {
  assert.throws(() => requireDeliverySnapshot(snapshot([row("duplicate", "supported"), row("duplicate", "supported")])), /duplicate/u);
  assert.throws(() => requireDeliverySnapshot(snapshot([{ ...row("drift", "supported"), scopeSha256: "invalid" }])), /scope digest/u);
  assert.throws(() => requireDeliverySnapshot(snapshot([row("invented", "accepted")])), /stage/u);
  assert.throws(() => requireDeliverySnapshot({ ...current, capturedAt: "today" }), /timestamp/u);
  assert.throws(() => compareDeliverySnapshots(current, snapshot([])), /later/u);
});

test("round-trips owner-controlled JSON and keeps live tracker measures separate from delivery", () => {
  assert.deepEqual(requireDeliverySnapshot(JSON.parse(JSON.stringify(current))), current);
  assert.ok(current.tracks.bpmnRequirements.rows.length > 0);
  assert.ok(current.tracks.cibVariants.rows.length > 0);
  assert.ok(current.tracks.wholeModelJourneys.rows.length > 0);
  assert.ok(current.tracks.mechanismMaturity.rows.length > 0);
  assert.equal(current.deliveryAcceptance.acceptedVariants, null);
  assert.equal(current.deliveryAcceptance.remainingVariants, null);
  assert.match(current.deliveryAcceptance.missingInputs.join(" "), /stable.*variant.*acceptance/iu);
  assert.equal(current.commandCost, null);
});

test("not-applicable CIB evidence and maturity classifications cannot become remaining selection work", () => {
  const comparison = compareDeliverySnapshots({ ...current, capturedAt: "2026-10-08T12:00:00.000Z" }, current);
  const notApplicableIds = current.tracks.cibVariants.rows.filter(entry => entry.stage === "notApplicable").map(entry => entry.id);
  assert.ok(notApplicableIds.length > 0);
  assert.ok(notApplicableIds.every(id => !comparison.tracks.cibVariants.afterRemainingStageIds?.includes(id)));
  assert.equal(comparison.tracks.mechanismMaturity.afterRemainingStageIds, null);
});

test("failed and incomplete receipts remain command cost evidence without becoming acceptance", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "delivery-progress-receipts-"));
  try {
    const failed = path.join(root, "failed");
    const pending = path.join(root, "pending");
    await mkdir(failed); await mkdir(pending);
    await writeFile(path.join(failed, "command.txt"), "cwd=/tmp\ncommand=node --test example.test.ts\n");
    await writeFile(path.join(failed, "git-head"), `${"a".repeat(40)}\n`);
    await writeFile(path.join(failed, "output.log"), "failed\n");
    await writeFile(path.join(failed, "exit-status"), "1\n");
    await writeFile(path.join(pending, "command.txt"), "cwd=/tmp\ncommand=node --test example.test.ts\n");
    const captured = await loadDeliverySnapshot(projectRoot, "2026-10-09T12:00:00.000Z", root);
    assert.equal(captured.commandCost?.failedCount, 1);
    assert.equal(captured.commandCost?.invalidReceipts.length, 1);
    assert.equal(captured.deliveryAcceptance.acceptedVariants, null);
    assert.match(captured.limitations.join(" "), /engineering effort/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("missing or changed model bytes cannot retain a declared journey stage", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "delivery-progress-model-"));
  try {
    for (const directory of ["docs", "profiles", "showcase"]) {
      await symlink(path.join(projectRoot, directory), path.join(root, directory), "dir");
    }
    await mkdir(path.join(root, "model-corpus"));
    await symlink(path.join(projectRoot, "model-corpus/mvp-capabilities.ts"), path.join(root, "model-corpus/mvp-capabilities.ts"));
    const manifest = requireExecutableModelCorpusManifest(JSON.parse(await readFile(path.join(projectRoot, "model-corpus/manifest.json"), "utf8")));
    const original = manifest.models.find(model => model.source.kind === "retainedScenario" && model.product2.kind === "journeyBacked");
    assert.ok(original?.source.kind === "retainedScenario");
    const fixture = { ...original, source: { ...original.source,
      bpmnRelativePath: "source.bpmn", scenarioRelativePath: "scenario.json" } };
    await writeFile(path.join(root, "scenario.json"), await readFile(path.join(projectRoot, original.source.scenarioRelativePath)));
    await writeFile(path.join(root, "model-corpus/manifest.json"), JSON.stringify({ ...manifest, models: [fixture] }));
    const missing = await loadDeliverySnapshot(root, "2026-10-08T12:00:00.000Z");
    assert.equal(missing.tracks.wholeModelJourneys.rows[0]?.stage, "bindingMissing");
    await writeFile(path.join(root, "source.bpmn"), "wrong bytes");
    const failed = await loadDeliverySnapshot(root, "2026-10-09T12:00:00.000Z");
    assert.equal(failed.tracks.wholeModelJourneys.rows[0]?.stage, "bindingFailed");
    assert.deepEqual(compareDeliverySnapshots(missing, failed).tracks.wholeModelJourneys.enteredStageIds, []);
    assert.equal(failed.deliveryAcceptance.acceptedVariants, null);
    await writeFile(path.join(root, "source.bpmn"), await readFile(path.join(projectRoot, original.source.bpmnRelativePath)));
    const bound = await loadDeliverySnapshot(root, "2026-10-10T12:00:00.000Z");
    assert.equal(bound.tracks.wholeModelJourneys.rows[0]?.stage, "journeyBacked");
    assert.equal(bound.deliveryAcceptance.acceptedVariants, null);
    await rm(path.join(root, "model-corpus/mvp-capabilities.ts"));
    await writeFile(path.join(root, "model-corpus/mvp-capabilities.ts"), `${await readFile(path.join(projectRoot, "model-corpus/mvp-capabilities.ts"), "utf8")}\n// Different owner bytes.\n`);
    await assert.rejects(loadDeliverySnapshot(root), /capability registry differs from the consumed module/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});
