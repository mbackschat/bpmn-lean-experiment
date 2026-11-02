/**
 * NEF-END-01 in committed core state over the travel request model: each journey reaches *Request closed* on a different
 * incoming flow, fires that flow's own `reachNoneEnd`, publishes one End occurrence and completes the Process without
 * waiting for the End's other flows. Expected operations and tasks are read off the proposal's witness-model account.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome, ControlStateKind, EffectExecutionResultKind, SemanticProfileId, SemanticTransitionKind, StimulusKind,
  applyStimulusWithTrace, initialState, isWellFormedRuntimeState,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticProcessProgram, Stimulus, VariableBinding } from "@bpmn-lean/semantic-core";
import { text } from "./effect-data-fixture.ts";
import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";

const directory = new URL("../../../scenarios/none-end-fan-in/", import.meta.url);
const instanceId = "Travel_1";
const overlay = new Uint8Array(await readFile(new URL("travel-request-overlay.json", directory)));
const compiled = await compileBpmnToSemanticProcess({
  bytes: new Uint8Array(await readFile(new URL("travel-request.bpmn", directory))), sourceId: "travel-request",
  expectedSha256: undefined, semanticProfile: SemanticProfileId.NestedEmbeddedScopeData,
  sourceOverlay: { id: "travel-request-handlers", sha256: createHash("sha256").update(overlay).digest("hex"), bytes: overlay },
  limits: semanticProcessTestLimits,
});
assert.ok(compiled.status === BpmnCompilationStatus.Accepted, JSON.stringify(compiled.diagnostics));
const program: SemanticProcessProgram = compiled.semanticProcess;

const bind = (name: string, value: string): VariableBinding => ({ name, value: text(value) });

/** Commits `stimulus`, returning the next state and the End operations and End occurrences it published. */
function commit(state: RuntimeState, stimulus: Stimulus) {
  const traced = applyStimulusWithTrace(program, state, stimulus);
  assert.equal(traced.result.outcome, CommandOutcome.Committed, JSON.stringify(stimulus));
  assert.equal(isWellFormedRuntimeState(program, instanceId, traced.result.state), true, JSON.stringify(stimulus));
  const endOperations = traced.committedTransitions.flatMap(({ transition }) =>
    transition.kind === SemanticTransitionKind.InternalOperation && transition.operationId.startsWith("operation:RequestClosed")
      ? [transition.operationId] : []);
  const endOccurrences = traced.flowNodeOccurrenceLifecycles.flatMap(({ started }) => started)
    .filter(({ elementId }) => elementId === "RequestClosed").length;
  return { state: traced.result.state, endOperations, endOccurrences };
}

const userTask = (elementId: string, submittedValues: readonly VariableBinding[] = []): Stimulus => ({
  kind: StimulusKind.CompleteUserTaskInstance, commandId: `complete-${elementId}`,
  taskId: { processInstanceId: instanceId, elementId, activation: 1 }, submittedValues });

const openWork = (state: RuntimeState) =>
  [...state.userTaskWaits.map(({ id }) => id.elementId), ...state.effectWaits.map(({ id }) => id.elementId)].sort();

/** Starts the request for Ada and completes *Check request*, returning the step in which *Route request* chose. */
function assessed(decision: string, channel: string) {
  const opened = commit(initialState, { kind: StimulusKind.StartProcess, commandId: "start",
    processId: "Process_TravelRequest", instanceId, initialVariables: [bind("traveller", "Ada")] });
  assert.deepEqual(openWork(opened.state), ["CheckRequest"]);
  return commit(opened.state, userTask("CheckRequest", [bind("channel", channel), bind("decision", decision)]));
}

function endsOnceThrough(step: ReturnType<typeof commit>, flowId: string): void {
  assert.deepEqual(step.endOperations, [`operation:RequestClosed:from:${flowId}`]);
  assert.equal(step.endOccurrences, 1);
  assert.deepEqual(openWork(step.state), []);
  assert.equal(step.state.control.kind, ControlStateKind.Completed);
}

test("NEF-END-01: a rejected request ends straight from Route request", () => {
  endsOnceThrough(assessed("reject", "email"), "Flow_Reject");
});

test("NEF-END-01: a phone request ends from Call traveller, a flow other than the first declared", () => {
  const routed = assessed("approve", "phone");
  assert.deepEqual(routed.endOperations, []);
  assert.deepEqual(openWork(routed.state), ["CallTraveller"]);
  endsOnceThrough(commit(routed.state, userTask("CallTraveller")), "Flow_Called");
});

test("NEF-END-01: a booked request ends from Book travel after its effect result", () => {
  const routed = assessed("approve", "email");
  assert.deepEqual(openWork(routed.state), ["BookTravel"]);
  assert.deepEqual(routed.state.effectWaits[0]!.arguments, [bind("traveller", "Ada")]);
  endsOnceThrough(commit(routed.state, { kind: StimulusKind.CompleteEffect, commandId: "effect-BookTravel",
    effectId: { processInstanceId: instanceId, elementId: "BookTravel", activation: 1 },
    result: { kind: EffectExecutionResultKind.Success, localPatch: [bind("booking", "BK-9")] } }), "Flow_Booked");
});
