/**
 * Refusal tests of `flow.concurrentInterference` (issue #81): under `BranchSchedule.orderInvariant` a split is refused
 * when one branch may, in the closure that begins them, remove work another branch begins (an Error or Escalation
 * caught by an interrupting catcher around the split, a Terminate End, an interrupting Event Sub-Process), resume a
 * Signal subscription another branch opens, or compensate an Activity another branch completes; and when one later
 * Signal broadcast may resume a subscription each branch left open, in the order the split's closure opened them,
 * with continuations that race or interfere. Which of those happens first is the closure's queue order, which BPMN
 * leaves open (Table 13.1, §13.3.1) and no input states.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  activity, append, base, boundary, catchEvent, end, errorTrigger, eventSubProcess, escalationTrigger, flow, gateway, loop, refusalOf, refusalTests,
  replace, scope, signal, start, userWork, variable, withOptions,
} from "./admission-refusal-support.ts";
import type { Json, Row } from "./admission-refusal-support.ts";

const raiseError: Json = { error: { payload: { code: "E", message: null } } };
const raiseEscalation: Json = { escalation: { payload: { code: "X" } } };
const signalThrow: Json = { signal: { payload: { ...(signal() as { signal: { payload: Json } }).signal.payload,
  payload: [], propagateAll: null, localOnly: false, businessKey: null, asynchronous: false } } };
const compensateAll: Json = { compensation: { payload: { activity: null, waitForCompletion: true } } };

/** An intermediate throw Event `id` in `parent` throwing `record`. */
const throwing = (id: string, record: Json | string, parent: string | null = null): Json => ({
  event: {
    header: { id, origin: { definition: null, sourceId: id }, sourceType: "intermediateThrowEvent", parent },
    payload: { role: { throw: { record } }, placement: "intermediate", incoming: [], outgoing: [], alternativeThrows: [] },
  },
});

const idOf = (element: Json): string => ((Object.values(element)[0] as Json).header as Json).id as string;

type Branch = Readonly<{ elements: Json[]; flows: Json[] }>;

/** A branch running `elements` in sequence inside `parent`, its flows named after `prefix`. */
const branch = (prefix: string, ...elements: Json[]): Branch => ({
  elements,
  flows: elements.slice(1).map((next, index) => flow(`${prefix}${String(index)}`, idOf(elements[index] as Json), idOf(next))),
});

/**
 * `S -> R -> E`, the Sub-Process `R` carrying `boundaries` (each to its own User Task) and holding `RS -> F`, a Parallel
 * fork whose flow `fa` begins branch `first` and `fb` branch `second`.
 */
const forkIn = (first: Branch, second: Branch, boundaries: Json[] = []) => (program: Json): Json => {
  const handlers = boundaries.flatMap((attached) => [activity(`H${attached.id as string}`, userWork()), end(`HE${attached.id as string}`)]);
  const handled = boundaries.flatMap((attached) => [
    flow(`to${attached.id as string}`, attached.id as string, `H${attached.id as string}`),
    flow(`from${attached.id as string}`, `H${attached.id as string}`, `HE${attached.id as string}`),
  ]);
  return {
    ...append(replace(program, "T", scope("R", "embedded", {}, { boundaries: boundaries.map((attached) => ({ ...attached, outgoing: [`to${attached.id as string}`] })) })),
      ...handlers, start("RS", null, [], "R"), gateway("F", "parallel", {}, "R"), ...first.elements, ...second.elements),
    flows: [flow("f1", "S", "R"), flow("f2", "R", "E"), ...handled, flow("rs", "RS", "F"),
      flow("fa", "F", idOf(first.elements[0] as Json)), flow("fb", "F", idOf(second.elements[0] as Json)), ...first.flows, ...second.flows],
  };
};

const errorBoundary = boundary("BE", errorTrigger({ code: "E" }));
const waiting = (id: string): Branch => branch(id, activity(id, userWork(), {}, "R"), end(`${id}End`, "none", "R"));

const rows: Row[] = [
  {
    code: "flow.concurrentInterference",
    description: "a branch whose Error End R's interrupting boundary catches beside a sibling's User Task",
    mutate: forkIn(branch("a", end("A", raiseError, "R")), waiting("U"), [errorBoundary]),
    control: forkIn(branch("a", end("A", "none", "R")), waiting("U"), [errorBoundary]),
  },
  {
    code: "flow.concurrentInterference",
    description: "a branch whose Escalation End an interrupting boundary of R catches beside a sibling's User Task",
    mutate: forkIn(branch("a", end("A", raiseEscalation, "R")), waiting("U"), [boundary("BX", escalationTrigger({ code: "X" }))]),
    control: forkIn(branch("a", end("A", raiseEscalation, "R")), waiting("U"),
      [boundary("BX", escalationTrigger({ code: "X" }), { interrupting: false })]),
  },
  {
    code: "flow.concurrentInterference",
    description: "a branch whose Error an interrupting Event Sub-Process of R catches beside a sibling's User Task",
    // The standards profile refuses every interrupting Event Sub-Process (`profile.abnormalScopeEnd.withoutOutflow`).
    mutate: (program) => withOptions(append(forkIn(branch("a", end("A", raiseError, "R")), waiting("U"))(program),
      scope("H", eventSubProcess(errorTrigger({ code: "E" }), true), {}, {}, "R"),
      start("HS", errorTrigger({ code: "E" }), [], "H"), end("HE", "none", "H")), { abnormalScopeEnd: "completesNormally" }),
    control: (program) => withOptions(append(forkIn(branch("a", end("A", "none", "R")), waiting("U"))(program),
      scope("H", eventSubProcess(errorTrigger({ code: "E" }), true), {}, {}, "R"),
      start("HS", errorTrigger({ code: "E" }), [], "H"), end("HE", "none", "H")), { abnormalScopeEnd: "completesNormally" }),
  },
  {
    code: "flow.concurrentInterference",
    description: "a branch whose Signal throw resumes the Signal catch a sibling opens",
    mutate: forkIn(branch("a", throwing("A", signalThrow, "R"), end("AEnd", "none", "R")),
      branch("b", catchEvent("C", signal(), [], "R"), activity("U", userWork(), {}, "R"), end("UEnd", "none", "R"))),
    control: forkIn(branch("a", throwing("A", "none", "R"), end("AEnd", "none", "R")),
      branch("b", catchEvent("C", signal(), [], "R"), activity("U", userWork(), {}, "R"), end("UEnd", "none", "R"))),
  },
  {
    code: "flow.concurrentInterference",
    description: "a branch whose Compensation throw may find the record of a Sub-Process a sibling completes",
    mutate: (program) => append(forkIn(branch("a", throwing("A", compensateAll, "R"), end("AEnd", "none", "R")),
      branch("b", scope("B", "embedded", {}, { compensationHandlers: ["HB"] }, "R"), end("BEnd", "none", "R")))(program),
    start("BS", null, [], "B"), end("BE", "none", "B"), activity("HB", userWork(), { incoming: [], outgoing: [], forCompensation: true }, "R")),
    control: (program) => append(forkIn(branch("a", throwing("A", "none", "R"), end("AEnd", "none", "R")),
      branch("b", scope("B", "embedded", {}, { compensationHandlers: ["HB"] }, "R"), end("BEnd", "none", "R")))(program),
    start("BS", null, [], "B"), end("BE", "none", "B"), activity("HB", userWork(), { incoming: [], outgoing: [], forCompensation: true }, "R")),
  },
  {
    code: "flow.concurrentInterference",
    description: "two branches' Signal catches one broadcast resumes, one continuing to an Error End R's boundary catches",
    mutate: forkIn(branch("a", catchEvent("CA", signal(), [], "R"), end("A", raiseError, "R")),
      branch("b", catchEvent("CB", signal(), [], "R"), activity("U", userWork(), {}, "R"), end("UEnd", "none", "R")), [errorBoundary]),
    control: forkIn(branch("a", catchEvent("CA", signal(), [], "R"), end("A", "none", "R")),
      branch("b", catchEvent("CB", signal(), [], "R"), activity("U", userWork(), {}, "R"), end("UEnd", "none", "R")), [errorBoundary]),
  },
];

refusalTests("flow interference", rows);

/** `S -> F (Parallel fork) -> A, B` at the process level, where `A` is `first` and `B` a User Task, each to its own End. */
const rootFork = (first: Json) => (program: Json): Json => ({
  ...append(replace(program, "T", gateway("T", "parallel")), first, activity("B", userWork()), end("BEnd")),
  flows: [flow("f1", "S", "T"), flow("a", "T", "A"), flow("b", "T", "B"), flow("bb", "B", "BEnd")],
});

test("flow interference: a process-level Terminate End beside a sibling's User Task is refused", () => {
  assert.equal(refusalOf(rootFork(end("A", "terminate"))(base())), "flow.concurrentInterference");
  assert.equal(refusalOf(rootFork(end("A", "none"))(base())), null);
});

test("flow interference: an Error caught inside the branch's own Sub-Process removes nothing a sibling begins", () => {
  const own = (program: Json): Json => {
    const forked = forkIn(branch("a", scope("P", "embedded", {}, { boundaries: [boundary("BP", errorTrigger({ code: "E" }), { outgoing: ["toBP"] })] }, "R"),
      end("AEnd", "none", "R")), waiting("U"))(program);
    return {
      ...append(forked, start("PS", null, [], "P"), end("PE", raiseError, "P"), activity("HP", userWork(), {}, "R"), end("HPE", "none", "R")),
      flows: [...(forked.flows as Json[]), flow("ps", "PS", "PE"), flow("toBP", "BP", "HP"), flow("hp", "HP", "HPE")],
    };
  };
  assert.equal(refusalOf(own(base())), null);
});

test("flow interference: CIB's declaration-order schedule admits every interfering split (CIB-OP-0016)", () => {
  const cib = (shape: (program: Json) => Json) => (program: Json): Json => withOptions(shape(program), { branchSchedule: "declarationDepthFirst" });
  for (const row of rows) assert.equal(refusalOf(cib(row.mutate)(base())), null, row.description);
});

/**
 * A parallel Multi-Instance Sub-Process `M` over `items` inside `R`, each instance running `MS -> body... -> ME`: an
 * instance's removal of the body or resumption of what a sibling instance opens is
 * `multiInstance.concurrentInstances`.
 */
const looping = (...body: Json[]) => (program: Json): Json => {
  const instance = replace(program, "T", scope("M", "embedded", {}, {
    multiInstance: loop({ count: { collection: { items: variable("items") } }, outputDataItem: null }),
    boundaries: [{ ...errorBoundary, outgoing: ["toBE"] }],
  }));
  const ids = ["MS", ...body.map(idOf), "ME"];
  return {
    ...append(instance, start("MS", null, [], "M"), ...body, end("ME", "none", "M"), activity("HO", userWork()), end("HOE")),
    flows: [...(instance.flows as Json[]), ...ids.slice(1).map((next, index) => flow(`m${String(index)}`, ids[index] as string, next)),
      flow("toBE", "BE", "HO"), flow("ho", "HO", "HOE")],
  };
};

test("multi-instance interference: an instance whose Error the body's boundary catches is refused", () => {
  assert.equal(refusalOf(looping(throwing("X", "none", "M"), end("XE", raiseError, "M"))(base())), "multiInstance.concurrentInstances");
  assert.equal(refusalOf(looping(throwing("X", "none", "M"), end("XE", "none", "M"))(base())), null);
});

test("multi-instance interference: an instance whose Signal throw resumes a sibling instance's catch is refused", () => {
  assert.equal(refusalOf(looping(catchEvent("C", signal(), [], "M"), throwing("X", signalThrow, "M"))(base())), null,
    "a catch an instance stops at precedes its own throw");
  assert.equal(refusalOf(looping(throwing("X", signalThrow, "M"), catchEvent("C", signal(), [], "M"))(base())), "multiInstance.concurrentInstances");
});
