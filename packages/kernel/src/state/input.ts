/**
 * Kernel inputs, transcribed from `Kernel/State/Input.lean`: the inputs a host submits, the occurrence identities they
 * name and the start triggers and deliveries they carry. Part of `state.ts`, which re-exports it.
 */
import { type ElementId, type Value } from "../il/types.js";
import { type Binding, InputTag, type MessageChannel, type SignalAddress } from "./wait.js";

/** The public identity of an occurrence: its process instance, the element and its activation number. */
export interface OccurrenceRef {
  readonly processInstanceId: string;
  readonly element: ElementId;
  readonly activation: number;
}

// guard-exception(3): the start input's own statement of how it fired, not a second dispatch over `Trigger`.
export enum StartTriggerTag {
  None = "none",
  Timer = "timer",
  Message = "message",
  Signal = "signal",
  Condition = "condition",
}

export type StartTrigger =
  | { readonly tag: StartTriggerTag.None }
  | { readonly tag: StartTriggerTag.Timer; readonly logicalTimeMs: number }
  | { readonly tag: StartTriggerTag.Message; readonly channel: MessageChannel; readonly payload: Value | null }
  | { readonly tag: StartTriggerTag.Signal; readonly address: SignalAddress; readonly variables: readonly Binding[] }
  | { readonly tag: StartTriggerTag.Condition };

export const noStartTrigger: StartTrigger = { tag: StartTriggerTag.None };

/**
 * How a Signal delivery reached its occurrence. Only the population's fan-out builds `Broadcast`; the scenario wire and
 * every external ingress decode to `Targeted`, so no caller can set it (PC-SIGNAL-04).
 */
export enum SignalReach {
  /** A request naming one occurrence, admitted only under `signalDelivery = occurrenceTargeted` (CIB-EXT-0042). */
  Targeted = "targeted",
  /** One receiver of a broadcast or of a thrown Signal's intent, taken from the population's snapshot. */
  Broadcast = "broadcast",
}

/** What a delivery delivers. An addressless Receive stays a delivery on the unspecified channel (CIB-INT-0004). */
export enum DeliveryTriggerTag { Message = "message", Signal = "signal" }

export type DeliveryTrigger =
  | { readonly tag: DeliveryTriggerTag.Message; readonly channel: MessageChannel }
  | { readonly tag: DeliveryTriggerTag.Signal; readonly address: SignalAddress; readonly reach: SignalReach };

export enum CriterionTargetTag {
  ProcessVariable = "processVariable",
  LocalVariable = "localVariable",
  BusinessKey = "businessKey",
  ProcessInstance = "processInstance",
}

export type CriterionTarget =
  | { readonly tag: CriterionTargetTag.ProcessVariable; readonly name: string }
  | { readonly tag: CriterionTargetTag.LocalVariable; readonly name: string }
  | { readonly tag: CriterionTargetTag.BusinessKey }
  | { readonly tag: CriterionTargetTag.ProcessInstance };

/** A present null matches only a present null; an absent name matches nothing (PC-MESSAGE-08). */
export interface CorrelationMatch { readonly target: CriterionTarget; readonly expected: Value; }

/**
 * A Message or Signal delivered to the subscription `occurrence` names. `variables` are the delivery's own variables
 * beside its payload, which CIB installs in the receiving scope (CIB-EXT-0025); `step` rejects a non-empty list
 * (`delivery-variables-not-admitted`) while no profile installs them.
 */
export interface DeliveryInput {
  readonly occurrence: OccurrenceRef;
  readonly trigger: DeliveryTrigger;
  readonly correlation: readonly CorrelationMatch[];
  readonly payload: Value | null;
  readonly variables: readonly Binding[];
  /** The input's logical time (`Input.atMs`). */
  readonly atMs: number | null;
}

// Inputs

export interface StartInput {
  readonly instanceId: string;
  readonly startEvent: ElementId | null;
  readonly variables: readonly Binding[];
  readonly trigger: StartTrigger;
  readonly businessKey: string | null;
  /** The input's logical time (`Input.atMs`). */
  readonly atMs: number | null;
}

export enum CommandActionTag {
  CompleteUserTask = "completeUserTask",
  RetryIncident = "retryIncident",
  CancelIncidentProcess = "cancelIncidentProcess",
  SetVariables = "setVariables",
  RemoveVariables = "removeVariables",
}

/**
 * An incident command names the incident's `generation` (`IncidentDetail.generation`) beside its occurrence, so a command
 * issued against an incident that has since been resolved or reopened is rejected rather than applied to another one.
 */
export type CommandAction =
  | { readonly tag: CommandActionTag.CompleteUserTask; readonly values: readonly Binding[] }
  | { readonly tag: CommandActionTag.RetryIncident; readonly generation: number }
  | { readonly tag: CommandActionTag.CancelIncidentProcess; readonly generation: number }
  | { readonly tag: CommandActionTag.SetVariables; readonly values: readonly Binding[] }
  | { readonly tag: CommandActionTag.RemoveVariables; readonly names: readonly string[] };

export interface CommandInput { readonly occurrence: OccurrenceRef; readonly action: CommandAction; readonly atMs: number | null; }

export interface TimerInput { readonly occurrence: OccurrenceRef; readonly logicalTimeMs: number; readonly atMs: number | null; }

export enum EffectOutcomeTag {
  Success = "success",
  BusinessFailure = "businessFailure",
  TechnicalFailure = "technicalFailure",
}

export type EffectOutcome =
  | { readonly tag: EffectOutcomeTag.Success; readonly outputs: readonly Binding[] }
  | {
      readonly tag: EffectOutcomeTag.BusinessFailure;
      readonly code: string;
      readonly message: string | null;
      readonly outputs: readonly Binding[];
    }
  | { readonly tag: EffectOutcomeTag.TechnicalFailure };

export interface EffectInput { readonly occurrence: OccurrenceRef; readonly outcome: EffectOutcome; readonly atMs: number | null; }

/**
 * Guarded type: `step.ts` owns matching on it. Every payload carries `atMs`, the input's logical time in milliseconds:
 * the clock advances to it before the input's transition, so a timer armed by the input counts from it, and `null` leaves
 * the clock where it is. Logical time is an explicit input, never a wall clock.
 */
export type Input =
  | { readonly tag: InputTag.Start; readonly payload: StartInput }
  | { readonly tag: InputTag.Command; readonly payload: CommandInput }
  | { readonly tag: InputTag.Deliver; readonly payload: DeliveryInput }
  | { readonly tag: InputTag.TimerFire; readonly payload: TimerInput }
  | { readonly tag: InputTag.EffectResult; readonly payload: EffectInput };

/** What an expression reads: the variables in view and the logical time, never a wall clock. */
export interface EvalContext {
  readonly variables: readonly Binding[];
  readonly nowMs: number;
  /**
   * Whether a JUEL result passes the portable-domain check before the site sees it, `true` when absent; the
   * Multi-Instance count and collection sites read it first (EXPRESSION-SEMANTICS-SPEC "Multi-Instance level", Results).
   */
  readonly domainChecked?: boolean;
}
