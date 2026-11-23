/**
 * Refusal tests of the Conditional lifetime class (CIB-OP-0016): under `BranchSchedule.orderInvariant` a write that one
 * unit makes and the opening or end of a Conditional subscription that a concurrent unit makes are ordered by nothing
 * BPMN states (Table 13.1, §13.3.1, §13.3.4, Tables 10.86, 10.89, 10.90), so a model whose result depends on that order
 * is refused with `flow.concurrentWrite`; a write that can only make the condition true before an opening, a holder
 * that outlives its descendant writer, two wakes below one shared Scope or Call, and a holder's own boundary stay
 * admitted.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  activity, boundary, callWork, catchEvent, definitionRef, end, eventBased, eventSubProcess, flow, gateway, literalValue, mapping, model,
  refusalOf, base, ruleWork, scope, signal, signalThrow, start, text, throwing, userWork, variable, withOptions, writer,
} from "./admission-refusal-support.ts";
import { any, decision, input, lit, output, resource, rule, table } from "./decision-support.ts";
import type { Json } from "./admission-refusal-support.ts";

const condition = (body: Json): Json =>
  ({ condition: { payload: { condition: { simpleBoolean: { body } }, variableName: null, variableEvents: [] } } });
const present = (name: string): Json => condition({ isPresent: { name } });
const equals = (name: string, value: string): Json => condition({ stringEquals: { name, value } });
const goes = (name = "go"): Json[] => [mapping(name, literalValue({ kind: "string", value: "2" }))];
const program = (variables: string[], processes: Json[] = []): Json => ({ ...base(), variables, processes });

/** Two Sub-Processes behind a fork, completing in the starting closure: `holder` carries a non-interrupting Conditional boundary, `writer` writes go on completion. */
const closingPair = (holder: string, written: string, holderFirst: boolean): Json => {
  const sub = (id: string) => scope(id, "embedded", {}, {
    ...(id === holder ? { boundaries: [boundary("CB", present("go"), { interrupting: false })] } : {}),
    ...(id === written ? { outputs: goes() } : {}) });
  const [first, second] = holderFirst ? [holder, written] : [written, holder];
  return model([
    start("S"), gateway("P", "parallel"),
    sub("A"), start("AS", null, [], "A"), end("AE", "none", "A"),
    sub("B"), start("BS", null, [], "B"), end("BE", "none", "B"),
    activity("X", userWork()), end("E1"), end("E2"), end("E3"),
  ], [flow("f1", "S", "P"), flow("p1", "P", first), flow("p2", "P", second), flow("a1", "AS", "AE"), flow("b1", "BS", "BE"),
    flow("ae", "A", "E1"), flow("be", "B", "E2"), flow("cb", "CB", "X"), flow("x", "X", "E3")])(program(["go"]));
};

/** A writer Sub-Process W beside an automatic Sub-Process V leading to User Task U, whose Conditional boundary opens in the same closure. */
const openingPair = (body: Json, written: string, writerFirst: boolean): Json => {
  const [wEls, wFlows] = writer("W", written, "2");
  const pw = flow("pw", "P", "W"), pv = flow("pv", "P", "V");
  return model([
    start("S"), gateway("P", "parallel"), ...wEls,
    scope("V", "embedded"), start("VS", null, [], "V"), end("VE", "none", "V"),
    activity("U", userWork(), { boundaries: [boundary("CB", condition(body), { interrupting: false })] }),
    activity("X", userWork()), end("E1"), end("E2"), end("E3"),
  ], [flow("f1", "S", "P"), ...(writerFirst ? [pw, pv] : [pv, pw]), ...wFlows, flow("vs", "VS", "VE"), flow("we", "W", "E1"),
    flow("vu", "V", "U"), flow("ue", "U", "E2"), flow("cb", "CB", "X"), flow("x", "X", "E3")])(program(["go", "go2"]));
};

/** T79's Signal-wake instance: A and B wait at Signal catches; U's throw wakes both, which then complete together. */
const wokenPair = (holder: string, written: string, subProcessStart: boolean): Json => {
  const sub = (id: string) => scope(id, "embedded", {}, {
    ...(id === holder && !subProcessStart ? { boundaries: [boundary("CB", present("go"), { interrupting: false })] } : {}),
    ...(id === written ? { outputs: goes() } : {}) });
  const starter = subProcessStart
    ? [scope("K", eventSubProcess(present("go"), false), {}, {}, holder), start("KS", present("go"), [], "K"),
      activity("X", userWork(), {}, "K"), end("KE", "none", "K")]
    : [activity("X", userWork()), end("E3")];
  return model([
    start("S"), gateway("P", "parallel"),
    sub("A"), start("AS", null, [], "A"), catchEvent("AC", signal(), [], "A"), end("AE", "none", "A"),
    sub("B"), start("BS", null, [], "B"), catchEvent("BC", signal(), [], "B"), end("BE", "none", "B"),
    ...starter, activity("U", userWork()), throwing("TH", signalThrow), end("E1"), end("E2"), end("E4"),
  ], [flow("f1", "S", "P"), flow("pa", "P", "A"), flow("pb", "P", "B"), flow("pu", "P", "U"), flow("a1", "AS", "AC"),
    flow("a2", "AC", "AE"), flow("b1", "BS", "BC"), flow("b2", "BC", "BE"), flow("ae", "A", "E1"), flow("be", "B", "E2"),
    ...(subProcessStart ? [flow("k1", "KS", "X"), flow("k2", "X", "KE")] : [flow("cb", "CB", "X"), flow("x", "X", "E3")]),
    flow("u", "U", "TH"), flow("th", "TH", "E4")])(program(["go"]));
};

/** T79's Call instance: Sub-Process A holds the boundary, the Call CA writes go by its output mapping after its called process's Signal wait. */
const calledPair = (holderFirst: boolean): Json => {
  const pa = flow("pa", "P", "A"), pc = flow("pc", "P", "CA");
  return model([
    start("S"), gateway("P", "parallel"),
    scope("A", "embedded", {}, { boundaries: [boundary("CB", present("go"), { interrupting: false })] }),
    start("AS", null, [], "A"), catchEvent("AC", signal(), [], "A"), end("AE", "none", "A"),
    activity("CA", callWork({ calledElement: text("Q"), inputs: [mapping("din", literalValue({ kind: "string", value: "yes" }), "dataAssociation")],
      outputs: [mapping("go", variable("din"), "dataAssociation")] })),
    start("QS"), catchEvent("QC", signal()), end("QE"),
    activity("U", userWork()), throwing("TH", signalThrow), activity("X", userWork()), end("E1"), end("E2"), end("E3"), end("E4"),
  ], [flow("f1", "S", "P"), ...(holderFirst ? [pa, pc] : [pc, pa]), flow("pu", "P", "U"), flow("a1", "AS", "AC"), flow("a2", "AC", "AE"),
    flow("q1", "QS", "QC"), flow("q2", "QC", "QE"), flow("ae", "A", "E1"), flow("ce", "CA", "E2"), flow("cb", "CB", "X"),
    flow("x", "X", "E3"), flow("u", "U", "TH"), flow("th", "TH", "E4")])(program(["go"],
    [{ definition: definitionRef("Q"), children: ["QS", "QC", "QE"], variables: ["din"], executable: true }]));
};

/**
 * Review finding 5, the removal side: R waits at User Task RU and carries an interrupting Signal boundary SB and a
 * non-interrupting Conditional boundary CB leading out of R; after U1, a fork runs the Business Rule Task W, whose
 * result writes go, beside a Signal throw TH whose resumption of SB removes R and ends CB.
 */
const removedHolder = (writerFirst: boolean): Json => {
  const pw = flow("pw", "P", "W"), pt = flow("pt", "P", "TH");
  const constant = decision("d", table("unique", [input("n")], [output("go")], [rule("r1", [any], [lit.str("2")])]));
  return {
    ...withOptions(model([
      start("S"), gateway("F", "parallel"),
      scope("R", "embedded", {}, { boundaries: [boundary("SB", signal()), boundary("CB", present("go"), { interrupting: false })] }),
      start("RS", null, [], "R"), activity("RU", userWork(), {}, "R"), end("RE", "none", "R"),
      activity("U1", userWork()), gateway("P", "parallel"), activity("W", ruleWork({ decision: text("d"), resultVariable: "go" })),
      throwing("TH", signalThrow), activity("X", userWork()), end("E1"), end("E2"), end("E3"), end("E4"), end("E5"),
    ], [flow("f1", "S", "F"), flow("fr", "F", "R"), flow("fu", "F", "U1"), flow("r1", "RS", "RU"), flow("r2", "RU", "RE"),
      flow("re", "R", "E1"), flow("sb", "SB", "E2"), flow("cb", "CB", "X"), flow("x", "X", "E3"), flow("u1", "U1", "P"),
      ...(writerFirst ? [pw, pt] : [pt, pw]), flow("we", "W", "E4"), flow("te", "TH", "E5")])(program(["go", "n"])),
    { businessRuleTask: "decisionTable" }),
    decisionResources: [resource([constant])],
  };
};

/**
 * A holder and its writer begun in different closures (`holderEarly`: the holder at the start, the writer after U1),
 * both waiting at Signal catches until one later broadcast wakes both.
 */
const lateWokenPair = (holderEarly: boolean): Json => model([
  start("S"), gateway("P", "parallel"),
  scope("A", "embedded", {}, { boundaries: [boundary("CB", present("go"), { interrupting: false })] }),
  start("AS", null, [], "A"), catchEvent("AC", signal(), [], "A"), end("AE", "none", "A"),
  activity("U1", userWork()),
  scope("B", "embedded", {}, { outputs: goes() }), start("BS", null, [], "B"), catchEvent("BC", signal(), [], "B"), end("BE", "none", "B"),
  activity("U2", userWork()), throwing("TH", signalThrow), activity("X", userWork()), end("E1"), end("E2"), end("E3"), end("E4"),
], [flow("f1", "S", "P"), flow("pu", "P", "U1"), flow("pv", "P", "U2"), flow("a1", "AS", "AC"), flow("a2", "AC", "AE"),
  ...(holderEarly ? [flow("pa", "P", "A"), flow("u1", "U1", "B")] : [flow("pa", "P", "B"), flow("u1", "U1", "A")]), flow("b1", "BS", "BC"), flow("b2", "BC", "BE"), flow("ae", "A", "E1"), flow("be", "B", "E2"),
  flow("cb", "CB", "X"), flow("x", "X", "E3"), flow("u2", "U2", "TH"), flow("th", "TH", "E4")])(program(["go"]));

/** Review finding 8: H holds a Conditional boundary and outlives the fork inside it, one of whose branches writes go. */
const nestedCascade = (): Json => {
  const [wEls, wFlows] = writer("W", "go", "2", "H");
  return model([
    start("S"), scope("H", "embedded", {}, { boundaries: [boundary("CB", equals("go", "1"), { interrupting: false })] }),
    start("HS", null, [], "H"), gateway("F", "parallel", {}, "H"), ...wEls, activity("V", userWork(), {}, "H"),
    end("HE1", "none", "H"), end("HE2", "none", "H"), activity("X", userWork()), end("E1"), end("E2"),
  ], [flow("f1", "S", "H"), flow("hs", "HS", "F"), flow("fw", "F", "W"), flow("fv", "F", "V"), ...wFlows, flow("w1", "W", "HE1"),
    flow("v1", "V", "HE2"), flow("he", "H", "E1"), flow("cb", "CB", "X"), flow("x", "X", "E2")])(program(["go"]));
};

/** Review finding 4: two Signal wakes inside one Sub-Process R that writes go on completion and holds its own boundary on go. */
const twoWakesInOne = (): Json => model([
  start("S"), gateway("P", "parallel"),
  scope("R", "embedded", {}, { outputs: goes(), boundaries: [boundary("CB", present("go"), { interrupting: false })] }),
  start("RS", null, [], "R"), gateway("F", "parallel", {}, "R"), catchEvent("C1", signal(), [], "R"), catchEvent("C2", signal(), [], "R"),
  end("RE1", "none", "R"), end("RE2", "none", "R"),
  activity("U", userWork()), throwing("TH", signalThrow), activity("X", userWork()), end("E1"), end("E2"), end("E3"),
], [flow("f1", "S", "P"), flow("pr", "P", "R"), flow("pu", "P", "U"), flow("rs", "RS", "F"), flow("f1a", "F", "C1"), flow("f1b", "F", "C2"),
  flow("c1", "C1", "RE1"), flow("c2", "C2", "RE2"), flow("re", "R", "E1"), flow("cb", "CB", "X"), flow("x", "X", "E2"),
  flow("u", "U", "TH"), flow("th", "TH", "E3")])(program(["go"]));

/** CIB-INT-0042: the holder's own boundary against its own output, beside a waiting sibling. */
const ownBoundary = (): Json => model([
  start("S"), gateway("P", "parallel"),
  scope("R", "embedded", {}, { outputs: goes(), boundaries: [boundary("CB", present("go"), { interrupting: false })] }),
  start("RS", null, [], "R"), end("RE", "none", "R"), activity("V", userWork()), activity("X", userWork()), end("E1"), end("E2"), end("E3"),
], [flow("f1", "S", "P"), flow("pr", "P", "R"), flow("pv", "P", "V"), flow("rs", "RS", "RE"), flow("re", "R", "E1"), flow("v", "V", "E2"),
  flow("cb", "CB", "X"), flow("x", "X", "E3")])(program(["go"]));

/**
 * Audit finding 1: one branch writes b, then a; the other reaches an Event-Based Gateway whose Conditional arms wait on
 * isPresent(a) and isPresent(b). Opened after both writes, the arming finds both true, a contest the input's ranking
 * decides; opened before, the write of b fires its arm first.
 */
const gatewayContest = (writerFirst: boolean): Json => {
  const [bEls, bFlows] = writer("T1", "b", "1");
  const [aEls, aFlows] = writer("T2", "a", "1");
  const pw = flow("pw", "P", "T1"), pg = flow("pg", "P", "G");
  return model([
    start("S"), gateway("P", "parallel"), ...bEls, ...aEls, gateway("G", eventBased()),
    catchEvent("C1", present("a")), catchEvent("C2", present("b")), activity("X1", userWork()), activity("X2", userWork()),
    end("E1"), end("E2"), end("E3"),
  ], [flow("f1", "S", "P"), ...(writerFirst ? [pw, pg] : [pg, pw]), ...bFlows, ...aFlows, flow("t1", "T1", "T2"), flow("t2", "T2", "E1"),
    flow("g1", "G", "C1"), flow("g2", "G", "C2"), flow("c1", "C1", "X1"), flow("c2", "C2", "X2"), flow("x1", "X1", "E2"),
    flow("x2", "X2", "E3")])(program(["a", "b"]));
};

/**
 * Audit finding 4: a broadcast wakes A's catch, and A then completes, ending its Conditional boundary, beside the
 * thrower's continuation, which writes go.
 */
const wakeBesideContinuation = (): Json => {
  const [wEls, wFlows] = writer("W", "go", "2");
  return model([
    start("S"), gateway("P", "parallel"),
    scope("A", "embedded", {}, { boundaries: [boundary("CB", present("go"), { interrupting: false })] }),
    start("AS", null, [], "A"), catchEvent("AC", signal(), [], "A"), end("AE", "none", "A"),
    activity("U", userWork()), throwing("TH", signalThrow), ...wEls, activity("X", userWork()), end("E1"), end("E2"), end("E3"),
  ], [flow("f1", "S", "P"), flow("pa", "P", "A"), flow("pu", "P", "U"), flow("a1", "AS", "AC"), flow("a2", "AC", "AE"),
    flow("ae", "A", "E1"), flow("u", "U", "TH"), flow("tw", "TH", "W"), ...wFlows, flow("we", "W", "E2"), flow("cb", "CB", "X"),
    flow("x", "X", "E3")])(program(["go"]));
};

/** Audit finding 3: two Signal catches at the top of one called process, woken together, share their Call's completion. */
const wakesInOneCall = (): Json => model([
  start("S"), gateway("P", "parallel"),
  activity("CA", callWork({ calledElement: text("Q"), inputs: [mapping("din", literalValue({ kind: "string", value: "yes" }), "dataAssociation")],
    outputs: [mapping("go", variable("din"), "dataAssociation")] })),
  start("QS"), gateway("QF", "parallel"), catchEvent("QC1", signal()), catchEvent("QC2", signal()), end("QE1"), end("QE2"),
  activity("U", userWork()), throwing("TH", signalThrow), end("E1"), end("E2"),
], [flow("f1", "S", "P"), flow("pc", "P", "CA"), flow("pu", "P", "U"), flow("qs", "QS", "QF"), flow("q1", "QF", "QC1"), flow("q2", "QF", "QC2"),
  flow("q3", "QC1", "QE1"), flow("q4", "QC2", "QE2"), flow("ce", "CA", "E1"), flow("u", "U", "TH"), flow("th", "TH", "E2")])(program([],
  [{ definition: definitionRef("Q"), children: ["QS", "QF", "QC1", "QC2", "QE1", "QE2"], variables: ["din"], executable: true }]));

const refused: ReadonlyArray<readonly [string, () => Json]> = [
  ["two completing Sub-Processes, boundary on A, write on B, A's flow first", () => closingPair("A", "B", true)],
  ["two completing Sub-Processes, boundary on A, write on B, B's flow first", () => closingPair("A", "B", false)],
  ["two completing Sub-Processes, boundary on B, write on A, B's flow first", () => closingPair("B", "A", true)],
  ["two completing Sub-Processes, boundary on B, write on A, A's flow first", () => closingPair("B", "A", false)],
  ["a write that may turn an opening boundary's condition false, writer's flow first", () => openingPair({ stringEquals: { name: "go", value: "1" } }, "go", true)],
  ["a write that may turn an opening boundary's condition false, writer's flow last", () => openingPair({ stringEquals: { name: "go", value: "1" } }, "go", false)],
  ["two Sub-Processes one broadcast wakes, a boundary on one and a write on the other", () => wokenPair("A", "B", false)],
  ["two Sub-Processes one broadcast wakes, a Conditional Event Sub-Process in one and a write in the other", () => wokenPair("A", "B", true)],
  ["a Call's output beside a Sub-Process's boundary, both woken by one broadcast", () => calledPair(true)],
  ["a write beside a Signal throw whose interrupting resumption removes the boundary's holder, writer's flow first", () => removedHolder(true)],
  ["a write beside a Signal throw whose interrupting resumption removes the boundary's holder, writer's flow last", () => removedHolder(false)],
  ["a holder begun before its writer, both completing after one broadcast", () => lateWokenPair(true)],
  ["a holder begun after its writer, both completing after one broadcast", () => lateWokenPair(false)],
  ["two writes beside an Event-Based Gateway whose Conditional arms they make true, writer's flow first", () => gatewayContest(true)],
  ["two writes beside an Event-Based Gateway whose Conditional arms they make true, writer's flow last", () => gatewayContest(false)],
  ["a woken holder completing beside the thrower's writing continuation", wakeBesideContinuation],
];

for (const [description, build] of refused) {
  test(`flow conditional races: ${description} is refused`, () => assert.equal(refusalOf(build()), "flow.concurrentWrite"));
}

const admitted: ReadonlyArray<readonly [string, () => Json]> = [
  ["a write that can only make an opening boundary's condition true", () => openingPair({ isPresent: { name: "go2" } }, "go2", true)],
  ["a holder outliving the fork whose branch writes", nestedCascade],
  ["two Signal wakes inside one Sub-Process with an output mapping and its own boundary", twoWakesInOne],
  ["a holder's own boundary against its own output", ownBoundary],
  ["two Signal wakes at the top of one called process whose Call has an output mapping", wakesInOneCall],
];

for (const [description, build] of admitted) {
  test(`flow conditional races: ${description} is admitted`, () => assert.equal(refusalOf(build()), null));
}
