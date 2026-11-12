/**
 * What an Activity does, one record per kind, and the IL's queries on it, transcribed from `Kernel/IL/Types/Work.lean`.
 * Part of `il/types.ts`, which re-exports it.
 */
import { assertNever, type ValueSource } from "./expression.js";
import type { CorrelationCriterion, EffectBinding, MessageTrigger } from "./message.js";
import type { CallBinding, CallWork } from "./reference.js";

export interface UserWork {
  readonly name: string | null;
  readonly assignee: ValueSource | null;
  readonly candidateUsers: readonly ValueSource[];
  readonly candidateGroups: readonly ValueSource[];
  readonly formKey: string | null;
  readonly formFields: readonly (readonly [string, string])[];
  readonly dueDate: ValueSource | null;
  readonly followUpDate: ValueSource | null;
  readonly priority: ValueSource | null;
}

/** `instantiate` marks a Receive Task that instantiates its Process (BPMN 2.0.2 §10.3.3, Table 10.10). */
export interface ReceiveWork { readonly message: MessageTrigger; readonly instantiate: boolean; }

/**
 * `handlerKey` is the root identifier of the `camunda:delegateExpression` the binding was read from, which CIB resolves
 * against process variables before its beans (CIB-LIM-0017); admission compares it with the declared names.
 */
export interface ServiceWork { readonly protocol: string; readonly operation: string; readonly handlerKey: string | null; }

export interface SendWork {
  readonly binding: EffectBinding;
  /** As `ServiceWork.handlerKey`. */
  readonly handlerKey: string | null;
  // guard-exception(19): a Send Task is refused whole (`work.send`, admission/work.ts).
  readonly recipient: ValueSource | null;
  readonly correlation: readonly CorrelationCriterion[];
  // guard-exception(19): refused with its Send Task, as `recipient` above.
  readonly messageRef: string | null;
  readonly operationRef: string | null;
}

export interface ScriptWork {
  // guard-exception(19): a Script Task is refused whole (`work.script`, admission/work.ts).
  readonly format: string;
  readonly source: string;
  readonly resultVariable: string | null;
}

export enum DecisionResultMapping {
  SingleEntry = "singleEntry",
  SingleResult = "singleResult",
  CollectEntries = "collectEntries",
  ResultList = "resultList",
}

export interface RuleWork {
  readonly decision: ValueSource;
  readonly resultVariable: string | null;
  readonly binding: CallBinding;
  readonly resultMapping: DecisionResultMapping;
  readonly tenant: ValueSource | null;
}

/** Guarded type: `feature/work` owns matching on it. */
export enum WorkTag {
  None = "none",
  Manual = "manual",
  User = "user",
  Receive = "receive",
  Service = "service",
  Send = "send",
  Script = "script",
  Rule = "rule",
  Call = "call",
}

export type Work =
  | { readonly tag: WorkTag.None }
  | { readonly tag: WorkTag.Manual }
  | { readonly tag: WorkTag.User; readonly payload: UserWork }
  | { readonly tag: WorkTag.Receive; readonly payload: ReceiveWork }
  | { readonly tag: WorkTag.Service; readonly payload: ServiceWork }
  | { readonly tag: WorkTag.Send; readonly payload: SendWork }
  | { readonly tag: WorkTag.Script; readonly payload: ScriptWork }
  | { readonly tag: WorkTag.Rule; readonly payload: RuleWork }
  | { readonly tag: WorkTag.Call; readonly payload: CallWork };

/** The Call a work record names, if it is one. */
export function workCall(work: Work): CallWork | null {
  switch (work.tag) {
    case WorkTag.Call: return work.payload;
    case WorkTag.None:
    case WorkTag.Manual:
    case WorkTag.User:
    case WorkTag.Receive:
    case WorkTag.Service:
    case WorkTag.Send:
    case WorkTag.Script:
    case WorkTag.Rule:
      return null;
  }
  return assertNever(work);
}

/** Whether the work opens a host effect (a Service Task). */
export function workIsService(work: Work): boolean {
  switch (work.tag) {
    case WorkTag.Service: return true;
    case WorkTag.None:
    case WorkTag.Manual:
    case WorkTag.User:
    case WorkTag.Receive:
    case WorkTag.Send:
    case WorkTag.Script:
    case WorkTag.Rule:
    case WorkTag.Call:
      return false;
  }
  return assertNever(work);
}

/** Whether the work opens a User Task. */
export function workIsUser(work: Work): boolean {
  switch (work.tag) {
    case WorkTag.User: return true;
    case WorkTag.None:
    case WorkTag.Manual:
    case WorkTag.Receive:
    case WorkTag.Service:
    case WorkTag.Send:
    case WorkTag.Script:
    case WorkTag.Rule:
    case WorkTag.Call:
      return false;
  }
  return assertNever(work);
}

/** The Message a work record waits for, if it does. */
export function workReceive(work: Work): MessageTrigger | null {
  switch (work.tag) {
    case WorkTag.Receive: return work.payload.message;
    case WorkTag.None:
    case WorkTag.Manual:
    case WorkTag.User:
    case WorkTag.Service:
    case WorkTag.Send:
    case WorkTag.Script:
    case WorkTag.Rule:
    case WorkTag.Call:
      return null;
  }
  return assertNever(work);
}
