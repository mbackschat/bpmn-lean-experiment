/**
 * Locks the region leaf of IGR-ADMIT-01 against the crossing of the Inclusive regions proposal's wrong algorithm 5, which
 * source projection cannot express: a split whose branches meet at a Parallel join, followed by a Parallel fork whose
 * branches meet at the Inclusive join naming that split. Selection-key pairing alone accepts it; the structural walk
 * does not. The Lean twin is `crossing_is_refused` in `InclusiveRegionsConformance`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { RegionGuard, RegionVertexKind, inclusiveRegionsAdmitted } from "@bpmn-lean/semantic-core";
import type { RegionEdge, RegionGraph, RegionVertex } from "@bpmn-lean/semantic-core";

const edge = (id: string, target: string, extra: Partial<RegionEdge> = {}): RegionEdge => ({ id, target, ...extra });
const vertex = (id: string, kind: RegionVertexKind, outputs: readonly RegionEdge[], inputs: readonly string[],
  pairing?: string): RegionVertex => ({ id, kind, scope: "root", outputs, inputs, ...(pairing === undefined ? {} : { pairing }) });
const graph = (vertices: readonly RegionVertex[]): RegionGraph =>
  ({ root: "root", vertices: new Map(vertices.map(item => [item.id, item])) });

/** A split with two always-taken outputs whose expected join inputs are `expected`. */
const split = (expected: readonly [string, string]) => vertex("I", RegionVertexKind.Split, [
  edge("toA", "A", { guard: RegionGuard.Always, expectedJoinInput: expected[0] }),
  edge("toB", "B", { guard: RegionGuard.Always, expectedJoinInput: expected[1] })], ["started"]);
const start = vertex("Start", RegionVertexKind.Start, [edge("started", "I")], []);
const end = vertex("End", RegionVertexKind.End, [], ["finished"]);

const crossing = (expected: readonly [string, string]) => graph([start, split(expected),
  vertex("A", RegionVertexKind.Work, [edge("a", "P")], ["toA"]),
  vertex("B", RegionVertexKind.Work, [edge("b", "P")], ["toB"]),
  vertex("P", RegionVertexKind.Join, [edge("joined", "Q")], ["a", "b"]),
  vertex("Q", RegionVertexKind.Fork, [edge("toC", "C"), edge("toD", "D")], ["joined"]),
  vertex("C", RegionVertexKind.Work, [edge("c", "J")], ["toC"]),
  vertex("D", RegionVertexKind.Work, [edge("d", "J")], ["toD"]),
  vertex("J", RegionVertexKind.InclusiveJoin, [edge("finished", "End")], ["c", "d"], "I"), end]);

const structured = (expected: readonly [string, string]) => graph([start, split(expected),
  vertex("A", RegionVertexKind.Work, [edge("a", "J")], ["toA"]),
  vertex("B", RegionVertexKind.Work, [edge("b", "J")], ["toB"]),
  vertex("J", RegionVertexKind.InclusiveJoin, [edge("finished", "End")], ["a", "b"], "I"), end]);

test("the crossing is refused at each level whichever join inputs the Program records", () => {
  for (const expected of [["c", "d"], ["a", "b"]] as const) {
    assert.equal(inclusiveRegionsAdmitted(crossing(expected), false), false, expected.join());
    assert.equal(inclusiveRegionsAdmitted(crossing(expected), true), false, expected.join());
  }
});

test("its structured twin is admitted at each level, and the Program level refuses swapped join inputs", () => {
  assert.equal(inclusiveRegionsAdmitted(structured(["a", "b"]), false), true);
  assert.equal(inclusiveRegionsAdmitted(structured(["a", "b"]), true), true);
  assert.equal(inclusiveRegionsAdmitted(structured(["b", "a"]), false), true, "the checked level records no join inputs");
  assert.equal(inclusiveRegionsAdmitted(structured(["b", "a"]), true), false);
});
