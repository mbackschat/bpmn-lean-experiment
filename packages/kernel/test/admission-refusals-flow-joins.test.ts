/**
 * Refusal tests of the work after a converging gateway under `BranchSchedule.orderInvariant` (#162): a unit of work runs
 * to its next wait through every Parallel and Inclusive join, so the work after a join two units reach is compared with
 * both, and with every other unit one closure holds beside them. A join that leaves a sibling branch running, a join
 * inside a branch, a join inside a Signal throw's continuation, a join a branch never reaches or reaches only through a
 * boundary flow, and a join a third branch feeds in place of a branch that left all let that work interleave with the
 * sibling's in an order no input states. The restriction is conservative: work after a join every branch of its split
 * reaches is compared with itself and refused when it writes, though no order changes it: a forward-compatible restriction
 * a later profile may widen.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  activity, base, boundary, catchEvent, duration, end, eventSubProcess, flow, gateway, model, refusalOf, refusalTests, scope, signal,
  signalThrow, simpleBoolean, start, throwing, userWork, withOptions, writer,
} from "./admission-refusal-support.ts";
import type { Json, Row } from "./admission-refusal-support.ts";

type Part = [Json[], Json[]];

const parallel = (id: string, parent: string | null = null): Json => gateway(id, "parallel", {}, parent);
const inclusive = (id: string): Json => gateway(id, { inclusive: { candidates: [], default: null } });
const exclusive = (id: string, candidates: string[], fallback: string): Json =>
  gateway(id, { exclusive: { candidates, default: fallback } });
const task = (id: string, parent: string | null = null): Json => activity(id, "manual", {}, parent);

/** `elements` and the writers in `parts`, linked by `edges` (`[source, target]`, or with a condition), each named `source_target`. */
const shape = (elements: Json[], parts: Part[], edges: Array<[string, string] | [string, string, Json]>) =>
  model([...elements, ...parts.flatMap(([written]) => written)],
    [...edges.map(([source, target, condition]) => flow(`${source}_${target}`, source, target, condition ?? null)),
      ...parts.flatMap(([, inner]) => inner)]);

/**
 * A root fork `F` into `A`, `B` and `C`: `A` and `B` meet at the join `J`, followed by a writer of `outcome` and the User
 * Task `U`; `C` runs a writer of `name` and then `tail`.
 */
const partial = (join: Json, name: string, tail: Array<[string, string]>) =>
  shape([start("S"), parallel("F"), task("A"), task("B"), join, task("C"), activity("U", userWork()), end("E")],
    [writer("W", "outcome", "joined"), writer("CW", name, "sibling")],
    [["S", "F"], ["F", "A"], ["F", "B"], ["F", "C"], ["A", "J"], ["B", "J"], ["J", "W"], ["W", "U"], ["U", "E"], ["C", "CW"], ...tail]);

/** `partial` whose sibling branch rejoins after its writer at the final join `K` before `U`. */
const partialRejoined = (join: Json) =>
  shape([start("S"), parallel("F"), task("A"), task("B"), join, task("C"), parallel("K"), activity("U", userWork()), end("E")],
    [writer("W", "outcome", "joined"), writer("CW", "outcome", "sibling")],
    [["S", "F"], ["F", "A"], ["F", "B"], ["F", "C"], ["A", "J"], ["B", "J"], ["J", "W"], ["W", "K"], ["C", "CW"], ["CW", "K"],
      ["K", "U"], ["U", "E"]]);

/** A fork whose first branch holds a fork `G` and its join `H`, followed by a writer, beside a branch writing too. */
const nested = shape([start("S"), parallel("F"), task("A"), parallel("G"), task("C"), task("D"), parallel("H"), task("B"),
  parallel("K"), activity("U", userWork()), end("E")],
[writer("W", "outcome", "inner"), writer("BW", "outcome", "outer")],
[["S", "F"], ["F", "A"], ["F", "B"], ["A", "G"], ["G", "C"], ["G", "D"], ["C", "H"], ["D", "H"], ["H", "W"], ["W", "K"],
  ["B", "BW"], ["BW", "K"], ["K", "U"], ["U", "E"]]);

/** The non-interrupting Signal Event Sub-Process `H`, whose start runs a writer of `outcome`. */
const hearing: Part = (() => {
  const [written, inner] = writer("HW", "outcome", "heard", "H");
  return [[scope("H", eventSubProcess(signal(), false)), start("HS", signal(), [], "H"), ...written, end("HE", "none", "H")],
    [flow("h1", "HS", "HW"), flow("h2", "HW", "HE"), ...inner]];
})();

/** A Signal throw whose continuation runs a fork, its join and a writer, beside the Event Sub-Process it starts. */
const signalJoin = shape([start("S"), throwing("X", signalThrow), parallel("F"), task("P"), task("Q"), parallel("J"),
  activity("U", userWork()), end("E")],
[writer("W", "outcome", "thrower"), hearing],
[["S", "X"], ["X", "F"], ["F", "P"], ["F", "Q"], ["P", "J"], ["Q", "J"], ["J", "W"], ["W", "U"], ["U", "E"]]);

/** A Sub-Process without a start Event begins `A`, `B` and `C`; `A` and `B` meet at `J` before a writer, `C` writes too. */
const implicitJoin = shape([start("S"), scope("R", "embedded"), task("A", "R"), task("B", "R"), parallel("J", "R"),
  task("C", "R"), end("E")],
[writer("W", "outcome", "joined", "R"), writer("CW", "outcome", "sibling", "R")],
[["S", "R"], ["R", "E"], ["A", "J"], ["B", "J"], ["J", "W"], ["C", "CW"]]);

/**
 * A fork into `A`, the choice `X` and `H`: `X` may go to the merge `M` or leave through a writer; `H` feeds `M` too, so
 * the join `J` may fire with `H`'s token while the writer that left runs (Table 13.1 keeps an excess token waiting).
 */
const substitute = shape([start("S"), parallel("F"), task("A"), exclusive("X", ["X_M"], "X_V"), task("V"), task("H"),
  exclusive("M", [], "M_J"), parallel("J"), activity("U", userWork()), end("E"), end("VE")],
[writer("W", "outcome", "joined"), writer("VW", "outcome", "left")],
[["S", "F"], ["F", "A"], ["F", "X"], ["F", "H"], ["A", "J"], ["X", "M", simpleBoolean(false)], ["X", "V"], ["V", "VW"],
  ["VW", "VE"], ["H", "M"], ["M", "J"], ["J", "W"], ["W", "U"], ["U", "E"]]);

/** `partial` whose sibling branch never reaches the join: after its writer it waits at `CU` and returns to `C`. */
const deadLoop = shape([start("S"), parallel("F"), task("A"), task("B"), parallel("J"), task("C"), activity("CU", userWork()),
  activity("U", userWork()), end("E")],
[writer("W", "outcome", "joined"), writer("CW", "outcome", "sibling")],
[["S", "F"], ["F", "A"], ["F", "B"], ["F", "C"], ["A", "J"], ["B", "J"], ["J", "W"], ["W", "U"], ["U", "E"], ["C", "CW"],
  ["CW", "CU"], ["CU", "C"]]);

/** `deadLoop` whose sibling reaches the Inclusive join only through the Timer boundary `T` on its User Task. */
const boundaryReach = shape([start("S"), parallel("F"), task("A"), task("B"), inclusive("J"), task("C"),
  activity("CU", userWork(), { boundaries: [boundary("T", duration("PT1H"))] }), activity("U", userWork()), end("E")],
[writer("W", "outcome", "joined"), writer("CW", "outcome", "sibling")],
[["S", "F"], ["F", "A"], ["F", "B"], ["F", "C"], ["A", "J"], ["B", "J"], ["J", "W"], ["W", "U"], ["U", "E"], ["C", "CW"],
  ["CW", "CU"], ["CU", "C"], ["T", "J"]]);

/**
 * The fork `O` is entered again while its first block is live: the User Task `W` beside it leads back to `O` through
 * the merge `M0`. Its branches meet at `J` after a writer on one and a choice `G` that may wait at `GU` on the other.
 */
const reentered = shape([start("S"), parallel("F"), activity("W", userWork()), exclusive("M0", [], "M0_O"), parallel("O"),
  task("N"), exclusive("G", ["G_GU"], "G_M"), activity("GU", userWork()), exclusive("M", [], "M_J"), parallel("J"),
  activity("U", userWork()), end("E")],
[writer("NW", "outcome", "branch"), writer("JW", "outcome", "joined")],
[["S", "F"], ["F", "M0"], ["F", "W"], ["W", "M0"], ["M0", "O"], ["O", "N"], ["N", "NW"], ["NW", "J"], ["O", "G"],
  ["G", "GU", simpleBoolean()], ["G", "M"], ["GU", "M"], ["M", "J"], ["J", "JW"], ["JW", "U"], ["U", "E"]]);

/** A fork into a branch through the join `J` and a writer, beside a branch that waits at `B` before `J`. */
const singleThrough = shape([start("S"), parallel("F"), task("A"), activity("B", userWork()), parallel("J"),
  activity("U", userWork()), end("E")],
[writer("W", "outcome", "joined")],
[["S", "F"], ["F", "A"], ["F", "B"], ["A", "J"], ["B", "J"], ["J", "W"], ["W", "U"], ["U", "E"]]);

/** `singleThrough` whose running branch writes after the exclusive choice `X` and its merge `M` before the join. */
const diamond = shape([start("S"), parallel("F"), exclusive("X", ["X_P"], "X_Q"), task("P"), task("Q"),
  exclusive("M", [], "M_W"), activity("B", userWork()), parallel("J"), activity("U", userWork()), end("E")],
[writer("W", "outcome", "branch")],
[["S", "F"], ["F", "X"], ["F", "B"], ["X", "P", simpleBoolean()], ["X", "Q"], ["P", "M"], ["Q", "M"], ["M", "W"], ["W", "J"],
  ["B", "J"], ["J", "U"], ["U", "E"]]);

/** `singleThrough` whose running branch loops through a writer and the choice `X` before the join. */
const loopInBranch = shape([start("S"), parallel("F"), exclusive("M", [], "M_W"), exclusive("X", ["X_M"], "X_J"),
  activity("B", userWork()), parallel("J"), activity("U", userWork()), end("E")],
[writer("W", "outcome", "branch")],
[["S", "F"], ["F", "M"], ["F", "B"], ["M", "W"], ["W", "X"], ["X", "M", simpleBoolean()], ["X", "J"], ["B", "J"], ["J", "U"],
  ["U", "E"]]);

/** A fork whose two branches meet at the join `J` before a writer: the work after `J` is held against itself. */
const fullJoin = shape([start("S"), parallel("F"), task("A"), task("B"), parallel("J"), activity("U", userWork()), end("E")],
  [writer("W", "outcome", "joined")],
  [["S", "F"], ["F", "A"], ["F", "B"], ["A", "J"], ["B", "J"], ["J", "W"], ["W", "U"], ["U", "E"]]);

/** A fork whose first branch passes the exclusive choice `X` and its merge `M`, meeting the second at `J` before a writer. */
const choiceThenJoin = shape([start("S"), parallel("F"), exclusive("X", ["X_P"], "X_Q"), task("P"), task("Q"),
  exclusive("M", [], "M_J"), task("B"), parallel("J"), activity("U", userWork()), end("E")],
[writer("W", "outcome", "joined")],
[["S", "F"], ["F", "X"], ["F", "B"], ["X", "P", simpleBoolean()], ["X", "Q"], ["P", "M"], ["Q", "M"], ["M", "J"], ["B", "J"],
  ["J", "W"], ["W", "U"], ["U", "E"]]);

/** An Inclusive split whose conditioned and default branches meet at an Inclusive join before a writer. */
const inclusiveBlock = shape([start("S"), gateway("F", { inclusive: { candidates: ["F_A"], default: "F_B" } }), task("A"), task("B"),
  inclusive("J"), activity("U", userWork()), end("E")],
[writer("W", "outcome", "joined")],
[["S", "F"], ["F", "A", simpleBoolean()], ["F", "B"], ["A", "J"], ["B", "J"], ["J", "W"], ["W", "U"], ["U", "E"]]);

/**
 * A fork into two Signal catches meeting at `J` before a writer, beside `TU` and a throw: one broadcast resumes both
 * catches, whose continuations both pass `J`, so the writer is held against itself.
 */
const signalWakesJoin = shape([start("S"), parallel("F0"), parallel("F"), catchEvent("C1", signal()), catchEvent("C2", signal()),
  parallel("J"), activity("U", userWork()), end("E"), activity("TU", userWork()), throwing("X", signalThrow), end("XE")],
[writer("W", "outcome", "joined")],
[["S", "F0"], ["F0", "F"], ["F0", "TU"], ["F", "C1"], ["F", "C2"], ["C1", "J"], ["C2", "J"], ["J", "W"], ["W", "U"], ["U", "E"],
  ["TU", "X"], ["X", "XE"]]);

const rows: Row[] = [
  {
    code: "flow.concurrentWrite",
    description: "a writer after a Parallel join two of three branches reach, beside the third branch writing the same name",
    mutate: partial(parallel("J"), "outcome", [["CW", "E"]]),
  },
  {
    code: "flow.concurrentWrite",
    description: "the same with an Inclusive join, the sibling rejoining after it",
    mutate: partialRejoined(inclusive("J")),
  },
  { code: "flow.concurrentWrite", description: "a writer after a join inside one branch, beside the other branch's writer", mutate: nested },
  {
    code: "flow.concurrentWrite",
    description: "a writer after a fork and its join in a Signal throw's continuation, beside the Event Sub-Process it starts",
    mutate: signalJoin,
  },
  {
    code: "flow.concurrentWrite",
    description: "a writer after a join two implicitly begun children reach, beside a third child's writer",
    mutate: implicitJoin,
  },
  {
    code: "flow.concurrentWrite",
    description: "a writer after a join a third branch feeds through a merge, beside the writer of a branch that left",
    mutate: substitute,
  },
  { code: "flow.concurrentWrite", description: "a writer after a join a looping sibling branch never reaches", mutate: deadLoop },
  {
    code: "flow.concurrentWrite",
    description: "a writer after an Inclusive join a sibling reaches only through a boundary flow",
    mutate: boundaryReach,
  },
  { code: "flow.concurrentWrite", description: "a writer after a join whose fork is entered again while it is live", mutate: reentered },
  { code: "flow.concurrentWrite", description: "a writer after a join every branch of its fork reaches (the restriction)", mutate: fullJoin },
  {
    code: "flow.concurrentWrite",
    description: "a writer after a join one branch reaches through an exclusive choice and its merge (the restriction)",
    mutate: choiceThenJoin,
  },
  {
    code: "flow.concurrentWrite",
    description: "a writer after the Inclusive join of an Inclusive split's branches (the restriction)",
    mutate: inclusiveBlock,
  },
  {
    code: "flow.concurrentWrite",
    description: "a writer after a join two Signal catches one broadcast resumes both reach (the restriction)",
    mutate: signalWakesJoin,
  },
];

refusalTests("flow joins", rows);

test("flow joins: a branch through a join beside a branch that waits before it is admitted", () => {
  assert.equal(refusalOf(singleThrough(base())), null);
});

test("flow joins: an exclusive choice and its merge inside the one running branch are admitted", () => {
  assert.equal(refusalOf(diamond(base())), null);
});

test("flow joins: a loop inside the one running branch before a join is admitted", () => {
  assert.equal(refusalOf(loopInBranch(base())), null);
});

test("flow joins: a partial join whose sibling writes another name is still refused, its writer held against itself", () => {
  assert.equal(refusalOf(partial(parallel("J"), "other", [["CW", "E"]])(base())), "flow.concurrentWrite");
});

test("flow joins: CIB's declaration-order schedule admits every row (CIB-OP-0016)", () => {
  const cib = (mutate: (program: Json) => Json) => (program: Json): Json => withOptions(mutate(program), { branchSchedule: "declarationDepthFirst" });
  for (const row of rows) assert.equal(refusalOf(cib(row.mutate)(base())), null, row.description);
});
