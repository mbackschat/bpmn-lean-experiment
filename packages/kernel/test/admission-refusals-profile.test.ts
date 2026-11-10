/**
 * Refusal tests of `admission/profile.ts`: a profile may select only behaviour the kernel implements. Each option the
 * kernel has one reading of refuses its other value; `abnormalScopeEnd` is refused only for a program whose own shape
 * reaches an abnormal scope end (a Terminate in a Sub-Process or at a called process's level, or an interrupting Event
 * Sub-Process).
 */
import {
  append, definitionRef, duration, end, eventSubProcess, flow, refusalTests, scope, start, task, withFlows, withOptions,
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

export const rows: readonly Row[] = [
  {
    code: "profile.messageCorrelation.apiCriteria",
    description: "message correlation by API criteria",
    mutate: option({ messageCorrelation: "apiCriteria" }),
    control: option({ messageCorrelation: "modeledKey" }),
  },
  {
    code: "profile.deliveryVariables.installs",
    description: "a delivery that installs its variables",
    mutate: option({ deliveryVariables: "installs" }),
    control: option({ deliveryVariables: "mappedOnly" }),
  },
  {
    code: "profile.compensationOrder.reverseCreation",
    description: "compensation in reverse creation order",
    mutate: option({ compensationOrder: "reverseCreation" }),
    control: option({ compensationOrder: "dependency" }),
  },
  {
    code: "profile.compensationHandlerFailure.selected",
    description: "a selected compensation handler failure",
    mutate: option({ compensationHandlerFailure: { selected: { code: "HandlerFailed" } } }),
    control: option({ compensationHandlerFailure: "failsInstance" }),
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
