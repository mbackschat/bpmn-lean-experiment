/**
 * Admission of catch Events, boundaries and triggered starts, transcribed from `Kernel/Admission/Subscriptions.lean`. A
 * refusal carries a stable code.
 *
 * Admitted: Timers with a literal exact duration (a cycle only on a boundary), Messages with a literal name and no
 * correlation, a correlated Message only on a catch Event, and, on boundaries, the triggers that
 * `feature/propagation.ts` delivers (an interrupting Error, Escalation, Compensation, and Cancel on a Transaction).
 */
import {
  CycleDialect,
  ErrorCatchVariables,
  ExpressionTag,
  TimerScheduleTag,
  TriggerTag,
  ValueSourceTag,
  assertNever,
  triggerMessage,
  valueSourceLiteral,
  type Boundary,
  type CorrelationCriterion,
  type ErrorTrigger,
  type EscalationTrigger,
  type MessageTrigger,
  type Subscription,
  type TimerTrigger,
  type ValueSource,
} from "../il/types.js";
import { cyclePeriodMs, durationMs } from "../il/timer.js";

function literalMs(value: ValueSource, read: (lexeme: string) => number | null): number | null {
  const lexeme = valueSourceLiteral(value);
  return lexeme === null ? null : read(lexeme);
}

/** `cycles` admits an unbounded cycle, which only an attached subscription can repeat. */
export function timer(cycles: boolean, trigger: TimerTrigger): string | null {
  const schedule = trigger.schedule;
  switch (schedule.tag) {
    case TimerScheduleTag.Duration:
      return literalMs(schedule.value, durationMs) === null ? "timer.duration" : null;
    case TimerScheduleTag.Date:
      return "timer.date";
    case TimerScheduleTag.Cycle:
      switch (schedule.dialect) {
        case CycleDialect.Cron:
          return "timer.cron";
        case CycleDialect.Iso8601:
          if (!cycles) return "timer.cycleNotAttached";
          return literalMs(schedule.value, cyclePeriodMs) === null ? "timer.cycle" : null;
      }
      return assertNever(schedule.dialect);
  }
  return assertNever(schedule);
}

/**
 * An interrupting catch ends what it interrupts at its first firing, so a repeating Timer has no second firing to give;
 * no row selects a meaning for it.
 */
function interruptingCycle(trigger: TimerTrigger): string | null {
  switch (trigger.schedule.tag) {
    case TimerScheduleTag.Cycle:
      return "timer.interruptingCycle";
    case TimerScheduleTag.Duration:
    case TimerScheduleTag.Date:
      return null;
  }
  return assertNever(trigger.schedule);
}

/**
 * A Message subscription is addressed by its Message (`messageRef`, BPMN 2.0.2 §10.5.5); without one only an
 * occurrence-addressed command could reach it, which CIB-INT-0004 selects for a Receive Task alone, and
 * `BpmnParse#parseMessageEventDefinition` refuses it (PC-MESSAGE-01).
 */
export function message(trigger: MessageTrigger): string | null {
  if (trigger.correlation.length > 0) return "message.correlation";
  if (trigger.name === null) return "message.unnamed";
  switch (trigger.name.tag) {
    case ValueSourceTag.Expression:
      return "message.nameExpression";
    case ValueSourceTag.Literal:
      return null;
  }
  return assertNever(trigger.name);
}

function criterionValue(subscription: Subscription, trigger: MessageTrigger, criterion: CorrelationCriterion): string | null {
  if (subscription.outputs.length > 0) return "message.correlation.output";
  if (trigger.name === null || trigger.interfaceRef === null || trigger.operationRef === null) return "message.correlation.channel";
  const value = criterion.value;
  switch (value.tag) {
    case ExpressionTag.Variable:
      return message({ ...trigger, correlation: [] });
    case ExpressionTag.Literal:
    case ExpressionTag.SimpleBoolean:
      return "message.correlation.value";
    case ExpressionTag.Juel:
      return "expression.juel.site";
    case ExpressionTag.Foreign:
      return "expression.outsideSimpleBoolean";
  }
  return assertNever(value);
}

/**
 * A correlated catch, as the [specification](../../../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md)
 * bounds it: one key bound to a variable, an Operation channel, and no output, since its payload is never written.
 */
function correlatedCatch(subscription: Subscription, trigger: MessageTrigger): string | null {
  const [criterion, ...others] = trigger.correlation;
  if (criterion === undefined) return message(trigger);
  if (others.length > 0) return "message.correlation.keys";
  return criterionValue(subscription, trigger, criterion);
}

/** Only a Message subscription writes what its delivery carries; any other trigger's outputs would be dropped. */
function outputs(subscription: Subscription): string | null {
  return triggerMessage(subscription.trigger) !== null || subscription.outputs.length === 0 ? null : "event.outputs";
}

/** Catch variables are a CIB extension (CIB-EXT-0028) the profile selects; BPMN 2.0.2 defines none. */
function errorTrigger(variables: ErrorCatchVariables, trigger: ErrorTrigger): string | null {
  switch (variables) {
    case ErrorCatchVariables.EventScope:
      return null;
    case ErrorCatchVariables.Refused:
      if (trigger.codeVariable !== null) return "event.error.codeVariable";
      if (trigger.messageVariable !== null) return "event.error.messageVariable";
      return null;
  }
  return assertNever(variables);
}

function escalationTrigger(trigger: EscalationTrigger): string | null {
  return trigger.codeVariable !== null ? "event.escalation.codeVariable" : null;
}

/**
 * An interrupting Event Sub-Process started by a Message has no selected meaning for the Scope it interrupts; an Error
 * Event Sub-Process always interrupts (BPMN 2.0.2 Table 10.86, Table 10.87 `isInterrupting`, §13.5.4) (PC-ERROR-02).
 */
export function eventSubProcess(start: Subscription, interrupting: boolean): string | null {
  const trigger = start.trigger;
  switch (trigger.tag) {
    case TriggerTag.Message:
      return interrupting ? "scope.eventSubProcess.interruptingMessage" : null;
    case TriggerTag.Timer:
      return interrupting ? interruptingCycle(trigger.payload) : null;
    case TriggerTag.Error:
      return interrupting ? null : "start.error.nonInterrupting";
    case TriggerTag.Signal:
    case TriggerTag.Condition:
    case TriggerTag.Escalation:
    case TriggerTag.Compensation:
    case TriggerTag.Cancel:
      return null;
  }
  return assertNever(trigger);
}

export function catchEvent(subscription: Subscription): string | null {
  const refused = outputs(subscription);
  if (refused !== null) return refused;
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

/**
 * `transactionHost` says whether the boundary hangs on a Transaction. An Error boundary always interrupts (BPMN 2.0.2
 * Table 10.90) (PC-ERROR-01); a Cancel boundary always interrupts and hangs only on a Transaction (Table 10.90, §10.3.5;
 * `BpmnParse#parseBoundaryCancelEventDefinition`) (PC-TX-02). `seen` holds the codes of the host's Error boundaries
 * before this one, and an admitted Error boundary adds its own. Two with one code are refused: BPMN 2.0.2 §10.5.6
 * allows one interrupting handler per Event Declaration and states no precedence between two declarations of one code,
 * so the kernel restricts a host to one boundary per code, and CIB's first in document order (`BpmnParse:3646`) is not
 * adopted (PC-ERROR-01).
 */
function boundary(variables: ErrorCatchVariables, transactionHost: boolean, seen: Set<string>, attached: Boundary): string | null {
  const refused = outputs(attached.subscription);
  if (refused !== null) return refused;
  const trigger = attached.subscription.trigger;
  switch (trigger.tag) {
    case TriggerTag.Timer:
      return (attached.interrupting ? interruptingCycle(trigger.payload) : null) ?? timer(true, trigger.payload);
    case TriggerTag.Message:
      return message(trigger.payload);
    case TriggerTag.Signal:
      return "boundary.signal";
    case TriggerTag.Condition:
      return "boundary.condition";
    case TriggerTag.Error: {
      const declared = (attached.interrupting ? null : "boundary.error.nonInterrupting") ?? errorTrigger(variables, trigger.payload);
      if (declared !== null) return declared;
      const code = trigger.payload.code;
      if (code === null) return null;
      if (seen.has(code)) return "boundary.error.duplicateCode";
      seen.add(code);
      return null;
    }
    case TriggerTag.Escalation:
      return escalationTrigger(trigger.payload);
    case TriggerTag.Compensation:
      return null;
    case TriggerTag.Cancel:
      if (!transactionHost) return "boundary.cancel.host";
      return attached.interrupting ? null : "boundary.cancel.nonInterrupting";
  }
  return assertNever(trigger);
}

export function boundaries(variables: ErrorCatchVariables, transactionHost: boolean, list: readonly Boundary[]): string | null {
  const seen = new Set<string>();
  for (const attached of list) {
    const refused = boundary(variables, transactionHost, seen, attached);
    if (refused !== null) return refused;
  }
  return null;
}

/**
 * A triggered start. At process level (`nested = false`) the start input names it; nested, it is an Event Sub-Process
 * start, which may also repeat a cycle and catch what `feature/propagation.ts` raises.
 */
export function start(variables: ErrorCatchVariables, nested: boolean, subscription: Subscription): string | null {
  const raised = (code: string): string | null => (nested ? null : code);
  const refused = outputs(subscription);
  if (refused !== null) return refused;
  const trigger = subscription.trigger;
  switch (trigger.tag) {
    case TriggerTag.Timer:
      return timer(nested, trigger.payload);
    case TriggerTag.Message:
      return (!nested && subscription.outputs.length > 0 ? "start.message.outputs" : null) ?? message(trigger.payload);
    case TriggerTag.Signal:
      return "start.signal";
    case TriggerTag.Condition:
      return "start.condition";
    case TriggerTag.Error:
      return raised("start.error") ?? errorTrigger(variables, trigger.payload);
    case TriggerTag.Escalation:
      return raised("start.escalation") ?? escalationTrigger(trigger.payload);
    case TriggerTag.Compensation:
      return raised("start.compensation");
    case TriggerTag.Cancel:
      return "start.cancel";
  }
  return assertNever(trigger);
}
