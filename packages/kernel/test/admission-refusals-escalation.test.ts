/**
 * Refusal tests of the Escalation declarations one host may carry (PC-ESCALATION-02): at most one Escalation boundary
 * of a host may match any code. CIB 2.2.0 refuses the deployment otherwise (`BpmnParse.java:3702-3735`), and the
 * kernel refuses it under every profile: BPMN 2.0.2 §10.5.6 lets several non-interrupting handlers of one declaration
 * all run, which the search's one catcher per level does not do. A catch's code variable is CIB's extension, admitted
 * only with the Error catch variables (PC-ESCALATION-01, CIB-EXT-0028).
 */
import {
  activity, append, boundary, callWork, definitionRef, end, escalationTrigger, eventSubProcess, flow, receiveWork, refusalTests, scope,
  serviceWork, start, task, text, userWork, withFlows, withOptions,
} from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

const exact = (code: string) => escalationTrigger({ code });
const catchAll = escalationTrigger();
const nonInterrupting = { interrupting: false };

/** `T` becomes a User Task hosting `boundaries` in document order. */
const hosting = (...boundaries: unknown[]) => task(activity("T", userWork(), { boundaries }));

/** `T` becomes an Activity of `work` with one interrupting Escalation boundary `B`. */
const escalationOn = (work: Json | string) => task(activity("T", work, { boundaries: [boundary("B", exact("OVERRUN"))] }));

/** `T` becomes a Scope of `kind` with one interrupting Escalation boundary `B` and a Task `C` its implicit start begins. */
const escalationOnScope = (kind: Json | string) => (program: Json): Json =>
  append(task(scope("T", kind, {}, { boundaries: [boundary("B", exact("OVERRUN"))] }))(program),
    activity("C", "manual", { incoming: [], outgoing: [] }, "T"));

/** `T` becomes a Call Activity of the carried process `Q`, `QS → QE`, with one interrupting Escalation boundary `B`. */
const escalationOnCall = (program: Json): Json => ({
  ...withFlows(append(escalationOn(callWork({ calledElement: text("Q") }))(program), start("QS"), end("QE")), flow("q1", "QS", "QE")),
  processes: [{ definition: definitionRef("Q"), children: ["QS", "QE"], variables: [], executable: true }],
});

/** `T` becomes a Sub-Process whose own start Event `SS` waits for `trigger`, an Event Sub-Process start. */
const nested = (trigger: Json) => (program: Json): Json =>
  append(task(scope("T", "embedded", { children: ["SS"] }))(program), start("SS", trigger, [], "T"));

const coded = escalationTrigger({ code: "OVERRUN", codeVariable: "code" });
const catchVariables = (placement: (program: Json) => Json) => (program: Json): Json =>
  placement(withOptions(program, { errorCatchVariables: "eventScope" }));

/**
 * `T` becomes the Event Sub-Process `H1` on `first` and `H2` on `second` is added, both declared in `parent` (the
 * process level when `null`, else a Sub-Process `T` holding them). An interrupting one is an abnormal scope end, so the
 * profile that completes normally is selected.
 */
const handlers = (first: [Json, boolean], second: [Json, boolean], parent: string | null = null) => (program: Json): Json => {
  const profiled = withOptions(program, { abnormalScopeEnd: "completesNormally" });
  const [h1, h2] = [scope("H1", eventSubProcess(...first), {}, {}, parent), scope("H2", eventSubProcess(...second), {}, {}, parent)];
  return parent === null ? append(task(h1)(profiled), h2) : append(task(scope("T", "embedded"))(profiled), h1, h2);
};

refusalTests("escalation declarations", [
  // Pinned CIB admits an Escalation boundary only on a Sub-Process, a Transaction, a Call Activity or a User Task
  // (`BpmnParse.java:3335-3342`).
  {
    code: "boundary.escalation.host",
    description: "an Escalation boundary on a manual Task",
    mutate: escalationOn("manual"),
    control: escalationOn(userWork()),
  },
  {
    code: "boundary.escalation.host",
    description: "an Escalation boundary on a Service Task",
    mutate: escalationOn(serviceWork()),
    control: escalationOnScope("embedded"),
  },
  {
    code: "boundary.escalation.host",
    description: "an Escalation boundary on a Task without a type",
    mutate: escalationOn("none"),
    control: escalationOnCall,
  },
  {
    code: "boundary.escalation.host",
    description: "an Escalation boundary on a Receive Task",
    mutate: escalationOn(receiveWork({ messageRef: "M" })),
    control: escalationOnScope({ transaction: { payload: { method: "compensate" } } }),
  },
  {
    code: "scope.eventSubProcess.escalationDuplicate",
    description: "a process level with an interrupting and a non-interrupting Escalation Event Sub-Process of one code",
    mutate: handlers([exact("OVERRUN"), true], [exact("OVERRUN"), false]),
    control: handlers([exact("OVERRUN"), true], [exact("SLIP"), false]),
  },
  {
    code: "scope.eventSubProcess.escalationDuplicate",
    description: "a Sub-Process with an exact and a catch-all Escalation Event Sub-Process",
    mutate: handlers([exact("OVERRUN"), false], [catchAll, false], "T"),
    control: handlers([exact("OVERRUN"), false], [exact("SLIP"), false], "T"),
  },
  {
    code: "scope.eventSubProcess.escalationDuplicate",
    description: "a process level with two catch-all Escalation Event Sub-Processes",
    mutate: handlers([catchAll, false], [catchAll, false]),
    control: (program) => task(scope("T", eventSubProcess(catchAll, false)))(program),
  },
  {
    code: "boundary.escalation.duplicate",
    description: "a host with an interrupting and a non-interrupting Escalation boundary of one code",
    mutate: hosting(boundary("B", exact("OVERRUN")), boundary("B2", exact("OVERRUN"), nonInterrupting)),
    control: hosting(boundary("B", exact("OVERRUN")), boundary("B2", exact("SLIP"), nonInterrupting)),
  },
  {
    code: "boundary.escalation.duplicate",
    description: "a host with an exact and a catch-all Escalation boundary",
    mutate: hosting(boundary("B", exact("OVERRUN"), nonInterrupting), boundary("B2", catchAll, nonInterrupting)),
    control: hosting(boundary("B", exact("OVERRUN"), nonInterrupting), boundary("B2", exact("SLIP"), nonInterrupting)),
  },
  {
    code: "boundary.escalation.duplicate",
    description: "a host with a catch-all Escalation boundary before an exact one",
    mutate: hosting(boundary("B", catchAll, nonInterrupting), boundary("B2", exact("OVERRUN"), nonInterrupting)),
    control: hosting(boundary("B", catchAll, nonInterrupting)),
  },
  {
    code: "boundary.escalation.duplicate",
    description: "a host with two catch-all Escalation boundaries",
    mutate: hosting(boundary("B", catchAll, nonInterrupting), boundary("B2", catchAll, nonInterrupting)),
  },
  {
    code: "event.escalation.codeVariable",
    description: "a boundary Escalation code variable without the Error catch variables",
    mutate: hosting(boundary("B", coded)),
    control: catchVariables(hosting(boundary("B", coded))),
  },
  {
    code: "event.escalation.codeVariable",
    description: "an Event Sub-Process Escalation code variable without the Error catch variables",
    mutate: nested(coded),
    control: catchVariables(nested(coded)),
  },
]);
