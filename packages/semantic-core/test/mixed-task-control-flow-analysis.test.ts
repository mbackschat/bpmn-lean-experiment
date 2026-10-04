import assert from "node:assert/strict";
import test from "node:test";
import type { MixedTaskControlVertex } from "../src/mixed-task-control-flow-analysis.ts";

type AnalysisModule = typeof import("../src/mixed-task-control-flow-analysis.ts");
const { MixedTaskControlKind: Kind, analyzeMixedTaskControlFlow: analyze } = await import(
  new URL("../dist/mixed-task-control-flow-analysis.js", import.meta.url).href
) as AnalysisModule;

function vertex(id: string, kind: MixedTaskControlVertex["kind"], outputs: readonly string[],
  reads: readonly string[] = [], writes: readonly string[] = []): MixedTaskControlVertex {
  return { id, kind, outputs, reads, writes };
}

function diamond(rightWrites: readonly string[] = []): readonly MixedTaskControlVertex[] {
  return [
    vertex("start", Kind.Start, ["choice"]),
    vertex("choice", Kind.Choice, ["left", "right"]),
    vertex("left", Kind.Task, ["merge"], [], ["request"]),
    vertex("right", Kind.Task, ["merge"], [], rightWrites),
    vertex("merge", Kind.Merge, ["reader"]),
    vertex("reader", Kind.Task, ["end"], ["request"]),
    vertex("end", Kind.End, []),
  ];
}

function rework(writerBeforeReader: boolean): readonly MixedTaskControlVertex[] {
  return [
    vertex("start", Kind.Start, ["merge"]),
    vertex("merge", Kind.Merge, [writerBeforeReader ? "writer" : "reader"]),
    vertex("reader", Kind.Task, [writerBeforeReader ? "choice" : "writer"], ["request"]),
    vertex("writer", Kind.Task, [writerBeforeReader ? "reader" : "choice"], [], ["request"]),
    vertex("choice", Kind.Choice, ["merge", "end"]),
    vertex("end", Kind.End, []),
  ];
}

function choicesBeforeEnd(count: number): readonly MixedTaskControlVertex[] {
  return [
    vertex("start", Kind.Start, ["choice0"]),
    ...Array.from({ length: count }, (_, index) => vertex(`choice${index}`, Kind.Choice,
      [index + 1 === count ? "task" : `choice${index + 1}`, "merge"])),
    vertex("task", Kind.Task, ["merge"]),
    vertex("merge", Kind.Merge, ["end"]),
    vertex("end", Kind.End, []),
  ];
}

test("writer barriers require initial data when only one branch produces it", () => {
  assert.deepEqual(analyze(diamond()), { requiredInputs: ["request"], maximumBurst: 3 });
  assert.deepEqual(analyze(diamond(["request"])), { requiredInputs: [], maximumBurst: 3 });
});

test("a back-edge writer cannot initialize the first visit", () => {
  assert.deepEqual(analyze(rework(false)), { requiredInputs: ["request"], maximumBurst: 3 });
  assert.deepEqual(analyze(rework(true)), { requiredInputs: [], maximumBurst: 3 });
});

test("a task reads before its own output and requirements use Unicode scalar order", () => {
  const graph = [vertex("start", Kind.Start, ["task"]),
    vertex("task", Kind.Task, ["end"], ["𐀀", "z", "", "z"], ["z", "𐀀", ""]),
    vertex("end", Kind.End, [])];
  assert.deepEqual(analyze(graph), { requiredInputs: ["z", "", "𐀀"], maximumBurst: 2 });
});

test("parallel edges into a Merge retain their multiplicity", () => {
  assert.deepEqual(analyze([
    vertex("start", Kind.Start, ["choice"]), vertex("choice", Kind.Choice, ["merge", "merge"]),
    vertex("merge", Kind.Merge, ["task"]), vertex("task", Kind.Task, ["end"]),
    vertex("end", Kind.End, []),
  ]), { requiredInputs: [], maximumBurst: 4 });
});

test("internal bursts distinguish exact eight and nine without imposing the caller limit", () => {
  assert.equal(analyze(choicesBeforeEnd(4))?.maximumBurst, 8);
  assert.equal(analyze(choicesBeforeEnd(5))?.maximumBurst, 9);
});

test("all task continuations contribute to the burst maximum", () => {
  const graph = choicesBeforeEnd(5).map((item) => item.id === "start"
    ? vertex("start", Kind.Start, ["entryTask"]) : item);
  graph.push(vertex("entryTask", Kind.Task, ["choice0"]));
  assert.equal(analyze(graph)?.maximumBurst, 8);
});

test("arbitrarily long task-separated chains have a two-step burst", () => {
  const graph = [vertex("start", Kind.Start, ["task0"]),
    ...Array.from({ length: 1500 }, (_, index) => vertex(`task${index}`, Kind.Task,
      [index === 1499 ? "end" : `task${index + 1}`])), vertex("end", Kind.End, [])];
  assert.deepEqual(analyze(graph), { requiredInputs: [], maximumBurst: 2 });
});

test("an internal-only cycle rejects even when its exit reaches a task", () => {
  const graph = [vertex("start", Kind.Start, ["merge"]), vertex("merge", Kind.Merge, ["choice"]),
    vertex("choice", Kind.Choice, ["merge", "task"]), vertex("task", Kind.Task, ["end"]),
    vertex("end", Kind.End, [])];
  assert.equal(analyze(graph), undefined);
});

test("cutting a Choice would wrongly admit a cycle before the wait", () => {
  const graph = [vertex("start", Kind.Start, ["merge"]), vertex("merge", Kind.Merge, ["outer"]),
    vertex("outer", Kind.Choice, ["inner", "exit"]), vertex("inner", Kind.Choice, ["merge", "exit"]),
    vertex("exit", Kind.Merge, ["task"]), vertex("task", Kind.Task, ["end"]),
    vertex("end", Kind.End, [])];
  assert.equal(analyze(graph), undefined);
});

test("a reachable closed task cycle fails co-reachability even though every cycle is cut", () => {
  assert.equal(analyze([vertex("start", Kind.Start, ["choice"]),
    vertex("choice", Kind.Choice, ["merge", "end"]), vertex("merge", Kind.Merge, ["task"]),
    vertex("task", Kind.Task, ["merge"]), vertex("end", Kind.End, [])]), undefined);
});

test("disconnected wait cycles fail reachability", () => {
  assert.equal(analyze([...diamond(), vertex("isolatedMerge", Kind.Merge, ["isolatedTask"]),
    vertex("isolatedTask", Kind.Task, ["isolatedChoice"]),
    vertex("isolatedChoice", Kind.Choice, ["isolatedMerge", "isolatedMerge"])]), undefined);
});

test("declaration order and consistent renaming do not select a topology", () => {
  const graph = rework(false);
  const renamed = graph.map((item) => ({ ...item, id: `renamed:${item.id}`,
    outputs: item.outputs.map((id) => `renamed:${id}`) })).reverse();
  assert.deepEqual(analyze(renamed), analyze(graph));
});

test("malformed IDs, references, arities and non-task data reject", () => {
  const graph = diamond();
  const mutations: readonly (readonly MixedTaskControlVertex[])[] = [
    [], graph.filter((item) => item.kind !== Kind.Start),
    graph.filter((item) => item.kind !== Kind.End),
    [...graph, graph[0]!], [...graph, vertex("start", Kind.End, ["missing"])],
    graph.map((item) => item.id === "left" ? { ...item, id: "" } : item),
    graph.map((item) => item.id === "start" ? { ...item, outputs: ["missing"] } : item),
    graph.map((item) => item.id === "start" ? { ...item, outputs: [""] } : item),
    graph.map((item) => item.id === "choice" ? { ...item, outputs: ["left"] } : item),
    graph.map((item) => item.id === "choice" ? { ...item, outputs: ["left", "left", "right"] } : item),
    graph.map((item) => item.id === "reader" ? { ...item, outputs: ["end", "end"] } : item),
    graph.map((item) => item.id === "end" ? { ...item, outputs: ["start"] } : item),
    graph.map((item) => item.id === "start" ? { ...item, reads: ["request"] } : item),
    graph.map((item) => item.id === "merge" ? { ...item, writes: ["request"] } : item),
    [vertex("start", Kind.Start, ["end"]), vertex("end", Kind.End, [])],
    [vertex("start", Kind.Start, ["merge"]), vertex("merge", Kind.Merge, ["task"]),
      vertex("task", Kind.Task, ["end"]), vertex("end", Kind.End, [])],
  ];
  mutations.forEach((mutation, index) => assert.equal(analyze(mutation), undefined, `mutation ${index}`));
});
