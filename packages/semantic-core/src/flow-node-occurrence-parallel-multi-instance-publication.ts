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
  if (completed.attachedTimers.length !== 1) return null;
  const timer = completed.attachedTimers[0]!;
  const siblings = open.filter((entry) =>
    entry !== completed &&
    entry.anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Wait &&
    entry.processId === completed.processId &&
    entry.elementId === completed.elementId &&
    sameScopeOccurrence(entry.owner, completed.owner) &&
    entry.attachedTimers.length === 1 &&
    sameOccurrence(entry.attachedTimers[0]!, timer));
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
  return entry.attachedTimers.some((attached) => sameOccurrence(attached, timerId));
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
