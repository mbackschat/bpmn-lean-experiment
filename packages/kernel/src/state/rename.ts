/**
 * The renaming at commit (DC12), transcribed from `Kernel/State/Rename.lean`: an issue renaming applied to every identity
 * a committed state holds, scope occurrence keys, occurrence keys and item keys, wherever the state holds them. Part of
 * the State layer, above `state.ts`, since it writes the state's families (guard 17); `step/commit.ts` chooses the
 * renaming and renames continuations.
 */
import {
  CauseTag, childScope, compareItemKey, type Cause, type Compensable, type Continuation, type FeatureSlots, freshIssue,
  type Issue, type ItemKey, type Iteration, IterationTag, type OccurrenceId, occurrenceId, occurrenceIdParts,
  type Resume, ResumeTag, type ScopeOccurrenceId, scopeHead, type State, type Transition,
} from "../state.js";
import { assertNever } from "../il/types.js";

/** An issue renaming that fixes every committed issue. */
export type Rename = (issue: Issue) => Issue;

/**
 * Lean's `renameScope`: `scope` with every fresh segment renamed by `rename`. A committed segment has only committed
 * segments above it, since a scope occurrence entered in a closure is entered in one that stands, so the walk stops at
 * the first committed segment and a committed key is returned as it is.
 */
export function renameScope(rename: Rename, scope: ScopeOccurrenceId): ScopeOccurrenceId {
  const head = scopeHead(scope);
  if (head === null || freshIssue(head[0].ordinal) === null) return scope;
  const [{ element, ordinal }, parent] = head;
  return childScope(renameScope(rename, parent), element, rename(ordinal));
}

export function renameId(rename: Rename, id: OccurrenceId): OccurrenceId {
  const { scope, element, ordinal } = occurrenceIdParts(id);
  return occurrenceId(renameScope(rename, scope), element, rename(ordinal));
}

function renameItemKey(rename: Rename, key: ItemKey): ItemKey {
  return { ...key, occurrence: renameId(rename, key.occurrence), ordinal: rename(key.ordinal) };
}

function renameCompensable(rename: Rename, record: Compensable): Compensable {
  return { ...record, scope: renameScope(rename, record.scope) };
}

function renameResume(rename: Rename, resume: Resume): Resume {
  switch (resume.tag) {
    case ResumeTag.Complete:
      return { ...resume, occurrence: renameId(rename, resume.occurrence) };
    case ResumeTag.Occur:
      return { ...resume, scope: renameScope(rename, resume.scope) };
    case ResumeTag.Group:
      return { ...resume, context: renameScope(rename, resume.context) };
  }
  return assertNever(resume);
}

function renameIteration(rename: Rename, iteration: Iteration): Iteration {
  switch (iteration.tag) {
    case IterationTag.Active:
      return { ...iteration, scope: renameScope(rename, iteration.scope) };
    case IterationTag.Waiting:
    case IterationTag.Completed:
      return iteration;
  }
  return assertNever(iteration);
}

function renameSlots(rename: Rename, slots: FeatureSlots): FeatureSlots {
  const scope = (key: ScopeOccurrenceId): ScopeOccurrenceId => renameScope(rename, key);
  const id = (key: OccurrenceId): OccurrenceId => renameId(rename, key);
  return {
    parked: slots.parked.map((parked) => ({ ...parked, occurrence: id(parked.occurrence), scope: scope(parked.scope) })),
    held: slots.held.map((held) => ({ ...held, occurrence: id(held.occurrence), scope: scope(held.scope) })),
    multiInstances: slots.multiInstances.map((run) => ({
      ...run, scope: scope(run.scope), occurrence: id(run.occurrence), instances: run.instances.map((iteration) => renameIteration(rename, iteration)),
    })),
    compensation: {
      retained: slots.compensation.retained.map((record) => renameCompensable(rename, record)),
      runs: slots.compensation.runs.map((run) => ({
        ...run, scope: scope(run.scope), pending: run.pending.map((record) => renameCompensable(rename, record)),
        running: run.running.map(([context, record]) => [scope(context), renameCompensable(rename, record)] as const),
        leave: run.leave === null ? null : id(run.leave), resume: run.resume === null ? null : renameResume(rename, run.resume),
      })),
    },
    instances: slots.instances.map((data) => ({ ...data, root: scope(data.root) })),
  };
}

function renameCause(rename: Rename, cause: Cause): Cause {
  switch (cause.tag) {
    case CauseTag.Idle:
      return { ...cause, scope: renameScope(rename, cause.scope) };
    case CauseTag.Input:
    case CauseTag.Signal:
    case CauseTag.Arrive:
      return cause;
  }
  return assertNever(cause);
}

function renameTransition(rename: Rename, transition: Transition): Transition {
  return {
    ...transition, cause: renameCause(rename, transition.cause), owner: renameScope(rename, transition.owner),
    started: transition.started.map((fact) => ({ ...fact, owner: renameScope(rename, fact.owner) })),
  };
}

/**
 * Lean's `renameState`: `rename` applied to every identity a committed state holds: its scope occurrences, occurrences
 * (their continuations through `continuation`, which `step/commit.ts` supplies, since only the step matches on
 * `Continuation`), variable sets, open items, slots and journal. The counters are keyed by committed keys already
 * (`assign` inserts renamed ones), and the families keyed by unit keys are empty (`orderJournal`).
 */
export function renameState(rename: Rename, continuation: (continuation: Continuation) => Continuation, state: State): State {
  const scope = (key: ScopeOccurrenceId): ScopeOccurrenceId => renameScope(rename, key);
  const id = (key: OccurrenceId): OccurrenceId => renameId(rename, key);
  return {
    ...state,
    scopes: state.scopes.map((entry) => ({ ...entry, id: scope(entry.id), occurrence: entry.occurrence === null ? null : id(entry.occurrence) })),
    occurrences: state.occurrences.map((occurrence) => ({
      ...occurrence, id: id(occurrence.id), scope: scope(occurrence.scope), continuation: continuation(occurrence.continuation),
    })),
    variables: state.variables.map((variables) => ({ ...variables, scope: scope(variables.scope) })),
    // Renamed keys are inserted afresh, in the renamed key order, as Lean's fold into an empty map inserts them.
    openItems: state.openItems.map((item) => ({
      ...item, id: renameItemKey(rename, item.id), scope: scope(item.scope), attachedTo: item.attachedTo === null ? null : id(item.attachedTo),
    })).sort((left, right) => compareItemKey(left.id, right.id)),
    slots: renameSlots(rename, state.slots),
    journal: state.journal.map((transition) => renameTransition(rename, transition)),
  };
}
