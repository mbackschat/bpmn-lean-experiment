import { applyInternalDataArmingPatch } from "./internal-transition-data-arming-patch.js";
import { deriveInternalDataArmingPreparation } from "./internal-transition-data-arming-preparation.js";
import type { PreparedInternalDataArming } from "./internal-transition-data-arming-preparation.js";
import { internalTransitionFootprintsAreIndependent } from "./internal-transition-footprint.js";
import type { InternalTransitionCandidate } from "./internal-transition-footprint.js";
import { applyInternalOrdinaryArmingPatch } from "./internal-transition-ordinary-arming-patch.js";
import { deriveInternalOrdinaryArmingPreparation } from "./internal-transition-ordinary-arming-preparation.js";
import type { PreparedInternalOrdinaryArming } from "./internal-transition-ordinary-arming-preparation.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticProcessProgram } from "./semantic-process-contract.js";
import type { RuntimeState } from "./semantic-process-state.js";

export enum PreparedInternalArmingKind {
  Ordinary = "ordinary",
  Data = "data",
}

export type PreparedInternalArming = Readonly<
  | PreparedInternalOrdinaryArming & { kind: PreparedInternalArmingKind.Ordinary }
  | PreparedInternalDataArming & { kind: PreparedInternalArmingKind.Data }
>;

export function deriveInternalArmingPreparation(
  program: SemanticProcessProgram,
  state: RuntimeState,
  candidate: InternalTransitionCandidate,
): PreparedInternalArming | null {
  switch (candidate.operation.kind) {
    case SemanticOperationKind.AwaitDataInputOutputUserTask: {
      if (program.compensationEventSubProcessSnapshots !== undefined) return null;
      const prepared = deriveInternalDataArmingPreparation(program, state, candidate);
      return prepared === null ? null : { kind: PreparedInternalArmingKind.Data, ...prepared };
    }
    case SemanticOperationKind.AwaitUserTask:
    case SemanticOperationKind.AwaitMessage:
    case SemanticOperationKind.AwaitPayloadMessage:
    case SemanticOperationKind.AwaitCorrelatedPayloadMessage:
    case SemanticOperationKind.AwaitTimer:
    case SemanticOperationKind.AwaitEffect: {
      const prepared = deriveInternalOrdinaryArmingPreparation(program, state, candidate);
      return prepared === null ? null : { kind: PreparedInternalArmingKind.Ordinary, ...prepared };
    }
    default:
      return null;
  }
}

/** Checks every supplied frontier member against the same predecessor, retaining caller order. */
export function prepareInternalArmingBatch(
  program: SemanticProcessProgram,
  state: RuntimeState,
  candidates: ReadonlyArray<InternalTransitionCandidate>,
): ReadonlyArray<PreparedInternalArming> | null {
  if (candidates.length < 2) return null;
  const prepared: PreparedInternalArming[] = [];
  for (const candidate of candidates) {
    const member = deriveInternalArmingPreparation(program, state, candidate);
    if (member === null) return null;
    prepared.push(member);
  }
  for (let left = 0; left < prepared.length; left += 1) {
    for (let right = left + 1; right < prepared.length; right += 1) {
      if (!internalTransitionFootprintsAreIndependent(prepared[left]!.footprint, prepared[right]!.footprint)) {
        return null;
      }
    }
  }
  return prepared;
}

export function applyPreparedInternalArming(
  program: SemanticProcessProgram,
  state: RuntimeState,
  prepared: PreparedInternalArming,
): RuntimeState | null {
  const current = deriveInternalArmingPreparation(program, state, prepared);
  // INTERNAL-COMMUTATION's complete preparation frame includes copied input and publication time.
  // Admitted preparations contain deterministic JSON data; retaining their full serialization
  // checks every field without erasing tags, array order, or the separate occurrence counters.
  if (current === null || JSON.stringify(current) !== JSON.stringify(prepared)) return null;
  switch (prepared.kind) {
    case PreparedInternalArmingKind.Ordinary:
      return applyInternalOrdinaryArmingPatch(state, prepared.patch);
    case PreparedInternalArmingKind.Data:
      return applyInternalDataArmingPatch(state, prepared.patch);
  }
}
