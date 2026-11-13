import assert from "node:assert/strict";
import { test } from "node:test";

import { ledgerOwnerFaults, ledgerViolations, readCibDisagreementLedger } from "./cib-disagreement-ledger.ts";
import type { LedgerEntry } from "./cib-disagreement-ledger.ts";
import { projectRoot } from "./pipeline-target-support.ts";

const ledger = [
  { evidence: "scenarios/a/cibseven-evidence.json", firstDifference: "trace[4].status", owners: ["PC-CF-04"] },
  { evidence: "scenarios/b/cibseven-evidence.json", firstDifference: "trace[0].outcome", owners: ["CIB-EXT-0005"] },
];

const disagreeing = (...entries: ReadonlyArray<readonly [string, string]>): ReadonlyMap<string, string> =>
  new Map(entries.map(([scenario, location]) => [`scenarios/${scenario}/cibseven-evidence.json`, location]));

test("a classified CIB disagreement passes only while its scenario still disagrees", () => {
  const retained = new Set(["scenarios/a/cibseven-evidence.json", "scenarios/b/cibseven-evidence.json",
    "scenarios/c/cibseven-evidence.json"]);
  assert.deepEqual(
    ledgerViolations(disagreeing(["a", "trace[4].status"], ["b", "trace[0].outcome"]), retained, ledger),
    { unlisted: [], moved: [], agreeing: [], orphaned: [] },
  );
  assert.deepEqual(
    ledgerViolations(disagreeing(["a", "trace[4].status"], ["c", "trace[1].outcome"]), retained, ledger),
    { unlisted: ["scenarios/c/cibseven-evidence.json"], moved: [], agreeing: ["scenarios/b/cibseven-evidence.json"], orphaned: [] },
  );
  assert.deepEqual(
    ledgerViolations(disagreeing(["a", "trace[4].status"]), new Set(["scenarios/a/cibseven-evidence.json"]), ledger),
    { unlisted: [], moved: [], agreeing: [], orphaned: ["scenarios/b/cibseven-evidence.json"] },
  );
});

test("a classified CIB disagreement passes only while its first difference stays exactly where the ledger records it", () => {
  const retained = new Set(["scenarios/a/cibseven-evidence.json", "scenarios/b/cibseven-evidence.json"]);
  const moved = (actual: string) => ({ evidence: "scenarios/a/cibseven-evidence.json", recorded: "trace[4].status", actual });
  // A difference before the classified one is unclassified, so everything before the recorded location must agree.
  assert.deepEqual(
    ledgerViolations(disagreeing(["a", "trace[2].openWaits[0].detail.dueMs"], ["b", "trace[0].outcome"]), retained, ledger),
    { unlisted: [], moved: [moved("trace[2].openWaits[0].detail.dueMs")], agreeing: [], orphaned: [] },
  );
  assert.deepEqual(
    ledgerViolations(disagreeing(["a", "trace[4].variables[0].value"], ["b", "trace[0].outcome"]), retained, ledger),
    { unlisted: [], moved: [moved("trace[4].variables[0].value")], agreeing: [], orphaned: [] },
  );
  assert.deepEqual(
    ledgerViolations(disagreeing(["a", "trace[6]"], ["b", "trace[0].outcome"]), retained, ledger),
    { unlisted: [], moved: [moved("trace[6]")], agreeing: [], orphaned: [] },
  );
});

test("a ledger owner is an open or held coverage row or a registered CIB relation, never a done row", () => {
  const rows = new Map([["PC-CF-04", "open"], ["PC-DATA-01", "done; closure, 2026-10-23"], ["PC-QUALIFY-03", "held"]]);
  const register = new Set(["CIB-EXT-0005"]);
  assert.deepEqual(ledgerOwnerFaults([
    { evidence: "scenarios/a/cibseven-evidence.json", firstDifference: "trace[0].outcome", owners: ["PC-CF-04"] },
    { evidence: "scenarios/b/cibseven-evidence.json", firstDifference: "trace[0].outcome", owners: ["PC-QUALIFY-03"] },
    { evidence: "scenarios/c/cibseven-evidence.json", firstDifference: "trace[0].outcome", owners: ["CIB-EXT-0005"] },
  ], rows, register), []);
  assert.deepEqual(ledgerOwnerFaults([
    { evidence: "scenarios/a/cibseven-evidence.json", firstDifference: "trace[0].outcome", owners: ["PC-DATA-01"] },
    { evidence: "scenarios/b/cibseven-evidence.json", firstDifference: "trace[0].outcome", owners: ["CIB-EXT-9999"] },
    { evidence: "scenarios/b/cibseven-evidence.json", firstDifference: "trace[0].outcome", owners: ["PC-CF-04"] },
    { evidence: "scenarios/0/cibseven-evidence.json", firstDifference: "trace[0].outcome", owners: ["PC-CF-04"] },
  ], rows, register), [
    "scenarios/a/cibseven-evidence.json: owner PC-DATA-01 is done",
    "scenarios/b/cibseven-evidence.json: owner CIB-EXT-9999 is no open row or registered relation",
    "scenarios/b/cibseven-evidence.json: listed twice",
    "scenarios/0/cibseven-evidence.json: out of order",
  ]);
  assert.deepEqual(ledgerOwnerFaults([{ evidence: "scenarios/a/cibseven-evidence.json", firstDifference: "trace[0].outcome", owners: [] }],
    rows, register), ["scenarios/a/cibseven-evidence.json: names no owner"]);
  assert.deepEqual(ledgerOwnerFaults([{ evidence: "scenarios/a/cibseven-evidence.json", owners: ["PC-CF-04"] } as unknown as LedgerEntry,
    { evidence: "scenarios/b/cibseven-evidence.json", firstDifference: "", owners: ["PC-CF-04"] }], rows, register), [
    "scenarios/a/cibseven-evidence.json: records no first difference",
    "scenarios/b/cibseven-evidence.json: records no first difference",
  ]);
});

test("the retained ledger names only valid owners, in order", async () => {
  await assert.doesNotReject(readCibDisagreementLedger(projectRoot));
});
