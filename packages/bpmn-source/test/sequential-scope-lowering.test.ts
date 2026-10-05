import assert from "node:assert/strict";
import { test } from "node:test";
import { CheckedNodeKind, SemanticOperationKind as Kind, SemanticProfileId } from "@bpmn-lean/semantic-core";
import type { CheckedProcess } from "@bpmn-lean/semantic-core";
import { compileSemanticProcessFixture } from "./semantic-process-compilation-test-support.ts";

const { lowerCheckedProcess } = await import(new URL("../dist/semantic-process-lowering.js", import.meta.url).href) as typeof import("../src/semantic-process-lowering.ts");

test("private checked MI scope lowering binds its sole completion to the entry and preserves body data", async () => {
  const compiled = await compileSemanticProcessFixture(
    new URL("../../../scenarios/embedded-subprocess-completion/process.bpmn", import.meta.url),
    "repeated-scope-lowering", SemanticProfileId.EmbeddedSubProcessCompletion,
  );
  const node = compiled.checkedProcess.nodes.find(({ kind }) => kind === CheckedNodeKind.EmbeddedSubProcess);
  assert.ok(node?.kind === CheckedNodeKind.EmbeddedSubProcess);
  const source: CheckedProcess = { ...compiled.checkedProcess,
    nodes: compiled.checkedProcess.nodes.map((candidate) => candidate !== node ? candidate : {
      kind: CheckedNodeKind.SequentialMultiInstanceSubProcess, id: node.id, childScopeId: node.childScopeId,
      collectionName: "invoices", itemName: "invoice", bodyInputs: [], completionBooleanName: "done",
    }),
  };
  const program = lowerCheckedProcess(source);
  const entry = program.operations.find(({ kind }) => kind === Kind.EnterSequentialMultiInstanceScope);
  assert.ok(entry?.kind === Kind.EnterSequentialMultiInstanceScope);
  assert.equal(entry.origin.elementId, node.id);
  assert.equal(entry.childScopeId, node.childScopeId);
  assert.equal(entry.collectionName, "invoices");
  assert.equal(entry.itemName, "invoice");
  assert.equal(entry.completionBooleanName, "done");
  assert.deepEqual(entry.bodyInputs, []);
  const completions = program.operations.filter(({ kind }) => kind === Kind.CompleteSequentialMultiInstanceScope);
  assert.equal(completions.length, 1);
  const completion = completions[0]!;
  assert.ok(completion.kind === Kind.CompleteSequentialMultiInstanceScope);
  assert.equal(completion.entryOperationId, entry.id);
  assert.equal(program.operationScopes.find(({ operationId }) => operationId === completion.id)?.scopeId, node.childScopeId);
  assert.equal(program.operations.some((operation) => operation.kind === Kind.CompleteScope && operation.scopeId === node.childScopeId), false);
  assert.deepEqual(lowerCheckedProcess({ ...source, nodes: [...source.nodes].reverse() }), program);
});
