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
import { affectedTokenBucketsAreExact } from "./internal-transition-token-preparation.js";
import {
  InternalOccurrenceKind,
  openWaitAnchorIsAbsent,
  operationIsUniqueWaitDeclarer,
} from "./internal-transition-wait-census.js";
import {
  eventRaceAssociationsAreValid,
  selectEventRaceArming,
} from "./semantic-process-event-race-runtime.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type {
  SemanticOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import { onlyTokenOwner } from "./semantic-process-scope-runtime.js";
import {
  ControlStateKind,
  sameOccurrence,
  sameScopeOccurrence,
} from "./semantic-process-state.js";
import type {
  EventRace,
  RuntimeState,
  ScopeOccurrenceId,
} from "./semantic-process-state.js";

export type PreparedInternalEventRace = Readonly<{
  alternative: InternalOperationAlternative;
  owner: ScopeOccurrenceId;
  race: EventRace;
  messageWait: RuntimeState["messageWaits"][number];
  timerWait: RuntimeState["timerWaits"][number];
  footprint: InternalTransitionStateFootprint;
}>;

/** Derives one complete Event-Based Gateway race arming without applying it. */
export function deriveInternalEventRacePreparation(
  program: SemanticProcessProgram,
  state: RuntimeState,
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.AwaitEventRace }
  >,
): PreparedInternalEventRace | null {
  const owner = onlyTokenOwner(state, operation.input);
  if (owner === undefined) {
    return null;
  }
  const selected = selectEventRaceArming(operation, state, owner);
  if (
    selected === null ||
    !Number.isSafeInteger(selected.race.id.activation) ||
    selected.race.id.activation <= 0 ||
    !Number.isSafeInteger(selected.messageWait.id.activation) ||
    selected.messageWait.id.activation <= 0 ||
    !Number.isSafeInteger(selected.timerWait.id.activation) ||
    selected.timerWait.id.activation <= 0 ||
    state.control.kind !== ControlStateKind.Running ||
    state.scopeOccurrences.filter(({ id }) =>
      sameScopeOccurrence(id, owner)
    ).length !== 1 ||
    !operationIsSelectedFromProgram(program, operation, owner) ||
    candidateProcessId(program, state, owner) === null ||
    !affectedTokenBucketsAreExact(state, owner, [operation.input], []) ||
    !operationIsUniqueWaitDeclarer(
      program,
      operation,
      InternalOccurrenceKind.Message,
      operation.message.elementId,
    ) ||
    !operationIsUniqueWaitDeclarer(
      program,
      operation,
      InternalOccurrenceKind.Timer,
      operation.timer.elementId,
    ) ||
    !eventRaceAssociationsAreValid(state) ||
    state.eventRaces.some(({ id }) => sameOccurrence(id, selected.race.id)) ||
    !openWaitAnchorIsAbsent(state, selected.messageWait.id) ||
    !openWaitAnchorIsAbsent(state, selected.timerWait.id)
  ) {
    return null;
  }

  const inputToken = {
    kind: InternalTransitionStateAtomKind.ControlToken,
    owner,
    placeId: operation.input,
  } as const;
  const raceAssociation = {
    kind: InternalTransitionStateAtomKind.EventRaceAssociation,
    record: selected.race,
  } as const;
  const activationAtoms = [
    activationAtom(InternalOccurrenceKind.EventRace, operation.origin.elementId),
    activationAtom(InternalOccurrenceKind.Message, operation.message.elementId),
    activationAtom(InternalOccurrenceKind.Timer, operation.timer.elementId),
  ];
  const waitAtoms = [
    waitAtom(InternalOccurrenceKind.Message, selected.messageWait.id, owner),
    waitAtom(InternalOccurrenceKind.Timer, selected.timerWait.id, owner),
  ];
  const anchorAtoms = [
    openWaitAnchorAtom(selected.messageWait.id, owner),
    openWaitAnchorAtom(selected.timerWait.id, owner),
  ];
  const writes = canonicalUniqueStateAtoms([
    inputToken,
    raceAssociation,
    ...activationAtoms,
    ...waitAtoms,
    ...anchorAtoms,
  ]);
  const reads = canonicalUniqueStateAtoms([
    {
      kind: InternalTransitionStateAtomKind.RuntimeControl,
      instanceId: state.control.instanceId,
    },
    { kind: InternalTransitionStateAtomKind.ScopeOccurrence, owner },
    { kind: InternalTransitionStateAtomKind.LogicalTime },
    inputToken,
    raceAssociation,
    ...activationAtoms,
    ...waitAtoms,
    ...anchorAtoms,
  ]);
  return reads === null || writes === null
    ? null
    : {
        alternative: internalOperationAlternative(operation.id),
        owner,
        ...selected,
        footprint: { reads, writes },
      };
}

function activationAtom(
  occurrenceKind: InternalOccurrenceKind,
  elementId: string,
): InternalTransitionStateAtom {
  return {
    kind: InternalTransitionStateAtomKind.Activation,
    occurrenceKind,
    elementId,
  };
}

function waitAtom(
  kind: InternalOccurrenceKind.Message | InternalOccurrenceKind.Timer,
  id: RuntimeState["messageWaits"][number]["id"],
  owner: ScopeOccurrenceId,
): InternalTransitionStateAtom {
  return {
    kind: InternalTransitionStateAtomKind.Wait,
    occurrence: { kind, id },
    owner,
  };
}

function openWaitAnchorAtom(
  occurrence: RuntimeState["messageWaits"][number]["id"],
  owner: ScopeOccurrenceId,
): InternalTransitionStateAtom {
  return {
    kind: InternalTransitionStateAtomKind.OpenWaitAnchor,
    occurrence,
    owner,
  };
}
