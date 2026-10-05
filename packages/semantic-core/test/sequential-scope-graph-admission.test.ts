import assert from "node:assert/strict";
import { test } from "node:test";
import { SemanticOperationKind as Kind, SemanticOriginKind, SemanticProfileId,
  isWellFormedSemanticProcessGraph } from "@bpmn-lean/semantic-core";
import type { SemanticOperation } from "@bpmn-lean/semantic-core";
import type { SemanticProcessGraph } from "../src/semantic-process-graph-admission.ts";

for (const [label, entryKind, completionKind] of [
  ["sequential", Kind.EnterSequentialMultiInstanceScope, Kind.CompleteSequentialMultiInstanceScope],
  ["parallel", Kind.EnterParallelMultiInstanceScope, Kind.CompleteParallelMultiInstanceScope],
] as const) {
  const origin = (elementId: string) => ({ kind: SemanticOriginKind.BpmnElement, elementId } as const);
  const operations: SemanticOperation[] = [
    { id: "start", kind: Kind.Initiate, origin: origin("Start"), output: "incoming" },
    { id: "enter", kind: entryKind, origin: origin("Batch"),
      input: "incoming", childEntry: "body-in", childScopeId: "body", normalOutput: "outgoing",
      collectionName: "items", itemName: "item", bodyInputs: [], completionBooleanName: null },
    { id: "task", kind: Kind.AwaitUserTask, origin: origin("Review"), input: "body-in", output: "body-out",
      task: { elementId: "Review", name: null } },
    { id: "child-end", kind: Kind.ReachNoneEnd, origin: origin("ChildEnd"), input: "body-out" },
    { id: "complete", kind: completionKind, origin: origin("Batch"), entryOperationId: "enter" },
    { id: "end", kind: Kind.ReachNoneEnd, origin: origin("End"), input: "outgoing" },
    { id: "root-complete", kind: Kind.CompleteScope, origin: origin("P"), scopeId: "root", parentOutput: null },
  ];
  const graph: SemanticProcessGraph = {
    semanticProfile: SemanticProfileId.EmbeddedSubProcessCompletion,
    processId: "P",
    definitionScopes: [{ id: "root", parentScopeId: null, originElementId: "P" },
      { id: "body", parentScopeId: "root", originElementId: "Batch" }],
    controlPlaceIds: ["incoming", "outgoing", "body-in", "body-out"],
    controlPlaceScopes: ["incoming", "outgoing", "body-in", "body-out"].map((controlPlaceId) =>
      ({ controlPlaceId, scopeId: controlPlaceId.startsWith("body-") ? "body" : "root" })),
    operationScopes: operations.map(({ id }) => ({ operationId: id,
      scopeId: ["task", "child-end", "complete"].includes(id) ? "body" : "root" })),
    operations,
  };
  const change = (id: string, patch: object): SemanticProcessGraph => ({ ...graph,
    operations: graph.operations.map((operation) => operation.id === id ? { ...operation, ...patch } : operation) });

  test(`${label}: repeated scope graph binds one child completion to its parent entry and continuation`, () => {
    assert.equal(isWellFormedSemanticProcessGraph(graph), true);
    assert.equal(isWellFormedSemanticProcessGraph({ ...graph, operations: [...graph.operations].reverse() }), true);
  });

  test(`${label}: repeated scope graph refuses aliases, ownership escape, missing pairs and competing completion`, () => {
    const candidates: SemanticProcessGraph[] = [
      change("complete", { entryOperationId: "start" }),
      change("complete", { origin: origin("DifferentBatch") }),
      change("enter", { normalOutput: "body-out" }),
      change("enter", { childEntry: "incoming" }),
      change("enter", { childScopeId: "root" }),
      { ...graph, operationScopes: graph.operationScopes.map((entry) =>
        entry.operationId === "complete" ? { ...entry, scopeId: "root" } : entry) },
      { ...graph, operations: graph.operations.filter(({ id }) => id !== "complete"),
        operationScopes: graph.operationScopes.filter(({ operationId }) => operationId !== "complete") },
      { ...graph, operations: [...graph.operations, { id: "ordinary", kind: Kind.CompleteScope,
        origin: origin("Batch"), scopeId: "body", parentOutput: "outgoing" }],
        operationScopes: [...graph.operationScopes, { operationId: "ordinary", scopeId: "body" }] },
      { ...graph, operations: [...graph.operations, { ...graph.operations[4]!, id: "duplicate" }],
        operationScopes: [...graph.operationScopes, { operationId: "duplicate", scopeId: "body" }] },
    ];
    for (const candidate of candidates) assert.equal(isWellFormedSemanticProcessGraph(candidate), false);
  });

  test(`${label}: repeated scope identity cannot also declare a Task`, () => {
    assert.equal(isWellFormedSemanticProcessGraph(change("task", {
      origin: origin("Batch"), task: { elementId: "Batch", name: null },
    })), false);
  });

  test(`${label}: repeated scope identity cannot also declare an End Event`, () => {
    assert.equal(isWellFormedSemanticProcessGraph(change("end", { origin: origin("Batch") })), false);
  });

  test(`${label}: completion cannot bind the other repetition family`, () => {
    assert.equal(isWellFormedSemanticProcessGraph(change("complete", {
      kind: completionKind === Kind.CompleteSequentialMultiInstanceScope
        ? Kind.CompleteParallelMultiInstanceScope : Kind.CompleteSequentialMultiInstanceScope,
    })), false);
  });
}
