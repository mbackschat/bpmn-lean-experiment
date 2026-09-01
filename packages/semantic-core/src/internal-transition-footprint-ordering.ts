import type { OccurrenceId } from "./contract.js";
import {
  ActivityBodyKind,
  sameActivityOccurrence,
} from "./activity-occurrence.js";
import type { ActivityOccurrence } from "./activity-occurrence.js";
import type { PublicControlPositionDelta } from "./control-position-projection.js";
import type {
  InternalOccurrence,
  InternalTransitionPublicationAtom,
  InternalTransitionPublicationSortKey,
  InternalTransitionStateAtom,
} from "./internal-transition-footprint.js";
import {
  InternalTransitionPublicationAtomKind,
  InternalTransitionStateAtomKind,
} from "./internal-transition-footprint-vocabulary.js";
import {
  activityAssociationsConflict,
} from "./internal-transition-activity-association.js";
import {
  internalOccurrenceRegionContains,
  internalOccurrenceRegionOwnsActivity,
  internalOccurrenceRegionOwnsCall,
  internalOccurrenceRegionsOverlap,
} from "./internal-transition-region.js";
import type { InternalOccurrenceRegion } from "./internal-transition-region.js";
import type {
  CalledProcessOccurrence,
  EventRace,
  ScopeOccurrenceId,
} from "./semantic-process-state.js";
import { sameOccurrence } from "./semantic-process-state.js";
import { compareCanonicalStrings } from "./wire.js";

export function canonicalUniqueStateAtoms(
  atoms: ReadonlyArray<InternalTransitionStateAtom>,
): ReadonlyArray<InternalTransitionStateAtom> | null {
  return canonicalUnique(atoms, compareStateAtoms);
}

export function canonicalUniquePublicationAtoms(
  atoms: ReadonlyArray<InternalTransitionPublicationAtom>,
): ReadonlyArray<InternalTransitionPublicationAtom> | null {
  return canonicalUnique(atoms, comparePublicationAtoms);
}

export function stateSetsAreDisjoint(
  left: ReadonlyArray<InternalTransitionStateAtom>,
  right: ReadonlyArray<InternalTransitionStateAtom>,
): boolean {
  return left.every((leftAtom) =>
    right.every((rightAtom) => !stateAtomsConflict(leftAtom, rightAtom))
  );
}

export function publicationSetsAreDisjoint(
  left: ReadonlyArray<InternalTransitionPublicationAtom>,
  right: ReadonlyArray<InternalTransitionPublicationAtom>,
): boolean {
  return left.every((leftAtom) =>
    right.every((rightAtom) => comparePublicationAtoms(leftAtom, rightAtom) !== 0)
  );
}

export function compareInternalTransitionPublicationSortKeys(
  left: InternalTransitionPublicationSortKey,
  right: InternalTransitionPublicationSortKey,
): number {
  return compareParts([
    left.operationId,
    left.occurrenceKind,
    left.processInstanceId,
    left.elementId,
    left.activation,
  ], [
    right.operationId,
    right.occurrenceKind,
    right.processInstanceId,
    right.elementId,
    right.activation,
  ]);
}

function canonicalUnique<Value>(
  values: ReadonlyArray<Value>,
  compare: (left: Value, right: Value) => number,
): ReadonlyArray<Value> | null {
  const sorted = [...values].sort(compare);
  return sorted.some((value, index) =>
      index > 0 && compare(sorted[index - 1]!, value) === 0
    )
    ? null
    : sorted;
}

function compareStateAtoms(
  left: InternalTransitionStateAtom,
  right: InternalTransitionStateAtom,
): number {
  return compareParts(stateAtomParts(left), stateAtomParts(right));
}

function stateAtomParts(
  atom: InternalTransitionStateAtom,
): ReadonlyArray<string | number> {
  switch (atom.kind) {
    case InternalTransitionStateAtomKind.Activation:
      return [atom.kind, atom.occurrenceKind, atom.elementId];
    case InternalTransitionStateAtomKind.ActivityAssociation:
      return [atom.kind, ...activityAssociationParts(atom.record)];
    case InternalTransitionStateAtomKind.ActivityVariable:
      return [atom.kind, ...internalOccurrenceParts(atom.occurrence), atom.name];
    case InternalTransitionStateAtomKind.ActivityVariableScope:
    case InternalTransitionStateAtomKind.Wait:
      return [atom.kind, ...internalOccurrenceParts(atom.occurrence)];
    case InternalTransitionStateAtomKind.CallAssociation:
      return [atom.kind, ...callAssociationParts(atom.record)];
    case InternalTransitionStateAtomKind.CompensationActivityRetention:
      return [atom.kind, ...scopeParts(atom.owner)];
    case InternalTransitionStateAtomKind.CompensationParentContextCapacity:
      return [atom.kind];
    case InternalTransitionStateAtomKind.CompensationParentContextRetention:
      return [
        atom.kind,
        ...scopeParts(atom.parent.id),
        ...(atom.parent.parent === null
          ? ["no-parent"]
          : scopeParts(atom.parent.parent)),
      ];
    case InternalTransitionStateAtomKind.EventRaceAssociation:
      return [atom.kind, ...eventRaceAssociationParts(atom.record)];
    case InternalTransitionStateAtomKind.OccurrenceRegion:
      return [
        atom.kind,
        ...scopeParts(atom.region.root),
        atom.region.members.length,
        ...atom.region.members.flatMap(scopeParts),
      ];
    case InternalTransitionStateAtomKind.OpenWaitAnchor:
      return [atom.kind, ...occurrenceParts(atom.occurrence)];
    case InternalTransitionStateAtomKind.ParallelController:
      return [
        atom.kind,
        ...activityOccurrenceIdParts(atom.id),
        ...scopeParts(atom.owner),
      ];
    case InternalTransitionStateAtomKind.ParallelControllerSlot:
    case InternalTransitionStateAtomKind.ParallelControllerSnapshot:
      return [
        atom.kind,
        ...activityOccurrenceIdParts(atom.id),
        atom.index,
        ...scopeParts(atom.owner),
      ];
    case InternalTransitionStateAtomKind.ParallelControllersPresence:
      return [atom.kind];
    case InternalTransitionStateAtomKind.ProcessVariable:
      return [atom.kind, atom.name];
    case InternalTransitionStateAtomKind.ControlToken:
      return [atom.kind, ...scopeParts(atom.owner), atom.placeId];
    case InternalTransitionStateAtomKind.EndCount:
    case InternalTransitionStateAtomKind.EndIncrement:
    case InternalTransitionStateAtomKind.InitiationPending:
    case InternalTransitionStateAtomKind.LogicalTime:
      return [atom.kind];
    case InternalTransitionStateAtomKind.RuntimeControl:
      return [atom.kind, atom.instanceId];
    case InternalTransitionStateAtomKind.SelectedBranch:
      return [atom.kind, ...scopeParts(atom.owner), atom.selectionKey];
    case InternalTransitionStateAtomKind.SequentialController:
      return [
        atom.kind,
        ...activityOccurrenceIdParts(atom.id),
        ...scopeParts(atom.owner),
      ];
    case InternalTransitionStateAtomKind.SequentialControllerOutput:
    case InternalTransitionStateAtomKind.SequentialControllerSnapshot:
      return [
        atom.kind,
        ...activityOccurrenceIdParts(atom.id),
        atom.index,
        ...scopeParts(atom.owner),
      ];
    case InternalTransitionStateAtomKind.SequentialControllersPresence:
      return [atom.kind];
    case InternalTransitionStateAtomKind.ScopeOccurrence:
      return [atom.kind, ...scopeParts(atom.owner)];
    case InternalTransitionStateAtomKind.ScopeParent:
      return [
        atom.kind,
        ...scopeParts(atom.occurrence),
        ...(atom.parent === null ? ["no-parent"] : scopeParts(atom.parent)),
      ];
    default:
      return assertNever(atom);
  }
}

function stateAtomsConflict(
  left: InternalTransitionStateAtom,
  right: InternalTransitionStateAtom,
): boolean {
  if (
    left.kind === InternalTransitionStateAtomKind.EndIncrement &&
    right.kind === InternalTransitionStateAtomKind.EndIncrement
  ) {
    return false;
  }
  if (
    (left.kind === InternalTransitionStateAtomKind.EndIncrement &&
      right.kind === InternalTransitionStateAtomKind.EndCount) ||
    (left.kind === InternalTransitionStateAtomKind.EndCount &&
      right.kind === InternalTransitionStateAtomKind.EndIncrement)
  ) {
    return true;
  }
  if (
    left.kind === InternalTransitionStateAtomKind.ActivityAssociation &&
    right.kind === InternalTransitionStateAtomKind.ActivityAssociation
  ) {
    return activityAssociationsConflict(left.record, right.record);
  }
  if (isParallelControllerAtom(left) && isParallelControllerAtom(right)) {
    return controllerAtomsConflict(
      left,
      right,
      InternalTransitionStateAtomKind.ParallelController,
    );
  }
  if (
    left.kind === InternalTransitionStateAtomKind.EventRaceAssociation &&
    right.kind === InternalTransitionStateAtomKind.EventRaceAssociation
  ) {
    return sameOccurrence(left.record.id, right.record.id) ||
      sameOccurrence(
        left.record.messageSubscriptionId,
        right.record.messageSubscriptionId,
      ) ||
      sameOccurrence(
        left.record.timerOccurrenceId,
        right.record.timerOccurrenceId,
      );
  }
  if (isSequentialControllerAtom(left) && isSequentialControllerAtom(right)) {
    return controllerAtomsConflict(
      left,
      right,
      InternalTransitionStateAtomKind.SequentialController,
    );
  }
  if (compareStateAtoms(left, right) === 0) {
    return true;
  }
  if (left.kind === InternalTransitionStateAtomKind.OccurrenceRegion) {
    return occurrenceRegionConflictsWithAtom(left.region, right);
  }
  return right.kind === InternalTransitionStateAtomKind.OccurrenceRegion &&
    occurrenceRegionConflictsWithAtom(right.region, left);
}

function occurrenceRegionConflictsWithAtom(
  region: InternalOccurrenceRegion,
  atom: InternalTransitionStateAtom,
): boolean {
  switch (atom.kind) {
    case InternalTransitionStateAtomKind.OccurrenceRegion:
      return internalOccurrenceRegionsOverlap(region, atom.region);
    case InternalTransitionStateAtomKind.ActivityAssociation:
      return internalOccurrenceRegionOwnsActivity(region, atom.record);
    case InternalTransitionStateAtomKind.CallAssociation:
      return internalOccurrenceRegionOwnsCall(region, atom.record);
    case InternalTransitionStateAtomKind.EventRaceAssociation:
      return internalOccurrenceRegionContains(region, atom.record.owner);
    case InternalTransitionStateAtomKind.CompensationParentContextRetention:
      return internalOccurrenceRegionContains(region, atom.parent.id) ||
        (atom.parent.parent !== null &&
          internalOccurrenceRegionContains(region, atom.parent.parent));
    case InternalTransitionStateAtomKind.ScopeParent:
      return internalOccurrenceRegionContains(region, atom.occurrence) ||
        (atom.parent !== null &&
          internalOccurrenceRegionContains(region, atom.parent));
    case InternalTransitionStateAtomKind.ActivityVariable:
    case InternalTransitionStateAtomKind.ActivityVariableScope:
    case InternalTransitionStateAtomKind.CompensationActivityRetention:
    case InternalTransitionStateAtomKind.ControlToken:
    case InternalTransitionStateAtomKind.OpenWaitAnchor:
    case InternalTransitionStateAtomKind.ParallelController:
    case InternalTransitionStateAtomKind.ParallelControllerSlot:
    case InternalTransitionStateAtomKind.ParallelControllerSnapshot:
    case InternalTransitionStateAtomKind.SelectedBranch:
    case InternalTransitionStateAtomKind.SequentialController:
    case InternalTransitionStateAtomKind.SequentialControllerOutput:
    case InternalTransitionStateAtomKind.SequentialControllerSnapshot:
    case InternalTransitionStateAtomKind.ScopeOccurrence:
    case InternalTransitionStateAtomKind.Wait:
      return internalOccurrenceRegionContains(region, atom.owner);
    case InternalTransitionStateAtomKind.Activation:
    case InternalTransitionStateAtomKind.EndCount:
    case InternalTransitionStateAtomKind.EndIncrement:
    case InternalTransitionStateAtomKind.InitiationPending:
    case InternalTransitionStateAtomKind.LogicalTime:
    case InternalTransitionStateAtomKind.ParallelControllersPresence:
    case InternalTransitionStateAtomKind.CompensationParentContextCapacity:
    case InternalTransitionStateAtomKind.ProcessVariable:
    case InternalTransitionStateAtomKind.RuntimeControl:
    case InternalTransitionStateAtomKind.SequentialControllersPresence:
      return false;
    default:
      return assertNever(atom);
  }
}

function activityAssociationParts(
  record: ActivityOccurrence,
): ReadonlyArray<string | number> {
  return [
    record.id.processInstanceId,
    record.id.activityElementId,
    record.id.activation,
    ...scopeParts(record.owner),
    record.operationId,
    ...activityBodyParts(record),
    record.attachedHandlers.length,
    ...record.attachedHandlers.flatMap((handler) => [
      handler.kind,
      ...occurrenceParts(handler.occurrence),
    ]),
  ];
}

function activityOccurrenceIdParts(
  id: ActivityOccurrence["id"],
): ReadonlyArray<string | number> {
  return [id.processInstanceId, id.activityElementId, id.activation];
}

type ParallelControllerAtom = Extract<
  InternalTransitionStateAtom,
  {
    kind:
      | InternalTransitionStateAtomKind.ParallelController
      | InternalTransitionStateAtomKind.ParallelControllerSlot
      | InternalTransitionStateAtomKind.ParallelControllerSnapshot;
  }
>;

function isParallelControllerAtom(
  atom: InternalTransitionStateAtom,
): atom is ParallelControllerAtom {
  return atom.kind === InternalTransitionStateAtomKind.ParallelController ||
    atom.kind === InternalTransitionStateAtomKind.ParallelControllerSlot ||
    atom.kind === InternalTransitionStateAtomKind.ParallelControllerSnapshot;
}

type SequentialControllerAtom = Extract<
  InternalTransitionStateAtom,
  {
    kind:
      | InternalTransitionStateAtomKind.SequentialController
      | InternalTransitionStateAtomKind.SequentialControllerOutput
      | InternalTransitionStateAtomKind.SequentialControllerSnapshot;
  }
>;

function isSequentialControllerAtom(
  atom: InternalTransitionStateAtom,
): atom is SequentialControllerAtom {
  return atom.kind === InternalTransitionStateAtomKind.SequentialController ||
    atom.kind === InternalTransitionStateAtomKind.SequentialControllerOutput ||
    atom.kind === InternalTransitionStateAtomKind.SequentialControllerSnapshot;
}

function controllerAtomsConflict(
  left: ParallelControllerAtom | SequentialControllerAtom,
  right: ParallelControllerAtom | SequentialControllerAtom,
  membershipKind:
    | InternalTransitionStateAtomKind.ParallelController
    | InternalTransitionStateAtomKind.SequentialController,
): boolean {
  if (!sameActivityOccurrence(left.id, right.id)) {
    return false;
  }
  if (left.kind === membershipKind || right.kind === membershipKind) {
    return true;
  }
  return left.kind === right.kind &&
    controllerAtomIndex(left) === controllerAtomIndex(right);
}

function controllerAtomIndex(
  atom: ParallelControllerAtom | SequentialControllerAtom,
): number | null {
  return "index" in atom ? atom.index : null;
}

function activityBodyParts(
  record: ActivityOccurrence,
): ReadonlyArray<string | number> {
  switch (record.body.kind) {
    case ActivityBodyKind.UserTask:
      return [record.body.kind, ...occurrenceParts(record.body.task)];
    case ActivityBodyKind.ParallelUserTasks:
      return [
        record.body.kind,
        record.body.tasks.length,
        ...record.body.tasks.flatMap(occurrenceParts),
      ];
    case ActivityBodyKind.ChildScope:
      return [record.body.kind, ...scopeParts(record.body.scope)];
  }
}

function comparePublicationAtoms(
  left: InternalTransitionPublicationAtom,
  right: InternalTransitionPublicationAtom,
): number {
  return compareParts(publicationAtomParts(left), publicationAtomParts(right));
}

function publicationAtomParts(
  atom: InternalTransitionPublicationAtom,
): ReadonlyArray<string | number> {
  switch (atom.kind) {
    case InternalTransitionPublicationAtomKind.CommittedTransition:
      return [
        atom.kind,
        atom.operationId,
        atom.operationKind,
        atom.origin.kind,
        atom.origin.elementId,
        ...scopeParts(atom.owner),
        atom.logicalTimeMs,
        ...positionDeltaParts(atom.positionDelta),
      ];
    case InternalTransitionPublicationAtomKind.FlowNodeLifecycle:
      return [atom.kind, ...occurrenceParts(atom.occurrence)];
    case InternalTransitionPublicationAtomKind.CorrelationCandidate:
      return [
        atom.kind,
        ...correlatedMessageAddressParts(atom.address),
        ...occurrenceParts(atom.subscriptionOccurrence),
        atom.correlationPropertyId,
        atom.processPropertyId,
      ];
    case InternalTransitionPublicationAtomKind.PublicationPair:
      return [atom.kind, atom.operationId, ...internalOccurrenceParts(atom.occurrence)];
    default:
      return assertNever(atom);
  }
}

function correlatedMessageAddressParts(
  address: Extract<
    InternalTransitionPublicationAtom,
    { kind: InternalTransitionPublicationAtomKind.CorrelationCandidate }
  >["address"],
): ReadonlyArray<string> {
  const overlay = address.definition.sourceOverlay;
  return [
    address.definition.compiler,
    address.definition.semanticProfile,
    address.definition.sourceId,
    address.definition.sourceSha256,
    ...(overlay === null
      ? ["no-source-overlay"]
      : [overlay.id, overlay.sha256]),
    address.processId,
    address.channel.kind,
    address.channel.interfaceId,
    address.channel.interfaceOperationId,
    address.channel.messageId,
    address.correlationKeyId,
  ];
}

function positionDeltaParts(
  delta: PublicControlPositionDelta,
): ReadonlyArray<string | number> {
  return [
    "consumedTokens",
    delta.consumedTokens.length,
    ...delta.consumedTokens.flatMap((token) => [
      token.sequenceFlowId,
      ...scopeParts(token.owner),
      token.multiplicity,
    ]),
    "producedTokens",
    delta.producedTokens.length,
    ...delta.producedTokens.flatMap((token) => [
      token.sequenceFlowId,
      ...scopeParts(token.owner),
      token.multiplicity,
    ]),
    "enteredScopes",
    delta.enteredScopes.length,
    ...delta.enteredScopes.flatMap(scopePositionParts),
    "exitedScopes",
    delta.exitedScopes.length,
    ...delta.exitedScopes.flatMap(scopePositionParts),
  ];
}

function scopePositionParts(
  position: PublicControlPositionDelta["enteredScopes"][number],
): ReadonlyArray<string | number> {
  return [
    ...scopeParts(position.id),
    ...(position.parent === null ? ["no-parent"] : scopeParts(position.parent)),
    position.bpmnElementId,
  ];
}

function internalOccurrenceParts(
  occurrence: InternalOccurrence,
): ReadonlyArray<string | number> {
  return [occurrence.kind, ...occurrenceParts(occurrence.id)];
}

function occurrenceParts(
  occurrence: OccurrenceId,
): ReadonlyArray<string | number> {
  return [
    occurrence.processInstanceId,
    occurrence.elementId,
    occurrence.activation,
  ];
}

function callAssociationParts(
  record: CalledProcessOccurrence,
): ReadonlyArray<string | number> {
  return [
    ...occurrenceParts(record.id),
    ...scopeParts(record.caller),
    record.calledProcessId,
    ...scopeParts(record.calledRoot),
    record.returnOperationId,
  ];
}

function eventRaceAssociationParts(
  record: EventRace,
): ReadonlyArray<string | number> {
  return [
    ...occurrenceParts(record.id),
    ...scopeParts(record.owner),
    ...occurrenceParts(record.messageSubscriptionId),
    ...occurrenceParts(record.timerOccurrenceId),
  ];
}

function scopeParts(
  owner: ScopeOccurrenceId,
): ReadonlyArray<string | number> {
  return [
    owner.processInstanceId,
    owner.definitionScopeId,
    owner.activation,
  ];
}

function compareParts(
  left: ReadonlyArray<string | number>,
  right: ReadonlyArray<string | number>,
): number {
  const sharedLength = Math.min(left.length, right.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const leftPart = left[index]!;
    const rightPart = right[index]!;
    if (typeof leftPart !== typeof rightPart) {
      return typeof leftPart === "number" ? -1 : 1;
    }
    const order = typeof leftPart === "number"
      ? Math.sign(leftPart - (rightPart as number))
      : compareCanonicalStrings(leftPart, rightPart as string);
    if (order !== 0) {
      return order;
    }
  }
  return Math.sign(left.length - right.length);
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported footprint ordering variant: ${JSON.stringify(value)}`);
}
