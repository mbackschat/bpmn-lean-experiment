import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CommandOutcome,
  EffectExecutionResultKind,
  FlowNodeOccurrenceTerminalKind,
  SemanticFlowNodeOccurrenceAnchorKind,
  SemanticOperationKind,
  SemanticTransitionKind,
  StimulusKind,
  applyStimulusWithTrace,
  attachedHandlersForBodyAnchor,
  foldFlowNodeOccurrenceLifecycleDelta,
  isWellFormedSemanticProcessProgram,
  initialState,
  projectOpenFlowNodeOccurrences,
  requireCompleteFlowNodeOccurrenceLifecycles,
  type RuntimeState,
  type SemanticProcessProgram,
  type Stimulus,
  type TracedCommandResult,
  type UnnumberedFlowNodeOccurrenceDelta,
} from "@bpmn-lean/semantic-core";
import {
  admittedTransactionProgram,
  completeTransactionTask,
  startTransaction,
  transactionChildScope,
  transactionRootScope,
  transactionProcessId,
  transactionInstanceId,
} from "./transaction-cancellation-fixtures.ts";

test("Start publishes the Transaction and both branch Tasks with complete paired lifecycles", () => {
  const program = admittedTransactionProgram();
  const started = trace(program, initialState, {
    kind: StimulusKind.StartProcess,
    commandId: "publish-start",
    processId: transactionProcessId,
    instanceId: transactionInstanceId,
    initialVariables: [],
  });
  verify(program, initialState, started);
  const open = projectOpenFlowNodeOccurrences(program, started.result.state);
  assert.deepEqual(open?.map(({ elementId }) => elementId), ["Reserve", "Withdraw", "Transaction_Reservation"]);
});

test("Cancel End stays instantaneous while the Transaction waits for exact handler success", () => {
  const program = admittedTransactionProgram();
  const before = completeTransactionTask(program, startTransaction(program), "Reserve").state;
  const cancelled = traceTask(program, before, "Withdraw");
  const index = cancellationIndex(cancelled);
  const delta = cancelled.flowNodeOccurrenceLifecycles[index]!;
  assert.deepEqual(delta.started.map(({ elementId }) => elementId), ["Release_Reservation", "Cancel"]);
  assert.ok(delta.started.every(({ anchor }) => anchor.kind !== SemanticFlowNodeOccurrenceAnchorKind.CompensationTrigger));
  assert.ok(delta.ended.every(({ anchor }) => anchor.kind !== SemanticFlowNodeOccurrenceAnchorKind.Scope));
  assert.ok(delta.ended.some(({ anchor, terminal }) => anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Wait && anchor.id.elementId === "Prepare" && terminal === FlowNodeOccurrenceTerminalKind.Cancelled));
  assert.deepEqual(cancelled.result.state.userTaskWaits, []);
  const open = projectOpenFlowNodeOccurrences(program, cancelled.result.state);
  assert.ok(open?.some(({ elementId }) => elementId === "Transaction_Reservation"));
  assert.ok(!open?.some(({ elementId }) => elementId === "Cancel"));
  verify(program, before, cancelled);

  const scope = retained(program, before).find(({ anchor }) => anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Scope)!;
  rejectMutation(program, before, cancelled, index, { ...delta, ended: [...delta.ended, { anchor: scope.anchor, terminal: FlowNodeOccurrenceTerminalKind.Cancelled }] });
  const cancel = delta.started.find(({ elementId }) => elementId === "Cancel")!;
  rejectMutation(program, before, cancelled, index, {
    ...delta,
    started: delta.started.map((entry) => entry === cancel ? { ...entry, anchor: { kind: SemanticFlowNodeOccurrenceAnchorKind.CompensationTrigger, id: { processInstanceId: entry.owner.processInstanceId, elementId: "operation:Cancel", activation: 1 } } } : entry),
    ended: delta.ended.filter(({ anchor }) => anchor.kind !== SemanticFlowNodeOccurrenceAnchorKind.Transition),
  });

  const joined = traceEffect(program, cancelled.result.state, false);
  verify(program, cancelled.result.state, joined);
  const join = joined.flowNodeOccurrenceLifecycles[0]!;
  const boundary = join.started.find(({ elementId }) => elementId === "Boundary_Cancel");
  assert.equal(boundary?.owner.definitionScopeId, transactionRootScope);
  assert.ok(join.ended.some(({ anchor, terminal }) => anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Scope && terminal === FlowNodeOccurrenceTerminalKind.Cancelled));
  assert.ok(join.ended.some(({ anchor, terminal }) => anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.CompensationHandler && terminal === FlowNodeOccurrenceTerminalKind.Completed));
  assert.ok(join.ended.every(({ anchor }) => anchor.kind !== SemanticFlowNodeOccurrenceAnchorKind.CompensationTrigger));
  assert.deepEqual(joined.result.state.userTaskWaits.map(({ id }) => id.elementId), ["Acknowledge"]);
  rejectMutation(program, cancelled.result.state, joined, 0, {
    ...join,
    started: join.started.map((entry) => ({ ...entry, owner: { ...entry.owner, definitionScopeId: transactionChildScope } })),
  });
  rejectMutation(program, cancelled.result.state, joined, 0, { ...join, ended: join.ended.filter(({ anchor }) => anchor.kind !== SemanticFlowNodeOccurrenceAnchorKind.Scope) });
  const acknowledgeIndex = joined.flowNodeOccurrenceLifecycles.findIndex(({ started }) => started.some(({ elementId }) => elementId === "Acknowledge"));
  const acknowledge = joined.flowNodeOccurrenceLifecycles[acknowledgeIndex]!;
  rejectMutation(program, cancelled.result.state, joined, acknowledgeIndex, {
    ...acknowledge,
    started: acknowledge.started.map((entry) => ({ ...entry, owner: { ...entry.owner, definitionScopeId: transactionChildScope } })),
  });
  const prematureBoundary = { ...boundary!, anchor: { kind: SemanticFlowNodeOccurrenceAnchorKind.Transition, commandId: "publish-Withdraw", transitionIndex: index, localIndex: 0 } } as const;
  rejectMutation(program, before, cancelled, index, {
    started: [...delta.started.filter(({ anchor }) => anchor.kind !== SemanticFlowNodeOccurrenceAnchorKind.Transition), prematureBoundary, { ...cancel, anchor: { ...prematureBoundary.anchor, localIndex: 1 } }],
    ended: [...delta.ended.filter(({ anchor }) => anchor.kind !== SemanticFlowNodeOccurrenceAnchorKind.Transition), { anchor: prematureBoundary.anchor, terminal: FlowNodeOccurrenceTerminalKind.Completed }, { anchor: { ...prematureBoundary.anchor, localIndex: 1 }, terminal: FlowNodeOccurrenceTerminalKind.Completed }],
  });
});

for (const eligibleSecond of [false, true]) {
  test(`empty cancellation publishes both Cancel instants when eligible Task is ${eligibleSecond ? "not yet started" : "active"}`, () => {
    const program = eligibleSecond ? withSecondTaskEligible() : admittedTransactionProgram();
    const before = startTransaction(program);
    const cancelled = traceTask(program, before, "Withdraw");
    verify(program, before, cancelled);
    const index = cancellationIndex(cancelled);
    const delta = cancelled.flowNodeOccurrenceLifecycles[index]!;
    assert.deepEqual(delta.started.map(({ elementId }) => elementId), ["Boundary_Cancel", "Cancel"]);
    assert.equal(delta.started[0]?.owner.definitionScopeId, transactionRootScope);
    assert.equal(delta.started[1]?.owner.definitionScopeId, transactionChildScope);
    assert.ok(delta.ended.some(({ anchor, terminal }) => anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Scope && terminal === FlowNodeOccurrenceTerminalKind.Cancelled));
    assert.deepEqual(cancelled.result.state.compensationTriggers, []);
    rejectMutation(program, before, cancelled, index, {
      ...delta,
      started: delta.started.filter(({ elementId }) => elementId !== "Boundary_Cancel"),
      ended: delta.ended.filter(({ anchor }) => anchor.kind !== SemanticFlowNodeOccurrenceAnchorKind.Transition || anchor.localIndex !== 0),
    });
  });
}

test("an eligible second Task remains ineligible while active and becomes eligible only after completion", () => {
  const program = withSecondTaskEligible();
  const active = completeTransactionTask(program, startTransaction(program), "Reserve").state;
  const empty = traceTask(program, active, "Withdraw");
  verify(program, active, empty);
  assert.deepEqual(empty.result.state.compensationTriggers, []);
  const finished = completeTransactionTask(program, active, "Prepare").state;
  const compensated = traceTask(program, finished, "Withdraw");
  verify(program, finished, compensated);
  assert.equal(compensated.result.state.compensationTriggers?.[0]?.lifecycle, "active");
});

test("a completed non-Cancel branch still requires compensation before publishing the boundary", () => {
  const program = admittedTransactionProgram();
  let before = completeTransactionTask(program, startTransaction(program), "Reserve").state;
  before = completeTransactionTask(program, before, "Prepare").state;
  const cancelled = traceTask(program, before, "Withdraw");
  verify(program, before, cancelled);
  assert.equal(cancelled.result.state.compensationTriggers?.[0]?.lifecycle, "active");
  assert.ok(cancelled.flowNodeOccurrenceLifecycles.flatMap(({ started }) => started).every(({ elementId }) => elementId !== "Boundary_Cancel"));
});

test("typed handler failure closes all open occurrences as cancelled without a Cancel Boundary", () => {
  const program = admittedTransactionProgram();
  const reserved = completeTransactionTask(program, startTransaction(program), "Reserve").state;
  const cancelled = traceTask(program, reserved, "Withdraw");
  const failed = traceEffect(program, cancelled.result.state, true);
  verify(program, cancelled.result.state, failed);
  assert.equal(failed.result.state.control.kind, "failed");
  assert.deepEqual(failed.flowNodeOccurrenceLifecycles[0]?.started, []);
  assert.ok(failed.flowNodeOccurrenceLifecycles[0]?.ended.every(({ terminal }) => terminal === FlowNodeOccurrenceTerminalKind.Cancelled));
  assert.deepEqual(projectOpenFlowNodeOccurrences(program, failed.result.state), []);
  const delta = failed.flowNodeOccurrenceLifecycles[0]!;
  rejectMutation(program, cancelled.result.state, failed, 0, { ...delta, ended: delta.ended.filter(({ anchor }) => anchor.kind !== SemanticFlowNodeOccurrenceAnchorKind.Scope) });
});

function withSecondTaskEligible(): SemanticProcessProgram {
  const base = admittedTransactionProgram();
  const program = {
    ...base,
    compensationActivityRetention: {
      ...base.compensationActivityRetention!,
      targets: base.compensationActivityRetention!.targets.map((target) => ({ ...target, activityElementId: "Prepare" })),
    },
    compensationExecution: {
      ...base.compensationExecution!,
      subjects: base.compensationExecution!.subjects.map((subject) => ({ ...subject, subjectElementId: "Prepare" })),
    },
  };
  assert.ok(isWellFormedSemanticProcessProgram(program));
  return program;
}

function traceTask(program: SemanticProcessProgram, state: RuntimeState, elementId: string): TracedCommandResult {
  const wait = state.userTaskWaits.find(({ id }) => id.elementId === elementId);
  assert.ok(wait);
  return trace(program, state, { kind: StimulusKind.CompleteUserTaskInstance, commandId: `publish-${elementId}`, taskId: wait.id, submittedValues: [] });
}

function traceEffect(program: SemanticProcessProgram, state: RuntimeState, failed: boolean): TracedCommandResult {
  const wait = state.compensationHandlerEffectWaits?.[0];
  assert.ok(wait);
  return trace(program, state, {
    kind: StimulusKind.CompleteEffect,
    commandId: failed ? "fail-release" : "complete-release",
    effectId: wait.id,
    result: failed
      ? { kind: EffectExecutionResultKind.BpmnError, code: "release-refused", message: null, localPatch: [] }
      : { kind: EffectExecutionResultKind.Success, localPatch: [] },
  });
}

function trace(program: SemanticProcessProgram, state: RuntimeState, stimulus: Stimulus): TracedCommandResult {
  const result = applyStimulusWithTrace(program, state, stimulus);
  assert.equal(result.result.outcome, CommandOutcome.Committed);
  assert.ok(result.committedTransitions.length > 0);
  return result;
}

function cancellationIndex(traced: TracedCommandResult): number {
  const index = traced.committedTransitions.findIndex(({ transition }) => transition.kind === SemanticTransitionKind.InternalOperation && transition.operationKind === SemanticOperationKind.CancelTransaction);
  assert.ok(index >= 0);
  return index;
}

function retained(program: SemanticProcessProgram, state: RuntimeState) {
  const open = projectOpenFlowNodeOccurrences(program, state);
  assert.ok(open !== null);
  return open.map((entry) => ({ ...entry, attachedHandlers: attachedHandlersForBodyAnchor(state, entry.anchor) }));
}

function verify(program: SemanticProcessProgram, before: RuntimeState, traced: TracedCommandResult): void {
  const first = traced.committedTransitions[0]?.transition;
  assert.ok(first?.kind === SemanticTransitionKind.ExternalStimulus);
  requireCompleteFlowNodeOccurrenceLifecycles(program, retained(program, before), first.stimulus.commandId, traced.committedTransitions, traced.flowNodeOccurrenceLifecycles);
  let open = projectOpenFlowNodeOccurrences(program, before);
  assert.ok(open !== null);
  for (const delta of traced.flowNodeOccurrenceLifecycles) {
    open = foldFlowNodeOccurrenceLifecycleDelta(open, delta);
    assert.ok(open !== null);
  }
  assert.deepEqual(open, projectOpenFlowNodeOccurrences(program, traced.result.state));
}

function rejectMutation(program: SemanticProcessProgram, before: RuntimeState, traced: TracedCommandResult, index: number, replacement: UnnumberedFlowNodeOccurrenceDelta): void {
  const first = traced.committedTransitions[0]?.transition;
  assert.ok(first?.kind === SemanticTransitionKind.ExternalStimulus);
  assert.throws(() => requireCompleteFlowNodeOccurrenceLifecycles(program, retained(program, before), first.stimulus.commandId, traced.committedTransitions, traced.flowNodeOccurrenceLifecycles.map((delta, current) => current === index ? replacement : delta)), /complete lifecycle|unknown anchor/u);
}
