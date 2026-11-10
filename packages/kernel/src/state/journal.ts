/**
 * The occurrence journal, transcribed from `Kernel/State/Journal.lean`: an occurrence's public key and the facts each
 * micro-step records about the occurrences it began and ended. Part of `state.ts`, which re-exports it.
 */
import { type ElementId, type FlowId } from "../il/types.js";
import { type ScopeOccurrenceId } from "./slots.js";
import { type InputTag } from "./wait.js";

/**
 * Which counter numbers an occurrence: a Multi-Instance body and its instances number apart, as CIB gives the body an
 * activity id of its own (`BpmnParse:185`).
 */
export enum ActivationRole { Element = "element", MultiInstanceBody = "multiInstanceBody" }

/** An occurrence's public key in the journal. */
export interface OccurrenceKey {
  readonly processInstanceId: string;
  readonly element: ElementId;
  readonly activation: number;
  readonly role: ActivationRole;
}

export enum Terminal { Completed = "completed", Cancelled = "cancelled" }

/** What caused a micro-step. */
export enum CauseTag { Input = "input", Signal = "signal", Arrive = "arrive", Idle = "idle" }

export type Cause =
  | { readonly tag: CauseTag.Input; readonly input: InputTag }
  | { readonly tag: CauseTag.Signal; readonly name: string }
  | { readonly tag: CauseTag.Arrive; readonly flow: FlowId }
  | { readonly tag: CauseTag.Idle; readonly scope: ScopeOccurrenceId };

/** An occurrence began: its key, its owning scope occurrence and its element's source type. */
export interface StartedFact {
  readonly occurrence: OccurrenceKey;
  readonly owner: ScopeOccurrenceId;
  readonly sourceType: string;
}

/** One micro-step's occurrence facts. */
export interface Transition {
  readonly cause: Cause;
  readonly element: ElementId | null;
  readonly owner: ScopeOccurrenceId;
  readonly started: readonly StartedFact[];
  readonly ended: readonly (readonly [OccurrenceKey, Terminal])[];
}
