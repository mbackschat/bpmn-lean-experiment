import type {
  CurrentCommittedExecution,
  ProcessInstanceSearchPage,
  PublicIncident,
  PublicIncidentSnapshot,
  WorkTaskSnapshot,
} from "@bpmn-lean/platform-contracts";

import type { PreparedDemoScenario } from "./demo-preparation.ts";
import { DemoScenario } from "./demo-plan.ts";

export type AudienceExecutionEvidence = Readonly<{
  processInstanceId: string;
  status: CurrentCommittedExecution["state"]["status"];
  terminalOutput: ReadonlyArray<string> | null;
  timerFirings: number;
}>;

/** Checks only Product 2 public state that the presenter path consumes. */
export function isAudienceStateReady(
  prepared: ReadonlyArray<PreparedDemoScenario>,
  work: WorkTaskSnapshot,
  incidents: PublicIncidentSnapshot,
  batch: ProcessInstanceSearchPage,
  executions: ReadonlyArray<AudienceExecutionEvidence>,
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
  if (!hasBatchInstance(
    batch,
    natural.processInstanceId,
    "demo-purchase-order-review.bpmn",
  ) || !hasBatchInstance(
    batch,
    deadline.processInstanceId,
    "demo-deadline-escalation.bpmn",
  )) {
    return false;
  }
  return executions.length === 2 && hasNaturalEvidence(
    executions,
    natural.processInstanceId,
  ) && hasDeadlineEvidence(executions, deadline.processInstanceId);
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

function hasNaturalEvidence(
  executions: ReadonlyArray<AudienceExecutionEvidence>,
  processInstanceId: string,
): boolean {
  const evidence = executions.find((candidate) =>
    candidate.processInstanceId === processInstanceId
  );
  return evidence?.status === "completed" && evidence.timerFirings === 0 &&
    evidence.terminalOutput !== null && sameStrings(
      evidence.terminalOutput,
      ["accepted", "flagged", "archived"],
    );
}

function hasDeadlineEvidence(
  executions: ReadonlyArray<AudienceExecutionEvidence>,
  processInstanceId: string,
): boolean {
  const evidence = executions.find((candidate) =>
    candidate.processInstanceId === processInstanceId
  );
  return evidence?.status === "completed" && evidence.timerFirings === 1 &&
    evidence.terminalOutput === null;
}

function sameStrings(left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
