/** Independent E2 completeness rules for parallel Multi-Instance child lifecycles. */
import {
  FlowNodeOccurrenceTerminalKind,
  SemanticFlowNodeOccurrenceAnchorKind,
} from "./flow-node-occurrence-lifecycle.js";
import type {
  UnnumberedFlowNodeOccurrenceDelta,
  UnnumberedFlowNodeOccurrenceEnd,
} from "./flow-node-occurrence-lifecycle.js";
import type { OpenOccurrence } from "./flow-node-occurrence-publication-external-completeness.js";
import type { OccurrenceId } from "./contract.js";
import { ActivityHandlerKind } from "./activity-occurrence.js";
import type {
  AwaitParallelMultiInstanceUserTaskOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import {
  sameOccurrence,
  sameScopeOccurrence,
} from "./semantic-process-state.js";

/** Returns the complete selected-child and optional whole-sibling terminal set. */
export function parallelMultiInstanceCompletionEnds(
  open: readonly OpenOccurrence[],
  supplied: UnnumberedFlowNodeOccurrenceDelta,
  completed: OpenOccurrence,
): UnnumberedFlowNodeOccurrenceEnd[] | null {
  const timer = onlyAttachedTimer(completed);
  if (timer === undefined) return null;
  const siblings = open.filter((entry) => {
    const siblingTimer = onlyAttachedTimer(entry);
    return entry !== completed &&
      entry.anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Wait &&
      entry.processId === completed.processId &&
      entry.elementId === completed.elementId &&
      sameScopeOccurrence(entry.owner, completed.owner) &&
      siblingTimer !== undefined && sameOccurrence(siblingTimer, timer);
  });
  const suppliedSiblingEnds = supplied.ended.filter(({ anchor }) =>
    anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Wait &&
    siblings.some((entry) =>
      entry.anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Wait &&
      sameOccurrence(entry.anchor.id, anchor.id)));
  if (suppliedSiblingEnds.length !== 0 &&
      (suppliedSiblingEnds.length !== siblings.length ||
        suppliedSiblingEnds.some(({ terminal }) =>
          terminal !== FlowNodeOccurrenceTerminalKind.Cancelled))) {
    return null;
  }
  return [
    { anchor: completed.anchor, terminal: FlowNodeOccurrenceTerminalKind.Completed },
    ...(suppliedSiblingEnds.length === 0
      ? []
      : siblings.map(({ anchor }) => ({
          anchor,
          terminal: FlowNodeOccurrenceTerminalKind.Cancelled,
        }))),
  ];
}

/** Resolves every child belonging to the one parallel Activity deadline. */
export function parallelMultiInstanceBoundaryHosts(
  program: SemanticProcessProgram,
  open: readonly OpenOccurrence[],
  operation: AwaitParallelMultiInstanceUserTaskOperation,
  timerId: OccurrenceId,
): readonly OpenOccurrence[] | null {
  const hosts = open.filter((entry) =>
    entry.anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Wait &&
    entry.anchor.id.processInstanceId === timerId.processInstanceId &&
    entry.anchor.id.elementId === operation.task.elementId &&
    listsTimer(entry, timerId) &&
    operationOwnedBy(program, operation, entry));
  const host = hosts[0];
  return host === undefined || hosts.some((candidate) =>
    candidate.processId !== host.processId ||
    !sameScopeOccurrence(candidate.owner, host.owner)
  ) ? null : hosts;
}

function listsTimer(entry: OpenOccurrence, timerId: OccurrenceId): boolean {
  return entry.attachedHandlers.some((attached) =>
    attached.kind === ActivityHandlerKind.Timer && sameOccurrence(attached.occurrence, timerId)
  );
}

function onlyAttachedTimer(entry: OpenOccurrence): OccurrenceId | undefined {
  const [handler] = entry.attachedHandlers;
  return entry.attachedHandlers.length === 1 && handler?.kind === ActivityHandlerKind.Timer
    ? handler.occurrence
    : undefined;
}

function operationOwnedBy(
  program: SemanticProcessProgram,
  operation: AwaitParallelMultiInstanceUserTaskOperation,
  entry: OpenOccurrence,
): boolean {
  return program.operationScopes.filter(({ operationId, scopeId }) =>
    operationId === operation.id && scopeId === entry.owner.definitionScopeId
  ).length === 1;
}
