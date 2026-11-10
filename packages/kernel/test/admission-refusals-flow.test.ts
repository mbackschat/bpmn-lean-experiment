/**
 * Refusal tests of `admission/flow.ts`: a condition is read only on a conditional gateway's candidates and on an
 * Activity's non-default flows, an Event-Based Gateway arms only catch Events, an Exclusive Gateway refuses the
 * unconditioned flows CIB refuses to parse, an Exclusive or Inclusive Gateway needs an outgoing flow, a process has one initial start and a Sub-Process one start, and a throwing
 * Link needs exactly one catching Link of its name.
 */
import {
  activity, append, base, mapping, variable, withOptions, catchEvent, conditionOn, duration, end, eventBased, flow, gateway, link, message, receiveWork, refusalOf, refusalTests, replace,
  scope, simpleBoolean, start, task, text, userWork, withFlows,
} from "./admission-refusal-support.ts";
import type { Json, Row } from "./admission-refusal-support.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

/** `T` is replaced by `source`, whose outgoing flow `f2` carries a condition. */
const conditionalFrom = (source: Json) => (program: Json): Json =>
  conditionOn(withFlows(replace(program, "T", source), flow("fd", "T", "E")), "f2", simpleBoolean());

/** `T` is a Task whose default flow is `fd`, with `flowId`, `f2` or `fd`, conditioned. */
const taskWithDefault = (flowId: string) => (program: Json): Json =>
  conditionOn(withFlows(replace(program, "T", activity("T", "manual", { outgoing: ["f2", "fd"], defaultFlow: "fd" })),
    flow("fd", "T", "E")), flowId, simpleBoolean());

/** `T` becomes an Event-Based Gateway of `instantiation` and `E` the one arm `arm` its outgoing flow `f2` reaches. */
const armedBy = (arm: Json, instantiation = "none") => (program: Json): Json =>
  replace(replace(program, "T", gateway("T", eventBased(instantiation))), "E", arm);

const exclusive = (candidates: string[]): Json => gateway("T", { exclusive: { candidates, default: "fd" } });

const linkThrow = (program: Json): Json => replace(program, "T", link("T", "linkThrow", "L"));

/** `T` becomes a diverging gateway of `kind` over `f2` and a second flow `f3` to `E`, with these conditions. */
const diverging = (kind: "exclusive" | "inclusive", second: Json | null, defaultFlow: string | null = null) => (program: Json): Json =>
  conditionOn(conditionOn(withFlows(replace(program, "T", gateway("T", { [kind]: { candidates: ["f2", "f3"], default: defaultFlow } })),
    flow("f3", "T", "E")), "f2", simpleBoolean()), "f3", second);

/** `T` becomes an Exclusive Gateway over `f2` and `f3` with the default `fd`, with `f2` conditioned and `f3` as given. */
const besideDefault = (second: Json | null) => (program: Json): Json =>
  conditionOn(conditionOn(withFlows(replace(program, "T", gateway("T", { exclusive: { candidates: ["f2", "f3"], default: "fd" } })),
    flow("f3", "T", "E"), flow("fd", "T", "E")), "f2", simpleBoolean()), "f3", second);

/** The base program with a second start `X` of `trigger` beside `S`. */
const secondStart = (trigger: Json | null) => (program: Json): Json =>
  withFlows(append(program, start("X", trigger)), flow("fX", "X", "E"));

/** The base program with its Task a Sub-Process holding `count` None Starts, each to the inner End `XE`. */
const subProcessStarts = (count: number) => (program: Json): Json => {
  const ids = Array.from({ length: count }, (_, index) => `XS${String(index)}`);
  const inner = append(task(scope("T", "embedded"))(program), ...ids.map((id) => start(id, null, [], "T")), end("XE", "none", "T"));
  return withFlows(inner, ...ids.map((id) => flow(`f${id}`, id, "XE")));
};

/** `T` becomes an exclusive gateway whose only flow `f2` is its only candidate, conditioned or not. */
const soleCandidate = (conditionExpression: Json | null) => (program: Json): Json =>
  conditionOn(replace(program, "T", gateway("T", { exclusive: { candidates: ["f2"], default: null } })), "f2", conditionExpression);

/** `T` becomes a gateway of `kind` with no candidate and no default; `outflow` keeps its flow `f2` to `E` or drops it. */
const routeless = (kind: "exclusive" | "inclusive", outflow: boolean) => (program: Json): Json => {
  const gatewayAt = replace(program, "T", gateway("T", { [kind]: { candidates: outflow ? ["f2"] : [], default: null } }));
  return outflow ? gatewayAt : { ...gatewayAt, flows: (gatewayAt.flows as Json[]).filter((entry) => entry.id !== "f2") };
};

/**
 * `Start -> T (Parallel fork) -> A, B -> J (Parallel join) -> End`, where the plain Tasks `A` and `B` write `first` and
 * `second` from the variable `read` (CIB-EXT-0031's output context, so their outputs are admitted under the standards
 * schedule), and `B`'s flow to the join is conditioned on `condition` when one is named.
 */
const racing = (first: string, second: string, read = "source", condition: string | null = null) => (program: Json): Json => {
  const written = (name: string, source: string): Json => ({ outputs: [mapping(name, variable(source))] });
  const forked = append(replace(program, "T", gateway("T", "parallel")),
    activity("A", "none", written(first, "source")), activity("B", "none", written(second, read)), gateway("J", "parallel"));
  const tested = condition === null ? null : { simpleBoolean: { body: { isPresent: { name: condition } } } };
  return withOptions({
    ...forked,
    flows: [flow("f1", "S", "T"), flow("a", "T", "A"), flow("b", "T", "B"), flow("ja", "A", "J"), flow("jb", "B", "J", tested),
      flow("f2", "J", "E")],
  }, { outputContext: "activityScope" });
};

/**
 * `Start -> T (Inclusive split) -> A, B -> J (Inclusive join) -> End`: `a` and `b` leave the split, `ja` and `jb` enter
 * the join, and `B` is a User Task unless a row names other work.
 */
function region(branchWork: Json | string = userWork(), extra: (program: Json) => Json = (program) => program): (program: Json) => Json {
  return (program) => extra({
    ...append(replace(program, "T", gateway("T", { inclusive: { candidates: ["a", "b"], default: null } })),
      activity("A", userWork()), activity("B", branchWork), gateway("J", { inclusive: { candidates: [], default: null } })),
    flows: [flow("f1", "S", "T"), flow("a", "T", "A"), flow("b", "T", "B"), flow("ja", "A", "J"), flow("jb", "B", "J"), flow("f2", "J", "E")],
  });
}

/** The region's join also receives a flow from a third Task `C` that `S` reaches beside the split. */
const crossEntry = (program: Json): Json =>
  withFlows(append(program, activity("C", userWork())), flow("sc", "S", "C"), flow("jc", "C", "J"));

export const rows: readonly Row[] = [
  {
    code: "gateway.eventBased.receiveArm",
    description: "an Event-Based Gateway arm that is a Receive Task",
    mutate: armedBy(activity("E", receiveWork(), { incoming: ["f2"], outgoing: [] })),
    control: armedBy(catchEvent("E", duration("PT1S"))),
  },
  {
    code: "flow.conditionalOutflow",
    description: "a condition on the default flow of a Task",
    mutate: taskWithDefault("fd"),
    control: conditionalFrom(activity("T", "manual")),
  },
  {
    code: "flow.conditionalOutflow",
    description: "a condition on the outflow of a Start Event",
    mutate: (program) => conditionOn(program, "f1", simpleBoolean()),
    control: conditionalFrom(activity("T", "manual")),
  },
  {
    code: "flow.conditionalOutflow",
    description: "a condition on the outflow of a Parallel Gateway",
    mutate: conditionalFrom(gateway("T", "parallel")),
    control: conditionalFrom(exclusive(["f2"])),
  },
  {
    code: "flow.conditionalOutflow",
    description: "a condition on a flow the exclusive gateway does not list as a candidate",
    mutate: conditionalFrom(exclusive([])),
    control: conditionalFrom(exclusive(["f2"])),
  },
  {
    code: "link.catch",
    description: "a throwing Link with no catching Link of its name",
    mutate: linkThrow,
    control: (program) => append(linkThrow(program), link("C", "linkCatch", "L")),
  },
  {
    code: "link.catch",
    description: "a throwing Link with two catching Links of its name",
    mutate: (program) => append(linkThrow(program), link("C1", "linkCatch", "L"), link("C2", "linkCatch", "L")),
    control: (program) => append(linkThrow(program), link("C1", "linkCatch", "L"), link("C2", "linkCatch", "Other")),
  },
  {
    // BPMN 2.0.2 §10.6.6: an instantiating gateway starts the Process; pinned CIB reads neither attribute (CIB-LIM-0008).
    code: "gateway.eventBased.instantiate",
    description: "an instantiating Exclusive Event-Based Gateway",
    mutate: armedBy(catchEvent("E", duration("PT1S")), "exclusive"),
    control: armedBy(catchEvent("E", duration("PT1S"))),
  },
  {
    code: "gateway.eventBased.instantiate",
    description: "a Parallel Event-Based Gateway",
    mutate: armedBy(catchEvent("E", duration("PT1S")), "parallel"),
    control: armedBy(catchEvent("E", duration("PT1S"))),
  },
  {
    code: "gateway.eventBased.linkArm",
    description: "an Event-Based Gateway arm that is a catching Link",
    mutate: armedBy(link("E", "linkCatch", "L")),
    control: armedBy(catchEvent("E", duration("PT1S"))),
  },
  {
    code: "gateway.exclusive.unconditionedFlow",
    description: "a diverging Exclusive Gateway with two unconditioned non-default flows",
    mutate: (program) => conditionOn(diverging("exclusive", null)(program), "f2", null),
    control: diverging("exclusive", null),
  },
  {
    code: "gateway.exclusive.unconditionedFlow",
    description: "a diverging Exclusive Gateway with an unconditioned flow beside its default",
    mutate: besideDefault(null),
    control: besideDefault(simpleBoolean()),
  },
  {
    code: "gateway.exclusive.singleConditionWithoutDefault",
    description: "an Exclusive Gateway whose one flow is conditioned and which has no default",
    mutate: soleCandidate(simpleBoolean()),
    control: soleCandidate(null),
  },
  {
    // CIB refuses it at deployment (`BpmnParse#validateExclusiveGateway`).
    code: "gateway.exclusive.noOutgoingFlow",
    description: "an Exclusive Gateway without an outgoing flow",
    mutate: routeless("exclusive", false),
    control: routeless("exclusive", true),
  },
  {
    // CIB deploys it and rolls back every activation (`InclusiveGatewayActivityBehavior#execute`, `stuckExecutionException`).
    code: "gateway.inclusive.noOutgoingFlow",
    description: "an Inclusive Gateway without an outgoing flow",
    mutate: routeless("inclusive", false),
    control: routeless("inclusive", true),
  },
  {
    // BPMN 2.0.2 Table 13.1, §13.3.1: the branches interleave in any order, so which write is left is undefined.
    code: "flow.concurrentWrite",
    description: "two branches of a Parallel fork writing one name with no wait between",
    mutate: racing("x", "x"),
    control: racing("x", "y"),
  },
  {
    code: "start.rootCombination",
    description: "a second None Start of the process",
    mutate: secondStart(null),
    control: secondStart(message({ messageRef: "M", name: text("M") })),
  },
  {
    code: "start.rootCombination",
    description: "a Timer Start beside the process's None Start",
    mutate: secondStart(duration("PT1S")),
    control: secondStart(message({ messageRef: "M", name: text("M") })),
  },
  {
    code: "start.subProcessCombination",
    description: "a second start of a Sub-Process",
    mutate: subProcessStarts(2),
    control: subProcessStarts(1),
  },
  {
    code: "link.duplicateCatch",
    description: "two catching Links of one name",
    mutate: (program) => append(program, link("C1", "linkCatch", "L"), link("C2", "linkCatch", "L")),
    control: (program) => append(program, link("C1", "linkCatch", "L"), link("C2", "linkCatch", "M")),
  },
];

refusalTests("flow", rows);

// The footprint counts reads as well as writes: the value a branch reads would otherwise depend on whether the sibling's
// write ran first, which no input states (audit of round 7, finding 2).
test("flow: a branch that reads a name a sibling branch writes is refused as flow.concurrentWrite", () => {
  assert.equal(refusalOf(racing("x", "y", "x")(base())), "flow.concurrentWrite", "an output mapping's source");
  assert.equal(refusalOf(racing("x", "y", "source", "x")(base())), "flow.concurrentWrite", "an outgoing condition");
  assert.equal(refusalOf(racing("x", "y", "z")(base())), null);
  assert.equal(refusalOf(racing("x", "y", "source", "z")(base())), null);
});

test("flow: Inclusive joins and splits of any shape and a catching Link with an incoming flow are admitted", () => {
  assert.equal(refusalOf(diverging("inclusive", simpleBoolean())(base())), null, "a split that may select nothing rolls back");
  assert.equal(refusalOf(region("manual")(base())), null, "a branch no work arms");
  assert.equal(refusalOf(region(userWork(), crossEntry)(base())), null, "an incoming flow from outside the region");
  assert.equal(refusalOf(withFlows(append(base(), link("C", "linkCatch", "L")), flow("fc", "T", "C"))), null);
});

test("flow: a dangling flow, list or default reference is refused as il.reference", () => {
  const dangling = withFlows(base(), flow("fx", "T", "Missing"));
  assert.equal(refusalOf(dangling, true), "il.reference");
  const unlisted = withFlows(base(), flow("fx", "S", "E"));
  assert.equal(refusalOf(unlisted, true), "il.reference");
  assert.equal(refusalOf(unlisted), null, "listing the flow at both ends admits it");
  const scoped = append(task(scope("T", "embedded"))(base()), start("XS", null, [], "T"));
  assert.equal(refusalOf(scoped), null);
  assert.equal(refusalOf(withFlows(scoped, flow("fx", "XS", "E"))), "il.reference", "a flow from a Scope's child to an element outside it");
  const outsideDefault = replace(base(), "T", gateway("T", { exclusive: { candidates: ["f2"], default: "f1" } }));
  assert.equal(refusalOf(outsideDefault, true), "il.reference");
  assert.equal(refusalOf(base(), true), null);
});
