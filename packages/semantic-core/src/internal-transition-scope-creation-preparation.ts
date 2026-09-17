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
import { InternalPublicationTemplateAnchorKind } from "./internal-publication-template.js";
import type { InternalPublicationTemplate } from "./internal-publication-template.js";
import {
  applyInternalScopeCreationPatch,
  deriveInternalScopeCreationPositionDelta,
  InternalScopeCreationPatchKind,
} from "./internal-transition-scope-creation-patch.js";
import type { InternalScopeCreationPatch } from "./internal-transition-scope-creation-patch.js";
import { SemanticTransitionKind } from "./semantic-transition-trace.js";
import { InternalTransitionStateAtomKind } from "./internal-transition-footprint-vocabulary.js";
import {
  affectedTokenBucketsAreExact,
  tokenBucketIsAbsent,
  tokenOwnerCensusAtoms,
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
  operation: InternalScopeCreationOperation;
  owner: ScopeOccurrenceId;
  creation: InternalScopeCreationResult;
  footprint: InternalTransitionStateFootprint;
  patch: InternalScopeCreationPatch;
  publicationTemplate: InternalPublicationTemplate;
}>;

export type InternalScopeCreationOperation = Extract<SemanticOperation, {
  kind: SemanticOperationKind.EnterScope | SemanticOperationKind.InvokeProcess;
}>;

export function deriveInternalScopeCreationPreparation(
  program: SemanticProcessProgram,
  state: RuntimeState,
  operation: InternalScopeCreationOperation,
): PreparedInternalScopeCreation | null {
  switch (operation.kind) {
    case SemanticOperationKind.EnterScope:
      return deriveInternalEnterScopePreparation(program, state, operation);
    case SemanticOperationKind.InvokeProcess:
      return deriveInternalInvokeProcessPreparation(program, state, operation);
  }
}

export function applyPreparedInternalScopeCreation(
  program: SemanticProcessProgram,
  state: RuntimeState,
  prepared: PreparedInternalScopeCreation,
): RuntimeState | null {
  const current = deriveInternalScopeCreationPreparation(program, state, prepared.operation);
  // INTERNAL-COMMUTATION requires the complete retained frame, including issuance and publication.
  if (current === null || JSON.stringify(current) !== JSON.stringify(prepared)) return null;
  return applyInternalScopeCreationPatch(state, prepared.patch);
}

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
  const selected = selectChildScopeEntry(state, owner, operation);
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
  const processId = candidateProcessId(program, state, owner);
  const definitions = program.definitionScopes.filter(({ id }) => id === created.definitionScopeId);
  const definition = definitions[0];
  const counters = operation.kind === SemanticOperationKind.EnterScope ? state.scopeActivations : state.callActivations;
  const elementId = operation.kind === SemanticOperationKind.EnterScope ? operation.childScopeId : operation.origin.elementId;
  const selectedCounters = counters.filter((counter) => counter.elementId === elementId);
  const previous = selectedCounters[0]?.count ?? 0;
  if (
    state.control.kind !== ControlStateKind.Running ||
    program.compensationEventSubProcessSnapshots !== undefined ||
    program.operations.filter(({ id }) => id === operation.id).length !== 1 ||
    program.definitionScopes.some((candidate, index, all) =>
      candidate.id.length === 0 || candidate.originElementId.length === 0 ||
      all.findIndex(({ id }) => id === candidate.id) !== index ||
      all.findIndex(({ originElementId }) => originElementId === candidate.originElementId) !== index
    ) ||
    operation.origin.elementId.length === 0 ||
    !Number.isSafeInteger(state.logicalTimeMs) || state.logicalTimeMs < 0 ||
    !Number.isSafeInteger(owner.activation) || owner.activation <= 0 || owner.processInstanceId.length === 0 ||
    selectedCounters.length > 1 || !Number.isSafeInteger(previous) || previous < 0 ||
    !Number.isSafeInteger(previous + 1) ||
    definitions.length !== 1 || definition === undefined ||
    definition.parentScopeId !== (operation.kind === SemanticOperationKind.EnterScope ? owner.definitionScopeId : null) ||
    definition.originElementId !== (operation.kind === SemanticOperationKind.EnterScope ? operation.origin.elementId : operation.calledProcessId) ||
    owners.length !== 1 ||
    ownerRecord === undefined ||
    !operationIsSelectedFromProgram(program, operation, owner) ||
    processId === null ||
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
    ...tokenOwnerCensusAtoms([input, entry]),
    inputToken,
    entryToken,
    createdOccurrence,
    createdParent,
    ...creationAtoms,
  ]);
  const reads = canonicalUniqueStateAtoms([
    ...tokenOwnerCensusAtoms([input]),
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
  const scope = { id: created, parent: operation.kind === SemanticOperationKind.EnterScope ? owner : null };
  const counter = { elementId, count: previous + 1 };
  const patch: InternalScopeCreationPatch = creation.kind === InternalScopeCreationResultKind.ChildScope
    ? { kind: InternalScopeCreationPatchKind.ChildScope, owner, input, entry, scope, counter }
    : { kind: InternalScopeCreationPatchKind.CalledProcess, owner, input, entry, scope, counter, record: creation.record };
  const positionDelta = deriveInternalScopeCreationPositionDelta(program, patch);
  const alternative = internalOperationAlternative(operation.id);
  const anchor = creation.kind === InternalScopeCreationResultKind.ChildScope
    ? { kind: InternalPublicationTemplateAnchorKind.Scope, id: creation.child } as const
    : { kind: InternalPublicationTemplateAnchorKind.CallActivity, id: creation.record.id } as const;
  return reads === null || writes === null || positionDelta === null
    ? null
    : {
      alternative,
      operation,
      owner,
      creation,
      footprint: { reads, writes },
      patch,
      publicationTemplate: {
        alternative,
        record: {
          logicalTimeMs: state.logicalTimeMs,
          transition: { kind: SemanticTransitionKind.InternalOperation, operationId: operation.id,
            operationKind: operation.kind, origin: operation.origin, owner },
          positionDelta,
        },
        lifecycle: { started: [{ anchor, processId, elementId: operation.origin.elementId, owner }], ended: [] },
      },
    };
}
