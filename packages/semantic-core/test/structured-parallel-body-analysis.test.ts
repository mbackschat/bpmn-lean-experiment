import assert from "node:assert/strict";
import test from "node:test";
import type { ParallelBodyNode } from "../src/structured-parallel-body-analysis.ts";

type Module = typeof import("../src/structured-parallel-body-analysis.ts");
const { ParallelBodyNodeKind: Kind, isStructuredParallelBody: admits, structuredParallelBodyFrontierCapacity: capacity } = await import(
  new URL("../dist/structured-parallel-body-analysis.js", import.meta.url).href
) as Module;

function node(id: string, kind: ParallelBodyNode["kind"], ...outputs: string[]): ParallelBodyNode {
  return { id, kind, outputs };
}

function paired(): readonly ParallelBodyNode[] {
  return [node("start", Kind.Start, "fork"), node("fork", Kind.Fork, "review", "check"),
    node("review", Kind.Task, "join"), node("check", Kind.Task, "join"),
    node("join", Kind.Join, "validate"), node("validate", Kind.Task, "end"), node("end", Kind.End)];
}

function separateEnds(): readonly ParallelBodyNode[] {
  return [node("start", Kind.Start, "fork"), node("fork", Kind.Fork, "review", "check"),
    node("review", Kind.Task, "endA"), node("check", Kind.Task, "endB"),
    node("endA", Kind.End), node("endB", Kind.End)];
}

test("admits serial bodies and paired parallel work without choosing business IDs", () => {
  assert.equal(admits([node("start", Kind.Start, "human"), node("human", Kind.Task, "service"),
    node("service", Kind.Task, "end"), node("end", Kind.End)]), true);
  assert.equal(admits(paired()), true);
  const renamed = paired().map(value => ({ ...value, id: `other:${value.id}`,
    outputs: value.outputs.map(id => `other:${id}`).reverse() })).reverse();
  assert.equal(admits(renamed), true);
});

test("admits nested paired regions and independent branch Ends", () => {
  assert.equal(admits(separateEnds()), true);
  const nested = paired().map(value => value.id === "review" ? node("review", Kind.Fork, "a", "b") : value);
  assert.equal(admits([...nested, node("a", Kind.Task, "innerJoin"), node("b", Kind.Task, "innerJoin"),
    node("innerJoin", Kind.Join, "join")]), true);
  const nestedEnds = separateEnds().filter(value => value.id !== "endA")
    .map(value => value.id === "review" ? node("review", Kind.Fork, "endC", "endD") : value);
  assert.equal(admits([...nestedEnds, node("endC", Kind.End), node("endD", Kind.End)]), true);
});

test("preserves parallel edge multiplicity including empty branches", () => {
  assert.equal(admits([node("start", Kind.Start, "fork"), node("fork", Kind.Fork, "join", "join"),
    node("join", Kind.Join, "end"), node("end", Kind.End)]), true);
  assert.equal(admits(paired().map(value => value.id === "fork" ? { ...value, outputs: ["review", "review"] } : value)), false);
});

test("rejects crossing regions even when all nodes are reachable and arities are valid", () => {
  const crossing = [node("start", Kind.Start, "outer"), node("outer", Kind.Fork, "left", "right"),
    node("left", Kind.Fork, "joinA", "joinB"), node("right", Kind.Fork, "joinA", "joinB"),
    node("joinA", Kind.Join, "endA"), node("joinB", Kind.Join, "endB"),
    node("endA", Kind.End), node("endB", Kind.End)];
  assert.equal(admits(crossing), false);
  assert.equal(admits(crossing.map(value => ({ ...value, outputs: [...value.outputs].reverse() })).reverse()), false);
});

test("rejects a branch bypassing its siblings' join and partial grouping of one fork", () => {
  assert.equal(admits([node("start", Kind.Start, "fork"), node("fork", Kind.Fork, "join", "task", "endA"),
    node("task", Kind.Task, "join"), node("join", Kind.Join, "endB"),
    node("endA", Kind.End), node("endB", Kind.End)]), false);
  assert.equal(admits([node("start", Kind.Start, "fork"), node("fork", Kind.Fork, "joinA", "joinA", "joinB"),
    node("joinA", Kind.Join, "joinB"), node("joinB", Kind.Join, "end"), node("end", Kind.End)]), false);
});

test("rejects malformed declarations, implicit merges, incomplete joins and disconnected cycles", () => {
  const base = paired();
  const variants = [[], [...base, base[0]!], base.filter(value => value.id !== "start"),
    base.map(value => value.id === "check" ? { ...value, id: "" } : value),
    base.map(value => value.id === "review" ? { ...value, outputs: ["missing"] } : value),
    base.map(value => value.id === "join" ? { ...value, kind: Kind.Task } : value),
    base.map(value => value.id === "fork" ? { ...value, kind: Kind.Task } : value),
    base.map(value => value.id === "check" ? { ...value, outputs: ["review"] } : value),
    base.map(value => value.id === "end" ? { ...value, outputs: ["start"] } : value),
    [...base, node("extraStart", Kind.Start, "extraEnd"), node("extraEnd", Kind.End)],
    [...base, node("loopA", Kind.Task, "loopB"), node("loopB", Kind.Task, "loopA")],
    [node("start", Kind.Start, "join"), node("join", Kind.Join, "fork"),
      node("fork", Kind.Fork, "join", "end"), node("end", Kind.End)],
  ];
  variants.forEach((value, index) => assert.equal(admits(value), false, `variant ${index}`));
});

test("serial length does not impose a model-size restriction or use recursive traversal", () => {
  const count = 1500;
  const tasks = Array.from({ length: count }, (_, index) => node(`task${index}`, Kind.Task,
    index + 1 === count ? "end" : `task${index + 1}`));
  assert.equal(admits([node("start", Kind.Start, "task0"), ...tasks, node("end", Kind.End)]), true);
});


test("frontier capacity takes serial maxima and parallel sums independently for waits and effects", () => {
  assert.deepEqual(capacity(paired(), new Set(["check", "validate"])), { waits: 2, effects: 1 });
  assert.deepEqual(capacity(separateEnds(), new Set(["check"])), { waits: 2, effects: 1 });
  const nested = paired().map(value => value.id === "review" ? node("review", Kind.Fork, "a", "b") : value);
  const graph = [...nested, node("a", Kind.Task, "innerJoin"), node("b", Kind.Task, "innerJoin"), node("innerJoin", Kind.Join, "join")];
  assert.deepEqual(capacity(graph, new Set(["a", "b", "check", "validate"])), { waits: 3, effects: 3 });
  assert.deepEqual(capacity([...graph].reverse(), new Set(["validate"])), { waits: 3, effects: 1 });
  assert.deepEqual(capacity([node("start", Kind.Start, "fork"), node("fork", Kind.Fork, "join", "join"),
    node("join", Kind.Join, "end"), node("end", Kind.End)], new Set()), { waits: 0, effects: 0 });
  assert.equal(capacity([...paired(), node("orphan", Kind.End)], new Set()), undefined);
});


test("structural widths equal every reachable token/wait frontier on small serial and nested graphs", () => {
  const graphs = [paired(), separateEnds(),
    [...paired().map(value => value.id === "review" ? node("review", Kind.Fork, "a", "b") : value),
      node("a", Kind.Task, "innerJoin"), node("b", Kind.Task, "innerJoin"), node("innerJoin", Kind.Join, "join")],
    [...separateEnds().filter(value => value.id !== "endA").map(value => value.id === "review" ? node("review", Kind.Fork, "a", "b") : value),
      node("a", Kind.Task, "endC"), node("b", Kind.Task, "endD"), node("endC", Kind.End), node("endD", Kind.End)]];
  for (const graph of graphs) {
    const tasks = graph.filter(value => value.kind === Kind.Task).map(value => value.id);
    for (let mask = 0; mask < 2 ** tasks.length; mask++) {
      const effects = new Set(tasks.filter((_, index) => (mask & (1 << index)) !== 0));
      const pending = [{ tokens: ["start"], waits: [] as string[] }];
      const seen = new Set<string>();
      let waits = 0, effectCount = 0;
      while (pending.length > 0) {
        const state = pending.pop()!;
        const key = JSON.stringify([state.tokens.sort(), state.waits.sort()]);
        if (seen.has(key)) continue;
        seen.add(key);
        waits = Math.max(waits, state.waits.length);
        effectCount = Math.max(effectCount, state.waits.filter(id => effects.has(id)).length);
        for (const current of graph) {
          if (state.waits.includes(current.id)) pending.push({ tokens: [...state.tokens, ...current.outputs], waits: state.waits.filter(id => id !== current.id) });
          const required = current.kind === Kind.Start ? 1 : graph.flatMap(value => value.outputs).filter(id => id === current.id).length;
          if (required === 0 || state.tokens.filter(id => id === current.id).length !== required) continue;
          const tokens = state.tokens.filter(id => id !== current.id);
          pending.push(current.kind === Kind.Task ? { tokens, waits: [...state.waits, current.id] }
            : { tokens: [...tokens, ...current.outputs], waits: state.waits });
        }
      }
      assert.deepEqual(capacity(graph, effects), { waits, effects: effectCount });
    }
  }
});
