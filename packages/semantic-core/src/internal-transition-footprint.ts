import type { OccurrenceId } from "./contract.js";
import type { PublicControlPositionDelta } from "./control-position-projection.js";
import { candidateProcessId, operationIsSelectedFromProgram } from "./flow-node-occurrence-candidates.js";
import {
  canonicalUniquePublicationAtoms,
  canonicalUniqueStateAtoms,
  publicationSetsAreDisjoint,
  stateSetsAreDisjoint,
} from "./internal-transition-footprint-ordering.js";
export {
  compareInternalTransitionPublicationSortKeys,
} from "./internal-transition-footprint-ordering.js";
import {
  InternalTransitionPublicationAtomKind,
  InternalTransitionStateAtomKind,
} from "./internal-transition-footprint-vocabulary.js";
export {
  InternalTransitionPublicationAtomKind,
  InternalTransitionStateAtomKind,
} from "./internal-transition-footprint-vocabulary.js";
import {
  InternalOccurrenceKind,
  openWaitAnchorIsAbsent,
  operationIsUniqueWaitDeclarer,
} from "./internal-transition-wait-census.js";
export { InternalOccurrenceKind } from "./internal-transition-wait-census.js";
import type { InternalOccurrenceRegion } from "./internal-transition-region.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type {
  BpmnElementOrigin,
  SemanticOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import { ControlStateKind, sameOccurrence, sameScopeOccurrence } from "./semantic-process-state.js";
import type {
  CalledProcessOccurrence,
  RuntimeState,
  ScopeOccurrenceId,
} from "./semantic-process-state.js";
import { MappingExpressionKind } from "./semantic-value-contract.js";

export type InternalOccurrence = Readonly<{
  kind: InternalOccurrenceKind;
  id: OccurrenceId;
}>;

export type InternalTransitionStateAtom = Readonly<
  | {
      kind: InternalTransitionStateAtomKind.Activation;
      occurrenceKind: InternalOccurrenceKind;
      elementId: string;
    }
  | {
      kind: InternalTransitionStateAtomKind.ActivityVariable;
      occurrence: InternalOccurrence;
      owner: ScopeOccurrenceId;
      name: string;
    }
  | {
      kind: InternalTransitionStateAtomKind.ActivityVariableScope;
      occurrence: InternalOccurrence;
      owner: ScopeOccurrenceId;
    }
  | {
      kind: InternalTransitionStateAtomKind.CallAssociation;
      record: CalledProcessOccurrence;
    }
  | {
      kind: InternalTransitionStateAtomKind.ControlToken;
      owner: ScopeOccurrenceId;
      placeId: string;
    }
  | { kind: InternalTransitionStateAtomKind.LogicalTime }
  | {
      kind: InternalTransitionStateAtomKind.OccurrenceRegion;
      region: InternalOccurrenceRegion;
    }
  | {
      kind: InternalTransitionStateAtomKind.OpenWaitAnchor;
      occurrence: OccurrenceId;
      owner: ScopeOccurrenceId;
    }
  | {
      kind: InternalTransitionStateAtomKind.RuntimeControl;
      instanceId: string;
    }
  | {
      kind: InternalTransitionStateAtomKind.ScopeOccurrence;
      owner: ScopeOccurrenceId;
    }
  | {
      kind: InternalTransitionStateAtomKind.ScopeParent;
      occurrence: ScopeOccurrenceId;
      parent: ScopeOccurrenceId | null;
    }
  | {
      kind: InternalTransitionStateAtomKind.Wait;
      occurrence: InternalOccurrence;
      owner: ScopeOccurrenceId;
    }
>;

export type InternalTransitionPublicationAtom = Readonly<
  | {
      kind: InternalTransitionPublicationAtomKind.CommittedTransition;
      operationId: string;
      operationKind: SemanticOperationKind;
      origin: BpmnElementOrigin;
      owner: ScopeOccurrenceId;
      logicalTimeMs: number;
      positionDelta: PublicControlPositionDelta;
    }
  | {
      kind: InternalTransitionPublicationAtomKind.FlowNodeLifecycle;
      occurrence: OccurrenceId;
    }
  | {
      kind: InternalTransitionPublicationAtomKind.PublicationPair;
      operationId: string;
      occurrence: InternalOccurrence;
    }
>;

export type InternalTransitionPublicationSortKey = Readonly<{
  operationId: string;
  occurrenceKind: InternalOccurrenceKind;
  processInstanceId: string;
  elementId: string;
  activation: number;
}>;

export type InternalTransitionFootprint = Readonly<{
  reads: ReadonlyArray<InternalTransitionStateAtom>;
  writes: ReadonlyArray<InternalTransitionStateAtom>;
  publications: ReadonlyArray<InternalTransitionPublicationAtom>;
  publicationSortKey: InternalTransitionPublicationSortKey;
}>;

export type InternalTransitionCandidate = Readonly<{
  operation: SemanticOperation;
  owner: ScopeOccurrenceId | null;
}>;

/** Derives the reviewed semantic footprint without consulting any successor state. */
export function deriveInternalTransitionFootprint(
  program: SemanticProcessProgram,
  state: RuntimeState,
  candidate: InternalTransitionCandidate,
): InternalTransitionFootprint | null {
  const owner = candidate.owner;
  const operation = candidate.operation;
  if (
    owner === null ||
    state.control.kind !== ControlStateKind.Running ||
    !operationIsSelectedFromProgram(program, operation, owner) ||
    candidateProcessId(program, state, owner) === null ||
    state.scopeOccurrences.filter(({ id }) =>
        sameScopeOccurrence(id, owner)
      ).length !== 1
  ) {
    return null;
  }

  switch (operation.kind) {
    case SemanticOperationKind.AwaitUserTask:
      return waitFootprint(
        program,
        state,
        operation,
        owner,
        state.control.instanceId,
        InternalOccurrenceKind.UserTask,
        operation.task.elementId,
        state.taskActivations,
        state.userTaskWaits.map(({ id }) => id),
        [],
      );
    case SemanticOperationKind.AwaitMessage:
      return waitFootprint(
        program,
        state,
        operation,
        owner,
        state.control.instanceId,
        InternalOccurrenceKind.Message,
        operation.message.elementId,
        state.messageActivations,
        state.messageWaits.map(({ id }) => id),
        [],
      );
    case SemanticOperationKind.AwaitTimer:
      return waitFootprint(
        program,
        state,
        operation,
        owner,
        state.control.instanceId,
        InternalOccurrenceKind.Timer,
        operation.timer.elementId,
        state.timerActivations,
        state.timerWaits.map(({ id }) => id),
        [{ kind: InternalTransitionStateAtomKind.LogicalTime }],
      );
    case SemanticOperationKind.AwaitEffect: {
      const inputNames: string[] = [];
      for (const mapping of operation.effect.inputMappings) {
        switch (mapping.expression.kind) {
          case MappingExpressionKind.StringLiteral:
            inputNames.push(mapping.target);
            break;
          case MappingExpressionKind.LocalVariable:
            return null;
          default:
            return assertNever(mapping.expression);
        }
      }
      return waitFootprint(
        program,
        state,
        operation,
        owner,
        state.control.instanceId,
        InternalOccurrenceKind.Effect,
        operation.effect.elementId,
        state.effectActivations,
        state.effectWaits.map(({ id }) => id),
        [],
        owner.processInstanceId,
        inputNames,
      );
    }
    case SemanticOperationKind.Initiate:
    case SemanticOperationKind.InitiateMessage:
    case SemanticOperationKind.InitiateTimer:
    case SemanticOperationKind.EnterScope:
    case SemanticOperationKind.EnterBoundedScope:
    case SemanticOperationKind.InvokeProcess:
    case SemanticOperationKind.ReturnProcess:
    case SemanticOperationKind.AwaitSequentialMultiInstanceUserTask:
    case SemanticOperationKind.AwaitParallelMultiInstanceUserTask:
    case SemanticOperationKind.CompleteParallelMultiInstanceUserTask:
    case SemanticOperationKind.AwaitBoundedUserTask:
    case SemanticOperationKind.AwaitMonitoredUserTask:
    case SemanticOperationKind.Duplicate:
    case SemanticOperationKind.Synchronize:
    case SemanticOperationKind.MergeExclusive:
    case SemanticOperationKind.Choose:
    case SemanticOperationKind.SelectMany:
    case SemanticOperationKind.SynchronizeSelected:
    case SemanticOperationKind.AwaitEventRace:
    case SemanticOperationKind.ThrowError:
    case SemanticOperationKind.TerminateScope:
    case SemanticOperationKind.ReachNoneEnd:
    case SemanticOperationKind.CompleteScope:
      return null;
    default:
      return assertNever(operation);
  }
}

/** The reviewed write/read, write/write, and publication-key equation. */
export function internalTransitionFootprintsAreIndependent(
  left: InternalTransitionFootprint,
  right: InternalTransitionFootprint,
): boolean {
  return stateSetsAreDisjoint(left.writes, right.reads) &&
    stateSetsAreDisjoint(left.writes, right.writes) &&
    stateSetsAreDisjoint(right.writes, left.reads) &&
    stateSetsAreDisjoint(right.writes, left.writes) &&
    publicationSetsAreDisjoint(left.publications, right.publications);
}

/** Classifies only the complete exact-two enabled frontier. */
export function internalOperationPairIsIndependent(
  program: SemanticProcessProgram,
  state: RuntimeState,
  candidates: ReadonlyArray<InternalTransitionCandidate>,
): boolean {
  return candidates.length === 2 &&
    internalOperationFrontierIsPairwiseIndependent(program, state, candidates);
}

/** Classifies a complete finite frontier through all pairwise footprint equations. */
export function internalOperationFrontierIsPairwiseIndependent(
  program: SemanticProcessProgram,
  state: RuntimeState,
  candidates: ReadonlyArray<InternalTransitionCandidate>,
): boolean {
  if (candidates.length < 2) {
    return false;
  }
  const footprints = candidates.map((candidate) =>
    deriveInternalTransitionFootprint(program, state, candidate)
  );
  if (footprints.some((footprint) => footprint === null)) {
    return false;
  }
  for (let leftIndex = 0; leftIndex < footprints.length; leftIndex += 1) {
    const left = footprints[leftIndex];
    if (left === null || left === undefined) {
      return false;
    }
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < footprints.length;
      rightIndex += 1
    ) {
      const right = footprints[rightIndex];
      if (
        right === null ||
        right === undefined ||
        !internalTransitionFootprintsAreIndependent(left, right)
      ) {
        return false;
      }
    }
  }
  return true;
}

function waitFootprint(
  program: SemanticProcessProgram,
  state: RuntimeState,
  operation: Extract<
    SemanticOperation,
    {
      kind:
        | SemanticOperationKind.AwaitUserTask
        | SemanticOperationKind.AwaitMessage
        | SemanticOperationKind.AwaitTimer
        | SemanticOperationKind.AwaitEffect;
    }
  >,
  owner: ScopeOccurrenceId,
  runtimeInstanceId: string,
  occurrenceKind: InternalOccurrenceKind,
  elementId: string,
  counters: ReadonlyArray<Readonly<{ elementId: string; count: number }>>,
  waits: ReadonlyArray<OccurrenceId>,
  additionalReads: ReadonlyArray<InternalTransitionStateAtom>,
  processInstanceId: string = owner.processInstanceId,
  activityVariableNames: ReadonlyArray<string> = [],
): InternalTransitionFootprint | null {
  const matchingTokens = state.controlTokens.filter(({ placeId, multiplicity }) =>
    placeId === operation.input && multiplicity > 0
  );
  const inputPlaces = program.controlPlaces.filter(({ id }) =>
    id === operation.input
  );
  const inputOwners = program.controlPlaceScopes.filter(({ controlPlaceId }) =>
    controlPlaceId === operation.input
  );
  const activation =
    (counters.find((counter) => counter.elementId === elementId)?.count ?? 0) + 1;
  if (
    matchingTokens.length !== 1 ||
    !sameScopeOccurrence(matchingTokens[0]!.owner, owner) ||
    inputPlaces.length !== 1 ||
    inputOwners.length !== 1 ||
    inputOwners[0]?.scopeId !== owner.definitionScopeId ||
    !Number.isSafeInteger(activation) ||
    activation <= 0 ||
    !operationIsUniqueWaitDeclarer(
      program,
      operation,
      occurrenceKind,
      elementId,
    )
  ) {
    return null;
  }
  const occurrence = {
    kind: occurrenceKind,
    id: { processInstanceId, elementId, activation },
  } as const;
  if (
    waits.some((wait) => sameOccurrence(wait, occurrence.id)) ||
    !openWaitAnchorIsAbsent(state, occurrence.id)
  ) {
    return null;
  }
  const activityScope = {
    kind: InternalTransitionStateAtomKind.ActivityVariableScope,
    occurrence,
    owner,
  } as const;
  if (
    occurrenceKind === InternalOccurrenceKind.Effect &&
    state.variables.activities.some(({ owner: candidate }) =>
      sameOccurrence(candidate, occurrence.id)
    )
  ) {
    return null;
  }

  const controlToken = {
    kind: InternalTransitionStateAtomKind.ControlToken,
    owner,
    placeId: operation.input,
  } as const;
  const activationAtom = {
    kind: InternalTransitionStateAtomKind.Activation,
    occurrenceKind,
    elementId,
  } as const;
  const wait = {
    kind: InternalTransitionStateAtomKind.Wait,
    occurrence,
    owner,
  } as const;
  const openWaitAnchor = {
    kind: InternalTransitionStateAtomKind.OpenWaitAnchor,
    occurrence: occurrence.id,
    owner,
  } as const;
  const effectWrites: InternalTransitionStateAtom[] = occurrenceKind ===
      InternalOccurrenceKind.Effect
    ? [
        activityScope,
        ...activityVariableNames.map((name) => ({
          kind: InternalTransitionStateAtomKind.ActivityVariable,
          occurrence,
          owner,
          name,
        } as const)),
      ]
    : [];
  const reads = canonicalUniqueStateAtoms([
    {
      kind: InternalTransitionStateAtomKind.RuntimeControl,
      instanceId: runtimeInstanceId,
    },
    { kind: InternalTransitionStateAtomKind.ScopeOccurrence, owner },
    controlToken,
    activationAtom,
    wait,
    openWaitAnchor,
    ...additionalReads,
    ...(occurrenceKind === InternalOccurrenceKind.Effect ? [activityScope] : []),
  ]);
  const writes = canonicalUniqueStateAtoms([
    controlToken,
    activationAtom,
    wait,
    openWaitAnchor,
    ...effectWrites,
  ]);
  const positionDelta: PublicControlPositionDelta = {
    consumedTokens: [{
      sequenceFlowId: inputPlaces[0]!.origin.elementId,
      owner,
      multiplicity: 1,
    }],
    producedTokens: [],
    enteredScopes: [],
    exitedScopes: [],
  };
  const publications = canonicalUniquePublicationAtoms([
    {
      kind: InternalTransitionPublicationAtomKind.CommittedTransition,
      operationId: operation.id,
      operationKind: operation.kind,
      origin: operation.origin,
      owner,
      logicalTimeMs: state.logicalTimeMs,
      positionDelta,
    },
    {
      kind: InternalTransitionPublicationAtomKind.FlowNodeLifecycle,
      occurrence: occurrence.id,
    },
    {
      kind: InternalTransitionPublicationAtomKind.PublicationPair,
      operationId: operation.id,
      occurrence,
    },
  ]);
  return reads === null || writes === null || publications === null
    ? null
    : {
        reads,
        writes,
        publications,
        publicationSortKey: {
          operationId: operation.id,
          occurrenceKind,
          processInstanceId,
          elementId,
          activation,
        },
      };
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported internal transition variant: ${JSON.stringify(value)}`);
}
