import type {
  ProcessInstanceSearchPage,
  PublicIncident,
  PublicIncidentSnapshot,
  WorkTaskSnapshot,
} from "@bpmn-lean/platform-contracts";

import type { PreparedDemoScenario } from "./demo-preparation.ts";
import { DemoScenario } from "./demo-plan.ts";

/** Checks only Product 2 public state that the presenter path consumes. */
export function isAudienceStateReady(
  prepared: ReadonlyArray<PreparedDemoScenario>,
  work: WorkTaskSnapshot,
  incidents: PublicIncidentSnapshot,
  batch: ProcessInstanceSearchPage,
): boolean {
  const expense = findPrepared(prepared, DemoScenario.ExpenseException);
  const natural = findPrepared(prepared, DemoScenario.PurchaseOrderReview);
  const deadline = findPrepared(prepared, DemoScenario.DeadlineEscalation);
  const retry = findPrepared(prepared, DemoScenario.RetryableIncident);
  const cancellation = findPrepared(prepared, DemoScenario.CancellableIncident);
  if (
    expense === undefined ||
    natural === undefined ||
    deadline === undefined ||
    retry === undefined ||
    cancellation === undefined
  ) {
    return false;
  }
  const [task] = work.tasks;
  if (
    work.tasks.length !== 1 ||
    task?.hostingInstance.processInstanceId !== expense.processInstanceId ||
    task.task.id.processInstanceId !== expense.processInstanceId ||
    task.task.id.elementId !== "ReviewException" ||
    task.task.id.activation !== 1 ||
    !task.claimableByCurrentActor ||
    task.claim !== null
  ) {
    return false;
  }
  if (
    incidents.incidents.length !== 2 ||
    !hasIncident(incidents.incidents, retry.processInstanceId, ["retryIncident"]) ||
    !hasIncident(incidents.incidents, cancellation.processInstanceId, [
      "retryIncident",
      "cancelIncidentProcess",
    ])
  ) {
    return false;
  }
  if (batch.instances.length !== 2 || batch.nextCursor !== null) {
    return false;
  }
  return hasBatchInstance(
    batch,
    natural.processInstanceId,
    "demo-purchase-order-review.bpmn",
  ) && hasBatchInstance(
    batch,
    deadline.processInstanceId,
    "demo-deadline-escalation.bpmn",
  );
}

function findPrepared(
  prepared: ReadonlyArray<PreparedDemoScenario>,
  scenario: DemoScenario,
) {
  return prepared.find((candidate) => candidate.scenario === scenario)?.instance;
}

function hasIncident(
  incidents: ReadonlyArray<PublicIncident>,
  processInstanceId: string,
  interactionKinds: ReadonlyArray<PublicIncident["availableInteractions"][number]["kind"]>,
): boolean {
  const found = incidents.find(({ hostingInstance }) =>
    hostingInstance.processInstanceId === processInstanceId
  );
  return found !== undefined &&
    found.incident.id.effectId.processInstanceId === processInstanceId &&
    found.incident.id.effectId.elementId === "ServiceTask_Record" &&
    found.incident.id.effectId.activation === 1 &&
    found.incident.id.generation === 1 &&
    sameStrings(
      found.availableInteractions.map(({ kind }) => kind),
      interactionKinds,
    );
}

function hasBatchInstance(
  batch: ProcessInstanceSearchPage,
  processInstanceId: string,
  sourceId: string,
): boolean {
  return batch.instances.some((instance) =>
    instance.processInstanceId === processInstanceId &&
    instance.definition.processId === "Process_SequentialMultiInstanceReview" &&
    instance.definition.source.id === sourceId
  );
}

function sameStrings(left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
