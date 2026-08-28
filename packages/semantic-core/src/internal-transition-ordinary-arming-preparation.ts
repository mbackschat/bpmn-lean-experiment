import {
  candidateProcessId,
} from "./flow-node-occurrence-candidates.js";
import {
  InternalPublicationTemplateAnchorKind,
} from "./internal-publication-template.js";
import type {
  InternalPublicationTemplate,
} from "./internal-publication-template.js";
import {
  internalOperationAlternative,
} from "./internal-transition-alternative.js";
import type {
  InternalOperationAlternative,
} from "./internal-transition-alternative.js";
import {
  deriveInternalTransitionFootprint,
  InternalTransitionPublicationAtomKind,
} from "./internal-transition-footprint.js";
import type {
  InternalTransitionCandidate,
  InternalTransitionFootprint,
  InternalTransitionPublicationAtom,
} from "./internal-transition-footprint.js";
import {
  InternalOccurrenceKind,
} from "./internal-transition-wait-census.js";
import {
  SemanticOperationKind,
} from "./semantic-process-contract.js";
import type {
  SemanticOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import {
  sameOccurrence,
  sameScopeOccurrence,
} from "./semantic-process-state.js";
import type {
  RuntimeState,
  ScopeOccurrenceId,
} from "./semantic-process-state.js";
import type {
  SemanticTransitionKind,
} from "./semantic-transition-trace.js";

const InternalOperationTransitionKind =
  "internalOperation" as SemanticTransitionKind.InternalOperation;

export type InternalOrdinaryArmingOperation = Extract<
  SemanticOperation,
  {
    kind:
      | SemanticOperationKind.AwaitUserTask
      | SemanticOperationKind.AwaitMessage
      | SemanticOperationKind.AwaitTimer
      | SemanticOperationKind.AwaitEffect;
  }
>;

export type PreparedInternalOrdinaryArming = Readonly<{
  alternative: InternalOperationAlternative;
  operation: InternalOrdinaryArmingOperation;
  owner: ScopeOccurrenceId;
  footprint: InternalTransitionFootprint;
  publicationTemplate: InternalPublicationTemplate;
}>;

/** Derives one ordinary wait arm and its complete numbering-free publication from the exact pre-state. */
export function deriveInternalOrdinaryArmingPreparation(
  program: SemanticProcessProgram,
  state: RuntimeState,
  candidate: InternalTransitionCandidate,
): PreparedInternalOrdinaryArming | null {
  const operation = ordinaryArmingOperation(candidate.operation);
  const owner = candidate.owner;
  if (operation === null || owner === null) {
    return null;
  }
  const footprint = deriveInternalTransitionFootprint(program, state, candidate);
  const processId = candidateProcessId(program, state, owner);
  if (footprint === null || processId === null) {
    return null;
  }
  const committed = only(footprint.publications.filter(isCommittedTransition));
  const lifecycle = only(footprint.publications.filter(isFlowNodeLifecycle));
  const pair = only(footprint.publications.filter(isPublicationPair));
  if (
    committed === undefined ||
    lifecycle === undefined ||
    pair === undefined ||
    committed.operationId !== operation.id ||
    committed.operationKind !== operation.kind ||
    !sameScopeOccurrence(committed.owner, owner) ||
    pair.operationId !== operation.id ||
    pair.occurrence.kind !== occurrenceKind(operation) ||
    !sameOccurrence(pair.occurrence.id, lifecycle.occurrence)
  ) {
    return null;
  }
  const alternative = internalOperationAlternative(operation.id);
  return {
    alternative,
    operation,
    owner,
    footprint,
    publicationTemplate: {
      alternative,
      record: {
        logicalTimeMs: committed.logicalTimeMs,
        transition: {
          kind: InternalOperationTransitionKind,
          operationId: committed.operationId,
          operationKind: committed.operationKind,
          origin: committed.origin,
          owner: committed.owner,
        },
        positionDelta: committed.positionDelta,
      },
      lifecycle: {
        started: [{
          anchor: {
            kind: InternalPublicationTemplateAnchorKind.Wait,
            id: pair.occurrence.id,
          },
          processId,
          elementId: pair.occurrence.id.elementId,
          owner,
        }],
        ended: [],
      },
    },
  };
}

function ordinaryArmingOperation(
  operation: SemanticOperation,
): InternalOrdinaryArmingOperation | null {
  switch (operation.kind) {
    case SemanticOperationKind.AwaitUserTask:
    case SemanticOperationKind.AwaitMessage:
    case SemanticOperationKind.AwaitTimer:
    case SemanticOperationKind.AwaitEffect:
      return operation;
    default:
      return null;
  }
}

function occurrenceKind(
  operation: InternalOrdinaryArmingOperation,
): InternalOccurrenceKind {
  switch (operation.kind) {
    case SemanticOperationKind.AwaitUserTask:
      return InternalOccurrenceKind.UserTask;
    case SemanticOperationKind.AwaitMessage:
      return InternalOccurrenceKind.Message;
    case SemanticOperationKind.AwaitTimer:
      return InternalOccurrenceKind.Timer;
    case SemanticOperationKind.AwaitEffect:
      return InternalOccurrenceKind.Effect;
    default:
      return assertNever(operation);
  }
}

function only<Value>(values: ReadonlyArray<Value>): Value | undefined {
  return values.length === 1 ? values[0] : undefined;
}

function isCommittedTransition(
  atom: InternalTransitionPublicationAtom,
): atom is Extract<
  InternalTransitionPublicationAtom,
  { kind: InternalTransitionPublicationAtomKind.CommittedTransition }
> {
  return atom.kind === InternalTransitionPublicationAtomKind.CommittedTransition;
}

function isFlowNodeLifecycle(
  atom: InternalTransitionPublicationAtom,
): atom is Extract<
  InternalTransitionPublicationAtom,
  { kind: InternalTransitionPublicationAtomKind.FlowNodeLifecycle }
> {
  return atom.kind === InternalTransitionPublicationAtomKind.FlowNodeLifecycle;
}

function isPublicationPair(
  atom: InternalTransitionPublicationAtom,
): atom is Extract<
  InternalTransitionPublicationAtom,
  { kind: InternalTransitionPublicationAtomKind.PublicationPair }
> {
  return atom.kind === InternalTransitionPublicationAtomKind.PublicationPair;
}

function assertNever(value: never): never {
  throw new Error(`unhandled ordinary arming operation: ${JSON.stringify(value)}`);
}
