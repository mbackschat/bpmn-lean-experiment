import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID,
  TRANSACTION_CANCELLATION_CHECKPOINT_PROFILE_ID,
  InternalSchedulingMode,
  SemanticOperationKind,
  type SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import {
  assessTemporalHostCapability,
  TemporalHostAdmissionFailureCode,
  TemporalHostCapabilityResultKind,
} from "@bpmn-lean/temporal-protocol";
import { admittedTransactionProgram } from "../../../semantic-core/test/transaction-cancellation-fixtures.ts";

const xml = await readFile(new URL("../../../bpmn-source/test/fixtures/transaction-cancellation.bpmn", import.meta.url), "utf8");
async function compile(source = xml): Promise<SemanticProcessProgram> {
  const result = await compileBpmnToSemanticProcess({
    bytes: Buffer.from(source), sourceId: "transaction-host-admission", expectedSha256: undefined,
    semanticProfile: TRANSACTION_CANCELLATION_CHECKPOINT_PROFILE_ID, sourceOverlay: null,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1000 },
  });
  assert.equal(result.status, BpmnCompilationStatus.Accepted, JSON.stringify(result.diagnostics));
  assert.ok(result.status === BpmnCompilationStatus.Accepted);
  return result.semanticProcess;
}

for (const renamed of [false, true]) {
  test(`host admits source-compiled Transaction, renamed=${renamed}`, async () => {
    const source = renamed ? xml.replaceAll(/\b(?:Definitions|Process|Transaction|Start|Split|Task|End|Boundary|Cancel|Compensate|Association|Flow)_\w+/g,
      (id) => `Renamed_${id}`) : xml;
    assert.deepEqual(assessTemporalHostCapability(await compile(source)), {
      kind: TemporalHostCapabilityResultKind.Admitted,
    });
  });
}

test("Transaction host admission requires exact profile, full graph, and sole scheduler ownership", async () => {
  const program = await compile();
  const child = program.definitionScopes.find(({ parentScopeId }) => parentScopeId !== null)!;
  const root = program.definitionScopes.find(({ parentScopeId }) => parentScopeId === null)!;
  const invalid: ReadonlyArray<readonly [string, SemanticProcessProgram]> = [
    ["unknown profile", { ...program, identity: { ...program.identity, semanticProfile: "unregistered" } }],
    ["root Compensation profile", { ...program, identity: { ...program.identity, semanticProfile: COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID } }],
    ["scheduled choice", { ...program, internalSchedulingMode: InternalSchedulingMode.RequireChoiceSchedule }],
    ["wrong child parent", { ...program, definitionScopes: program.definitionScopes.map((scope) =>
      scope.id === child.id ? { ...scope, parentScopeId: child.id } : scope) }],
    ["wrong Cancel owner", { ...program, operationScopes: program.operationScopes.map((owner) =>
      owner.operationId === program.compensationExecution!.triggerOperationId ? { ...owner, scopeId: root.id } : owner) }],
    ["extra host Timer", { ...program, operations: [...program.operations, {
      id: "operation:ExtraTimer", kind: SemanticOperationKind.AwaitTimer,
      origin: { kind: "bpmnElement", elementId: "ExtraTimer" },
      input: program.controlPlaces[0]!.id, output: program.controlPlaces[1]!.id,
      timer: { elementId: "ExtraTimer", durationMs: 1000 },
    }] } as SemanticProcessProgram],
    ["second managed trigger", { ...program, operations: [...program.operations,
      { ...program.operations.find((op) => op.kind === SemanticOperationKind.CancelTransaction)!, id: "operation:SecondCancel" }] }],
    ["manual semantic checkpoint", admittedTransactionProgram()],
  ];
  for (const [label, candidate] of invalid) {
    const result = assessTemporalHostCapability(candidate);
    assert.equal(result.kind, TemporalHostCapabilityResultKind.Rejected, label);
    assert.ok(result.kind === TemporalHostCapabilityResultKind.Rejected);
    assert.equal(result.failure.code, label === "scheduled choice"
      ? TemporalHostAdmissionFailureCode.InternalChoiceSchedulerUnavailable
      : TemporalHostAdmissionFailureCode.CompensationSchedulerUnavailable, label);
  }
});
