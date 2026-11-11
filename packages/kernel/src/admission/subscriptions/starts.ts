/**
 * Admission of triggered start Events, transcribed from `Kernel/Admission/Subscriptions/Starts.lean`. A refusal carries a
 * stable code. A root start Event, which a start input names or its trigger fires, and an Event Sub-Process start. The
 * one dispatch on a start's trigger lives here (`triggered`).
 */
import {
  ConditionalStart,
  TriggerTag,
  assertNever,
  elementStart,
  programChildren,
  programProcessChildren,
  type ConditionTrigger,
  type Element,
  type Expression,
  type Program,
  type ProfileOptions,
  type Subscription,
  type Trigger,
} from "../../il/types.js";
import {
  conditionRefusal,
  definitions,
  errorTrigger,
  escalationTrigger,
  message,
  sameData,
  signalAddress,
  subscriptionOutputs,
  timerAt,
  unread,
  type Admitted,
  type Reading,
} from "../subscriptions.js";

/**
 * A root Conditional start. BPMN 2.0.2 Table 10.84 puts the environment its condition reads outside the standard, so it
 * is refused unless the profile evaluates it over submitted variables (`ConditionalStart.submittedContext`,
 * CIB-EXT-0044). CIB deploys and ignores `camunda:variableEvents` there (`DefaultConditionHandler.java:121-134`), so it
 * is refused under every profile rather than given a meaning.
 */
function rootCondition(options: ProfileOptions, reading: Reading, trigger: ConditionTrigger): string | null {
  if (options.conditionalStart === ConditionalStart.Refused) return "start.condition";
  if (trigger.variableEvents.length > 0) return "start.condition.variableEvents";
  return conditionRefusal(options, reading, trigger);
}

/**
 * What admission reads of a triggered start's trigger: its refusal and Signal (`Admitted`), and a root Conditional
 * start's predicate, which `startConditions` compares across one process level.
 */
export type Triggered = Admitted & Readonly<{ predicate: Expression | null }>;

const refusing = (refusal: string | null): Triggered => ({ refusal, signal: null, predicate: null });

/**
 * The one dispatch on a start's trigger. At process level (`nested = false`) the start input names it; nested, it is an
 * Event Sub-Process start, which may also repeat a cycle and catch what `feature/propagation.ts` raises.
 */
export function triggered(options: ProfileOptions, reading: Reading, nested: boolean, trigger: Trigger): Triggered {
  const variables = options.errorCatchVariables;
  const raised = (code: string): string | null => (nested ? null : code);
  switch (trigger.tag) {
    case TriggerTag.Timer:
      return refusing(timerAt(options, reading, !nested, trigger.payload));
    case TriggerTag.Message:
      return refusing(message(options, reading, !nested, trigger.payload));
    case TriggerTag.Signal:
      return {
        refusal: signalAddress(options, reading, !nested, trigger.payload.signalRef, trigger.payload.name),
        signal: trigger.payload,
        predicate: null,
      };
    case TriggerTag.Condition:
      return nested
        ? refusing(conditionRefusal(options, reading, trigger.payload))
        : { refusal: rootCondition(options, reading, trigger.payload), signal: null, predicate: trigger.payload.condition };
    case TriggerTag.Error:
      return refusing(raised("start.error") ?? errorTrigger(variables, trigger.payload));
    case TriggerTag.Escalation:
      return refusing(raised("start.escalation") ?? escalationTrigger(variables, trigger.payload));
    case TriggerTag.Compensation:
      return refusing(raised("start.compensation"));
    case TriggerTag.Cancel:
      return refusing("start.cancel");
  }
  return assertNever(trigger);
}

/** A triggered start's refusal. */
export function start(options: ProfileOptions, reading: Reading, nested: boolean, subscription: Subscription): string | null {
  return definitions(subscription) ?? subscriptionOutputs(subscription) ?? triggered(options, reading, nested, subscription.trigger).refusal;
}

/**
 * Two Conditional starts of one process level with equal predicates are refused (`start.condition.duplicate`,
 * CIB-LIM-0027): CIB refuses two with one condition text (`BpmnParse.java:1289-1292`, `:1305-1315`), and the IL keeps a
 * predicate's parsed form, not its text. Parsed forms compare structurally (`sameData`), without a dispatch over the
 * guarded JUEL types (guards 2 and 18).
 */
export function startConditions(program: Program): string | null {
  if (program.options.conditionalStart === ConditionalStart.Refused) return null;
  const level = (elements: readonly Element[]): string | null => {
    const predicates = elements.flatMap((element) => {
      const subscription = elementStart(element)?.[1].subscription ?? null;
      const predicate = subscription === null ? null : triggered(program.options, unread, false, subscription.trigger).predicate;
      return predicate === null ? [] : [predicate];
    });
    return predicates.some((predicate, index) => predicates.slice(0, index).some((earlier) => sameData(earlier, predicate)))
      ? "start.condition.duplicate"
      : null;
  };
  return level(programChildren(program, null)) ??
    program.processes.reduce<string | null>((found, process) => found ?? level(programProcessChildren(program, process)), null);
}
