import assert from "node:assert/strict";
import { test } from "node:test";

import { StimulusKind, VariableValueKind } from "@bpmn-lean/semantic-core";

import { DemoScenario, guidedDemoPlan } from "../src/demo-plan.ts";

test("prepares five exact business scenarios from reviewed capabilities", () => {
  assert.deepEqual(guidedDemoPlan.map(({ scenario, sourceId, semanticProfile }) => ({
    scenario,
    sourceId,
    semanticProfile,
  })), [{
    scenario: DemoScenario.ExpenseException,
    sourceId: "demo-expense-exception-review.bpmn",
    semanticProfile: "bpmn-2.0.2-bpmn-lean-structured-human-work-draft",
  }, {
    scenario: DemoScenario.PurchaseOrderReview,
    sourceId: "demo-purchase-order-review.bpmn",
    semanticProfile: "bpmn-2.0.2-sequential-multi-instance-user-task-draft",
  }, {
    scenario: DemoScenario.DeadlineEscalation,
    sourceId: "demo-deadline-escalation.bpmn",
    semanticProfile: "bpmn-2.0.2-sequential-multi-instance-user-task-draft",
  }, {
    scenario: DemoScenario.RetryableIncident,
    sourceId: "demo-retryable-service-failure.bpmn",
    semanticProfile: "cibseven-2.2.0-service-task-incident-draft",
  }, {
    scenario: DemoScenario.CancellableIncident,
    sourceId: "demo-cancellable-service-failure.bpmn",
    semanticProfile: "cibseven-2.2.0-service-task-incident-cancellation-draft",
  }]);
});

test("drives both batch-review outcomes through exact published interactions", () => {
  const natural = guidedDemoPlan.find(({ scenario }) =>
    scenario === DemoScenario.PurchaseOrderReview
  );
  const deadline = guidedDemoPlan.find(({ scenario }) =>
    scenario === DemoScenario.DeadlineEscalation
  );

  assert.deepEqual(natural?.initialVariables, [{
    name: "DataObjectReference_InputItems",
    value: {
      kind: VariableValueKind.StringList,
      value: ["contract", "invoice", "receipt"],
    },
  }]);
  assert.deepEqual(natural?.responses.map(({ kind, elementId }) => ({ kind, elementId })), [
    { kind: StimulusKind.CompleteUserTaskInstance, elementId: "UserTask_Review" },
    { kind: StimulusKind.CompleteUserTaskInstance, elementId: "UserTask_Review" },
    { kind: StimulusKind.CompleteUserTaskInstance, elementId: "UserTask_Review" },
  ]);
  assert.deepEqual(deadline?.responses.map(({ kind, elementId }) => ({ kind, elementId })), [
    { kind: StimulusKind.CompleteUserTaskInstance, elementId: "UserTask_Review" },
    { kind: StimulusKind.CompleteUserTaskInstance, elementId: "UserTask_Escalation" },
  ]);
});

test("leaves the realistic form and both incidents open for the presenter", () => {
  for (const scenario of [
    DemoScenario.ExpenseException,
    DemoScenario.RetryableIncident,
    DemoScenario.CancellableIncident,
  ]) {
    assert.deepEqual(
      guidedDemoPlan.find((candidate) => candidate.scenario === scenario)?.responses,
      [],
    );
  }
});
