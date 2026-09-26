import type { DefinitionVersionStartCommand } from "../platform/contracts/src/definition-start-command.ts";
import type { MvpBpmnCapabilityId } from "./mvp-capabilities.ts";

export type ProcessShowcaseEntry = Readonly<{
  id: string;
  title: string;
  businessPurpose: string;
  sourcePath: string;
  sha256: string;
  profile: string;
  xml: string;
  capabilityIds: ReadonlyArray<MvpBpmnCapabilityId>;
  pipelineCaseId: string | null;
  browserEvidence: "journeyBacked" | "guidedJourneyBacked" | "notCatalogReady";
  browserLimit: string;
  showcase: Readonly<{
    mode: "human" | "guided";
    tryIt: string;
    start: DefinitionVersionStartCommand;
  }> | null;
}>;

/** Curated evaluation paths reuse retained sources and neutral runnable-MVP configurations. */
export const rcShowcases = [
  {
    modelId: "request-review-with-form",
    mode: "human",
    configuration: "user-task-assignment-form-metadata.json",
    tryIt: "Start, open Work, claim the review, choose an approval value and complete it. Inspect the completed instance and operator history.",
  },
  {
    modelId: "parallel-content-and-risk-review",
    mode: "human",
    configuration: "parallel-user-task-assignment-form-metadata.json",
    tryIt: "Claim and complete content and risk reviews separately. After the first review the process still waits; after both it completes.",
  },
  {
    modelId: "expense-exception-review",
    mode: "human",
    configuration: "structured-human-work.json",
    tryIt: "Claim the expense review in Work, fill the typed form and choose Approve, Request changes or Abort. Compare the resulting route and operator history.",
  },
  {
    modelId: "ordered-batch-document-review",
    mode: "guided",
    configuration: "sequential-multi-instance-user-task.json",
    tryIt: "Watch a simulated reviewer process contract, invoice and receipt in order. Inspect the ordered result collection and the shared deadline in History.",
  },
  {
    modelId: "parallel-risk-review-all",
    mode: "guided",
    configuration: "parallel-multi-instance-user-task.json",
    tryIt: "Watch simulated reviewers complete a bounded parallel batch. Compare independent completion with the index-ordered result collection.",
  },
  {
    modelId: "external-service-recording",
    mode: "guided",
    configuration: "service-task-effect.json",
    tryIt: "Start an automated service process and inspect its completed History. The integration is a configured simulation; durable execution uses the real Temporal host.",
  },
  {
    modelId: "mapped-service-result",
    mode: "guided",
    configuration: "mapped-success-service-task.json",
    tryIt: "Inspect how a simulated service result becomes published Process data through the model's declared output mapping.",
  },
  {
    modelId: "invoice-receipt-wait",
    mode: "guided",
    configuration: "message-addressed-receive-task.json",
    tryIt: "Watch an invoice wait resume when the simulated producer answers the published Message subscription. Inspect delivery and completion in History.",
  },
  {
    modelId: "claim-assessment-with-input-and-decision",
    mode: "guided",
    configuration: "activity-data-input-output-user-task.json",
    tryIt: "Inspect the supplied claim context and the simulated assessor's required decision. Compare task input with the mapped Process output.",
  },
  {
    modelId: "application-subscription-boundary-message",
    mode: "guided",
    configuration: "repeatable-event-subscriptions.json",
    tryIt: "Watch two simulated reminder Messages create separate handler occurrences while review remains active. Inspect exact handler completion and subscription cleanup.",
  },
  {
    modelId: "confirmed-travel-cancellation",
    mode: "guided",
    configuration: "compensation.json",
    tryIt: "Watch simulated reservations complete before cancellation reverses completed work. Inspect compensation order and retained travel context; no real bookings are made.",
  },
  {
    modelId: "reservation-withdrawal",
    mode: "guided",
    configuration: "transaction-cancellation.json",
    tryIt: "Withdraw a simulated reservation inside a Transaction. Inspect compensation before the Cancel Boundary continuation and final acknowledgement.",
  },
] as const;
