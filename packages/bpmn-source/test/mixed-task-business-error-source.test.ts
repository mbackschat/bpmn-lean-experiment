import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BpmnCompilationStatus } from "@bpmn-lean/bpmn-source";
import { CheckedNodeKind, CommandOutcome, EffectExecutionResultKind, SemanticOperationKind, SemanticOriginKind,
  StimulusKind, VariableValueKind, applyStimulus, initialState } from "@bpmn-lean/semantic-core";
import type { VariableBinding } from "@bpmn-lean/semantic-core";
import { invoiceWithBurst } from "./mixed-task-control-flow-fixture.ts";
import { compile, source } from "./mixed-task-business-error-fixture.ts";

const xml = await readFile(source, "utf8");
const scalar = (name: string, value: string): VariableBinding => ({ name, value: { kind: VariableValueKind.String, value } });

async function accepted(source = xml) {
  const result = await compile(source);
  assert.equal(result.status, BpmnCompilationStatus.Accepted, JSON.stringify(result.diagnostics));
  if (result.status !== BpmnCompilationStatus.Accepted) throw new Error("Expected business Error source admission");
  return result;
}

test("source admission retains shared Error identity and exact task-owned lowering", async () => {
  const result = await accepted();
  for (const [taskId, boundaryEventId, errorDefinitionId, flowId] of [
    ["Validate", "InvalidInvoice", "CatchInvalidInvoice", "CorrectInvoice"],
    ["Authorize", "PolicyRefusal", "CatchPolicyRefusal", "CorrectPolicy"],
  ]) {
    const node = result.checkedProcess.nodes.find(node => node.id === taskId);
    assert.equal(node?.kind, CheckedNodeKind.ServiceTask);
    if (node?.kind !== CheckedNodeKind.ServiceTask) throw new Error("Expected Service Task");
    assert.deepEqual(node.bpmnErrorRoute, { boundaryEventId, boundaryEventName: null, attachedToRef: taskId,
      errorDefinitionId, errorElementId: "ReviewRequired", errorName: "Invoice requires correction", code: "REVIEW_REQUIRED", outputFlowId: flowId });
    const operation = result.semanticProcess.operations.find(operation => operation.kind === SemanticOperationKind.AwaitEffect && operation.effect.elementId === taskId);
    if (operation?.kind !== SemanticOperationKind.AwaitEffect) throw new Error("Expected effect operation");
    assert.deepEqual(operation.bpmnErrorRoute, { code: "REVIEW_REQUIRED", output: `place:${flowId}`, origin: {
      kind: SemanticOriginKind.BpmnElement, boundaryEventId, errorDefinitionId, errorElementId: "ReviewRequired", sequenceFlowId: flowId } });
  }
});

for (const [taskId, recovery] of [["Validate", "CorrectData"], ["Authorize", "ReviewPolicy"]]) {
  test(`${taskId} business failure reaches its modeled correction and reissues fresh work`, async () => {
    const { semanticProcess: program } = await accepted();
    let step = applyStimulus(program, initialState, { kind: StimulusKind.StartProcess, commandId: "start",
      processId: "Invoice", instanceId: "invoice-42", initialVariables: [scalar("request", "original")] });
    assert.equal(step.outcome, CommandOutcome.Committed);
    step = applyStimulus(program, step.state, { kind: StimulusKind.CompleteUserTaskInstance, commandId: "review",
      taskId: step.state.userTaskWaits[0]!.id, submittedValues: [] });
    if (taskId === "Authorize") step = applyStimulus(program, step.state, { kind: StimulusKind.CompleteEffect, commandId: "validate",
      effectId: step.state.effectWaits[0]!.id, result: { kind: EffectExecutionResultKind.Success, localPatch: [scalar("result", "valid")] } });
    const first = step.state.effectWaits[0]!.id;
    assert.equal(first.elementId, taskId);
    const rejected = { kind: StimulusKind.CompleteEffect, commandId: "reject", effectId: first,
      result: { kind: EffectExecutionResultKind.BpmnError, code: "REVIEW_REQUIRED", message: null, localPatch: [scalar("result", "correct")] } } as const;
    step = applyStimulus(program, step.state, rejected);
    assert.equal(step.outcome, CommandOutcome.Committed);
    assert.deepEqual(step.state.userTaskWaits.map(wait => wait.id.elementId), [recovery]);
    assert.deepEqual(step.state.variables.activities, []);
    for (const [commandId, submittedValues] of [["correct", [scalar("request", "corrected")]], ["review-again", []]] as const) {
      step = applyStimulus(program, step.state, { kind: StimulusKind.CompleteUserTaskInstance, commandId,
        taskId: step.state.userTaskWaits[0]!.id, submittedValues });
      assert.equal(step.outcome, CommandOutcome.Committed);
    }
    if (taskId === "Authorize") step = applyStimulus(program, step.state, { kind: StimulusKind.CompleteEffect, commandId: "validate-again",
      effectId: step.state.effectWaits[0]!.id, result: { kind: EffectExecutionResultKind.Success, localPatch: [scalar("result", "valid")] } });
    const second = step.state.effectWaits[0]!;
    assert.equal(second.id.elementId, first.elementId);
    assert.equal(second.id.activation, first.activation + 1);
    assert.deepEqual(second.arguments, [scalar("payload", "corrected")]);
    const stale = applyStimulus(program, step.state, { ...rejected, commandId: "stale" });
    assert.equal(stale.outcome, CommandOutcome.Rejected);
    assert.deepEqual(stale.state, step.state);
  });
}

test("explicit interruption, root ordering and distinct same-code Errors preserve admission", async () => {
  await accepted(xml.replaceAll('attachedToRef=', 'cancelActivity="true" attachedToRef='));
  const error = '<error id="ReviewRequired" name="Invoice requires correction" errorCode="REVIEW_REQUIRED"/>';
  await accepted(xml.replace(error, "").replace('<process id="Invoice"', `${error}<process id="Invoice"`));
  await accepted(xml.replace('id="CatchPolicyRefusal" errorRef="ReviewRequired"', 'id="CatchPolicyRefusal" errorRef="PolicyError"')
    .replace('</definitions>', '<error id="PolicyError" errorCode="REVIEW_REQUIRED"/></definitions>'));
});

test("an Error continuation can rejoin directly without a designated recovery task", async () => {
  await accepted(xml.replace('<userTask id="CorrectData" name="Correct invoice data"/>', "")
    .replace('sourceRef="InvalidInvoice" targetRef="CorrectData"', 'sourceRef="InvalidInvoice" targetRef="Reentry"')
    .replace('<sequenceFlow id="RetryData" sourceRef="CorrectData" targetRef="Reentry"/>', ""));
});

test("Error-only automatic bursts admit eight steps and reject nine", async () => {
  const continuation = { id: "CorrectInvoice", source: "InvalidInvoice", target: "CorrectData" };
  const { semanticProcess: program } = await accepted(invoiceWithBurst(xml, 8, continuation));
  let step = applyStimulus(program, initialState, { kind: StimulusKind.StartProcess, commandId: "start", processId: "Invoice",
    instanceId: "invoice-42", initialVariables: [scalar("request", "ready")] });
  step = applyStimulus(program, step.state, { kind: StimulusKind.CompleteUserTaskInstance, commandId: "review",
    taskId: step.state.userTaskWaits[0]!.id, submittedValues: [] });
  step = applyStimulus(program, step.state, { kind: StimulusKind.CompleteEffect, commandId: "invalid",
    effectId: step.state.effectWaits[0]!.id, result: { kind: EffectExecutionResultKind.BpmnError, code: "REVIEW_REQUIRED",
      message: null, localPatch: [scalar("result", "correct")] } });
  assert.equal(step.outcome, CommandOutcome.Committed);
  assert.deepEqual(step.state.userTaskWaits.map(wait => wait.id.elementId), ["CorrectData"]);
  assert.notEqual((await compile(invoiceWithBurst(xml, 9, continuation))).status, BpmnCompilationStatus.Accepted);
});

const invalidSources: readonly [string, (source: string) => string][] = [
  ["non-interrupting Error", source => source.replace('attachedToRef="Validate"', 'attachedToRef="Validate" cancelActivity="false"')],
  ["catch-all Error", source => source.replace('id="CatchInvalidInvoice" errorRef="ReviewRequired"', 'id="CatchInvalidInvoice"')],
  ["non-Service attachment", source => source.replace('attachedToRef="Validate"', 'attachedToRef="Review"')],
  ["two handlers for one task", source => source.replace('attachedToRef="Authorize"', 'attachedToRef="Validate"')],
  ["unreferenced root Error", source => source.replace('</definitions>', '<error id="Unused" errorCode="UNUSED"/></definitions>')],
  ["extra boundary output", source => source.replace('</process>', '<sequenceFlow id="Extra" sourceRef="InvalidInvoice" targetRef="CorrectData"/></process>')],
  ["boundary incoming flow", source => source.replace('targetRef="Validate"', 'targetRef="InvalidInvoice"')],
  ["conditional Error continuation", source => source.replace('sourceRef="InvalidInvoice" targetRef="CorrectData"/>', 'sourceRef="InvalidInvoice" targetRef="CorrectData"><conditionExpression xsi:type="bpmn:tFormalExpression">true</conditionExpression></sequenceFlow>')],
  ["multiple Error definitions", source => source.replace('id="CatchInvalidInvoice" errorRef="ReviewRequired"/>', 'id="CatchInvalidInvoice" errorRef="ReviewRequired"/><errorEventDefinition id="ExtraCatch" errorRef="ReviewRequired"/>')],
  ["unsupported Error structure", source => source.replace('id="ReviewRequired" name=', 'id="ReviewRequired" structureRef="ReviewRequired" name=')],
];
for (const [name, mutate] of invalidSources) test(`source refuses ${name}`, async () => {
  assert.notEqual((await compile(mutate(xml))).status, BpmnCompilationStatus.Accepted);
});
