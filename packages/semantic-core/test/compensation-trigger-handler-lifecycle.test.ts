import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  EffectExecutionResultKind,
  FlowNodeOccurrenceTerminalKind,
  SemanticFlowNodeOccurrenceAnchorKind,
  SemanticOperationKind,
  StimulusKind,
  applyStimulusWithTrace,
  observeStableState,
  projectOpenFlowNodeOccurrences,
  type SemanticFlowNodeOccurrenceAnchor,
} from "@bpmn-lean/semantic-core";
import {
  compensationSemanticProgram,
  triggerReadyFixture,
} from "./compensation-trigger-handler-semantic-fixtures.ts";

test("publishes the trigger, B/C frontier, frozen effect, and B-to-A lifecycle without duplication", () => {
  const ready = triggerReadyFixture();
  const triggered = applyStimulusWithTrace(
    compensationSemanticProgram,
    ready.state,
    ready.completion,
  );
  assert.equal(triggered.result.outcome, CommandOutcome.Committed);
  const triggerIndex = triggered.committedTransitions.findIndex((record) =>
    record.transition.kind === "internalOperation" &&
    record.transition.operationKind === SemanticOperationKind.TriggerCompensation
  );
  assert.ok(triggerIndex >= 0);
  const triggerDelta = triggered.flowNodeOccurrenceLifecycles[triggerIndex];
  assert.deepEqual(triggerDelta?.started.map(({ anchor, elementId }) => [anchor.kind, elementId]), [
    [SemanticFlowNodeOccurrenceAnchorKind.Wait, "Effect_Undo_B"],
    [SemanticFlowNodeOccurrenceAnchorKind.CompensationTrigger, "Trigger"],
    [SemanticFlowNodeOccurrenceAnchorKind.CompensationHandler, "Undo_B"],
    [SemanticFlowNodeOccurrenceAnchorKind.CompensationHandler, "Undo_C"],
  ]);
  assert.deepEqual(projectOpenFlowNodeOccurrences(
    compensationSemanticProgram,
    triggered.result.state,
  ), triggerDelta?.started);
  assert.deepEqual(
    observeStableState(compensationSemanticProgram, triggered.result.state)?.openEffects
      .map(({ id }) => id.elementId),
    ["Effect_Undo_B", "Undo_C"],
  );

  const b = triggered.result.state.compensationHandlerEffectWaits?.find(({ id }) =>
    id.elementId === "Effect_Undo_B"
  );
  assert.ok(b !== undefined);
  const afterB = applyStimulusWithTrace(
    compensationSemanticProgram,
    triggered.result.state,
    {
      kind: StimulusKind.CompleteEffect,
      commandId: "complete-b-lifecycle",
      effectId: b.id,
      result: { kind: EffectExecutionResultKind.Success, localPatch: [] },
    },
  );
  assert.deepEqual(afterB.flowNodeOccurrenceLifecycles[0]?.started.map(({ anchor, elementId }) =>
    [anchor.kind, elementId]
  ), [[SemanticFlowNodeOccurrenceAnchorKind.CompensationHandler, "Undo_A"]]);
  assert.deepEqual(afterB.flowNodeOccurrenceLifecycles[0]?.ended.map(({ anchor, terminal }) =>
    [anchor.kind, terminal]
  ), [
    [SemanticFlowNodeOccurrenceAnchorKind.Wait, FlowNodeOccurrenceTerminalKind.Completed],
    [SemanticFlowNodeOccurrenceAnchorKind.CompensationHandler, FlowNodeOccurrenceTerminalKind.Completed],
  ]);
});

test("publishes fail-fast cancellation for every started compensation occurrence and none for pending A", () => {
  const ready = triggerReadyFixture();
  const triggered = applyStimulusWithTrace(
    compensationSemanticProgram,
    ready.state,
    ready.completion,
  ).result.state;
  const c = triggered.compensationHandlerEffectWaits?.find(({ id }) =>
    id.elementId === "Undo_C"
  );
  assert.ok(c !== undefined);
  const failed = applyStimulusWithTrace(compensationSemanticProgram, triggered, {
    kind: StimulusKind.CompleteEffect,
    commandId: "fail-c-lifecycle",
    effectId: c.id,
    result: {
      kind: EffectExecutionResultKind.BpmnError,
      code: "compensation-rejected",
      message: null,
      localPatch: [],
    },
  });

  assert.equal(failed.result.outcome, CommandOutcome.Committed);
  assert.deepEqual(failed.flowNodeOccurrenceLifecycles[0]?.started, []);
  assert.deepEqual(failed.flowNodeOccurrenceLifecycles[0]?.ended.map(({ anchor, terminal }) =>
    [anchor.kind, anchorElementId(anchor), terminal]
  ), [
    [SemanticFlowNodeOccurrenceAnchorKind.Wait, "Effect_Undo_B", FlowNodeOccurrenceTerminalKind.Cancelled],
    [SemanticFlowNodeOccurrenceAnchorKind.CompensationTrigger, "operation:Trigger", FlowNodeOccurrenceTerminalKind.Cancelled],
    [SemanticFlowNodeOccurrenceAnchorKind.CompensationHandler, "Undo_B", FlowNodeOccurrenceTerminalKind.Cancelled],
    [SemanticFlowNodeOccurrenceAnchorKind.CompensationHandler, "Undo_C", FlowNodeOccurrenceTerminalKind.Cancelled],
  ]);
  assert.equal(
    failed.flowNodeOccurrenceLifecycles[0]?.ended.some(({ anchor }) =>
      anchorElementId(anchor) === "Undo_A"
    ),
    false,
  );
  assert.deepEqual(projectOpenFlowNodeOccurrences(compensationSemanticProgram, failed.result.state), []);
});

function anchorElementId(anchor: SemanticFlowNodeOccurrenceAnchor): string {
  switch (anchor.kind) {
    case SemanticFlowNodeOccurrenceAnchorKind.Wait:
    case SemanticFlowNodeOccurrenceAnchorKind.CallActivity:
    case SemanticFlowNodeOccurrenceAnchorKind.CompensationTrigger:
    case SemanticFlowNodeOccurrenceAnchorKind.CompensationHandler:
      return anchor.id.elementId;
    case SemanticFlowNodeOccurrenceAnchorKind.Scope:
    case SemanticFlowNodeOccurrenceAnchorKind.Transition:
      return "";
  }
}
