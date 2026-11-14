/**
 * Refusal tests of the fan-outs of one element's run under `BranchSchedule.orderInvariant` (issue #81): the units one
 * run queues together, which the closure runs in an order no input states, may not conflict (`flow.concurrentWrite`,
 * `flow.concurrentInterference`). A Signal throw's continuation and the resumptions it fires, an Escalation thrower's
 * continuation and a catcher that does not interrupt it, a write's continuation and the Conditional items it makes true,
 * and the compensation handlers one trigger begins together; a continuation that ends its Scope goes on with the
 * Scope's completion. An Error no catcher takes ends the instance, so it removes every sibling branch's and instance's
 * work, and a Call raises the codes its called process lets escape. The scenario witnesses are
 * `scenarios/open-rows/branch-fan-out-order`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  activity, append, base, boundary, callWork, catchEvent, definitionRef, end, errorTrigger, escalationTrigger,
  eventSubProcess, flow, gateway, literalValue, loop, mapping, refusalOf, refusalTests, replace, scope, signal, start,
  terminateThrow, text, userWork, withOptions,
} from "./admission-refusal-support.ts";
import type { Json, Row } from "./admission-refusal-support.ts";

const signalThrow: Json = { signal: { payload: { ...(signal() as { signal: { payload: Json } }).signal.payload,
  payload: [], propagateAll: null, localOnly: false, businessKey: null, asynchronous: false } } };
const raiseEscalation: Json = { escalation: { payload: { code: "X" } } };
const raiseError: Json = { error: { payload: { code: "E", message: null } } };
const compensateAll: Json = { compensation: { payload: { activity: null, waitForCompletion: true } } };
/** A Conditional trigger whose condition holds once `name` is present. */
const whenPresent = (name: string): Json =>
  ({ condition: { payload: { condition: { simpleBoolean: { body: { isPresent: { name } } } }, variableName: null, variableEvents: [] } } });

/** An intermediate throw Event `id` in `parent` throwing `record`. */
const throwing = (id: string, record: Json | string, parent: string | null = null): Json => ({
  event: {
    header: { id, origin: { definition: null, sourceId: id }, sourceType: "intermediateThrowEvent", parent },
    payload: { role: { throw: { record } }, placement: "intermediate", incoming: [], outgoing: [], alternativeThrows: [] },
  },
});

/** The automatic Sub-Process `id`, `idS → idE`, whose output writes `value` into `name` when it completes. */
const writer = (id: string, name: string, value: string, parent: string | null = null, env: Json = {}): [Json[], Json[]] => [[
  scope(id, "embedded", {}, { outputs: [mapping(name, literalValue({ kind: "string", value }))], ...env }, parent),
  start(`${id}S`, null, [], id), end(`${id}E`, "none", id),
], [flow(`${id}s`, `${id}S`, `${id}E`)]];

/** `program` with the base elements replaced by `elements` and its flows by `flows`. */
const model = (elements: Json[], flows: Json[]) => (program: Json): Json => ({ ...program, elements, flows });

/** `S → U → X → W → E`: a User Task, the throw `record`, a writer of `outcome`, an End. */
const thrower = (record: Json | string, name = "outcome"): [Json[], Json[]] => {
  const [written, inner] = writer("W", name, "thrower");
  return [[start("S"), activity("U", userWork()), throwing("X", record), ...written, end("E")],
    [flow("f1", "S", "U"), flow("u", "U", "X"), flow("x", "X", "W"), flow("w", "W", "E"), ...inner]];
};

/** The non-interrupting Signal Event Sub-Process `id`, whose start runs a writer of `value` into `name`. */
const hearing = (id: string, name: string, value: string): [Json[], Json[]] => {
  const [written, inner] = writer(`${id}W`, name, value, id);
  return [[scope(id, eventSubProcess(signal(), false)), start(`${id}S`, signal(), [], id), ...written, end(`${id}E`, "none", id)],
    [flow(`${id}1`, `${id}S`, `${id}W`), flow(`${id}2`, `${id}W`, `${id}E`), ...inner]];
};

const joinAll = (...parts: Array<[Json[], Json[]]>): [Json[], Json[]] =>
  [parts.flatMap(([elements]) => elements), parts.flatMap(([, flows]) => flows)];

/** A thrower's continuation and one resumption, both writing `outcome` unless the resumption writes `name`. */
const throwBesideWake = (name: string) => model(...joinAll(thrower(signalThrow), hearing("H", name, "catcher")));

/** Two resumptions one throw fires, writing `outcome` and `name`, beside a continuation writing `progress`. */
const wakePair = (name: string) =>
  model(...joinAll(thrower(signalThrow, "progress"), hearing("H", "outcome", "one"), hearing("K", name, "two")));

/**
 * A root Parallel fork: one branch waits at a Signal catch `C` and then ends at `ending`; the other runs `U`, the throw
 * `X` and a writer of `outcome`. A Terminate End there removes the thrower's continuation only after `C`'s token moves,
 * while that continuation's token is queued beside it (review change 1).
 */
const resumedThenEnding = (ending: Json | string) => {
  const [written, inner] = writer("W", "outcome", "thrower");
  return model([start("S"), gateway("F", "parallel"), catchEvent("C", signal()), end("CE", ending), activity("U", userWork()),
    throwing("X", signalThrow), ...written, end("E")],
  [flow("f1", "S", "F"), flow("fc", "F", "C"), flow("c", "C", "CE"), flow("fu", "F", "U"), flow("u", "U", "X"),
    flow("x", "X", "W"), flow("w", "W", "E"), ...inner]);
};

/**
 * `S → U → R → A → E`: the Sub-Process `R` ends at `ending`, its non-interrupting boundary `N` catches by `trigger` and
 * runs a writer of `outcome`, and `A` writes `name` after `R` completes: the thrower's token ends `R`, whose completion
 * goes on beside the catcher's path (review change 4).
 */
const endingScope = (ending: Json | string, trigger: Json | string, name: string, extra: Array<[Json[], Json[]]> = []) => {
  const [after, afterInner] = writer("A", name, "region");
  const [caught, caughtInner] = writer("NW", "outcome", "catcher");
  return model(...joinAll([[start("S"), activity("U", userWork()),
    scope("R", "embedded", {}, { boundaries: [boundary("N", trigger, { interrupting: false })] }), start("RS", null, [], "R"),
    end("RE", ending, "R"), ...after, ...caught, end("E"), end("NE")],
  [flow("f1", "S", "U"), flow("u", "U", "R"), flow("rs", "RS", "RE"), flow("r", "R", "A"), flow("a", "A", "E"),
    flow("n", "N", "NW"), flow("nw", "NW", "NE"), ...afterInner, ...caughtInner]], ...extra));
};

/** `endingScope`'s Sub-Process ends at a Signal End whose catcher is a process-level Event Sub-Process instead. */
const signalEndingScope = (name: string) => {
  const [after, afterInner] = writer("A", name, "region");
  return model(...joinAll([[start("S"), activity("U", userWork()), scope("R", "embedded"), start("RS", null, [], "R"),
    end("RE", signalThrow, "R"), ...after, end("E")],
  [flow("f1", "S", "U"), flow("u", "U", "R"), flow("rs", "RS", "RE"), flow("r", "R", "A"), flow("a", "A", "E"), ...afterInner]],
  hearing("H", "outcome", "catcher")));
};

/**
 * A root Parallel fork: the User Task `H` carries the non-interrupting Conditional boundary `N` on `flag`, whose path
 * writes `outcome`; the other branch runs `U`, a writer of `flag` and then, when `continued`, a writer of `outcome`, else
 * the User Task `W` (review change 2).
 */
const writeBesideCondition = (continued: boolean) => {
  const [flagged, flagInner] = writer("G", "flag", "set");
  const [next, nextInner] = continued ? writer("W", "outcome", "writer") : [[activity("W", userWork())], []];
  const [caught, caughtInner] = writer("NW", "outcome", "catcher");
  return model([start("S"), gateway("F", "parallel"),
    activity("H", userWork(), { boundaries: [boundary("N", whenPresent("flag"), { interrupting: false })] }), end("HE"),
    ...caught, end("NE"), activity("U", userWork()), ...flagged, ...next, end("E")],
  [flow("f1", "S", "F"), flow("fh", "F", "H"), flow("h", "H", "HE"), flow("n", "N", "NW"), flow("nw", "NW", "NE"),
    flow("fu", "F", "U"), flow("u", "U", "G"), flow("g", "G", "W"), flow("w", "W", "E"),
    ...flagInner, ...nextInner, ...caughtInner]);
};

/**
 * The User Task `H` carries the non-interrupting Conditional boundaries `N` and `M` on `flag`, whose paths write
 * `outcome` and, when `writes`, `outcome` too, else wait at the User Task `MW`. One variable command writing `flag` makes
 * both true at one evaluation, in two contests, so their order is evaluation order.
 */
const conditionPair = (writes: boolean) => {
  const [first, firstInner] = writer("NW", "outcome", "first");
  const [second, secondInner] = writes ? writer("MW", "outcome", "second") : [[activity("MW", userWork())], []];
  return model([start("S"), activity("H", userWork(), { boundaries: [
    boundary("N", whenPresent("flag"), { interrupting: false }), boundary("M", whenPresent("flag"), { interrupting: false }),
  ] }), end("HE"), ...first, end("NE"), ...second, end("ME")],
  [flow("f1", "S", "H"), flow("h", "H", "HE"), flow("n", "N", "NW"), flow("nw", "NW", "NE"), flow("m", "M", "MW"),
    flow("mw", "MW", "ME"), ...firstInner, ...secondInner]);
};

/**
 * Two subjects `A` and `B`, User Tasks of a root fork joined before the Compensation throw `X`, whose handler
 * Sub-Processes write `outcome` and `name`; with `sequential` `A` precedes `B` by Sequence Flow instead (review
 * change 3).
 */
const handlersTogether = (name: string, sequential = false) => {
  const [undoA, undoAInner] = writer("HA", "outcome", "a", null, { forCompensation: true, incoming: [], outgoing: [] });
  const [undoB, undoBInner] = writer("HB", name, "b", null, { forCompensation: true, incoming: [], outgoing: [] });
  const subjects = [
    activity("A", userWork(), { compensationHandlers: ["HA"] }), activity("B", userWork(), { compensationHandlers: ["HB"] }),
  ];
  const routed = sequential
    ? [flow("f1", "S", "A"), flow("ab", "A", "B"), flow("bx", "B", "X")]
    : [flow("f1", "S", "F"), flow("fa", "F", "A"), flow("fb", "F", "B"), flow("aj", "A", "J"), flow("bj", "B", "J"), flow("jx", "J", "X")];
  return model([start("S"), ...(sequential ? [] : [gateway("F", "parallel"), gateway("J", "parallel")]), ...subjects,
    throwing("X", compensateAll), activity("I", userWork()), end("E"), ...undoA, ...undoB],
  [...routed, flow("x", "X", "I"), flow("i", "I", "E"), ...undoAInner, ...undoBInner]);
};

/** A root Parallel fork into `first` and the User Task `B`, each to its own End. */
const forkBeside = (first: Json[], firstFlows: Json[], into: string) => model(
  [start("S"), gateway("F", "parallel"), ...first, activity("B", userWork()), end("BE")],
  [flow("f1", "S", "F"), flow("fa", "F", into), flow("fb", "F", "B"), flow("b", "B", "BE"), ...firstFlows]);

/**
 * The called process `Q`, `QS → QA → QE`: the Sub-Process `QA` ends at an Error End `E`, and with `caughtInside` its own
 * Error boundary catches it there.
 */
const calledRaising = (caughtInside: boolean): [Json[], Json[]] => [[
  start("QS"), scope("QA", "embedded", {}, { boundaries: caughtInside ? [boundary("QB", errorTrigger({ code: "E" }))] : [] }),
  start("QAS", null, [], "QA"), end("QAE", raiseError, "QA"), end("QE"), ...(caughtInside ? [end("QBE")] : []),
], [flow("q1", "QS", "QA"), flow("q2", "QA", "QE"), flow("qa", "QAS", "QAE"), ...(caughtInside ? [flow("qb", "QB", "QBE")] : [])]];
const carried = (program: Json): Json =>
  ({ ...program, processes: [{ definition: definitionRef("Q"), children: ["QS", "QA", "QE", "QBE"].filter((id) =>
    (program.elements as Json[]).some((element) => ((Object.values(element)[0] as Json).header as Json).id === id)), variables: [],
    executable: true }] });

/** A root Parallel fork into the Call `C` of `Q` and the User Task `B` (review change 5). */
const callBeside = (caughtInside: boolean) => (program: Json): Json => {
  const [called, calledFlows] = calledRaising(caughtInside);
  return carried(forkBeside([activity("C", callWork({ calledElement: text("Q") })), end("CE"), ...called],
    [flow("c", "C", "CE"), ...calledFlows], "C")(program));
};

const rows: Row[] = [
  {
    code: "flow.concurrentWrite",
    description: "a Signal throw's continuation beside a resumption writing the same name",
    mutate: throwBesideWake("outcome"),
    control: throwBesideWake("heard"),
  },
  {
    code: "flow.concurrentWrite",
    description: "two resumptions of one Signal throw writing the same name",
    mutate: wakePair("outcome"),
    control: wakePair("other"),
  },
  {
    code: "flow.concurrentInterference",
    description: "a resumption whose path reaches a Terminate End beside the thrower's continuation",
    mutate: resumedThenEnding(terminateThrow),
    control: resumedThenEnding("none"),
  },
  {
    code: "flow.concurrentWrite",
    description: "an intermediate Escalation's continuation beside a non-interrupting catcher writing the same name",
    mutate: (program) => {
      const [written, inner] = writer("W", "outcome", "thrower", "R");
      const [caught, caughtInner] = writer("NW", "outcome", "catcher");
      return model([start("S"), scope("R", "embedded", {}, { boundaries: [boundary("N", escalationTrigger({ code: "X" }), { interrupting: false })] }),
        start("RS", null, [], "R"), throwing("X", raiseEscalation, "R"), ...written, end("RE", "none", "R"), ...caught, end("E"), end("NE")],
      [flow("f1", "S", "R"), flow("rs", "RS", "X"), flow("x", "X", "W"), flow("w", "W", "RE"), flow("r", "R", "E"),
        flow("n", "N", "NW"), flow("nw", "NW", "NE"), ...inner, ...caughtInner])(program);
    },
  },
  {
    code: "flow.concurrentWrite",
    description: "an Escalation End whose Scope's completion writes beside a non-interrupting catcher",
    mutate: endingScope(raiseEscalation, escalationTrigger({ code: "X" }), "outcome"),
    control: endingScope(raiseEscalation, escalationTrigger({ code: "X" }), "region"),
  },
  {
    code: "flow.concurrentWrite",
    description: "a Signal End whose Scope's completion writes beside a resumption outside the Scope",
    mutate: signalEndingScope("outcome"),
    control: signalEndingScope("region"),
  },
  {
    code: "flow.concurrentWrite",
    description: "a write's continuation beside the Conditional boundary path the write makes true",
    mutate: writeBesideCondition(true),
    control: writeBesideCondition(false),
  },
  {
    code: "flow.concurrentWrite",
    description: "two non-interrupting Conditional boundaries one write makes true, writing the same name",
    mutate: conditionPair(true),
    control: conditionPair(false),
  },
  {
    code: "flow.concurrentWrite",
    description: "two compensation handlers one throw begins together, writing the same name",
    mutate: handlersTogether("outcome"),
    control: handlersTogether("other"),
  },
  {
    code: "flow.concurrentInterference",
    description: "an Error End no catcher takes beside a sibling branch",
    mutate: forkBeside([end("A", raiseError)], [], "A"),
    control: forkBeside([end("A", "none")], [], "A"),
  },
  {
    code: "flow.concurrentInterference",
    description: "a Call whose called process lets an Error escape beside a sibling branch",
    mutate: callBeside(false),
    control: callBeside(true),
  },
];

refusalTests("flow fan-out", rows);

test("flow fan-out: a resumption that removes the thrower first is not held against its continuation", () => {
  // The interrupting boundary's firing is a queued signal, which removes the thrower before its completion emits a token.
  const shape = (interrupting: boolean) => (program: Json): Json => {
    const [written, inner] = writer("W", "outcome", "thrower", "R");
    const [caught, caughtInner] = writer("NW", "outcome", "catcher");
    return model([start("S"), scope("R", "embedded", {}, { boundaries: [boundary("N", signal(), { interrupting })] }),
      start("RS", null, [], "R"), activity("U", userWork(), {}, "R"), throwing("X", signalThrow, "R"), ...written,
      end("RE", "none", "R"), ...caught, end("E"), end("NE")],
    [flow("f1", "S", "R"), flow("rs", "RS", "U"), flow("u", "U", "X"), flow("x", "X", "W"), flow("w", "W", "RE"),
      flow("r", "R", "E"), flow("n", "N", "NW"), flow("nw", "NW", "NE"), ...inner, ...caughtInner])(program);
  };
  assert.equal(refusalOf(shape(true)(base())), null);
  assert.equal(refusalOf(shape(false)(base())), "flow.concurrentWrite");
});

test("flow fan-out: a write a Conditional boundary's interruption removes first is not held against its continuation", () => {
  const shape = (interrupting: boolean) => (program: Json): Json => {
    const [flagged, flagInner] = writer("G", "flag", "set", "R");
    const [continued, continuedInner] = writer("W", "outcome", "writer", "R");
    const [caught, caughtInner] = writer("NW", "outcome", "catcher");
    return model([start("S"),
      scope("R", "embedded", {}, { boundaries: [boundary("N", whenPresent("flag"), { interrupting })] }), start("RS", null, [], "R"),
      activity("U", userWork(), {}, "R"), ...flagged, ...continued, end("RE", "none", "R"), ...caught, end("E"), end("NE")],
    [flow("f1", "S", "R"), flow("rs", "RS", "U"), flow("u", "U", "G"), flow("g", "G", "W"), flow("w", "W", "RE"),
      flow("r", "R", "E"), flow("n", "N", "NW"), flow("nw", "NW", "NE"), ...flagInner, ...continuedInner, ...caughtInner])(program);
  };
  assert.equal(refusalOf(shape(true)(base())), null);
  assert.equal(refusalOf(shape(false)(base())), "flow.concurrentWrite");
});

test("flow fan-out: two interrupting Conditional boundaries of one host are one contest the input's ranking orders", () => {
  const [first, firstInner] = writer("NW", "outcome", "first");
  const [second, secondInner] = writer("MW", "outcome", "second");
  const contest = model([start("S"), activity("H", userWork(), { boundaries: [
    boundary("N", whenPresent("flag")), boundary("M", whenPresent("flag")),
  ] }), end("HE"), ...first, end("NE"), ...second, end("ME")],
  [flow("f1", "S", "H"), flow("h", "H", "HE"), flow("n", "N", "NW"), flow("nw", "NW", "NE"), flow("m", "M", "MW"),
    flow("mw", "MW", "ME"), ...firstInner, ...secondInner]);
  assert.equal(refusalOf(contest(base())), null);
});

test("flow fan-out: compensation handlers whose subjects a Sequence Flow orders do not begin together", () => {
  assert.equal(refusalOf(handlersTogether("outcome", true)(base())), null);
});

test("flow fan-out: a parallel Multi-Instance Call whose called process lets an Error escape is refused", () => {
  const looping = (caughtInside: boolean) => (program: Json): Json => {
    const [called, calledFlows] = calledRaising(caughtInside);
    return carried(append(replace({ ...program, flows: [...(program.flows as Json[]), ...calledFlows] }, "T",
      activity("T", callWork({ calledElement: text("Q") }), { multiInstance: loop({ outputDataItem: null }) })), ...called));
  };
  assert.equal(refusalOf(looping(false)(base())), "multiInstance.concurrentInstances");
  assert.equal(refusalOf(looping(true)(base())), null);
});

test("flow fan-out: CIB's declaration-order schedule admits every fan-out (CIB-OP-0016)", () => {
  const cib = (shape: (program: Json) => Json) => (program: Json): Json => withOptions(shape(program), { branchSchedule: "declarationDepthFirst" });
  for (const row of rows) assert.equal(refusalOf(cib(row.mutate)(base())), null, row.description);
});

test("flow fan-out: an uncaught Error ends the instance only under the profile that fails it", () => {
  const ends = (shape: (program: Json) => Json) => (program: Json): Json => withOptions(shape(program), { unhandledError: "endsThrowingPath" });
  assert.equal(refusalOf(ends(forkBeside([end("A", raiseError)], [], "A"))(base())), null);
  assert.equal(refusalOf(ends(callBeside(false))(base())), null);
});
