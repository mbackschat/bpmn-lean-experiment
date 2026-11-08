/**
 * Admission of catch Events, boundaries and triggered starts, transcribed from
 * `Kernel/Admission/Subscriptions.lean`. A refusal carries a stable code.
 *
 * Admitted: Timers with a literal exact duration (a cycle only on a boundary or an Event Sub-Process start),
 * Messages with a literal or unspecified name and no correlation, a correlated Message only on a catch Event, and,
 * on boundaries, the triggers that
 * propagation delivers (Error, Escalation, Compensation, Cancel).
 */
import {
  CycleDialect,
  ExpressionTag,
  TimerScheduleTag,
  TriggerTag,
  ValueSourceTag,
  assertNever,
  type Boundary,
  type MessageTrigger,
  type Subscription,
  type TimerTrigger,
  type ValueSource,
} from "../il/types.js";
import { cyclePeriodMs, durationMs } from "../il/timer.js";
import { valueSourceLiteral } from "../il/query.js";

/** `cycles` admits an unbounded cycle, which only an attached subscription can repeat. */
export function timer(cycles: boolean, trigger: TimerTrigger): string | null {
  const schedule = trigger.schedule;
  switch (schedule.tag) {
    case TimerScheduleTag.Duration: {
      const lexeme = valueSourceLiteral(schedule.value);
      return lexeme !== null && durationMs(lexeme) !== null ? null : "timer.duration";
    }
    case TimerScheduleTag.Date:
      return "timer.date";
    case TimerScheduleTag.Cycle:
      switch (schedule.dialect) {
        case CycleDialect.Iso8601: {
          if (!cycles) {
            return "timer.cycleNotAttached";
          }
          const lexeme = valueSourceLiteral(schedule.value);
          return lexeme !== null && cyclePeriodMs(lexeme) !== null ? null : "timer.cycle";
        }
        case CycleDialect.Cron:
          return "timer.cron";
      }
      return assertNever(schedule.dialect);
  }
  return assertNever(schedule);
}

export function message(trigger: MessageTrigger): string | null {
  if (trigger.correlation.length > 0) {
    return "message.correlation";
  }
  return trigger.name !== null && valueSourceLiteral(trigger.name) === null ? "message.nameExpression" : null;
}

/**
 * A correlated catch, as docs/capsules/MESSAGE-KEY-CORRELATION-SPEC.md bounds it: one key bound to a variable, an
 * Operation channel, and no output, since its payload is never written.
 */
export function correlatedCatch(subscription: Subscription, trigger: MessageTrigger): string | null {
  const [criterion, ...others] = trigger.correlation;
  if (criterion === undefined) {
    return message(trigger);
  }
  if (others.length > 0) {
    return "message.correlation.keys";
  }
  if (subscription.outputs.length > 0) {
    return "message.correlation.output";
  }
  if (trigger.name === null || trigger.interfaceRef === null || trigger.operationRef === null) {
    return "message.correlation.channel";
  }
  const value = criterion.value;
  switch (value.tag) {
    case ExpressionTag.Variable:
      return message({ ...trigger, correlation: [] });
    case ExpressionTag.Literal:
    case ExpressionTag.SimpleBoolean:
    case ExpressionTag.Foreign:
      return "message.correlation.value";
  }
  return assertNever(value);
}

export function catchEvent(subscription: Subscription): string | null {
  const trigger = subscription.trigger;
  switch (trigger.tag) {
    case TriggerTag.Timer:
      return timer(false, trigger.payload);
    case TriggerTag.Message:
      return correlatedCatch(subscription, trigger.payload);
    case TriggerTag.Signal:
      return "event.catch.signal";
    case TriggerTag.Condition:
      return "event.catch.condition";
    case TriggerTag.Error:
      return "event.catch.error";
    case TriggerTag.Escalation:
      return "event.catch.escalation";
    case TriggerTag.Compensation:
      return "event.catch.compensation";
    case TriggerTag.Cancel:
      return "event.catch.cancel";
  }
  return assertNever(trigger);
}

export function boundary(candidate: Boundary): string | null {
  const trigger = candidate.subscription.trigger;
  switch (trigger.tag) {
    case TriggerTag.Timer:
      return timer(true, trigger.payload);
    case TriggerTag.Message:
      return message(trigger.payload);
    case TriggerTag.Signal:
      return "boundary.signal";
    case TriggerTag.Condition:
      return "boundary.condition";
    case TriggerTag.Error:
    case TriggerTag.Escalation:
    case TriggerTag.Compensation:
    case TriggerTag.Cancel:
      return null;
  }
  return assertNever(trigger);
}

export function boundaries(list: readonly Boundary[]): string | null {
  for (const candidate of list) {
    const refusal = boundary(candidate);
    if (refusal !== null) {
      return refusal;
    }
  }
  return null;
}

/**
 * A triggered start. At process level (`nested = false`) the start input names it; nested, it is an Event
 * Sub-Process start, which may also repeat a cycle and catch what propagation raises.
 */
export function start(nested: boolean, subscription: Subscription): string | null {
  const raised = (code: string): string | null => (nested ? null : code);
  const trigger = subscription.trigger;
  switch (trigger.tag) {
    case TriggerTag.Timer:
      return timer(nested, trigger.payload);
    case TriggerTag.Message:
      return message(trigger.payload);
    case TriggerTag.Signal:
      return "start.signal";
    case TriggerTag.Condition:
      return "start.condition";
    case TriggerTag.Error:
      return raised("start.error");
    case TriggerTag.Escalation:
      return raised("start.escalation");
    case TriggerTag.Compensation:
      return raised("start.compensation");
    case TriggerTag.Cancel:
      return "start.cancel";
  }
  return assertNever(trigger);
}
