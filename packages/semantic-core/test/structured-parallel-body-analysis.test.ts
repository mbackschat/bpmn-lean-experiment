import assert from "node:assert/strict";
import test from "node:test";
import type { ParallelBodyNode } from "../src/structured-parallel-body-analysis.ts";

type Module = typeof import("../src/structured-parallel-body-analysis.ts");
const { ParallelBodyNodeKind: Kind, isStructuredParallelBody: admits } = await import(
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
