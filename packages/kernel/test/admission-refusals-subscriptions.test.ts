/**
 * Refusal tests of `admission/subscriptions.ts`: what a catch Event, a boundary, a triggered start and an Event
 * Sub-Process may wait for. Timers carry a literal `Kernel.Timer.classify` admits (a cycle at every subscription site,
 * not at a root start), Messages carry a literal name and one correlation key bound to a variable, and only a Message
 * writes its payload. A Signal catch names its Signal, and by a non-blank name where names address Signals; a Signal
 * boundary has no kernel meaning yet; a Conditional one is admitted except at a process start, with CIB's write filters only under the each-write reading; Error, Escalation, Compensation and
 * Cancel are caught by boundaries and nested starts only.
 */
import {
  activity, append, boundary, cancelTrigger, catchEvent, channel, compensationTrigger, condition, criterion, cycle, date, duration, end,
  errorTrigger, escalationTrigger, eventBased, eventSubProcess, flow, foreign, gateway, juel, literalValue, loop, bool, mapping, message,
  qName, receiveWork, refusalTests, replace, scope, signal, simpleBoolean, start, task, userWork, variable, computed, text, withFlows,
  withOptions,
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

const named = message({ messageRef: "M", name: text("M") });

/** A Signal trigger with `over` replacing its `signalRef` or name. */
const signalWith = (over: Json): Json => {
  const base = signal() as { signal: { payload: Json } };
  return { signal: { payload: { ...base.signal.payload, ...over } } };
};

/** The profile selection under which a Signal's name addresses it, read at the Events level (CIB-INT-0028, CIB-EXT-0041). */
const signalAddresses = (placed: (program: Json) => Json) => (program: Json): Json =>
  placed(withOptions(program, { signalNames: "addresses", evaluator: "juel" }));

/** The profile selection under which a Message's name addresses its subscriptions (CIB-LIM-0022). */
const addresses = (placed: (program: Json) => Json) => (program: Json): Json =>
  placed(withOptions(program, { messageNames: "addresses", evaluator: "juel" }));

/** A Conditional trigger with `over` replacing its predicate or filters. */
const conditionWith = (over: Json): Json => {
  const base = condition() as { condition: { payload: Json } };
  return { condition: { payload: { ...base.condition.payload, ...over } } };
};

/** `addresses` with the options a Multi-Instance loop reads under JUEL. */
const addressesLooping = (placed: (program: Json) => Json) => (program: Json): Json =>
  placed(withOptions(program, {
    messageNames: "addresses", evaluator: "juel", multiInstanceBinding: "loopReferences", multiInstanceCounters: "cibLocals",
    multiInstanceInputFailure: "rollback", multiInstanceCount: "javaInt",
  }));

/** A Message `M2` distinct from `named`'s `M` but of its name. */
const sameName = message({ messageRef: "M2", name: text("M") });

/** A non-interrupting Event Sub-Process `id` started by `trigger`, in `parent` or at the process level. */
const handler = (id: string, trigger: Json, parent: string | null = null): Json => scope(id, eventSubProcess(trigger, false), {}, {}, parent);

const twoHandlers = (program: Json): Json => append(program, handler("H1", named), handler("H2", sameName));

/**
 * `T` becomes a Sub-Process with a Message boundary `B`, a Task `C` its implicit start begins and a Message Event
 * Sub-Process `H` of `B`'s name; `env` adds to its envelope.
 */
const hostAndHandler = (env: Json = {}) => (program: Json): Json =>
  append(task(scope("T", "embedded", {}, { boundaries: [boundary("B", named)], ...env }))(program),
    activity("C", "manual", { incoming: [], outgoing: [] }, "T"), handler("H", sameName, "T"));

/** `T` becomes an Event-Based Gateway whose arm `E` catches `first` and, unless `second` is null, whose arm `E2` catches it. */
const arms = (first: Json, second: Json | null) => (program: Json): Json => {
  const gated = replace(replace(program, "T", gateway("T", eventBased())), "E", catchEvent("E", first));
  return second === null ? gated : withFlows(append(gated, catchEvent("E2", second)), flow("f3", "T", "E2"));
};

/**
 * `T` becomes a Task with boundaries `B` and `B2` on the Messages `firstRef` and `secondRef` named `first` and `second`;
 * two references to one Message carry its one name.
 */
const namedBy = (first: Json, second: Json, secondRef = "M2") => task(activity("T", "manual", {
  boundaries: [boundary("B", message({ messageRef: "M", name: first })), boundary("B2", message({ messageRef: secondRef, name: second }))],
}));

/** The name expression `${order.<property>}`. */
const orderField = (property: string): Json => computed(juel({ identifier: { name: "order" } }, { dot: { base: 0, property } }));

/** `T` and `E` become two catch Events in sequence of one name. */
const twoCatches = (program: Json): Json => replace(replace(program, "T", catchEvent("T", named)), "E", catchEvent("E", sameName));

/** `T` becomes a Receive Task of `named` with a boundary `B` of its name; `env` adds to its envelope. */
const receiving = (env: Json = {}) =>
  task(activity("T", receiveWork({ messageRef: "M", name: text("M") }), { boundaries: [boundary("B", sameName)], ...env }));

/** The process starts `S` and `X` wait for Messages of one name. */
const twoStarts = (program: Json): Json =>
  withFlows(append(replace(program, "S", start("S", named)), start("X", sameName)), flow("fX", "X", "E"));

/** A Signal trigger on the Signal `ref` named `name`. */
const signalOn = (ref: string, name: Json): Json => ({ signal: { payload: { signalRef: qName(ref), name } } });

/** The process starts `S` and `X` wait for `first` and `second`. */
const twoSignalStarts = (first: Json, second: Json) => (program: Json): Json =>
  withFlows(append(replace(program, "S", start("S", first)), start("X", second)), flow("fX", "X", "E"));

/** `T` and `E` become two catch Events in sequence, each its own event scope, on `first` and `second`. */
const signalCatches = (first: Json, second: Json) => (program: Json): Json =>
  replace(replace(program, "T", catchEvent("T", first)), "E", catchEvent("E", second));

/** `T` becomes a catch Event on `caught` and `E` an End Event throwing the Signal `ref` named `name`. */
const catchAndThrow = (caught: Json, ref: string, name: Json) => (program: Json): Json =>
  replace(replace(program, "T", catchEvent("T", caught)), "E", end("E", { signal: { payload: {
    signalRef: qName(ref), name, payload: [], propagateAll: null, localOnly: false, businessKey: null, asynchronous: false,
  } } }));

/**
 * Two interrupting Error Event Sub-Processes `H1` and `H2` catching `first` and `second` (`null` catches every Error),
 * declared at the process level or in a Sub-Process `parent` (`T`). An interrupting one is an abnormal scope end, so the
 * profile that completes normally is selected.
 */
const errorHandlers = (first: string | null, second: string | null, parent: string | null = null) => (program: Json): Json => {
  const profiled = withOptions(program, { abnormalScopeEnd: "completesNormally" });
  const [h1, h2] = [first, second].map((code, index) =>
    scope(`H${index + 1}`, eventSubProcess(errorTrigger({ code }), true), {}, {}, parent));
  return parent === null ? append(profiled, h1!, h2!)
    : append(task(scope("T", "embedded"))(profiled), activity("C", "manual", { incoming: [], outgoing: [] }, "T"), h1!, h2!);
};

/** The profile selection under which a Conditional fires on each matching write, filtered (CIB-EXT-0035). */
const eachWrite = (program: Json): Json => withOptions(program, { conditionalRetrigger: "eachWrite" });

/** The profile selection under which an Error catcher may name its code and message variables (CIB-EXT-0028). */
const eventScopeVariables = { errorCatchVariables: "eventScope" };

/** `T` becomes a Transaction with a Cancel boundary `B`; `over` overrides the boundary's own fields. */
const onTransaction = (over: Json = {}) =>
  task(scope("T", { transaction: { payload: { method: "compensate" } } }, {}, { boundaries: [boundary("B", cancelTrigger, over)] }));
const correlated = (...criteria: Json[]) => message(channel({ correlation: criteria }));

/** `value` with every subscription it carries given `alternatives` and `parallelMultiple`. */
function marked(value: unknown, alternatives: Array<Json | string>, parallelMultiple: boolean): unknown {
  if (Array.isArray(value)) return value.map((item) => marked(item, alternatives, parallelMultiple));
  if (value === null || typeof value !== "object") return value;
  const object = Object.fromEntries(Object.entries(value).map(([name, item]) => [name, marked(item, alternatives, parallelMultiple)]));
  return "trigger" in object && "alternatives" in object ? { ...object, alternatives, parallelMultiple } : object;
}

/**
 * `placed`, its subscription a Multiple Event when it has `alternatives`, a Parallel Multiple one when `parallelMultiple`
 * (BPMN 2.0.2 §10.5.1); pinned CIB keeps one definition and never reads `parallelMultiple` (CIB-LIM-0008).
 */
const multiple = (placed: (program: Json) => Json, alternatives: Array<Json | string>, parallelMultiple = false) =>
  (program: Json): Json => marked(placed(program), alternatives, parallelMultiple) as Json;
const key = criterion("k", variable("x"));

export const rows: readonly Row[] = [
  // Multiple and Parallel Multiple Events.
  {
    code: "event.multipleDefinitions",
    description: "a catch Event with a Message and a Timer definition",
    mutate: multiple(catching(named), [duration("PT1S")]),
    control: catching(named),
  },
  {
    code: "event.multipleDefinitions",
    description: "a boundary with a Message and a Timer definition",
    mutate: multiple(bounded(named), [duration("PT1S")]),
    control: bounded(named),
  },
  {
    code: "event.multipleDefinitions",
    description: "a process start with a Message and a Timer definition",
    mutate: multiple(starting(named), [duration("PT1S")]),
    control: starting(named),
  },
  {
    code: "event.multipleDefinitions",
    description: "an Event Sub-Process start with an Error and an Escalation definition",
    mutate: multiple(nested(errorTrigger()), [escalationTrigger()]),
    control: nested(errorTrigger()),
  },
  {
    code: "event.multipleDefinitions",
    description: "an Event Sub-Process kind started by a Message and a Timer definition",
    mutate: multiple(eventSubProcessOn(named, false), [duration("PT1S")]),
    control: eventSubProcessOn(named, false),
  },
  {
    code: "event.parallelMultiple",
    description: "a Parallel Multiple catch Event with one definition",
    mutate: multiple(catching(named), [], true),
    control: catching(named),
  },
  {
    code: "event.parallelMultiple",
    description: "a Parallel Multiple boundary with two definitions",
    mutate: multiple(bounded(named), [duration("PT1S")], true),
    control: bounded(named),
  },
  // Timers: outside the subset (CIB commits it) or malformed for CIB's parser, under `malformedTimer = refused`.
  {
    code: "timer.duration",
    description: "a catch Timer whose duration does not parse",
    mutate: catching(duration("later")),
    control: catching(duration("PT1S")),
  },
  {
    code: "timer.duration",
    description: "a catch Timer whose duration is finer than a millisecond",
    mutate: catching(duration("PT0.0001S")),
    control: catching(duration("PT0.001S")),
  },
  {
    code: "timer.date",
    description: "a catch Timer firing at a date without a zone designator",
    mutate: catching(date("2030-01-01T00:00:00")),
    control: catching(date("2030-01-01T00:00:00Z")),
  },
  {
    code: "timer.cycle",
    description: "a repeating boundary Timer whose cycle does not parse",
    mutate: bounded(cycle("R/PT"), { interrupting: false }),
    control: bounded(cycle("R/PT1M"), { interrupting: false }),
  },
  {
    code: "timer.cycle",
    description: "a repeating boundary Timer with a dated interval",
    mutate: bounded(cycle("R2/2030-01-01T00:00:00Z/PT1M"), { interrupting: false }),
    control: bounded(cycle("R2/PT1M"), { interrupting: false }),
  },
  {
    code: "timer.cycleNotAttached",
    description: "a root start Timer that repeats",
    mutate: starting(cycle("R/PT1M")),
    control: starting(duration("PT1M")),
  },
  {
    code: "timer.cron",
    description: "a repeating boundary Timer given as a cron expression outside the subset",
    mutate: bounded(cycle("0 0 12 L * ?", "cron"), { interrupting: false }),
    control: bounded(cycle("0 0 12 * * ?", "cron"), { interrupting: false }),
  },
  // Messages.
  {
    code: "message.correlation",
    description: "a boundary Message with a correlation key",
    mutate: bounded(message({ messageRef: "M", name: text("M"), correlation: [key] })),
    control: bounded(named),
  },
  {
    code: "message.nameExpression",
    description: "a boundary Message whose name is an expression",
    mutate: bounded(message({ messageRef: "M", name: computed(variable("n")) })),
    control: bounded(named),
  },
  {
    code: "message.nameExpression",
    description: "a catch Message whose name is an expression",
    mutate: catching(message({ messageRef: "M", name: computed(variable("n")) })),
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
    mutate: catching(message({ messageRef: "M", name: text("M"), correlation: [key] })),
    control: catching(correlated(key)),
  },
  {
    code: "message.correlation.channel",
    description: "a correlated catch Message with no Message",
    mutate: catching(message(channel({ messageRef: null, correlation: [key] }))),
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
    control: (program) => bounded(errorTrigger({ codeVariable: "code" }))(withOptions(program, eventScopeVariables)),
  },
  {
    code: "event.error.messageVariable",
    description: "a boundary Error naming a message variable",
    mutate: bounded(errorTrigger({ messageVariable: "reason" })),
    control: (program) => bounded(errorTrigger({ messageVariable: "reason" }))(withOptions(program, eventScopeVariables)),
  },
  {
    code: "event.error.codeVariable",
    description: "an Event Sub-Process start Error naming a code variable",
    mutate: nested(errorTrigger({ codeVariable: "code" })),
    control: (program) => nested(errorTrigger({ codeVariable: "code" }))(withOptions(program, eventScopeVariables)),
  },
  {
    code: "boundary.error.duplicateCode",
    description: "a host with two interrupting Error boundaries of the same code",
    mutate: task(activity("T", "manual", {
      boundaries: [boundary("B", errorTrigger({ code: "Failure" })), boundary("B2", errorTrigger({ code: "Failure" }))],
    })),
    control: task(activity("T", "manual", {
      boundaries: [boundary("B", errorTrigger({ code: "Failure" })), boundary("B2", errorTrigger({ code: "Other" }))],
    })),
  },
  {
    code: "scope.eventSubProcess.errorDuplicateCode",
    description: "two Error Event Sub-Processes of the process level with the same code",
    mutate: errorHandlers("Failure", "Failure"),
    control: errorHandlers("Failure", "Other"),
  },
  {
    code: "scope.eventSubProcess.errorDuplicateCode",
    description: "two Error Event Sub-Processes of one Sub-Process with the same code",
    mutate: errorHandlers("Failure", "Failure", "T"),
    control: errorHandlers("Failure", "Other", "T"),
  },
  {
    code: "scope.eventSubProcess.errorDuplicateCode",
    description: "two Error Event Sub-Processes of the same code beside two catch-all ones, which catch in document order",
    mutate: errorHandlers("Failure", "Failure"),
    control: errorHandlers(null, null),
  },
  {
    code: "scope.eventSubProcess.errorDuplicateCode",
    description: "two Error Event Sub-Processes of the same code beside a coded one and a catch-all",
    mutate: errorHandlers("Failure", "Failure", "T"),
    control: errorHandlers("Failure", null, "T"),
  },
  {
    code: "event.escalation.codeVariable",
    description: "a boundary Escalation naming a code variable",
    mutate: task(activity("T", userWork(), { boundaries: [boundary("B", escalationTrigger({ codeVariable: "code" }))] })),
    control: task(activity("T", userWork(), { boundaries: [boundary("B", escalationTrigger({ code: "Warning" }))] })),
  },
  {
    code: "scope.eventSubProcess.interruptingMessage",
    description: "an interrupting Event Sub-Process started by a Message",
    mutate: eventSubProcessOn(named, true),
    control: eventSubProcessOn(named, false),
  },
  // Catch Events.
  {
    code: "signal.unspecified",
    description: "a catch Signal without a signalRef",
    mutate: catching(signalWith({ signalRef: null })),
    control: catching(signal()),
  },
  {
    code: "signal.nameExpression",
    description: "a catch Signal whose descriptive name is an expression under the identifier reading",
    mutate: catching(signalWith({ name: computed(variable("x")) })),
    control: signalAddresses(catching(signalWith({ name: computed(variable("x")) }))),
  },
  {
    code: "signal.unnamed",
    description: "a catch Signal without a name, where names address Signals",
    mutate: signalAddresses(catching(signalWith({ name: null }))),
    control: catching(signalWith({ name: null })),
  },
  {
    code: "signal.unnamed",
    description: "a catch Signal with a blank name, where names address Signals",
    mutate: signalAddresses(catching(signalWith({ name: text(" ") }))),
    control: signalAddresses(catching(signal())),
  },
  {
    code: "signal.nameExpression",
    description: "a catch Signal name expression outside the Events level, where names address Signals",
    mutate: (program) => catching(signalWith({ name: computed(variable("x")) }))(withOptions(program, { signalNames: "addresses" })),
    control: signalAddresses(catching(signalWith({ name: computed(variable("x")) }))),
  },
  // One Signal name per document and per CIB event scope (CIB-LIM-0026): each refused pair's control drops `addresses`,
  // moves one subscription to another event scope or renames one Signal.
  {
    code: "signal.duplicateName",
    description: "two Event-Based Gateway arms on one Signal, where names address Signals",
    mutate: signalAddresses(arms(signal(), signal())),
    control: arms(signal(), signal()),
  },
  {
    code: "signal.duplicateName",
    description: "two root Signal starts on one Signal beside two catches of it in sequence, where names address Signals",
    mutate: signalAddresses(twoSignalStarts(signal(), signal())),
    control: signalAddresses(signalCatches(signal(), signal())),
  },
  {
    code: "signal.duplicateName",
    description: "two Event-Based Gateway arms on one Signal named by an expression, where names address Signals",
    mutate: signalAddresses(arms(signalOn("Sig", orderField("id")), signalOn("Sig", orderField("id")))),
    control: signalAddresses(arms(signalOn("Sig", orderField("id")), signalOn("Sig2", orderField("number")))),
  },
  {
    code: "signal.duplicateDefinitionName",
    description: "two catches in sequence on two Signals of one name, where names address Signals",
    mutate: signalAddresses(signalCatches(signal(), signalOn("Sig2", text("S")))),
    control: signalAddresses(signalCatches(signal(), signalOn("Sig2", text("S2")))),
  },
  {
    code: "signal.duplicateDefinitionName",
    description: "two catches in sequence on two Signals named by one expression, where names address Signals",
    mutate: signalAddresses(signalCatches(signalOn("Sig", orderField("id")), signalOn("Sig2", orderField("id")))),
    control: signalAddresses(signalCatches(signalOn("Sig", orderField("id")), signalOn("Sig2", orderField("number")))),
  },
  {
    code: "signal.duplicateDefinitionName",
    description: "a catch and a throw on two Signals of one name, where names address Signals",
    mutate: signalAddresses(catchAndThrow(signal(), "Sig2", text("S"))),
    control: catchAndThrow(signal(), "Sig2", text("S")),
  },
  { code: "event.catch.error", description: "a catch Error", mutate: catching(errorTrigger()) },
  { code: "event.catch.escalation", description: "a catch Escalation", mutate: catching(escalationTrigger()) },
  { code: "event.catch.compensation", description: "a catch Compensation", mutate: catching(compensationTrigger) },
  { code: "event.catch.cancel", description: "a catch Cancel", mutate: catching(cancelTrigger) },
  // Boundaries.
  { code: "boundary.signal", description: "a Signal boundary", mutate: bounded(signal()) },
  // Conditional Events: catches, boundaries and Event Sub-Process starts are admitted with their predicate.
  {
    code: "event.condition.filter",
    description: "a Conditional catch naming a variable under the edge-triggered reading",
    mutate: catching(conditionWith({ variableName: "x" })),
    control: catching(condition()),
  },
  {
    code: "event.condition.filter",
    description: "a Conditional boundary naming write events under the edge-triggered reading",
    mutate: bounded(conditionWith({ variableEvents: ["update"] }), { interrupting: false }),
    control: bounded(condition(), { interrupting: false }),
  },
  {
    code: "event.condition.variableEvents",
    description: "a Conditional Event Sub-Process start naming a write event CIB does not dispatch",
    mutate: (program) => nested(conditionWith({ variableEvents: ["change"] }))(eachWrite(program)),
    control: (program) => nested(conditionWith({ variableEvents: ["create", "delete"] }))(eachWrite(program)),
  },
  {
    code: "event.condition.foreign",
    description: "a Conditional catch whose predicate is in a foreign language",
    mutate: catching(conditionWith({ condition: foreign() })),
    control: catching(condition()),
  },
  // Triggered starts; a root start's own refusals are `admission-refusals-starts.test.ts`'.
  { code: "start.signal", description: "an Event Sub-Process Signal start", mutate: nested(signal()) },
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
  // BPMN structure, unspecified and nameless Messages.
  {
    code: "message.unspecified",
    description: "a catch Message without a Message",
    mutate: catching(message()),
    control: catching(named),
  },
  {
    code: "message.unspecified",
    description: "a boundary Message without a Message",
    mutate: bounded(message()),
    control: bounded(named),
  },
  {
    code: "message.unspecified",
    description: "a process Message start without a Message",
    mutate: starting(message()),
    control: starting(named),
  },
  {
    code: "message.unnamed",
    description: "a catch Message whose Message has no name, where names address",
    mutate: addresses(catching(message({ messageRef: "M" }))),
    control: catching(message({ messageRef: "M" })),
  },
  {
    code: "message.unnamed",
    description: "a boundary Message whose Message's name is blank, where names address",
    mutate: addresses(bounded(message({ messageRef: "M", name: text("  ") }))),
    control: addresses(bounded(named)),
  },
  {
    code: "message.duplicateName",
    description: "two boundaries of one host on distinct Messages of one name, where names address",
    mutate: addresses(task(activity("T", "manual", {
      boundaries: [boundary("B", named), boundary("B2", message({ messageRef: "M2", name: text("M") }))],
    }))),
    control: addresses(task(activity("T", "manual", {
      boundaries: [boundary("B", named), boundary("B2", message({ messageRef: "M2", name: text("N") }))],
    }))),
  },
  // One name in one CIB event scope (CIB-LIM-0022): each refused pair's control drops `addresses` or moves one
  // subscription to another event scope.
  {
    code: "message.duplicateName",
    description: "two boundaries of one host on one Message named by an expression, where names address",
    mutate: addresses(namedBy(orderField("id"), orderField("id"), "M")),
    control: addresses(namedBy({ literal: { value: "order" } }, orderField("id"))),
  },
  {
    code: "message.expressionNames",
    description: "two boundaries of one host on two Messages named by one expression text, where names address",
    mutate: addresses(namedBy(orderField("id"), orderField("id"))),
    control: addresses(namedBy(text("M"), orderField("id"))),
  },
  {
    // Conservative: admission cannot compare expression texts, so it refuses two that CIB deploys.
    code: "message.expressionNames",
    description: "two boundaries of one host on two Messages named by different expression texts, where names address",
    mutate: addresses(namedBy(orderField("id"), orderField("number"))),
    control: addresses(namedBy(text("M"), text("N"))),
  },
  {
    code: "message.duplicateName",
    description: "two boundaries of one host on two Messages of one literal name beside a literal and an expression name, where names address",
    mutate: addresses(namedBy(text("M"), text("M"))),
    control: addresses(namedBy(text("M"), orderField("id"))),
  },
  {
    code: "message.duplicateName",
    description: "two Message Event Sub-Processes of one scope and one name, where names address",
    mutate: addresses(twoHandlers),
    control: twoHandlers,
  },
  {
    code: "message.duplicateName",
    description: "a Message boundary of a Sub-Process and a Message Event Sub-Process inside it of one name, where names address",
    mutate: addresses(hostAndHandler()),
    control: hostAndHandler(),
  },
  {
    code: "message.duplicateName",
    description: "two Event-Based Gateway arms of one name, where names address",
    mutate: addresses(arms(named, sameName)),
    control: arms(named, sameName),
  },
  {
    code: "message.duplicateName",
    description: "a Receive Task and its own Message boundary of one name, where names address",
    mutate: addresses(receiving()),
    control: receiving(),
  },
  {
    code: "message.duplicateName",
    description: "two Message boundaries of a Multi-Instance host of one name, where names address",
    mutate: addressesLooping(task(activity("T", userWork(), { multiInstance: loop(), boundaries: [boundary("B", named), boundary("B2", sameName)] }))),
    control: task(activity("T", userWork(), { multiInstance: loop(), boundaries: [boundary("B", named), boundary("B2", sameName)] })),
  },
  {
    code: "message.duplicateName",
    description: "two root Message starts of one name, where names address",
    mutate: addresses(twoStarts),
    control: twoStarts,
  },
  {
    code: "message.duplicateName",
    description: "two Event-Based Gateway arms of one name beside two plain catches of it, where names address",
    mutate: addresses(arms(named, sameName)),
    control: addresses(twoCatches),
  },
  {
    code: "message.duplicateName",
    description: "two Message Event Sub-Processes beside a Message Event Sub-Process and a gateway arm of one name, where names address",
    mutate: addresses(twoHandlers),
    control: addresses((program) => append(arms(named, null)(program), handler("H2", sameName))),
  },
  {
    code: "message.duplicateName",
    description: "a Sub-Process boundary and its Message Event Sub-Process beside a Multi-Instance Sub-Process's, where names address",
    mutate: addresses(hostAndHandler()),
    control: addressesLooping(hostAndHandler({ multiInstance: loop({ outputDataItem: null, inputDataItemName: "item" }) })),
  },
  {
    code: "message.duplicateName",
    description: "a Receive Task and its own boundary beside a Multi-Instance Receive Task's, where names address",
    mutate: addresses(receiving()),
    control: addressesLooping(receiving({ multiInstance: loop({ outputDataItem: null }) })),
  },
  {
    code: "message.duplicateName",
    description: "two root Message starts beside a root Message start and a Message Event Sub-Process, where names address",
    mutate: addresses(twoStarts),
    control: addresses((program) => append(replace(program, "S", start("S", named)), handler("H", sameName))),
  },
  {
    code: "start.messageNameExpression",
    description: "a process Message start whose name is an expression, where names address",
    mutate: addresses(starting(message({ messageRef: "M", name: computed(variable("n")) }))),
    control: addresses(nested(message({ messageRef: "M", name: computed(variable("n")) }))),
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
