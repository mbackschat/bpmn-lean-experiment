import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";
import { BpmnCompilationStatus, BpmnSourceDiagnosticCode } from "@bpmn-lean/bpmn-source";
import { CheckedNodeKind, SemanticProfileId, isWellFormedSemanticProcessProgram, supportsSemanticProcessExecution, CommandOutcome, EffectExecutionResultKind, SemanticOperationKind, StimulusKind, VariableValueKind, applyStimulus, initialState } from "@bpmn-lean/semantic-core";
import type { VariableBinding } from "@bpmn-lean/semantic-core";
import { compile, invoiceWithBurst, source as fixture, profile } from "./mixed-task-control-flow-fixture.ts";

const checkedSchema = JSON.parse(await readFile(new URL("../../../contracts/schemas/checked-process.schema.json", import.meta.url), "utf8"));
const programSchema = JSON.parse(await readFile(new URL("../../../contracts/schemas/semantic-process.schema.json", import.meta.url), "utf8"));
const ajv = new Ajv2020({ strict: true, allErrors: true });
const checkedValid = ajv.compile(checkedSchema);
const programValid = ajv.compile(programSchema);
const nodeValid = ajv.compile({ $ref: `${checkedSchema.$id}#/$defs/node` });

const scalar = (name: string, value: string): VariableBinding => ({ name, value: { kind: VariableValueKind.String, value } });

test("checked source admits an eight-step task resumption and refuses nine", async () => {
  const xml = await readFile(fixture, "utf8");
  const accepted = await compile(invoiceWithBurst(xml, 8));
  assert.equal(accepted.status, BpmnCompilationStatus.Accepted, JSON.stringify(accepted.diagnostics));
  if (accepted.status !== BpmnCompilationStatus.Accepted) throw new Error("Eight-step source refused");
  const program = accepted.semanticProcess;
  let result = applyStimulus(program, initialState, start([scalar("request", "initial")]));
  result = applyStimulus(program, result.state, { kind: StimulusKind.CompleteUserTaskInstance, commandId: "review", taskId: result.state.userTaskWaits[0]!.id, submittedValues: [] });
  assert.equal(result.outcome, CommandOutcome.Committed);
  assert.equal(result.state.effectWaits[0]?.id.elementId, "Validate");
  const refused = await compile(invoiceWithBurst(xml, 9));
  assert.equal(refused.status, BpmnCompilationStatus.Rejected);
  assert.equal(refused.diagnostics[0]?.code, BpmnSourceDiagnosticCode.UnsupportedModel);
});

for (const count of [1, 3]) {
  test(`invoice rework with ${count} conditional candidates refreshes task and effect occurrences`, async () => {
    const original = await readFile(fixture, "utf8");
    const extra = count === 1 ? "" : ["Revise", "Resubmit"].map(id => `<sequenceFlow id="${id}" sourceRef="Decision" targetRef="Reentry"><conditionExpression xsi:type="bpmn:tFormalExpression">stringEquals(decision,"${id.toLowerCase()}")</conditionExpression></sequenceFlow>`).join("");
    const result = await compile(original.replace('<sequenceFlow id="Accept"', `${extra}<sequenceFlow id="Accept"`));
    assert.equal(result.status, BpmnCompilationStatus.Accepted, JSON.stringify(result.diagnostics));
    if (result.status !== BpmnCompilationStatus.Accepted) return;
    assert.equal(checkedValid(result.checkedProcess), true, JSON.stringify(checkedValid.errors));
    assert.equal(programValid(result.semanticProcess), true, JSON.stringify(programValid.errors));
    const program = result.semanticProcess;
    const choice = program.operations.find(operation => operation.kind === SemanticOperationKind.Choose);
    assert.ok(choice && choice.kind === SemanticOperationKind.Choose);
    assert.deepEqual(choice.candidates.map(candidate => candidate.origin.elementId), count === 1 ? ["Rework"] : ["Rework", "Revise", "Resubmit"]);
    const start = { kind: StimulusKind.StartProcess, commandId: "start", processId: "Invoice", instanceId: "invoice-42", initialVariables: [scalar("request", "initial")] } as const;
    let step = applyStimulus(program, initialState, start);
    assert.equal(step.outcome, CommandOutcome.Committed);
    const firstHuman = step.state.userTaskWaits[0]!.id;
    step = applyStimulus(program, step.state, { kind: StimulusKind.CompleteUserTaskInstance, commandId: "review-1", taskId: firstHuman, submittedValues: [scalar("request", "first review")] });
    assert.equal(step.outcome, CommandOutcome.Committed);
    const firstEffect = step.state.effectWaits[0]!;
    const firstLocalScope = step.state.variables.activities;
    assert.deepEqual(firstEffect.arguments, [scalar("payload", "first review")]);
    const firstResult = { kind: StimulusKind.CompleteEffect, commandId: "validate-1", effectId: firstEffect.id, result: { kind: EffectExecutionResultKind.Success, localPatch: [scalar("result", "rework")] } } as const;
    step = applyStimulus(program, step.state, firstResult);
    assert.equal(step.outcome, CommandOutcome.Committed);
    const secondHuman = step.state.userTaskWaits[0]!.id;
    assert.equal(secondHuman.elementId, "Review");
    assert.equal(secondHuman.activation, firstHuman.activation + 1);
    const beforeStaleHuman = step.state;
    const staleHuman = applyStimulus(program, beforeStaleHuman, { kind: StimulusKind.CompleteUserTaskInstance, commandId: "stale-human", taskId: firstHuman, submittedValues: [scalar("request", "stale")] });
    assert.equal(staleHuman.outcome, CommandOutcome.Rejected);
    assert.deepEqual(staleHuman.state, beforeStaleHuman);
    step = applyStimulus(program, step.state, { kind: StimulusKind.CompleteUserTaskInstance, commandId: "review-2", taskId: secondHuman, submittedValues: [scalar("request", "corrected review")] });
    assert.equal(step.outcome, CommandOutcome.Committed);
    const secondEffect = step.state.effectWaits[0]!;
    assert.equal(secondEffect.id.elementId, "Validate");
    assert.equal(secondEffect.id.activation, firstEffect.id.activation + 1);
    assert.deepEqual(secondEffect.arguments, [scalar("payload", "corrected review")]);
    const beforeStaleEffect = step.state;
    const staleEffect = applyStimulus(program, beforeStaleEffect, { ...firstResult, commandId: "stale-effect" });
    assert.equal(staleEffect.outcome, CommandOutcome.Rejected);
    assert.deepEqual(staleEffect.state, beforeStaleEffect);
    const staleLocalOwner = beforeStaleEffect.variables.activities.map(scope => ({ ...scope, owner: firstLocalScope[0]!.owner }));
    for (const activities of [[], staleLocalOwner, [...beforeStaleEffect.variables.activities, ...beforeStaleEffect.variables.activities]]) {
      const invalidLifetime = { ...beforeStaleEffect, variables: { ...beforeStaleEffect.variables, activities } };
      const refused = applyStimulus(program, invalidLifetime, { ...firstResult, commandId: "refuse-local-owner",
        effectId: secondEffect.id, result: { kind: EffectExecutionResultKind.Success, localPatch: [scalar("result", "approved")] } });
      assert.equal(refused.outcome, CommandOutcome.Rejected);
      assert.deepEqual(refused.state, invalidLifetime);
    }
    step = applyStimulus(program, step.state, { kind: StimulusKind.CompleteEffect, commandId: "validate-2", effectId: secondEffect.id, result: { kind: EffectExecutionResultKind.Success, localPatch: [scalar("result", "approved")] } });
    assert.equal(step.outcome, CommandOutcome.Committed);
    assert.equal(step.state.userTaskWaits[0]?.id.elementId, "Finalize");
    assert.deepEqual(step.state.variables.activities, []);
    step = applyStimulus(program, step.state, { kind: StimulusKind.CompleteUserTaskInstance, commandId: "finalize", taskId: step.state.userTaskWaits[0]!.id, submittedValues: [] });
    assert.equal(step.outcome, CommandOutcome.Committed);
    assert.equal(step.state.control.kind, "completed");
    assert.deepEqual(step.state.variables.process.bindings, [scalar("decision", "approved"), scalar("request", "corrected review")]);
  });
}

async function accepted(xml?: string) {
  const result = await compile(xml ?? await readFile(fixture, "utf8"));
  assert.equal(result.status, BpmnCompilationStatus.Accepted, JSON.stringify(result.diagnostics));
  if (result.status !== BpmnCompilationStatus.Accepted) throw new Error("Expected admitted mixed-task source");
  return result;
}

const start = (initialVariables: readonly VariableBinding[]) => ({ kind: StimulusKind.StartProcess,
  commandId: "start", processId: "Invoice", instanceId: "invoice-42", initialVariables } as const);

test("a possibly empty human patch cannot supply a required first-entry Service input", async () => {
  const { semanticProcess: program } = await accepted();
  assert.equal(supportsSemanticProcessExecution(start([]), program), false);
  assert.equal(supportsSemanticProcessExecution(start([scalar("request", "ready")]), program), true);
  assert.equal(supportsSemanticProcessExecution(start([{ name: "request", value: { kind: VariableValueKind.Null } }]), program), true);
});

test("successful effect completion requires exactly the distinct result sources", async () => {
  const xml = (await readFile(fixture, "utf8")).replace('</camunda:outputParameter>', '</camunda:outputParameter><camunda:outputParameter name="audit">${result}</camunda:outputParameter>');
  const { semanticProcess: program } = await accepted(xml);
  let step = applyStimulus(program, initialState, start([scalar("request", "ready")]));
  step = applyStimulus(program, step.state, { kind: StimulusKind.CompleteUserTaskInstance, commandId: "review", taskId: step.state.userTaskWaits[0]!.id, submittedValues: [] });
  const before = step.state;
  for (const localPatch of [[], [scalar("extra", "unused"), scalar("result", "approved")]]) {
    const result = applyStimulus(program, before, { kind: StimulusKind.CompleteEffect, commandId: "bad-result", effectId: before.effectWaits[0]!.id, result: { kind: EffectExecutionResultKind.Success, localPatch } });
    assert.equal(result.outcome, CommandOutcome.Rejected);
    assert.deepEqual(result.state, before);
  }
  const result = applyStimulus(program, before, { kind: StimulusKind.CompleteEffect, commandId: "valid-result", effectId: before.effectWaits[0]!.id, result: { kind: EffectExecutionResultKind.Success, localPatch: [scalar("result", "approved")] } });
  assert.equal(result.outcome, CommandOutcome.Committed);
  assert.deepEqual(result.state.variables.process.bindings, [scalar("audit", "approved"), scalar("decision", "approved"), scalar("request", "ready")]);
});

test("human-only and Service-only graphs do not require a fixed task-kind multiset", async () => {
  const xml = await readFile(fixture, "utf8");
  const human = await accepted(xml.replace(/<serviceTask[\s\S]*?<\/serviceTask>/u, '<userTask id="Validate"/>'));
  assert.equal(supportsSemanticProcessExecution(start([]), human.semanticProcess), true);
  const service = await accepted(xml.replace(/<userTask id="(Review|Finalize)"\/>/gu,
    '<serviceTask id="$1" implementation="urn:bpmn-lean:effect-protocol:activity-v1" camunda:asyncBefore="true" camunda:delegateExpression="${invoiceValidator}"/>'));
  assert.equal(supportsSemanticProcessExecution(start([scalar("request", "ready")]), service.semanticProcess), true);
  const step = applyStimulus(service.semanticProcess, initialState, start([scalar("request", "ready")]));
  assert.equal(step.outcome, CommandOutcome.Committed);
  assert.equal(step.state.effectWaits[0]?.id.elementId, "Review");
});

test("raw IL rejects duplicate consumers, reused source identities and unbound overlays", async () => {
  const { semanticProcess: program } = await accepted();
  assert.equal(isWellFormedSemanticProcessProgram(program), true);
  const merge = program.operations.find(operation => operation.kind === SemanticOperationKind.MergeExclusive)!;
  assert.ok(merge.kind === SemanticOperationKind.MergeExclusive);
  const badPrograms = [
    { ...program, identity: { ...program.identity, sourceOverlay: null } },
    { ...program, operations: program.operations.map(operation => operation.id === merge.id ? { ...merge, inputs: [...merge.inputs, merge.inputs[0]] } : operation) },
    { ...program, controlPlaces: program.controlPlaces.map((place, index) => index === 0 ? { ...place, origin: { ...place.origin, elementId: program.processId } } : place) },
    { ...program, operations: program.operations.map(operation => operation.kind === SemanticOperationKind.Choose ? { ...operation, origin: { ...operation.origin, elementId: "Review" } } : operation) },
    { ...program, operations: program.operations.map(operation => operation.kind === SemanticOperationKind.Choose ? { ...operation, candidates: [] } : operation) },
  ];
  for (const candidate of badPrograms) assert.equal(isWellFormedSemanticProcessProgram(candidate), false);
});

test("mixed profiles admit nonempty Exclusive choices while Inclusive and other profiles retain two", async () => {
  type OperationModule = typeof import("../../semantic-core/src/semantic-process-operation-admission.ts");
  const { isWellFormedSemanticOperation } = await import(new URL("../../semantic-core/dist/semantic-process-operation-admission.js", import.meta.url).href) as OperationModule;
  const { semanticProcess: program } = await accepted();
  const choice = program.operations.find(operation => operation.kind === SemanticOperationKind.Choose)!;
  assert.ok(choice.kind === SemanticOperationKind.Choose);
  for (const count of [0, 1, 2, 3]) {
    const candidates = Array.from({ length: count }, (_, index) => ({ ...choice.candidates[0], output: `branch${index}`, origin: { ...choice.candidates[0].origin, elementId: `flow${index}` } }));
    const operation = { ...choice, candidates };
    const ids = new Set([choice.input, choice.defaultOutput, ...candidates.map(candidate => candidate.output)]);
    const origins = new Map([[choice.defaultOutput, choice.defaultOrigin.elementId], ...candidates.map(candidate => [candidate.output, candidate.origin.elementId] as const)]);
    assert.equal(isWellFormedSemanticOperation(operation, ids, origins, new Map(), profile), count > 0);
    for (const registeredProfile of Object.values(SemanticProfileId)) {
      const admitted = isWellFormedSemanticOperation(operation, ids, origins, new Map(), registeredProfile);
      switch (registeredProfile) {
        case SemanticProfileId.MixedTaskControlFlow:
        case SemanticProfileId.MixedTaskBusinessError:
          assert.equal(admitted, count > 0, registeredProfile);
          break;
        default:
          assert.equal(admitted, count === 2, registeredProfile);
      }
    }
    const node = { kind: CheckedNodeKind.ExclusiveGateway, id: "choice", direction: "diverging", candidateFlowIds: candidates.map(candidate => candidate.origin.elementId), defaultFlowId: "fallback" };
    assert.equal(nodeValid(node), count > 0);
    assert.equal(nodeValid({ ...node, kind: CheckedNodeKind.InclusiveGateway }), count === 2);
  }
});

test("assessment routes require initial data exactly when a branch can bypass all Service writers", async () => {
  const original = await readFile(new URL("./fixtures/mixed-task-assessment-routing.bpmn", import.meta.url), "utf8");
  for (const bothWrite of [false, true]) {
    const xml = bothWrite ? original.replace('<userTask id="Internal" name="Review the existing internal assessment"/>',
      '<serviceTask id="Internal" implementation="urn:bpmn-lean:effect-protocol:activity-v1" camunda:asyncBefore="true" camunda:delegateExpression="${internalAssessment}"><extensionElements><camunda:inputOutput><camunda:outputParameter name="assessment">${result}</camunda:outputParameter></camunda:inputOutput></extensionElements></serviceTask>') : original;
    const compiled = await compile(xml, ["supplierAssessment", "recordAssessment", ...(bothWrite ? ["internalAssessment"] : [])]);
    assert.equal(compiled.status, BpmnCompilationStatus.Accepted, JSON.stringify(compiled.diagnostics));
    if (compiled.status !== BpmnCompilationStatus.Accepted) throw new Error("Assessment graph rejected");
    const program = compiled.semanticProcess;
    const emptyStart = { ...start([]), processId: "Assessment" };
    assert.equal(supportsSemanticProcessExecution(emptyStart, program), bothWrite);
    const initialVariables = bothWrite ? [] : [scalar("assessment", "existing")];
    let step = applyStimulus(program, initialState, { ...emptyStart, initialVariables });
    assert.equal(step.outcome, CommandOutcome.Committed);
    step = bothWrite
      ? applyStimulus(program, step.state, { kind: StimulusKind.CompleteEffect, commandId: "assess", effectId: step.state.effectWaits[0]!.id, result: { kind: EffectExecutionResultKind.Success, localPatch: [scalar("result", "new assessment")] } })
      : applyStimulus(program, step.state, { kind: StimulusKind.CompleteUserTaskInstance, commandId: "review", taskId: step.state.userTaskWaits[0]!.id, submittedValues: [] });
    assert.equal(step.outcome, CommandOutcome.Committed);
    assert.equal(step.state.effectWaits[0]?.id.elementId, "Record");
    assert.deepEqual(step.state.effectWaits[0]?.arguments, [scalar("payload", bothWrite ? "new assessment" : "existing")]);
    step = applyStimulus(program, step.state, { kind: StimulusKind.CompleteEffect, commandId: "record", effectId: step.state.effectWaits[0]!.id, result: { kind: EffectExecutionResultKind.Success, localPatch: [] } });
    assert.equal(step.outcome, CommandOutcome.Committed);
    assert.equal(step.state.userTaskWaits[0]?.id.elementId, "Approve");
    step = applyStimulus(program, step.state, { kind: StimulusKind.CompleteUserTaskInstance, commandId: "approve", taskId: step.state.userTaskWaits[0]!.id, submittedValues: [] });
    assert.equal(step.outcome, CommandOutcome.Committed);
    assert.equal(step.state.control.kind, "completed");
    assert.deepEqual(step.state.variables.activities, []);
  }
});
