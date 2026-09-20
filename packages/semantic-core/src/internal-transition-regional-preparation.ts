import { internalOperationAlternative } from "./internal-transition-alternative.js";
import type { InternalOperationAlternative } from "./internal-transition-alternative.js";
import type { InternalPublicationTemplate } from "./internal-publication-template.js";
import type { InternalTransitionStateFootprint } from "./internal-transition-footprint.js";
import { canonicalStateAtomSet } from "./internal-transition-footprint-ordering.js";
import { InternalTransitionStateAtomKind } from "./internal-transition-footprint-vocabulary.js";
import { deriveInternalReturnProcessStateFootprint } from "./internal-transition-return-preparation.js";
import { deriveInternalCompleteScopeStateFootprint } from "./internal-transition-scope-completion-preparation.js";
import { deriveInternalThrowErrorStateFootprint } from "./internal-transition-error-preparation.js";
import { deriveInternalTerminateScopeStateFootprint } from "./internal-transition-termination-preparation.js";
import { deriveInternalRegionalPublication } from "./internal-transition-regional-publication.js";
import { deriveRegionalReferenceRetention, regionalOwnershipIsClosed } from "./internal-transition-regional-ownership.js";
import { deriveInternalOccurrenceRegion } from "./internal-transition-region.js";
import type { InternalOccurrenceRegion } from "./internal-transition-region.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticOperation, SemanticProcessProgram } from "./semantic-process-contract.js";
import { returnCalledProcess, selectReturnCalledProcess } from "./semantic-process-call-runtime.js";
import type { SelectedReturnCalledProcess } from "./semantic-process-call-runtime.js";
import { onlyTokenOwner, selectScopeCompletion } from "./semantic-process-scope-runtime.js";
import type { SelectedScopeCompletion } from "./semantic-process-scope-runtime.js";
import {
  completeScopeWithdrawingDeadline, selectScopeCompletionWithdrawal,
} from "./semantic-process-bounded-scope-runtime.js";
import type { ScopeCompletionWithdrawal } from "./semantic-process-bounded-scope-runtime.js";
import { selectErrorPropagation, throwError } from "./semantic-process-error-runtime.js";
import type { SelectedErrorPropagation } from "./semantic-process-error-runtime.js";
import { selectScopeTermination, terminateScope } from "./semantic-process-termination-runtime.js";
import type { SelectedScopeTermination } from "./semantic-process-termination-runtime.js";
import type { RuntimeState, ScopeOccurrenceId } from "./semantic-process-state.js";

export type InternalRegionalOperation = Extract<SemanticOperation, {
  kind: SemanticOperationKind.ReturnProcess | SemanticOperationKind.CompleteScope |
    SemanticOperationKind.ThrowError | SemanticOperationKind.TerminateScope;
}>;

export type InternalRegionalSelection = Readonly<{ owner: ScopeOccurrenceId } & (
  | { kind: SemanticOperationKind.ReturnProcess;
      operation: Extract<InternalRegionalOperation, { kind: SemanticOperationKind.ReturnProcess }>;
      selected: SelectedReturnCalledProcess }
  | { kind: SemanticOperationKind.CompleteScope;
      operation: Extract<InternalRegionalOperation, { kind: SemanticOperationKind.CompleteScope }>;
      selected: SelectedScopeCompletion; withdrawal: ScopeCompletionWithdrawal }
  | { kind: SemanticOperationKind.ThrowError;
      operation: Extract<InternalRegionalOperation, { kind: SemanticOperationKind.ThrowError }>;
      selected: SelectedErrorPropagation }
  | { kind: SemanticOperationKind.TerminateScope;
      operation: Extract<InternalRegionalOperation, { kind: SemanticOperationKind.TerminateScope }>;
      selected: SelectedScopeTermination }
)>;

export type PreparedInternalRegionalTransition = Readonly<{
  alternative: InternalOperationAlternative;
  selection: InternalRegionalSelection;
  region: InternalOccurrenceRegion;
  footprint: InternalTransitionStateFootprint;
  publicationTemplate: InternalPublicationTemplate;
}>;

/** Retains the exact selection, ownership closure, dependencies and publication before removal. */
export function deriveInternalRegionalPreparation(
  program: SemanticProcessProgram,
  state: RuntimeState,
  operation: InternalRegionalOperation,
): PreparedInternalRegionalTransition | null {
  if (program.compensationEventSubProcessSnapshots !== undefined ||
      program.operations.filter(({ id }) => id === operation.id).length !== 1 ||
      !Number.isSafeInteger(state.logicalTimeMs) || state.logicalTimeMs < 0) return null;
  const selection = selectRegionalTransition(program, state, operation);
  if (selection === null || !regionalOwnershipIsClosed(state, selection)) return null;
  const region = deriveInternalOccurrenceRegion(state, selection.owner);
  const footprint = regionalFootprint(program, state, selection);
  if (region === null || footprint === null) return null;
  const keep = deriveRegionalReferenceRetention(state, selection);
  // REG-OWN-FRAME-01 must protect shared Activity removal through either its owner or child body.
  const writes = canonicalStateAtomSet([...footprint.writes,
    ...state.activityOccurrences.filter((record) => !keep.activity(record)).map((record) => ({
      kind: InternalTransitionStateAtomKind.ActivityAssociation, record,
    } as const)),
  ]);
  const publicationTemplate = deriveInternalRegionalPublication(program, state, selection, region);
  return publicationTemplate === null ? null : {
    alternative: internalOperationAlternative(operation.id), selection, region,
    footprint: { ...footprint, writes }, publicationTemplate,
  };
}

/** Reuses the existing operation only after checking the complete retained preparation. */
export function applyPreparedInternalRegionalTransition(
  program: SemanticProcessProgram,
  state: RuntimeState,
  prepared: PreparedInternalRegionalTransition,
): RuntimeState | null {
  const current = deriveInternalRegionalPreparation(program, state, prepared.selection.operation);
  // INTERNAL-COMMUTATION's prepared-transition contract includes selection and publication, not just identity.
  if (current === null || JSON.stringify(current) !== JSON.stringify(prepared)) return null;
  const selection = prepared.selection;
  switch (selection.kind) {
    case SemanticOperationKind.ReturnProcess:
      return returnCalledProcess(selection.operation, state);
    case SemanticOperationKind.CompleteScope:
      return completeScopeWithdrawingDeadline(program, selection.operation, state);
    case SemanticOperationKind.ThrowError:
      return throwError(selection.operation, state, selection.owner);
    case SemanticOperationKind.TerminateScope:
      return terminateScope(selection.operation, state, selection.owner);
  }
}

function selectRegionalTransition(
  program: SemanticProcessProgram,
  state: RuntimeState,
  operation: InternalRegionalOperation,
): InternalRegionalSelection | null {
  switch (operation.kind) {
    case SemanticOperationKind.ReturnProcess: {
      const selected = selectReturnCalledProcess(operation, state);
      return selected === null ? null : {
        kind: operation.kind, operation, selected, owner: selected.root.id,
      };
    }
    case SemanticOperationKind.CompleteScope: {
      const selected = selectScopeCompletion(operation, state);
      const withdrawal = selectScopeCompletionWithdrawal(program, operation.scopeId, state);
      return selected === null || withdrawal === null ? null : {
        kind: operation.kind, operation, selected, withdrawal, owner: selected.occurrence.id,
      };
    }
    case SemanticOperationKind.ThrowError: {
      const owner = onlyTokenOwner(state, operation.input);
      const selected = owner === undefined ? null : selectErrorPropagation(operation, state, owner);
      return selected === null ? null : {
        kind: operation.kind, operation, selected, owner: selected.attached.id,
      };
    }
    case SemanticOperationKind.TerminateScope: {
      const owner = onlyTokenOwner(state, operation.input);
      const selected = owner === undefined ? null : selectScopeTermination(operation, state, owner);
      return selected === null ? null : {
        kind: operation.kind, operation, selected, owner: selected.occurrence.id,
      };
    }
  }
}

function regionalFootprint(
  program: SemanticProcessProgram,
  state: RuntimeState,
  selection: InternalRegionalSelection,
): InternalTransitionStateFootprint | null {
  const candidate = { operation: selection.operation, owner: selection.owner };
  switch (selection.kind) {
    case SemanticOperationKind.ReturnProcess:
      return deriveInternalReturnProcessStateFootprint(program, state, candidate);
    case SemanticOperationKind.CompleteScope:
      return deriveInternalCompleteScopeStateFootprint(program, state, candidate);
    case SemanticOperationKind.ThrowError:
      return deriveInternalThrowErrorStateFootprint(program, state, candidate);
    case SemanticOperationKind.TerminateScope:
      return deriveInternalTerminateScopeStateFootprint(program, state, candidate);
  }
}
