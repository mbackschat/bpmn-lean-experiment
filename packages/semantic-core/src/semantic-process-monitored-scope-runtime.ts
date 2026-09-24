/** Non-interrupting child-scope arming preserves the same ownership triple as bounded entry. */
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { EnterMonitoredScopeOperation, SemanticProcessProgram } from "./semantic-process-contract.js";
import { ControlStateKind, sameOccurrence, sameScopeOccurrence } from "./semantic-process-state.js";
import type { RuntimeState, ScopeOccurrenceId } from "./semantic-process-state.js";
import { selectBoundedScopeArming, applySelectedBoundedScopeArming } from "./semantic-process-bounded-scope-runtime.js";
import { ActivityBodyKind, activityOccurrenceForAttachedTimer } from "./activity-occurrence.js";
import { StimulusKind } from "./contract.js";
import type { FireTimerStimulus, OccurrenceId } from "./contract.js";
import { operationIsSelectedFromProgram } from "./flow-node-occurrence-candidates.js";
import { fireNonInterruptingBoundaryTimer } from "./semantic-process-recurring-boundary-timer-runtime.js";

export function armMonitoredScope(
  operation: EnterMonitoredScopeOperation, state: RuntimeState, parent: ScopeOccurrenceId,
): RuntimeState | null {
  const selected = selectBoundedScopeArming(operation, state, parent);
  return selected === null ? null : applySelectedBoundedScopeArming(operation, state, parent, selected);
}

/** The parent-owned deadline spawns a sibling route without cancelling the live child body. */
export function spawnFromMonitoredScope(
  program: SemanticProcessProgram, state: RuntimeState, stimulus: FireTimerStimulus,
): RuntimeState | null {
  if (state.control.kind !== ControlStateKind.Running || stimulus.kind !== StimulusKind.FireTimer) return null;
  const record = activityOccurrenceForAttachedTimer(state.activityOccurrences, stimulus.timerId);
  if (record?.body.kind !== ActivityBodyKind.ChildScope || record.attachedHandlers.length !== 1) return null;
  const body = record.body.scope;
  const definitions = program.operations.filter((operation): operation is EnterMonitoredScopeOperation =>
    operation.kind === SemanticOperationKind.EnterMonitoredScope && operation.id === record.operationId);
  const definition = definitions.length === 1 ? definitions[0] : undefined;
  const children = state.scopeOccurrences.filter(({ id }) => sameScopeOccurrence(id, body));
  const child = children.length === 1 ? children[0] : undefined;
  const timers = state.timerWaits.filter(({ id }) => sameOccurrence(id, stimulus.timerId));
  const timer = timers.length === 1 ? timers[0] : undefined;
  if (definition === undefined || child?.parent === undefined || child.parent === null || timer === undefined ||
      !operationIsSelectedFromProgram(program, definition, record.owner) ||
      record.id.activityElementId !== definition.origin.elementId ||
      body.definitionScopeId !== definition.childScopeId ||
      !sameScopeOccurrence(child.parent, record.owner) || !sameScopeOccurrence(timer.owner, record.owner) ||
      timer.id.elementId !== definition.boundaryTimer.elementId || timer.output !== definition.boundaryTimer.output ||
      stimulus.logicalTimeMs !== timer.deadlineMs) return null;
  return fireNonInterruptingBoundaryTimer(state, record, timer, definition.boundaryTimer);
}

export function isMonitoredScopeDeadlineDefinition(program: SemanticProcessProgram, timer: OccurrenceId): boolean {
  return program.operations.some((operation) => operation.kind === SemanticOperationKind.EnterMonitoredScope &&
    operation.boundaryTimer.elementId === timer.elementId);
}
