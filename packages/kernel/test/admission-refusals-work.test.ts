/**
 * Refusal tests of `admission/work.ts`: the work an Activity may carry (a User Task's unread fields, a Service Task's
 * binding, a Receive Task's message, a Call Activity's called process and data) and where the envelope's mappings,
 * Multi-Instance loop and compensation handler may sit. A Send, Script or Business Rule Task has no kernel meaning.
 */
import {
  activity, append, callWork, computed, criterion, definitionRef, duration, eventSubProcess, loop, mapping, receiveWork, refusalTests,
  ruleWork, scope, scriptWork, sendWork, serviceWork, task, text, userWork, variable,
} from "./admission-refusal-support.ts";
import type { Json, Row } from "./admission-refusal-support.ts";

/** `H`, an unconnected Task that a compensation subject names as its handler. */
const handlerTask = activity("H", "manual", { incoming: [], outgoing: [] });

const withTask = (work: Json | string, env: Json = {}) => task(activity("T", work, env));

/** The process-level element `CT` of the called process `Called`, a Task unless a row names another. */
const calledChild = activity("CT", "manual", { incoming: [], outgoing: [] });
const withCalled = (child: Json = calledChild) => (program: Json): Json =>
  ({ ...append(program, child), processes: [{ definition: definitionRef("Called"), children: ["CT"], variables: [] }] });

/** `T` becomes a Call Activity of the called process `Called`. */
const calling = (over: Json = {}, child?: Json) => (program: Json): Json =>
  withCalled(child)(withTask(callWork(over))(program));

const dataAssociation = (target: string) => mapping(target, variable("source"), "dataAssociation");
const callVariable = (target: string) => mapping(target, variable("source"), "callVariable");
const mapped = { inputs: [dataAssociation("in")], outputs: [dataAssociation("out")] };

const user = (over: Json) => withTask(userWork(over));

export const rows: readonly Row[] = [
  {
    code: "activity.inputMappings",
    description: "an input mapping on a Task without work",
    mutate: withTask("manual", { inputs: [mapping("x", variable("y"))] }),
    control: withTask(userWork(), { inputs: [mapping("x", variable("y"))] }),
  },
  {
    code: "activity.outputMappings",
    description: "an output mapping on a Task without work",
    mutate: withTask("manual", { outputs: [mapping("x", variable("y"))] }),
    control: withTask(userWork(), { outputs: [mapping("x", variable("y"))] }),
  },
  {
    code: "activity.multiInstanceBody",
    description: "a Multi-Instance loop on a Task without work",
    mutate: withTask("manual", { multiInstance: loop() }),
    control: withTask(userWork(), { multiInstance: loop() }),
  },
  {
    code: "activity.compensationHandler",
    description: "a compensation handler on a Task without work",
    mutate: (program) => append(withTask("manual", { compensationHandler: "H" })(program), handlerTask),
    control: (program) => append(withTask(userWork(), { compensationHandler: "H" })(program), handlerTask),
  },
  {
    code: "activity.compensationHandler",
    description: "a compensation handler on a Multi-Instance User Task",
    mutate: (program) => append(withTask(userWork(), { compensationHandler: "H", multiInstance: loop() })(program), handlerTask),
    control: (program) => append(withTask(userWork(), { compensationHandler: "H" })(program), handlerTask),
  },
  {
    code: "work.receive.correlation",
    description: "a Receive Task with a correlation key",
    mutate: withTask(receiveWork({ correlation: [criterion("k", variable("x"))] })),
    control: withTask(receiveWork()),
  },
  {
    code: "work.receive.messageExpression",
    description: "a Receive Task whose message name is an expression",
    mutate: withTask(receiveWork({ name: computed(variable("n")) })),
    control: withTask(receiveWork({ name: text("M") })),
  },
  {
    code: "work.call.dataCorrespondence",
    description: "a Call Activity with an input Data Association and no output",
    mutate: calling({ inputs: [dataAssociation("in")] }),
    control: calling(mapped),
  },
  {
    code: "work.call.dataCorrespondence",
    description: "a Call Activity mixing a Data Association with a variable mapping",
    mutate: calling({ inputs: [dataAssociation("in"), callVariable("copy")], outputs: [dataAssociation("out")] }),
    control: calling({ inputs: [callVariable("copy")] }),
  },
  {
    code: "work.call.rootProcess",
    description: "a Call Activity calling the root process",
    mutate: (program) => calling({ calledElement: text(((program.identity as Json).processId as string)) })(program),
    control: calling(),
  },
  {
    code: "call.calledEventSubProcess",
    description: "a Call Activity whose called process holds an Event Sub-Process",
    mutate: calling({}, scope("CT", eventSubProcess(duration("PT1S"), false), {}, { incoming: [], outgoing: [] })),
    control: calling({}, scope("CT", "embedded", {}, { incoming: [], outgoing: [] })),
  },
  {
    code: "work.call.calledProcessMissing",
    description: "a Call Activity naming a process the program does not carry",
    mutate: calling({ calledElement: text("Missing") }),
    control: calling(),
  },
  {
    code: "work.call.calledElementExpression",
    description: "a Call Activity whose called element is an expression",
    mutate: calling({ calledElement: computed(variable("name")) }),
    control: calling(),
  },
  {
    code: "work.call.binding",
    description: "a Call Activity bound to a version",
    mutate: calling({ binding: { version: { value: text("2") } } }),
    control: calling({ binding: "latest" }),
  },
  {
    code: "work.call.binding",
    description: "a Call Activity bound to its deployment",
    mutate: calling({ binding: "deployment" }),
    control: calling({ binding: "latest" }),
  },
  {
    code: "work.call.multiInstanceCounterOutput",
    description: "a Call output targeting a Multi-Instance counter",
    mutate: calling({ outputs: [callVariable("nrOfInstances")] }),
    control: calling({ outputs: [callVariable("count")] }),
  },
  {
    code: "work.call.businessKey",
    description: "a Call Activity with a business key",
    mutate: calling({ businessKey: variable("key") }),
    control: calling(),
  },
  {
    code: "work.call.tenant",
    description: "a Call Activity with a tenant",
    mutate: calling({ tenant: text("tenant") }),
    control: calling(),
  },
  {
    code: "work.call.propagateAll",
    description: "a Call Activity propagating all input variables",
    mutate: calling({ propagateAllInputs: true }),
    control: calling(),
  },
  {
    code: "work.call.propagateAll",
    description: "a Call Activity propagating all output variables",
    mutate: calling({ propagateAllOutputs: true }),
    control: calling(),
  },
  { code: "work.user.assignee", description: "a User Task with an assignee", mutate: user({ assignee: text("alice") }) },
  { code: "work.user.candidateUsers", description: "a User Task with candidate users", mutate: user({ candidateUsers: [text("alice")] }) },
  { code: "work.user.formKey", description: "a User Task with a form key", mutate: user({ formKey: "form:1" }) },
  { code: "work.user.dueDate", description: "a User Task with a due date", mutate: user({ dueDate: text("2030-01-01") }) },
  { code: "work.user.followUpDate", description: "a User Task with a follow-up date", mutate: user({ followUpDate: text("2030-01-01") }) },
  { code: "work.user.priority", description: "a User Task with a priority", mutate: user({ priority: text("50") }) },
  {
    code: "work.user.candidateGroupExpression",
    description: "a User Task whose candidate group is an expression",
    mutate: user({ candidateGroups: [computed(variable("group"))] }),
    control: user({ candidateGroups: [text("staff")] }),
  },
  {
    code: "work.service.unboundImplementation",
    description: "a Service Task without a protocol",
    mutate: withTask(serviceWork("", "get")),
    control: withTask(serviceWork()),
  },
  {
    code: "work.service.unboundImplementation",
    description: "a Service Task without an operation",
    mutate: withTask(serviceWork("http", "")),
    control: withTask(serviceWork()),
  },
  { code: "work.send", description: "a Send Task", mutate: withTask(sendWork()) },
  { code: "work.script", description: "a Script Task", mutate: withTask(scriptWork()) },
  { code: "work.rule", description: "a Business Rule Task", mutate: withTask(ruleWork()) },
];

refusalTests("work", rows);
