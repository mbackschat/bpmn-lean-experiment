/**
 * Admission of triggered start Events, transcribed from `Kernel/Admission/Subscriptions/Starts.lean`. A refusal carries a
 * stable code. A root start Event, which a start input names or its trigger fires, and an Event Sub-Process start. The
 * one dispatch on a start's trigger lives here; an Event Sub-Process start's Signal is `admission/subscriptions.ts`'
 * `eventSubProcessSignal`.
 */
import { TriggerTag, assertNever, type ProfileOptions, type Subscription } from "../../il/types.js";
import {
  conditionRefusal,
  definitions,
  errorTrigger,
  escalationTrigger,
  eventSubProcessSignal,
  message,
  subscriptionOutputs,
  timerAt,
  type Reading,
} from "../subscriptions.js";

/**
 * A triggered start. At process level (`nested = false`) the start input names it; nested, it is an Event Sub-Process
 * start, which may also repeat a cycle and catch what `feature/propagation.ts` raises.
 */
export function start(options: ProfileOptions, reading: Reading, nested: boolean, subscription: Subscription): string | null {
  const variables = options.errorCatchVariables;
  const raised = (code: string): string | null => (nested ? null : code);
  const refused = definitions(subscription) ?? subscriptionOutputs(subscription);
  if (refused !== null) return refused;
  const trigger = subscription.trigger;
  switch (trigger.tag) {
    case TriggerTag.Timer:
      return timerAt(options, reading, !nested, trigger.payload);
    case TriggerTag.Message:
      return (!nested && subscription.outputs.length > 0 ? "start.message.outputs" : null) ?? message(options, reading, !nested, trigger.payload);
    case TriggerTag.Signal:
      return nested ? eventSubProcessSignal(trigger.payload) : "start.signal";
    case TriggerTag.Condition:
      return nested ? conditionRefusal(options, reading, trigger.payload) : "start.condition";
    case TriggerTag.Error:
      return raised("start.error") ?? errorTrigger(variables, trigger.payload);
    case TriggerTag.Escalation:
      return raised("start.escalation") ?? escalationTrigger(variables, trigger.payload);
    case TriggerTag.Compensation:
      return raised("start.compensation");
    case TriggerTag.Cancel:
      return "start.cancel";
  }
  return assertNever(trigger);
}
