/**
 * Raised events and instance failures, transcribed from `Kernel/State/Raise.lean`: what a thrown event carries and
 * where its search starts, and how a process instance fails. Part of `state.ts`, which re-exports it.
 */
import { assertNever, type ElementId } from "../il/types.js";
import { type OccurrenceRef } from "./input.js";
import { type ScopeOccurrenceId } from "./slots.js";
import { type Binding } from "./wait.js";

/**
 * Guarded type: `feature/propagation` owns matching on it; `feature/subscriptions`' `catches` is the cross-owner
 * query. A thrown event that propagates to a catcher.
 */
export enum RaisedTag { Error = "error", Escalation = "escalation", Cancel = "cancel" }

export type Raised =
  | { readonly tag: RaisedTag.Error; readonly code: string; readonly message: string | null }
  | { readonly tag: RaisedTag.Escalation; readonly code: string }
  | { readonly tag: RaisedTag.Cancel };

export function raisedIsCancel(raised: Raised): boolean {
  switch (raised.tag) {
    case RaisedTag.Cancel: return true;
    case RaisedTag.Error: case RaisedTag.Escalation: return false;
  }
  return assertNever(raised);
}

/**
 * Where a raised event starts its search: the throwing element, the scope occurrence it ran in, and its activation.
 * `host` is the Activity occurrence that raised it, whose boundaries are searched first; `null` for a throw Event.
 */
export interface Origin {
  readonly element: ElementId;
  readonly scope: ScopeOccurrenceId;
  readonly activation: number;
  readonly host: number | null;
  /**
   * The result an effect's business Error carries while `host` still runs, its mapped Error-path outputs not yet
   * written (`Propagation.raise`).
   */
  readonly patch: readonly Binding[];
}

/**
 * The failure of a process instance: the Error, the occurrence it surfaced at, and the named occurrences related to it
 * (a compensation failure names its trigger and handler).
 */
export interface InstanceFailure {
  readonly code: string;
  readonly message: string | null;
  readonly occurrence: OccurrenceRef;
  readonly related: readonly (readonly [string, OccurrenceRef])[];
}
