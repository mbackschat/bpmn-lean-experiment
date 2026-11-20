/**
 * Refusal tests of `admission/profile.ts`: a profile may select only behaviour the kernel implements. Each option the
 * kernel has one reading of refuses its other value; `abnormalScopeEnd` is refused only for a program whose own shape
 * reaches an abnormal scope end (a Terminate in a Sub-Process or at a called process's level, or an interrupting Event
 * Sub-Process), `errorExitCompensation` and `multiInstanceCompensation` only for a program their alternative would
 * change, so their controls select the alternative for the base program.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  activity, append, base, compensationTrigger, definitionRef, duration, end, eventSubProcess, flow, loop, refusalOf, refusalTests, scope,
  start, task, terminateThrow, userWork, withFlows, withOptions,
} from "./admission-refusal-support.ts";
import type { Json, Row } from "./admission-refusal-support.ts";

const option = (over: Json) => (program: Json): Json => withOptions(program, over);

/** `T` becomes a Sub-Process whose start `XS` reaches an End Event that terminates it. */
const terminatingScope = (program: Json): Json =>
  withFlows(append(task(scope("T", "embedded"))(program), start("XS", null, [], "T"), end("X", terminateThrow, "T")),
    flow("fx", "XS", "X"));

/** `T` becomes an interrupting Event Sub-Process. */
const interruptingScope = task(scope("T", eventSubProcess(duration("PT1S"), true)));

/** The called process `Called` reaches, at its process level, an End Event `CX` that terminates its instance. */
const terminatingCalledProcess = (program: Json): Json =>
  withFlows({ ...append(program, start("CS"), end("CX", terminateThrow)),
    processes: [{ definition: definitionRef("Called"), children: ["CS", "CX"], variables: [], executable: true }] },
  flow("fc", "CS", "CX"));

const completesNormally = { abnormalScopeEnd: "completesNormally" };

/** `T` becomes a Sub-Process `XS -> U -> XE` whose User Task `U` is compensable by the unconnected handler `H` inside it. */
const compensableScope = (program: Json): Json =>
  withFlows(append(task(scope("T", "embedded"))(program),
    start("XS", null, [], "T"), activity("U", userWork(), { compensationHandlers: ["H"] }, "T"), end("XE", "none", "T"),
    activity("H", "manual", { forCompensation: true }, "T")), flow("xu", "XS", "U"), flow("ux", "U", "XE"));

/** `T` becomes a Multi-Instance User Task compensable by the unconnected handler `H`. */
const loopedHandler = (program: Json): Json =>
  append(task(activity("T", userWork(), { compensationHandlers: ["H"], multiInstance: loop() }))(program),
    activity("H", "manual", { incoming: [], outgoing: [], forCompensation: true }));

export const rows: readonly Row[] = [
  {
    code: "profile.compensationOrder.allAtOnce",
    description: "every handler of a trigger started at once",
    mutate: option({ compensationOrder: "allAtOnce" }),
    control: option({ compensationOrder: "dependency" }),
  },
  {
    code: "profile.compensationHandlerFailure.selected",
    description: "a selected compensation handler failure",
    mutate: option({ compensationHandlerFailure: { selected: { code: "HandlerFailed" } } }),
    control: option({ compensationHandlerFailure: "failsInstance" }),
  },
  {
    code: "profile.errorExitCompensation.compensatesContained",
    description: "compensating the contained work of a Sub-Process an Error leaves, for a Sub-Process retaining compensable work",
    mutate: (program) => compensableScope(withOptions(program, { errorExitCompensation: "compensatesContained" })),
    control: option({ errorExitCompensation: "compensatesContained" }),
  },
  {
    code: "profile.multiInstanceCompensation.perInstance",
    description: "a compensation record per instance, for a Multi-Instance User Task with a handler",
    mutate: (program) => loopedHandler(withOptions(program, { multiInstanceCompensation: "perInstance" })),
    control: option({ multiInstanceCompensation: "perInstance" }),
  },
  {
    code: "profile.callBindingTime.invocation",
    description: "a called process bound at invocation",
    mutate: option({ callBindingTime: "invocation" }),
    control: option({ callBindingTime: "programAssembly" }),
  },
  {
    code: "profile.timerZone",
    description: "a Timer time zone",
    mutate: option({ timerZone: "Europe/Berlin" }),
    control: option({ timerZone: null }),
  },
  {
    code: "profile.deploymentErrors.cibDeployment",
    description: "CIB's deployment errors over forms BPMN 2.0.2 defines, before A1 classifies them (AD7)",
    mutate: option({ deploymentErrors: "cibDeployment" }),
    control: option({ deploymentErrors: "bpmnValidity" }),
  },
  {
    code: "profile.handlerEscalation.reentersHandler",
    description: "CIB's re-entry of a handler an Escalation from deeper inside it matches",
    mutate: option({ handlerEscalation: "reentersHandler" }),
    control: option({ handlerEscalation: "passesHandler" }),
  },
  {
    code: "profile.defaultRetryCycle",
    description: "an engine-wide default retry cycle, before the job model reads it (AD8)",
    mutate: option({ defaultRetryCycle: "R3/PT5M" }),
    control: option({ defaultRetryCycle: null }),
  },
  {
    // AD1: every inert item needs its register entry; none is admitted yet.
    code: "profile.inertExtensions",
    description: "a non-empty inert extension table",
    mutate: option({ inertExtensions: [{ elementType: "bpmn:Process",
      name: { namespace: "http://camunda.org/schema/1.0/bpmn", localName: "historyTimeToLive" } }] }),
    control: option({ inertExtensions: [] }),
  },
  {
    code: "profile.abnormalScopeEnd.withoutOutflow",
    description: "an abnormal scope end that leaves without outflow, reached by a Terminate in a Sub-Process",
    mutate: (program) => terminatingScope(withOptions(program, { abnormalScopeEnd: "withoutOutflow" })),
    control: (program) => terminatingScope(withOptions(program, completesNormally)),
  },
  {
    code: "profile.abnormalScopeEnd.withoutOutflow",
    description: "an abnormal scope end that leaves without outflow, reached by an interrupting Event Sub-Process",
    mutate: (program) => interruptingScope(withOptions(program, { abnormalScopeEnd: "withoutOutflow" })),
    control: (program) => interruptingScope(withOptions(program, completesNormally)),
  },
  {
    code: "profile.abnormalScopeEnd.withoutOutflow",
    description: "an abnormal scope end that leaves without outflow, reached by a Terminate at a called process's level",
    mutate: (program) => terminatingCalledProcess(withOptions(program, { abnormalScopeEnd: "withoutOutflow" })),
    control: (program) => terminatingCalledProcess(withOptions(program, completesNormally)),
  },
];

/** DC28: each option value whose meaning depends on run order, refused under `orderInvariant` and admitted under the
 * schedule it needs. Each is a forged option set no catalog profile selects: the CIB profiles select every such value
 * together with `declarationDepthFirst` (CIB-OP-0016), so selecting, say, CIB-INT-0028's Signal addresses without it is
 * caught by admission, not by a guard over the catalog. */
const orderDependent: ReadonlyArray<readonly [string, Json, string]> = [
  ["profile.unhandledError.endsThrowingPath.orderInvariant", { unhandledError: "endsThrowingPath" }, "an uncaught Error that ends only its path"],
  ["profile.raisedCallOutputs.atCalledRoot.orderInvariant", { raisedCallOutputs: "atCalledRoot" }, "Call outputs mapped at a raised called root"],
  ["profile.signalNames.addresses.orderInvariant", { signalNames: "addresses" }, "Signals addressed by name (CIB-INT-0028)"],
  ["profile.messageNames.addresses.orderInvariant", { messageNames: "addresses" }, "Messages addressed by name"],
  ["profile.multiInstanceCounters.cibLocals.orderInvariant", { multiInstanceCounters: "cibLocals" }, "CIB's Multi-Instance counters"],
  ["profile.inclusiveJoinReach.outgoingOnly.orderInvariant", { inclusiveJoinReach: "outgoingOnly" }, "an Inclusive join reach without boundaries"],
];

const orderRows: readonly Row[] = orderDependent.map(([code, selects, description]) => ({
  code,
  description: `${description} under an order-invariant schedule`,
  mutate: option({ ...selects, branchSchedule: "orderInvariant" }),
  control: option({ ...selects, branchSchedule: "declarationDepthFirst" }),
}));

refusalTests("profile", rows);
refusalTests("profile order", orderRows);

// BPMN 2.0.2 Table 10.87: `isInterrupting` "cannot be applied to … Compensation Events (where it doesn't apply)", so a
// Compensation Event Sub-Process whose start carries the attribute's default, `true`, reaches no abnormal scope end.
test("profile: a Compensation Event Sub-Process is no abnormal scope end, whatever its start declares", () => {
  const compensated = (declared: boolean) => (program: Json): Json =>
    withFlows(append(task(scope("T", "embedded", {}, { compensationHandlers: ["K"] }))(program),
      start("XS", null, [], "T"), end("XE", "none", "T"),
      scope("K", eventSubProcess(compensationTrigger, declared), {}, {}, "T"), start("KS", compensationTrigger, [], "K")),
    flow("xx", "XS", "XE"));
  const standards = withOptions(base(), { abnormalScopeEnd: "withoutOutflow" });
  assert.equal(refusalOf(compensated(true)(standards)), null);
  assert.equal(refusalOf(compensated(false)(standards)), null);
});
