/**
 * Feature slots, transcribed from `Kernel/State/Slots.lean`: the scope occurrence identity every slot entry keys on,
 * and the feature-owned data of `FeatureSlots`, always present and empty by default, with the records a compensation
 * run resumes by. Part of `state.ts`, which re-exports it.
 */
import { type DefinitionRef, type ElementId, type FlowId, type Value } from "../il/types.js";
import { type OccurrenceRef } from "./input.js";
import { type Binding } from "./wait.js";

/** Lean's `ScopeOccurrenceId`, a structure around one `Nat`. */
export type ScopeOccurrenceId = number;

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
  | { readonly tag: ResumeTag.Complete; readonly occurrence: number; readonly leave: Leave }
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

/**
 * A running Multi-Instance Activity: the scope occurrence it holds its instances in, its element and body occurrence,
 * the input collection as evaluated once on entry, and one instance per item in collection order.
 */
export interface MultiInstanceRun {
  readonly scope: ScopeOccurrenceId;
  readonly element: ElementId;
  readonly occurrence: number;
  readonly collection: Value;
  readonly instances: readonly Iteration[];
  /**
   * The effect-result names earlier sequential instances left, which CIB keeps on the body until it ends
   * (EXPRESSION-SEMANTICS-SPEC "Multi-Instance level", result locals); absent is none.
   */
  readonly results?: readonly string[];
}

/**
 * A completed Activity or Scope whose compensation handler may still run: it completed in `scope`, and its handler
 * restores `snapshot` (BPMN 2.0.2 §13.5.5). `completion` orders the records of one scope. `children` keeps the records
 * of a completed Sub-Process, for its handler to trigger recursively (§13.5.5). A record without a `handler` is a group
 * whose compensation runs its `children`.
 */
export interface Compensable {
  readonly subject: ElementId;
  readonly handler: ElementId | null;
  readonly scope: ScopeOccurrenceId;
  readonly occurrence: OccurrenceRef | null;
  readonly completion: number;
  readonly snapshot: readonly Binding[];
  readonly children: readonly Compensable[];
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
  readonly leave: number | null;
  readonly resume: Resume | null;
}

/** `feature/compensation.ts`'s data: the retained records and the triggers in progress. */
export interface Compensations { readonly retained: readonly Compensable[]; readonly runs: readonly CompensationRun[]; }

/** An occurrence waiting at a join or for an unavailable InputSet, with the flow its token arrived on. */
export interface Parked { readonly occurrence: number; readonly flow: FlowId; readonly scope: ScopeOccurrenceId; }

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
  readonly held: readonly Parked[];
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
