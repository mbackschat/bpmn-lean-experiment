/**
 * Refusal tests of `admission/subscriptions.ts`: what a catch Event, a boundary, a triggered start and an Event
 * Sub-Process may wait for. Timers carry an exact literal duration (a cycle only on a repeating boundary or start),
 * Messages carry a literal name and one correlation key bound to a variable, and only a Message writes its payload.
 * Signal and Conditional triggers have no kernel meaning anywhere; Error, Escalation, Compensation and Cancel are
 * caught by boundaries and nested starts only.
 */
import {
  activity, append, boundary, cancelTrigger, catchEvent, channel, compensationTrigger, condition, criterion, cycle, date, duration,
  errorTrigger, escalationTrigger, eventSubProcess, foreign, literalValue, bool, mapping, message, refusalTests, replace, scope,
  signal, simpleBoolean, start, task, variable, computed, text, withOptions,
} from "./admission-refusal-support.ts";
import type { Json, Row } from "./admission-refusal-support.ts";

type Placement = (trigger: Json | string, outputs?: Json[]) => (program: Json) => Json;

const output = [mapping("x", variable("y"))];

/** `T` becomes a catch Event waiting for `trigger`. */
const catching: Placement = (trigger, outputs = []) => task(catchEvent("T", trigger, outputs));

/** `T` becomes a Task with an interrupting boundary `B` on `trigger`; `over` overrides the boundary's own fields. */
const bounded = (trigger: Json | string, over: Json = {}, outputs: Json[] = []) =>
  task(activity("T", "manual", { boundaries: [boundary("B", trigger, over, outputs)] }));

/** The process start `S` waits for `trigger`. */
const starting: Placement = (trigger, outputs = []) => (program) => replace(program, "S", start("S", trigger, outputs));

/** `T` becomes a Sub-Process whose own start Event `SS` waits for `trigger`, an Event Sub-Process start. */
const nested: Placement = (trigger, outputs = []) => (program) =>
  append(task(scope("T", "embedded", { children: ["SS"] }))(program), start("SS", trigger, outputs, "T"));

/**
 * `T` becomes an Event Sub-Process started by `trigger`. An interrupting one is an abnormal scope end, which the base
 * profile's `withoutOutflow` refuses before any subscription is read, so it is given the profile that completes normally.
 */
const eventSubProcessOn = (trigger: Json | string, interrupting: boolean) => (program: Json): Json =>
  task(scope("T", eventSubProcess(trigger, interrupting)))(
    interrupting ? withOptions(program, { abnormalScopeEnd: "completesNormally" }) : program);

const named = message({ name: text("M") });

/** `T` becomes a Transaction with a Cancel boundary `B`; `over` overrides the boundary's own fields. */
const onTransaction = (over: Json = {}) =>
  task(scope("T", { transaction: { payload: { method: "compensate" } } }, {}, { boundaries: [boundary("B", cancelTrigger, over)] }));
const correlated = (...criteria: Json[]) => message(channel({ correlation: criteria }));
const key = criterion("k", variable("x"));

export const rows: readonly Row[] = [
  // Timers.
  {
    code: "timer.duration",
    description: "a catch Timer whose duration does not parse",
    mutate: catching(duration("later")),
    control: catching(duration("PT1S")),
  },
  {
    code: "timer.duration",
    description: "a catch Timer whose duration is zero",
    mutate: catching(duration("PT0S")),
    control: catching(duration("PT1S")),
  },
  {
    code: "timer.date",
    description: "a catch Timer firing at a date",
    mutate: catching(date("2030-01-01T00:00:00Z")),
    control: catching(duration("PT1S")),
  },
  {
    code: "timer.cycle",
    description: "a repeating boundary Timer whose cycle does not parse",
    mutate: bounded(cycle("R/PT"), { interrupting: false }),
    control: bounded(cycle("R/PT1M"), { interrupting: false }),
  },
  {
    code: "timer.cycleNotAttached",
    description: "a catch Timer that repeats",
    mutate: catching(cycle("R/PT1M")),
    control: bounded(cycle("R/PT1M"), { interrupting: false }),
  },
  {
    code: "timer.cron",
    description: "a repeating boundary Timer given as a cron expression",
    mutate: bounded(cycle("0 0 * * * ?", "cron"), { interrupting: false }),
    control: bounded(cycle("R/PT1M"), { interrupting: false }),
  },
  {
    code: "timer.interruptingCycle",
    description: "an interrupting boundary Timer that repeats",
    mutate: bounded(cycle("R/PT1M")),
    control: bounded(cycle("R/PT1M"), { interrupting: false }),
  },
  {
    code: "timer.interruptingCycle",
    description: "an interrupting Event Sub-Process started by a repeating Timer",
    mutate: eventSubProcessOn(cycle("R/PT1M"), true),
    control: eventSubProcessOn(cycle("R/PT1M"), false),
  },
  // Messages.
  {
    code: "message.correlation",
    description: "a boundary Message with a correlation key",
    mutate: bounded(message({ name: text("M"), correlation: [key] })),
    control: bounded(named),
  },
  {
    code: "message.nameExpression",
    description: "a boundary Message whose name is an expression",
    mutate: bounded(message({ name: computed(variable("n")) })),
    control: bounded(named),
  },
  {
    code: "message.nameExpression",
    description: "a catch Message whose name is an expression",
    mutate: catching(message({ name: computed(variable("n")) })),
    control: catching(named),
  },
  {
    code: "message.correlation.keys",
    description: "a catch Message with two correlation keys",
    mutate: catching(correlated(key, criterion("j", variable("z")))),
    control: catching(correlated(key)),
  },
  {
    code: "message.correlation.output",
    description: "a correlated catch Message that writes its payload",
    mutate: catching(correlated(key), output),
    control: catching(correlated(key)),
  },
  {
    code: "message.correlation.channel",
    description: "a correlated catch Message with no Operation channel",
    mutate: catching(message({ name: text("M"), correlation: [key] })),
    control: catching(correlated(key)),
  },
  {
    code: "message.correlation.channel",
    description: "a correlated catch Message with no name",
    mutate: catching(message(channel({ name: null, correlation: [key] }))),
    control: catching(correlated(key)),
  },
  {
    code: "message.correlation.value",
    description: "a correlation key bound to a literal",
    mutate: catching(correlated(criterion("k", literalValue(bool(true))))),
    control: catching(correlated(key)),
  },
  {
    code: "message.correlation.value",
    description: "a correlation key bound to a Simple Boolean expression",
    mutate: catching(correlated(criterion("k", simpleBoolean()))),
    control: catching(correlated(key)),
  },
  {
    code: "expression.outsideSimpleBoolean",
    description: "a correlation key bound to a foreign expression",
    mutate: catching(correlated(criterion("k", foreign()))),
    control: catching(correlated(key)),
  },
  // Outputs and trigger payloads.
  {
    code: "event.outputs",
    description: "a catch Timer with an output mapping",
    mutate: catching(duration("PT1S"), output),
    control: catching(named, output),
  },
  {
    code: "event.error.codeVariable",
    description: "a boundary Error naming a code variable",
    mutate: bounded(errorTrigger({ codeVariable: "code" })),
    control: bounded(errorTrigger({ code: "Failure" })),
  },
  {
    code: "event.error.messageVariable",
    description: "a boundary Error naming a message variable",
    mutate: bounded(errorTrigger({ messageVariable: "reason" })),
    control: bounded(errorTrigger({ code: "Failure" })),
  },
  {
    code: "event.escalation.codeVariable",
    description: "a boundary Escalation naming a code variable",
    mutate: bounded(escalationTrigger({ codeVariable: "code" })),
    control: bounded(escalationTrigger({ code: "Warning" })),
  },
  {
    code: "scope.eventSubProcess.interruptingMessage",
    description: "an interrupting Event Sub-Process started by a Message",
    mutate: eventSubProcessOn(named, true),
    control: eventSubProcessOn(named, false),
  },
  // Catch Events.
  { code: "event.catch.signal", description: "a catch Signal", mutate: catching(signal()) },
  { code: "event.catch.condition", description: "a catch Conditional", mutate: catching(condition()) },
  { code: "event.catch.error", description: "a catch Error", mutate: catching(errorTrigger()) },
  { code: "event.catch.escalation", description: "a catch Escalation", mutate: catching(escalationTrigger()) },
  { code: "event.catch.compensation", description: "a catch Compensation", mutate: catching(compensationTrigger) },
  { code: "event.catch.cancel", description: "a catch Cancel", mutate: catching(cancelTrigger) },
  // Boundaries.
  { code: "boundary.signal", description: "a Signal boundary", mutate: bounded(signal()) },
  { code: "boundary.condition", description: "a Conditional boundary", mutate: bounded(condition()) },
  // Triggered starts.
  {
    code: "start.message.outputs",
    description: "a process Message start with an output mapping",
    mutate: starting(named, output),
    control: nested(named, output),
  },
  { code: "start.signal", description: "a Signal start", mutate: starting(signal()) },
  { code: "start.condition", description: "a Conditional start", mutate: starting(condition()) },
  {
    code: "start.error",
    description: "a process Error start",
    mutate: starting(errorTrigger()),
    control: nested(errorTrigger()),
  },
  {
    code: "start.escalation",
    description: "a process Escalation start",
    mutate: starting(escalationTrigger()),
    control: nested(escalationTrigger()),
  },
  {
    code: "start.compensation",
    description: "a process Compensation start",
    mutate: starting(compensationTrigger),
    control: nested(compensationTrigger),
  },
  { code: "start.cancel", description: "a Cancel start", mutate: nested(cancelTrigger) },
  // BPMN structure and nameless Messages.
  {
    code: "message.unnamed",
    description: "a catch Message without a Message",
    mutate: catching(message()),
    control: catching(named),
  },
  {
    code: "message.unnamed",
    description: "a boundary Message without a Message",
    mutate: bounded(message()),
    control: bounded(named),
  },
  {
    code: "message.unnamed",
    description: "a process Message start without a Message",
    mutate: starting(message()),
    control: starting(named),
  },
  {
    code: "boundary.error.nonInterrupting",
    description: "a non-interrupting Error boundary",
    mutate: bounded(errorTrigger(), { interrupting: false }),
    control: bounded(errorTrigger()),
  },
  {
    code: "start.error.nonInterrupting",
    description: "a non-interrupting Error Event Sub-Process",
    mutate: eventSubProcessOn(errorTrigger(), false),
    control: eventSubProcessOn(errorTrigger(), true),
  },
  {
    code: "boundary.cancel.host",
    description: "a Cancel boundary on a Task",
    mutate: bounded(cancelTrigger),
    control: onTransaction(),
  },
  {
    code: "boundary.cancel.nonInterrupting",
    description: "a non-interrupting Cancel boundary on a Transaction",
    mutate: onTransaction({ interrupting: false }),
    control: onTransaction(),
  },
];

refusalTests("subscriptions", rows);
