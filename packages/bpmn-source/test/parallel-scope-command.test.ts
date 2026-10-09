import assert from "node:assert/strict";
import { test } from "node:test";
import { CommandOutcome, ControlStateKind, EffectExecutionResultKind, StimulusKind, VariableValueKind as Value, applyStimulusWithTrace, initialState, isWellFormedSemanticProcessProgram,
  FlowNodeOccurrenceTerminalKind, SemanticFlowNodeOccurrenceAnchorKind, SemanticOperationKind, SemanticTransitionKind,
  projectOpenFlowNodeOccurrences, replayCommittedTransitions, requireCompleteFlowNodeOccurrenceLifecycles,
  supportsSemanticProcessExecution, advanceScenario, ScenarioStepKind } from "@bpmn-lean/semantic-core";
import type { CompleteEffectStimulus, CompleteUserTaskInstanceStimulus, RuntimeState, ScopeOccurrenceId, SemanticProcessProgram, Stimulus, TracedCommandResult, VariableBinding, UnnumberedCommittedTransition } from "@bpmn-lean/semantic-core";
import { assertJourneyExecutionCounts } from "./parallel-scope-journey-accounting.ts";
import { parallelCommandInputs } from "./parallel-scope-command-fixture.ts";

const inputs = await parallelCommandInputs();
const { replayInternalTransitionRecord } = await import(new URL("../../semantic-core/dist/semantic-transition-trace.js", import.meta.url).href
) as typeof import("../../semantic-core/src/semantic-transition-trace.ts");
const { parallelScopeProgramStartCapacity } = await import(new URL("../../semantic-core/dist/parallel-scope-program-capacity.js", import.meta.url).href
) as typeof import("../../semantic-core/src/parallel-scope-program-capacity.ts");
const { sameScopeOccurrence } = await import(new URL("../../semantic-core/dist/semantic-process-state.js", import.meta.url).href
) as typeof import("../../semantic-core/src/semantic-process-state.ts");

for (const { count, program, start } of inputs) {
  test(`private parallel scenario wrapper preserves command-derived fuel for ${count} bodies`, () => {
    const traced = committedTrace(program, initialState, start);
    const step = advanceScenario(program, initialState, start);
    assert.equal(step.kind, ScenarioStepKind.Committed);
    assert.ok(step.kind === ScenarioStepKind.Committed);
    assert.deepEqual(step.state, traced.result.state);
    assert.deepEqual(step.publication?.transitions, traced.committedTransitions);
    assert.deepEqual(step.flowNodeOccurrenceLifecycles, traced.flowNodeOccurrenceLifecycles);
    if (count === 16) {
      const bounded = advanceScenario(program, initialState, start, 8);
      assert.equal(bounded.kind, ScenarioStepKind.HarnessFailure);
      assert.ok(bounded.kind === ScenarioStepKind.HarnessFailure);
      assert.equal(bounded.diagnostic?.internalStepBoundExceeded, true);
    }
  });
  test(`private parallel real Start publishes ${count} bodies with omitted default fuel`, () => {
    assert.ok(isWellFormedSemanticProcessProgram(program));
    assert.equal(supportsSemanticProcessExecution(start, program), false, "private command composition does not register public execution");
    const traced = committedTrace(program, initialState, start);
    assert.equal(traced.result.state.userTaskWaits.length, count === 0 ? 1 : count);
    assert.equal(traced.result.state.variables.scopes.length, count);
    if (count === 0) {
      const terminal = committedTrace(program, traced.result.state, human(traced.result.state, "PublishBatch"));
      assert.equal(terminal.result.state.control.kind, ControlStateKind.Completed);
      const traces = [traced, terminal];
      const bound = parallelScopeProgramStartCapacity(program, start.initialVariables)!.closureBound;
      assertJourneyExecutionCounts(program, traces, bound);
      const initiation = traced.committedTransitions.find(record => record.transition.kind === SemanticTransitionKind.InternalOperation &&
        record.transition.operationKind === SemanticOperationKind.Initiate)!;
      const repeated = { ...terminal, committedTransitions: [...terminal.committedTransitions, initiation],
        flowNodeOccurrenceLifecycles: [...terminal.flowNodeOccurrenceLifecycles, { started: [], ended: [] }] };
      assert.throws(() => assertJourneyExecutionCounts(program, [traced, repeated], bound + 1), /exactly one initiation/);
      const entryIndex = traced.committedTransitions.findIndex(record => record.transition.kind === SemanticTransitionKind.InternalOperation &&
        record.transition.operationKind === SemanticOperationKind.EnterParallelMultiInstanceScope);
      const initiationIndex = traced.committedTransitions.indexOf(initiation);
      const order = traced.committedTransitions.map((_, index) => index);
      [order[entryIndex], order[initiationIndex]] = [order[initiationIndex]!, order[entryIndex]!];
      const reversed = { ...traced, committedTransitions: order.map(index => traced.committedTransitions[index]!),
        flowNodeOccurrenceLifecycles: order.map(index => traced.flowNodeOccurrenceLifecycles[index]!) };
      assert.throws(() => assertJourneyExecutionCounts(program, [reversed, terminal], bound), /initiation is the first/);
      const reentered = { ...terminal, committedTransitions: [...terminal.committedTransitions, traced.committedTransitions[entryIndex]!],
        flowNodeOccurrenceLifecycles: [...terminal.flowNodeOccurrenceLifecycles, traced.flowNodeOccurrenceLifecycles[entryIndex]!] };
      assert.throws(() => assertJourneyExecutionCounts(program, [traced, reentered], bound + 1), /exactly one parallel entry/);
      const unfinished = { ...terminal, committedTransitions: terminal.committedTransitions.slice(0, -1),
        flowNodeOccurrenceLifecycles: terminal.flowNodeOccurrenceLifecycles.slice(0, -1) };
      assert.throws(() => assertJourneyExecutionCounts(program, [traced, unfinished], bound), /exactly one root completion/);
    }
  });
  if (count === 16) test("private parallel explicit diagnostic fuel still rolls back the complete Start", () => {
    const traced = applyStimulusWithTrace(program, initialState, start, 1);
    assert.equal(traced.result.outcome, CommandOutcome.RolledBack);
    assert.equal(traced.result.internalStepBoundExceeded, true);
    assert.deepEqual(traced.result.state, initialState);
    assert.deepEqual(traced.committedTransitions, []);
    assert.deepEqual(traced.flowNodeOccurrenceLifecycles, []);
  });
}

for (const bodyShape of ["joined", "separate-ends"] as const) test(
  `private parallel scenario wrapper preserves derived fuel for sixteen ${bodyShape} bodies`, async () => {
    const { program, start } = (await parallelCommandInputs({ bodyShape })).find(input => input.count === 16)!;
    const traced = committedTrace(program, initialState, start);
    const step = advanceScenario(program, initialState, start);
    assert.equal(step.kind, ScenarioStepKind.Committed);
    assert.ok(step.kind === ScenarioStepKind.Committed);
    assert.deepEqual(step.state, traced.result.state);
    assert.deepEqual(step.publication?.transitions, traced.committedTransitions);
    assert.deepEqual(step.flowNodeOccurrenceLifecycles, traced.flowNodeOccurrenceLifecycles);
  },
);

function committedTrace(program: SemanticProcessProgram, before: RuntimeState, stimulus: Stimulus,
  label = stimulus.commandId): TracedCommandResult {
  const traced = applyStimulusWithTrace(program, before, stimulus);
  assert.equal(traced.result.outcome, CommandOutcome.Committed, `${label}: command outcome`);
  assert.equal(traced.result.internalStepBoundExceeded, false, `${label}: fuel`);
  assert.ok(traced.committedTransitions.length > 0, `${label}: trace`);
  assert.equal(traced.flowNodeOccurrenceLifecycles.length, traced.committedTransitions.length, `${label}: lifecycle count`);
  assert.deepEqual(replayCommittedTransitions(program, before, traced.committedTransitions), traced.result.state, `${label}: replay`);
  const open = projectOpenFlowNodeOccurrences(program, before);
  assert.ok(open, `${label}: predecessor open occurrences`);
  assert.doesNotThrow(() => requireCompleteFlowNodeOccurrenceLifecycles(program,
    open.map(occurrence => ({ ...occurrence, attachedHandlers: [] })), stimulus.commandId,
    traced.committedTransitions, traced.flowNodeOccurrenceLifecycles), `${label}: complete publication`);
  assert.ok(projectOpenFlowNodeOccurrences(program, traced.result.state), `${label}: successor open occurrences`);
  let prefix = before;
  for (const record of traced.committedTransitions) {
    const next = record.transition.kind === SemanticTransitionKind.ExternalStimulus
      ? replayCommittedTransitions(program, prefix, [record]) : replayInternalTransitionRecord(program, prefix, record);
    assert.ok(next, `${label}: exact record replay`);
    assertContinuationBoundary(program, prefix, next, record.transition);
    prefix = next;
  }
  assert.deepEqual(prefix, traced.result.state);
  return traced;
}

function commit(program: SemanticProcessProgram, before: RuntimeState, stimulus: Stimulus): RuntimeState {
  return committedTrace(program, before, stimulus).result.state;
}

function refuses(program: SemanticProcessProgram, before: RuntimeState, stimulus: Stimulus): void {
  const traced = applyStimulusWithTrace(program, before, { ...stimulus, commandId: `refuse-${stimulus.commandId}` });
  assert.equal(traced.result.outcome, CommandOutcome.Rejected, stimulus.commandId);
  assert.deepEqual(traced.result.state, before);
  assert.deepEqual(traced.committedTransitions, []);
  assert.deepEqual(traced.flowNodeOccurrenceLifecycles, []);
}

function human(state: RuntimeState, element: string, values: readonly VariableBinding[] = []): CompleteUserTaskInstanceStimulus {
  const wait = state.userTaskWaits.find(wait => wait.id.elementId === element);
  assert.ok(wait, element);
  return { kind: StimulusKind.CompleteUserTaskInstance, commandId: `${element}-${wait.id.activation}`,
    taskId: wait.id, submittedValues: values };
}

function effect(state: RuntimeState, value: VariableBinding["value"]): CompleteEffectStimulus {
  const wait = state.effectWaits[0];
  assert.ok(wait);
  return { kind: StimulusKind.CompleteEffect, commandId: `effect-${wait.id.activation}`, effectId: wait.id,
    result: { kind: EffectExecutionResultKind.Success, localPatch: [{ name: "result", value }] } };
}

for (const { count, program, start } of inputs.filter(({ count }) => count > 0)) {
  test(`private parallel ${count}-body commands preserve scoped writes and original collection through natural completion`, () => {
    let state = commit(program, initialState, start);
    const originalItems = start.initialVariables[0];
    const staleHuman = human(state, "Review");
    for (let index = 0; index < count; index++) {
      const siblingFrames = state.variables.scopes.slice(1);
      state = commit(program, state, human(state, "Review", [
        { name: "reviewStatus", value: { kind: Value.String, value: "reviewed" } },
        { name: "shared", value: { kind: Value.Null } },
      ]));
      assert.deepEqual(state.variables.activities[0]?.bindings, [
        { name: "payload", value: { kind: Value.String, value: "same-invoice" } },
        { name: "status", value: { kind: Value.String, value: "reviewed" } },
      ]);
      assert.deepEqual(state.variables.scopes.slice(1), siblingFrames);
      assert.deepEqual(state.variables.process.bindings.find(binding => binding.name === "shared")?.value, { kind: Value.Null });
      const completedEffect = effect(state, { kind: Value.Null });
      state = commit(program, state, completedEffect);
      assert.deepEqual(state.variables.scopes[0]?.bindings.find(binding => binding.name === "decision")?.value, { kind: Value.Null });
      assert.deepEqual(state.variables.scopes.slice(1), siblingFrames);
      assert.deepEqual(state.variables.activities, []);
      refuses(program, state, completedEffect);
      state = commit(program, state, human(state, "Confirm"));
      assert.equal(state.variables.scopes.length, count - index - 1);
      assert.deepEqual(state.variables.process.bindings.find(binding => binding.name === "items"), originalItems);
      refuses(program, state, staleHuman);
    }
    assert.deepEqual(state.parallelScopeControllers, []);
    refuses(program, state, human(state, "PublishBatch", [{ name: "item", value: { kind: Value.String, value: "replace" } }]));
    state = commit(program, state, human(state, "PublishBatch", [{ name: "shared", value: { kind: Value.String, value: "published" } }]));
    assert.equal(state.control.kind, ControlStateKind.Completed);
    assert.deepEqual(state.variables.process.bindings.find(binding => binding.name === "items"), originalItems);
  });
}

test("private parallel command ingress refuses protected names, malformed values and stale population without publication", () => {
  const { program, start } = inputs.find(({ count }) => count === 2)!;
  const state = commit(program, initialState, start);
  for (const name of ["items", "item", "invoiceValidator"]) refuses(program, state,
    human(state, "Review", [{ name, value: { kind: Value.String, value: "replace" } }]));
  refuses(program, state, human(state, "Review", [{ name: "reviewStatus", value: { kind: Value.Boolean, value: true } }]));
  refuses(program, state, human(state, "Review", [
    { name: "shared", value: { kind: Value.String, value: "a" } },
    { name: "shared", value: { kind: Value.String, value: "b" } },
  ]));
  const review = human(state, "Review");
  const mutations: RuntimeState[] = [
    { ...state, parallelScopeControllers: [] },
    { ...state, parallelScopeControllers: [...state.parallelScopeControllers!, ...state.parallelScopeControllers!] },
    { ...state, variables: { ...state.variables, scopes: state.variables.scopes.slice(0, 1) } },
    ...[[], ["changed", "same-invoice"], ["same-invoice"]].map(items => ({ ...state,
      variables: { ...state.variables, process: { bindings: [{ name: "items", value: { kind: Value.StringList, value: items } as const }] } } })),
  ];
  for (const stale of mutations) refuses(program, stale, review);
  const controller = state.parallelScopeControllers![0]!;
  const frame = state.variables.scopes[0]!;
  const retainedMutations: readonly [string, RuntimeState][] = [
    ["stray-controller", { ...state, parallelScopeControllers: [...state.parallelScopeControllers!,
      { ...controller, id: { ...controller.id, activityElementId: "zz-unrelated" } }] }],
    ["unrelated-scope-frame", { ...state, variables: { ...state.variables, scopes: [...state.variables.scopes,
      { ...frame, owner: { ...frame.owner, definitionScopeId: "zz-unrelated" } }] } }],
    ["lower-live-review-counter", { ...state, taskActivations: state.taskActivations.map(row =>
      row.elementId === "Review" ? { ...row, count: row.count - 1 } : row) }],
  ];
  for (const [commandId, corrupted] of retainedMutations) refuses(program, corrupted, { ...review, commandId });
  const waiting = commit(program, state, human(state, "Review"));
  const completion = effect(waiting, { kind: Value.String, value: "accepted" });
  assert.equal(completion.kind, StimulusKind.CompleteEffect);
  if (completion.kind !== StimulusKind.CompleteEffect) return;
  for (const localPatch of [[{ name: "invoiceValidator", value: { kind: Value.String, value: "shadow" } as const }],
    [{ name: "result", value: { kind: Value.Boolean, value: true } as const }]])
    refuses(program, waiting, { ...completion, result: { kind: EffectExecutionResultKind.Success, localPatch } });
  refuses(program, waiting, { ...completion, result: { kind: EffectExecutionResultKind.BpmnError, code: "unsupported", message: null, localPatch: [] } });
});

test("private parallel effect outputs absent from body locals update Process data", async () => {
  const { program, start } = (await parallelCommandInputs({ processEffectOutput: true })).find(({ count }) => count === 2)!;
  let state = commit(program, initialState, start);
  state = commit(program, state, human(state, "Review"));
  const scopes = state.variables.scopes;
  state = commit(program, state, effect(state, { kind: Value.Null }));
  assert.deepEqual(state.variables.scopes, scopes);
  assert.deepEqual(state.variables.process.bindings.find(binding => binding.name === "summary")?.value, { kind: Value.Null });
});

test("private parallel human condition commits only after body completion and stale cancelled work refuses", async () => {
  const { program, start } = (await parallelCommandInputs({ condition: true })).find(({ count }) => count === 2)!;
  let state = commit(program, initialState, start);
  const cancelledHuman = { ...human(state, "Review"), taskId: state.userTaskWaits[1]!.id };
  state = commit(program, state, human(state, "Review", [{ name: "stop", value: { kind: Value.Boolean, value: true } }]));
  assert.equal(state.variables.scopes.length, 2);
  state = commit(program, state, effect(state, { kind: Value.String, value: "accepted" }));
  assert.equal(state.variables.scopes.length, 2);
  const retired = committedTrace(program, state, human(state, "Confirm"));
  let prefix = state;
  let cancellationChecked = false;
  for (const record of retired.committedTransitions) {
    const next = record.transition.kind === SemanticTransitionKind.ExternalStimulus
      ? replayCommittedTransitions(program, prefix, [record]) : replayInternalTransitionRecord(program, prefix, record);
    assert.ok(next);
    if (record.transition.kind === SemanticTransitionKind.InternalOperation &&
        record.transition.operationKind === SemanticOperationKind.CompleteParallelMultiInstanceScope) {
      const cancelled = prefix.userTaskWaits.find(wait => wait.id.processInstanceId === cancelledHuman.taskId.processInstanceId &&
        wait.id.elementId === cancelledHuman.taskId.elementId && wait.id.activation === cancelledHuman.taskId.activation);
      assert.ok(cancelled);
      assert.throws(() => assertContinuationBoundary(program, prefix,
        { ...next, userTaskWaits: [...next.userTaskWaits, cancelled] }, record.transition), /blocked continuations/);
      cancellationChecked = true;
    }
    prefix = next;
  }
  assert.equal(cancellationChecked, true);
  state = retired.result.state;
  assert.equal(state.userTaskWaits[0]?.id.elementId, "PublishBatch");
  assert.deepEqual(state.variables.scopes, []);
  assert.deepEqual(state.parallelScopeControllers, []);
  refuses(program, state, cancelledHuman);
});

test("private parallel root Service Task accepts admitted null Process output after empty-body Start", async () => {
  const { program, start } = (await parallelCommandInputs({ parentEffect: true })).find(({ count }) => count === 0)!;
  let state = commit(program, initialState, start);
  assert.equal(state.effectWaits[0]?.id.elementId, "PublishBatch");
  state = commit(program, state, effect(state, { kind: Value.Null }));
  assert.equal(state.control.kind, ControlStateKind.Completed);
  assert.deepEqual(state.variables.process.bindings.find(binding => binding.name === "summary")?.value, { kind: Value.Null });
});

function ownedBodyWork(state: RuntimeState, owner: ScopeOccurrenceId) {
  return {
    tokens: state.controlTokens.filter(work => sameScopeOccurrence(work.owner, owner)),
    humans: state.userTaskWaits.filter(work => sameScopeOccurrence(work.owner, owner)),
    effects: state.effectWaits.filter(work => sameScopeOccurrence(work.owner, owner)),
    frames: state.variables.scopes.filter(frame => sameScopeOccurrence(frame.owner, owner)),
  };
}

for (const early of [false, true]) test(
  `private parallel exhaustive two-body ${early ? "early" : "natural"} external-command interleavings retain active work`,
  async context => {
    const { program, start } = (await parallelCommandInputs({ condition: early })).find(({ count }) => count === 2)!;
    const entry = program.operations.find(operation => operation.kind === SemanticOperationKind.EnterParallelMultiInstanceScope);
    assert.ok(entry?.kind === SemanticOperationKind.EnterParallelMultiInstanceScope);
    const bodies = (state: RuntimeState) => state.scopeOccurrences.filter(scope => scope.id.definitionScopeId === entry.childScopeId);
    const queue: { state: RuntimeState; schedule: readonly string[] }[] = [];
    let committedBoundaries = 0;
    let terminalSchedules = 0;
    const firstBodies = new Set<number>();
    const advance = (before: RuntimeState, stimulus: Stimulus, schedule: readonly string[], owner?: ScopeOccurrenceId) => {
      const label = schedule.join(" → ");
      const traced = committedTrace(program, before, stimulus, label);
      const after = traced.result.state;
      for (const scope of bodies(after)) {
        const work = ownedBodyWork(after, scope.id);
        assert.ok(work.humans.length + work.effects.length + work.tokens.length > 0,
          `${label}: retained body ${scope.id.activation} is quiescent`);
        assert.equal(work.frames.length, 1, `${label}: retained body frame`);
      }
      const removed = bodies(before).filter(scope => !bodies(after).some(next => sameScopeOccurrence(scope.id, next.id)));
      if (!early) assert.ok(removed.length <= 1, `${label}: natural retirement removed multiple bodies`);
      const ended = traced.flowNodeOccurrenceLifecycles.flatMap(delta => delta.ended);
      for (const scope of removed) {
        const addressed = owner !== undefined && sameScopeOccurrence(scope.id, owner);
        if (!early) assert.ok(addressed, `${label}: natural retirement removed a sibling`);
        const ends = ended.filter(end => end.anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Scope && sameScopeOccurrence(end.anchor.id, scope.id));
        assert.equal(ends.length, 1, `${label}: removed body has one terminal publication`);
        assert.equal(ends[0]!.terminal, addressed ? FlowNodeOccurrenceTerminalKind.Completed : FlowNodeOccurrenceTerminalKind.Cancelled,
          `${label}: body terminal classification`);
      }
      if (owner !== undefined) for (const sibling of bodies(before).filter(scope => !sameScopeOccurrence(scope.id, owner))) {
        if (removed.some(scope => sameScopeOccurrence(scope.id, sibling.id))) continue;
        assert.deepEqual(ownedBodyWork(after, sibling.id), ownedBodyWork(before, sibling.id), `${label}: sibling work preserved`);
      }
      committedBoundaries++;
      queue.push({ state: after, schedule });
    };
    advance(initialState, start, ["Start"]);
    for (let index = 0; index < queue.length; index++) {
      const { state, schedule } = queue[index]!;
      if (state.control.kind === ControlStateKind.Completed) {
        terminalSchedules++;
        assert.equal(bodies(state).length, 0, schedule.join(" → "));
        continue;
      }
      assert.ok(state.userTaskWaits.length + state.effectWaits.length > 0, `${schedule.join(" → ")}: reachable command deadlock`);
      for (const wait of state.userTaskWaits) {
        const commandId = `${wait.id.elementId}-${wait.id.activation}`;
        if (schedule.length === 1) firstBodies.add(wait.owner.activation);
        const submittedValues: VariableBinding[] = wait.id.elementId === "Review"
          ? [{ name: "reviewStatus", value: { kind: Value.String, value: "reviewed" } },
            ...(early ? [{ name: "stop", value: { kind: Value.Boolean, value: true } } as const] : [])] : [];
        advance(state, { kind: StimulusKind.CompleteUserTaskInstance, commandId, taskId: wait.id, submittedValues },
          [...schedule, commandId], wait.owner);
      }
      for (const wait of state.effectWaits) {
        const commandId = `Service-${wait.id.activation}`;
        advance(state, { kind: StimulusKind.CompleteEffect, commandId, effectId: wait.id,
          result: { kind: EffectExecutionResultKind.Success, localPatch: [{ name: "result", value: { kind: Value.String, value: "accepted" } }] } },
        [...schedule, commandId], wait.owner);
      }
    }
    assert.equal(firstBodies.size, 2, "both initial body completions were explored");
    assert.equal(terminalSchedules, 20, early
      ? "all prefixes ending at the first completed body terminate"
      : "all shuffles of the two three-command body sequences terminate");
    context.diagnostic(`${committedBoundaries} committed boundaries; ${terminalSchedules} terminal schedules; no state deduplication`);
  },
);

for (const bodyShape of ["joined", "separate-ends"] as const) for (const early of [false, true]) {
  for (const order of ["forward", "reverse", "interleaved"] as const) test(
    `private parallel inner ${bodyShape} ${early ? "early" : "natural"} ${order} command journey`, async () => {
      const { program, start } = (await parallelCommandInputs({ bodyShape, condition: early })).find(({ count }) => count === 2)!;
      const entry = program.operations.find(operation => operation.kind === SemanticOperationKind.EnterParallelMultiInstanceScope);
      assert.ok(entry?.kind === SemanticOperationKind.EnterParallelMultiInstanceScope);
      const schedule: string[] = [];
      const traces: TracedCommandResult[] = [];
      const capacity = parallelScopeProgramStartCapacity(program, start.initialVariables);
      assert.ok(capacity);
      const terminals: { activation: number; terminal: FlowNodeOccurrenceTerminalKind }[] = [];
      let partialEnds = 0;
      const step = (before: RuntimeState, stimulus: Stimulus, owner?: ScopeOccurrenceId): RuntimeState => {
        schedule.push(stimulus.commandId);
        const label = schedule.join(" → ");
        const traced = committedTrace(program, before, stimulus, label);
        traces.push(traced);
        assertJourneyExecutionCounts(program, traces, capacity.closureBound);
        const after = traced.result.state;
        const ends = traced.flowNodeOccurrenceLifecycles.flatMap(delta => delta.ended).filter(end =>
          end.anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Scope && end.anchor.id.definitionScopeId === entry.childScopeId);
        for (const end of ends) if (end.anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Scope) {
          const addressed = owner !== undefined && sameScopeOccurrence(end.anchor.id, owner);
          assert.ok(early || addressed, `${label}: natural retirement removes only addressed body`);
          assert.equal(end.terminal, addressed ? FlowNodeOccurrenceTerminalKind.Completed : FlowNodeOccurrenceTerminalKind.Cancelled,
            `${label}: scope terminal classification`);
          terminals.push({ activation: end.anchor.id.activation, terminal: end.terminal });
        }
        if (owner !== undefined) {
          const remainingHumans = before.userTaskWaits.filter(wait => sameScopeOccurrence(wait.owner, owner) &&
            !(stimulus.kind === StimulusKind.CompleteUserTaskInstance && wait.id.elementId === stimulus.taskId.elementId && wait.id.activation === stimulus.taskId.activation));
          const remainingEffects = before.effectWaits.filter(wait => sameScopeOccurrence(wait.owner, owner) &&
            !(stimulus.kind === StimulusKind.CompleteEffect && wait.id.elementId === stimulus.effectId.elementId && wait.id.activation === stimulus.effectId.activation));
          if (remainingHumans.length + remainingEffects.length > 0) {
            assert.ok(after.scopeOccurrences.some(scope => sameScopeOccurrence(scope.id, owner)), `${label}: pending inner branch keeps body alive`);
            assert.equal(ends.length, 0, `${label}: pending inner branch forbids retirement publication`);
            assert.equal(after.variables.scopes.filter(frame => sameScopeOccurrence(frame.owner, owner)).length, 1,
              `${label}: partial branch retains body frame`);
            for (const wait of remainingHumans) assert.deepEqual(after.userTaskWaits.find(next =>
              next.id.elementId === wait.id.elementId && next.id.activation === wait.id.activation), wait, `${label}: pending human branch survives`);
            for (const wait of remainingEffects) assert.deepEqual(after.effectWaits.find(next =>
              next.id.elementId === wait.id.elementId && next.id.activation === wait.id.activation), wait, `${label}: pending effect branch survives`);
            if (traced.committedTransitions.some(record => record.transition.kind === SemanticTransitionKind.InternalOperation &&
              record.transition.operationKind === SemanticOperationKind.ReachNoneEnd)) partialEnds++;
          }
          for (const sibling of before.scopeOccurrences.filter(scope => scope.id.definitionScopeId === entry.childScopeId && !sameScopeOccurrence(scope.id, owner))) {
            const retained = after.scopeOccurrences.some(scope => sameScopeOccurrence(scope.id, sibling.id));
            if (!retained) assert.ok(early && ends.length === 2, `${label}: sibling removal requires early cancellation`);
            else assert.deepEqual(ownedBodyWork(after, sibling.id), ownedBodyWork(before, sibling.id), `${label}: sibling work and frame survive`);
          }
        }
        return after;
      };
      let state = step(initialState, start);
      const owners = state.scopeOccurrences.filter(scope => scope.id.definitionScopeId === entry.childScopeId).map(scope => scope.id);
      assert.equal(owners.length, 2);
      const branches = bodyShape === "joined" ? ["Branch0", "Branch1", "Branch2"] : ["Branch0", "Branch1"];
      const forward = [...branches, "Validate", "Confirm"];
      const reverse = bodyShape === "joined" ? [...branches].reverse().concat("Validate", "Confirm") : ["Validate", "Confirm", ...branches.toReversed()];
      const planned = order === "interleaved"
        ? forward.flatMap(element => owners.map(owner => ({ owner, element })))
        : (order === "reverse" ? owners.toReversed() : owners).flatMap(owner =>
          (order === "reverse" ? reverse : forward).map(element => ({ owner, element })));
      for (const { owner, element } of planned) {
        if (early && !state.scopeOccurrences.some(scope => sameScopeOccurrence(scope.id, owner))) continue;
        const commandId = `${element}-body${owner.activation}`;
        if (element === "Validate") {
          const wait = state.effectWaits.find(wait => wait.id.elementId === element && sameScopeOccurrence(wait.owner, owner));
          assert.ok(wait, `${schedule.join(" → ")} → ${commandId}: enabled effect`);
          state = step(state, { kind: StimulusKind.CompleteEffect, commandId, effectId: wait.id,
            result: { kind: EffectExecutionResultKind.Success, localPatch: [{ name: "result", value: { kind: Value.String, value: "accepted" } }] } }, owner);
        } else {
          const wait = state.userTaskWaits.find(wait => wait.id.elementId === element && sameScopeOccurrence(wait.owner, owner));
          assert.ok(wait, `${schedule.join(" → ")} → ${commandId}: enabled human task`);
          state = step(state, { kind: StimulusKind.CompleteUserTaskInstance, commandId, taskId: wait.id,
            submittedValues: early ? [{ name: "stop", value: { kind: Value.Boolean, value: true } }] : [] }, owner);
        }
      }
      assert.equal(terminals.length, 2);
      assert.equal(new Set(terminals.map(end => end.activation)).size, 2);
      assert.equal(terminals.filter(end => end.terminal === FlowNodeOccurrenceTerminalKind.Completed).length, early ? 1 : 2);
      if (bodyShape === "separate-ends") assert.ok(partialEnds > 0, "PMIS-END-01: actual inner End reached while another branch waits");
      assert.deepEqual(state.variables.scopes, []);
      assert.deepEqual(state.parallelScopeControllers, []);
      state = step(state, human(state, "PublishBatch"));
      assert.equal(state.control.kind, ControlStateKind.Completed);
    },
  );
}


test("private parallel execution-count owner guard rejects duplicate, future, unpublished and wrong-scope identities", () => {
  const { program, start } = inputs.find(input => input.count === 2)!;
  const traced = committedTrace(program, initialState, start);
  const body = traced.committedTransitions.filter(record => record.transition.kind === SemanticTransitionKind.InternalOperation &&
    record.transition.operationKind === SemanticOperationKind.AwaitUserTask);
  assert.equal(body.length, 2);
  const first = body[0]!, second = body[1]!;
  assert.ok(first.transition.kind === SemanticTransitionKind.InternalOperation && second.transition.kind === SemanticTransitionKind.InternalOperation);
  const bound = parallelScopeProgramStartCapacity(program, start.initialVariables)!.closureBound;
  const firstTransition = first.transition;
  assertJourneyExecutionCounts(program, [traced], bound);
  const firstIndex = traced.committedTransitions.indexOf(first);
  const entryIndex = traced.committedTransitions.findIndex(record => record.transition.kind === SemanticTransitionKind.InternalOperation &&
    record.transition.operationKind === SemanticOperationKind.EnterParallelMultiInstanceScope);
  assert.ok(entryIndex >= 0 && entryIndex < firstIndex);
  const reordered = traced.committedTransitions.map((_, index) => index).filter(index => index !== firstIndex);
  reordered.splice(entryIndex, 0, firstIndex);
  const futureOwner = { ...traced,
    committedTransitions: reordered.map(index => traced.committedTransitions[index]!),
    flowNodeOccurrenceLifecycles: reordered.map(index => traced.flowNodeOccurrenceLifecycles[index]!),
  };
  assert.notDeepEqual(futureOwner, traced, "use moves before its retained legitimate Scope-start publication");
  assert.throws(() => assertJourneyExecutionCounts(program, [futureOwner], bound), /Scope start no later than use/);
  const duplicate = { ...traced, committedTransitions: [...traced.committedTransitions, first],
    flowNodeOccurrenceLifecycles: [...traced.flowNodeOccurrenceLifecycles, { started: [], ended: [] }] };
  assert.throws(() => assertJourneyExecutionCounts(program, [duplicate], bound), /body operation fired twice/);
  const confused = { ...traced, committedTransitions: traced.committedTransitions.map(record => record === second
    ? { ...second, transition: { ...second.transition, owner: firstTransition.owner } } : record) };
  assert.throws(() => assertJourneyExecutionCounts(program, [confused], bound), /body operation fired twice/);
  const unpublished = { ...traced, committedTransitions: traced.committedTransitions.map(record => record === first
    ? { ...first, transition: { ...firstTransition, owner: { ...firstTransition.owner, activation: 999 } } } : record) };
  assert.throws(() => assertJourneyExecutionCounts(program, [unpublished], bound), /exact published Scope start/);
  const root = program.definitionScopes.find(scope => scope.parentScopeId === null)!;
  const wrongScope = { ...traced, committedTransitions: traced.committedTransitions.map(record => record === first
    ? { ...first, transition: { ...firstTransition, owner: { ...firstTransition.owner, definitionScopeId: root.id } } } : record) };
  assert.throws(() => assertJourneyExecutionCounts(program, [wrongScope], bound), /operation uses its declared scope/);
  assert.throws(() => assertJourneyExecutionCounts(program, [traced], 0), /charged internal steps/);
});

for (const early of [false, true]) test(
  `private parallel execution-count and lifetime-credit serial ${early ? "early" : "natural"} complete command journey`, async () => {
    const { program, start } = (await parallelCommandInputs({ condition: early })).find(input => input.count === 2)!;
    const capacity = parallelScopeProgramStartCapacity(program, start.initialVariables);
    assert.ok(capacity);
    assert.equal(supportsSemanticProcessExecution(start, program), false);
    const traces: TracedCommandResult[] = [];
    const checkedCredits = new Set<string>();
    let state = initialState;
    const run = (stimulus: Stimulus) => {
      const traced = committedTrace(program, state, stimulus);
      traces.push(traced);
      assertJourneyExecutionCounts(program, traces, capacity.closureBound);
      const id = stimulus.kind === StimulusKind.CompleteUserTaskInstance ? stimulus.taskId
        : stimulus.kind === StimulusKind.CompleteEffect ? stimulus.effectId : undefined;
      if (id !== undefined && (id.elementId === "Review" || id.elementId === "Validate")) {
        const waits = stimulus.kind === StimulusKind.CompleteUserTaskInstance ? state.userTaskWaits : state.effectWaits;
        const wait = waits.find(wait => wait.id.processInstanceId === id.processInstanceId &&
          wait.id.elementId === id.elementId && wait.id.activation === id.activation);
        assert.ok(wait);
        const predecessor = program.operations.find(operation =>
          (operation.kind === SemanticOperationKind.AwaitUserTask || operation.kind === SemanticOperationKind.AwaitEffect) &&
          operation.origin.elementId === id.elementId && operation.output === wait.output);
        assert.ok(predecessor);
        const nextElement = id.elementId === "Review" ? "Validate" : "Confirm";
        const successor = program.operations.find(operation =>
          (operation.kind === SemanticOperationKind.AwaitUserTask || operation.kind === SemanticOperationKind.AwaitEffect) &&
          operation.origin.elementId === nextElement && operation.input === wait.output);
        assert.ok(successor, "the actual wait output is the next operation's connecting input");
        const count = (history: readonly TracedCommandResult[], operationId: string) => history.flatMap(trace => trace.committedTransitions)
          .filter(record => record.transition.kind === SemanticTransitionKind.InternalOperation && record.transition.operationId === operationId &&
            sameScopeOccurrence(record.transition.owner, wait.owner)).length;
        assert.deepEqual([count([traced], predecessor.id), count([traced], successor.id)], [0, 1], "command suffix has consumption without new production");
        assert.deepEqual([count(traces, predecessor.id), count(traces, successor.id)], [1, 1], "lifetime history contains the earlier production");
        const port = continuationKey(wait.owner, wait.output);
        const marking = continuationMarking(program, state);
        assert.equal(marking.tokens.get(port) ?? 0, 0, "the pre-command credit is blocked in its exact wait");
        const requireCredit = (blocked: ReadonlyMap<string, number>) => assert.equal(blocked.get(port), 1, "connecting port has lifetime credit");
        requireCredit(marking.blocked);
        const entry = program.operations.find(operation => operation.kind === SemanticOperationKind.EnterParallelMultiInstanceScope);
        assert.ok(entry?.kind === SemanticOperationKind.EnterParallelMultiInstanceScope);
        assert.notEqual(entry.childEntry, wait.output);
        assert.throws(() => requireCredit(new Map([[continuationKey(wait.owner, entry.childEntry), 1]])), /lifetime credit/);
        checkedCredits.add(`${id.elementId}→${nextElement}`);
      }
      state = traced.result.state;
    };
    run(start);
    while (state.control.kind !== ControlStateKind.Completed) {
      assert.ok(traces.length <= capacity.closureBound, "finite command journey must terminate");
      const task = state.userTaskWaits[0];
      const pendingEffect = state.effectWaits[0];
      if (task !== undefined) run({ kind: StimulusKind.CompleteUserTaskInstance, commandId: `task-${traces.length}`,
        taskId: task.id, submittedValues: early && task.id.elementId !== "PublishBatch"
          ? [{ name: "stop", value: { kind: Value.Boolean, value: true } }] : [] });
      else if (pendingEffect !== undefined) run({ kind: StimulusKind.CompleteEffect, commandId: `effect-${traces.length}`,
        effectId: pendingEffect.id, result: { kind: EffectExecutionResultKind.Success,
          localPatch: [{ name: "result", value: { kind: Value.String, value: "accepted" } }] } });
      else assert.fail("unfinished journey has no enabled external command");
    }
    assert.deepEqual([...checkedCredits].sort(), ["Review→Validate", "Validate→Confirm"]);
    const bodyEnds = traces.flatMap(trace => trace.flowNodeOccurrenceLifecycles.flatMap(delta => delta.ended))
      .filter(end => end.anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Scope);
    assert.equal(bodyEnds.filter(end => end.terminal === FlowNodeOccurrenceTerminalKind.Completed).length, early ? 1 : 2);
    assert.equal(bodyEnds.filter(end => end.terminal === FlowNodeOccurrenceTerminalKind.Cancelled).length, early ? 1 : 0);
  },
);

function continuationKey(owner: ScopeOccurrenceId, place: string): string {
  return JSON.stringify([owner.processInstanceId, owner.definitionScopeId, owner.activation, place]);
}

function changeMarking(marking: Map<string, number>, key: string, delta: number, label: string): void {
  const count = (marking.get(key) ?? 0) + delta;
  assert.ok(Number.isSafeInteger(count) && count >= 0, label);
  if (count === 0) marking.delete(key); else marking.set(key, count);
}

function continuationMarking(program: SemanticProcessProgram, state: RuntimeState) {
  const tokens = new Map<string, number>(), blocked = new Map<string, number>();
  for (const token of state.controlTokens)
    changeMarking(tokens, continuationKey(token.owner, token.placeId), token.multiplicity, "token multiplicity");
  for (const wait of [...state.userTaskWaits, ...state.effectWaits])
    changeMarking(blocked, continuationKey(wait.owner, wait.output), 1, "blocked continuation multiplicity");
  const pending = new Map<string, number>();
  for (const activity of state.activityOccurrences) {
    const entry = program.operations.find(operation => operation.id === activity.operationId);
    assert.ok(entry?.kind === SemanticOperationKind.EnterParallelMultiInstanceScope);
    changeMarking(pending, continuationKey(activity.owner, entry.normalOutput), 1, "pending parent continuation");
  }
  return { tokens, blocked, pending };
}

function assertContinuationBoundary(program: SemanticProcessProgram, before: RuntimeState, after: RuntimeState,
  transition: UnnumberedCommittedTransition): void {
  const expected = continuationMarking(program, before);
  if (transition.kind === SemanticTransitionKind.ExternalStimulus) {
    const stimulus = transition.stimulus;
    const id = stimulus.kind === StimulusKind.CompleteUserTaskInstance ? stimulus.taskId
      : stimulus.kind === StimulusKind.CompleteEffect ? stimulus.effectId : undefined;
    if (id === undefined) return;
    const waits = stimulus.kind === StimulusKind.CompleteUserTaskInstance ? before.userTaskWaits : before.effectWaits;
    const selected = waits.filter(wait => wait.id.processInstanceId === id.processInstanceId &&
      wait.id.elementId === id.elementId && wait.id.activation === id.activation);
    assert.equal(selected.length, 1, "external completion identifies one actual wait");
    const wait = selected[0]!;
    const key = continuationKey(wait.owner, wait.output);
    changeMarking(expected.blocked, key, -1, "completed wait exists");
    changeMarking(expected.tokens, key, 1, "completed wait becomes a token");
  } else {
    const declarations = program.operations.filter(operation => operation.id === transition.operationId);
    assert.equal(declarations.length, 1, "exact internal declarer");
    const operation = declarations[0]!;
    assert.equal(operation.kind, transition.operationKind);
    const entry = program.operations.find(candidate => candidate.kind === SemanticOperationKind.EnterParallelMultiInstanceScope);
    assert.ok(entry?.kind === SemanticOperationKind.EnterParallelMultiInstanceScope);
    const definition = program.operationScopes.find(binding => binding.operationId === operation.id);
    assert.equal(definition?.scopeId, transition.owner.definitionScopeId, "exact declared owner scope");
    if (operation.kind === SemanticOperationKind.EnterParallelMultiInstanceScope) {
      assert.equal(before.activityOccurrences.length, 0, "entry has no pending parent continuation");
      const collection = before.variables.process.bindings.find(binding => binding.name === entry.collectionName)?.value;
      assert.ok(collection?.kind === Value.StringList);
      changeMarking(expected.tokens, continuationKey(transition.owner, entry.input), -1, "entry consumed parent token");
      if (collection.value.length === 0) {
        assert.equal(after.activityOccurrences.length, 0, "empty entry has no pending parent continuation");
        changeMarking(expected.tokens, continuationKey(transition.owner, entry.normalOutput), 1, "empty parent output");
      } else {
        assert.equal(after.activityOccurrences.length, 1, "one pending parent continuation");
        const activity = after.activityOccurrences[0]!;
        assert.deepEqual(activity.owner, transition.owner, "entry exact parent owner");
        assert.equal(activity.operationId, entry.id);
        assert.ok(activity.body.kind === "parallelChildScopes");
        assert.equal(activity.body.iterations.length, collection.value.length);
        changeMarking(expected.pending, continuationKey(transition.owner, entry.normalOutput), 1, "pending parent continuation");
        for (const iteration of activity.body.iterations) {
          assert.equal(iteration.scope.definitionScopeId, entry.childScopeId);
          const scopes = after.scopeOccurrences.filter(scope => sameScopeOccurrence(scope.id, iteration.scope));
          assert.equal(scopes.length, 1, "each issued body has an exact scope");
          assert.deepEqual(scopes[0]!.parent, transition.owner, "issued body parent owner");
          assert.equal(before.scopeOccurrences.some(scope => sameScopeOccurrence(scope.id, iteration.scope)), false);
          changeMarking(expected.tokens, continuationKey(iteration.scope, entry.childEntry), 1, "one child entry token");
        }
      }
    } else if (operation.kind === SemanticOperationKind.CompleteParallelMultiInstanceScope) {
      assert.equal(operation.entryOperationId, entry.id);
      assert.equal(before.activityOccurrences.length, 1, "retirement has one pending parent continuation");
      const activity = before.activityOccurrences[0]!;
      assert.equal(activity.operationId, entry.id);
      assert.ok(activity.body.kind === "parallelChildScopes");
      const iterations = activity.body.iterations;
      assert.equal(iterations.filter(iteration => sameScopeOccurrence(iteration.scope, transition.owner)).length, 1);
      assert.equal(before.controlTokens.some(token => sameScopeOccurrence(token.owner, transition.owner)), false, "selected body has no token at retirement");
      assert.equal([...before.userTaskWaits, ...before.effectWaits].some(wait => sameScopeOccurrence(wait.owner, transition.owner)), false,
        "selected body has no blocked continuation at retirement");
      const remaining = iterations.filter(iteration => !sameScopeOccurrence(iteration.scope, transition.owner));
      const condition = before.variables.process.bindings.find(binding => binding.name === entry.completionBooleanName)?.value;
      const closing = remaining.length === 0 || (condition?.kind === Value.Boolean && condition.value);
      const retired = closing ? iterations : iterations.filter(iteration => sameScopeOccurrence(iteration.scope, transition.owner));
      for (const iteration of retired) {
        for (const token of before.controlTokens.filter(token => sameScopeOccurrence(token.owner, iteration.scope)))
          changeMarking(expected.tokens, continuationKey(token.owner, token.placeId), -token.multiplicity, "cancelled token removal");
        for (const wait of [...before.userTaskWaits, ...before.effectWaits].filter(wait => sameScopeOccurrence(wait.owner, iteration.scope)))
          changeMarking(expected.blocked, continuationKey(wait.owner, wait.output), -1, "cancelled wait removal");
        assert.equal(after.scopeOccurrences.some(scope => sameScopeOccurrence(scope.id, iteration.scope)), false, "retired body removed");
      }
      if (closing) {
        assert.equal(after.activityOccurrences.length, 0, "closing removes pending parent continuation");
        changeMarking(expected.pending, continuationKey(activity.owner, entry.normalOutput), -1, "pending parent continuation exists");
        changeMarking(expected.tokens, continuationKey(activity.owner, entry.normalOutput), 1, "single normal parent output");
      } else {
        assert.equal(after.activityOccurrences.length, 1, "nonfinal retains pending parent continuation");
        assert.deepEqual(after.activityOccurrences[0], { ...activity, body: { ...activity.body, iterations: remaining } });
      }
    } else {
      if (definition?.scopeId !== entry.childScopeId) return;
      let consumed: readonly string[], produced: readonly string[];
      let arming = false;
      switch (operation.kind) {
        case SemanticOperationKind.AwaitUserTask:
        case SemanticOperationKind.AwaitEffect:
          consumed = [operation.input]; produced = [operation.output]; arming = true; break;
        case SemanticOperationKind.Duplicate:
          consumed = [operation.input]; produced = operation.outputs; break;
        case SemanticOperationKind.Synchronize:
          consumed = operation.inputs; produced = [operation.output]; break;
        case SemanticOperationKind.ReachNoneEnd:
          consumed = [operation.input]; produced = []; break;
        default: return;
      }
      for (const place of consumed)
        changeMarking(expected.tokens, continuationKey(transition.owner, place), -1, "declared consumed token must exist");
      for (const place of produced)
        changeMarking(arming ? expected.blocked : expected.tokens, continuationKey(transition.owner, place), 1, "declared output multiplicity");
    }
  }
  const actual = continuationMarking(program, after);
  assert.deepEqual([...actual.tokens].sort(), [...expected.tokens].sort(), "exact continuation tokens");
  assert.deepEqual([...actual.blocked].sort(), [...expected.blocked].sort(), "exact blocked continuations");
  assert.deepEqual([...actual.pending].sort(), [...expected.pending].sort(), "exact pending parent continuation");
}

test("private parallel continuation-marking guard rejects missing tokens, extra waits and wrong owners", () => {
  const { program, start } = inputs.find(input => input.count === 2)!;
  const traced = committedTrace(program, initialState, start);
  let before = initialState;
  for (const record of traced.committedTransitions) {
    const after = record.transition.kind === SemanticTransitionKind.ExternalStimulus
      ? replayCommittedTransitions(program, before, [record]) : replayInternalTransitionRecord(program, before, record);
    assert.ok(after);
    if (record.transition.kind === SemanticTransitionKind.InternalOperation && record.transition.operationKind === SemanticOperationKind.AwaitUserTask) {
      const transition = record.transition;
      assertContinuationBoundary(program, before, after, transition);
      assert.throws(() => assertContinuationBoundary(program, { ...before, controlTokens: [] }, after, record.transition), /consumed token/);
      assert.throws(() => assertContinuationBoundary(program, before,
        { ...after, userTaskWaits: [...after.userTaskWaits, ...after.userTaskWaits] }, record.transition), /blocked continuations/);
      assert.throws(() => assertContinuationBoundary(program, before, after,
        { ...transition, owner: { ...transition.owner, activation: 999 } }), /consumed token/);
      return;
    }
    before = after;
  }
  assert.fail("Start must publish an actual body arming transition");
});

test("private parallel parent-continuation guard rejects duplicate and wrong-owner pending continuations", () => {
  const { program, start } = inputs.find(input => input.count === 2)!;
  const traced = committedTrace(program, initialState, start);
  let before = initialState;
  for (const record of traced.committedTransitions) {
    const after = record.transition.kind === SemanticTransitionKind.ExternalStimulus
      ? replayCommittedTransitions(program, before, [record]) : replayInternalTransitionRecord(program, before, record);
    assert.ok(after);
    if (record.transition.kind === SemanticTransitionKind.InternalOperation && record.transition.operationKind === SemanticOperationKind.EnterParallelMultiInstanceScope) {
      const activity = after.activityOccurrences[0]!;
      assert.throws(() => assertContinuationBoundary(program, before,
        { ...after, activityOccurrences: [...after.activityOccurrences, activity] }, record.transition), /pending parent continuation/);
      assert.throws(() => assertContinuationBoundary(program, before,
        { ...after, activityOccurrences: [{ ...activity, owner: { ...activity.owner, activation: 999 } }] }, record.transition), /parent owner/);
      return;
    }
    before = after;
  }
  assert.fail("Start must publish an actual PMIS entry transition");
});
