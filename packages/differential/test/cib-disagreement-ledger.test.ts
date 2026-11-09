import assert from "node:assert/strict";
import { test } from "node:test";

import { ledgerOwnerFaults, ledgerViolations, readCibDisagreementLedger } from "./cib-disagreement-ledger.ts";
import { projectRoot } from "./pipeline-target-support.ts";

const ledger = [
  { evidence: "scenarios/a/cibseven-evidence.json", owner: "PC-CF-04" },
  { evidence: "scenarios/b/cibseven-evidence.json", owner: "CIB-EXT-0005" },
];

test("a classified CIB disagreement passes only while its scenario still disagrees", () => {
  const retained = new Set(["scenarios/a/cibseven-evidence.json", "scenarios/b/cibseven-evidence.json",
    "scenarios/c/cibseven-evidence.json"]);
  assert.deepEqual(
    ledgerViolations(new Set(["scenarios/a/cibseven-evidence.json", "scenarios/b/cibseven-evidence.json"]), retained, ledger),
    { unlisted: [], agreeing: [], orphaned: [] },
  );
  assert.deepEqual(
    ledgerViolations(new Set(["scenarios/a/cibseven-evidence.json", "scenarios/c/cibseven-evidence.json"]), retained, ledger),
    { unlisted: ["scenarios/c/cibseven-evidence.json"], agreeing: ["scenarios/b/cibseven-evidence.json"], orphaned: [] },
  );
  assert.deepEqual(
    ledgerViolations(new Set(["scenarios/a/cibseven-evidence.json"]), new Set(["scenarios/a/cibseven-evidence.json"]), ledger),
    { unlisted: [], agreeing: [], orphaned: ["scenarios/b/cibseven-evidence.json"] },
  );
});

test("a ledger owner is an open or held coverage row or a registered CIB relation, never a done row", () => {
  const rows = new Map([["PC-CF-04", "open"], ["PC-DATA-01", "done; closure, 2026-10-23"], ["PC-QUALIFY-03", "held"]]);
  const register = new Set(["CIB-EXT-0005"]);
  assert.deepEqual(ledgerOwnerFaults([
    { evidence: "scenarios/a/cibseven-evidence.json", owner: "PC-CF-04" },
    { evidence: "scenarios/b/cibseven-evidence.json", owner: "PC-QUALIFY-03" },
    { evidence: "scenarios/c/cibseven-evidence.json", owner: "CIB-EXT-0005" },
  ], rows, register), []);
  assert.deepEqual(ledgerOwnerFaults([
    { evidence: "scenarios/a/cibseven-evidence.json", owner: "PC-DATA-01" },
    { evidence: "scenarios/b/cibseven-evidence.json", owner: "CIB-EXT-9999" },
    { evidence: "scenarios/b/cibseven-evidence.json", owner: "PC-CF-04" },
    { evidence: "scenarios/0/cibseven-evidence.json", owner: "PC-CF-04" },
  ], rows, register), [
    "scenarios/a/cibseven-evidence.json: owner PC-DATA-01 is done",
    "scenarios/b/cibseven-evidence.json: owner CIB-EXT-9999 is no open row or registered relation",
    "scenarios/b/cibseven-evidence.json: listed twice",
    "scenarios/0/cibseven-evidence.json: out of order",
  ]);
});

test("the retained ledger names only valid owners, in order", async () => {
  await assert.doesNotReject(readCibDisagreementLedger(projectRoot));
});
