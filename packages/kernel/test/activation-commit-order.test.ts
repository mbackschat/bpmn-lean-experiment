/**
 * Activations are numbered at commit (KD5, owner decision 2026-11-25): under `orderInvariant` the same element's
 * activations begun in one closure take their numbers in the closure's schedule-free commit order (`UnitKey.breadth`),
 * not in the order their units ran; under `declarationDepthFirst` the commit order is the run order, so the numbers are
 * the begin order. A Call begun and invoked in one closure names its called instance by its activation (`calledBy`),
 * which the commit resolves with the activation it numbers.
 *
 * The model forks to a Signal throw `X` and the Task `T`, both leading through the Task `M` to the Call `C`, whose called
 * process waits in the User Task `CU`; the root's non-interrupting Event Sub-Process `H` catches the Signal. As in
 * `join-firing-unit.test.ts`, the throw's completion runs as a signal before the token to `T` moves, so `C` is begun
 * through `X` first, in the deeper unit: run order and commit order differ.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { admit, decodeProgram, step, stimulusFromJson } from "./lean-paired.ts";
import type { Program, State } from "@bpmn-lean/kernel";

import {
  activity, base, callWork, catchEvent, definitionRef, end, eventSubProcess, flow, gateway, literalValue, loop, mapping, model, scope,
  signal, signalThrow, start, throwing, userWork, wired, withOptions, type Json,
} from "./admission-refusal-support.ts";

function forked(schedule: string): Program {
  const json = model([
    start("S"), gateway("P", "parallel"), throwing("X", signalThrow), activity("T", "manual"), activity("M", "manual"),
    activity("C", callWork()), end("E"), scope("H", eventSubProcess(signal(), false)), start("HS", signal(), [], "H"),
    end("HE", "none", "H"), start("CS"), activity("CU", userWork()), end("CE"),
  ], [
    flow("s", "S", "P"), flow("p1", "P", "X"), flow("p2", "P", "T"), flow("x1", "X", "M"), flow("t1", "T", "M"), flow("m", "M", "C"),
    flow("c", "C", "E"), flow("h", "HS", "HE"), flow("cs", "CS", "CU"), flow("cu", "CU", "CE"),
  ])(base());
  const program = { ...json, processes: [{ definition: definitionRef("Called"), children: ["CS", "CU", "CE"], variables: [], executable: true }] };
  const decoded = decodeProgram(wired(withOptions(program, { branchSchedule: schedule })));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  assert.equal(admit(decoded.value), null);
  return decoded.value;
}

function started(program: Program): State {
  const input = stimulusFromJson({ kind: "start", commandId: "start", instanceId: "I", variables: [] });
  assert.ok(input.ok, input.ok ? "" : input.refusal);
  const outcome = step(program, null, input.value[1]);
  assert.ok(outcome.ok, JSON.stringify(outcome));
  return outcome.value;
}

/** The activations of `C` in the order the journal began them, which is the order their units ran. */
function callsBegun(state: State): readonly number[] {
  return state.journal.flatMap((transition) => transition.started.filter((fact) => fact.occurrence.element === "C"))
    .map((fact) => fact.occurrence.activation as number);
}

/** Each called instance's identifier with the activation of the Call occurrence that owns its root. */
function calledInstances(state: State): readonly (readonly [unknown, number])[] {
  return state.scopes.filter((scope) => scope.calledInstance !== null).map((scope) => {
    const call = state.occurrences.find((occurrence) => occurrence.id === scope.occurrence);
    assert.ok(call !== undefined, "a called root's Call stands");
    return [scope.calledInstance, call.activation as number] as const;
  });
}

test("under orderInvariant two activations of one Call begun in one closure are numbered in commit order", () => {
  const state = started(forked("orderInvariant"));
  assert.deepEqual(callsBegun(state), [2, 1], "C through X ran first but its unit is the deeper one");
  assert.deepEqual(calledInstances(state).map(([id, activation]) => [id, `call:1:I:1:C:${activation}`])
    .filter(([id, expected]) => id !== expected), [], "each called instance is named by its Call's committed activation");
  assert.equal(calledInstances(state).length, 2);
});

test("under declarationDepthFirst the same activations are numbered in begin order", () => {
  const state = started(forked("declarationDepthFirst"));
  const begun = callsBegun(state);
  assert.deepEqual([...begun].sort(), [1, 2]);
  assert.deepEqual(begun, [1, 2]);
  assert.deepEqual(calledInstances(state).map(([id, activation]) => [id, `call:1:I:1:C:${activation}`])
    .filter(([id, expected]) => id !== expected), []);
});

/**
 * Two Calls `C1`, `C2` sharing one authored identifier, which admission refuses (`element.origin.sourceId`), name their
 * called instances alike: `C1`'s, invoked by the start, stands under its resolved name and waits at a Signal catch;
 * completing `W` begins `C2`, whose instance runs the looping Task `CU` at once under a pending name, then throws the
 * Signal, so `C1`'s instance begins `CU` later in the same closure. The commit sorts by the depth the name resolves to
 * (`InstanceName.callDepth`), which both share, so run order decides; sorting by the pending name's Calls numbered the
 * resolved name first ([2, 1], K12w witness, 2026-11-25).
 */
test("one resolved slot's activations under a standing and a pending name are numbered in run order", () => {
  const call = (id: string, wait: boolean) => activity(id, callWork({
    inputs: [mapping("wait", literalValue({ kind: "string", value: wait ? "yes" : "no" }), "dataAssociation")] }));
  const waits = { simpleBoolean: { body: { stringEquals: { name: "wait", value: "yes" } } } };
  const json = model([
    start("S"), gateway("P", "parallel"), call("C1", true), activity("W", userWork()), gateway("P2", "parallel"),
    call("C2", false), throwing("ST", signalThrow), end("E1"), end("E2"), end("E3"),
    start("CS"), gateway("G", { exclusive: { candidates: ["g1"], default: "g2" } }), catchEvent("SC", signal()),
    gateway("J", { exclusive: { candidates: ["j"], default: null } }),
    activity("CU", userWork(), { multiInstance: loop({ mode: "parallel", count: { cardinality: { count: { literal: {
      value: { kind: "integer", value: 1 } } } } }, inputDataItem: null, outputDataItem: null }) }),
    end("CE"),
  ], [
    flow("s", "S", "P"), flow("p1", "P", "C1"), flow("p2", "P", "W"), flow("c1", "C1", "E1"), flow("w", "W", "P2"),
    flow("q1", "P2", "C2"), flow("q2", "P2", "ST"), flow("c2", "C2", "E2"), flow("st", "ST", "E3"),
    flow("cs", "CS", "G"), flow("g1", "G", "SC", waits), flow("g2", "G", "J"), flow("sc", "SC", "J"), flow("j", "J", "CU"),
    flow("cu", "CU", "CE"),
  ])(base());
  for (const element of json["elements"] as Json[]) {
    const header = (element["activity"] as Json | undefined)?.["header"] as Json | undefined;
    if (header !== undefined && (header["id"] === "C1" || header["id"] === "C2")) {
      header["origin"] = { ...(header["origin"] as Json), sourceId: "X" };
    }
  }
  const program = withOptions({ ...json, processes: [{ definition: definitionRef("Called"),
    children: ["CS", "G", "SC", "J", "CU", "CE"], variables: ["wait"], executable: true }] }, { branchSchedule: "declarationDepthFirst" });
  const decoded = decodeProgram(wired(program));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  const one = started(decoded.value);
  const command = stimulusFromJson({ kind: "command", commandId: "w", occurrence: { processInstanceId: "I", elementId: "W", activation: 1 },
    action: { kind: "completeUserTask", values: [] } });
  assert.ok(command.ok, command.ok ? "" : command.refusal);
  const two = step(decoded.value, one, command.value[1]);
  assert.ok(two.ok, JSON.stringify(two));
  const begun = two.value.journal.flatMap((transition) => transition.started)
    .filter((fact) => fact.occurrence.element === "CU" && fact.occurrence.role === "element");
  assert.deepEqual(begun.map((fact) => [fact.occurrence.processInstanceId, fact.occurrence.activation]),
    [["call:1:I:1:X:1", 1], ["call:1:I:1:X:1", 2]]);
});

/**
 * Under `orderInvariant` a throw orders its receivers in two called instances entered in its closure by their names
 * (KD1's structural key, P09), not by the identifiers their activations would give them if no unit yet to run issued
 * another (`Ctx.provisional`): the Calls `B` and `AA` call instances waiting at a Signal catch, and the throw `X` fires
 * both. By name `AA`'s instance comes first; by identifier `B`'s, whose `call:1:I:1:B:1` sorts before `call:1:I:2:AA:1`.
 */
test("under orderInvariant a throw fires its receivers in called instances by their names", () => {
  const json = model([
    start("S"), gateway("P", "parallel"), activity("B", callWork()), activity("AA", callWork()), activity("T1", "manual"),
    activity("T2", "manual"), activity("T3", "manual"), activity("T4", "manual"), throwing("X", signalThrow), end("E1"),
    end("E2"), end("E3"), start("CS"), catchEvent("SC", signal()), activity("CU", userWork()), end("CE"),
  ], [
    flow("s", "S", "P"), flow("p1", "P", "B"), flow("p2", "P", "AA"), flow("p3", "P", "T1"), flow("b", "B", "E1"),
    flow("aa", "AA", "E2"), flow("t1", "T1", "T2"), flow("t2", "T2", "T3"), flow("t3", "T3", "T4"), flow("t4", "T4", "X"),
    flow("x", "X", "E3"), flow("cs", "CS", "SC"), flow("sc", "SC", "CU"), flow("cu", "CU", "CE"),
  ])(base());
  const program = withOptions({ ...json, processes: [{ definition: definitionRef("Called"), children: ["CS", "SC", "CU", "CE"],
    variables: [], executable: true }] }, { branchSchedule: "orderInvariant" });
  const decoded = decodeProgram(wired(program));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  assert.equal(admit(decoded.value), null);
  const begun = started(decoded.value).journal.flatMap((transition) => transition.started)
    .filter((fact) => fact.occurrence.element === "CU").map((fact) => fact.occurrence.processInstanceId);
  assert.deepEqual(begun, ["call:1:I:2:AA:1", "call:1:I:1:B:1"]);
});
