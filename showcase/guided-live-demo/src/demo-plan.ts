import type { DefinitionVersionStartCommand } from "@bpmn-lean/platform-contracts";
import { StimulusKind, VariableValueKind } from "@bpmn-lean/semantic-core";
import type { HostInteractionResponse } from "@bpmn-lean/temporal-runner";

export const DemoScenario = {
  ExpenseException: "expenseException",
  PurchaseOrderReview: "purchaseOrderReview",
  DeadlineEscalation: "deadlineEscalation",
  RetryableIncident: "retryableIncident",
  CancellableIncident: "cancellableIncident",
} as const;

export type DemoScenario = typeof DemoScenario[keyof typeof DemoScenario];

export const DemoSource = {
  ExpenseException: "expense-exception-review/process.bpmn",
  SequentialMultiInstance: "sequential-multi-instance/process.bpmn",
  ServiceTaskEffect: "service-task-effect/process.bpmn",
} as const;

export type DemoPlanEntry = Readonly<{
  scenario: DemoScenario;
  sourceFile: typeof DemoSource[keyof typeof DemoSource];
  sourceId: string;
  semanticProfile: string;
  initialVariables: DefinitionVersionStartCommand["initialVariables"];
  responses: ReadonlyArray<HostInteractionResponse>;
}>;

const batchReviewInput = [{
  name: "DataObjectReference_InputItems",
  value: {
    kind: VariableValueKind.StringList,
    value: ["contract", "invoice", "receipt"],
  },
}] as const;

const naturalReviewResponses = ["accepted", "flagged", "archived"].map((value) => ({
  kind: StimulusKind.CompleteUserTaskInstance,
  elementId: "UserTask_Review",
  delayMs: 1,
  inputVariableNames: [],
  submittedValues: [{
    name: "DataOutput_CurrentResult",
    value: { kind: VariableValueKind.String, value },
  }],
})) satisfies ReadonlyArray<HostInteractionResponse>;

const deadlineResponses = [{
  kind: StimulusKind.CompleteUserTaskInstance,
  elementId: "UserTask_Review",
  delayMs: 1,
  inputVariableNames: [],
  submittedValues: [{
    name: "DataOutput_CurrentResult",
    value: { kind: VariableValueKind.String, value: "accepted" },
  }],
}, {
  kind: StimulusKind.CompleteUserTaskInstance,
  elementId: "UserTask_Escalation",
  delayMs: 1,
  inputVariableNames: [],
  submittedValues: [],
}] satisfies ReadonlyArray<HostInteractionResponse>;

export const guidedDemoPlan = [{
  scenario: DemoScenario.ExpenseException,
  sourceFile: DemoSource.ExpenseException,
  sourceId: "demo-expense-exception-review.bpmn",
  semanticProfile: "bpmn-2.0.2-bpmn-lean-structured-human-work-draft",
  initialVariables: [],
  responses: [],
}, {
  scenario: DemoScenario.PurchaseOrderReview,
  sourceFile: DemoSource.SequentialMultiInstance,
  sourceId: "demo-purchase-order-review.bpmn",
  semanticProfile: "bpmn-2.0.2-sequential-multi-instance-user-task-draft",
  initialVariables: batchReviewInput,
  responses: naturalReviewResponses,
}, {
  scenario: DemoScenario.DeadlineEscalation,
  sourceFile: DemoSource.SequentialMultiInstance,
  sourceId: "demo-deadline-escalation.bpmn",
  semanticProfile: "bpmn-2.0.2-sequential-multi-instance-user-task-draft",
  initialVariables: batchReviewInput,
  responses: deadlineResponses,
}, {
  scenario: DemoScenario.RetryableIncident,
  sourceFile: DemoSource.ServiceTaskEffect,
  sourceId: "demo-retryable-service-failure.bpmn",
  semanticProfile: "cibseven-2.2.0-service-task-incident-draft",
  initialVariables: [],
  responses: [],
}, {
  scenario: DemoScenario.CancellableIncident,
  sourceFile: DemoSource.ServiceTaskEffect,
  sourceId: "demo-cancellable-service-failure.bpmn",
  semanticProfile: "cibseven-2.2.0-service-task-incident-cancellation-draft",
  initialVariables: [],
  responses: [],
}] as const satisfies ReadonlyArray<DemoPlanEntry>;
