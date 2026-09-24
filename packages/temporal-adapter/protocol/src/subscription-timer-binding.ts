import {
  REPEATABLE_EVENT_SUBSCRIPTIONS_CHECKPOINT_PROFILE_ID,
  isWellFormedWireString,
} from "@bpmn-lean/semantic-core";
import type {
  DeepReadonly,
  RuntimeState,
  SemanticProcessProgram,
  TimerOccurrenceId,
} from "@bpmn-lean/semantic-core";

import { requireWorkflowChainPlainDataTree } from "./workflow-chain-plain-data.js";

export const bpmnSubscriptionTimerV1 = "bpmn-lean.subscription-timer.v1" as const;

/** Private due-time binding carried under ESL-HANDOFF-01, never semantic state. */
export type BpmnSubscriptionTimerBindingV1 = DeepReadonly<{
  protocol: typeof bpmnSubscriptionTimerV1;
  timer: null | {
    id: TimerOccurrenceId;
    logicalDeadlineMs: number;
    dueTimeMs: number;
  };
}>;

export function requireBpmnSubscriptionTimerBindingV1(
  value: unknown,
): BpmnSubscriptionTimerBindingV1 {
  requireWorkflowChainPlainDataTree(value);
  if (!isRecord(value) || !hasOnlyKeys(value, ["protocol", "timer"]) ||
    value.protocol !== bpmnSubscriptionTimerV1) {
    throw new TypeError("Malformed subscription Timer binding");
  }
  if (value.timer !== null) {
    const timer = value.timer;
    if (!isRecord(timer) || !hasOnlyKeys(timer, ["id", "logicalDeadlineMs", "dueTimeMs"]) ||
      !isRecord(timer.id) ||
      !hasOnlyKeys(timer.id, ["processInstanceId", "elementId", "activation"]) ||
      !isNonemptyWireString(timer.id.processInstanceId) ||
      !isNonemptyWireString(timer.id.elementId) ||
      !isSafeInteger(timer.id.activation, 1) ||
      !isSafeInteger(timer.logicalDeadlineMs, 0) ||
      !isSafeInteger(timer.dueTimeMs, 0)) {
      throw new TypeError("Malformed subscription Timer binding");
    }
  }
  return value as BpmnSubscriptionTimerBindingV1;
}

/** Enforces ESL-HANDOFF-01 against the independently validated committed state. */
export function requireSubscriptionTimerBindingForState(
  program: SemanticProcessProgram,
  state: RuntimeState,
  binding: unknown,
): BpmnSubscriptionTimerBindingV1 | undefined {
  if (program.identity.semanticProfile !== REPEATABLE_EVENT_SUBSCRIPTIONS_CHECKPOINT_PROFILE_ID) {
    if (binding !== undefined) {
      throw new TypeError("Subscription Timer binding is forbidden for this profile");
    }
    return undefined;
  }
  if (binding === undefined) {
    throw new TypeError("Subscription Timer binding is required for this profile");
  }
  const decoded = requireBpmnSubscriptionTimerBindingV1(binding);
  if (decoded.timer === null) {
    if (state.timerWaits.length !== 0) {
      throw new TypeError("Null subscription Timer binding requires no committed Timer");
    }
    return decoded;
  }
  if (state.timerWaits.length !== 1) {
    throw new TypeError("Subscription Timer binding requires exactly one committed Timer");
  }
  const timer = state.timerWaits[0]!;
  if (decoded.timer.id.processInstanceId !== timer.id.processInstanceId ||
    decoded.timer.id.elementId !== timer.id.elementId ||
    decoded.timer.id.activation !== timer.id.activation ||
    decoded.timer.logicalDeadlineMs !== timer.deadlineMs) {
    throw new TypeError("Subscription Timer binding differs from the committed Timer");
  }
  return decoded;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function isNonemptyWireString(value: unknown): value is string {
  return isWellFormedWireString(value) && value.length > 0;
}

function isSafeInteger(value: unknown, minimum: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum;
}
