import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Ajv2020 } from "ajv/dist/2020.js";
import { test } from "node:test";
import { applyStimulus, initialState, supportsSemanticProcessExecution, StimulusKind, CommandOutcome, EffectExecutionResultKind } from "@bpmn-lean/semantic-core";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";

const xml = await readFile(new URL("./fixtures/transaction-cancellation.bpmn", import.meta.url), "utf8");
const profile = "bpmn-2.0.2-transaction-cancellation-checkpoint-draft";
const compile = (source: string) => compileBpmnToSemanticProcess({
  bytes: Buffer.from(source), sourceId: "reservation-withdrawal", expectedSha256: undefined,
  semanticProfile: profile, sourceOverlay: null, limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1000 },
});

for (const [name, source] of [
  ["omitted method", xml],
  ["explicit normative method", xml.replace('<bpmn:transaction id=', '<bpmn:transaction method="##Compensate" id=')],
  ["renamed identities", xml.replaceAll(/\b(?:Definitions|Process|Transaction|Start|Split|Task|End|Boundary|Cancel|Compensate|Association|Flow)_\w+/g, (id) => `Renamed_${id}`)],
] as const) {
  test(`compiles role-based Transaction cancellation with ${name}`, async () => {
    const result = await compile(source);
    assert.equal(result.status, BpmnCompilationStatus.Accepted, JSON.stringify(result.diagnostics));
    if (result.status !== BpmnCompilationStatus.Accepted) return;
    assert.equal(result.semanticProcess.operations.filter(({ kind }) => kind === "cancelTransaction").length, 1);
    assert.equal(result.semanticProcess.compensationActivityRetention?.limits.maxRecords, 1);
    assert.equal(result.semanticProcess.compensationEventSubProcessSnapshots, undefined);
    assert.equal(Buffer.from(result.copyExactBytes()).toString(), source);
  });
}

for (const [name, source] of [
  ["case-folded method", xml.replace('<bpmn:transaction id=', '<bpmn:transaction method="##compensate" id=')],
  ["ordinary Sub-Process Cancel", xml.replaceAll("bpmn:transaction", "bpmn:subProcess")],
  ["noninterrupting Cancel Boundary", xml.replace('id="Boundary_Cancel"', 'id="Boundary_Cancel" cancelActivity="false"')],
  ["eligible subject on Cancel branch", xml.replace('attachedToRef="Task_Reserve"', 'attachedToRef="Task_Withdraw"')],
  ["unselected third Task", xml.replace('<bpmn:endEvent id="End_Prepared"', '<bpmn:userTask id="Task_Extra" /><bpmn:endEvent id="End_Prepared"')],
  ["wrong Cancel attachment", xml.replace('attachedToRef="Transaction_Reservation"', 'attachedToRef="Task_Acknowledge"')],
] as const) {
  test(`rejects Transaction source with ${name}`, async () => {
    assert.equal((await compile(source)).status, BpmnCompilationStatus.Rejected);
  });
}

for (const eligibleCompleted of [false, true]) {
  test(`executes source Transaction through ${eligibleCompleted ? "compensated" : "empty"} cancellation`, async () => {
    const compiled = await compile(xml);
    assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
    if (compiled.status !== BpmnCompilationStatus.Accepted) return;
    const program = compiled.semanticProcess;
    const start = { kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId,
      instanceId: "reservation-1", initialVariables: [] } as const;
    assert.equal(supportsSemanticProcessExecution(start, program), true);
    let result = applyStimulus(program, initialState, start);
    assert.equal(result.outcome, CommandOutcome.Committed);
    assert.deepEqual(result.state.userTaskWaits.map(({ id }) => id.elementId).sort(), ["Task_Reserve", "Task_Withdraw"]);
    const complete = (elementId: string) => {
      const task = result.state.userTaskWaits.find(({ id }) => id.elementId === elementId);
      assert.ok(task);
      result = applyStimulus(program, result.state, { kind: StimulusKind.CompleteUserTaskInstance,
        commandId: `complete-${elementId}`, taskId: task.id, submittedValues: [] });
      assert.equal(result.outcome, CommandOutcome.Committed);
    };
    if (eligibleCompleted) complete("Task_Reserve");
    complete("Task_Withdraw");
    if (eligibleCompleted) {
      assert.deepEqual(result.state.userTaskWaits, []);
      assert.equal(result.state.scopeOccurrences.length, 2);
      const effect = result.state.compensationHandlerEffectWaits?.[0];
      assert.ok(effect);
      result = applyStimulus(program, result.state, { kind: StimulusKind.CompleteEffect,
        commandId: "release", effectId: effect.id, result: { kind: EffectExecutionResultKind.Success, localPatch: [] } });
      assert.equal(result.outcome, CommandOutcome.Committed);
    }
    assert.deepEqual(result.state.userTaskWaits.map(({ id }) => id.elementId), ["Task_Acknowledge"]);
    assert.equal(result.state.scopeOccurrences.length, 1);
    complete("Task_Acknowledge");
    assert.equal(result.state.control.kind, "completed");
  });
}

test("checked Transaction wire admits exactly its three node arms and closed child declaration", async () => {
  const result = await compile(xml);
  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  if (result.status !== BpmnCompilationStatus.Accepted) return;
  const schema = JSON.parse(await readFile(new URL("../../../contracts/schemas/checked-process.schema.json", import.meta.url), "utf8"));
  const validate = new Ajv2020({ strict: true }).compile(schema);
  assert.equal(validate(result.checkedProcess), true, JSON.stringify(validate.errors));
  const declaration = result.checkedProcess.transactionCancellation;
  assert.ok(declaration);
  const candidates = [
    { ...declaration, retentionLimits: { ...declaration.retentionLimits, extra: true } },
    { ...declaration, executionLimits: { ...declaration.executionLimits, extra: true } },
    { ...declaration, subject: { ...declaration.subject, body: { ...declaration.subject.body,
      input: { kind: "directRestoredProcessBinding", sourcePropertyId: "x", targetDataInputId: "y" } } } },
  ];
  for (const transactionCancellation of candidates) {
    assert.equal(validate({ ...result.checkedProcess, transactionCancellation }), false);
  }
});

for (const [name, source] of [
  ["one Task on each branch", xml.replace('      <bpmn:userTask id="Task_Prepare" name="Prepare reservation" />\n', '').replace('targetRef="Task_Prepare"', 'targetRef="End_Prepared"').replace('      <bpmn:sequenceFlow id="Flow_Prepared" sourceRef="Task_Prepare" targetRef="End_Prepared" />\n', '')],
  ["eligible last on its two-Task branch", xml.replace('attachedToRef="Task_Reserve"', 'attachedToRef="Task_Prepare"')],
  ["two Tasks on Cancel branch", xml.replace('<bpmn:userTask id="Task_Withdraw"', '<bpmn:userTask id="Task_Confirm" /><bpmn:sequenceFlow id="Flow_Confirm" sourceRef="Task_Confirm" targetRef="End_Cancel" /><bpmn:userTask id="Task_Withdraw"').replace('sourceRef="Task_Withdraw" targetRef="End_Cancel"', 'sourceRef="Task_Withdraw" targetRef="Task_Confirm"')],
  ["reversed branch serialization", xml.replace(/^(      <bpmn:sequenceFlow.*\n)+/m, (block) => block.trimEnd().split('\n').reverse().join('\n') + '\n')],
] as const) {
  test(`source grammar admits ${name}`, async () => {
    const result = await compile(source);
    assert.equal(result.status, BpmnCompilationStatus.Accepted, JSON.stringify(result.diagnostics));
  });
}
