import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
  userTaskMetadataBindingValid,
} from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome, EffectExecutionResultKind, StimulusKind, VariableValueKind,
  applyStimulus, initialState,
  isWellFormedSemanticProcessProgram, profileAllowsCheckedProcessShape, SemanticOperationKind,
  supportsSemanticProcessExecution,
  projectOpenFlowNodeOccurrences,
  MappingExpressionKind,
} from "@bpmn-lean/semantic-core";
import { compile, protocol, source } from "./serial-business-task-fixture.ts";
import type { CheckedNode, Scenario, SemanticProcessProgram, UserTaskMetadata } from "@bpmn-lean/semantic-core";

function binding(name: string, value: string) {
  return { name, value: { kind: VariableValueKind.String, value } } as const;
}

function eraseMetadata<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (key, item: unknown) => key === "metadata" ? undefined : item)) as T;
}

for (const family of ["serial-business-task-composition", "mixed-task-control-flow", "mixed-task-business-error"]) {
  test(`${family} admits optional complete string metadata with independent checked/IL policy and passive execution`, async () => {
    const root = new URL(`../../../scenarios/${family}/`, import.meta.url);
    const xml = await readFile(new URL("process.bpmn", root), "utf8");
    const overlayBytes = new Uint8Array(await readFile(new URL("source-overlay.json", root)));
    const overlay = JSON.parse(new TextDecoder().decode(overlayBytes)) as { id: string; semanticProfile: string };
    const scenario = JSON.parse(await readFile(new URL("scenario.json", root), "utf8")) as Scenario;
    const compileSelected = (text: string) => compileBpmnToSemanticProcess({
      bytes: new TextEncoder().encode(text), sourceId: scenario.bpmn.id, expectedSha256: undefined,
      semanticProfile: overlay.semanticProfile,
      sourceOverlay: { id: overlay.id, bytes: overlayBytes, sha256: createHash("sha256").update(overlayBytes).digest("hex") },
      limits: { maxBytes: 1_048_576, parserDeadlineMs: 1_000 },
    });
    const baseline = await compileSelected(xml);
    assert.equal(baseline.status, BpmnCompilationStatus.Accepted);
    if (baseline.status !== BpmnCompilationStatus.Accepted) throw new Error("Metadata-free business source rejected");
    const annotate = (key = "request", type = "string", firstOnly = false) => {
      let index = 0;
      return xml.replace(/<userTask\b([^>]*?)\s*\/>/gu, (original, attributes: string) => {
        if (firstOnly && index++ > 0) return original;
        const id = /\bid="([^"]+)"/u.exec(attributes)?.[1];
        assert.ok(id);
        return `<userTask${attributes} camunda:candidateGroups="group_${id}"><extensionElements><camunda:formData><camunda:formField id="${key}" type="${type}"/></camunda:formData></extensionElements></userTask>`;
      });
    };
    const compiled = await compileSelected(annotate());
    assert.equal(compiled.status, BpmnCompilationStatus.Accepted, JSON.stringify(compiled.diagnostics));
    if (compiled.status !== BpmnCompilationStatus.Accepted) throw new Error("Metadata-bearing business source rejected");
    const { checkedProcess, semanticProcess: program } = compiled;
    assert.deepEqual(eraseMetadata(checkedProcess.nodes), baseline.checkedProcess.nodes);
    assert.deepEqual(eraseMetadata(program.operations), baseline.semanticProcess.operations);
    assert.ok(baseline.checkedProcess.nodes.every(node => !Object.hasOwn(node, "metadata")));
    assert.equal((await compileSelected(annotate("request", "string", true))).status, BpmnCompilationStatus.Accepted);
    const handlers = program.operations.flatMap(item => item.kind === SemanticOperationKind.AwaitEffect ? [item.effect.descriptor.operation] : []);
    for (const bad of [annotate("request", "boolean"), annotate("execution"), ...handlers.map(handler => annotate(handler)),
      annotate().replace(/<extensionElements>[\s\S]*?<\/extensionElements>/u, ''),
      annotate().replace('camunda:candidateGroups="group_Review"', 'camunda:candidateGroups="group_Review" xmlns:other="http://camunda.org/schema/1.0/bpmn" other:candidateGroups="other"'),
      annotate().replace('camunda:candidateGroups="group_Review"', 'xmlns:wrong="urn:wrong" wrong:candidateGroups="group_Review"'),
      annotate().replace('camunda:candidateGroups="group_Review"', '')]) {
      assert.equal((await compileSelected(bad)).status, BpmnCompilationStatus.Rejected);
    }
    const changedNodes = (metadata: UserTaskMetadata) => checkedProcess.nodes.map(node => node.kind === "userTask" ? { ...node, metadata } : node);
    const changedProgram = (metadata: UserTaskMetadata): SemanticProcessProgram => ({ ...program,
      operations: program.operations.map(item => item.kind === SemanticOperationKind.AwaitUserTask ? { ...item, task: { ...item.task, metadata } } : item) });
    const metadata = { assignment: { candidates: [{ kind: "group", id: "reviewers" }] }, form: { fields: [{ key: "request", type: "string" }] } } as const;
    for (const [selected, admitted] of [
      [metadata, true],
      [{ ...metadata, form: { fields: [{ key: "request", type: "boolean" }] } }, false],
      [{ assignment: metadata.assignment }, false],
      ...["execution", ...handlers].map(key => [{ ...metadata, form: { fields: [{ key, type: "string" }] } }, false]),
      [null, false], [undefined, false],
    ] as const) {
      assert.equal(profileAllowsCheckedProcessShape(overlay.semanticProfile, changedNodes(selected as UserTaskMetadata), 1), admitted);
      assert.equal(isWellFormedSemanticProcessProgram(changedProgram(selected as UserTaskMetadata)), admitted);
    }
    const dropped: SemanticProcessProgram = { ...program, operations: program.operations.map((item, index) =>
      item.kind === SemanticOperationKind.AwaitUserTask && index === program.operations.findIndex(op => op.kind === SemanticOperationKind.AwaitUserTask)
        ? { ...item, task: eraseMetadata(item.task) } : item) };
    assert.equal(userTaskMetadataBindingValid(checkedProcess, dropped), false);
    const waits = program.operations.filter(item => item.kind === SemanticOperationKind.AwaitUserTask);
    assert.ok(waits.length >= 2);
    const swapped: SemanticProcessProgram = { ...program, operations: program.operations.map(item => {
      if (item.kind !== SemanticOperationKind.AwaitUserTask) return item;
      return item === waits[0] ? { ...item, task: { ...item.task, metadata: waits[1]!.task.metadata! } } : item === waits[1]
        ? { ...item, task: { ...item.task, metadata: waits[0]!.task.metadata! } } : item;
    }) };
    assert.equal(userTaskMetadataBindingValid(checkedProcess, swapped), false);
    let state = initialState;
    let erasedState = initialState;
    const erasedProgram = eraseMetadata(program);
    for (const stimulus of scenario.stimuli) {
      const result = applyStimulus(program, state, stimulus);
      const erased = applyStimulus(erasedProgram, erasedState, stimulus);
      assert.equal(result.outcome, CommandOutcome.Committed, stimulus.commandId);
      assert.equal(erased.outcome, result.outcome);
      state = result.state;
      erasedState = erased.state;
      assert.deepEqual(eraseMetadata(state), erasedState, stimulus.commandId);
      for (const wait of state.userTaskWaits) {
        const operation = waits.find(item => item.task.elementId === wait.id.elementId);
        assert.deepEqual(wait.metadata, operation?.task.metadata);
      }
      if (stimulus.kind === StimulusKind.CompleteUserTaskInstance) {
        const stale = applyStimulus(program, state, { ...stimulus, commandId: `stale-${stimulus.commandId}` });
        assert.equal(stale.outcome, CommandOutcome.Rejected);
        assert.deepEqual(stale.state, state);
      }
    }
    assert.equal(state.control.kind, "completed");
  });
}

for (const reversed of [false, true]) {
  test(`human/service handoff reads enclosing inputs with reversed mappings=${reversed}`, async () => {
    let xml = await readFile(source, "utf8");
    if (reversed) {
      const pair = /(<camunda:inputParameter name="payload">.*?<\/camunda:inputParameter>)(\s*)(<camunda:inputParameter name="echo">.*?<\/camunda:inputParameter>)/u;
      assert.ok(pair.test(xml));
      xml = xml.replace(pair, "$3$2$1");
    }
    const compiled = await compile(xml);
    assert.equal(compiled.status, BpmnCompilationStatus.Accepted, JSON.stringify(compiled.diagnostics));
    if (compiled.status !== BpmnCompilationStatus.Accepted) return;
    const program = compiled.semanticProcess;
    assert.equal(isWellFormedSemanticProcessProgram(program), true);
    const started = applyStimulus(program, initialState, {
      kind: StimulusKind.StartProcess, commandId: "start", instanceId: "invoice-1",
      processId: "Process_InvoiceValidation",
      initialVariables: [binding("payload", "parent-payload"), binding("request", "initial"), binding("result", "parent-result")],
    });
    assert.equal(started.outcome, CommandOutcome.Committed);
    assert.deepEqual(started.state.userTaskWaits.map(wait => wait.id.elementId), ["Review"]);
    const reviewed = applyStimulus(program, started.state, {
      kind: StimulusKind.CompleteUserTaskInstance, commandId: "review",
      taskId: { processInstanceId: "invoice-1", elementId: "Review", activation: 1 },
      submittedValues: [binding("request", "reviewed-invoice")],
    });
    assert.equal(reviewed.outcome, CommandOutcome.Committed);
    assert.equal(reviewed.state.effectWaits.length, 1);
    const effect = reviewed.state.effectWaits[0]!;
    assert.equal(effect.id.elementId, "Validate");
    assert.deepEqual(effect.descriptor, { protocol, operation: "invoiceValidator" });
    assert.deepEqual(effect.arguments, [binding("echo", "parent-payload"), binding("payload", "reviewed-invoice")]);
    const changedContext = { ...reviewed.state, variables: { ...reviewed.state.variables, process: { bindings:
      reviewed.state.variables.process.bindings.map(value => value.name === "request" ? binding("request", "later-context") : value),
    } } };
    assert.notEqual(projectOpenFlowNodeOccurrences(program, changedContext), null);
    assert.equal(projectOpenFlowNodeOccurrences(program, { ...reviewed.state, variables: { ...reviewed.state.variables, activities:
      [...reviewed.state.variables.activities, ...reviewed.state.variables.activities],
    } }), null);
    assert.equal(projectOpenFlowNodeOccurrences(program, { ...reviewed.state, effectWaits: [{ ...effect, arguments: [] }] }), null);
    const completion = {
      kind: StimulusKind.CompleteEffect, commandId: "validate", effectId: effect.id,
      result: { kind: EffectExecutionResultKind.Success, localPatch: [binding("result", "approved")] },
    } as const;
    const malformed = applyStimulus(program, reviewed.state, {
      ...completion, commandId: "wrong-result-name",
      result: { ...completion.result, localPatch: [binding("decision", "approved")] },
    });
    assert.equal(malformed.outcome, CommandOutcome.Rejected);
    assert.deepEqual(malformed.state, reviewed.state);
    const validated = applyStimulus(program, reviewed.state, completion);
    assert.equal(validated.outcome, CommandOutcome.Committed);
    assert.deepEqual(validated.state.variables.process.bindings, [
      binding("decision", "approved"), binding("payload", "parent-payload"),
      binding("request", "reviewed-invoice"), binding("result", "parent-result"),
    ]);
    assert.deepEqual(validated.state.effectWaits, []);
    assert.deepEqual(validated.state.variables.activities, []);
    assert.deepEqual(validated.state.userTaskWaits.map(wait => wait.id.elementId), ["Finalize"]);
    const stale = applyStimulus(program, validated.state, { ...completion, commandId: "stale-validation" });
    assert.equal(stale.outcome, CommandOutcome.Rejected);
    assert.deepEqual(stale.state, validated.state);
    const final = applyStimulus(program, validated.state, {
      kind: StimulusKind.CompleteUserTaskInstance, commandId: "finalize",
      taskId: { processInstanceId: "invoice-1", elementId: "Finalize", activation: 1 }, submittedValues: [],
    });
    assert.equal(final.outcome, CommandOutcome.Committed);
    assert.equal(final.state.control.kind, "completed");
  });
}

test("reserved CIB context tokens cannot bind a business handler", async () => {
  const xml = await readFile(source, "utf8");
  assert.equal((await compile(xml)).status, BpmnCompilationStatus.Accepted);
  for (const handler of ["execution", "authenticatedUserId"]) {
    const rejected = await compile(xml.replace("${invoiceValidator}", `\${${handler}}`), handler);
    assert.equal(rejected.status, BpmnCompilationStatus.Rejected, handler);
  }
});

test("source admission refuses unbound execution, ambiguous mappings and nonserial topology", async () => {
  const xml = await readFile(source, "utf8");
  for (const [name, changed] of [
    ["synchronous delegate", xml.replace('camunda:asyncBefore="true"', '')],
    ["trailing async", xml.replace('camunda:asyncBefore="true"', 'camunda:asyncBefore="true" camunda:asyncAfter="true"')],
    ["unknown handler", xml.replace("${invoiceValidator}", "${anotherHandler}")],
    ["handler shadowing", xml.replace('name="payload">${request}', 'name="invoiceValidator">${request}')],
    ["duplicate input target", xml.replace('name="echo">', 'name="payload">')],
    ["blank literal", xml.replace('${request}', '   ')],
    ["nested expression", xml.replace('${request}', '${request.value}')],
    ["disconnected task", xml.replace('<endEvent', '<userTask id="Unused"/><endEvent')],
    ["branch", xml.replace('</process>', '<sequenceFlow id="Branch" sourceRef="Review" targetRef="End"/></process>')],
    ["cycle", xml.replace('sourceRef="Finalize" targetRef="End"', 'sourceRef="Finalize" targetRef="Review"')],
  ]) {
    assert.equal((await compile(changed!)).status, BpmnCompilationStatus.Rejected, name);
  }
});

test("checked and IL admission reject reserved handlers independently of source", async () => {
  const compiled = await compile(await readFile(source, "utf8"));
  assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
  if (compiled.status !== BpmnCompilationStatus.Accepted) return;
  for (const operation of ["execution", "authenticatedUserId"]) {
    const changed: SemanticProcessProgram = { ...compiled.semanticProcess, operations: compiled.semanticProcess.operations.map(item => item.kind === SemanticOperationKind.AwaitEffect ?
      { ...item, effect: { ...item.effect, descriptor: { ...item.effect.descriptor, operation } } } : item) };
    assert.equal(isWellFormedSemanticProcessProgram(changed), false);
    const nodes: readonly CheckedNode[] = compiled.checkedProcess.nodes.map(node => node.kind === "serviceTask" ? { ...node, descriptor: { ...node.descriptor, operation } } : node);
    assert.equal(profileAllowsCheckedProcessShape(compiled.semanticProcess.identity.semanticProfile, nodes, 1), false);
  }
});

test("start requires every enclosing input, while present null and canonical human patches are admitted", async () => {
  const compiled = await compile(await readFile(source, "utf8"));
  assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
  if (compiled.status !== BpmnCompilationStatus.Accepted) return;
  const program = compiled.semanticProcess;
  const start = { kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId, instanceId: "invoice", initialVariables: [binding("payload", "parent")] } as const;
  assert.equal(supportsSemanticProcessExecution(start, program), false);
  assert.equal(applyStimulus(program, initialState, start).outcome, CommandOutcome.Rejected);
  const valid = { ...start, initialVariables: [...start.initialVariables, { name: "request", value: { kind: VariableValueKind.Null } } as const] };
  assert.equal(supportsSemanticProcessExecution(valid, program), true);
  const state = applyStimulus(program, initialState, valid).state;
  const shadowed = applyStimulus(program, state, { kind: StimulusKind.CompleteUserTaskInstance, commandId: "shadow", taskId: state.userTaskWaits[0]!.id, submittedValues: [binding("invoiceValidator", "shadow")] });
  assert.equal(shadowed.outcome, CommandOutcome.Rejected);
  assert.deepEqual(shadowed.state, state);
});

test("raw IL literal mappings preserve the existing Unicode scalar wire boundary", async () => {
  const compiled = await compile(await readFile(source, "utf8"));
  assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
  if (compiled.status !== BpmnCompilationStatus.Accepted) return;
  const verdicts = ["\ud800", "suffix\udfff"].map(value => {
    const program: SemanticProcessProgram = { ...compiled.semanticProcess, operations: compiled.semanticProcess.operations.map(item => item.kind === SemanticOperationKind.AwaitEffect ?
      { ...item, effect: { ...item.effect, inputMappings: [{ target: "payload", expression: { kind: MappingExpressionKind.StringLiteral, value } }] } } : item) };
    return isWellFormedSemanticProcessProgram(program);
  });
  assert.deepEqual(verdicts, [false, false]);
});
