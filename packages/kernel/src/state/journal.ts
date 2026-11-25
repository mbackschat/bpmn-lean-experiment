/**
 * The occurrence journal, transcribed from `Kernel/State/Journal.lean`: the facts each micro-step records about the
 * occurrences it began and ended, each named by its public key (`key.ts`'s `OccurrenceKey`), the transaction-boundary
 * marks an occurrence carries and the activation counter that numbers a key's activation. Part of `state.ts`, which
 * re-exports it.
 */
import { elementEnvelope, programElement, type ElementId, type FlowId, type Program } from "../il/types.js";
import { ActivationRole, type InstanceName, type OccurrenceKey, type ScopeOccurrenceId } from "./slots.js";
import { type InputTag } from "./wait.js";

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

/**
 * One micro-step's occurrence facts. `ready` names the occurrences the micro-step leaves in BPMN's Ready state (BPMN
 * 2.0.2 §13.3.2, Fig. 13.2): begun, their InputSet unavailable (§10.4.2); `hooks.ts#hold` is its only writer.
 */
export interface Transition {
  readonly cause: Cause;
  readonly element: ElementId | null;
  readonly owner: ScopeOccurrenceId;
  readonly started: readonly StartedFact[];
  readonly ended: readonly (readonly [OccurrenceKey, Terminal])[];
  readonly ready: readonly OccurrenceKey[];
}

/**
 * The `asyncBefore` and `asyncAfter` marks of the occurrence `key`: a Multi-Instance Activity's envelope marks its body,
 * and its loop characteristics mark each instance (CIB-EXT-0027, `BpmnParse#parseMultiInstanceLoopCharacteristics`).
 */
export function marks(program: Program, key: OccurrenceKey): readonly [boolean, boolean] {
  const found = programElement(program, key.element);
  const envelope = found === null ? null : elementEnvelope(found);
  if (envelope === null) return [false, false];
  // CIB skips loop marks on a compensation handler (`BpmnParse.java:2416`); admission refuses a Multi-Instance handler.
  const loop = key.role === ActivationRole.Element ? envelope.multiInstance : null;
  return loop === null ? [envelope.asyncBefore, envelope.asyncAfter] : [loop.asyncBefore, loop.asyncAfter];
}

/** One activation counter (R8: per process instance, element and role). */
export interface ActivationCount {
  readonly processInstance: InstanceName;
  readonly element: ElementId;
  readonly role: ActivationRole;
  readonly count: number;
}
