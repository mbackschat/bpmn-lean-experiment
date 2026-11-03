/**
 * The core journeys of the default-less Exclusive Choice account over its two witness models: XND-ROUTE-01 and
 * XND-ROLLBACK-01. Expected tasks and rolled-back states are read off the proposal's witness account and its CIB
 * calibration probe, not off a run. A rolled-back command must return exactly the state it was given, with both closure
 * flags false, so a harness failure, a partial commit or a fallback to a candidate each fails here.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { BpmnCompilationStatus } from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome, ControlStateKind, EffectExecutionResultKind, StimulusKind, applyStimulus, initialState,
  isWellFormedRuntimeState,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticProcessProgram, Stimulus, VariableBinding } from "@bpmn-lean/semantic-core";
import { text } from "./effect-data-fixture.ts";
import { compileWitness } from "./exclusive-choice-without-default-fixture.ts";
import type { Model } from "./exclusive-choice-without-default-fixture.ts";

async function program(model: Model, edit?: (xml: string) => string): Promise<SemanticProcessProgram> {
  const result = await compileWitness(model, edit);
  assert.ok(result.status === BpmnCompilationStatus.Accepted, JSON.stringify(result.diagnostics));
  return result.semanticProcess;
}

const bind = (name: string, value: string): VariableBinding => ({ name, value: text(value) });

function commit(process: SemanticProcessProgram, instance: string, state: RuntimeState, stimulus: Stimulus): RuntimeState {
  const result = applyStimulus(process, state, stimulus);
  assert.equal(result.outcome, CommandOutcome.Committed, JSON.stringify(stimulus));
  assert.equal(result.ambiguousInternalChoice, false, JSON.stringify(stimulus));
  assert.equal(isWellFormedRuntimeState(process, instance, result.state), true, JSON.stringify(stimulus));
  return result.state;
}

/** XND-ROLLBACK-01: the command rolls back flag-free and returns exactly the state it was given. */
function rollsBack(process: SemanticProcessProgram, state: RuntimeState, stimulus: Stimulus): void {
  const result = applyStimulus(process, state, stimulus);
  assert.equal(result.outcome, CommandOutcome.RolledBack, JSON.stringify(stimulus));
  assert.equal(result.internalStepBoundExceeded, false);
  assert.equal(result.ambiguousInternalChoice, false);
  assert.deepEqual(result.state, state);
}

const userTask = (instance: string, elementId: string, submittedValues: readonly VariableBinding[] = []): Stimulus => ({
  kind: StimulusKind.CompleteUserTaskInstance, commandId: `complete-${elementId}`,
  taskId: { processInstanceId: instance, elementId, activation: 1 }, submittedValues });

const effect = (instance: string, elementId: string): Stimulus => ({
  kind: StimulusKind.CompleteEffect, commandId: `effect-${elementId}`,
  effectId: { processInstanceId: instance, elementId, activation: 1 },
  result: { kind: EffectExecutionResultKind.Success, localPatch: [] } });

const openWork = (state: RuntimeState) =>
  [...state.userTaskWaits.map(({ id }) => id.elementId), ...state.effectWaits.map(({ id }) => id.elementId)].sort();

const expense = "Expense_1";
const submit = (category: string, priority: string, payout: string): Stimulus => ({
  kind: StimulusKind.StartProcess, commandId: "start", processId: "Process_ExpenseRouting", instanceId: expense,
  initialVariables: [bind("category", category), bind("claimant", "Ada"), bind("payout", payout), bind("priority", priority)] });

test("XND-ROUTE-01: an urgent travel expense takes the first of two true candidates, then pays out by bank", async () => {
  const process = await program("expense-routing");
  const opened = commit(process, expense, initialState, submit("travel", "urgent", "bank"));
  assert.deepEqual(openWork(opened), ["ReviewUrgently"]);
  const reviewed = commit(process, expense, opened, userTask(expense, "ReviewUrgently"));
  assert.deepEqual(openWork(reviewed), ["ReimburseClaimant"]);
  const paid = commit(process, expense, reviewed, effect(expense, "ReimburseClaimant"));
  assert.equal(paid.control.kind, ControlStateKind.Completed);
});

test("XND-ROUTE-01: reversing Route expense's conditional declarations makes the urgent travel expense a travel review", async () => {
  const urgent = '    <sequenceFlow id="Flow_Urgent" sourceRef="RouteExpense" targetRef="ReviewUrgently">\n' +
    '      <conditionExpression xsi:type="tFormalExpression">stringEquals(priority,"urgent")</conditionExpression>\n' +
    '    </sequenceFlow>\n';
  const equipment = '    <sequenceFlow id="Flow_Equipment" sourceRef="RouteExpense" targetRef="ReviewEquipment">\n' +
    '      <conditionExpression xsi:type="tFormalExpression">stringEquals(category,"equipment")</conditionExpression>\n' +
    '    </sequenceFlow>\n';
  const process = await program("expense-routing", xml => {
    assert.equal(xml.split(urgent).length, 2);
    assert.equal(xml.split(equipment).length, 2);
    // Declaration order becomes equipment, travel, urgent; ids and `<outgoing>` references are unchanged.
    return xml.replace(urgent, "").replace(equipment, "").replace(
      '    <sequenceFlow id="Flow_Travel"', `${equipment}    <sequenceFlow id="Flow_Travel"`).replace(
      '    <sequenceFlow id="Flow_UrgentReviewed"', `${urgent}    <sequenceFlow id="Flow_UrgentReviewed"`);
  });
  const opened = commit(process, expense, initialState, submit("travel", "urgent", "bank"));
  assert.deepEqual(openWork(opened), ["ReviewTravel"]);
});

test("XND-ROLLBACK-01: a catering expense matches no route, so the Start rolls back and no instance exists", async () => {
  const process = await program("expense-routing");
  rollsBack(process, initialState, submit("catering", "normal", "bank"));
});

test("XND-ROLLBACK-01: a cash payout matches no payout route, so the review's completion rolls back", async () => {
  const process = await program("expense-routing");
  const opened = commit(process, expense, initialState, submit("travel", "normal", "cash"));
  assert.deepEqual(openWork(opened), ["ReviewTravel"]);
  rollsBack(process, opened, userTask(expense, "ReviewTravel"));
});

test("XND-ROUTE-01: an equipment expense paid through payroll opens Add to payroll", async () => {
  const process = await program("expense-routing");
  const opened = commit(process, expense, initialState, submit("equipment", "normal", "payroll"));
  assert.deepEqual(openWork(opened), ["ReviewEquipment"]);
  assert.deepEqual(openWork(commit(process, expense, opened, userTask(expense, "ReviewEquipment"))), ["AddToPayroll"]);
});

const ticket = "Ticket_1";
const opened = (process: SemanticProcessProgram) => commit(process, ticket, initialState, {
  kind: StimulusKind.StartProcess, commandId: "start", processId: "Process_TicketTriage", instanceId: ticket,
  initialVariables: [bind("ticket", "T-9")] });

test("XND-ROLLBACK-01: a medium triage matches no route, so the completion, its patch and the Sub-Process completion roll back", async () => {
  const process = await program("ticket-triage");
  const state = opened(process);
  assert.deepEqual(openWork(state), ["TriageTicket"]);
  rollsBack(process, state, userTask(ticket, "TriageTicket", [bind("severity", "medium")]));
});

for (const [severity, routed] of [["high", "Escalate"], ["low", "AutoClose"]] as const) {
  test(`XND-ROUTE-01: a ${severity} triage routes to ${routed}`, async () => {
    const process = await program("ticket-triage");
    const state = commit(process, ticket, opened(process), userTask(ticket, "TriageTicket", [bind("severity", severity)]));
    assert.deepEqual(openWork(state), [routed]);
  });
}
