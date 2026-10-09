import assert from "node:assert/strict";
import { test } from "node:test";
import { isDeepStrictEqual } from "node:util";
import { CommandOutcome, ControlStateKind, EffectExecutionResultKind, FlowNodeOccurrenceTerminalKind,
  SemanticFlowNodeOccurrenceAnchorKind as Anchor, SemanticOperationKind as Op, SemanticTransitionKind,
  StimulusKind, VariableValueKind, applyStimulusWithTrace, foldFlowNodeOccurrenceLifecycleDelta,
  initialState, projectOpenFlowNodeOccurrences, replayCommittedTransitions,
  requireCompleteFlowNodeOccurrenceLifecycles } from "@bpmn-lean/semantic-core";
import type { RuntimeState, ScopeOccurrenceId, SemanticProcessProgram, Stimulus, TracedCommandResult } from "@bpmn-lean/semantic-core";
import { parallelCommandInputs } from "./parallel-scope-command-fixture.ts";

const { admit } = await import(new URL("../../semantic-core/dist/semantic-command-admission.js", import.meta.url).href
) as typeof import("../../semantic-core/src/semantic-command-admission.ts");
const { deriveInternalOccurrenceFrontier } = await import(new URL("../../semantic-core/dist/internal-operation-occurrence.js", import.meta.url).href
) as typeof import("../../semantic-core/src/internal-operation-occurrence.ts");
const { prepareInternalOccurrenceBatch } = await import(new URL("../../semantic-core/dist/internal-occurrence-batch.js", import.meta.url).href
) as typeof import("../../semantic-core/src/internal-occurrence-batch.ts");
const { sameScopeOccurrence } = await import(new URL("../../semantic-core/dist/semantic-process-state.js", import.meta.url).href
) as typeof import("../../semantic-core/src/semantic-process-state.ts");
const { evaluateStimulusWithSelectedSteps } = await import(new URL("../../semantic-core/dist/semantic-process-runtime.js", import.meta.url).href
) as typeof import("../../semantic-core/src/semantic-process-runtime.ts");
const { replayInternalTransitionRecord } = await import(new URL("../../semantic-core/dist/semantic-transition-trace.js", import.meta.url).href
) as typeof import("../../semantic-core/src/semantic-transition-trace.ts");

const DrainKind = { SingleOwner: "singleOwner", EntryPopulation: "entryPopulation", Settled: "settled" } as const;
type Drain = Readonly<
  | { kind: typeof DrainKind.SingleOwner; owner: ScopeOccurrenceId }
  | { kind: typeof DrainKind.EntryPopulation; owners: readonly ScopeOccurrenceId[] }
  | { kind: typeof DrainKind.Settled }
>;

function assertWholeFrontier(program: SemanticProcessProgram, state: RuntimeState, drain: Drain): void {
  const offers = deriveInternalOccurrenceFrontier(program, state);
  assert.ok(offers, "whole-selection endpoints must have complete discovery");
  if (offers.length > 1) assert.ok(prepareInternalOccurrenceBatch(program, state), "every multiple frontier must admit a complete batch");
  const retirement = offers.some(offer =>
    program.operations.find(operation => operation.id === offer.candidate.operationId)?.kind === Op.CompleteParallelMultiInstanceScope);
  if (retirement) assert.equal(offers.length, 1, "retirement cannot compete with another body's internal work");
  switch (drain.kind) {
    case DrainKind.SingleOwner:
      assert.ok(offers.every(offer => sameScopeOccurrence(offer.candidate.owner, drain.owner)),
        "work stays at its resumed owner until actual entry or retirement");
      break;
    case DrainKind.EntryPopulation:
      assert.equal(retirement, false, "entry must stop at a real wait before any body can retire");
      assert.ok(offers.every(offer => drain.owners.some(owner => sameScopeOccurrence(offer.candidate.owner, owner))),
        "entry advances only its newly issued population");
      if (offers.length === 0) for (const owner of drain.owners)
        assert.ok([...state.userTaskWaits, ...state.effectWaits].some(wait => sameScopeOccurrence(wait.owner, owner)),
          "every issued body reaches a real wait before ingress resumes");
      break;
    case DrainKind.Settled:
      assert.deepEqual(offers, [], "nonfinal retirement returns to stable siblings without parent continuation");
      break;
  }
  if (offers.length === 0 && state.control.kind === ControlStateKind.Running)
    assert.ok(state.userTaskWaits.length + state.effectWaits.length > 0, "a stable running frontier must expose a real wait");
}

function commandFrontiers(program: SemanticProcessProgram, before: RuntimeState, stimulus: Stimulus) {
  const evaluated = evaluateStimulusWithSelectedSteps(program, before, stimulus);
  assert.equal(evaluated.result.outcome, CommandOutcome.Committed);
  assert.ok(evaluated.admittedState);
  const parent = evaluated.admittedState.scopeOccurrences.find(scope => scope.parent === null)?.id;
  assert.ok(parent);
  let owner: ScopeOccurrenceId;
  switch (stimulus.kind) {
    case StimulusKind.StartProcess: owner = parent; break;
    case StimulusKind.CompleteUserTaskInstance:
      owner = before.userTaskWaits.find(wait => isDeepStrictEqual(wait.id, stimulus.taskId))!.owner;
      break;
    case StimulusKind.CompleteEffect:
      owner = before.effectWaits.find(wait => isDeepStrictEqual(wait.id, stimulus.effectId))!.owner;
      break;
    default: assert.fail("the selected grammar admits only Start and exact Human/Service completions");
  }
  let drain: Drain = { kind: DrainKind.SingleOwner, owner };
  assertWholeFrontier(program, evaluated.admittedState, drain);
  for (const batch of evaluated.selectedInternalBatches) {
    assert.ok(batch.length > 0);
    const endpoint = batch.at(-1)!.successor;
    for (const step of batch) switch (step.operation.kind) {
      case Op.EnterParallelMultiInstanceScope: {
        assert.equal(batch.length, 1);
        assert.equal(drain.kind, DrainKind.SingleOwner);
        assert.ok(step.owner !== null && sameScopeOccurrence(step.owner, parent));
        const childScopeId = step.operation.childScopeId;
        const owners = endpoint.scopeOccurrences.filter(scope => scope.id.definitionScopeId === childScopeId).map(scope => scope.id);
        drain = owners.length === 0 ? { kind: DrainKind.SingleOwner, owner: parent } : { kind: DrainKind.EntryPopulation, owners };
        break;
      }
      case Op.CompleteParallelMultiInstanceScope:
        assert.equal(batch.length, 1);
        assert.equal(drain.kind, DrainKind.SingleOwner);
        drain = (endpoint.parallelScopeControllers ?? []).length > 0
          ? { kind: DrainKind.Settled } : { kind: DrainKind.SingleOwner, owner: parent };
        break;
    }
    assertWholeFrontier(program, endpoint, drain);
  }
  const traced = applyStimulusWithTrace(program, before, stimulus);
  assert.deepEqual(evaluated.result, traced.result);
  assert.equal(traced.result.internalStepBoundExceeded, false);
  assert.deepEqual(deriveInternalOccurrenceFrontier(program, traced.result.state), []);
  assertPublicationPrefixes(program, before, stimulus, traced);
  return evaluated.result;
}

function assertPublicationPrefixes(program: SemanticProcessProgram, before: RuntimeState,
  stimulus: Stimulus, traced: TracedCommandResult): void {
  assert.equal(traced.result.outcome, CommandOutcome.Committed);
  assert.ok(traced.committedTransitions.length > 0, "committed commands publish their trace");
  assert.equal(traced.flowNodeOccurrenceLifecycles.length, traced.committedTransitions.length, "one lifecycle per transition");
  assert.deepEqual(traced.committedTransitions[0]!.transition, { kind: SemanticTransitionKind.ExternalStimulus, stimulus });
  const initialOpen = projectOpenFlowNodeOccurrences(program, before);
  assert.ok(initialOpen, "predecessor has a valid open occurrence projection");
  // PMIS's selected grammar excludes handlers; E1 completeness additionally checks terminal meaning,
  // which open-set folding cannot distinguish when both Completed and Cancelled remove the same anchor.
  requireCompleteFlowNodeOccurrenceLifecycles(program,
    initialOpen.map(occurrence => ({ ...occurrence, attachedHandlers: [] })), stimulus.commandId,
    traced.committedTransitions, traced.flowNodeOccurrenceLifecycles);
  let state = before;
  let open = initialOpen;
  for (const [index, record] of traced.committedTransitions.entries()) {
    const next = record.transition.kind === SemanticTransitionKind.ExternalStimulus
      ? replayCommittedTransitions(program, state, [record]) : replayInternalTransitionRecord(program, state, record);
    assert.ok(next, `transition ${index} replays from its exact predecessor`);
    const projected = projectOpenFlowNodeOccurrences(program, next);
    assert.ok(projected, `transition ${index} has a valid successor projection`);
    const folded = foldFlowNodeOccurrenceLifecycleDelta(open, traced.flowNodeOccurrenceLifecycles[index]!);
    assert.ok(folded, `transition ${index} has a well-formed lifecycle delta`);
    assert.deepEqual(folded, projected, `transition ${index} publishes the exact open occurrences`);
    state = next;
    open = folded;
  }
  assert.deepEqual(state, traced.result.state, "published prefixes reach the actual command result");
}

test("parallel publication oracle rejects lost scope starts, swapped wait owners and erased instantaneous lifecycles", async () => {
  const { program, start } = (await parallelCommandInputs()).find(input => input.count === 2)!;
  const traced = applyStimulusWithTrace(program, initialState, start);
  assertPublicationPrefixes(program, initialState, start, traced);
  const entryIndex = traced.committedTransitions.findIndex(({ transition }) =>
    transition.kind === SemanticTransitionKind.InternalOperation && transition.operationKind === Op.EnterParallelMultiInstanceScope);
  const armIndex = traced.committedTransitions.findIndex(({ transition }) =>
    transition.kind === SemanticTransitionKind.InternalOperation && transition.operationKind === Op.AwaitUserTask);
  const initiationIndex = traced.committedTransitions.findIndex(({ transition }) =>
    transition.kind === SemanticTransitionKind.InternalOperation && transition.operationKind === Op.Initiate);
  assert.ok(entryIndex >= 0 && armIndex >= 0 && initiationIndex >= 0);
  const firstOwner = traced.flowNodeOccurrenceLifecycles[armIndex]!.started[0]!.owner;
  const siblingOwner = traced.result.state.userTaskWaits.find(wait => !sameScopeOccurrence(wait.owner, firstOwner))!.owner;
  const mutations = [
    traced.flowNodeOccurrenceLifecycles.map((delta, index) => index === entryIndex
      ? { ...delta, started: delta.started.slice(1) } : delta),
    traced.flowNodeOccurrenceLifecycles.map((delta, index) => index === armIndex
      ? { ...delta, started: delta.started.map(start => ({ ...start, owner: siblingOwner })) } : delta),
    traced.flowNodeOccurrenceLifecycles.map((delta, index) => index === initiationIndex
      ? { started: [], ended: [] } : delta),
  ];
  for (const lifecycles of mutations) {
    assert.notDeepEqual(lifecycles, traced.flowNodeOccurrenceLifecycles);
    const altered = { ...traced, flowNodeOccurrenceLifecycles: lifecycles };
    assert.deepEqual(replayCommittedTransitions(program, initialState, altered.committedTransitions), altered.result.state);
    assert.throws(() => assertPublicationPrefixes(program, initialState, start, altered));
  }
  const wrongActivation = traced.flowNodeOccurrenceLifecycles.map((delta, index) => index === armIndex
    ? { ...delta, started: delta.started.map(start => start.anchor.kind === Anchor.Wait
      ? { ...start, anchor: { ...start.anchor, id: { ...start.anchor.id, activation: start.anchor.id.activation + 100 } } }
      : start) } : delta);
  assert.doesNotThrow(() => requireCompleteFlowNodeOccurrenceLifecycles(program, [], start.commandId,
    traced.committedTransitions, wrongActivation), "E1 lifecycle meaning alone does not establish minted wait identity");
  assert.throws(() => assertPublicationPrefixes(program, initialState, start,
    { ...traced, flowNodeOccurrenceLifecycles: wrongActivation }), /publishes the exact open occurrences/);
});

test("parallel publication oracle distinguishes cancelled siblings from completed bodies", async () => {
  const { program, start } = (await parallelCommandInputs({ condition: true })).find(input => input.count === 2)!;
  const started = applyStimulusWithTrace(program, initialState, start).result.state;
  const review: Stimulus = { kind: StimulusKind.CompleteUserTaskInstance, commandId: "stop-after-body",
    taskId: started.userTaskWaits[0]!.id,
    submittedValues: [{ name: "stop", value: { kind: VariableValueKind.Boolean, value: true } }] };
  const reviewed = applyStimulusWithTrace(program, started, review).result.state;
  const completion: Stimulus = { kind: StimulusKind.CompleteEffect, commandId: "finish-body",
    effectId: reviewed.effectWaits[0]!.id, result: { kind: EffectExecutionResultKind.Success,
      localPatch: [{ name: "result", value: { kind: VariableValueKind.String, value: "approved" } }] } };
  const validated = applyStimulusWithTrace(program, reviewed, completion).result.state;
  const confirm: Stimulus = { kind: StimulusKind.CompleteUserTaskInstance, commandId: "confirm-body",
    taskId: validated.userTaskWaits.find(wait => wait.id.elementId === "Confirm")!.id, submittedValues: [] };
  const traced = applyStimulusWithTrace(program, validated, confirm);
  assertPublicationPrefixes(program, validated, confirm, traced);
  assert.ok(traced.flowNodeOccurrenceLifecycles.some(delta => delta.ended.some(end =>
    end.anchor.kind === Anchor.Scope && end.terminal === FlowNodeOccurrenceTerminalKind.Cancelled)));
  const altered = { ...traced, flowNodeOccurrenceLifecycles: traced.flowNodeOccurrenceLifecycles.map(delta => ({
    ...delta, ended: delta.ended.map(end => ({ ...end, terminal: FlowNodeOccurrenceTerminalKind.Completed })),
  })) };
  let folded = projectOpenFlowNodeOccurrences(program, validated);
  for (const delta of altered.flowNodeOccurrenceLifecycles) {
    assert.ok(folded);
    folded = foldFlowNodeOccurrenceLifecycleDelta(folded, delta);
  }
  assert.deepEqual(folded, projectOpenFlowNodeOccurrences(program, altered.result.state),
    "open-set equality alone cannot distinguish cancellation from completion");
  assert.deepEqual(replayCommittedTransitions(program, validated, altered.committedTransitions), altered.result.state);
  assert.throws(() => assertPublicationPrefixes(program, validated, confirm, altered));
});

function finishJourney(program: SemanticProcessProgram, initial: RuntimeState, condition: boolean): RuntimeState {
  let state = initial;
  for (let command = 0; command < program.operations.length * 16; command++) {
    if (state.control.kind === ControlStateKind.Completed) return state;
    const task = state.userTaskWaits.at(-1);
    if (task !== undefined) state = commandFrontiers(program, state, {
      kind: StimulusKind.CompleteUserTaskInstance, commandId: `human-${command}`, taskId: task.id,
      submittedValues: condition ? [{ name: "stop", value: { kind: VariableValueKind.Boolean, value: true } }] : [],
    }).state;
    else {
      const effect = state.effectWaits.at(-1);
      assert.ok(effect, "unfinished journey must expose a completion");
      state = commandFrontiers(program, state, {
        kind: StimulusKind.CompleteEffect, commandId: `effect-${command}`, effectId: effect.id,
        result: { kind: EffectExecutionResultKind.Success,
          localPatch: [{ name: "result", value: { kind: VariableValueKind.String, value: "approved" } }] },
      }).state;
    }
  }
  assert.fail("the finite selected journey must reach its terminal state");
}

for (const condition of [false, true]) {
  const count = condition ? 16 : 2;
  const { program, start } = (await parallelCommandInputs({ condition })).find(input => input.count === count)!;
  test(`raw replay history cannot establish ${count}-body ${condition ? "early" : "natural"} command-boundary reachability`, () => {
    const started = applyStimulusWithTrace(program, initialState, start);
    assert.equal(started.result.outcome, CommandOutcome.Committed);
    assert.equal(started.result.state.userTaskWaits.length, count);
    assert.deepEqual(deriveInternalOccurrenceFrontier(program, started.result.state), []);

    const firstArm = started.committedTransitions.findIndex(record =>
      record.transition.kind === SemanticTransitionKind.InternalOperation && record.transition.operationKind === Op.AwaitUserTask);
    assert.ok(firstArm >= 0);
    const prefix = replayCommittedTransitions(program, initialState, started.committedTransitions.slice(0, firstArm + 1));
    assert.ok(prefix);
    let state: RuntimeState = prefix;
    assert.equal(state.userTaskWaits.length, 1);
    const owner = state.userTaskWaits[0]!.owner;

    // ContinuationCommandHistory.command accepts admission without requiring the preceding closure boundary.
    const ingress = (stimulus: Stimulus) => {
      const admitted = admit(program, state, stimulus);
      assert.equal(admitted.outcome, CommandOutcome.Committed);
      state = admitted.state;
    };
    for (let step = 0; step < program.operations.length; step++) {
      const offers = deriveInternalOccurrenceFrontier(program, state);
      assert.ok(offers);
      const kind = (operationId: string) => program.operations.find(operation => operation.id === operationId)!.kind;
      const retirement = offers.find(offer => kind(offer.candidate.operationId) === Op.CompleteParallelMultiInstanceScope);
      if (retirement !== undefined) {
        assert.ok(sameScopeOccurrence(retirement.candidate.owner, owner));
        const siblings = offers.filter(offer => kind(offer.candidate.operationId) === Op.AwaitUserTask);
        assert.equal(siblings.length, count - 1);
        assert.ok(siblings.every(offer => !sameScopeOccurrence(offer.candidate.owner, owner)));
        assert.equal(prepareInternalOccurrenceBatch(program, state), null, "raw history does not supply scheduler-boundary reachability");
        assert.throws(() => assertWholeFrontier(program, state, { kind: DrainKind.SingleOwner, owner }), /every multiple frontier/);
        return;
      }
      const task = state.userTaskWaits.find(wait => sameScopeOccurrence(wait.owner, owner));
      const effect = state.effectWaits.find(wait => sameScopeOccurrence(wait.owner, owner));
      if (task !== undefined) ingress({ kind: StimulusKind.CompleteUserTaskInstance, commandId: `human-${step}`,
        taskId: task.id, submittedValues: condition
          ? [{ name: "stop", value: { kind: VariableValueKind.Boolean, value: true } }] : [] });
      else if (effect !== undefined) ingress({ kind: StimulusKind.CompleteEffect, commandId: `effect-${step}`,
        effectId: effect.id, result: { kind: EffectExecutionResultKind.Success,
          localPatch: [{ name: "result", value: { kind: VariableValueKind.String, value: "approved" } }] } });
      else {
        const own = offers.find(offer => sameScopeOccurrence(offer.candidate.owner, owner));
        assert.ok(own);
        state = own.successor;
      }
    }
    assert.fail("the interrupted Start prefix must reach the separating retirement frontier");
  });
}

for (const bodyShape of ["serial", "joined", "separate-ends"] as const) for (const condition of [false, true]) {
  const inputs = await parallelCommandInputs({ bodyShape, condition });
  const { program, start } = inputs.find(input => input.count === 2)!;
  test(`actual two-body ${bodyShape} ${condition ? "early" : "natural"} command interleavings close without deadlock`, () => {
    const seen = new Set<string>();
    const pending: RuntimeState[] = [];
    let terminalStates = 0;
    const advance = (before: RuntimeState, stimulus: Stimulus) => {
      const result = commandFrontiers(program, before, stimulus);
      const key = JSON.stringify(result.state);
      if (!seen.has(key)) {
        seen.add(key);
        pending.push(result.state);
      }
    };
    advance(initialState, start);
    for (let cursor = 0; cursor < pending.length; cursor++) {
      assert.ok(pending.length < 4_000, "the finite interleaving witness must remain bounded");
      const state = pending[cursor]!;
      if (state.control.kind === ControlStateKind.Completed) {
        terminalStates++;
        continue;
      }
      assert.ok(state.userTaskWaits.length + state.effectWaits.length > 0, "every nonterminal boundary exposes a real wait");
      for (const wait of state.userTaskWaits) for (const stop of condition ? [false, true] : [false]) {
        advance(state, { kind: StimulusKind.CompleteUserTaskInstance, commandId: "complete-human", taskId: wait.id,
          submittedValues: condition ? [{ name: "stop", value: { kind: VariableValueKind.Boolean, value: stop } }] : [] });
      }
      for (const wait of state.effectWaits) advance(state, {
        kind: StimulusKind.CompleteEffect, commandId: "complete-effect", effectId: wait.id,
        result: { kind: EffectExecutionResultKind.Success,
          localPatch: [{ name: "result", value: { kind: VariableValueKind.String, value: "approved" } }] },
      });
    }
    assert.ok(terminalStates > 0);
  });
  test(`sixteen-body ${bodyShape} ${condition ? "early" : "natural"} scheduler journey preserves whole-frontier classification`, () => {
    const input = inputs.find(input => input.count === 16)!;
    finishJourney(input.program, commandFrontiers(input.program, initialState, input.start).state, condition);
  });
}

for (const [count, condition] of [[0, false], [2, false], [16, true]] as const) {
  const { program, start } = (await parallelCommandInputs({ condition, parentPrelude: true, parentEffect: true }))
    .find(input => input.count === count)!;
  test(`parent completion enters and drains the ${count}-body ${condition ? "early" : "natural"} population`, () => {
    let state = commandFrontiers(program, initialState, start).state;
    assert.equal(state.userTaskWaits[0]?.id.elementId, "ApproveBatch");
    state = commandFrontiers(program, state, { kind: StimulusKind.CompleteUserTaskInstance, commandId: "approve-batch",
      taskId: state.userTaskWaits[0]!.id, submittedValues: [] }).state;
    assert.equal(state.effectWaits[0]?.id.elementId, "ValidateBatch");
    const validation: Stimulus = { kind: StimulusKind.CompleteEffect, commandId: "validate-batch",
      effectId: state.effectWaits[0]!.id, result: { kind: EffectExecutionResultKind.Success,
        localPatch: [{ name: "result", value: { kind: VariableValueKind.String, value: "approved" } }] } };
    const entered = evaluateStimulusWithSelectedSteps(program, state, validation).selectedInternalSteps
      .find(step => step.operation.kind === Op.EnterParallelMultiInstanceScope);
    assert.ok(entered?.owner);
    if (count > 0) {
      assert.throws(() => assertWholeFrontier(program, entered.successor,
        { kind: DrainKind.SingleOwner, owner: entered.owner! }), /work stays at its resumed owner/,
      "a committed parent completion can enable the whole population, not just its resumed parent");
      const owners = entered.successor.scopeOccurrences.filter(scope => scope.parent !== null).map(scope => scope.id);
      assert.equal(owners.length, count);
      assert.throws(() => assertWholeFrontier(program, entered.successor,
        { kind: DrainKind.EntryPopulation, owners: owners.slice(1) }), /entry advances only its newly issued population/);
    }
    state = commandFrontiers(program, state, validation).state;
    assert.equal(state.userTaskWaits.length, count);
    assert.ok(state.userTaskWaits.every(wait => wait.id.elementId === "Review"));
    if (count === 0) assert.equal(state.effectWaits[0]?.id.elementId, "PublishBatch");
    assert.deepEqual(deriveInternalOccurrenceFrontier(program, state), []);
    const completed = finishJourney(program, state, condition);
    assert.deepEqual(completed.scopeOccurrences, []);
    assert.deepEqual(completed.parallelScopeControllers ?? [], []);
  });
}
