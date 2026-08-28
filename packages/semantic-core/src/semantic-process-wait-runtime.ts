import {
  applyInternalOrdinaryArmingPatch,
  deriveInternalOrdinaryArmingPatch,
} from "./internal-transition-ordinary-arming-patch.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticOperation } from "./semantic-process-contract.js";
import type {
  RuntimeState,
  ScopeOccurrenceId,
} from "./semantic-process-state.js";

export function createUserTaskWait(
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.AwaitUserTask }
  >,
  state: RuntimeState,
  owner: ScopeOccurrenceId,
): RuntimeState {
  const patch = deriveInternalOrdinaryArmingPatch(operation, state, owner);
  return patch === null ? state : applyInternalOrdinaryArmingPatch(state, patch);
}

export function createTimerWait(
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.AwaitTimer }
  >,
  state: RuntimeState,
  owner: ScopeOccurrenceId,
): RuntimeState {
  const patch = deriveInternalOrdinaryArmingPatch(operation, state, owner);
  return patch === null ? state : applyInternalOrdinaryArmingPatch(state, patch);
}

export function createEffectWait(
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.AwaitEffect }
  >,
  state: RuntimeState,
  owner: ScopeOccurrenceId,
): RuntimeState {
  const patch = deriveInternalOrdinaryArmingPatch(operation, state, owner);
  return patch === null ? state : applyInternalOrdinaryArmingPatch(state, patch);
}
