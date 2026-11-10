/**
 * Open-wait details, transcribed from `Kernel/State/Wait.lean`: what an open item publishes besides its identity,
 * one typed detail per `OpenKind`, and `WaitView`, the uniform reading of an open wait. Part of `state.ts`, which
 * re-exports it.
 */
import { assertNever, type Value } from "../il/types.js";

export type Binding = readonly [string, Value];

/**
 * What an open User Task publishes besides its identity. Metadata is published only when the task carries candidate
 * groups; form fields are `(key, type)` pairs.
 */
export interface UserTaskDetail {
  readonly name: string | null;
  readonly assignee: string | null;
  readonly candidateUsers: readonly string[];
  readonly candidateGroups: readonly string[];
  readonly formKey: string | null;
  readonly formFields: readonly (readonly [string, string])[];
  readonly dueDate: string | null;
  readonly followUpDate: string | null;
  readonly priority: number | null;
  readonly inputs: readonly Binding[];
}

/**
 * A Message address: the Message's identifier and, when the model routes it through an Operation, that Operation.
 * `messageId = null` is an unspecified Message.
 */
export interface MessageChannel {
  readonly messageId: string | null;
  readonly interfaceRef: string | null;
  readonly operationRef: string | null;
}

/** Lean's derived `DecidableEq MessageChannel`. */
export function messageChannelEquals(left: MessageChannel, right: MessageChannel): boolean {
  return left.messageId === right.messageId && left.interfaceRef === right.interfaceRef &&
    left.operationRef === right.operationRef;
}

/** `Option MessageChannel` equality. */
export function optionalChannelEquals(left: MessageChannel | null, right: MessageChannel | null): boolean {
  return left === null || right === null ? left === right : messageChannelEquals(left, right);
}

/**
 * `payload`: the delivery carries a payload the wait writes. `criteria` are the correlation keys a delivery must match:
 * such a wait is published as a definition-scoped correlated publication, never as a directly addressed delivery.
 */
export interface MessageWaitDetail {
  readonly channel: MessageChannel;
  readonly payload: boolean;
  readonly criteria: readonly string[];
}

export interface SignalWaitDetail { readonly name: string; readonly payload: boolean; }

/** `lastValue` is the most recent evaluation under `conditionalRetrigger.edge`; `null` under `eachWrite`, where every passing write is its own fact (PC-CONDITION-01). */
export interface ConditionalWaitDetail {
  readonly variableName: string | null;
  readonly variableEvents: readonly string[];
  readonly lastValue: boolean | null;
}

/** How a Timer repeats after it fires; `remaining = null` is unbounded (PC-TIMER-02). A cycle is captured once armed (PC-TIMER-03). */
export interface TimerRecurrence {
  readonly periodMs: number | null;
  readonly cron: string | null;
  readonly remaining: number | null;
}

export interface TimerDetail { readonly deadlineMs: number; readonly recurrence: TimerRecurrence | null; }

/** What a Send Task's or throwing Message's effect addresses (PC-AUTO-04, PC-MESSAGE-09). */
export interface SendDescriptor { readonly recipient: string | null; readonly correlation: readonly Binding[]; }

/** `failures` counts the incidents this effect occurrence has had; a retry reopens it with the same activation. */
export interface EffectDetail {
  readonly protocol: string;
  readonly operation: string;
  readonly arguments: readonly Binding[];
  readonly failures: number;
  readonly send: SendDescriptor | null;
}

/** `cancellable` publishes the `cancelIncidentProcess` interaction beside `retryIncident`. */
export interface IncidentDetail {
  readonly effect: EffectDetail;
  readonly generation: number;
  readonly cancellable: boolean;
}

/**
 * Guarded type: only `openKindView` and the codec match on it. Each kind carries the typed detail its public
 * observation needs, filled by the feature that opens the item.
 */
export enum OpenKindTag {
  UserTask = "userTask",
  Message = "message",
  Signal = "signal",
  Conditional = "conditional",
  Timer = "timer",
  Effect = "effect",
  Incident = "incident",
}

export type OpenKind =
  | { readonly tag: OpenKindTag.UserTask; readonly detail: UserTaskDetail }
  | { readonly tag: OpenKindTag.Message; readonly detail: MessageWaitDetail }
  | { readonly tag: OpenKindTag.Signal; readonly detail: SignalWaitDetail }
  | { readonly tag: OpenKindTag.Conditional; readonly detail: ConditionalWaitDetail }
  | { readonly tag: OpenKindTag.Timer; readonly detail: TimerDetail }
  | { readonly tag: OpenKindTag.Effect; readonly detail: EffectDetail }
  | { readonly tag: OpenKindTag.Incident; readonly detail: IncidentDetail };

/** Guarded type: `step.ts` owns matching on it. The inputs a host can submit, one per `Input` constructor. */
export enum InputTag {
  Start = "start",
  Command = "command",
  Deliver = "deliver",
  TimerFire = "timerFire",
  EffectResult = "effectResult",
}

/**
 * One open wait, read uniformly: which input closes it, `null` for a wait a variable write closes, how publication
 * names it, and its typed detail. No consumer matches `OpenKind`; each reads the field it is about.
 */
export interface WaitView {
  readonly input: InputTag | null;
  readonly published: readonly [string, number] | null;
  readonly deadlineMs: number | null;
  readonly recurrence: TimerRecurrence | null;
  readonly channel: MessageChannel | null;
  readonly payload: boolean;
  readonly criteria: readonly string[];
  readonly signal: SignalWaitDetail | null;
  readonly conditional: ConditionalWaitDetail | null;
  readonly userTask: UserTaskDetail | null;
  readonly effect: EffectDetail | null;
  readonly incident: IncidentDetail | null;
}

const emptyView: WaitView = {
  input: null,
  published: null,
  deadlineMs: null,
  recurrence: null,
  channel: null,
  payload: false,
  criteria: [],
  signal: null,
  conditional: null,
  userTask: null,
  effect: null,
  incident: null,
};

export function openKindView(kind: OpenKind): WaitView {
  switch (kind.tag) {
    case OpenKindTag.UserTask:
      return { ...emptyView, input: InputTag.Command, published: ["userTask", 0], userTask: kind.detail };
    case OpenKindTag.Message:
      return {
        ...emptyView,
        input: InputTag.Deliver,
        published: ["message", 1],
        channel: kind.detail.channel,
        payload: kind.detail.payload,
        criteria: kind.detail.criteria,
      };
    case OpenKindTag.Signal:
      return { ...emptyView, input: InputTag.Deliver, signal: kind.detail, payload: kind.detail.payload };
    case OpenKindTag.Conditional: return { ...emptyView, input: null, conditional: kind.detail };
    case OpenKindTag.Timer:
      return {
        ...emptyView,
        input: InputTag.TimerFire,
        published: ["timer", 2],
        deadlineMs: kind.detail.deadlineMs,
        recurrence: kind.detail.recurrence,
      };
    case OpenKindTag.Effect:
      return { ...emptyView, input: InputTag.EffectResult, published: ["effect", 3], effect: kind.detail };
    case OpenKindTag.Incident:
      return { ...emptyView, input: InputTag.Command, published: ["incident", 4], incident: kind.detail };
  }
  return assertNever(kind);
}
