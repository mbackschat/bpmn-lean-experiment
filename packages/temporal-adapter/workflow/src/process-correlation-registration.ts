import {
  ScenarioStepKind,
  StimulusKind,
  projectCorrelatedMessageCandidate,
} from "@bpmn-lean/semantic-core";
import type {
  CorrelatedMessageAddress,
  CorrelatedMessageCandidate,
  DeliverPayloadMessageStimulus,
  MessageSubscriptionId,
  RuntimeState,
  ScenarioStep,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import {
  defineQuery,
  setHandler,
} from "@temporalio/workflow";
import {
  ProcessCorrelationRegistrationPhase,
  bpmnProcessCorrelationCandidateQueryName,
  requireProcessCorrelationCandidateQueryRequest,
  requireCorrelationCandidateRegistrationRequest,
  sameProcessCorrelationCandidateQuery,
} from "@bpmn-lean/temporal-protocol";
import type {
  ProcessCorrelationCandidateQueryRequest,
  ProcessCorrelationRegistrationStage,
} from "@bpmn-lean/temporal-protocol";

export type ProcessCorrelationRegistrationStageInput = Readonly<{
  program: SemanticProcessProgram;
  committedState: RuntimeState;
  stimulus: DeliverPayloadMessageStimulus;
  step: ScenarioStep;
  processWorkflowId: string;
  committedAtEpochMs: number;
}>;

export const bpmnProcessCorrelationCandidateQuery = defineQuery<
  CorrelatedMessageCandidate | null,
  [request: ProcessCorrelationCandidateQueryRequest]
>(bpmnProcessCorrelationCandidateQueryName);

export function registerProcessCorrelationCandidateQuery(
  program: SemanticProcessProgram,
  currentState: () => RuntimeState,
): void {
  setHandler(bpmnProcessCorrelationCandidateQuery, (candidateRequest) => {
    const request = requireProcessCorrelationCandidateQueryRequest(
      candidateRequest,
    );
    return projectProcessCorrelationCandidateQuery(
      program,
      currentState(),
      request.address,
      request.subscriptionId,
    );
  });
}

/** Stages only the direct payload transition that first creates one correlated candidate. */
export function createProcessCorrelationRegistrationStage(
  input: ProcessCorrelationRegistrationStageInput,
): ProcessCorrelationRegistrationStage | null {
  if (
    input.stimulus.kind !== StimulusKind.DeliverPayloadMessage ||
    input.step.kind !== ScenarioStepKind.Committed
  ) {
    return null;
  }
  const before = projectCorrelatedMessageCandidate(
    input.program,
    input.committedState,
  );
  const candidate = projectCorrelatedMessageCandidate(
    input.program,
    input.step.state,
  );
  if (before !== null || candidate === null) {
    return null;
  }
  if (
    input.step.publication === null ||
    input.step.flowNodeOccurrenceLifecycles === null
  ) {
    throw new TypeError(
      "Correlated candidate successor has no complete staged publication",
    );
  }
  if (
    input.processWorkflowId.length === 0 ||
    !Number.isSafeInteger(input.committedAtEpochMs) ||
    input.committedAtEpochMs < 0
  ) {
    throw new TypeError("Correlation registration staging identity is malformed");
  }
  const registration = requireCorrelationCandidateRegistrationRequest({
    transactionId: input.stimulus.commandId,
    candidate,
    processLocator: { workflowId: input.processWorkflowId },
  });
  return {
    phase: ProcessCorrelationRegistrationPhase.Prepare,
    registration,
    preState: input.committedState,
    step: input.step,
    stimulus: input.stimulus,
    committedAtEpochMs: input.committedAtEpochMs,
  };
}

export function projectProcessCorrelationCandidateQuery(
  program: SemanticProcessProgram,
  state: RuntimeState,
  address: CorrelatedMessageAddress,
  subscriptionId: MessageSubscriptionId,
): CorrelatedMessageCandidate | null {
  const request: ProcessCorrelationCandidateQueryRequest = {
    address,
    subscriptionId,
  };
  const candidate = projectCorrelatedMessageCandidate(program, state);
  return sameProcessCorrelationCandidateQuery(candidate, request)
    ? candidate
    : null;
}
