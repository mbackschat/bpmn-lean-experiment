/**
 * Occurrences, transcribed from `Kernel/State/Occurrence.lean`: the records of a begun flow-node occurrence and of a
 * scope occurrence and the continuation `step.ts` tells when an occurrence completes. Part of `state.ts`, which
 * re-exports it.
 */
import { type ElementId, type FlowId } from "../il/types.js";
import { type ActivationRole, type Issue, type OccurrenceId, type ScopeOccurrenceId, scopeParent } from "./key.js";

/** Guarded type: `step.ts` owns matching on it. Whom `Step` tells when an occurrence completes. */
export enum ContinuationTag {
  /** Leave through the outgoing flows. */
  Flow = "flow",
  /** One instance of the Multi-Instance body occurrence `body`. */
  MultiInstance = "multiInstance",
  /** A compensation handler of the run in that scope occurrence. */
  Compensation = "compensation",
}

export type Continuation =
  | { readonly tag: ContinuationTag.Flow }
  | { readonly tag: ContinuationTag.MultiInstance; readonly body: OccurrenceId }
  | { readonly tag: ContinuationTag.Compensation; readonly run: ScopeOccurrenceId };

export const flowContinuation: Continuation = { tag: ContinuationTag.Flow };

/**
 * One flow-node occurrence, from its issue until it ends. `activation` counts the activations of `element` in its
 * process instance under `role`, from 1. `incoming` is the flow the token arrived on, `null` for an occurrence no
 * token began.
 *
 * `begun = false` is a subscription's reservation: a boundary, Event Sub-Process start or Event-Based Gateway arm has a
 * published identity from the moment it is armed, but its flow node runs only when the trigger arrives (CIB declares
 * the subscription on the event scope and starts the activity instance on receipt, `BpmnParse:3288-3298`). A
 * reservation keeps nothing alive and never appears in the journal until it begins.
 */
export interface Occurrence {
  readonly id: OccurrenceId;
  readonly element: ElementId;
  readonly scope: ScopeOccurrenceId;
  readonly activation: number;
  /**
   * Its order position (DC25): its identity's issue while that is pending (`reserve`, or `beginOccurrence` without a
   * reservation), which the commit numbers on the position counter beside its ordinal (`positionsOf` in
   * `step/commit.ts`), so an occurrence takes one issue only; a begun reservation keeps its reservation's, as it keeps
   * its activation. The cancellation order within a scope occurrence (`clearInside`) reads it.
   */
  readonly position: Issue;
  readonly role: ActivationRole;
  readonly continuation: Continuation;
  readonly incoming: FlowId | null;
  readonly begun: boolean;
}

/**
 * A scope occurrence: the process instance (`element = null`), one activation of a Scope element, the root of a called
 * process instance, whose `element` is the Call Activity and `calledInstance` the instance's identifier, a
 * Multi-Instance body or instance, the occurrence holding a compensation handler's restored context, or an Activity's
 * local variables (CIB-EXT-0015), which live as long as the Activity. `occurrence` is the flow-node occurrence it
 * belongs to, `null` for the process root, a Multi-Instance instance and a handler's context. Its parent is its key's
 * (`scopeOccurrenceParent`), so no record can name another.
 */
export interface ScopeOccurrence {
  readonly id: ScopeOccurrenceId;
  readonly element: ElementId | null;
  /**
   * The order position it took when it was entered (`enterScope`, DC25), pending under the entering unit until the
   * commit numbers it; the root's is committed `0`. The idle check (`idleScope`), the cancellation order (`subtree`) and
   * an owner's removal (`removeOccurrence`) read it.
   */
  readonly position: Issue;
  readonly occurrence: OccurrenceId | null;
  readonly calledInstance: string | null;
}

/**
 * Lean's `ScopeMap`, the standing scope occurrences keyed by their structural key (DC21), written as its list view
 * (`scopeList`): a value's `id` is its key, so the map is its values in key order, outermost first, the form the state
 * codec writes (T75). A reader that orders scope occurrences reads their positions (DC25), never this order.
 */
export type ScopeMap = readonly ScopeOccurrence[];

/**
 * Lean's `OccurrenceMap`, the issued occurrences keyed by their structural key (DC21), written as its list view
 * (`occurrenceList`): a value's `id` is its key, so the map is its values in key order, the form the state codec writes
 * (T75). One reader takes this order: a clearing journals the occurrences of one scope occurrence cancelled in it
 * (`clearInside`), an order no schedule changes.
 */
export type OccurrenceMap = readonly Occurrence[];

/** Lean's `ScopeOccurrence.parent` over a search's result: the parent of a found record's key, `null` for none. */
export function scopeOccurrenceParent(scope: ScopeOccurrence | null | undefined): ScopeOccurrenceId | null {
  return scope === null || scope === undefined ? null : scopeParent(scope.id);
}
