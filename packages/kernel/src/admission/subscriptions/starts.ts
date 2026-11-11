/**
 * Admission of triggered start Events, transcribed from `Kernel/Admission/Subscriptions/Starts.lean`. A refusal carries a
 * stable code. A root start Event, which a start input names or its trigger fires, and an Event Sub-Process start. The
 * one dispatch on a start's trigger lives here (`triggered`); an Event Sub-Process start's Signal is
 * `admission/subscriptions.ts`' `eventSubProcessSignal`.
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
  eventSubProcessSignal,
  message,
  subscriptionOutputs,
  timerAt,
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
 * What admission reads of a triggered start's trigger: its refusal, and a root Conditional start's predicate, which
 * `startConditions` compares across one process level.
 */
type Triggered = Readonly<{ refusal: string | null; predicate: Expression | null }>;

const refusing = (refusal: string | null): Triggered => ({ refusal, predicate: null });

/**
 * The one dispatch on a start's trigger. At process level (`nested = false`) the start input names it; nested, it is an
 * Event Sub-Process start, which may also repeat a cycle and catch what `feature/propagation.ts` raises.
 */
function triggered(options: ProfileOptions, reading: Reading, nested: boolean, trigger: Trigger): Triggered {
  const variables = options.errorCatchVariables;
  const raised = (code: string): string | null => (nested ? null : code);
  switch (trigger.tag) {
    case TriggerTag.Timer:
      return refusing(timerAt(options, reading, !nested, trigger.payload));
    case TriggerTag.Message:
      return refusing(message(options, reading, !nested, trigger.payload));
    case TriggerTag.Signal:
      return refusing(nested ? eventSubProcessSignal(trigger.payload) : "start.signal");
    case TriggerTag.Condition:
      return nested
        ? refusing(conditionRefusal(options, reading, trigger.payload))
        : { refusal: rootCondition(options, reading, trigger.payload), predicate: trigger.payload.condition };
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

/** The reading of a site that reads no expression, for a predicate `startConditions` only compares. */
const unread: Reading = { juel: () => null, name: () => null };

/**
 * Structural equality of two IL values, Lean's derived-`Repr` comparison in `startConditions`: list order counts, a
 * `bigint` compares by value, and an object compares by its members whatever their insertion order, an absent member
 * equal to an `undefined` one.
 */
function sameData(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
      left.every((item, index) => sameData(item, right[index]));
  }
  if (typeof left === "object" && left !== null && typeof right === "object" && right !== null) {
    const leftMembers = left as Readonly<Record<string, unknown>>;
    const rightMembers = right as Readonly<Record<string, unknown>>;
    return [...new Set([...Object.keys(leftMembers), ...Object.keys(rightMembers)])]
      .every((key) => sameData(leftMembers[key], rightMembers[key]));
  }
  return left === right;
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
