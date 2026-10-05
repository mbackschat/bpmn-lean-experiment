import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import { profile, source as sourcePath, prepareSource, sourceOverlay, overlayDocument, parallelBodySource } from "./sequential-scope-source-fixture.ts";
import { CheckedNodeKind, EffectProtocol, isWellFormedSemanticProcessProgram, SemanticProfileId, applyStimulus, initialState,
  StimulusKind, VariableValueKind as Value, CommandOutcome, EffectExecutionResultKind, ControlStateKind, SemanticOperationKind as Op,
  supportsSemanticProcessExecution } from "@bpmn-lean/semantic-core";
const { importBpmnGraph } = await import(new URL("../dist/moddle-adapter.js", import.meta.url).href) as typeof import("../src/moddle-adapter.ts");
const { compileSequentialScopeSource: compile } = await import(new URL("../dist/sequential-scope-source-compiler.js", import.meta.url).href) as typeof import("../src/sequential-scope-source-compiler.ts");
const { lowerCheckedProcess } = await import(new URL("../dist/semantic-process-lowering.js", import.meta.url).href) as typeof import("../src/semantic-process-lowering.ts");
const xml = prepareSource(await readFile(sourcePath, "utf8"));
const overlay = { identity: { id: overlayDocument.id, sha256: sourceOverlay().sha256 }, semanticProfile: profile,
  inertAttributes: overlayDocument.inertAttributes, effectBindings: overlayDocument.effectBindings };
async function source(text: string) {
  const imported = await importBpmnGraph(text, 5000);
  assert.deepEqual(imported.warnings, []);
  return compile(imported.rootElement, { kind: "bpmnSource", id: "private-invoice-source", sha256: createHash("sha256").update(text).digest("hex"),
    byteLength: Buffer.byteLength(text), declaredEncoding: "UTF-8", decodedAs: "UTF-8" }, overlay);
}
const sourceRequest = (text: string) => ({ bytes: new TextEncoder().encode(text), sourceId: "private-invoice-source", expectedSha256: undefined,
  semanticProfile: profile, sourceOverlay: sourceOverlay(), limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 5000 } });

test("private MI dispatch compiles exact bytes through the normal source boundary", async () => {
  const request = sourceRequest(xml);
  const result = await compileBpmnToSemanticProcess(request);
  assert.equal(result.status, BpmnCompilationStatus.Accepted, JSON.stringify(result.diagnostics));
  assert.deepEqual(result.copyExactBytes(), request.bytes);
  assert.equal(result.semanticProcess?.identity.sourceOverlay?.sha256, request.sourceOverlay.sha256);
  assert.equal(isWellFormedSemanticProcessProgram(result.semanticProcess), true);
  const direct = await source(xml);
  assert.deepEqual(result.checkedProcess?.nodes, direct.checkedProcess?.nodes);
  assert.equal((await compileBpmnToSemanticProcess({ ...request, sourceOverlay: null })).status, BpmnCompilationStatus.Rejected);
  assert.equal((await compileBpmnToSemanticProcess({ ...request, expectedSha256: "0".repeat(64) })).status, BpmnCompilationStatus.Rejected);
});

test("private MI byte admission refuses erased loop and completion declarations", async (t) => {
  const loop = xml.match(/<multiInstanceLoopCharacteristics\b[^>]*\/>/u)?.[0];
  assert.ok(loop);
  const condition = loop.replace(/\s*\/>$/u, '><completionCondition>${stop}</completionCondition></multiInstanceLoopCharacteristics>');
  assert.equal((await compileBpmnToSemanticProcess(sourceRequest(xml.replace(loop, condition)))).status, BpmnCompilationStatus.Accepted);
  for (const [label, replacement] of [
    ["duplicate MI declaration", `${loop.replace('isSequential="true"', 'isSequential="false"')}${loop}`],
    ["mixed loop declarations", `<standardLoopCharacteristics/>${loop}`],
    ["duplicate completion condition", condition.replace('</completionCondition>', '</completionCondition><completionCondition>${other}</completionCondition>')],
    ["ambiguous sequential flag", loop.replace('isSequential="true"', 'isSequential="1"')],
  ] as const) {
    await t.test(label, async () => {
      const result = await compileBpmnToSemanticProcess(sourceRequest(xml.replace(loop, replacement)));
      assert.equal(result.status, BpmnCompilationStatus.Rejected);
    });
  }
});

test("private source compiler binds the repeated invoice body without public profile registration", async () => {
  const result = await source(xml);
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.checkedProcess);
  const body = result.checkedProcess.nodes.find(node => node.kind === CheckedNodeKind.SequentialMultiInstanceSubProcess);
  assert.ok(body?.kind === CheckedNodeKind.SequentialMultiInstanceSubProcess);
  assert.equal(body.collectionName, "items");
  assert.equal(body.itemName, "item");
  assert.equal(result.checkedProcess.definitionScopes.length, 2);
  assert.equal(isWellFormedSemanticProcessProgram(lowerCheckedProcess(result.checkedProcess)), true);
  assert.equal((Object.values(SemanticProfileId) as readonly string[]).includes(profile), false);
  assert.ok((await source(xml.replaceAll("ReviewInvoice", "RenamedInvoiceScope"))).checkedProcess);
  assert.ok((await source(xml.replace(">pending<", ">\u00a0pending\u00a0<"))).checkedProcess);
});

test("private admitted invoice process repeats scoped human and Service work and rejects stale completions", async () => {
  const compiled = await source(xml);
  assert.ok(compiled.checkedProcess);
  const program = lowerCheckedProcess(compiled.checkedProcess);
  let step = applyStimulus(program, initialState, { kind: StimulusKind.StartProcess, commandId: "start",
    processId: program.processId, instanceId: "invoices", initialVariables: [{ name: "items", value: { kind: Value.StringList, value: ["A", "B"] } }] });
  assert.equal(step.outcome, CommandOutcome.Committed);
  const originalReview = step.state.userTaskWaits[0]!.id;
  for (const item of ["A", "B"]) {
    assert.equal(step.state.userTaskWaits[0]?.id.elementId, "Review");
    step = applyStimulus(program, step.state, { kind: StimulusKind.CompleteUserTaskInstance, commandId: `review-${item}`,
      taskId: step.state.userTaskWaits[0]!.id, submittedValues: [{ name: "reviewStatus", value: { kind: Value.String, value: "reviewed" } }] });
    assert.equal(step.outcome, CommandOutcome.Committed);
    assert.deepEqual(step.state.variables.activities[0]?.bindings, [
      { name: "payload", value: { kind: Value.String, value: item } },
      { name: "status", value: { kind: Value.String, value: "reviewed" } },
    ]);
    step = applyStimulus(program, step.state, { kind: StimulusKind.CompleteEffect, commandId: `validate-${item}`,
      effectId: step.state.effectWaits[0]!.id, result: { kind: EffectExecutionResultKind.Success,
        localPatch: [{ name: "result", value: { kind: Value.String, value: "accepted" } }] } });
    assert.equal(step.outcome, CommandOutcome.Committed);
    assert.equal(step.state.userTaskWaits[0]?.id.elementId, "Confirm");
    assert.deepEqual(step.state.variables.scopes[0]?.bindings.find(binding => binding.name === "decision")?.value,
      { kind: Value.String, value: "accepted" });
    step = applyStimulus(program, step.state, { kind: StimulusKind.CompleteUserTaskInstance, commandId: `confirm-${item}`,
      taskId: step.state.userTaskWaits[0]!.id, submittedValues: [] });
    assert.equal(step.outcome, CommandOutcome.Committed);
    const stale = applyStimulus(program, step.state, { kind: StimulusKind.CompleteUserTaskInstance, commandId: `stale-${item}`,
      taskId: originalReview, submittedValues: [] });
    assert.equal(stale.outcome, CommandOutcome.Rejected);
    assert.deepEqual(stale.state, step.state);
  }
  assert.equal(step.state.userTaskWaits[0]?.id.elementId, "PublishBatch");
  assert.deepEqual(step.state.variables.scopes, []);
  assert.deepEqual(step.state.sequentialScopeControllers, []);
  const protectedWrite = applyStimulus(program, step.state, { kind: StimulusKind.CompleteUserTaskInstance, commandId: "overwrite-item",
    taskId: step.state.userTaskWaits[0]!.id, submittedValues: [{ name: "item", value: { kind: Value.String, value: "replacement" } }] });
  assert.equal(protectedWrite.outcome, CommandOutcome.Rejected);
  assert.deepEqual(protectedWrite.state, step.state);
  step = applyStimulus(program, step.state, { kind: StimulusKind.CompleteUserTaskInstance, commandId: "publish",
    taskId: step.state.userTaskWaits[0]!.id, submittedValues: [] });
  assert.equal(step.outcome, CommandOutcome.Committed);
  assert.equal(step.state.control.kind, ControlStateKind.Completed);
});

test("Boolean early completion waits for the entire current body and skips remaining items", async () => {
  const conditional = xml.replace('camunda:elementVariable="item" />',
    'camunda:elementVariable="item"><completionCondition>${stop}</completionCondition></multiInstanceLoopCharacteristics>');
  const compiled = await source(conditional);
  assert.ok(compiled.checkedProcess);
  const program = lowerCheckedProcess(compiled.checkedProcess);
  for (const initialStop of [false, true]) {
    let step = applyStimulus(program, initialState, { kind: StimulusKind.StartProcess, commandId: "start",
      processId: program.processId, instanceId: "early", initialVariables: [
        { name: "items", value: { kind: Value.StringList, value: ["A", "B"] } },
        { name: "stop", value: { kind: Value.Boolean, value: initialStop } },
      ] });
    assert.equal(step.outcome, CommandOutcome.Committed);
    assert.equal(step.state.userTaskWaits[0]?.id.elementId, "Review");
    step = applyStimulus(program, step.state, { kind: StimulusKind.CompleteUserTaskInstance, commandId: "stop-after-body",
      taskId: step.state.userTaskWaits[0]!.id, submittedValues: [{ name: "stop", value: { kind: Value.Boolean, value: true } }] });
    assert.equal(step.outcome, CommandOutcome.Committed);
    assert.equal(step.state.effectWaits[0]?.id.elementId, "Validate");
    step = applyStimulus(program, step.state, { kind: StimulusKind.CompleteEffect, commandId: "validate",
      effectId: step.state.effectWaits[0]!.id, result: { kind: EffectExecutionResultKind.Success, localPatch: [{ name: "result", value: { kind: Value.Null } }] } });
    assert.equal(step.outcome, CommandOutcome.Committed);
    assert.equal(step.state.userTaskWaits[0]?.id.elementId, "Confirm");
    step = applyStimulus(program, step.state, { kind: StimulusKind.CompleteUserTaskInstance, commandId: "confirm",
      taskId: step.state.userTaskWaits[0]!.id, submittedValues: [] });
    assert.equal(step.outcome, CommandOutcome.Committed);
    assert.equal(step.state.userTaskWaits[0]?.id.elementId, "PublishBatch");
    assert.deepEqual(step.state.sequentialScopeControllers, []);
  }
});

test("private Program admission rejects malformed mapping wire, missing provenance and missing mixed-body work", async () => {
  const compiled = await source(xml);
  assert.ok(compiled.checkedProcess);
  const program = lowerCheckedProcess(compiled.checkedProcess);
  assert.equal(isWellFormedSemanticProcessProgram(program), true);
  assert.equal(isWellFormedSemanticProcessProgram({ ...program, identity: { ...program.identity, sourceOverlay: null } }), false);
  for (const bodyInputs of [null, [{}], [{ target: "local", expression: { kind: "enclosingVariable", name: 1 } }],
    [{ target: "local", expression: { kind: "stringLiteral", value: "ready", extra: true } }],
    [{ target: "items", expression: { kind: "stringLiteral", value: "ready" } }]]) {
    assert.equal(isWellFormedSemanticProcessProgram({ ...program, operations: program.operations.map(operation =>
      operation.kind === Op.EnterSequentialMultiInstanceScope ? { ...operation, bodyInputs } : operation) }), false);
  }
  assert.equal(isWellFormedSemanticProcessProgram({ ...program, operations: program.operations.map(operation => {
    if (operation.kind === Op.AwaitEffect) return { kind: Op.AwaitUserTask, id: operation.id, origin: operation.origin,
      input: operation.input, output: operation.output, task: { elementId: operation.origin.elementId, name: null } };
    if (operation.kind === Op.AwaitUserTask && operation.task.elementId === "PublishBatch") return {
      kind: Op.AwaitEffect, id: operation.id, origin: operation.origin, input: operation.input, output: operation.output,
      effect: { elementId: operation.origin.elementId, descriptor: { protocol: EffectProtocol.Activity, operation: "publish" },
        inputMappings: [], outputMappings: [] }, bpmnErrorRoute: null };
    return operation;
  }) }), false);
  const start = { kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId, instanceId: "empty",
    initialVariables: [{ name: "items", value: { kind: Value.StringList, value: [] } }] } as const;
  assert.equal(supportsSemanticProcessExecution(start, program), true);
  assert.equal(supportsSemanticProcessExecution({ ...start, initialVariables: [] }, program), false);
  const empty = applyStimulus(program, initialState, start);
  assert.equal(empty.outcome, CommandOutcome.Committed);
  assert.equal(empty.state.userTaskWaits[0]?.id.elementId, "PublishBatch");
  assert.deepEqual(empty.state.activityOccurrences, []);
  assert.deepEqual(empty.state.variables.scopes, []);
});

test("private source compiler rejects control, mapping, scope and extension violations", async () => {
  for (const mutant of [
    xml.replace('isSequential="true"', 'isSequential="false"'),
    xml.replace('name="decision">${result}', 'name="items">${result}'),
    xml.replace('targetRef="Confirm"', 'targetRef="PublishBatch"'),
    xml.replace('camunda:asyncBefore="true" ', ''),
    xml.replace('id="Review" name=', 'id="Review" camunda:asyncAfter="true" name='),
    xml.replace('sourceRef="Confirm" targetRef="ItemEnd"', 'sourceRef="Confirm" targetRef="Review"'),
    xml.replace('<userTask id="Confirm" name="Confirm validation result" />', '<manualTask id="Confirm" />'),
  ]) assert.equal((await source(mutant)).checkedProcess, undefined);
});

function parallelBody(branches: number, separateEnds: boolean): string {
  return parallelBodySource(xml, branches, separateEnds);
}

test("private source compiler admits wider paired and separate-End bodies only within the composed burst bound", async () => {
  for (const separateEnds of [false, true]) {
    const admitted = await source(parallelBody(3, separateEnds));
    assert.deepEqual(admitted.diagnostics, []);
    assert.ok(admitted.checkedProcess);
    assert.equal((await source(parallelBody(7, separateEnds))).checkedProcess, undefined);
  }
  assert.equal((await source(parallelBody(3, false).replace('id="Done0" sourceRef="Branch0" targetRef="Joined"',
    'id="Done0" sourceRef="Branch0" targetRef="Confirm"'))).checkedProcess, undefined);
});
