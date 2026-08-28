import {
  compareScopeOccurrenceIds,
  sameScopeOccurrence,
} from "./semantic-process-state.js";
import type {
  CalledProcessOccurrence,
  RuntimeState,
  ScopeOccurrenceId,
} from "./semantic-process-state.js";

/** Exact pre-state ownership closure. This classification applies no transition. */
export type InternalOccurrenceRegion = Readonly<{
  root: ScopeOccurrenceId;
  members: ReadonlyArray<ScopeOccurrenceId>;
}>;

/**
 * Closes one occurrence through scope-parent descendants and caller-to-called-root ownership.
 *
 * The direction of the Call edge is deliberate: cancelling a caller owns its called Process tree,
 * while cancelling a called root does not own the caller that will later receive its return.
 */
export function deriveInternalOccurrenceRegion(
  state: RuntimeState,
  root: ScopeOccurrenceId,
): InternalOccurrenceRegion | null {
  if (!scopeOwnershipGraphIsExact(state)) {
    return null;
  }
  const exactRoot = state.scopeOccurrences.filter(({ id }) =>
    sameScopeOccurrence(id, root)
  );
  if (exactRoot.length !== 1) {
    return null;
  }

  const members: ScopeOccurrenceId[] = [exactRoot[0]!.id];
  for (let index = 0; index < members.length; index += 1) {
    const member = members[index];
    if (member === undefined) {
      return null;
    }
    for (const occurrence of state.scopeOccurrences) {
      if (
        occurrence.parent !== null &&
        sameScopeOccurrence(occurrence.parent, member)
      ) {
        addScopeMember(members, occurrence.id);
      }
    }
    for (const record of state.calledProcessOccurrences) {
      if (sameScopeOccurrence(record.caller, member)) {
        addScopeMember(members, record.calledRoot);
      }
    }
  }

  return {
    root: exactRoot[0]!.id,
    members: members.sort(compareScopeOccurrenceIds),
  };
}

export function internalOccurrenceRegionContains(
  region: InternalOccurrenceRegion,
  candidate: ScopeOccurrenceId,
): boolean {
  return region.members.some((member) => sameScopeOccurrence(member, candidate));
}

export function internalOccurrenceRegionsOverlap(
  left: InternalOccurrenceRegion,
  right: InternalOccurrenceRegion,
): boolean {
  return left.members.some((member) =>
    internalOccurrenceRegionContains(right, member)
  );
}

/** A Call association is jointly owned by its caller and called root. */
export function internalOccurrenceRegionOwnsCall(
  region: InternalOccurrenceRegion,
  record: CalledProcessOccurrence,
): boolean {
  return internalOccurrenceRegionContains(region, record.caller) ||
    internalOccurrenceRegionContains(region, record.calledRoot);
}

/** Creating a child depends on its live parent and conflicts with removing that parent's region. */
export function internalOccurrenceRegionOwnsInsertion(
  region: InternalOccurrenceRegion,
  parent: ScopeOccurrenceId,
): boolean {
  return internalOccurrenceRegionContains(region, parent);
}

function scopeOwnershipGraphIsExact(state: RuntimeState): boolean {
  for (let index = 0; index < state.scopeOccurrences.length; index += 1) {
    const occurrence = state.scopeOccurrences[index];
    if (occurrence === undefined) {
      return false;
    }
    const parent = occurrence.parent;
    if (
      state.scopeOccurrences.findIndex(({ id }) =>
        sameScopeOccurrence(id, occurrence.id)
      ) !== index ||
      (parent !== null &&
        (sameScopeOccurrence(parent, occurrence.id) ||
          state.scopeOccurrences.filter(({ id }) =>
            sameScopeOccurrence(id, parent)
          ).length !== 1))
    ) {
      return false;
    }
  }
  return state.calledProcessOccurrences.every((record) =>
    state.scopeOccurrences.filter(({ id }) =>
      sameScopeOccurrence(id, record.caller)
    ).length === 1 &&
    state.scopeOccurrences.filter(({ id, parent }) =>
      parent === null && sameScopeOccurrence(id, record.calledRoot)
    ).length === 1
  );
}

function addScopeMember(
  members: ScopeOccurrenceId[],
  candidate: ScopeOccurrenceId,
): void {
  if (!members.some((member) => sameScopeOccurrence(member, candidate))) {
    members.push(candidate);
  }
}
