import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyStimulusWithTrace, CommandOutcome, ControlStateKind, evaluateStimulusWithSelectedSteps,
  FlowNodeOccurrenceTerminalKind, initialState, SemanticFlowNodeOccurrenceAnchorKind,
  SemanticOperationKind, SemanticOriginKind, SemanticTransitionKind, VariableValueKind,
} from "@bpmn-lean/semantic-core";
import type {
  PublicControlPositionDelta, RuntimeState, ScopeOccurrenceId, Stimulus,
  UnnumberedFlowNodeOccurrenceDelta, VariableBinding, VariableValue,
} from "@bpmn-lean/semantic-core";
import {
  callActivityCompletion, callActivityStart, callElementId, calledProcessId, calledScopeId,
  callerProcessId, callerScopeId, expectedCalledInstanceId, instanceId,
} from "./call-activity-fixture.ts";
import { data, program } from "./call-data-fixture.ts";

const { supportsSemanticProcessExecution } = await import(new URL("../dist/semantic-process-admission.js", import.meta.url).href) as typeof import("../src/semantic-process-admission.ts");
const { callDataStateIsValid } = await import(new URL("../dist/call-data-state-validation.js", import.meta.url).href) as typeof import("../src/call-data-state-validation.ts");
const { isGateAdmissibleRuntimeState } = await import(new URL("../dist/runtime-state-well-formedness.js", import.meta.url).href) as typeof import("../src/runtime-state-well-formedness.ts");
const scalar = (value: string): VariableValue => ({ kind: VariableValueKind.String, value });
const caller: ScopeOccurrenceId = { processInstanceId: instanceId, definitionScopeId: callerScopeId, activation: 1 };
const called: ScopeOccurrenceId = { processInstanceId: expectedCalledInstanceId, definitionScopeId: calledScopeId, activation: 1 };
const taskId = (owner: ScopeOccurrenceId, elementId: string) => ({ processInstanceId: owner.processInstanceId, elementId, activation: 1 });
const callAnchor = { kind: SemanticFlowNodeOccurrenceAnchorKind.CallActivity, id: taskId(caller, callElementId) } as const;
const waitAnchor = (owner: ScopeOccurrenceId, elementId: string) => ({ kind: SemanticFlowNodeOccurrenceAnchorKind.Wait, id: taskId(owner, elementId) } as const);
const emptyLifecycle: UnnumberedFlowNodeOccurrenceDelta = { started: [], ended: [] };
const completed = (anchor: typeof callAnchor | ReturnType<typeof waitAnchor>) => ({ started: [], ended: [{ anchor, terminal: FlowNodeOccurrenceTerminalKind.Completed }] });
const opened = (anchor: typeof callAnchor | ReturnType<typeof waitAnchor>, owner: ScopeOccurrenceId, processId: string, elementId: string) => ({ started: [{ anchor, owner, processId, elementId }], ended: [] });
function instant(commandId: string, transitionIndex: number, owner: ScopeOccurrenceId, processId: string, elementId: string): UnnumberedFlowNodeOccurrenceDelta {
  const anchor = { kind: SemanticFlowNodeOccurrenceAnchorKind.Transition, commandId, transitionIndex, localIndex: 0 } as const;
  return { started: [{ anchor, owner, processId, elementId }], ended: [{ anchor, terminal: FlowNodeOccurrenceTerminalKind.Completed }] };
}
const token = (sequenceFlowId: string, owner: ScopeOccurrenceId) => ({ sequenceFlowId, owner, multiplicity: 1 });
const scope = (id: ScopeOccurrenceId, bpmnElementId: string) => ({ id, parent: null, bpmnElementId });
const delta = (parts: Partial<PublicControlPositionDelta> = {}): PublicControlPositionDelta => ({ consumedTokens: [], producedTokens: [], enteredScopes: [], exitedScopes: [], ...parts });
function internal(operationId: string, operationKind: SemanticOperationKind, elementId: string, owner: ScopeOccurrenceId, positionDelta: PublicControlPositionDelta) {
  return { logicalTimeMs: 0, transition: { kind: SemanticTransitionKind.InternalOperation, operationId, operationKind,
    origin: { kind: SemanticOriginKind.BpmnElement, elementId }, owner }, positionDelta };
}
function external(stimulus: Stimulus, positionDelta: PublicControlPositionDelta) {
  return { logicalTimeMs: 0, transition: { kind: SemanticTransitionKind.ExternalStimulus, stimulus }, positionDelta };
}
function valid(state: RuntimeState): void {
  assert.equal(callDataStateIsValid(program, state), true);
  assert.equal(isGateAdmissibleRuntimeState(program, state.control.kind === ControlStateKind.NotStarted ? "" : instanceId, state), true);
}
function completion(owner: ScopeOccurrenceId, elementId: string, value: VariableValue) {
  return { ...callActivityCompletion(owner.processInstanceId, elementId, `complete-${elementId}`), submittedValues: [{ name: `${elementId}_output`, value }] };
}
function noPublication(state: RuntimeState, stimulus: Stimulus, fuel: number, outcome: CommandOutcome): void {
  const preserved = structuredClone(state);
  const trace = applyStimulusWithTrace(program, state, stimulus, fuel);
  assert.deepEqual(trace.result, { state, outcome, internalStepBoundExceeded: outcome === CommandOutcome.RolledBack, ambiguousInternalChoice: false });
  assert.equal(trace.result.state, state);
  assert.deepEqual(state, preserved);
  assert.deepEqual(trace.committedTransitions, []);
  assert.deepEqual(trace.flowNodeOccurrenceLifecycles, []);
  assert.equal(trace.currentPositions, null);
}

for (const value of [scalar("supplier decision"), { kind: VariableValueKind.Null }] as const) {
  test(`private Call execution admits the exact scalar Program for ${value.kind}`, () => {
    assert.equal(supportsSemanticProcessExecution(callActivityStart([{ name: "Request", value }]), program), true);
  });
  test(`scheduled ${value.kind} supplier trace has exact 3/3/2 closure and complete E1/E2 facts`, () => {
    const requestValue = value.kind === VariableValueKind.Null ? value : scalar("supplier summary");
    const bindings: VariableBinding[] = [{ name: "Request", value: requestValue }, { name: "Result", value: scalar("before-return") }, { name: "Unused", value: scalar("untouched") }];
    const start = callActivityStart(bindings);
    const finishCalled = completion(called, "Task_Called", value);
    const finishCaller = completion(caller, "Task_Caller", scalar("onboarding receipt"));
    const started = applyStimulusWithTrace(program, initialState, start, 3);
    assert.equal(started.result.outcome, CommandOutcome.Committed);
    assert.deepEqual(started.committedTransitions, [
      external(start, delta({ enteredScopes: [scope(caller, callerProcessId)] })),
      internal("operation:Start_Caller", SemanticOperationKind.Initiate, "Start_Caller", caller, delta({ producedTokens: [token("Caller_Start", caller)] })),
      internal(`operation:${callElementId}`, SemanticOperationKind.InvokeProcess, callElementId, caller,
        delta({ consumedTokens: [token("Caller_Start", caller)], producedTokens: [token("Called_Start", called)], enteredScopes: [scope(called, calledProcessId)] })),
      internal("operation:Task_Called", SemanticOperationKind.AwaitDataInputOutputUserTask, "Task_Called", called, delta({ consumedTokens: [token("Called_Start", called)] })),
    ]);
    assert.deepEqual(started.flowNodeOccurrenceLifecycles, [emptyLifecycle,
      instant(start.commandId, 1, caller, callerProcessId, "Start_Caller"),
      opened(callAnchor, caller, callerProcessId, callElementId),
      opened(waitAnchor(called, "Task_Called"), called, calledProcessId, "Task_Called"),
    ]);
    assert.deepEqual(started.currentPositions, { controlTokens: [], scopes: [scope(caller, callerProcessId), scope(called, calledProcessId)] });
    assert.deepEqual(started.result.state.variables.process.bindings, bindings);
    assert.deepEqual(started.result.state.variables.processInterfaces, [{ owner: called, inputs: [{ name: data.called.input.id, value: requestValue }], outputs: [] }]);
    assert.deepEqual(started.result.state.variables.activities[0]?.bindings, [{ name: "Task_Called_input", value: requestValue }]);

    const returned = applyStimulusWithTrace(program, started.result.state, finishCalled, 3);
    assert.equal(returned.result.outcome, CommandOutcome.Committed);
    assert.deepEqual(returned.committedTransitions, [
      external(finishCalled, delta({ producedTokens: [token("Called_End", called)] })),
      internal("operation:End_Called", SemanticOperationKind.ReachNoneEnd, "End_Called", called, delta({ consumedTokens: [token("Called_End", called)] })),
      internal(`operation:return-process:${callElementId}`, SemanticOperationKind.ReturnProcess, callElementId, called,
        delta({ producedTokens: [token("Call_To_Caller_Task", caller)], exitedScopes: [scope(called, calledProcessId)] })),
      internal("operation:Task_Caller", SemanticOperationKind.AwaitDataInputOutputUserTask, "Task_Caller", caller, delta({ consumedTokens: [token("Call_To_Caller_Task", caller)] })),
    ]);
    assert.deepEqual(returned.flowNodeOccurrenceLifecycles, [completed(waitAnchor(called, "Task_Called")),
      instant(finishCalled.commandId, 1, called, calledProcessId, "End_Called"), completed(callAnchor),
      opened(waitAnchor(caller, "Task_Caller"), caller, callerProcessId, "Task_Caller"),
    ]);
    assert.deepEqual(returned.result.state.variables.process.bindings, [bindings[0], { name: "Result", value }, bindings[2]]);
    assert.deepEqual(returned.currentPositions, { controlTokens: [], scopes: [scope(caller, callerProcessId)] });
    assert.deepEqual(returned.result.state.variables.processInterfaces, []);
    assert.deepEqual(returned.result.state.calledProcessOccurrences, []);
    assert.deepEqual(returned.result.state.variables.activities[0]?.bindings, [{ name: "Task_Caller_input", value }]);

    const terminal = applyStimulusWithTrace(program, returned.result.state, finishCaller, 2);
    assert.equal(terminal.result.outcome, CommandOutcome.Committed);
    assert.deepEqual(terminal.committedTransitions, [
      external(finishCaller, delta({ producedTokens: [token("Caller_End", caller)] })),
      internal("operation:End_Caller", SemanticOperationKind.ReachNoneEnd, "End_Caller", caller, delta({ consumedTokens: [token("Caller_End", caller)] })),
      internal(`operation:complete-scope:${callerScopeId}`, SemanticOperationKind.CompleteScope, callerProcessId, caller, delta({ exitedScopes: [scope(caller, callerProcessId)] })),
    ]);
    assert.deepEqual(terminal.flowNodeOccurrenceLifecycles, [completed(waitAnchor(caller, "Task_Caller")),
      instant(finishCaller.commandId, 1, caller, callerProcessId, "End_Caller"), emptyLifecycle]);
    assert.deepEqual(terminal.result.state.control, { kind: ControlStateKind.Completed, instanceId });
    assert.deepEqual(terminal.result.state.variables.process.bindings, [{ name: "Receipt", value: scalar("onboarding receipt") }, bindings[0], { name: "Result", value }, bindings[2]]);
    assert.deepEqual(terminal.result.state.variables.processInterfaces, []);
    assert.deepEqual(terminal.result.state.variables.activities, []);
    assert.deepEqual(terminal.currentPositions, { controlTokens: [], scopes: [] });

    for (const [before, stimulus, fuel] of [[initialState, start, 3], [started.result.state, finishCalled, 3], [returned.result.state, finishCaller, 2]] as const) {
      valid(before);
      const scheduled = evaluateStimulusWithSelectedSteps(program, before, stimulus, fuel);
      assert.equal(scheduled.selectedInternalSteps.length, fuel);
      assert.ok(scheduled.admittedState !== null);
      valid(scheduled.admittedState);
      for (const step of scheduled.selectedInternalSteps) valid(step.successor);
      noPublication(before, stimulus, fuel - 1, CommandOutcome.RolledBack);
    }
    valid(terminal.result.state);
    const calledPhase = evaluateStimulusWithSelectedSteps(program, started.result.state, finishCalled, 3);
    assert.deepEqual(calledPhase.admittedState?.variables.process.bindings, bindings);
    assert.deepEqual(calledPhase.admittedState?.variables.processInterfaces, [{ owner: called, inputs: [{ name: data.called.input.id, value: requestValue }], outputs: [{ name: data.called.output.id, value }] }]);
    assert.deepEqual(calledPhase.selectedInternalSteps[0]?.successor.variables.process.bindings, bindings);
    assert.deepEqual(calledPhase.selectedInternalSteps[0]?.successor.variables.processInterfaces, calledPhase.admittedState?.variables.processInterfaces);
  });
}

test("scheduled wrong, stale and malformed commands preserve the exact state without publications", () => {
  const start = callActivityStart([{ name: "Request", value: scalar("supplier") }]);
  const started = applyStimulusWithTrace(program, initialState, start, 3).result.state;
  const finishCalled = completion(called, "Task_Called", scalar("approved"));
  for (const stimulus of [start,
    { ...finishCalled, taskId: taskId(caller, "Task_Called") },
    { ...finishCalled, taskId: { ...finishCalled.taskId, activation: 2 } },
    { ...finishCalled, taskId: taskId(called, "Task_Caller") },
    { ...finishCalled, submittedValues: [] },
    { ...finishCalled, submittedValues: [{ name: data.called.output.id, value: scalar("wrong port") }] },
    { ...finishCalled, submittedValues: [...finishCalled.submittedValues, ...finishCalled.submittedValues] },
    { ...finishCalled, submittedValues: [{ name: "Task_Called_output", value: { kind: VariableValueKind.Boolean, value: true } }] },
  ] as const) noPublication(started, stimulus, 3, CommandOutcome.Rejected);
  const returned = applyStimulusWithTrace(program, started, finishCalled, 3).result.state;
  noPublication(returned, finishCalled, 3, CommandOutcome.Rejected);
  noPublication(initialState, callActivityStart([]), 3, CommandOutcome.Rejected);
  const iface = started.variables.processInterfaces[0]!;
  const malformed = { ...started, variables: { ...started.variables, processInterfaces: [{ ...iface, inputs: [...iface.inputs, { name: "undeclared", value: scalar("injected") }] }] } };
  noPublication(malformed, finishCalled, 3, CommandOutcome.Rejected);
});


test("private execution selection still requires the exact scalar topology and predecessors reject its endpoints", () => {
  const start = callActivityStart([{ name: "Request", value: scalar("supplier") }]);
  const wrongOwner = { ...program, operations: program.operations.map((operation) =>
    operation.kind === SemanticOperationKind.AwaitDataInputOutputUserTask && operation.task.elementId === "Task_Called"
      ? { ...operation, directInput: { ...operation.directInput, source: { kind: "property" as const, propertyId: "Request" } } } : operation) };
  assert.equal(supportsSemanticProcessExecution(start, wrongOwner), false);
  assert.equal(supportsSemanticProcessExecution(start, { ...program, operations: program.operations.slice(1) }), false);
  assert.equal(supportsSemanticProcessExecution(start, { ...program, identity: { ...program.identity, semanticProfile: "bpmn-2.0.2-called-process-call-activity-draft" } }), false);
});
