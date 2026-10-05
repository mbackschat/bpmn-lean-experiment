import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { Ajv2020 } from "ajv/dist/2020.js";
import { CheckedNodeKind, SemanticOperationKind as Kind, SemanticProfileId, MappingExpressionKind, StimulusKind, supportsSemanticProcessExecution } from "@bpmn-lean/semantic-core";
import type { CheckedProcess } from "@bpmn-lean/semantic-core";
import { compileSemanticProcessFixture } from "./semantic-process-compilation-test-support.ts";

const { isWellFormedSemanticProcessGraph } = await import(new URL("../../semantic-core/dist/semantic-process-graph-admission.js", import.meta.url).href) as typeof import("../../semantic-core/src/semantic-process-graph-admission.ts");

const { profileAllowsProgramShape } = await import(new URL("../../semantic-core/dist/semantic-process-profile.js", import.meta.url).href) as typeof import("../../semantic-core/src/semantic-process-profile.ts");

const { lowerCheckedProcess } = await import(new URL("../dist/semantic-process-lowering.js", import.meta.url).href) as typeof import("../src/semantic-process-lowering.ts");

for (const [nodeKind, entryKind, completionKind] of [
  [CheckedNodeKind.SequentialMultiInstanceSubProcess, Kind.EnterSequentialMultiInstanceScope, Kind.CompleteSequentialMultiInstanceScope],
  [CheckedNodeKind.ParallelMultiInstanceSubProcess, Kind.EnterParallelMultiInstanceScope, Kind.CompleteParallelMultiInstanceScope],
] as const) test(`private ${nodeKind} lowering binds its sole completion and preserves body data`, async () => {
  const compiled = await compileSemanticProcessFixture(
    new URL("../../../scenarios/embedded-subprocess-completion/process.bpmn", import.meta.url),
    "repeated-scope-lowering", SemanticProfileId.EmbeddedSubProcessCompletion,
  );
  const node = compiled.checkedProcess.nodes.find(({ kind }) => kind === CheckedNodeKind.EmbeddedSubProcess);
  assert.ok(node?.kind === CheckedNodeKind.EmbeddedSubProcess);
  const source: CheckedProcess = { ...compiled.checkedProcess,
    nodes: compiled.checkedProcess.nodes.map((candidate) => candidate !== node ? candidate : {
      kind: nodeKind, id: node.id, childScopeId: node.childScopeId,
      collectionName: "invoices", itemName: "invoice",
      bodyInputs: [{ target: "local", expression: { kind: MappingExpressionKind.EnclosingVariable, name: "seed" } }], completionBooleanName: "done",
    }),
  };
  const program = lowerCheckedProcess(source);
  const entry = program.operations.find(({ kind }) => kind === entryKind);
  assert.ok(entry?.kind === entryKind);
  assert.equal(entry.origin.elementId, node.id);
  assert.equal(entry.childScopeId, node.childScopeId);
  assert.equal(entry.collectionName, "invoices");
  assert.equal(entry.itemName, "invoice");
  assert.equal(entry.completionBooleanName, "done");
  assert.deepEqual(entry.bodyInputs, [{ target: "local", expression: { kind: MappingExpressionKind.EnclosingVariable, name: "seed" } }]);
  const completions = program.operations.filter(({ kind }) => kind === completionKind);
  assert.equal(completions.length, 1);
  const completion = completions[0]!;
  assert.ok(completion.kind === completionKind);
  assert.equal(completion.entryOperationId, entry.id);
  assert.equal(program.operationScopes.find(({ operationId }) => operationId === completion.id)?.scopeId, node.childScopeId);
  assert.equal(program.operations.some((operation) => operation.kind === Kind.CompleteScope && operation.scopeId === node.childScopeId), false);
  assert.deepEqual(lowerCheckedProcess({ ...source, nodes: [...source.nodes].reverse() }), program);
  assert.equal(isWellFormedSemanticProcessGraph({ ...program, semanticProfile: program.identity.semanticProfile,
    controlPlaceIds: program.controlPlaces.map(place => place.id) }), true);
  assert.equal(supportsSemanticProcessExecution({ kind: StimulusKind.StartProcess, commandId: "start",
    instanceId: "batch", processId: program.processId, initialVariables: [] }, program), false, "transport recognition cannot widen the old profile");
  assert.equal(profileAllowsProgramShape(program.identity.semanticProfile, program.operations, program.definitionScopes.length), false);
  const schema = JSON.parse(await readFile(new URL("../../../contracts/schemas/checked-process.schema.json", import.meta.url), "utf8"));
  const validate = new Ajv2020({ strict: true }).compile<CheckedProcess>(schema);
  assert.equal(validate(source), true, JSON.stringify(validate.errors));
  const mutations: readonly unknown[] = [
    { ...source.nodes.find(candidate => candidate.id === node.id), collectionName: "" },
    { ...source.nodes.find(candidate => candidate.id === node.id), isSequential: true },
  ];
  for (const mutation of mutations) assert.equal(validate({ ...source, nodes: source.nodes.map((candidate): unknown => candidate.id === node.id ? mutation : candidate) }), false);
});
