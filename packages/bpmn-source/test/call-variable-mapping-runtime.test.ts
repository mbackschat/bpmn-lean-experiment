/**
 * The core journey of the retained loan application (CVM-IN-01, CVM-ISOLATE-01, CVM-TASK-01, CVM-OUT-01,
 * CVM-RETIRE-01, CVM-REFUSE-01, CVM-START-01). Frame contents are runtime-only, so this test reads committed state
 * directly; the oracle is the Call variable mapping proposal's stable rules and the CIB extraction they record.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome, EffectExecutionResultKind, SemanticProfileId, StimulusKind, VariableValueKind,
  applyStimulus, deriveCalledProcessInstanceId, initialState, isWellFormedRuntimeState,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticProcessProgram, Stimulus, VariableBinding } from "@bpmn-lean/semantic-core";

const directory = new URL("../../../scenarios/call-variable-mapping/", import.meta.url);
const instanceId = "Loan_1";
const calledInstanceId = deriveCalledProcessInstanceId(instanceId, "VerifyIdentity", 1);

async function loanProgram(): Promise<SemanticProcessProgram> {
  const overlay = new Uint8Array(await readFile(new URL("loan-application-overlay.json", directory)));
  const result = await compileBpmnToSemanticProcess({
    bytes: new Uint8Array(await readFile(new URL("loan-application.bpmn", directory))), sourceId: "loan-application",
    expectedSha256: undefined, semanticProfile: SemanticProfileId.NestedEmbeddedScopeData,
    sourceOverlay: { id: "loan-application-handlers", sha256: createHash("sha256").update(overlay).digest("hex"), bytes: overlay },
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 5000 },
  });
  assert.ok(result.status === BpmnCompilationStatus.Accepted, JSON.stringify(result.diagnostics));
  return result.semanticProcess;
}

const text = (value: string) => ({ kind: VariableValueKind.String, value }) as const;
const nullValue = { kind: VariableValueKind.Null } as const;
const bind = (name: string, value: VariableBinding["value"]): VariableBinding => ({ name, value });

const start = (initialVariables: readonly VariableBinding[]): Stimulus => ({
  kind: StimulusKind.StartProcess, commandId: "start", processId: "Process_LoanApplication", instanceId, initialVariables,
});
const score: Stimulus = {
  kind: StimulusKind.CompleteEffect, commandId: "score",
  effectId: { processInstanceId: instanceId, elementId: "ScoreApplication", activation: 1 },
  result: { kind: EffectExecutionResultKind.Success, localPatch: [bind("riskScore", text("low"))] },
};
const complete = (elementId: string, submittedValues: readonly VariableBinding[], processInstanceId = calledInstanceId):
  Stimulus => ({ kind: StimulusKind.CompleteUserTaskInstance, commandId: `complete-${elementId}`,
  taskId: { processInstanceId, elementId, activation: 1 }, submittedValues });

function commit(program: SemanticProcessProgram, state: RuntimeState, stimulus: Stimulus): RuntimeState {
  const result = applyStimulus(program, state, stimulus);
  assert.equal(result.outcome, CommandOutcome.Committed, JSON.stringify(stimulus));
  assert.equal(isWellFormedRuntimeState(program, instanceId, result.state), true, JSON.stringify(stimulus));
  return result.state;
}

function rejected(program: SemanticProcessProgram, state: RuntimeState, stimulus: Stimulus, label: string): void {
  const result = applyStimulus(program, state, stimulus);
  assert.equal(result.outcome, CommandOutcome.Rejected, label);
  assert.deepEqual(result.state, state, label);
}

const calledFrame = (state: RuntimeState) =>
  state.variables.scopes.find(({ owner }) => owner.processInstanceId === calledInstanceId)?.bindings;
const processBindings = (state: RuntimeState) => state.variables.process.bindings;

test("the loan application copies inputs by value, isolates called writes and lands outputs at the nearest owner", async () => {
  const program = await loanProgram();
  let state = commit(program, initialState, start([bind("amount", text("25000")), bind("applicant", text("Ada"))]));
  state = commit(program, state, score);
  // CVM-IN-01: the called-root frame holds exactly the input targets, copied before the called instance exists.
  assert.deepEqual(calledFrame(state), [bind("amount", text("25000")), bind("customer", text("Ada"))]);
  // CVM-TASK-01 and CVM-REFUSE-01: caller-only names, a caller-addressed completion and an unknown name are rejected.
  rejected(program, state, complete("CollectDocument", [bind("riskScore", text("high"))]), "caller-only name");
  rejected(program, state, complete("CollectDocument", [bind("secret", text("leak"))]), "caller frame name");
  rejected(program, state, complete("CollectDocument", [], instanceId), "caller-addressed completion");
  rejected(program, state, complete("CollectDocument", [bind("unrelated", text("x"))]), "undeclared name");
  // CVM-ISOLATE-01: the namesake `amount` written by the called task stays in the called frame.
  state = commit(program, state, complete("CollectDocument", [bind("amount", text("1"))]));
  assert.deepEqual(calledFrame(state), [bind("amount", text("1")), bind("customer", text("Ada"))]);
  assert.deepEqual(processBindings(state).find(({ name }) => name === "amount"), bind("amount", text("25000")));
  // An output source grows the frame inside its allowed names.
  state = commit(program, state, complete("RecordVerdict", [bind("verdict", text("approved"))]));
  // CVM-OUT-01 and CVM-RETIRE-01: `decision` landed in the review frame and left as `finalDecision`; no frame remains.
  assert.equal(calledFrame(state), undefined);
  assert.equal(state.variables.scopes.length, 0);
  assert.deepEqual(processBindings(state), [
    bind("amount", text("25000")), bind("applicant", text("Ada")), bind("echoedCustomer", text("Ada")),
    bind("finalDecision", text("approved")), bind("riskScore", text("low")),
  ]);
  rejected(program, state, complete("RecordVerdict", [bind("verdict", text("late"))]), "stale called completion");
  state = commit(program, state, complete("ConfirmDecision", [], instanceId));
  assert.equal(state.control.kind, "completed");
});

test("an absent input source copies a present null and an output source the callee never sets overwrites with null", async () => {
  const program = await loanProgram();
  let state = commit(program, initialState, start([bind("amount", text("25000")), bind("echoedCustomer", text("old"))]));
  state = commit(program, state, score);
  assert.deepEqual(calledFrame(state), [bind("amount", text("25000")), bind("customer", nullValue)]);
  state = commit(program, state, complete("CollectDocument", []));
  state = commit(program, state, complete("RecordVerdict", []));
  assert.deepEqual(processBindings(state).filter(({ name }) => name === "echoedCustomer" || name === "finalDecision"),
    [bind("echoedCustomer", nullValue), bind("finalDecision", nullValue)]);
});

test("CVM-START-01 admits Call sources and Process-level output targets and rejects a called-only name", async () => {
  const program = await loanProgram();
  commit(program, initialState, start([bind("amount", text("1")), bind("applicant", nullValue), bind("echoedCustomer", text("x"))]));
  rejected(program, initialState, start([bind("amount", text("1")), bind("customer", text("Ada"))]), "called-only name");
  rejected(program, initialState, start([bind("amount", text("1")), bind("decision", text("old"))]), "frame-declared target");
  rejected(program, initialState, start([bind("applicant", text("Ada"))]), "missing required amount");
});
