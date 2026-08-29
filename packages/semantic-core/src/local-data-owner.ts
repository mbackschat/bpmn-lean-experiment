import type { ActivityOccurrenceId } from "./activity-occurrence.js";
import type { EffectOccurrenceId } from "./contract.js";
import type { DeepReadonly } from "./deep-readonly.js";
import { compareCanonicalStrings } from "./wire.js";

export enum LocalDataOwnerKind {
  EffectOccurrence = "effectOccurrence",
  ActivityOccurrence = "activityOccurrence",
}

type EffectOccurrenceOwner = DeepReadonly<{
  kind: LocalDataOwnerKind.EffectOccurrence;
  id: EffectOccurrenceId;
}>;

type ActivityOccurrenceOwner = DeepReadonly<{
  kind: LocalDataOwnerKind.ActivityOccurrence;
  id: ActivityOccurrenceId;
}>;

/** The closed identity families that may own one Activity-local variable scope. */
export type LocalDataOwner = EffectOccurrenceOwner | ActivityOccurrenceOwner;

export function createEffectLocalDataOwner(
  id: EffectOccurrenceId,
): EffectOccurrenceOwner {
  return { kind: LocalDataOwnerKind.EffectOccurrence, id: { ...id } };
}

export function createActivityLocalDataOwner(
  id: ActivityOccurrenceId,
): ActivityOccurrenceOwner {
  return { kind: LocalDataOwnerKind.ActivityOccurrence, id: { ...id } };
}

export function matchesEffectLocalDataOwner(
  owner: LocalDataOwner,
  id: EffectOccurrenceId,
): boolean {
  return owner.kind === LocalDataOwnerKind.EffectOccurrence &&
    sameEffectOccurrenceId(owner.id, id);
}

export function matchesActivityLocalDataOwner(
  owner: LocalDataOwner,
  id: ActivityOccurrenceId,
): boolean {
  return owner.kind === LocalDataOwnerKind.ActivityOccurrence &&
    sameActivityOccurrenceId(owner.id, id);
}

export function sameLocalDataOwner(
  left: LocalDataOwner,
  right: LocalDataOwner,
): boolean {
  switch (left.kind) {
    case LocalDataOwnerKind.EffectOccurrence:
      return right.kind === LocalDataOwnerKind.EffectOccurrence &&
        sameEffectOccurrenceId(left.id, right.id);
    case LocalDataOwnerKind.ActivityOccurrence:
      return right.kind === LocalDataOwnerKind.ActivityOccurrence &&
        sameActivityOccurrenceId(left.id, right.id);
    default:
      return assertNever(left);
  }
}

export function localDataOwnerProcessInstanceId(
  owner: LocalDataOwner,
): string {
  switch (owner.kind) {
    case LocalDataOwnerKind.EffectOccurrence:
    case LocalDataOwnerKind.ActivityOccurrence:
      return owner.id.processInstanceId;
    default:
      return assertNever(owner);
  }
}

/** Canonical order is owner-family first, then the complete identity within that family. */
export function compareLocalDataOwners(
  left: LocalDataOwner,
  right: LocalDataOwner,
): number {
  const kindOrder = localDataOwnerKindOrder(left.kind) -
    localDataOwnerKindOrder(right.kind);
  if (kindOrder !== 0) {
    return kindOrder;
  }
  switch (left.kind) {
    case LocalDataOwnerKind.EffectOccurrence:
      if (right.kind !== LocalDataOwnerKind.EffectOccurrence) {
        return kindOrder;
      }
      return compareEffectOccurrenceIds(left.id, right.id);
    case LocalDataOwnerKind.ActivityOccurrence:
      if (right.kind !== LocalDataOwnerKind.ActivityOccurrence) {
        return kindOrder;
      }
      return compareActivityOccurrenceIds(left.id, right.id);
    default:
      return assertNever(left);
  }
}

function localDataOwnerKindOrder(kind: LocalDataOwnerKind): number {
  switch (kind) {
    case LocalDataOwnerKind.EffectOccurrence:
      return 0;
    case LocalDataOwnerKind.ActivityOccurrence:
      return 1;
    default:
      return assertNever(kind);
  }
}

function sameEffectOccurrenceId(
  left: EffectOccurrenceId,
  right: EffectOccurrenceId,
): boolean {
  return left.processInstanceId === right.processInstanceId &&
    left.elementId === right.elementId &&
    left.activation === right.activation;
}

function sameActivityOccurrenceId(
  left: ActivityOccurrenceId,
  right: ActivityOccurrenceId,
): boolean {
  return left.processInstanceId === right.processInstanceId &&
    left.activityElementId === right.activityElementId &&
    left.activation === right.activation;
}

function compareEffectOccurrenceIds(
  left: EffectOccurrenceId,
  right: EffectOccurrenceId,
): number {
  const instanceOrder = compareCanonicalStrings(
    left.processInstanceId,
    right.processInstanceId,
  );
  if (instanceOrder !== 0) {
    return instanceOrder;
  }
  const elementOrder = compareCanonicalStrings(left.elementId, right.elementId);
  return elementOrder !== 0
    ? elementOrder
    : left.activation - right.activation;
}

function compareActivityOccurrenceIds(
  left: ActivityOccurrenceId,
  right: ActivityOccurrenceId,
): number {
  const instanceOrder = compareCanonicalStrings(
    left.processInstanceId,
    right.processInstanceId,
  );
  if (instanceOrder !== 0) {
    return instanceOrder;
  }
  const elementOrder = compareCanonicalStrings(
    left.activityElementId,
    right.activityElementId,
  );
  return elementOrder !== 0
    ? elementOrder
    : left.activation - right.activation;
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported local data owner: ${JSON.stringify(value)}`);
}
