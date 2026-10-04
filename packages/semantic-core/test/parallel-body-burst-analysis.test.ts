import assert from "node:assert/strict";
import test from "node:test";
import type { ParallelBodyNode } from "../src/structured-parallel-body-analysis.ts";
import type { ParallelBodyBursts } from "../src/parallel-body-burst-analysis.ts";

const { ParallelBodyNodeKind: Kind } = await import(
  new URL("../dist/structured-parallel-body-analysis.js", import.meta.url).href
) as typeof import("../src/structured-parallel-body-analysis.ts");
const { analyzeParallelBodyBursts: analyze } = await import(
  new URL("../dist/parallel-body-burst-analysis.js", import.meta.url).href
) as typeof import("../src/parallel-body-burst-analysis.ts");

function node(id: string, kind: ParallelBodyNode["kind"], ...outputs: string[]): ParallelBodyNode {
  return { id, kind, outputs };
}

function fanout(width: number, afterTask = false, separateEnds = false): ParallelBodyNode[] {
  const tasks = Array.from({ length: width }, (_, i) => `task${i}`);
  return [node("start", Kind.Start, afterTask ? "before" : "fork"),
    ...(afterTask ? [node("before", Kind.Task, "fork")] : []),
    node("fork", Kind.Fork, ...tasks),
    ...tasks.map((id, i) => node(id, Kind.Task, separateEnds ? `end${i}` : "join")),
    ...(separateEnds ? tasks.map((_, i) => node(`end${i}`, Kind.End))
      : [node("join", Kind.Join, "after"), node("after", Kind.Task, "end"), node("end", Kind.End)])];
}

test("counts child-body operations separately from the MI entry and completion operations", () => {
  const serial = [node("start", Kind.Start, "human"), node("human", Kind.Task, "service"),
    node("service", Kind.Task, "end"), node("end", Kind.End)];
  assert.deepEqual(analyze(serial), { entryBurst: 1, maximumResumptionBurst: 1, maximumTerminalBurst: 1 });
  assert.deepEqual(analyze(fanout(2)), { entryBurst: 3, maximumResumptionBurst: 2, maximumTerminalBurst: 1 });
  assert.deepEqual(analyze(fanout(2, false, true)), { entryBurst: 3, maximumResumptionBurst: 1, maximumTerminalBurst: 1 });
});

test("separates eight and nine automatic steps by summing simultaneous branches", () => {
  for (const afterTask of [false, true]) {
    const eight = analyze(fanout(7, afterTask))!;
    const nine = analyze(fanout(8, afterTask))!;
    assert.equal(afterTask ? eight.maximumResumptionBurst : eight.entryBurst, 8);
    assert.equal(afterTask ? nine.maximumResumptionBurst : nine.entryBurst, 9);
  }
});

test("a newly activated task prevents its downstream join from firing in the same burst", () => {
  const graph = [node("start", Kind.Start, "before"), node("before", Kind.Task, "fork"),
    node("fork", Kind.Fork, "join", "later"), node("later", Kind.Task, "join"),
    node("join", Kind.Join, "end"), node("end", Kind.End)];
  assert.deepEqual(analyze(graph), { entryBurst: 1, maximumResumptionBurst: 2, maximumTerminalBurst: 2 });
  assert.deepEqual(analyze(graph), executeAllSchedules(graph));
});

test("empty parallel branches retain edge multiplicity and consume one join operation", () => {
  const graph = [node("start", Kind.Start, "task"), node("task", Kind.Task, "fork"),
    node("fork", Kind.Fork, "join", "join"), node("join", Kind.Join, "end"), node("end", Kind.End)];
  assert.deepEqual(analyze(graph), { entryBurst: 1, maximumResumptionBurst: 3, maximumTerminalBurst: 3 });
  assert.deepEqual(analyze(graph), executeAllSchedules(graph));
});

test("agrees with reachable-frontier execution across nested regions and both branch schedules", () => {
  for (const separateEnds of [false, true]) {
    for (let width = 2; width <= 4; width++) {
      const base = fanout(width, true, separateEnds);
      const graph = base.map(value => value.id === "task0" ? node("task0", Kind.Fork, "left", "right") : value);
      graph.push(node("left", Kind.Task, "innerJoin"), node("right", Kind.Task, "innerJoin"),
        node("innerJoin", Kind.Join, separateEnds ? "end0" : "join"));
      assert.deepEqual(analyze(graph), executeAllSchedules(graph));
      const renamed = graph.map(value => ({ ...value, id: `renamed:${value.id}`,
        outputs: value.outputs.map(id => `renamed:${id}`).reverse() })).reverse();
      assert.deepEqual(analyze(renamed), analyze(graph));
    }
  }
});

test("serial model length is independent of the automatic burst bound", () => {
  const tasks = Array.from({ length: 100 }, (_, i) => node(`t${i}`, Kind.Task, i === 99 ? "end" : `t${i + 1}`));
  assert.deepEqual(analyze([node("start", Kind.Start, "t0"), ...tasks, node("end", Kind.End)]),
    { entryBurst: 1, maximumResumptionBurst: 1, maximumTerminalBurst: 1 });
});

test("refuses malformed topology and bodies without an external wait", () => {
  assert.equal(analyze([]), undefined);
  assert.equal(analyze([node("start", Kind.Start, "end"), node("end", Kind.End)]), undefined);
  const graph = fanout(2);
  assert.equal(analyze(graph.map(value => value.id === "task0" ? { ...value, outputs: ["task1"] } : value)), undefined);
  assert.equal(analyze([...graph, node("loop", Kind.Task, "loop")]), undefined);
});

// SMIS-ADMIT-01 oracle enumerates actual stable frontiers and all enabled completions, without causal preloading.
function executeAllSchedules(nodes: readonly ParallelBodyNode[]): ParallelBodyBursts {
  const edges = nodes.flatMap(source => source.outputs.map(target => ({ source: source.id, target })));
  type State = { tokens: Set<number>; waiting: Set<string>; fired: Set<string> };
  const copy = (state: State): State => ({ tokens: new Set(state.tokens), waiting: new Set(state.waiting), fired: new Set(state.fired) });
  const emit = (state: State, id: string) => edges.forEach((edge, index) => { if (edge.source === id) state.tokens.add(index); });
  function settle(state: State): number {
    let steps = 0;
    for (;;) {
      const next = nodes.find(value => !state.fired.has(value.id) &&
        (value.kind === Kind.Start || edges.every((edge, index) => edge.target !== value.id || state.tokens.has(index))));
      if (next === undefined) return steps;
      state.fired.add(next.id);
      edges.forEach((edge, index) => { if (edge.target === next.id) state.tokens.delete(index); });
      if (next.kind !== Kind.Start) steps++;
      if (next.kind === Kind.Task) state.waiting.add(next.id);
      else emit(state, next.id);
    }
  }
  const initial: State = { tokens: new Set(), waiting: new Set(), fired: new Set() };
  const entryBurst = settle(initial);
  let maximumResumptionBurst = 0;
  let maximumTerminalBurst = 0;
  const pending = [initial];
  const visited = new Set<string>();
  for (let cursor = 0; cursor < pending.length; cursor++) {
    const current = pending[cursor]!;
    for (const task of current.waiting) {
      const next = copy(current);
      next.waiting.delete(task);
      emit(next, task);
      const count = settle(next);
      maximumResumptionBurst = Math.max(maximumResumptionBurst, count);
      if (next.waiting.size === 0 && next.tokens.size === 0) maximumTerminalBurst = Math.max(maximumTerminalBurst, count);
      const key = JSON.stringify([[...next.tokens].sort((a, b) => a - b), [...next.waiting].sort(), [...next.fired].sort()]);
      if (!visited.has(key)) { visited.add(key); pending.push(next); }
    }
  }
  return { entryBurst, maximumResumptionBurst, maximumTerminalBurst };
}
