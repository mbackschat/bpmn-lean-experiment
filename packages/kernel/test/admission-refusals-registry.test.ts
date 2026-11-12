/**
 * Refusal tests of `admission-registry.ts`: the codes it owns (a compensation handler's origin, a called process's
 * binding) and the order in which it reports the first refusal: profile options, called processes, flows, then
 * elements in program order.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  activity, append, base, compensationTrigger, conditionOn, definitionRef, end, eventSubProcess, flow, foreign, loop, mapping, receiveWork,
  refusalOf, refusalTests, replace, scope, scriptWork, sendWork, serviceWork, start, task, userWork, variable, withFlows, withOptions,
} from "./admission-refusal-support.ts";
import type { Json, Row } from "./admission-refusal-support.ts";

/** `T` is a User Task whose compensation handler is `H`, an unconnected Activity appended to the program. */
const handledBy = (handler: Json) => (program: Json): Json =>
  append(task(activity("T", userWork(), { compensationHandlers: ["H"] }))(program), handler);

const handler = (work: Json | string, env: Json = {}): Json => activity("H", work, { incoming: [], outgoing: [], forCompensation: true, ...env });

/**
 * `T` becomes an embedded Sub-Process `XS -> XE` holding the Compensation Event Sub-Process `K`, or `K` sits beside it at
 * Process level. An interrupting Event Sub-Process is an abnormal scope end, so the profile that completes normally is
 * selected.
 */
const compensationEventSubProcess = (atProcessLevel: boolean) => (program: Json): Json =>
  withFlows(append(task(scope("T", "embedded"))(withOptions(program, { abnormalScopeEnd: "completesNormally" })), start("XS", null, [], "T"), end("XE", "none", "T"),
    scope("K", eventSubProcess(compensationTrigger, true), {}, {}, atProcessLevel ? null : "T"), start("KS", compensationTrigger, [], "K")),
  flow("xx", "XS", "XE"));

const calledProcess = (over: Json = {}, executable = true) => (program: Json): Json =>
  ({ ...program, processes: [{ definition: definitionRef("Q", over), children: [], variables: [], executable }] });

/** `E` becomes a Multiple End Event throwing an Error and an Escalation (BPMN 2.0.2 §10.5.1). */
const multipleEnd = (alternatives: Array<Json | string>) => (program: Json): Json =>
  replace(program, "E", end("E", { error: { payload: { code: "E1", message: null } } }, null, alternatives));

export const rows: readonly Row[] = [
  {
    // BPMN 2.0.2 §10.7.1, Table 10.3: a Compensation Activity is marked `isForCompensation`; CIB refuses it unmarked (`BpmnParse.java:905-910`).
    code: "compensation.handlerNotForCompensation",
    description: "a compensation handler not marked for compensation",
    mutate: handledBy(handler("manual", { forCompensation: false })),
    control: handledBy(handler("manual")),
  },
  {
    // BPMN 2.0.2 §10.7.1: a Compensation Activity lies outside the normal flow; CIB refuses its flows (`BpmnParse.java:4327-4337`).
    code: "compensation.handlerFlow",
    description: "a compensation handler with an outgoing Sequence Flow",
    mutate: (program) => withFlows(handledBy(handler("manual"))(program), flow("he", "H", "E")),
    control: handledBy(handler("manual")),
  },
  {
    // CIB-LIM-0044: CIB refuses a Process-level Compensation Event Sub-Process (`BpmnParse.java:1187-1190`).
    code: "compensation.processEventSubProcess",
    description: "a Compensation Event Sub-Process at Process level",
    mutate: compensationEventSubProcess(true),
    control: compensationEventSubProcess(false),
  },
  {
    // CIB skips a compensation handler's loop marks (`BpmnParse.java:2416`), which `marks` (`Kernel.State.Journal`) would read.
    code: "compensation.handlerMultiInstance",
    description: "a compensation handler with Multi-Instance loop characteristics",
    mutate: handledBy(handler(serviceWork(), { multiInstance: loop({ outputDataItem: null }) })),
    control: handledBy(handler(serviceWork())),
  },
  {
    code: "process.definition.binding",
    description: "a called process bound to a tenant",
    mutate: calledProcess({ tenant: "tenant" }),
    control: calledProcess(),
  },
  {
    // Table 10.1 `isExecutable`; pinned `BpmnParse:560-574` deploys no process whose `isExecutable` is absent or false.
    code: "process.notExecutable",
    description: "a root process not marked executable",
    mutate: (program) => ({ ...program, executable: false }),
    control: (program) => ({ ...program, executable: true }),
  },
  {
    code: "process.notExecutable",
    description: "a called process not marked executable",
    mutate: calledProcess({}, false),
    control: calledProcess(),
  },
  {
    code: "event.multipleDefinitions",
    description: "a Multiple End Event throwing an Error and an Escalation",
    mutate: multipleEnd([{ escalation: { payload: { code: "X1" } } }]),
    control: multipleEnd([]),
  },
];

refusalTests("registry", rows);

/** A program refused at every level: a profile option, a called-process binding, a flow condition and an element. */
function refusedEverywhere(): Json {
  const program = calledProcess({ tenant: "tenant" })(conditionOn(task(activity("T", sendWork()))(base()), "f2", foreign()));
  return withOptions(program, { callBindingTime: "invocation" });
}

test("registry: a compensation handler with input mappings, or one that waits for a Message, is admitted", () => {
  // I10: a run begins its handler as a token would, so its inputs read the handler context and any admitted work runs.
  assert.equal(refusalOf(handledBy(handler(userWork(), { inputs: [mapping("x", variable("y"))] }))(base())), null);
  assert.equal(refusalOf(handledBy(handler(receiveWork()))(base())), null);
});

test("registry: a called process's population stamps are admitted, since the population validates them", () => {
  assert.equal(refusalOf(calledProcess({ deployment: 1, version: 2, versionTag: "stable" })(base())), null);
});

test("registry: profile options are refused before called processes, flows and elements", () => {
  assert.equal(refusalOf(refusedEverywhere()), "profile.callBindingTime.invocation");
});

test("registry: a process not marked executable is refused after profile options and before anything else", () => {
  const program = withOptions(refusedEverywhere(), { callBindingTime: "programAssembly" });
  assert.equal(refusalOf({ ...program, executable: false }), "process.notExecutable");
  assert.equal(refusalOf({ ...refusedEverywhere(), executable: false }), "profile.callBindingTime.invocation");
});

test("registry: a called-process binding is refused before flows and elements", () => {
  assert.equal(refusalOf(withOptions(refusedEverywhere(), { callBindingTime: "programAssembly" })), "process.definition.binding");
});

test("registry: a flow is refused before elements", () => {
  const program = withOptions(refusedEverywhere(), { callBindingTime: "programAssembly" });
  assert.equal(refusalOf({ ...program, processes: [] }), "flow.condition.foreign");
});

test("registry: the first refused element in program order is reported", () => {
  const send = activity("T", sendWork());
  const script = activity("X", scriptWork(), { incoming: [], outgoing: [] });
  assert.equal(refusalOf(append(task(send)(base()), script)), "work.send");
  assert.equal(refusalOf(append(replace(base(), "T", script), activity("Y", sendWork(), { incoming: [], outgoing: [] }))), "work.script");
});
