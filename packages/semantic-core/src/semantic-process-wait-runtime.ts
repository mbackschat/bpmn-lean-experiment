import {
  applyInternalOrdinaryArmingPatch,
  deriveInternalOrdinaryArmingPatch,
} from "./internal-transition-ordinary-arming-patch.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticOperation, SemanticProcessProgram } from "./semantic-process-contract.js";
import type {
  RuntimeState,
  ScopeOccurrenceId,
} from "./semantic-process-state.js";

export function createUserTaskWait(
  program: SemanticProcessProgram,
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.AwaitUserTask }
  >,
  state: RuntimeState,
  owner: ScopeOccurrenceId,
): RuntimeState | null {
  const patch = deriveInternalOrdinaryArmingPatch(program, operation, state, owner);
  return patch === null ? null : applyInternalOrdinaryArmingPatch(state, patch);
}

export function createTimerWait(
  program: SemanticProcessProgram,
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.AwaitTimer }
  >,
  state: RuntimeState,
  owner: ScopeOccurrenceId,
): RuntimeState | null {
  const patch = deriveInternalOrdinaryArmingPatch(program, operation, state, owner);
  return patch === null ? null : applyInternalOrdinaryArmingPatch(state, patch);
}

export function createEffectWait(
  program: SemanticProcessProgram,
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.AwaitEffect }
  >,
  state: RuntimeState,
  owner: ScopeOccurrenceId,
): RuntimeState | null {
  const patch = deriveInternalOrdinaryArmingPatch(program, operation, state, owner);
  return patch === null ? null : applyInternalOrdinaryArmingPatch(state, patch);
}
