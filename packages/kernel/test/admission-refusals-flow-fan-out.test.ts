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
  activity, append, base, boundary, callWork, catchEvent, compensationTrigger, definitionRef, end, errorTrigger,
  escalationTrigger, eventSubProcess, flow, gateway, literalValue, loop, mapping, refusalOf, refusalTests, replace, scope,
  signal, simpleBoolean, start, terminateThrow, text, userWork, withOptions,
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
 * The User Task subject `id` with the compensation handler `H<id>`, a Sub-Process writing `value` into `name`, and the
 * Compensation boundary `C<id>` the reader keeps beside it, which does not interrupt and has no outgoing flow.
 */
const boundaryHandled = (id: string, name: string, value: string): [Json[], Json[]] => {
  const [undo, undoInner] = writer(`H${id}`, name, value, null, { forCompensation: true, incoming: [], outgoing: [] });
  return [[activity(id, userWork(), { compensationHandlers: [`H${id}`],
    boundaries: [boundary(`C${id}`, compensationTrigger, { interrupting: false })] }), ...undo], undoInner];
};

/**
 * Two subjects `A` and `B`, User Tasks of a root fork joined before the Compensation throw `X`, whose handler
 * Sub-Processes write `outcome` and `name`; with `sequential` `A` precedes `B` by Sequence Flow instead (review
 * change 3).
 */
const handlersTogether = (name: string, sequential = false) => {
  const routed = sequential
    ? [flow("f1", "S", "A"), flow("ab", "A", "B"), flow("bx", "B", "X")]
    : [flow("f1", "S", "F"), flow("fa", "F", "A"), flow("fb", "F", "B"), flow("aj", "A", "J"), flow("bj", "B", "J"), flow("jx", "J", "X")];
  return model(...joinAll(boundaryHandled("A", "outcome", "a"), boundaryHandled("B", name, "b"),
    [[start("S"), ...(sequential ? [] : [gateway("F", "parallel"), gateway("J", "parallel")]), throwing("X", compensateAll),
      activity("I", userWork()), end("E")], [...routed, flow("x", "X", "I"), flow("i", "I", "E")]]));
};

/**
 * The automatic Sub-Process subject `id` in `parent`, whose Compensation Event Sub-Process `id`K runs a writer of `value`
 * into `name`: its handler sits inside it, so it adds no Compensation Activity to the subject's level.
 */
const selfHandled = (id: string, name: string, value: string, parent: string | null = null): [Json[], Json[]] => {
  const [written, inner] = writer(`${id}W`, name, value, `${id}K`);
  return [[scope(id, "embedded", {}, {}, parent), start(`${id}S`, null, [], id), end(`${id}E`, "none", id),
    scope(`${id}K`, eventSubProcess(compensationTrigger, false), {}, {}, id), start(`${id}KS`, compensationTrigger, [], `${id}K`),
    ...written, end(`${id}KE`, "none", `${id}K`)],
  [flow(`${id}s`, `${id}S`, `${id}E`), flow(`${id}k`, `${id}KS`, `${id}W`), flow(`${id}w`, `${id}W`, `${id}KE`), ...inner]];
};

/** The tail `X → I → E`: the Compensation throw `X`, a User Task, an End. */
const undoAll = (): [Json[], Json[]] =>
  [[throwing("X", compensateAll), activity("I", userWork()), end("E")], [flow("x", "X", "I"), flow("i", "I", "E")]];

/**
 * The review's witness (change 1): a root fork into the subjects `A` and `B`; `A` goes on to the Exclusive Gateway `G`,
 * whose conditioned flow leads to `B` and whose default to the join `J`, which `B` reaches too, before `X`. A path leads
 * from `A` to `B`, yet `B` may complete first and `A` after it, and their handlers then begin together.
 */
const handlersAcrossChoice = (name: string) => model(...joinAll(boundaryHandled("A", "outcome", "a"), boundaryHandled("B", name, "b"),
  [[start("S"), gateway("F", "parallel"), gateway("G", { exclusive: { candidates: ["gb"], default: "gj" } }), gateway("J", "parallel")],
    [flow("f1", "S", "F"), flow("fa", "F", "A"), flow("fb", "F", "B"), flow("ag", "A", "G"), flow("gb", "G", "B", simpleBoolean()),
      flow("gj", "G", "J"), flow("bj", "B", "J"), flow("jx", "J", "X")]], undoAll()));

/**
 * `A` precedes `B` by Sequence Flow and every path to `B` passes `A`, but a root fork sends a second token to `A` through
 * the User Task `U`, which may complete `A` again after `B` completed, before `B`'s User Task `W` leads to `X`.
 */
const handlersReentered = (name: string) => model(...joinAll(boundaryHandled("A", "outcome", "a"), boundaryHandled("B", name, "b"),
  [[start("S"), gateway("F", "parallel"), activity("U", userWork()), activity("W", userWork())],
    [flow("f1", "S", "F"), flow("fa", "F", "A"), flow("fu", "F", "U"), flow("ua", "U", "A"), flow("ab", "A", "B"),
      flow("bw", "B", "W"), flow("wx", "W", "X")]], undoAll()));

/**
 * `S → A → B → C → X`, one token, where the Sub-Processes `A` and `B` carry their handlers inside: the interrupting Signal
 * boundary `CB` of the User Task `C` leads back to `A` when `returns`, else to its own End, so `A` may complete again after
 * `B` along a path no `flowReaches` follows, which leaves the pair to their completion order.
 */
const handlersReturning = (returns: boolean) => {
  const [caught, back] = returns ? [[], [flow("cb", "CB", "A")]] : [[end("CBE")], [flow("cb", "CB", "CBE")]];
  return model(...joinAll(selfHandled("A", "outcome", "a"), selfHandled("B", "outcome", "b"),
    [[start("S"), activity("C", userWork(), { boundaries: [boundary("CB", signal())] }), ...caught],
      [flow("f1", "S", "A"), flow("ab", "A", "B"), flow("bc", "B", "C"), flow("cx", "C", "X"), ...back]], undoAll()));
};

/**
 * The subjects `A → B` inside the Sub-Process `R`, which has no handler, so their records pass to its parent `P` when it
 * completes; the interrupting Signal boundary `CB` of the User Task `C` after `R` enters `R` again when `reenters`. `P`'s
 * handler `HP` throws compensation over every record `P` gathered once `X` compensates `P`.
 */
const handlersInReenteredScope = (reenters: boolean) => {
  const [caught, back] = reenters ? [[], [flow("cb", "CB", "R")]] : [[end("CBE", "none", "P")], [flow("cb", "CB", "CBE")]];
  return model(...joinAll(selfHandled("A", "outcome", "a", "R"), selfHandled("B", "outcome", "b", "R"),
    [[start("S"), scope("P", "embedded", {}, { compensationHandlers: ["HP"] }), start("PS", null, [], "P"), scope("R", "embedded", {}, {}, "P"),
      start("RS", null, [], "R"), end("RE", "none", "R"), activity("C", userWork(), { boundaries: [boundary("CB", signal())] }, "P"),
      ...caught, end("PE", "none", "P"), scope("HP", "embedded", {}, { forCompensation: true, incoming: [], outgoing: [] }),
      start("HPS", null, [], "HP"), throwing("HX", compensateAll, "HP"), end("HPE", "none", "HP")],
    [flow("f1", "S", "P"), flow("ps", "PS", "R"), flow("rs", "RS", "A"), flow("ab", "A", "B"), flow("br", "B", "RE"),
      flow("rc", "R", "C"), flow("cp", "C", "PE"), flow("px", "P", "X"), flow("hs", "HPS", "HX"), flow("hx", "HX", "HPE"), ...back]],
    undoAll()));
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

/**
 * `S → R → E`: the Sub-Process `R` has no start Event, so its entry begins its children, the writers `A` of `outcome` and
 * `B` of `name`, together (P1 census, G1).
 */
const implicitPair = (name: string) => {
  const [first, firstInner] = writer("A", "outcome", "a", "R");
  const [second, secondInner] = writer("B", name, "b", "R");
  return model([start("S"), scope("R", "embedded"), ...first, ...second, end("E")],
    [flow("f1", "S", "R"), flow("r", "R", "E"), ...firstInner, ...secondInner]);
};

/**
 * `S → R → E`: entering the Sub-Process `R` arms its Conditional boundary `N` on `flag`, whose path writes `outcome`,
 * while its start leads to a writer of `outcome` when `writes`, else to the User Task `RU`; with `interrupting` `N`
 * removes `R` before any token of the entry moves (P1 census, G2).
 */
const entryCondition = (writes: boolean, interrupting = false) => {
  const [inside, insideInner] = writes ? writer("W", "outcome", "inside", "R") : [[activity("W", userWork(), {}, "R")], []];
  const [caught, caughtInner] = writer("NW", "outcome", "noticed");
  return model([start("S"), scope("R", "embedded", {}, { boundaries: [boundary("N", whenPresent("flag"), { interrupting })] }),
    start("RS", null, [], "R"), ...inside, end("RE", "none", "R"), ...caught, end("NE"), end("E")],
  [flow("f1", "S", "R"), flow("rs", "RS", "W"), flow("w", "W", "RE"), flow("r", "R", "E"), flow("n", "N", "NW"),
    flow("nw", "NW", "NE"), ...insideInner, ...caughtInner]);
};

/**
 * The User Task `H` carries the non-interrupting Conditional boundaries `N` on `a` and `M` on `b`, which one arming may
 * find true together though no single write makes both true; `N`'s path writes `outcome`, `M`'s too when `writes`, else
 * waits at the User Task `MW` (P1 census, G2).
 */
const armingPair = (writes: boolean) => {
  const [first, firstInner] = writer("NW", "outcome", "first");
  const [second, secondInner] = writes ? writer("MW", "outcome", "second") : [[activity("MW", userWork())], []];
  return model([start("S"), activity("H", userWork(), { boundaries: [
    boundary("N", whenPresent("a"), { interrupting: false }), boundary("M", whenPresent("b"), { interrupting: false }),
  ] }), end("HE"), ...first, end("NE"), ...second, end("ME")],
  [flow("f1", "S", "H"), flow("h", "H", "HE"), flow("n", "N", "NW"), flow("nw", "NW", "NE"), flow("m", "M", "MW"),
    flow("mw", "MW", "ME"), ...firstInner, ...secondInner]);
};

/**
 * The root's non-interrupting Conditional Event Sub-Process `K` on `a`, armed as the instance starts, runs a writer of
 * `outcome` beside the start's path, which writes `outcome` when `writes`, else waits at the User Task `W` (P1 census,
 * G2).
 */
const rootArming = (writes: boolean) => {
  const [main, mainInner] = writes ? writer("W", "outcome", "main") : [[activity("W", userWork())], []];
  const [noticed, noticedInner] = writer("KW", "outcome", "noticed", "K");
  return model([start("S"), ...main, end("E"), scope("K", eventSubProcess(whenPresent("a"), false)),
    start("KS", whenPresent("a"), [], "K"), ...noticed, end("KE", "none", "K")],
  [flow("f1", "S", "W"), flow("w", "W", "E"), flow("k1", "KS", "KW"), flow("k2", "KW", "KE"), ...mainInner, ...noticedInner]);
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
    code: "flow.concurrentWrite",
    description: "handlers whose subjects a conditioned path joins while a fork may complete them in either order",
    mutate: handlersAcrossChoice("outcome"),
    control: handlersAcrossChoice("other"),
  },
  {
    code: "flow.concurrentWrite",
    description: "handlers whose first subject a second token may complete again after the other",
    mutate: handlersReentered("outcome"),
    control: handlersReentered("other"),
  },
  {
    code: "flow.concurrentWrite",
    description: "handlers whose first subject a boundary path through an Activity reaches again after the other",
    mutate: handlersReturning(true),
    control: handlersReturning(false),
  },
  {
    code: "flow.concurrentWrite",
    description: "handlers whose subjects lie in a Scope entered again, whose records its parent gathers",
    mutate: handlersInReenteredScope(true),
    control: handlersInReenteredScope(false),
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
  {
    code: "flow.concurrentWrite",
    description: "two children a Scope without a start Event begins together, writing the same name",
    mutate: implicitPair("outcome"),
    control: implicitPair("other"),
  },
  {
    code: "flow.concurrentWrite",
    description: "a Conditional boundary an entry's arming finds true beside the entry's begun work writing the same name",
    mutate: entryCondition(true),
    control: entryCondition(false),
  },
  {
    code: "flow.concurrentWrite",
    description: "two Conditional boundaries one arming finds true in distinct contests, writing the same name",
    mutate: armingPair(true),
    control: armingPair(false),
  },
  {
    code: "flow.concurrentWrite",
    description: "a root Conditional Event Sub-Process armed at the start beside the start's path writing the same name",
    mutate: rootArming(true),
    control: rootArming(false),
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
  // Paths join the subjects both ways, so `precedes` orders every pair of their records by completion, beside a fork too.
  const looping = model(...joinAll(boundaryHandled("A", "outcome", "a"), boundaryHandled("B", "outcome", "b"),
    [[start("S"), gateway("F", "parallel"), activity("U", userWork()), end("UE"),
      gateway("G", { exclusive: { candidates: ["ga"], default: "gx" } })],
    [flow("f1", "S", "F"), flow("fa", "F", "A"), flow("fu", "F", "U"), flow("u", "U", "UE"), flow("ab", "A", "B"),
      flow("bg", "B", "G"), flow("ga", "G", "A", simpleBoolean()), flow("gx", "G", "X")]], undoAll()));
  assert.equal(refusalOf(looping(base())), null);
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

test("flow fan-out: an arming's interrupting firing that removes the entry's begun work first is not held against it", () => {
  // The firing is a queued signal, which removes the Sub-Process before any token its start emits moves.
  assert.equal(refusalOf(entryCondition(true, true)(base())), null);
});
