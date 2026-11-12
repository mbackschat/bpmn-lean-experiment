/**
 * Refusal tests of `admission/work.ts`: the work an Activity may carry (a User Task's unread fields, a Service Task's
 * binding, a Receive Task's message, a Call Activity's called process and data) and where the envelope's mappings,
 * Multi-Instance loop and compensation handler may sit. A Send or Script Task has no kernel meaning; a Business Rule
 * Task's decisions are `admission-refusals-decision.test.ts`'s.
 */
import {
  activity, append, callWork, computed, criterion, definitionRef, loop, mapping, qName, receiveWork, refusalTests,
  ruleWork, scriptWork, sendWork, serviceWork, task, text, userWork, variable, withOptions, withOrigin,
} from "./admission-refusal-support.ts";
import type { Json, Row } from "./admission-refusal-support.ts";

/** `H`, an unconnected Task that a compensation subject names as its handler. */
const handlerTask = activity("H", "manual", { incoming: [], outgoing: [], forCompensation: true });
const secondHandlerTask = activity("H2", "manual", { incoming: [], outgoing: [], forCompensation: true });

const withTask = (work: Json | string, env: Json = {}) => task(activity("T", work, env));

/** The process-level element `CT` of the called process `Called`, a Task unless a row names another. */
const calledChild = activity("CT", "manual", { incoming: [], outgoing: [] });
const withCalled = (child: Json = calledChild) => (program: Json): Json =>
  ({ ...append(program, child), processes: [{ definition: definitionRef("Called"), children: ["CT"], variables: [], executable: true }] });

/** `T` becomes a Call Activity of the called process `Called`. */
const calling = (over: Json = {}, child?: Json) => (program: Json): Json =>
  withCalled(child)(withTask(callWork(over))(program));

const foreignNamespace = "urn:example:foreign";
const cibKey = { calledElementResolution: "cibKey" };

/** A second process declaring the same definition as `Called`, with its own process-level Task `CU`. */
const secondCalledChild = activity("CU", "manual", { incoming: [], outgoing: [] });
const secondCalled: Json = { definition: definitionRef("Called"), children: ["CU"], variables: [], executable: true };

const dataAssociation = (target: string) => mapping(target, variable("source"), "dataAssociation");
const callVariable = (target: string) => mapping(target, variable("source"), "callVariable");
const mapped = { inputs: [dataAssociation("in")], outputs: [dataAssociation("out")] };

const user = (over: Json) => withTask(userWork(over));

/** `T` calls `Called` under CIB's key reading (CIB-EXT-0045), whose literal `deployment`, `version` and `versionTag` it admits. */
const keyed = (over: Json = {}) => (program: Json): Json => calling(over)(withOptions(program, cibKey));

/** Two carried versions of `Called` (`CT` version 1, `CU` version 2) tagged `first` and `second`. */
const versions = (first: string, second: string) => (program: Json): Json => ({
  ...append(program, secondCalledChild),
  processes: [
    { definition: definitionRef("Called", { version: 1, versionTag: first }), children: ["CT"], variables: [], executable: true },
    { definition: definitionRef("Called", { version: 2, versionTag: second }), children: ["CU"], variables: [], executable: true },
  ],
});
const tagged = (tag: Json) => (program: Json): Json => versions("gold", "silver")(keyed({ binding: { versionTag: { value: tag } } })(program));

/**
 * `T` calls `Called`, whose process-level element `CT` is a Call of `next`; another `next` is carried with `CN`, a Call of
 * `Called` when `back`, else a Task.
 */
const chain = (next: string, back = false) => (program: Json): Json => {
  const called = calling({}, activity("CT", callWork({ calledElement: text(next) }), { incoming: [], outgoing: [] }))(program);
  if (next === "Called") return called;
  return {
    ...append(called, activity("CN", back ? callWork() : "manual", { incoming: [], outgoing: [] })),
    processes: [...(called.processes as Json[]), { definition: definitionRef(next), children: ["CN"], variables: [], executable: true }],
  };
};
/** `T` calls `Called` with `mapped`; `Called` is a copy of deployment 2 under the unstamped root, its element `CT@2`. */
const copiedCallee = (program: Json): Json => {
  const called = task(activity("T", callWork(mapped)))(program);
  return {
    ...append(called, withOrigin(activity("CT@2", "manual", { incoming: [], outgoing: [] }), { definition: null, sourceId: "CT" })),
    processes: [{ definition: definitionRef("Called", { deployment: 2 }), children: ["CT@2"], variables: [], executable: true }],
  };
};

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
    code: "compensation.handlerCount",
    description: "two compensation handlers on one User Task",
    mutate: (program) => append(withTask(userWork(), { compensationHandlers: ["H", "H2"] })(program), handlerTask, secondHandlerTask),
    control: (program) => append(withTask(userWork(), { compensationHandlers: ["H"] })(program), handlerTask),
  },
  {
    code: "activity.compensationHandler",
    description: "a compensation handler on a Task without work",
    mutate: (program) => append(withTask("manual", { compensationHandlers: ["H"] })(program), handlerTask),
    control: (program) => append(withTask(userWork(), { compensationHandlers: ["H"] })(program), handlerTask),
  },
  {
    code: "activity.compensationHandler",
    description: "a compensation handler on a Multi-Instance User Task",
    mutate: (program) => append(withTask(userWork(), { compensationHandlers: ["H"], multiInstance: loop() })(program), handlerTask),
    control: (program) => append(withTask(userWork(), { compensationHandlers: ["H"] })(program), handlerTask),
  },
  {
    code: "work.receive.correlation",
    description: "a Receive Task with a correlation key",
    mutate: withTask(receiveWork({ correlation: [criterion("k", variable("x"))] })),
    control: withTask(receiveWork()),
  },
  {
    // BPMN 2.0.2 §10.3.3, Table 10.10; pinned CIB never reads the attribute (CIB-LIM-0008).
    code: "work.receive.instantiate",
    description: "a Receive Task that instantiates its Process",
    mutate: withTask(receiveWork({ name: text("M") }, true)),
    control: withTask(receiveWork({ name: text("M") })),
  },
  {
    code: "work.receive.messageExpression",
    description: "a Receive Task whose message name is an expression",
    mutate: withTask(receiveWork({ name: computed(variable("n")) })),
    control: withTask(receiveWork({ name: text("M") })),
  },
  {
    // CIB subscribes a Receive Task's Message by name (`BpmnParse.java:2753-2759`, `:1271-1274`; CIB-LIM-0022).
    code: "message.unnamed",
    description: "under name addressing, a Receive Task whose Message has no name",
    mutate: (program) => withTask(receiveWork({ messageRef: "M" }))(withOptions(program, { messageNames: "addresses" })),
    control: (program) => withTask(receiveWork({ messageRef: "M", name: text("M") }))(withOptions(program, { messageNames: "addresses" })),
  },
  {
    code: "message.unnamed",
    description: "under name addressing, a Receive Task whose Message name is blank",
    mutate: (program) => withTask(receiveWork({ messageRef: "M", name: text(" ") }))(withOptions(program, { messageNames: "addresses" })),
    control: withTask(receiveWork({ messageRef: "M", name: text(" ") })),
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
    code: "work.call.calledProcessMissing",
    description: "a Call Activity naming a process the program does not carry",
    mutate: calling({ calledElement: text("Missing") }),
    control: calling(),
  },
  {
    // `Semantic.xsd:149` types `calledElement` as `xsd:QName`; a prefix without a namespace binding names nothing.
    code: "work.call.calledElementUnbound",
    description: "a Call Activity whose called element's prefix has no namespace binding",
    mutate: calling({ calledElement: text("missing:Called"), calledQName: null }),
    control: calling(),
  },
  {
    // CIB looks the literal text up as a key, prefix included (CIB-EXT-0045); no carried process has that key.
    code: "work.call.calledProcessMissing",
    description: "under CIB's key reading, a Call Activity whose called element's prefix has no namespace binding",
    mutate: keyed({ calledElement: text("missing:Called"), calledQName: null }),
    control: keyed({ calledQName: null }),
  },
  {
    code: "work.call.calledProcessMissing",
    description: "a Call Activity whose called element names a same-id process of another namespace",
    mutate: calling({ calledQName: qName("Called", foreignNamespace) }),
    control: calling(),
  },
  {
    code: "work.call.calledProcessMissing",
    description: "under CIB's key reading, a Call Activity whose called element names another namespace by a prefix",
    mutate: keyed({ calledElement: text("other:Called"), calledQName: qName("Called", foreignNamespace) }),
    control: keyed({ calledQName: qName("Called", foreignNamespace) }),
  },
  {
    code: "work.call.calledProcessMissing",
    description: "a Call Activity whose called element names the root process's id in another namespace",
    mutate: (program) => {
      const root = (program.identity as Json).processId as string;
      return calling({ calledElement: text(root), calledQName: qName(root, foreignNamespace) })(program);
    },
    control: calling(),
  },
  {
    code: "work.call.ambiguous",
    description: "a Call Activity whose selector two carried processes answer",
    mutate: (program) => {
      const called = calling()(program);
      return { ...append(called, secondCalledChild), processes: [...(called.processes as Json[]), secondCalled] };
    },
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
    code: "work.call.bindingExpression",
    description: "under CIB's key reading, a Call Activity bound to a version an expression gives",
    mutate: keyed({ binding: { version: { value: computed(variable("v")) } } }),
    control: keyed({ binding: { version: { value: text("1") } } }),
  },
  {
    code: "work.call.bindingExpression",
    description: "under CIB's key reading, a Call Activity bound to a version tag an expression gives",
    mutate: tagged(computed(variable("tag"))),
    control: tagged(text("gold")),
  },
  {
    code: "work.call.calledProcessMissing",
    description: "under CIB's key reading, a Call Activity bound to a version no carried process has",
    mutate: keyed({ binding: { version: { value: text("2") } } }),
    control: keyed({ binding: "deployment" }),
  },
  {
    code: "work.call.calledProcessMissing",
    description: "under CIB's key reading, a Call Activity bound to a version tag no carried process has",
    mutate: tagged(text("bronze")),
    control: tagged(text("silver")),
  },
  {
    code: "work.call.ambiguous",
    description: "under CIB's key reading, a Call Activity bound to a version tag two carried versions share",
    mutate: (program) => versions("gold", "gold")(keyed({ binding: { versionTag: { value: text("gold") } } })(program)),
    control: (program) => versions("gold", "gold")(keyed({ binding: { version: { value: text("2") } } })(program)),
  },
  {
    code: "work.call.cycle",
    description: "a called process calling itself",
    mutate: chain("Called"),
    control: chain("Next"),
  },
  {
    code: "work.call.cycle",
    description: "two called processes calling each other",
    mutate: chain("Next", true),
    control: chain("Next"),
  },
  {
    code: "work.call.dataAcrossDeployments",
    description: "a Call Activity with Data Associations whose callee is of another deployment",
    mutate: copiedCallee,
    control: (program) => {
      const copied = copiedCallee(program);
      return { ...copied, elements: (copied.elements as Json[]).map((element) => ((Object.values(element)[0] as Json).header as Json).id === "T"
        ? activity("T", callWork({ inputs: [callVariable("in")], outputs: [callVariable("out")] })) : element) };
    },
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
  {
    code: "work.user.assignee",
    description: "a User Task whose assignee is an expression",
    mutate: user({ assignee: computed(variable("owner")) }),
    control: user({ assignee: text("alice") }),
  },
  {
    code: "work.user.candidateUsers",
    description: "a User Task whose candidate user is an expression",
    mutate: user({ candidateUsers: [text("bob"), computed(variable("owner"))] }),
    control: user({ candidateUsers: [text("bob"), text("carol")] }),
  },
  {
    code: "work.user.formKey",
    description: "a User Task whose form key is an expression",
    mutate: user({ formKey: "embedded:app:${form}.html" }),
    control: user({ formKey: "embedded:app:forms/review.html" }),
  },
  {
    code: "work.user.dueDate",
    description: "a User Task whose due date is an expression",
    mutate: user({ dueDate: computed(variable("due")) }),
    control: user({ dueDate: text("2026-12-31T00:00:00Z") }),
  },
  {
    code: "work.user.dueDate",
    description: "a User Task whose due date is a duration from now",
    mutate: user({ dueDate: text("P3D") }),
    control: user({ dueDate: text("2028-02-29T23:59:59Z") }),
  },
  {
    code: "work.user.dueDate",
    description: "a User Task whose due date is no calendar day",
    mutate: user({ dueDate: text("2027-02-29T00:00:00Z") }),
    control: user({ dueDate: text("2028-02-29T00:00:00Z") }),
  },
  {
    code: "work.user.dueDate",
    description: "a User Task whose due date names a zone offset",
    mutate: user({ dueDate: text("2026-12-31T00:00:00+01:00") }),
    control: user({ dueDate: text("2026-12-31T00:00:00Z") }),
  },
  {
    code: "work.user.followUpDate",
    description: "a User Task whose follow-up date has fractional seconds",
    mutate: user({ followUpDate: text("2026-12-24T00:00:00.000Z") }),
    control: user({ followUpDate: text("2026-12-24T00:00:00Z") }),
  },
  {
    code: "work.user.followUpDate",
    description: "a User Task whose follow-up date is an expression",
    mutate: user({ followUpDate: computed(variable("followUp")) }),
    control: user({ followUpDate: text("2026-12-24T00:00:00Z") }),
  },
  {
    code: "work.user.priority",
    description: "a User Task whose priority is an expression",
    mutate: user({ priority: computed(variable("rank")) }),
    control: user({ priority: text("70") }),
  },
  {
    code: "work.user.priority",
    description: "a User Task whose priority exceeds a 32-bit integer",
    mutate: user({ priority: text("2147483648") }),
    control: user({ priority: text("-2147483648") }),
  },
  {
    code: "work.user.priority",
    description: "a User Task whose priority is no decimal integer",
    mutate: user({ priority: text("+5") }),
    control: user({ priority: text("5") }),
  },
  {
    code: "work.user.formField",
    description: "a User Task form field without a type",
    mutate: user({ formFields: [["route", ""]] }),
    control: user({ formFields: [["route", "string"], ["urgent", "boolean"], ["count", "long"], ["due", "date"]] }),
  },
  {
    code: "work.user.formField",
    description: "a User Task form field of an enumeration type, whose values the kernel does not carry",
    mutate: user({ formFields: [["route", "enum"]] }),
    control: user({ formFields: [["route", "string"]] }),
  },
  {
    code: "work.user.formField",
    description: "a User Task form field without an id",
    mutate: user({ formFields: [["", "string"]] }),
    control: user({ formFields: [["route", "string"]] }),
  },
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
  {
    code: "work.rule.decisionMissing", description: "a Business Rule Task naming a decision the program does not carry",
    mutate: (program) => withOptions(withTask(ruleWork())(program), { businessRuleTask: "decisionTable" }),
  },
];

refusalTests("work", rows);
