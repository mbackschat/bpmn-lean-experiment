import {
  CompensationParentContextAttemptKind,
  CompensationParentContextRootDisposition,
  type CompensationParentContextRefusal,
} from "./compensation-event-sub-process-snapshot-contract.js";
import {
  promoteCompensationParentContext,
  reserveCompensationParentContext,
} from "./compensation-event-sub-process-snapshot.js";
import {
  selectBoundedScopeArming,
} from "./semantic-process-bounded-scope-runtime.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type {
  SemanticOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import {
  onlyTokenOwner,
  ScopeCompletionSelectionKind,
  selectChildScopeEntry,
  selectScopeCompletion,
} from "./semantic-process-scope-runtime.js";
import type {
  RuntimeScopeOccurrence,
  RuntimeState,
} from "./semantic-process-state.js";

export enum CompensationSnapshotPreparationKind {
  Ready = "ready",
  Refused = "refused",
}

export type CompensationSnapshotPreparation = Readonly<
  | {
      kind: CompensationSnapshotPreparationKind.Ready;
      state: RuntimeState;
      rootCompletion: Readonly<{
        root: RuntimeScopeOccurrence;
        disposition: CompensationParentContextRootDisposition;
      }> | null;
    }
  | {
      kind: CompensationSnapshotPreparationKind.Refused;
      detail: CompensationParentContextRefusal;
    }
>;

/** Stages snapshot changes before an internal operation so refusal cannot expose partial mutation. */
export function prepareCompensationSnapshotOperation(
  program: SemanticProcessProgram,
  operation: SemanticOperation,
  state: RuntimeState,
): CompensationSnapshotPreparation {
  switch (operation.kind) {
    case SemanticOperationKind.EnterScope: {
      const parent = onlyTokenOwner(state, operation.input);
      const child = parent === undefined
        ? null
        : selectChildScopeEntry(state, parent, operation);
      return child === null || parent === undefined
        ? readySnapshotOperation(state)
        : prepareReservation(program, state, { id: child.child, parent });
    }
    case SemanticOperationKind.EnterBoundedScope: {
      const parent = onlyTokenOwner(state, operation.input);
      const selected = parent === undefined
        ? null
        : selectBoundedScopeArming(operation, state, parent);
      return selected === null
        ? readySnapshotOperation(state)
        : prepareReservation(program, state, selected.child);
    }
    case SemanticOperationKind.CompleteScope: {
      const selected = selectScopeCompletion(operation, state);
      if (selected === null) {
        return readySnapshotOperation(state);
      }
      const attempt = promoteCompensationParentContext(
        program,
        state,
        selected.occurrence,
      );
      switch (attempt.kind) {
        case CompensationParentContextAttemptKind.Refused:
          return {
            kind: CompensationSnapshotPreparationKind.Refused,
            detail: attempt.detail,
          };
        case CompensationParentContextAttemptKind.Disabled:
        case CompensationParentContextAttemptKind.Applied:
          return {
            kind: CompensationSnapshotPreparationKind.Ready,
            state: attempt.state,
            rootCompletion:
              selected.kind === ScopeCompletionSelectionKind.Root
                ? {
                    root: selected.occurrence,
                    disposition:
                      attempt.kind === CompensationParentContextAttemptKind.Applied
                        ? CompensationParentContextRootDisposition.RetainPromoted
                        : CompensationParentContextRootDisposition.Discard,
                  }
                : null,
          };
      }
    }
    default:
      return readySnapshotOperation(state);
  }
}

function prepareReservation(
  program: SemanticProcessProgram,
  state: RuntimeState,
  child: RuntimeScopeOccurrence,
): CompensationSnapshotPreparation {
  const attempt = reserveCompensationParentContext(program, state, child);
  switch (attempt.kind) {
    case CompensationParentContextAttemptKind.Disabled:
    case CompensationParentContextAttemptKind.Applied:
      return readySnapshotOperation(attempt.state);
    case CompensationParentContextAttemptKind.Refused:
      return {
        kind: CompensationSnapshotPreparationKind.Refused,
        detail: attempt.detail,
      };
  }
}

function readySnapshotOperation(state: RuntimeState): CompensationSnapshotPreparation {
  return {
    kind: CompensationSnapshotPreparationKind.Ready,
    state,
    rootCompletion: null,
  };
}
