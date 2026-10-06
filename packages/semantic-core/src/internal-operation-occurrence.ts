import { createUserTaskWait, createEffectWait } from "./semantic-process-wait-runtime.js";
import { applyParallelScopeOperation } from "./parallel-scope-runtime.js";
import { applyInternalInitiationPatch } from "./internal-transition-initiation-patch.js";
import { completeScope, selectScopeCompletion } from "./semantic-process-scope-runtime.js";
import { duplicate, synchronize, reachNoneEnd } from "./semantic-process-control-flow-runtime.js";
import { resolveInternalOperationOccurrence, internalOperationOccurrences } from "./internal-transition-alternative.js";
import type { InternalOperationOccurrence } from "./internal-transition-alternative.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticProcessProgram } from "./semantic-process-contract.js";
import { ControlStateKind, ownedTokenMultiplicity, sameScopeOccurrence } from "./semantic-process-state.js";
import type { RuntimeState } from "./semantic-process-state.js";
import { compareCanonicalStrings } from "./wire.js";

/** PMIS-SELECT-01 revalidates owner and token readiness before applying an occurrence-addressed step. */
export function applyInternalOperationOccurrence(
  program: SemanticProcessProgram,
  state: RuntimeState, candidate: InternalOperationOccurrence,
): RuntimeState | null {
  if (state.control.kind !== ControlStateKind.Running) return null;
  const operation = resolveInternalOperationOccurrence(program, state, candidate);
  if (operation === null) return null;
  const { owner } = candidate;
  const unit = (input: string) => ownedTokenMultiplicity(state.controlTokens, input, owner) === 1;
  switch (operation.kind) {
    case SemanticOperationKind.Initiate: {
      const roots = state.scopeOccurrences.filter(scope => scope.parent === null);
      return state.initiationPending && roots.length === 1 && sameScopeOccurrence(roots[0]!.id, owner)
        ? applyInternalInitiationPatch(state, { owner, outputs: [operation.output] }) : null;
    }
    case SemanticOperationKind.CompleteScope: {
      const selected = selectScopeCompletion(operation, state);
      return selected !== null && sameScopeOccurrence(selected.occurrence.id, owner) ? completeScope(operation, state) : null;
    }
    case SemanticOperationKind.EnterParallelMultiInstanceScope:
    case SemanticOperationKind.CompleteParallelMultiInstanceScope:
      return applyParallelScopeOperation(program, operation.id, state, owner);
    case SemanticOperationKind.AwaitEffect:
      return unit(operation.input) ? createEffectWait(program, operation, state, owner) : null;
    case SemanticOperationKind.AwaitUserTask:
      return unit(operation.input) ? createUserTaskWait(program, operation, state, owner) : null;
    case SemanticOperationKind.Duplicate:
      return unit(operation.input) ? duplicate(operation, state, owner) : null;
    case SemanticOperationKind.Synchronize:
      return operation.inputs.length > 0 && new Set(operation.inputs).size === operation.inputs.length &&
        operation.inputs.every(unit) ? synchronize(operation, state, owner) : null;
    case SemanticOperationKind.ReachNoneEnd:
      return unit(operation.input) ? reachNoneEnd(operation, state, owner) : null;
    default:
      return null;
  }
}

export type InternalOccurrenceOffer = Readonly<{
  candidate: InternalOperationOccurrence;
  successor: RuntimeState;
}>;

/** PMIS-SELECT-01 requires complete discovery; an unsupported operation kind refuses the frontier. */
export function deriveInternalOccurrenceFrontier(
  program: SemanticProcessProgram, state: RuntimeState,
  evaluate = applyInternalOperationOccurrence,
): readonly InternalOccurrenceOffer[] | null {
  const offers: InternalOccurrenceOffer[] = [];
  for (const operation of [...program.operations].sort((left, right) => compareCanonicalStrings(left.id, right.id))) {
    switch (operation.kind) {
      case SemanticOperationKind.Initiate:
      case SemanticOperationKind.CompleteScope:
      case SemanticOperationKind.EnterParallelMultiInstanceScope:
      case SemanticOperationKind.CompleteParallelMultiInstanceScope:
      case SemanticOperationKind.AwaitEffect:
      case SemanticOperationKind.AwaitUserTask:
      case SemanticOperationKind.Duplicate:
      case SemanticOperationKind.Synchronize:
      case SemanticOperationKind.ReachNoneEnd: {
        const candidates = internalOperationOccurrences(program, state, operation.id);
        if (candidates === null) return null;
        for (const candidate of candidates) {
          const successor = evaluate(program, state, candidate);
          // PMIS-SELECT-01 requires complete discovery: failed arming cannot erase an enabled wait.
          if (successor === null &&
              (operation.kind === SemanticOperationKind.AwaitUserTask || operation.kind === SemanticOperationKind.AwaitEffect) &&
              ownedTokenMultiplicity(state.controlTokens, operation.input, candidate.owner) > 0) return null;
          if (successor !== null) offers.push({ candidate, successor });
        }
        break;
      }
      default: return null;
    }
  }
  return offers;
}
