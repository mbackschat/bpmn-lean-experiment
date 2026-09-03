import {
  CommandOutcome,
} from "@bpmn-lean/semantic-core";
import type {
  CanonicalObservation,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import { ActivityFailure } from "@temporalio/workflow";

import {
  CorrelationRegistrationFailureKind,
  ProcessCorrelationRegistrationPhase,
  ProcessCorrelationRegistrationResolutionKind,
  productionCorrelationIngressConfiguration,
  requireProcessCorrelationRegistrationResolution,
} from "@bpmn-lean/temporal-protocol";
import type {
  ProcessCorrelationRegistrationActivityRequest,
  ProcessCorrelationRegistrationStage,
} from "@bpmn-lean/temporal-protocol";

import {
  commandOutcome,
  integrateCommandPublication,
  recordCommandPublicationOutcome,
} from "./command-publication-integration.js";
import type {
  CommandPublicationState,
} from "./command-publication-integration.js";
import {
  WorkflowRunRetentionPreflightKind,
  preflightWorkflowRunRetentionCandidate,
} from "./workflow-run-retention.js";
import type {
  WorkflowRunRetentionState,
} from "./workflow-run-retention.js";
import {
  WorkflowSemanticCandidatePreflightKind,
  preflightWorkflowSemanticCandidate,
} from "./workflow-semantic-candidate.js";

export enum ProcessCorrelationRegistrationCycleKind {
  Retry = "retry",
  CommitSuccessor = "commitSuccessor",
  CompleteOpening = "completeOpening",
  FailOpening = "failOpening",
}

export type ProcessCorrelationRegistrationCycle =
  | Readonly<{ kind: ProcessCorrelationRegistrationCycleKind.Retry }>
  | Readonly<{
      kind: ProcessCorrelationRegistrationCycleKind.CommitSuccessor;
      stage: ProcessCorrelationRegistrationStage;
      publication: CommandPublicationState;
      observations: ReadonlyArray<CanonicalObservation>;
      retention: WorkflowRunRetentionState;
    }>
  | Readonly<{
      kind: ProcessCorrelationRegistrationCycleKind.CompleteOpening;
      publication: CommandPublicationState;
      outcome: CommandOutcome;
    }>
  | Readonly<{
      kind: ProcessCorrelationRegistrationCycleKind.FailOpening;
      failureKind: CorrelationRegistrationFailureKind;
    }>;

export type ProcessCorrelationRegistrationCycleInput = Readonly<{
  program: SemanticProcessProgram;
  stage: ProcessCorrelationRegistrationStage;
  publication: CommandPublicationState;
  traceEntries: number;
  retention: WorkflowRunRetentionState;
  taskQueue: string;
  resolve: (request: ProcessCorrelationRegistrationActivityRequest) => Promise<unknown>;
  retryDelay: () => Promise<void>;
}>;

/** Resolves one durable registration phase without mutating retained Workflow state. */
export async function runProcessCorrelationRegistrationCycle(
  input: ProcessCorrelationRegistrationCycleInput,
): Promise<ProcessCorrelationRegistrationCycle> {
  const request = activityRequest(input.stage, input.taskQueue);
  let resolution;
  try {
    resolution = requireProcessCorrelationRegistrationResolution(
      await input.resolve(request),
      request,
    );
  } catch (error: unknown) {
    if (!(error instanceof ActivityFailure)) {
      throw error;
    }
    await input.retryDelay();
    return { kind: ProcessCorrelationRegistrationCycleKind.Retry };
  }
  switch (resolution.kind) {
    case ProcessCorrelationRegistrationResolutionKind.Prepared:
      return preparedCycle(input);
    case ProcessCorrelationRegistrationResolutionKind.Finalized: {
      const publication = recordCommandPublicationOutcome(
        input.publication,
        input.stage.stimulus,
        input.stage.step.observations,
      );
      const outcome = commandOutcome(
        publication,
        input.stage.stimulus.commandId,
      );
      if (outcome === undefined) {
        throw new TypeError(
          "Finalized correlation registration lost its command outcome",
        );
      }
      return {
        kind: ProcessCorrelationRegistrationCycleKind.CompleteOpening,
        publication,
        outcome,
      };
    }
    case ProcessCorrelationRegistrationResolutionKind.CandidateCapacity:
      return {
        kind: ProcessCorrelationRegistrationCycleKind.FailOpening,
        failureKind: CorrelationRegistrationFailureKind.CandidateCapacity,
      };
    case ProcessCorrelationRegistrationResolutionKind.AddressQuarantined:
      return {
        kind: ProcessCorrelationRegistrationCycleKind.FailOpening,
        failureKind: CorrelationRegistrationFailureKind.AddressQuarantined,
      };
    case ProcessCorrelationRegistrationResolutionKind.DeferredByScan:
    case ProcessCorrelationRegistrationResolutionKind.IngressUnavailable:
      await input.retryDelay();
      return { kind: ProcessCorrelationRegistrationCycleKind.Retry };
    default:
      return assertNever(resolution);
  }
}

function preparedCycle(
  input: ProcessCorrelationRegistrationCycleInput,
): ProcessCorrelationRegistrationCycle {
  const stagedPublication = integrateCommandPublication(
    input.program,
    input.publication,
    input.stage.stimulus,
    input.stage.step,
    () => input.stage.committedAtEpochMs,
  );
  const completePublication = recordCommandPublicationOutcome(
    stagedPublication,
    input.stage.stimulus,
    input.stage.step.observations,
  );
  const semanticCapacity = preflightWorkflowSemanticCandidate({
    state: input.stage.step.state,
    publicationBefore: input.publication,
    publication: completePublication,
  });
  if (semanticCapacity.kind !== WorkflowSemanticCandidatePreflightKind.Ready) {
    throw new TypeError(
      "Prepared correlation registration changed semantic capacity",
    );
  }
  const retention = preflightWorkflowRunRetentionCandidate(input.retention, {
    traceEntriesBefore: input.traceEntries,
    observations: input.stage.step.observations,
    publicationBefore: input.publication,
    publication: completePublication,
  });
  if (retention.kind !== WorkflowRunRetentionPreflightKind.Ready) {
    throw new TypeError(
      "Prepared correlation registration changed retained capacity",
    );
  }
  return {
    kind: ProcessCorrelationRegistrationCycleKind.CommitSuccessor,
    stage: {
      ...input.stage,
      phase: ProcessCorrelationRegistrationPhase.Finalize,
    },
    publication: stagedPublication,
    observations: input.stage.step.observations,
    retention: retention.successor,
  };
}

function activityRequest(
  stage: ProcessCorrelationRegistrationStage,
  taskQueue: string,
): ProcessCorrelationRegistrationActivityRequest {
  return {
    phase: stage.phase,
    taskQueue,
    configuration: productionCorrelationIngressConfiguration,
    registration: stage.registration,
  };
}

function assertNever(value: never): never {
  throw new TypeError(
    `Unsupported Process correlation registration resolution: ${String(value)}`,
  );
}
