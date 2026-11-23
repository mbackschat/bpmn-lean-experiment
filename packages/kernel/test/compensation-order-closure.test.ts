/**
 * The order of records completed in one closure under `BranchSchedule.orderInvariant` (DC15 (c), candidate (iii);
 * docs/kernel/semantics/COMPENSATION-SEMANTICS-SPEC.md I1 (d); BPMN 2.0.2 §13.5.5): records of different closures run
 * in reverse closure order, and records of one closure in reverse structural order, which no schedule changes. A
 * subject that follows another along the flows, through a join or out of its enclosing Sub-Process, is compensated
 * first in either fork order (W1, W-idle, W-idle-fresh); the instances of a parallel Multi-Instance Sub-Process that
 * completed in one closure have no order between them and are compensated together (W2). A unit test runs the one
 * production schedule, so declaring a fork's flows the other way round stands in for the other schedule.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { activity, base, end, eventSubProcess, flow, gateway, loop, refusalOf, scope, start, wired } from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";
import { compensateAll, complete, driveFrom, handlerTask, throwing, userTask, waiting } from "./compensation-support.ts";

/** A program of `elements` and `flows`, declaring `items`; every witness here is a model the standards profile admits. */
function program(elements: Json[], flows: Json[]): Json {
  const json = wired({ ...base(), variables: ["items"], elements, flows });
  assert.equal(refusalOf(json, true), null, "the witness is admitted");
  return json;
}

/** A non-waiting Sub-Process `id` in `parent` running `<id>S -> <id>T -> <id>E` (a Manual Task), compensable by `H<id>` beside it. */
const quick = (id: string, parent: string | null = null, env: Json = {}): [Json[], Json[]] => [[
  scope(id, "embedded", {}, { compensationHandlers: [`H${id}`], ...env }, parent), start(`${id}S`, null, [], id),
  activity(`${id}T`, "manual", {}, id), end(`${id}E`, "none", id), handlerTask(`H${id}`, parent),
], [flow(`${id}0`, `${id}S`, `${id}T`), flow(`${id}1`, `${id}T`, `${id}E`)]];

/** `items` bound to the Strings `values`. */
const items = (...values: string[]): Json[] =>
  [{ name: "items", value: { kind: "list", value: values.map((value) => ({ kind: "string", value })) } }];

/**
 * W1 (DC15 (c) review): `S -> PS`, a Parallel fork whose long branch runs `P1 -> P2 -> P3 -> A` into the join `PJ` and
 * whose other branch goes straight to it; `PJ -> B -> W -> E`, `E` compensating every record. `A` and `B` complete in
 * the closure the start runs; `B` follows `A` through the join. `swapped` declares the fork's flows the other way round.
 */
function w1(swapped: boolean): Json {
  const [a, aFlows] = quick("A");
  const [b, bFlows] = quick("B");
  const fork = [flow("long", "PS", "P1"), flow("short", "PS", "PJ")];
  return program(
    [start("S"), gateway("PS", "parallel"), ...["P1", "P2", "P3"].map((id) => activity(id, "manual")), ...a,
      gateway("PJ", "parallel"), ...b, userTask("W"), end("E", compensateAll)],
    [flow("s0", "S", "PS"), ...(swapped ? fork.reverse() : fork), flow("l1", "P1", "P2"), flow("l2", "P2", "P3"),
      flow("l3", "P3", "A"), flow("l4", "A", "PJ"), flow("j0", "PJ", "B"), flow("b0", "B", "W"), flow("w0", "W", "E"),
      ...aFlows, ...bFlows],
  );
}

for (const swapped of [false, true]) {
  test(`W1: a subject after a join is compensated before the one on the long branch it joined${swapped ? ", fork declared the other way" : ""}`, () => {
    const json = w1(swapped);
    assert.deepEqual(waiting(driveFrom(json, [], complete("W"))), ["HB"]);
    assert.deepEqual(waiting(driveFrom(json, [], complete("W"), complete("HB"))), ["HA"]);
  });
}

/**
 * W2 (DC15 (c) review): `S -> M -> X -> E`, `M` a parallel Multi-Instance Sub-Process over `items` whose body never
 * waits, so both instances complete in the closure the start runs, with no order between them.
 */
function w2(): Json {
  const [m, mFlows] = quick("M", null, { multiInstance: loop({ mode: "parallel", outputDataItem: null }) });
  return program([start("S"), ...m, userTask("X"), end("E", compensateAll)],
    [flow("s0", "S", "M"), flow("m0", "M", "X"), flow("x0", "X", "E"), ...mFlows]);
}

for (const order of [["i0", "i1"], ["i1", "i0"]]) {
  test(`W2: the records of parallel instances completed in one closure are compensated together (items ${order.join(", ")})`, () => {
    assert.deepEqual(waiting(driveFrom(w2(), items(...order), complete("X"))), ["HM", "HM"]);
  });
}

/**
 * W-idle and W-idle-fresh (T76): inside the Sub-Process `O`, the Sub-Process `SS` runs `First -> P1 -> P2 -> P3 -> X ->
 * SSE` and completes once idle, then `B` runs; `X` and `B` complete in one closure, and `B` follows `X` out of `SS`.
 * `O`'s Compensation Event Sub-Process `HO` compensates what `O` retains, `X`'s record moved out of `SS` included. In
 * W-idle `First` is a User Task, so that closure begins with its completion; in W-idle-fresh it is a Manual Task behind
 * the User Task `U`, so `SS` is entered fresh in the closure `U`'s completion runs. Main flow: `O -> W -> Undo ->
 * Inspect -> End`, where `Undo` compensates every record.
 */
function wIdle(fresh: boolean): Json {
  const [x, xFlows] = quick("X", "SS");
  const [b, bFlows] = quick("B", "O");
  const first = fresh ? activity("First", "manual", {}, "SS") : userTask("First", null, "SS");
  return program(
    [
      start("S"), scope("O", "embedded", {}, { compensationHandlers: ["HO"] }), start("OS", null, [], "O"),
      ...(fresh ? [userTask("U", null, "O")] : []), scope("SS", "embedded", {}, {}, "O"), start("SSS", null, [], "SS"), first,
      ...["P1", "P2", "P3"].map((id) => activity(id, "manual", {}, "SS")), ...x, end("SSE", "none", "SS"), ...b,
      end("OE", "none", "O"),
      scope("HO", eventSubProcess("compensation", true), {}, { incoming: [], outgoing: [], forCompensation: true }, "O"),
      start("HOS", "compensation", [], "HO"), throwing("HOT", compensateAll, "HO"), end("HOE", "none", "HO"),
      userTask("W"), throwing("Undo", compensateAll), userTask("Inspect"), end("E"),
    ],
    [
      flow("s0", "S", "O"), ...(fresh ? [flow("o0", "OS", "U"), flow("o1", "U", "SS")] : [flow("o0", "OS", "SS")]),
      flow("o2", "SS", "B"), flow("o3", "B", "OE"), flow("i0", "SSS", "First"), flow("i1", "First", "P1"),
      flow("i2", "P1", "P2"), flow("i3", "P2", "P3"), flow("i4", "P3", "X"), flow("i5", "X", "SSE"),
      flow("h0", "HOS", "HOT"), flow("h1", "HOT", "HOE"), flow("m0", "O", "W"), flow("m1", "W", "Undo"),
      flow("m2", "Undo", "Inspect"), flow("m3", "Inspect", "E"), ...xFlows, ...bFlows,
    ],
  );
}

for (const fresh of [false, true]) {
  test(`${fresh ? "W-idle-fresh" : "W-idle"}: a subject after an idle Sub-Process is compensated before one completed inside it`, () => {
    const ran = [complete(fresh ? "U" : "First"), complete("W")];
    assert.deepEqual(waiting(driveFrom(wIdle(fresh), [], ...ran)), ["HB"]);
    assert.deepEqual(waiting(driveFrom(wIdle(fresh), [], ...ran, complete("HB"))), ["HX"]);
  });
}

/** A Sub-Process `id` in `parent` holding the non-waiting Sub-Process `I<id>`, compensated by its Event Sub-Process `H<id>`, which compensates what it keeps. */
const holder = (id: string, parent: string | null): [Json[], Json[]] => {
  const [kept, keptFlows] = quick(`I${id}`, id);
  return [[
    scope(id, "embedded", {}, { compensationHandlers: [`H${id}`] }, parent), start(`${id}S`, null, [], id), ...kept, end(`${id}E`, "none", id),
    scope(`H${id}`, eventSubProcess("compensation", true), {}, { incoming: [], outgoing: [], forCompensation: true }, id),
    start(`H${id}S`, "compensation", [], `H${id}`), throwing(`H${id}T`, compensateAll, `H${id}`), end(`H${id}E`, "none", `H${id}`),
  ], [
    flow(`${id}0`, `${id}S`, `I${id}`), flow(`${id}1`, `I${id}`, `${id}E`), flow(`H${id}0`, `H${id}S`, `H${id}T`),
    flow(`H${id}1`, `H${id}T`, `H${id}E`), ...keptFlows,
  ]];
};

// Guard for the closure stamp: `completion` is the key that hands a kept record its own kept records back
// (`CompensableChild.group`), so records of one closure must keep distinct completion numbers.
test("records kept by records of one closure go back to their own holder", () => {
  const [a, aFlows] = holder("A", "O");
  const [b, bFlows] = holder("B", "O");
  const json = program(
    [
      start("S"), scope("O", "embedded", {}, { compensationHandlers: ["HO"] }), start("OS", null, [], "O"), ...a, ...b,
      end("OE", "none", "O"),
      scope("HO", eventSubProcess("compensation", true), {}, { incoming: [], outgoing: [], forCompensation: true }, "O"),
      start("HOS", "compensation", [], "HO"), throwing("HOT", compensateAll, "HO"), end("HOE", "none", "HO"),
      userTask("W"), end("E", compensateAll),
    ],
    [
      flow("s0", "S", "O"), flow("o0", "OS", "A"), flow("o1", "A", "B"), flow("o2", "B", "OE"), flow("h0", "HOS", "HOT"),
      flow("h1", "HOT", "HOE"), flow("m0", "O", "W"), flow("m1", "W", "E"), ...aFlows, ...bFlows,
    ],
  );
  assert.deepEqual(waiting(driveFrom(json, [], complete("W"))), ["HIB"]);
  assert.deepEqual(waiting(driveFrom(json, [], complete("W"), complete("HIB"))), ["HIA"]);
});
