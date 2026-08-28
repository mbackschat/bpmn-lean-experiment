import type { OccurrenceId } from "./contract.js";
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
  internalOccurrenceRegionContains,
  internalOccurrenceRegionOwnsCall,
  internalOccurrenceRegionsOverlap,
} from "./internal-transition-region.js";
import type { InternalOccurrenceRegion } from "./internal-transition-region.js";
import type {
  CalledProcessOccurrence,
  ScopeOccurrenceId,
} from "./semantic-process-state.js";
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
    case InternalTransitionStateAtomKind.ActivityVariable:
      return [atom.kind, ...internalOccurrenceParts(atom.occurrence), atom.name];
    case InternalTransitionStateAtomKind.ActivityVariableScope:
    case InternalTransitionStateAtomKind.Wait:
      return [atom.kind, ...internalOccurrenceParts(atom.occurrence)];
    case InternalTransitionStateAtomKind.CallAssociation:
      return [atom.kind, ...callAssociationParts(atom.record)];
    case InternalTransitionStateAtomKind.OccurrenceRegion:
      return [
        atom.kind,
        ...scopeParts(atom.region.root),
        atom.region.members.length,
        ...atom.region.members.flatMap(scopeParts),
      ];
    case InternalTransitionStateAtomKind.OpenWaitAnchor:
      return [atom.kind, ...occurrenceParts(atom.occurrence)];
    case InternalTransitionStateAtomKind.ControlToken:
      return [atom.kind, ...scopeParts(atom.owner), atom.placeId];
    case InternalTransitionStateAtomKind.LogicalTime:
      return [atom.kind];
    case InternalTransitionStateAtomKind.RuntimeControl:
      return [atom.kind, atom.instanceId];
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
    case InternalTransitionStateAtomKind.CallAssociation:
      return internalOccurrenceRegionOwnsCall(region, atom.record);
    case InternalTransitionStateAtomKind.ScopeParent:
      return internalOccurrenceRegionContains(region, atom.occurrence) ||
        (atom.parent !== null &&
          internalOccurrenceRegionContains(region, atom.parent));
    case InternalTransitionStateAtomKind.ActivityVariable:
    case InternalTransitionStateAtomKind.ActivityVariableScope:
    case InternalTransitionStateAtomKind.ControlToken:
    case InternalTransitionStateAtomKind.OpenWaitAnchor:
    case InternalTransitionStateAtomKind.ScopeOccurrence:
    case InternalTransitionStateAtomKind.Wait:
      return internalOccurrenceRegionContains(region, atom.owner);
    case InternalTransitionStateAtomKind.Activation:
    case InternalTransitionStateAtomKind.LogicalTime:
    case InternalTransitionStateAtomKind.RuntimeControl:
      return false;
    default:
      return assertNever(atom);
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
    case InternalTransitionPublicationAtomKind.PublicationPair:
      return [atom.kind, atom.operationId, ...internalOccurrenceParts(atom.occurrence)];
    default:
      return assertNever(atom);
  }
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
