import {
  candidateOperationOccurrence,
  candidateProcessId,
  operationIsSelectedFromProgram,
} from "./flow-node-occurrence-candidates.js";
import {
  FlowNodeOccurrenceTerminalKind,
} from "./flow-node-occurrence-lifecycle.js";
import type { PublicControlTokenPosition } from "./control-position-projection.js";
import {
  InternalPublicationTemplateAnchorKind,
} from "./internal-publication-template.js";
import type {
  InternalPublicationTemplate,
} from "./internal-publication-template.js";
import { internalOperationAlternative } from "./internal-transition-alternative.js";
import type { InternalOperationAlternative } from "./internal-transition-alternative.js";
import { canonicalUniqueStateAtoms } from "./internal-transition-footprint-ordering.js";
import type { InternalTransitionStateFootprint } from "./internal-transition-footprint.js";
import { InternalTransitionStateAtomKind } from "./internal-transition-footprint-vocabulary.js";
import type { InternalInitiationPatch } from "./internal-transition-initiation-patch.js";
import { affectedTokenBucketsAreExact } from "./internal-transition-token-preparation.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type {
  SemanticOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import { ControlStateKind } from "./semantic-process-state.js";
import type {
  RuntimeState,
  ScopeOccurrenceId,
} from "./semantic-process-state.js";
import type { SemanticTransitionKind } from "./semantic-transition-trace.js";
import { compareCanonicalStrings } from "./wire.js";

const InternalOperationTransitionKind =
  "internalOperation" as SemanticTransitionKind.InternalOperation;

export type InternalInitiationOperation = Extract<
  SemanticOperation,
  {
    kind:
      | SemanticOperationKind.Initiate
      | SemanticOperationKind.InitiateMessage
      | SemanticOperationKind.InitiateTimer;
  }
>;

export type SelectedInternalInitiation = Readonly<{
  owner: ScopeOccurrenceId;
  outputs: ReadonlyArray<string>;
}>;

export type PreparedInternalInitiation = Readonly<{
  alternative: InternalOperationAlternative;
  owner: ScopeOccurrenceId;
  outputs: ReadonlyArray<string>;
  patch: InternalInitiationPatch;
  footprint: InternalTransitionStateFootprint;
  publicationTemplate: InternalPublicationTemplate;
}>;

/** Selects the only structurally valid Process initiation from its exact pending root. */
export function selectInternalInitiation(
  program: SemanticProcessProgram,
  state: RuntimeState,
  operation: InternalInitiationOperation,
): SelectedInternalInitiation | null {
  const initiations = program.operations.filter(isInitiationOperation);
  const roots = state.scopeOccurrences.filter(({ parent }) => parent === null);
  const root = roots[0];
  const outputs = initiationOutputs(operation);
  if (
    state.control.kind !== ControlStateKind.Running ||
    !state.initiationPending ||
    initiations.length !== 1 ||
    root === undefined ||
    roots.length !== 1 ||
    root.id.processInstanceId !== state.control.instanceId ||
    !operationIsSelectedFromProgram(program, operation, root.id) ||
    candidateProcessId(program, state, root.id) !== program.processId ||
    !affectedTokenBucketsAreExact(state, root.id, [], outputs)
  ) {
    return null;
  }
  return { owner: root.id, outputs };
}

/** Derives the exact initiation flag, root, output-token, and publication-time reads. */
export function deriveInternalInitiationPreparation(
  program: SemanticProcessProgram,
  state: RuntimeState,
  operation: InternalInitiationOperation,
): PreparedInternalInitiation | null {
  const selected = selectInternalInitiation(program, state, operation);
  if (selected === null) {
    return null;
  }
  const occurrence = candidateOperationOccurrence(
    program,
    state,
    operation,
    selected.owner,
  );
  const outputPositions = selectedOutputPositions(
    program,
    selected.owner,
    selected.outputs,
  );
  if (occurrence === null || outputPositions === null) {
    return null;
  }
  const outputTokens = selected.outputs.map((placeId) => ({
    kind: InternalTransitionStateAtomKind.ControlToken,
    owner: selected.owner,
    placeId,
  }) as const);
  const initiationPending = {
    kind: InternalTransitionStateAtomKind.InitiationPending,
  } as const;
  const reads = canonicalUniqueStateAtoms([
    {
      kind: InternalTransitionStateAtomKind.RuntimeControl,
      instanceId: selected.owner.processInstanceId,
    },
    initiationPending,
    {
      kind: InternalTransitionStateAtomKind.ScopeOccurrence,
      owner: selected.owner,
    },
    {
      kind: InternalTransitionStateAtomKind.ScopeParent,
      occurrence: selected.owner,
      parent: null,
    },
    ...outputTokens,
    { kind: InternalTransitionStateAtomKind.LogicalTime },
  ]);
  const writes = canonicalUniqueStateAtoms([
    initiationPending,
    ...outputTokens,
  ]);
  const alternative = internalOperationAlternative(operation.id);
  return reads === null || writes === null
    ? null
    : {
      alternative,
      owner: selected.owner,
      outputs: selected.outputs,
      patch: {
        owner: selected.owner,
        outputs: selected.outputs,
      },
      footprint: { reads, writes },
      publicationTemplate: {
        alternative,
        record: {
          logicalTimeMs: state.logicalTimeMs,
          transition: {
            kind: InternalOperationTransitionKind,
            operationId: operation.id,
            operationKind: operation.kind,
            origin: operation.origin,
            owner: selected.owner,
          },
          positionDelta: {
            consumedTokens: [],
            producedTokens: outputPositions,
            enteredScopes: [],
            exitedScopes: [],
          },
        },
        lifecycle: {
          started: [{
            anchor: {
              kind: InternalPublicationTemplateAnchorKind.TransitionTemplate,
              processId: occurrence.processId,
              elementId: occurrence.elementId,
              owner: occurrence.owner,
            },
            processId: occurrence.processId,
            elementId: occurrence.elementId,
            owner: occurrence.owner,
          }],
          ended: [{
            anchor: {
              kind: InternalPublicationTemplateAnchorKind.TransitionTemplate,
              processId: occurrence.processId,
              elementId: occurrence.elementId,
              owner: occurrence.owner,
            },
            terminal: FlowNodeOccurrenceTerminalKind.Completed,
          }],
        },
      },
    };
}

function initiationOutputs(
  operation: InternalInitiationOperation,
): ReadonlyArray<string> {
  switch (operation.kind) {
    case SemanticOperationKind.Initiate:
      return [operation.output];
    case SemanticOperationKind.InitiateMessage:
    case SemanticOperationKind.InitiateTimer:
      return operation.outputs;
    default:
      return assertNever(operation);
  }
}

function isInitiationOperation(
  operation: SemanticOperation,
): operation is InternalInitiationOperation {
  switch (operation.kind) {
    case SemanticOperationKind.Initiate:
    case SemanticOperationKind.InitiateMessage:
    case SemanticOperationKind.InitiateTimer:
      return true;
    default:
      return false;
  }
}

function only<Value>(values: ReadonlyArray<Value>): Value | undefined {
  return values.length === 1 ? values[0] : undefined;
}

function selectedOutputPositions(
  program: SemanticProcessProgram,
  owner: ScopeOccurrenceId,
  outputs: ReadonlyArray<string>,
): ReadonlyArray<PublicControlTokenPosition> | null {
  const positions: PublicControlTokenPosition[] = [];
  for (const placeId of outputs) {
    const place = only(program.controlPlaces.filter(({ id }) => id === placeId));
    if (
      place === undefined ||
      positions.some(({ sequenceFlowId }) =>
        sequenceFlowId === place.origin.elementId
      )
    ) {
      return null;
    }
    positions.push({
      sequenceFlowId: place.origin.elementId,
      owner,
      multiplicity: 1,
    });
  }
  return positions.sort((left, right) =>
    compareCanonicalStrings(left.sequenceFlowId, right.sequenceFlowId)
  );
}

function assertNever(value: never): never {
  throw new Error(`unhandled initiation operation: ${JSON.stringify(value)}`);
}
