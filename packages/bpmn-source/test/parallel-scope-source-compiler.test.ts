import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import { CheckedNodeKind as Node, SemanticOperationKind as Op, isWellFormedSemanticProcessProgram } from "@bpmn-lean/semantic-core";
import { source, prepareSource, overlayDocument, parallelBodySource } from "./sequential-scope-source-fixture.ts";

const { importBpmnGraph } = await import(new URL("../dist/moddle-adapter.js", import.meta.url).href) as typeof import("../src/moddle-adapter.ts");
const compiler = await import(new URL("../dist/multi-instance-scope-source-compiler.js", import.meta.url).href) as typeof import("../src/multi-instance-scope-source-compiler.ts");
const { lowerCheckedProcess } = await import(new URL("../dist/semantic-process-lowering.js", import.meta.url).href) as typeof import("../src/semantic-process-lowering.ts");
const profile = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft";
const xml = prepareSource(await readFile(source, "utf8")).replace('isSequential="true"', 'isSequential="false"');
const overlay = { identity: { id: "parallel-invoice-bindings", sha256: "private-source-witness" },
  semanticProfile: profile, inertAttributes: [], effectBindings: overlayDocument.effectBindings };
async function compile(text: string, selectedOverlay = overlay) {
  assert.equal(typeof compiler.compileParallelScopeSource, "function");
  const imported = await importBpmnGraph(text, 5000);
  assert.deepEqual(imported.warnings, []);
  return compiler.compileParallelScopeSource(imported.rootElement, { kind: "bpmnSource", id: "parallel-invoices",
    sha256: createHash("sha256").update(text).digest("hex"), byteLength: Buffer.byteLength(text),
    declaredEncoding: "UTF-8", decodedAs: "UTF-8" }, selectedOverlay);
}

test("private parallel source compilation retains data and paired scope identity without runtime admission", async () => {
  for (const text of [xml, xml.replace('isSequential="false"', ''), xml.replaceAll("ReviewInvoice", "ApplicantChecks"),
    parallelBodySource(xml, 9, false), parallelBodySource(xml, 9, true)]) {
    const result = await compile(text);
    assert.deepEqual(result.diagnostics, []);
    assert.ok(result.checkedProcess);
    const node = result.checkedProcess.nodes.find((node) => node.kind === Node.ParallelMultiInstanceSubProcess);
    assert.ok(node);
    assert.equal(node.collectionName, "items");
    assert.equal(node.itemName, "item");
    const program = lowerCheckedProcess(result.checkedProcess);
    const entry = program.operations.find(operation => operation.kind === Op.EnterParallelMultiInstanceScope);
    assert.ok(entry?.kind === Op.EnterParallelMultiInstanceScope);
    assert.deepEqual(entry.bodyInputs, node.bodyInputs);
    assert.equal(program.operations.filter(operation => operation.kind === Op.CompleteParallelMultiInstanceScope).length, 1);
    assert.equal(isWellFormedSemanticProcessProgram(program), false);
  }
});

test("private parallel source compiler rejects wrong mode, graph, data, and binding profiles", async () => {
  for (const text of [xml.replace('isSequential="false"', 'isSequential="true"'),
    xml.replace('name="decision">${result}', 'name="items">${result}'),
    xml.replace('targetRef="Confirm"', 'targetRef="PublishBatch"'),
    xml.replace('camunda:asyncBefore="true" ', ''),
    xml.replace('sourceRef="Confirm" targetRef="ItemEnd"', 'sourceRef="Confirm" targetRef="Review"'),
    xml.replace('<userTask id="Confirm" name="Confirm validation result" />', '<manualTask id="Confirm" />'),
    parallelBodySource(xml, 3, false).replace('id="Done0" sourceRef="Branch0" targetRef="Joined"',
      'id="Done0" sourceRef="Branch0" targetRef="Confirm"')]) {
    assert.equal((await compile(text)).checkedProcess, undefined);
  }
  assert.equal((await compile(xml, { ...overlay, semanticProfile: "wrong-profile" })).checkedProcess, undefined);
});

test("private parallel source operation ceiling accepts 1024 and rejects 1025 without a runtime claim", async () => {
  const baseline = await compile(xml);
  assert.ok(baseline.checkedProcess);
  const count = lowerCheckedProcess(baseline.checkedProcess).operations.length;
  function withParentTasks(extra: number): string {
    const chain = Array.from({ length: extra }, (_, index) =>
      `<userTask id="Preparation${index}"/><sequenceFlow id="Prepared${index}" sourceRef="Preparation${index}" targetRef="${index + 1 === extra ? "ReviewInvoice" : `Preparation${index + 1}`}"/>`).join("");
    return xml.replace('sourceRef="Start" targetRef="ReviewInvoice"', 'sourceRef="Start" targetRef="Preparation0"')
      .replace('</process>', `${chain}</process>`);
  }
  const maximum = await compile(withParentTasks(1024 - count));
  assert.ok(maximum.checkedProcess);
  assert.equal(lowerCheckedProcess(maximum.checkedProcess).operations.length, 1024);
  assert.equal((await compile(withParentTasks(1025 - count))).checkedProcess, undefined);
});

test("public byte compilation refuses the private parallel candidate", async () => {
  const bytes = new TextEncoder().encode(JSON.stringify({ ...overlayDocument, semanticProfile: profile }));
  for (const sourceOverlay of [null, { id: overlayDocument.id, bytes, sha256: createHash("sha256").update(bytes).digest("hex") }]) {
    const result = await compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(xml), sourceId: "parallel-invoices",
      expectedSha256: undefined, semanticProfile: profile, sourceOverlay,
      limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 5000 } });
    assert.equal(result.status, BpmnCompilationStatus.Rejected);
  }
});
