/**
 * Locks the serial portable-handoff Program admission of PORTABLE-BUSINESS-VALUES-PROPOSAL's consuming amendment:
 * exactly Start, two owned Data Input/Output User Tasks and End, three pairwise-distinct Properties wired
 * P_in to P_mid to P_out, independent of every identifier.
 *
 * The oracle is the amendment's source contract. Each negative changes one fact of an otherwise admitted Program,
 * so a refusal can only come from that fact.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SemanticOperationKind,
  SemanticProfileId,
  isWellFormedSemanticProcessProgram,
  profileAllowsProgramShape,
  supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";
import type { SemanticOperation, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import {
  handoffOperations, handoffProgram, handoffProgramFrom, order, renamed, reviewArchive, start,
} from "./portable-handoff-fixture.ts";
import { compositionProgram, dataTask, serialHandoff } from "./structured-process-composition-fixture.ts";
import { operationBase } from "./semantic-program-parts.ts";

const names = reviewArchive;
const admitted = (program: SemanticProcessProgram): boolean =>
  isWellFormedSemanticProcessProgram(program) &&
  profileAllowsProgramShape(program.identity.semanticProfile, program.operations, program.definitionScopes.length);

function replaceTask(operations: readonly SemanticOperation[], id: string, replacement: SemanticOperation): SemanticOperation[] {
  return operations.map((operation) => operation.id === `operation:${id}` ? replacement : operation);
}

test("admits the serial Review to Archive handoff and executes it from one P_in binding", () => {
  const program = handoffProgram();
  assert.equal(admitted(program), true);
  assert.equal(supportsSemanticProcessExecution(start(order), program), true);
});

test("admits renamed identifiers and every reordering of semantically unordered declarations", () => {
  for (const spelling of [reviewArchive, renamed]) {
    const operations = handoffOperations(spelling);
    for (const permutation of [operations, [...operations].reverse(), [operations[2]!, operations[0]!, operations[3]!, operations[1]!]]) {
      const program = handoffProgramFrom(permutation, spelling);
      assert.equal(admitted(program), true, spelling.processId);
      assert.equal(supportsSemanticProcessExecution(start(order, spelling), program), true, spelling.processId);
    }
  }
});

test("business names never enter admission: only the wiring of P_in, P_mid and P_out does", () => {
  const program = handoffProgram({ ...reviewArchive, pin: "Invoice", pmid: "Decision", pout: "Receipt", first: "Assess", second: "Notify" });
  assert.equal(admitted(program), true);
});

test("refuses an extra node, a gateway, a third task and an ordinary task", () => {
  const base = handoffOperations();
  const ordinary = (id: string, input: string, out: string): SemanticOperation => ({
    ...operationBase(id), kind: SemanticOperationKind.AwaitUserTask, input: `place:${input}`, output: `place:${out}`,
    task: { elementId: id, name: null },
  });
  const thirdTask = compositionProgram([
    base[0]!, dataTask("Review", "Flow_Start_Review", "Flow_Review_Archive", names.pin, names.pmid),
    dataTask("Archive", "Flow_Review_Archive", "Flow_Archive_Audit", names.pmid, names.pout),
    dataTask("Audit", "Flow_Archive_Audit", "Flow_Audit_End", names.pout, "Audited"),
    { ...operationBase("End"), kind: SemanticOperationKind.ReachNoneEnd, input: "place:Flow_Audit_End" },
  ], ["Flow_Start_Review", "Flow_Review_Archive", "Flow_Archive_Audit", "Flow_Audit_End"]);
  const ordinaryMiddle = handoffProgramFrom([base[0]!, base[1]!, ordinary("Archive", "Flow_Review_Archive", "Flow_Archive_End"), base[3]!]);
  const lone = handoffProgramFrom([
    base[0]!, dataTask("Review", "Flow_Start_Review", "Flow_Review_End", names.pin, names.pmid),
    { ...operationBase("End"), kind: SemanticOperationKind.ReachNoneEnd, input: "place:Flow_Review_End" },
  ]);
  for (const [label, program] of [
    ["third task", { ...thirdTask, identity: { ...thirdTask.identity, semanticProfile: SemanticProfileId.PortableBusinessValuesHandoff } }],
    ["ordinary middle task", ordinaryMiddle],
    ["single task", lone],
  ] as const) {
    assert.equal(profileAllowsProgramShape(SemanticProfileId.PortableBusinessValuesHandoff, program.operations, program.definitionScopes.length), false, label);
    assert.equal(supportsSemanticProcessExecution(start(order), program), false, label);
  }
});

test("refuses a shared Property, a self-copy and a missing handoff link between the tasks", () => {
  const archive = (read: string, write: string) => replaceTask(handoffOperations(), "Archive",
    dataTask("Archive", "Flow_Review_Archive", "Flow_Archive_End", read, write));
  const review = (read: string, write: string) => replaceTask(handoffOperations(), "Review",
    dataTask("Review", "Flow_Start_Review", "Flow_Review_Archive", read, write));
  for (const [label, operations] of [
    ["Review output aliases its input", review(names.pin, names.pin)],
    ["Archive output aliases the handoff Property", archive(names.pmid, names.pmid)],
    ["Archive output aliases P_in", archive(names.pmid, names.pin)],
    ["Archive reads P_in rather than the handoff", archive(names.pin, names.pout)],
    ["Archive reads an unwritten Property", archive("Unwritten", names.pout)],
  ] as const) {
    const program = handoffProgramFrom(operations);
    assert.equal(isWellFormedSemanticProcessProgram(program) && admitted(program), false, label);
    assert.equal(supportsSemanticProcessExecution(start(order), program), false, label);
  }
});

test("refuses cross-wired control flow and a Program under any other registered profile", () => {
  const base = handoffOperations();
  const crossed = handoffProgramFrom(replaceTask(base, "Review", dataTask("Review", "Flow_Start_Review", "Flow_Archive_End", names.pin, names.pmid)));
  assert.equal(admitted(crossed), false);
  const other = handoffProgram(reviewArchive, SemanticProfileId.ActivityDataInputOutputUserTask);
  assert.equal(profileAllowsProgramShape(SemanticProfileId.ActivityDataInputOutputUserTask, other.operations, other.definitionScopes.length), false);
  // The predecessor profile still admits the shape it always did, with its own scalar domain.
  assert.equal(admitted(serialHandoff), true);
});
