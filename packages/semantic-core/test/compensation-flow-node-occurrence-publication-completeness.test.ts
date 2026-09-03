/** Independent E1 completeness evidence for Compensation occurrence lifecycles. */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID,
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
  projectOpenFlowNodeOccurrences,
  requireCompleteFlowNodeOccurrenceLifecycles,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteEffectStimulus,
  RetainedFlowNodeOccurrence,
  RuntimeState,
  SemanticProcessProgram,
  TracedCommandResult,
  UnnumberedFlowNodeOccurrenceDelta,
} from "@bpmn-lean/semantic-core";

import {
  compensationSemanticProgram,
  triggerReadyFixture,
} from "./compensation-trigger-handler-semantic-fixtures.ts";

const program = {
  ...compensationSemanticProgram,
  identity: {
    ...compensationSemanticProgram.identity,
    semanticProfile: COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID,
  },
};

test("admits the complete Compensation trigger and C-before-B-before-A success lifecycle", () => {
  const ready = triggerReadyFixture();
  const triggered = applyStimulusWithTrace(
    program,
    ready.state,
    ready.completion,
  );
  assert.equal(triggered.result.outcome, CommandOutcome.Committed);
  const retainedAfterTrigger = requireAndFold(
    retainedFromState(ready.state),
    ready.completion.commandId,
    triggered,
  );
  let retained = retainedAfterTrigger;
  const c = compensationCompletion(
    triggered.result.state,
    "Undo_C",
    "complete-c-for-completeness",
  );
  const afterC = applyStimulusWithTrace(
    program,
    triggered.result.state,
    c,
  );
  assertIncomplete(
    retained,
    c.commandId,
    withForgedEffectActivation(afterC, c),
    afterC.flowNodeOccurrenceLifecycles,
  );
  retained = requireAndFold(retained, c.commandId, afterC);
  const b = compensationCompletion(
    afterC.result.state,
    "Effect_Undo_B",
    "complete-b-for-completeness",
  );
  const afterB = applyStimulusWithTrace(
    program,
    afterC.result.state,
    b,
  );
  assertIncomplete(
    retained,
    b.commandId,
    withForgedEffectActivation(afterB, b),
    afterB.flowNodeOccurrenceLifecycles,
  );
  retained = requireAndFold(retained, b.commandId, afterB);
  const a = compensationCompletion(
    afterB.result.state,
    "Undo_A",
    "complete-a-for-completeness",
  );
  const afterA = applyStimulusWithTrace(
    program,
    afterB.result.state,
    a,
  );
  assert.deepEqual(requireAndFold(retained, a.commandId, afterA), []);

  const aStart = afterB.flowNodeOccurrenceLifecycles.flatMap(({ started }) =>
    started
  ).find(({ elementId }) => elementId === "Undo_A");
  assert.ok(aStart !== undefined);
  const prematureA = replaceLifecycle(
    afterC.flowNodeOccurrenceLifecycles,
    0,
    (lifecycle) => ({
      ...lifecycle,
      started: [...lifecycle.started, aStart],
    }),
  );
  assertIncomplete(
    retainedAfterTrigger,
    c.commandId,
    afterC,
    prematureA,
  );

  const triggerIndex = triggered.committedTransitions.findIndex(({ transition }) =>
    transition.kind === SemanticTransitionKind.InternalOperation &&
    transition.operationKind === SemanticOperationKind.TriggerCompensation
  );
  assert.ok(triggerIndex >= 0);
  const missingHandler = replaceLifecycle(
    triggered.flowNodeOccurrenceLifecycles,
    triggerIndex,
    (lifecycle) => ({
      ...lifecycle,
      started: lifecycle.started.filter(({ elementId }) =>
        elementId !== "Undo_C"
      ),
    }),
  );
  assertIncomplete(
    retainedFromState(ready.state),
    ready.completion.commandId,
    triggered,
    missingHandler,
  );

  const triggerTransition = triggered.committedTransitions[triggerIndex]
    ?.transition;
  assert.ok(
    triggerTransition?.kind ===
      SemanticTransitionKind.InternalOperation,
  );
  const triggerOperation = program.operations.find(({ id }) =>
    id === triggerTransition.operationId
  );
  assert.ok(
    triggerOperation?.kind === SemanticOperationKind.TriggerCompensation,
  );
  const forgedAnchor = {
    kind: SemanticFlowNodeOccurrenceAnchorKind.Transition,
    commandId: ready.completion.commandId,
    transitionIndex: triggerIndex,
    localIndex: 0,
  } as const;
  const forgedInstant = replaceLifecycle(
    triggered.flowNodeOccurrenceLifecycles,
    triggerIndex,
    () => ({
      started: [{
        anchor: forgedAnchor,
        processId: program.processId,
        elementId: triggerOperation.origin.elementId,
        owner: triggerTransition.owner,
      }],
      ended: [{
        anchor: forgedAnchor,
        terminal: FlowNodeOccurrenceTerminalKind.Completed,
      }],
    }),
  );
  assertIncomplete(
    retainedFromState(ready.state),
    ready.completion.commandId,
    triggered,
    forgedInstant,
  );
});

test("admits Compensation fail-fast only with every live sibling terminal", () => {
  const ready = triggerReadyFixture();
  const triggered = applyStimulusWithTrace(
    program,
    ready.state,
    ready.completion,
  );
  const retained = requireAndFold(
    retainedFromState(ready.state),
    ready.completion.commandId,
    triggered,
  );
  const c = compensationCompletion(
    triggered.result.state,
    "Undo_C",
    "fail-c-for-completeness",
    EffectExecutionResultKind.BpmnError,
  );
  const failed = applyStimulusWithTrace(
    program,
    triggered.result.state,
    c,
  );
  assert.equal(failed.result.outcome, CommandOutcome.Committed);
  assert.doesNotThrow(() => requireAndFold(retained, c.commandId, failed));

  const missingSibling = replaceLifecycle(
    failed.flowNodeOccurrenceLifecycles,
    0,
    (lifecycle) => ({
      ...lifecycle,
      ended: lifecycle.ended.filter(({ anchor }) =>
        anchor.kind !== SemanticFlowNodeOccurrenceAnchorKind.Wait
      ),
    }),
  );
  assertIncomplete(retained, c.commandId, failed, missingSibling);
});

function retainedFromState(state: RuntimeState): RetainedFlowNodeOccurrence[] {
  const open = projectOpenFlowNodeOccurrences(program, state);
  assert.ok(open !== null);
  return open.map((entry) => ({
    ...entry,
    attachedHandlers: attachedHandlersForBodyAnchor(state, entry.anchor),
  }));
}

function compensationCompletion(
  state: RuntimeState,
  elementId: string,
  commandId: string,
  kind: EffectExecutionResultKind.Success | EffectExecutionResultKind.BpmnError =
    EffectExecutionResultKind.Success,
): CompleteEffectStimulus {
  const waits = (state.compensationHandlerEffectWaits ?? []).filter(({ id }) =>
    id.elementId === elementId
  );
  assert.equal(waits.length, 1);
  const wait = waits[0];
  assert.ok(wait !== undefined);
  return {
    kind: StimulusKind.CompleteEffect,
    commandId,
    effectId: wait.id,
    result: kind === EffectExecutionResultKind.Success
      ? { kind, localPatch: [] }
      : {
          kind,
          code: "compensation-rejected",
          message: null,
          localPatch: [],
        },
  };
}

function requireAndFold(
  retained: readonly RetainedFlowNodeOccurrence[],
  commandId: string,
  traced: TracedCommandResult,
): RetainedFlowNodeOccurrence[] {
  requireCompleteFlowNodeOccurrenceLifecycles(
    program,
    retained,
    commandId,
    traced.committedTransitions,
    traced.flowNodeOccurrenceLifecycles,
  );
  let open: RetainedFlowNodeOccurrence[] = [...retained];
  for (const lifecycle of traced.flowNodeOccurrenceLifecycles) {
    const next = foldFlowNodeOccurrenceLifecycleDelta(open, lifecycle);
    assert.ok(next !== null);
    open = next.map((entry) => ({
      ...entry,
      attachedHandlers: attachedHandlersForBodyAnchor(
        traced.result.state,
        entry.anchor,
      ),
    }));
  }
  return open;
}

function assertIncomplete(
  retained: readonly RetainedFlowNodeOccurrence[],
  commandId: string,
  traced: TracedCommandResult,
  lifecycles: readonly UnnumberedFlowNodeOccurrenceDelta[],
): void {
  assert.throws(() => requireCompleteFlowNodeOccurrenceLifecycles(
    program,
    retained,
    commandId,
    traced.committedTransitions,
    lifecycles,
  ), /complete lifecycle/u);
}

function withForgedEffectActivation(
  traced: TracedCommandResult,
  expectedStimulus: CompleteEffectStimulus,
): TracedCommandResult {
  const first = traced.committedTransitions[0];
  assert.ok(
    first?.transition.kind === SemanticTransitionKind.ExternalStimulus &&
      first.transition.stimulus.kind === StimulusKind.CompleteEffect,
  );
  assert.deepEqual(first.transition.stimulus, expectedStimulus);
  return {
    ...traced,
    committedTransitions: [{
      ...first,
      transition: {
        ...first.transition,
        stimulus: {
          ...first.transition.stimulus,
          effectId: {
            ...first.transition.stimulus.effectId,
            activation: first.transition.stimulus.effectId.activation + 1,
          },
        },
      },
    }, ...traced.committedTransitions.slice(1)],
  };
}

function replaceLifecycle(
  lifecycles: readonly UnnumberedFlowNodeOccurrenceDelta[],
  index: number,
  replace: (
    lifecycle: UnnumberedFlowNodeOccurrenceDelta,
  ) => UnnumberedFlowNodeOccurrenceDelta,
): readonly UnnumberedFlowNodeOccurrenceDelta[] {
  assert.ok(lifecycles[index] !== undefined);
  return lifecycles.map((lifecycle, current) =>
    current === index ? replace(lifecycle) : lifecycle
  );
}
