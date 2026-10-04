import assert from "node:assert/strict";
import test from "node:test";
import { BpmnCompilationStatus } from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome, EffectExecutionResultKind, SemanticOperationKind, StimulusKind, VariableValueKind,
  applyStimulus, initialState, isWellFormedSemanticProcessProgram, supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticProcessProgram, Stimulus, VariableBinding } from "@bpmn-lean/semantic-core";
import { compile, protocol } from "./serial-business-task-fixture.ts";

type Task = Readonly<{ id: string; service: boolean; mappings?: string }>;
function invoiceXml(tasks: readonly Task[]): string {
  const ids = ["Start", ...tasks.map(task => task.id), "End"];
  return `<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" targetNamespace="urn:invoice">
    <process id="Invoice" isExecutable="true"><startEvent id="Start"/>
    ${tasks.map(task => task.service ? `<serviceTask id="${task.id}" implementation="${protocol}" camunda:asyncBefore="true" camunda:delegateExpression="\${invoiceValidator}">${task.mappings ?? ""}</serviceTask>` : `<userTask id="${task.id}"/>`).join("")}
    <endEvent id="End"/>${ids.slice(1).map((id, index) => `<sequenceFlow id="Flow_${index}" sourceRef="${ids[index]}" targetRef="${id}"/>`).join("")}
    </process></definitions>`;
}

function mappings(source: string, targets: readonly string[]): string {
  return `<extensionElements><camunda:inputOutput><camunda:inputParameter name="payload">\${${source}}</camunda:inputParameter>${targets.map(target => `<camunda:outputParameter name="${target}">\${result}</camunda:outputParameter>`).join("")}</camunda:inputOutput></extensionElements>`;
}

const scalar = (name: string, value: string): VariableBinding => ({ name, value: { kind: VariableValueKind.String, value } });
const nullResult = { name: "result", value: { kind: VariableValueKind.Null } } as const;

for (const { collision, flowCollision, duplicate } of [
  { collision: "flow-flow", flowCollision: true, duplicate: "Flow_1" },
  { collision: "flow-task", flowCollision: true, duplicate: "Validate" },
  { collision: "flow-process", flowCollision: true, duplicate: "Invoice" },
  { collision: "start-process", flowCollision: false, duplicate: "Invoice" },
  { collision: "start-task", flowCollision: false, duplicate: "Validate" },
  { collision: "start-end", flowCollision: false, duplicate: "End" },
]) {
  test(`serial Program rejects ${collision} source identity collisions before start`, async () => {
    const compiled = await compile(invoiceXml([{ id: "Review", service: false }, { id: "Validate", service: true }]));
    assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
    if (compiled.status !== BpmnCompilationStatus.Accepted) return;
    const program = compiled.semanticProcess;
    const start = { kind: StimulusKind.StartProcess, commandId: "start", processId: "Invoice", instanceId: "invoice", initialVariables: [] } as const;
    assert.equal(isWellFormedSemanticProcessProgram(program), true);
    assert.equal(applyStimulus(program, initialState, start).outcome, CommandOutcome.Committed);
    const mutated = {
      ...program,
      controlPlaces: program.controlPlaces.map((place, index) => flowCollision && index === 0 ? { ...place, origin: { ...place.origin, elementId: duplicate } } : place),
      operations: program.operations.map(operation => !flowCollision && operation.kind === SemanticOperationKind.Initiate ?
        { ...operation, origin: { ...operation.origin, elementId: duplicate } } : operation),
    };
    assert.equal(isWellFormedSemanticProcessProgram(mutated), false);
    const result = applyStimulus(mutated, initialState, start);
    assert.equal(result.outcome, CommandOutcome.Rejected);
    assert.deepEqual(result.state, initialState);
  });
}

for (const sequence of ["HS", "SH"]) {
  test(`reject an empty instance identity before committing a ${sequence} chain`, async () => {
    const compiled = await compile(invoiceXml([...sequence].map((kind, index) => ({
      id: `Task_${index}`, service: kind === "S",
    }))));
    assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
    if (compiled.status !== BpmnCompilationStatus.Accepted) return;
    const before = initialState;
    const result = applyStimulus(compiled.semanticProcess, before, {
      kind: StimulusKind.StartProcess, commandId: "empty-instance", processId: "Invoice",
      instanceId: "", initialVariables: [],
    });
    assert.equal(result.outcome, CommandOutcome.Rejected);
    assert.deepEqual(result.state, before);
  });
}

function boundedCommand(program: SemanticProcessProgram, state: RuntimeState, stimulus: Stimulus, limit: number) {
  const overflow = applyStimulus(program, state, stimulus, limit - 1);
  assert.equal(overflow.outcome, CommandOutcome.RolledBack);
  assert.equal(overflow.internalStepBoundExceeded, true);
  assert.equal(overflow.ambiguousInternalChoice, false);
  assert.deepEqual(overflow.state, state);
  const result = applyStimulus(program, state, stimulus, limit);
  assert.equal(result.outcome, CommandOutcome.Committed);
  assert.equal(result.internalStepBoundExceeded, false);
  assert.equal(result.ambiguousInternalChoice, false);
  assert.deepEqual(result, applyStimulus(program, state, stimulus));
  return result;
}

for (const sequence of ["HSSH", "SHS", "H" + "S".repeat(12) + "H"]) {
  test(`complete ${sequence} chain preserves input availability, null fan-out and distinct task owners`, async () => {
    let previous = "request";
    const tasks = [...sequence].map((kind, index) => {
      const id = `Task_${index}`;
      if (kind === "H") return { id, service: false };
      const target = `output_${index}`;
      const task = { id, service: true, mappings: mappings(previous, [target, `receipt_${index}`]) };
      previous = target;
      return task;
    });
    const compiled = await compile(invoiceXml(tasks));
    assert.equal(compiled.status, BpmnCompilationStatus.Accepted, JSON.stringify(compiled.diagnostics));
    if (compiled.status !== BpmnCompilationStatus.Accepted) return;
    const program = compiled.semanticProcess;
    const start = { kind: StimulusKind.StartProcess, commandId: "start", processId: "Invoice", instanceId: "invoice", initialVariables: [scalar("request", "reviewed"), scalar("result", "parent")] } as const;
    assert.equal(supportsSemanticProcessExecution(start, program), true);
    let current = boundedCommand(program, initialState, start, 2);
    let serviceCount = 0;
    for (const task of tasks) {
      assert.equal(current.outcome, CommandOutcome.Committed);
      if (task.service) {
        assert.equal(current.state.effectWaits.length, 1);
        assert.equal(current.state.userTaskWaits.length, 0);
        const wait = current.state.effectWaits[0]!;
        assert.equal(wait.id.elementId, task.id);
        assert.deepEqual(wait.arguments, serviceCount === 0 ? [scalar("payload", "reviewed")] : [{ name: "payload", value: { kind: VariableValueKind.Null } }]);
        const before = current.state;
        const command = { kind: StimulusKind.CompleteEffect, commandId: task.id, effectId: wait.id, result: { kind: EffectExecutionResultKind.Success, localPatch: [nullResult] } } as const;
        for (const patch of [[], [nullResult, nullResult], [scalar("private", "extra"), nullResult]]) {
          const refused = applyStimulus(program, before, { ...command, result: { ...command.result, localPatch: patch } });
          assert.equal(refused.outcome, CommandOutcome.Rejected);
          assert.deepEqual(refused.state, before);
        }
        current = boundedCommand(program, before, command, task === tasks.at(-1) ? 2 : 1);
        assert.equal(current.state.variables.process.bindings.find(binding => binding.name === "result")?.value.kind, VariableValueKind.String);
        serviceCount++;
      } else {
        assert.equal(current.state.userTaskWaits.length, 1);
        assert.equal(current.state.effectWaits.length, 0);
        current = boundedCommand(program, current.state, { kind: StimulusKind.CompleteUserTaskInstance, commandId: task.id, taskId: current.state.userTaskWaits[0]!.id, submittedValues: [] }, task === tasks.at(-1) ? 2 : 1);
      }
    }
    assert.equal(current.outcome, CommandOutcome.Committed);
    assert.equal(current.state.control.kind, "completed");
    assert.deepEqual(current.state.variables.activities, []);
    assert.equal(current.state.variables.process.bindings.length, 2 + serviceCount * 2);
    assert.equal(isWellFormedSemanticProcessProgram({ ...program, identity: { ...program.identity, sourceOverlay: null } }), false);
  });
}

test("an unmapped Service Task requires an explicit empty result and continues to human work", async () => {
  const compiled = await compile(invoiceXml([{ id: "Archive", service: true }, { id: "Review", service: false }]));
  assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
  if (compiled.status !== BpmnCompilationStatus.Accepted) return;
  const program = compiled.semanticProcess;
  const state = applyStimulus(program, initialState, { kind: StimulusKind.StartProcess, commandId: "start", processId: "Invoice", instanceId: "invoice", initialVariables: [] }).state;
  assert.deepEqual(state.effectWaits[0]?.arguments, []);
  const command = { kind: StimulusKind.CompleteEffect, commandId: "archive", effectId: state.effectWaits[0]!.id, result: { kind: EffectExecutionResultKind.Success, localPatch: [] } } as const;
  assert.equal(applyStimulus(program, state, { ...command, result: { ...command.result, localPatch: [nullResult] } }).outcome, CommandOutcome.Rejected);
  const next = applyStimulus(program, state, command);
  assert.equal(next.outcome, CommandOutcome.Committed);
  assert.equal(next.state.userTaskWaits[0]?.id.elementId, "Review");
});
