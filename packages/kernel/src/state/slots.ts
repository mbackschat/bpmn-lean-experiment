/**
 * Feature slots, transcribed from `Kernel/State/Slots.lean`: the feature-owned data of `FeatureSlots`, always present
 * and empty by default, with the records a compensation run resumes by. Part of `state.ts`, which re-exports it.
 */
import { assertNever, type DefinitionRef, type ElementId, type FlowId, type Value } from "../il/types.js";
import { type OccurrenceRef } from "./input.js";
import { type Binding } from "./wait.js";
/** Re-exported for `raise.ts`, as Lean's `Kernel.State.Raise` sees `Kernel.State.Wait` only through this module. */
export { type Binding };
import { compareOccurrenceId, type OccurrenceId, type ScopeOccurrenceId } from "./key.js";
/** Re-exported for `items.ts` and `raise.ts`, as Lean's `Kernel.State.Items` and `Kernel.State.Raise` see `Kernel.State.Key`
 * only through this module. */
export { compareOccurrenceId, type OccurrenceId, type ScopeOccurrenceId };

/**
 * How an occurrence leaves: its element's own outgoing selection, the flows given (`flows []` consumes the token), or
 * `raised` by an event, which runs no retention, outflow or continuation.
 */
export enum LeaveTag { Outgoing = "outgoing", Flows = "flows", Raised = "raised" }

export type Leave =
  | { readonly tag: LeaveTag.Outgoing }
  | { readonly tag: LeaveTag.Flows; readonly selected: readonly FlowId[] }
  | { readonly tag: LeaveTag.Raised };

export const leaveOutgoing: Leave = { tag: LeaveTag.Outgoing };
export const leaveRaised: Leave = { tag: LeaveTag.Raised };
export function leaveFlows(selected: readonly FlowId[]): Leave { return { tag: LeaveTag.Flows, selected }; }

/**
 * What a compensation run does once its handlers have completed: complete an existing occurrence, begin and complete
 * a fresh one (a caught Cancel's boundary, which `Step` numbers when the run ends), or, for a group's nested run, leave
 * the group's `context` and advance the run in `outer` as a completed handler does.
 */
export enum ResumeTag { Complete = "complete", Occur = "occur", Group = "group" }

export type Resume =
  | { readonly tag: ResumeTag.Complete; readonly occurrence: OccurrenceId; readonly leave: Leave }
  | { readonly tag: ResumeTag.Occur; readonly element: ElementId; readonly scope: ScopeOccurrenceId; readonly leave: Leave }
  | { readonly tag: ResumeTag.Group; readonly outer: ScopeOccurrenceId; readonly context: ScopeOccurrenceId };

/**
 * One instance of a Multi-Instance Activity: waiting to start, running in its instance scope occurrence, or completed
 * with the value its output data item received, `null` for a loop without one.
 */
export enum IterationTag { Waiting = "waiting", Active = "active", Completed = "completed" }

export type Iteration =
  | { readonly tag: IterationTag.Waiting }
  | { readonly tag: IterationTag.Active; readonly scope: ScopeOccurrenceId }
  | { readonly tag: IterationTag.Completed; readonly output: Value | null };

/** `Iteration.holds`: whether this instance runs in the scope occurrence `scope`. */
export function iterationHolds(iteration: Iteration, scope: ScopeOccurrenceId): boolean {
  switch (iteration.tag) {
    case IterationTag.Active:
      return iteration.scope === scope;
    case IterationTag.Waiting:
    case IterationTag.Completed:
      return false;
  }
  return assertNever(iteration);
}

/**
 * A running Multi-Instance Activity: the scope occurrence it holds its instances in, its element and body occurrence,
 * the input collection as evaluated once on entry, and one instance per item in collection order.
 */
export interface MultiInstanceRun {
  readonly scope: ScopeOccurrenceId;
  readonly element: ElementId;
  readonly occurrence: OccurrenceId;
  readonly collection: Value;
  readonly instances: readonly Iteration[];
  /**
   * The effect-result names earlier sequential instances left, which CIB keeps on the body until it ends
   * (EXPRESSION-SEMANTICS-SPEC "Multi-Instance level", result locals); absent is none.
   */
  readonly results?: readonly string[];
}

/**
 * A record a completed Sub-Process's record keeps (`Compensable.children`), flat: the `Compensable` it was, without a
 * scope occurrence, which it takes only when its holder's handler or group begins, and its group key `group`, the
 * completion numbers of the kept records it lies within, outermost first, `[]` for one its holder keeps directly. The
 * key, not a nested list, says which records a begun record keeps in turn, so no state type nests.
 */
export interface CompensableChild {
  readonly subject: ElementId;
  readonly handler: ElementId | null;
  readonly occurrence: OccurrenceRef | null;
  readonly completion: number;
  readonly snapshot: readonly Binding[];
  readonly group: readonly number[];
}

/**
 * A completed Activity or Scope whose compensation handler may still run: it completed in `scope`, and its handler
 * restores `snapshot` (BPMN 2.0.2 §13.5.5). `completion` orders the records of one scope. `children` keeps the records
 * of a completed Sub-Process at every depth, each under its group key, for its handler to trigger recursively
 * (§13.5.5). A record without a `handler` is a group whose compensation runs its children.
 */
export interface Compensable {
  readonly subject: ElementId;
  readonly handler: ElementId | null;
  readonly scope: ScopeOccurrenceId;
  readonly occurrence: OccurrenceRef | null;
  readonly completion: number;
  readonly snapshot: readonly Binding[];
  readonly children: readonly CompensableChild[];
}

/**
 * One compensation trigger in progress for the records retained in `scope`: handlers still `pending`, and those
 * `running` in their own context scope occurrence. Once all completed, the occurrence `leave` is cancelled and
 * `resume`'s occurrence completes.
 */
export interface CompensationRun {
  readonly trigger: OccurrenceRef;
  readonly scope: ScopeOccurrenceId;
  readonly pending: readonly Compensable[];
  readonly running: readonly (readonly [ScopeOccurrenceId, Compensable])[];
  readonly leave: OccurrenceId | null;
  readonly resume: Resume | null;
}

/** `feature/compensation.ts`'s data: the retained records and the triggers in progress. */
export interface Compensations { readonly retained: readonly Compensable[]; readonly runs: readonly CompensationRun[]; }

/** An occurrence waiting at a join, with the flow its token arrived on. */
export interface Parked { readonly occurrence: OccurrenceId; readonly flow: FlowId; readonly scope: ScopeOccurrenceId; }

/**
 * An occurrence waiting for an unavailable InputSet in its scope occurrence. It records no flow: it waits whether or not
 * a token began it, and only its scope occurrence's clearing ends the wait.
 */
export interface Held { readonly occurrence: OccurrenceId; readonly scope: ScopeOccurrenceId; }

export function parkedEquals(left: Parked, right: Parked): boolean {
  return left.occurrence === right.occurrence && left.flow === right.flow && left.scope === right.scope;
}

/**
 * A process instance's own facts: its root scope occurrence, its business key and, for a called instance, the
 * definition its Call bound, kept per instance so recovery never re-resolves it (PC-SCOPE-03, PC-MESSAGE-08).
 */
export interface InstanceData {
  readonly root: ScopeOccurrenceId;
  readonly businessKey: string | null;
  readonly definition: DefinitionRef | null;
}

/**
 * Feature-owned data. `parked` holds the occurrences that reached a join and wait for its other incoming flows
 * (`feature/flow.ts`); `held` holds those at an Activity whose InputSet is unavailable (BPMN 2.0.2 §10.4.2,
 * `feature/work.ts`).
 */
export interface FeatureSlots {
  readonly parked: readonly Parked[];
  readonly held: readonly Held[];
  readonly multiInstances: readonly MultiInstanceRun[];
  readonly compensation: Compensations;
  readonly instances: readonly InstanceData[];
}

/**
 * The scope occurrences a slot keeps alive. Every slot's own entry is an open occurrence or a child occurrence already,
 * so only the join and held waits count here. One of the two places that enumerate the slots.
 */
export function featureSlotsKeptAlive(slots: FeatureSlots): readonly ScopeOccurrenceId[] {
  return [...slots.parked.map((entry) => entry.scope), ...slots.held.map((entry) => entry.scope)];
}

/** The slot entries that survive removing the scope occurrences `inside`, of which `nested` are the children. The other place that enumerates the slots. */
export function featureSlotsClear(
  slots: FeatureSlots,
  inside: readonly ScopeOccurrenceId[],
  nested: readonly ScopeOccurrenceId[],
): FeatureSlots {
  return {
    parked: slots.parked.filter((entry) => !inside.includes(entry.scope)),
    held: slots.held.filter((entry) => !inside.includes(entry.scope)),
    multiInstances: slots.multiInstances.filter((run) => !inside.includes(run.scope)),
    compensation: {
      retained: slots.compensation.retained.filter((record) => !nested.includes(record.scope)),
      runs: slots.compensation.runs.filter((run) => !inside.includes(run.scope)),
    },
    instances: slots.instances.filter((instance) => !nested.includes(instance.root)),
  };
}
