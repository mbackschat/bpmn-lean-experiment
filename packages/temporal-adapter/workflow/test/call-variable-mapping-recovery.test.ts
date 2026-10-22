/**
 * Continue-As-New carries the called-root frame (the Call variable mapping proposal's Temporal preflight): every stable
 * checkpoint of the loan application decodes to itself, and a carried frame breaking the called-root arm of frame
 * validity, owned by the caller or outliving its called root is refused instead of resumed.
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

const directory = new URL("../../../../scenarios/call-variable-mapping/", import.meta.url);
const instanceId = "Loan_1";
const calledInstanceId = deriveCalledProcessInstanceId(instanceId, "VerifyIdentity", 1);
const text = (value: string) => ({ kind: VariableValueKind.String, value }) as const;

async function loanProgram(): Promise<SemanticProcessProgram> {
  const overlay = await readFile(new URL("loan-application-overlay.json", directory));
  const compiled = await compileBpmnToSemanticProcess({
    bytes: await readFile(new URL("loan-application.bpmn", directory)), sourceId: "loan-application",
    expectedSha256: undefined,
    sourceOverlay: { id: "loan-application-handlers", sha256: createHash("sha256").update(overlay).digest("hex"), bytes: overlay },
    semanticProfile: SemanticProfileId.NestedEmbeddedScopeData,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  assert.ok(compiled.status === BpmnCompilationStatus.Accepted, JSON.stringify(compiled));
  return compiled.semanticProcess;
}

const journey: readonly Stimulus[] = [
  { kind: StimulusKind.StartProcess, commandId: "start", processId: "Process_LoanApplication", instanceId,
    initialVariables: [{ name: "amount", value: text("25000") }, { name: "applicant", value: text("Ada") }] },
  { kind: StimulusKind.CompleteEffect, commandId: "acknowledge",
    effectId: { processInstanceId: instanceId, elementId: "AcknowledgeApplication", activation: 1 },
    result: { kind: EffectExecutionResultKind.Success, localPatch: [] } },
  { kind: StimulusKind.CompleteUserTaskInstance, commandId: "collect",
    taskId: { processInstanceId: calledInstanceId, elementId: "CollectDocument", activation: 1 },
    submittedValues: [{ name: "amount", value: text("1") }] },
  { kind: StimulusKind.CompleteUserTaskInstance, commandId: "verdict",
    taskId: { processInstanceId: calledInstanceId, elementId: "RecordVerdict", activation: 1 },
    submittedValues: [{ name: "verdict", value: text("approved") }] },
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

test("every stable checkpoint of the mapped Call, with and without the called-root frame, decodes to itself", async () => {
  const program = await loanProgram();
  const states = await checkpoints(program);
  assert.deepEqual(states.map((state) => state.variables.scopes.filter(({ owner }) =>
    owner.processInstanceId === calledInstanceId).length), [0, 1, 1, 0]);
  for (const state of states) assert.deepEqual(decode(state, program), state);
});

test("a carried called-root frame without an input target, with a caller name or missing is refused", async () => {
  const program = await loanProgram();
  const [, live] = await checkpoints(program);
  assert.ok(live !== undefined);
  const frame = live.variables.scopes.find(({ owner }) => owner.processInstanceId === calledInstanceId);
  assert.ok(frame !== undefined);
  const withFrame = (scopes: RuntimeState["variables"]["scopes"]): RuntimeState =>
    ({ ...live, variables: { ...live.variables, scopes } });
  const others = live.variables.scopes.filter((candidate) => candidate !== frame);
  for (const tampered of [
    withFrame([...others, { ...frame, bindings: frame.bindings.filter(({ name }) => name !== "customer") }]),
    withFrame([...others, { ...frame, bindings: [...frame.bindings, { name: "decision", value: text("forged") }] }]),
    withFrame(others),
  ]) {
    assert.throws(() => decode(tampered, program), TypeError);
  }
});

test("a carried called-root frame owned by the caller, or outliving its called root, is refused", async () => {
  const program = await loanProgram();
  const [, live, , returned] = await checkpoints(program);
  assert.ok(live !== undefined && returned !== undefined);
  const frame = live.variables.scopes.find(({ owner }) => owner.processInstanceId === calledInstanceId);
  assert.ok(frame !== undefined);
  const others = live.variables.scopes.filter((candidate) => candidate !== frame);
  const callerOwned = { ...frame, owner: { ...frame.owner, processInstanceId: instanceId } };
  for (const tampered of [
    { ...live, variables: { ...live.variables, scopes: [...others, callerOwned] } },
    { ...returned, variables: { ...returned.variables, scopes: [...returned.variables.scopes, frame] } },
  ]) {
    assert.throws(() => decode(tampered, program), TypeError);
  }
});
