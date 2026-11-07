import {
  applyInternalOrdinaryArmingPatch,
  deriveInternalOrdinaryArmingPatch,
  InternalOrdinaryArmingPatchKind,
} from "./internal-transition-ordinary-arming-patch.js";
import type { ActivityHostProjection } from "./activity-host-work.js";
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

/**
 * ACSP-WAIT-01: a splitting host's arrival arms exactly the legacy wait of its work (`operation`, the host's work at its
 * input and first output) carrying every output in `outputs`. `null` for an empty list, which the wait records refuse
 * (the Lean `outputs_ne_nil` admission fact); the Lean `awaitUserTaskOutputsState?` and `awaitEffectOutputsState?`
 * transcribe it independently.
 */
export function createActivityWaitOutputs(
  program: SemanticProcessProgram,
  operation: ActivityHostProjection,
  outputs: readonly string[],
  state: RuntimeState,
  owner: ScopeOccurrenceId,
): RuntimeState | null {
  const patch = outputs.length === 0 ? null : deriveInternalOrdinaryArmingPatch(program, operation, state, owner);
  switch (patch?.kind) {
    case InternalOrdinaryArmingPatchKind.UserTask:
      return applyInternalOrdinaryArmingPatch(state, { ...patch, wait: { ...patch.wait, outputs: [...outputs] } });
    case InternalOrdinaryArmingPatchKind.Effect:
      return applyInternalOrdinaryArmingPatch(state, { ...patch, wait: { ...patch.wait, outputs: [...outputs] } });
    default:
      return null;
  }
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
