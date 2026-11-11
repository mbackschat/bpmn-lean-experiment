/**
 * Refusal tests of `admission/profile.ts`: a profile may select only behaviour the kernel implements. Each option the
 * kernel has one reading of refuses its other value; `abnormalScopeEnd` is refused only for a program whose own shape
 * reaches an abnormal scope end (a Terminate in a Sub-Process or at a called process's level, or an interrupting Event
 * Sub-Process), `errorExitCompensation` and `multiInstanceCompensation` only for a program their alternative would
 * change, so their controls select the alternative for the base program.
 */
import {
  activity, append, definitionRef, duration, end, eventSubProcess, flow, loop, refusalTests, scope, start, task, userWork,
  withFlows, withOptions,
} from "./admission-refusal-support.ts";
import type { Json, Row } from "./admission-refusal-support.ts";

const option = (over: Json) => (program: Json): Json => withOptions(program, over);

/** `T` becomes a Sub-Process whose start `XS` reaches an End Event that terminates it. */
const terminatingScope = (program: Json): Json =>
  withFlows(append(task(scope("T", "embedded"))(program), start("XS", null, [], "T"), end("X", "terminate", "T")),
    flow("fx", "XS", "X"));

/** `T` becomes an interrupting Event Sub-Process. */
const interruptingScope = task(scope("T", eventSubProcess(duration("PT1S"), true)));

/** The called process `Called` reaches, at its process level, an End Event `CX` that terminates its instance. */
const terminatingCalledProcess = (program: Json): Json =>
  withFlows({ ...append(program, start("CS"), end("CX", "terminate")),
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
    code: "profile.compensationHandlerFailure.propagatesFromTrigger",
    description: "a handler failure propagating from its trigger",
    mutate: option({ compensationHandlerFailure: "propagatesFromTrigger" }),
    control: option({ compensationHandlerFailure: "failsInstance" }),
  },
  {
    code: "profile.implicitCompensation.everySubProcess",
    description: "implicit compensation of every Sub-Process",
    mutate: option({ implicitCompensation: "everySubProcess" }),
    control: option({ implicitCompensation: "refused" }),
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
    code: "profile.compensationReferenceScope.eventSubProcessParent",
    description: "a Compensation throw in an Event Sub-Process naming an Activity of its parent's level",
    mutate: option({ compensationReferenceScope: "eventSubProcessParent" }),
    control: option({ compensationReferenceScope: "visible" }),
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

refusalTests("profile", rows);
