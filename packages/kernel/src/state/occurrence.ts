/**
 * Occurrences, transcribed from `Kernel/State/Occurrence.lean`: the records of a begun flow-node occurrence and of a
 * scope occurrence and the continuation `step.ts` tells when an occurrence completes. Part of `state.ts`, which
 * re-exports it.
 */
import { type ElementId, type FlowId } from "../il/types.js";
import { type ActivationRole } from "./journal.js";
import { type OccurrenceId, type ScopeOccurrenceId, scopeParent } from "./key.js";

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
  readonly occurrence: OccurrenceId | null;
  readonly calledInstance: string | null;
}

/** Lean's `ScopeOccurrence.parent` over a search's result: the parent of a found record's key, `null` for none. */
export function scopeOccurrenceParent(scope: ScopeOccurrence | null | undefined): ScopeOccurrenceId | null {
  return scope === null || scope === undefined ? null : scopeParent(scope.id);
}
