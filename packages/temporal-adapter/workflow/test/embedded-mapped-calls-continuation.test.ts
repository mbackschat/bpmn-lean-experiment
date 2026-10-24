/**
 * Continue-As-New carries Stage B's embedded-caller record (the repeated, nested and concurrent Calls specification's
 * Temporal preflight): every running checkpoint of the guarantor loan decodes to itself, and the continuation decoder,
 * validating through the lifted association validity, refuses a record whose caller is absent or not the occurrence
 * holding its invocation.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome, EffectExecutionResultKind, SemanticProfileId, StimulusKind, VariableValueKind, applyStimulus,
  deriveCalledProcessInstanceId, initialState,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticProcessProgram, Stimulus } from "@bpmn-lean/semantic-core";
import { requireBpmnWorkflowContinuationStateV1 } from "@bpmn-lean/temporal-protocol";

const directory = new URL("../../../../scenarios/repeated-nested-concurrent-calls/", import.meta.url);
const instanceId = "Loan_1";
const applicantCall = deriveCalledProcessInstanceId(instanceId, "VerifyApplicant", 1);
const guarantorCall = deriveCalledProcessInstanceId(instanceId, "VerifyGuarantor", 1);
const text = (value: string) => ({ kind: VariableValueKind.String, value }) as const;

async function guarantorProgram(): Promise<SemanticProcessProgram> {
  const overlay = await readFile(new URL("guarantor-loan-overlay.json", directory));
  const compiled = await compileBpmnToSemanticProcess({
    bytes: await readFile(new URL("guarantor-loan.bpmn", directory)), sourceId: "guarantor-loan",
    expectedSha256: undefined,
    sourceOverlay: { id: "guarantor-loan-handlers", sha256: createHash("sha256").update(overlay).digest("hex"), bytes: overlay },
    semanticProfile: SemanticProfileId.NestedEmbeddedScopeData,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  assert.ok(compiled.status === BpmnCompilationStatus.Accepted, JSON.stringify(compiled));
  return compiled.semanticProcess;
}

const task = (processInstanceId: string, elementId: string, activation: number, commandId: string,
  submitted: readonly [string, string][] = []): Stimulus => ({
  kind: StimulusKind.CompleteUserTaskInstance, commandId, taskId: { processInstanceId, elementId, activation },
  submittedValues: submitted.map(([name, value]) => ({ name, value: text(value) })),
});

const journey: readonly Stimulus[] = [
  { kind: StimulusKind.StartProcess, commandId: "start", processId: "Process_GuarantorLoan", instanceId,
    initialVariables: [{ name: "amount", value: text("25000") }, { name: "applicant", value: text("Ada") },
      { name: "guarantor", value: text("Bob") }] },
  { kind: StimulusKind.CompleteEffect, commandId: "register",
    effectId: { processInstanceId: instanceId, elementId: "RegisterApplication", activation: 1 },
    result: { kind: EffectExecutionResultKind.Success, localPatch: [] } },
  task(applicantCall, "CollectDocument", 1, "applicant-collect"),
  task(applicantCall, "RecordVerdict", 1, "applicant-verdict", [["verdict", "approved"]]),
  task(guarantorCall, "CollectDocument", 2, "guarantor-collect"),
  task(guarantorCall, "RecordVerdict", 2, "guarantor-verdict", [["verdict", "rejected"]]),
];

async function checkpoints(program: SemanticProcessProgram): Promise<RuntimeState[]> {
  const states: RuntimeState[] = [];
  let state: RuntimeState = initialState;
  for (const stimulus of journey) {
    const result = applyStimulus(program, state, stimulus);
    assert.equal(result.outcome, CommandOutcome.Committed, stimulus.commandId);
    state = result.state;
    states.push(state);
  }
  return states;
}

const decode = (state: RuntimeState, program: SemanticProcessProgram) =>
  requireBpmnWorkflowContinuationStateV1(JSON.parse(JSON.stringify(state)), program, instanceId);

test("every running checkpoint of the guarantor loan, embedded-caller record included, decodes to itself", async () => {
  const program = await guarantorProgram();
  const states = await checkpoints(program);
  assert.deepEqual(states.map((state) => state.calledProcessOccurrences.map(({ caller }) => caller.definitionScopeId)),
    [[], ["scope:Process_GuarantorLoan"], ["scope:Process_GuarantorLoan"], ["scope:GuarantorReview"],
      ["scope:GuarantorReview"], []]);
  for (const state of states) assert.deepEqual(decode(state, program), state);
});

test("a carried embedded-caller record moved to the Process root occurrence or to no live occurrence is refused", async () => {
  const program = await guarantorProgram();
  const live = (await checkpoints(program))[3];
  assert.ok(live !== undefined);
  const root = live.scopeOccurrences.find(({ id, parent }) => id.processInstanceId === instanceId && parent === null);
  assert.ok(root !== undefined);
  const withCaller = (caller: RuntimeState["calledProcessOccurrences"][number]["caller"]): RuntimeState =>
    ({ ...live, calledProcessOccurrences: live.calledProcessOccurrences.map((record) => ({ ...record, caller })) });
  const [record] = live.calledProcessOccurrences;
  assert.ok(record !== undefined);
  for (const tampered of [withCaller(root.id), withCaller({ ...record.caller, activation: record.caller.activation + 1 })]) {
    assert.throws(() => decode(tampered, program), TypeError);
  }
});
