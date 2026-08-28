import {
  candidateProcessId,
  operationIsSelectedFromProgram,
} from "./flow-node-occurrence-candidates.js";
import { internalOperationAlternative } from "./internal-transition-alternative.js";
import type { InternalOperationAlternative } from "./internal-transition-alternative.js";
import { canonicalUniqueStateAtoms } from "./internal-transition-footprint-ordering.js";
import type {
  InternalTransitionStateAtom,
  InternalTransitionStateFootprint,
} from "./internal-transition-footprint.js";
import { InternalTransitionStateAtomKind } from "./internal-transition-footprint-vocabulary.js";
import {
  affectedTokenBucketsAreExact,
  tokenBucketIsAbsent,
} from "./internal-transition-token-preparation.js";
import { InternalOccurrenceKind } from "./internal-transition-wait-census.js";
import {
  selectCalledProcessInvocation,
} from "./semantic-process-call-runtime.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type {
  SemanticOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import {
  onlyTokenOwner,
  selectChildScopeEntry,
} from "./semantic-process-scope-runtime.js";
import {
  ControlStateKind,
  sameScopeOccurrence,
} from "./semantic-process-state.js";
import type {
  CalledProcessOccurrence,
  RuntimeState,
  ScopeOccurrenceId,
} from "./semantic-process-state.js";

export enum InternalScopeCreationResultKind {
  CalledProcess = "calledProcess",
  ChildScope = "childScope",
}

export type InternalScopeCreationResult = Readonly<
  | {
      kind: InternalScopeCreationResultKind.ChildScope;
      child: ScopeOccurrenceId;
    }
  | {
      kind: InternalScopeCreationResultKind.CalledProcess;
      record: CalledProcessOccurrence;
    }
>;

export type PreparedInternalScopeCreation = Readonly<{
  alternative: InternalOperationAlternative;
  owner: ScopeOccurrenceId;
  creation: InternalScopeCreationResult;
  footprint: InternalTransitionStateFootprint;
}>;

/** Derives one exact ordinary child-scope creation without applying it. */
export function deriveInternalEnterScopePreparation(
  program: SemanticProcessProgram,
  state: RuntimeState,
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.EnterScope }
  >,
): PreparedInternalScopeCreation | null {
  const owner = onlyTokenOwner(state, operation.input);
  if (owner === undefined) {
    return null;
  }
  const selected = selectChildScopeEntry(state, operation);
  if (
    selected === null ||
    !Number.isSafeInteger(selected.child.activation) ||
    selected.child.activation <= 0
  ) {
    return null;
  }
  return prepareScopeCreation(
    program,
    state,
    operation,
    owner,
    selected.child,
    operation.input,
    operation.childEntry,
    {
      kind: InternalScopeCreationResultKind.ChildScope,
      child: selected.child,
    },
    [{
      kind: InternalTransitionStateAtomKind.Activation,
      occurrenceKind: InternalOccurrenceKind.Scope,
      elementId: operation.childScopeId,
    }],
  );
}

/** Derives one exact Call Activity invocation without applying it. */
export function deriveInternalInvokeProcessPreparation(
  program: SemanticProcessProgram,
  state: RuntimeState,
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.InvokeProcess }
  >,
): PreparedInternalScopeCreation | null {
  const owner = onlyTokenOwner(state, operation.input);
  if (owner === undefined) {
    return null;
  }
  const selected = selectCalledProcessInvocation(operation, state, owner);
  if (
    selected === null ||
    !Number.isSafeInteger(selected.record.id.activation) ||
    selected.record.id.activation <= 0
  ) {
    return null;
  }
  const association = {
    kind: InternalTransitionStateAtomKind.CallAssociation,
    record: selected.record,
  } as const;
  return prepareScopeCreation(
    program,
    state,
    operation,
    owner,
    selected.record.calledRoot,
    operation.input,
    operation.calledEntry,
    {
      kind: InternalScopeCreationResultKind.CalledProcess,
      record: selected.record,
    },
    [
      {
        kind: InternalTransitionStateAtomKind.Activation,
        occurrenceKind: InternalOccurrenceKind.Call,
        elementId: operation.origin.elementId,
      },
      association,
    ],
  );
}

function prepareScopeCreation(
  program: SemanticProcessProgram,
  state: RuntimeState,
  operation: Extract<
    SemanticOperation,
    {
      kind:
        | SemanticOperationKind.EnterScope
        | SemanticOperationKind.InvokeProcess;
    }
  >,
  owner: ScopeOccurrenceId,
  created: ScopeOccurrenceId,
  input: string,
  entry: string,
  creation: InternalScopeCreationResult,
  creationAtoms: ReadonlyArray<InternalTransitionStateAtom>,
): PreparedInternalScopeCreation | null {
  const owners = state.scopeOccurrences.filter(({ id }) =>
    sameScopeOccurrence(id, owner)
  );
  const ownerRecord = owners[0];
  if (
    state.control.kind !== ControlStateKind.Running ||
    owners.length !== 1 ||
    ownerRecord === undefined ||
    !operationIsSelectedFromProgram(program, operation, owner) ||
    candidateProcessId(program, state, owner) === null ||
    !affectedTokenBucketsAreExact(state, owner, [input], []) ||
    !tokenBucketIsAbsent(state, created, entry)
  ) {
    return null;
  }

  const inputToken = {
    kind: InternalTransitionStateAtomKind.ControlToken,
    owner,
    placeId: input,
  } as const;
  const entryToken = {
    kind: InternalTransitionStateAtomKind.ControlToken,
    owner: created,
    placeId: entry,
  } as const;
  const createdOccurrence = {
    kind: InternalTransitionStateAtomKind.ScopeOccurrence,
    owner: created,
  } as const;
  const createdParent = {
    kind: InternalTransitionStateAtomKind.ScopeParent,
    occurrence: created,
    parent: operation.kind === SemanticOperationKind.EnterScope ? owner : null,
  } as const;
  const writes = canonicalUniqueStateAtoms([
    inputToken,
    entryToken,
    createdOccurrence,
    createdParent,
    ...creationAtoms,
  ]);
  const reads = canonicalUniqueStateAtoms([
    {
      kind: InternalTransitionStateAtomKind.RuntimeControl,
      instanceId: state.control.instanceId,
    },
    { kind: InternalTransitionStateAtomKind.ScopeOccurrence, owner },
    {
      kind: InternalTransitionStateAtomKind.ScopeParent,
      occurrence: owner,
      parent: ownerRecord.parent,
    },
    inputToken,
    entryToken,
    createdOccurrence,
    createdParent,
    ...creationAtoms,
    { kind: InternalTransitionStateAtomKind.LogicalTime },
  ]);
  return reads === null || writes === null
    ? null
    : {
      alternative: internalOperationAlternative(operation.id),
      owner,
      creation,
      footprint: { reads, writes },
    };
}
