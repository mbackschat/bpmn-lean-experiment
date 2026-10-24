/**
 * The core journey of the retained guarantor loan (CALLN-FRAME-01, CALLN-INVOKE-01, CALLN-RETURN-01,
 * CALLN-IDENTITY-01, CALLN-REFUSE-01 for Stage B). Frame contents are runtime-only, so this test reads committed state
 * directly; the oracle is the repeated, nested and concurrent Calls specification's Stage B rules over the Call variable
 * mapping account.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome, EffectExecutionResultKind, RuntimeStateDefect, SemanticProfileId, StimulusKind, VariableValueKind,
  applyStimulus, deriveCalledProcessInstanceId, initialState, isWellFormedRuntimeState, runtimeStateDefects,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticProcessProgram, Stimulus, VariableBinding } from "@bpmn-lean/semantic-core";

const directory = new URL("../../../scenarios/repeated-nested-concurrent-calls/", import.meta.url);
const instanceId = "Loan_1";
const applicantCall = deriveCalledProcessInstanceId(instanceId, "VerifyApplicant", 1);
const guarantorCall = deriveCalledProcessInstanceId(instanceId, "VerifyGuarantor", 1);

async function guarantorProgram(transform: (xml: string) => string = (xml) => xml): Promise<SemanticProcessProgram> {
  const overlay = new Uint8Array(await readFile(new URL("guarantor-loan-overlay.json", directory)));
  const xml = transform(await readFile(new URL("guarantor-loan.bpmn", directory), "utf8"));
  const result = await compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(xml), sourceId: "guarantor-loan",
    expectedSha256: undefined, semanticProfile: SemanticProfileId.NestedEmbeddedScopeData,
    sourceOverlay: { id: "guarantor-loan-handlers", sha256: createHash("sha256").update(overlay).digest("hex"), bytes: overlay },
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 5000 },
  });
  assert.ok(result.status === BpmnCompilationStatus.Accepted, JSON.stringify(result.diagnostics));
  return result.semanticProcess;
}

const text = (value: string) => ({ kind: VariableValueKind.String, value }) as const;
const bind = (name: string, value: VariableBinding["value"]): VariableBinding => ({ name, value });

const start: Stimulus = {
  kind: StimulusKind.StartProcess, commandId: "start", processId: "Process_GuarantorLoan", instanceId,
  initialVariables: [bind("amount", text("25000")), bind("applicant", text("Ada")), bind("guarantor", text("Bob"))],
};
const register: Stimulus = {
  kind: StimulusKind.CompleteEffect, commandId: "register",
  effectId: { processInstanceId: instanceId, elementId: "RegisterApplication", activation: 1 },
  result: { kind: EffectExecutionResultKind.Success, localPatch: [] },
};
const complete = (processInstanceId: string, elementId: string, activation: number,
  submittedValues: readonly VariableBinding[] = []): Stimulus => ({
  kind: StimulusKind.CompleteUserTaskInstance, commandId: `complete-${elementId}-${activation}`,
  taskId: { processInstanceId, elementId, activation }, submittedValues,
});

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

const frameOf = (state: RuntimeState, processInstanceId: string, definitionScopeId: string) =>
  state.variables.scopes.find(({ owner }) =>
    owner.processInstanceId === processInstanceId && owner.definitionScopeId === definitionScopeId)?.bindings;
const processBindings = (state: RuntimeState) => state.variables.process.bindings;

test("CALLN-FRAME-01 the Sub-Process Call reads and writes through its frame beside the repeated root-path Call", async () => {
  const program = await guarantorProgram();
  let state = commit(program, initialState, start);
  state = commit(program, state, register);
  assert.deepEqual(frameOf(state, applicantCall, "scope:Process_IdentityVerification"),
    [bind("amount", text("25000")), bind("customer", text("Ada"))]);
  state = commit(program, state, complete(applicantCall, "CollectDocument", 1, [bind("amount", text("20000"))]));
  state = commit(program, state, complete(applicantCall, "RecordVerdict", 1, [bind("verdict", text("approved"))]));
  assert.deepEqual(processBindings(state), [
    bind("amount", text("25000")), bind("applicant", text("Ada")), bind("applicantVerdict", text("approved")),
    bind("guarantor", text("Bob")),
  ]);

  // CALLN-INVOKE-01: the second Call is invoked from the Guarantor review occurrence, with its own mappings.
  const record = state.calledProcessOccurrences.find(({ id }) => id.elementId === "VerifyGuarantor");
  assert.equal(record?.caller.definitionScopeId, "scope:GuarantorReview");
  assert.equal(record?.calledRoot.processInstanceId, guarantorCall);
  assert.deepEqual(frameOf(state, guarantorCall, "scope:Process_IdentityVerification"), [bind("customer", text("Bob"))]);
  assert.deepEqual(frameOf(state, instanceId, "scope:GuarantorReview"), [bind("guarantorVerdict", text("pending"))]);
  // The Guarantor review occurrence holds no token and no wait of its own, only the live record, and stays live.
  const review = state.scopeOccurrences.filter(({ id }) => id.definitionScopeId === "scope:GuarantorReview");
  assert.equal(review.length, 1);
  assert.equal(state.controlTokens.some(({ owner }) => owner.definitionScopeId === "scope:GuarantorReview"), false);
  assert.equal(state.userTaskWaits.some(({ owner }) => owner.definitionScopeId === "scope:GuarantorReview"), false);

  // CALLN-REFUSE-01: the returned first instance's task, a cross-addressed and a caller-addressed completion.
  rejected(program, state, complete(applicantCall, "RecordVerdict", 1, [bind("verdict", text("late"))]), "stale first call");
  rejected(program, state, complete(applicantCall, "CollectDocument", 2), "first call's identity");
  rejected(program, state, complete(instanceId, "CollectDocument", 2), "caller identity");
  rejected(program, state, complete(guarantorCall, "CollectDocument", 2, [bind("guarantor", text("Eve"))]),
    "caller-only name");
  // CVM-TASK-01 by the live record's Call: `amount` is a called name of the first Call only.
  rejected(program, state, complete(guarantorCall, "CollectDocument", 2, [bind("amount", text("1"))]),
    "first Call's called name");

  // CALLN-IDENTITY-01: the repeated call's first task carries activation 2 under its own called identity.
  state = commit(program, state, complete(guarantorCall, "CollectDocument", 2));
  state = commit(program, state, complete(guarantorCall, "RecordVerdict", 2, [bind("verdict", text("rejected"))]));

  // CALLN-FRAME-01: the declaring Sub-Process frame takes the output; the root Call's output stays as written.
  assert.equal(state.calledProcessOccurrences.length, 0);
  assert.deepEqual(frameOf(state, instanceId, "scope:GuarantorReview"), [bind("guarantorVerdict", text("rejected"))]);
  assert.equal(processBindings(state).some(({ name }) => name === "guarantorVerdict"), false);
  assert.deepEqual(processBindings(state).find(({ name }) => name === "applicantVerdict"),
    bind("applicantVerdict", text("approved")));

  // The Sub-Process publishes the verdict on completion.
  state = commit(program, state, complete(instanceId, "ConfirmGuarantor", 1));
  assert.equal(state.control.kind, "completed");
  assert.deepEqual(processBindings(state), [
    bind("amount", text("25000")), bind("applicant", text("Ada")), bind("applicantVerdict", text("approved")),
    bind("guarantor", text("Bob")), bind("guarantorVerdict", text("rejected")),
  ]);
});

/** Wraps the guarantor Call in one further Sub-Process, `VerifyGuarantor`, so the Call sits at depth two. */
function nestGuarantorCall(xml: string): string {
  const start = xml.indexOf('<callActivity id="VerifyGuarantor"');
  const end = xml.indexOf("</callActivity>", start) + "</callActivity>".length;
  const call = xml.slice(start, end).replace('id="VerifyGuarantor"', 'id="VerifyGuarantorInner"');
  return xml.slice(0, start) + '<subProcess id="VerifyGuarantor"><startEvent id="InnerStart" />' + call +
    '<endEvent id="InnerEnd" /><sequenceFlow id="InnerIn" sourceRef="InnerStart" targetRef="VerifyGuarantorInner" />' +
    '<sequenceFlow id="InnerOut" sourceRef="VerifyGuarantorInner" targetRef="InnerEnd" /></subProcess>' + xml.slice(end);
}

async function secondCallLive(program: SemanticProcessProgram): Promise<RuntimeState> {
  let state = commit(program, initialState, start);
  state = commit(program, state, register);
  state = commit(program, state, complete(applicantCall, "CollectDocument", 1));
  return commit(program, state, complete(applicantCall, "RecordVerdict", 1));
}

/**
 * Lifting the parentless-caller premise leaves the call record's caller free to name any live occurrence of its
 * instance, so state validity binds it to the scope that holds the record's own invocation; otherwise return would
 * place the caller token at a place its owner's scope does not hold. Each mutant moves one live record's caller to
 * another live occurrence of the same instance, keeping the derived called identity valid.
 */
test("CALLN-FRAME-01 state validity binds a live record's caller to the scope of its own invocation", async () => {
  for (const [label, transform, element, wrongScope] of [
    ["Sub-Process Call moved to the Process root", (xml: string) => xml, "VerifyGuarantor", "scope:Process_GuarantorLoan"],
    ["depth-two Call moved to its enclosing Sub-Process", nestGuarantorCall, "VerifyGuarantorInner", "scope:GuarantorReview"],
  ] as const) {
    const program = await guarantorProgram(transform);
    const state = await secondCallLive(program);
    const wrong = state.scopeOccurrences.find(({ id }) =>
      id.processInstanceId === instanceId && id.definitionScopeId === wrongScope)?.id;
    assert.ok(wrong !== undefined && state.calledProcessOccurrences.some(({ id }) => id.elementId === element), label);
    const moved: RuntimeState = { ...state, calledProcessOccurrences: state.calledProcessOccurrences.map((record) =>
      record.id.elementId === element ? { ...record, caller: wrong } : record) };
    assert.deepEqual(runtimeStateDefects(program, instanceId, moved), [RuntimeStateDefect.UndeclaredHiddenRecord], label);
  }
});

