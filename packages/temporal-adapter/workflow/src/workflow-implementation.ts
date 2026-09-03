import {
  CommandOutcome,
  ScenarioStepKind,
  StimulusKind,
  advanceScenario,
  deployProcess,
  initialState,
  projectOpenUserTasks,
  stimulusCommandId,
} from "@bpmn-lean/semantic-core";
import type {
  CanonicalObservation,
  OpenUserTask,
  RuntimeState,
  SemanticProcessProgram,
  ProcessStartStimulus,
  Stimulus,
} from "@bpmn-lean/semantic-core";
import {
  ApplicationFailure,
  allHandlersFinished,
  condition,
  continueAsNew,
  defineQuery,
  patched,
  setHandler,
  sleep,
  workflowInfo,
} from "@temporalio/workflow";

import {
  MessageDeliveryResolutionKind,
  bpmnMessageDeliveryResultQueryName,
  bpmnOpenUserTasksQueryName,
  bpmnProcessCorrelationRegistrationPatchId,
  bpmnWorkflowChainPatchId,
  bpmnUserTaskDetailQueryName,
  bpmnTraceQueryName,
} from "@bpmn-lean/temporal-protocol";
import type {
  BpmnMessageDeliveryResultQueryArguments,
  BpmnUserTaskDetailQueryArguments,
  BpmnWorkflowContinuationPublicationV1,
  BpmnWorkflowContinuationCorrelationV1,
  BpmnWorkflowContinuationRecoveryV1,
  BpmnWorkflowContinuationStateV1,
  BpmnWorkflowHostInputV1,
  MessageDeliveryResolution,
  UserTaskDetail,
  WorkflowTerminalResultV1,
} from "@bpmn-lean/temporal-protocol";
import type {
  EffectActivityResult,
  EffectRequest,
} from "@bpmn-lean/temporal-protocol";
import {
  completedMessageDeliveryRecords,
  findMessageDeliveryResolution,
  recordCorrelationRegistrationFailure,
  recordMessageDeliveryOutcome,
} from "./message-delivery-ledger.js";
import {
  ActivationDrain,
} from "./activation-tagged-readiness.js";
import {
  createBoundedDeadlineSchedulers,
} from "./bounded-deadline-scheduler.js";
import {
  createTemporalCompensationFrontierScheduler,
} from "./compensation-frontier-scheduler.js";
import {
  createEventRaceReadinessScheduler,
} from "./event-race-readiness-scheduler.js";
import {
  createMessageBoundedActivityReadinessScheduler,
} from "./message-bounded-activity-readiness-scheduler.js";
import {
  projectUserTaskDetail,
} from "@bpmn-lean/temporal-protocol";
import {
  failRejectedHostEffectResult,
} from "./effect-execution-host.js";
import { effectActivityPolicyForProfile } from "./effect-activity-policy.js";
import { registerIncidentOperationsQueryHandler } from "./incident-operations-query-handler.js";
import {
  commandOutcome,
  createCommandPublicationState,
  integrateCommandPublication,
  recordCommandPublicationOutcome,
} from "./command-publication-integration.js";
import {
  isTerminalProcessState,
  terminalProcessReceipt,
} from "./terminal-process-receipt.js";
import {
  completeWorkflowChainTerminalResult,
  terminalWorkflowResult,
} from "./workflow-terminal-completion.js";
import {
  HostReadinessAction,
  enqueueStimulus,
  waitForHostReadiness,
} from "./workflow-host-readiness.js";
import { WorkflowCommandRecoveryPreflightKind } from "./workflow-command-recovery.js";
import type {
  WorkflowCommandRecoveryAdmission,
} from "./workflow-command-recovery.js";
import {
  registerWorkflowChainRecoveryQuery,
  WorkflowChainStableCheckpointKind,
} from "./workflow-chain-capacity.js";
import type {
  WorkflowChainObservedCapacityBound,
} from "./workflow-chain-capacity.js";
import {
  buildWorkflowChainSuccessor,
  initializeWorkflowChain,
  isExternallyRecoverableStimulus,
  workflowCommandIdentityConflict,
  WorkflowChainFenceState,
} from "./workflow-chain-continuation.js";
import { workflowChainRolloverTriggered } from "./workflow-event-history-capacity.js";
import {
  WorkflowSemanticCandidatePreflightKind,
  preflightWorkflowSemanticCandidate,
} from "./workflow-semantic-candidate.js";
import {
  WorkflowRunRetentionPreflightKind,
  initializeWorkflowRunRetention,
  preflightWorkflowRunRetentionCandidate,
} from "./workflow-run-retention.js";
import { workflowRolloverPermitted } from "./workflow-rollover-safety.js";
import type {
  WorkflowRunRetentionPreflight,
} from "./workflow-run-retention.js";
import type {
  WorkflowChainRuntime,
} from "./workflow-chain-continuation.js";
import { registerWorkflowCommandIngress } from "./workflow-command-ingress.js";
import { WorkflowCommandCapacityPreflightKind } from "./workflow-command-capacity.js";
import { registerWorkflowPublicationQueries } from "./workflow-publication-segments.js";
import {
  createProcessCorrelationRegistrationStage,
  registerProcessCorrelationCandidateQuery,
} from "./process-correlation-registration.js";
import {
  resolveBpmnCorrelationCandidateRegistration,
} from "./correlation-registration-activities.js";
import {
  ProcessCorrelationRegistrationCycleKind,
  runProcessCorrelationRegistrationCycle,
} from "./process-correlation-registration-cycle.js";

export const bpmnTraceQuery =
  defineQuery<ReadonlyArray<CanonicalObservation>>(bpmnTraceQueryName);
export const bpmnOpenUserTasksQuery =
  defineQuery<ReadonlyArray<OpenUserTask>>(bpmnOpenUserTasksQueryName);
export const bpmnUserTaskDetailQuery = defineQuery<
  UserTaskDetail | null,
  BpmnUserTaskDetailQueryArguments
>(bpmnUserTaskDetailQueryName);
export const bpmnMessageDeliveryResultQuery = defineQuery<
  MessageDeliveryResolution | null,
  BpmnMessageDeliveryResultQueryArguments
>(bpmnMessageDeliveryResultQueryName);

export async function runBpmnProcessWithHostEffects(
  start: ProcessStartStimulus,
  semanticProcess: SemanticProcessProgram,
  waitForTimer: (durationMs: number) => Promise<void>,
  executeEffect: (
    request: EffectRequest,
  ) => Promise<EffectActivityResult>,
  eventRaceActivationDrain: ActivationDrain = ActivationDrain.Required,
  hostInput?: BpmnWorkflowHostInputV1,
  carriedState?: BpmnWorkflowContinuationStateV1,
  carriedRecovery?: BpmnWorkflowContinuationRecoveryV1,
  carriedPublication?: BpmnWorkflowContinuationPublicationV1,
  carriedCorrelation?: BpmnWorkflowContinuationCorrelationV1,
): Promise<WorkflowExecutionResult> {
  const workflowChainPatchActive = hostInput !== undefined &&
    patched(bpmnWorkflowChainPatchId);
  const correlationRegistrationPatchActive = workflowChainPatchActive &&
    patched(bpmnProcessCorrelationRegistrationPatchId);
  const chainInitialization = workflowChainPatchActive
    ? initializeWorkflowChain(
        start,
        semanticProcess,
        hostInput,
        carriedState,
        carriedRecovery,
        carriedPublication,
        carriedCorrelation,
        correlationRegistrationPatchActive,
      )
    : null;
  const deployment = chainInitialization?.restored === null ||
      chainInitialization === null
    ? deployProcess(start, semanticProcess)
    : null;
  if (deployment !== null && deployment.outcome !== CommandOutcome.Committed) {
    throw ApplicationFailure.nonRetryable(
      "Workflow input is not one admitted Semantic Process execution",
      "BpmnProcessAdmissionFailure",
    );
  }

  const trace: CanonicalObservation[] = deployment === null
    ? []
    : [deployment.observation];
  const pendingStimuli: Stimulus[] = [];
  const acceptedStimuli: Stimulus[] = [];
  const messageDeliveryResolutions: MessageDeliveryResolution[] = [
    ...(chainInitialization?.restored?.messageDeliveryRecords ?? []),
  ];
  let state: RuntimeState = chainInitialization?.restored?.state ?? initialState;
  let commandPublication = chainInitialization?.restored?.publication ??
    createCommandPublicationState(semanticProcess, start.instanceId);
  let correlationRegistration =
    chainInitialization?.restored?.correlationRegistration ?? null;
  if (correlationRegistration !== null) {
    acceptedStimuli.push(correlationRegistration.stimulus);
    messageDeliveryResolutions.push({
      kind: MessageDeliveryResolutionKind.Pending,
      stimulus: correlationRegistration.stimulus,
    });
  }
  const workflowChain = chainInitialization?.runtime ?? null;
  let runRetention = workflowChain === null
    ? null
    : initializeWorkflowRunRetention(trace, commandPublication);
  let workflowChainFence = WorkflowChainFenceState.Active;
  const reserveStimulus = (stimulus: Stimulus): boolean => {
    if (workflowChain === null) {
      return true;
    }
    const preflight = workflowChain.commandCapacity.reserveStimulus(stimulus);
    switch (preflight.kind) {
      case WorkflowCommandCapacityPreflightKind.Ready:
        return true;
      case WorkflowCommandCapacityPreflightKind.CapacityExceeded:
        workflowChain.capacity.retainObservedCapacity(
          preflight.failure,
          commandPublication.execution.headRevision,
        );
        return false;
      case WorkflowCommandCapacityPreflightKind.Rollover:
        throw new TypeError("Direct stimulus reservation cannot request rollover");
      default:
        return assertNever(preflight);
    }
  };
  const effectActivityPolicy = effectActivityPolicyForProfile(
    semanticProcess.identity.semanticProfile,
  );
  const eventRaceScheduler = createEventRaceReadinessScheduler(
    waitForTimer,
    eventRaceActivationDrain,
  );
  const messageBoundedActivityScheduler =
    createMessageBoundedActivityReadinessScheduler(semanticProcess);
  const boundedDeadlineSchedulers = createBoundedDeadlineSchedulers(
    semanticProcess,
    waitForTimer,
  );
  const failEffectCapacity = (
    failure: WorkflowChainObservedCapacityBound,
  ): never => {
    if (workflowChain === null) {
      throw ApplicationFailure.nonRetryable(
        "Effect Activity capacity is exhausted",
        "BpmnEffectActivityCapacityExceeded",
        failure,
      );
    }
    throw workflowChain.capacity.applicationFailureForObservedCapacity(
      failure,
      commandPublication.execution.headRevision,
    );
  };
  const compensationScheduler = createTemporalCompensationFrontierScheduler(
    semanticProcess,
    executeEffect,
    failEffectCapacity,
  );
  const boundedDeadlineSchedulerFor = (candidate: RuntimeState) =>
    boundedDeadlineSchedulers.find((scheduler) =>
      scheduler.ownsCommittedDeadline(candidate)
    );

  // A successor resumes only committed state. Pending host work and the original Start never cross
  // the Run boundary, while an initial Run must place Start before any registered handler can run.
  if (chainInitialization?.restored === null || chainInitialization === null) {
    enqueueStimulus(
      acceptedStimuli,
      pendingStimuli,
      start,
      reserveStimulus,
    );
  }

  if (workflowChain !== null) {
    registerWorkflowChainRecoveryQuery(
      start.instanceId,
      workflowChain.recovery,
      workflowChain.capacity,
      () => isTerminalProcessState(state)
        ? terminalProcessReceipt(
            semanticProcess,
            start.instanceId,
            state,
            trace,
          )
        : null,
    );
  }

  registerWorkflowPublicationQueries(
    semanticProcess,
    start.instanceId,
    workflowChain,
    () => commandPublication,
  );
  if (correlationRegistrationPatchActive) {
    registerProcessCorrelationCandidateQuery(semanticProcess, () => state);
  }
  registerIncidentOperationsQueryHandler(semanticProcess, () => state);
  setHandler(bpmnTraceQuery, () => [...trace]);
  setHandler(
    bpmnOpenUserTasksQuery,
    () => projectOpenUserTasks(state),
  );
  setHandler(
    bpmnUserTaskDetailQuery,
    (request) => projectUserTaskDetail(state, request),
  );
  setHandler(
    bpmnMessageDeliveryResultQuery,
    (stimulus) =>
      findMessageDeliveryResolution(
        messageDeliveryResolutions,
        stimulus,
      ) ?? null,
  );
  registerWorkflowCommandIngress({
    processInstanceId: start.instanceId,
    acceptedStimuli,
    pendingStimuli,
    messageDeliveryResolutions,
    workflowChain,
    currentState: () => state,
    currentPublication: () => commandPublication,
    currentFence: () =>
      workflowChainFence === WorkflowChainFenceState.Active &&
        workflowChain?.commandCapacity.rolloverRequested() === true
        ? WorkflowChainFenceState.Rollover
        : workflowChainFence,
    eventRaceScheduler,
    messageBoundedActivityScheduler,
    boundedDeadlineSchedulerFor,
    reserveStimulus,
  });

  while (true) {
    let correlationRegistrationRetryDeferred = false;
    if (correlationRegistration !== null) {
      const stage = correlationRegistration;
      if (runRetention === null || workflowChain === null) {
        throw new TypeError(
          "Correlation registration lost its Workflow-chain runtime",
        );
      }
      const cycle = await runProcessCorrelationRegistrationCycle({
        program: semanticProcess,
        stage,
        publication: commandPublication,
        traceEntries: trace.length,
        retention: runRetention,
        taskQueue: workflowInfo().taskQueue,
        resolve: resolveBpmnCorrelationCandidateRegistration,
        retryDelay: () => sleep("1s"),
      });
      switch (cycle.kind) {
        case ProcessCorrelationRegistrationCycleKind.Retry:
          correlationRegistrationRetryDeferred = true;
          break;
        case ProcessCorrelationRegistrationCycleKind.CommitSuccessor:
          commandPublication = cycle.publication;
          trace.push(...cycle.observations);
          runRetention = cycle.retention;
          state = cycle.stage.step.state;
          correlationRegistration = cycle.stage;
          eventRaceScheduler.reconcileCommittedState(state);
          for (const scheduler of boundedDeadlineSchedulers) {
            scheduler.reconcileCommittedState(state);
          }
          compensationScheduler.reconcileCommittedState(state);
          continue;
        case ProcessCorrelationRegistrationCycleKind.CompleteOpening: {
          const recovery = workflowChain.recovery.preflight(stage.stimulus);
          if (recovery.kind !== WorkflowCommandRecoveryPreflightKind.Admitted) {
            throw new TypeError(
              "Finalized correlation registration changed recovery capacity",
            );
          }
          const record = workflowChain.recovery.record(
            recovery.admission,
            cycle.outcome,
          );
          workflowChain.capacity.observeRecoveryRecord(
            record,
            cycle.publication.execution.headRevision,
          );
          commandPublication = cycle.publication;
          recordMessageDeliveryOutcome(
            messageDeliveryResolutions,
            stage.stimulus,
            cycle.outcome,
          );
          correlationRegistration = null;
          break;
        }
        case ProcessCorrelationRegistrationCycleKind.FailOpening:
          recordCorrelationRegistrationFailure(
            messageDeliveryResolutions,
            stage.stimulus,
            cycle.failureKind,
            stage.registration.candidate.address,
            stage.registration.transactionId,
          );
          correlationRegistration = null;
          break;
        default:
          return assertNever(cycle);
      }
    }

    while (!correlationRegistrationRetryDeferred &&
        correlationRegistration === null && pendingStimuli.length > 0) {
      const stimulus = pendingStimuli.shift();
      if (stimulus === undefined) {
        throw ApplicationFailure.nonRetryable(
          "Semantic input queue lost an accepted stimulus",
          "BpmnSemanticQueueFailure",
        );
      }
      workflowChain?.commandCapacity.releaseStimulus(stimulus);
      if (workflowChain?.capacity.hasPendingFailure() === true) {
        continue;
      }
      let recoveryAdmission: WorkflowCommandRecoveryAdmission | null = null;
      if (
        workflowChain !== null &&
        isExternallyRecoverableStimulus(stimulus)
      ) {
        const preflight = workflowChain.recovery.preflight(stimulus);
        switch (preflight.kind) {
          case WorkflowCommandRecoveryPreflightKind.Resolved:
            continue;
          case WorkflowCommandRecoveryPreflightKind.IdentityConflict:
            throw workflowCommandIdentityConflict(stimulus);
          case WorkflowCommandRecoveryPreflightKind.CapacityExceeded:
            workflowChain.capacity.retainUnseenCapacity(
              workflowChain.recovery,
              stimulus,
              commandPublication.execution.headRevision,
            );
            continue;
          case WorkflowCommandRecoveryPreflightKind.Admitted:
            recoveryAdmission = preflight.admission;
            break;
          default:
            return assertNever(preflight);
        }
      }
      const step = advanceScenario(semanticProcess, state, stimulus);
      const committedAtEpochMs = Date.now();
      const publicationCandidate = integrateCommandPublication(
        semanticProcess,
        commandPublication,
        stimulus,
        step,
        () => committedAtEpochMs,
      );
      if (
        step.kind === ScenarioStepKind.Terminal &&
        stimulus.kind === StimulusKind.CompleteEffect
      ) {
        failRejectedHostEffectResult(state, stimulus);
      }
      const completePublicationCandidate = recordCommandPublicationOutcome(
        publicationCandidate,
        stimulus,
        step.observations,
      );
      let retentionPreflight: Extract<
        WorkflowRunRetentionPreflight,
        { kind: WorkflowRunRetentionPreflightKind.Ready }
      > | null = null;
      if (
        workflowChain !== null &&
        step.kind !== ScenarioStepKind.HarnessFailure
      ) {
        const preflight = preflightWorkflowSemanticCandidate({
          state: step.state,
          publicationBefore: commandPublication,
          publication: completePublicationCandidate,
        });
        switch (preflight.kind) {
          case WorkflowSemanticCandidatePreflightKind.Ready:
            break;
          case WorkflowSemanticCandidatePreflightKind.CapacityExceeded:
            workflowChain.capacity.retainObservedCapacity(
              preflight.failure,
              commandPublication.execution.headRevision,
            );
            continue;
          default:
            return assertNever(preflight);
        }
        if (runRetention === null) {
          throw new TypeError("Workflow chain lost its Run-retention state");
        }
        const retentionCandidate = preflightWorkflowRunRetentionCandidate(
          runRetention,
          {
            traceEntriesBefore: trace.length,
            observations: step.observations,
            publicationBefore: commandPublication,
            publication: completePublicationCandidate,
          },
        );
        switch (retentionCandidate.kind) {
          case WorkflowRunRetentionPreflightKind.Ready:
            retentionPreflight = retentionCandidate;
            break;
          case WorkflowRunRetentionPreflightKind.CapacityExceeded:
            workflowChain.capacity.retainObservedCapacity(
              retentionCandidate.failure,
              commandPublication.execution.headRevision,
            );
            continue;
          default:
            return assertNever(retentionCandidate);
        }
      }
      const stagedCorrelation = correlationRegistrationPatchActive &&
          workflowChain !== null &&
          stimulus.kind === StimulusKind.DeliverPayloadMessage
        ? createProcessCorrelationRegistrationStage({
            program: semanticProcess,
            committedState: state,
            stimulus,
            step,
            processWorkflowId: workflowInfo().workflowId,
            committedAtEpochMs,
          })
        : null;
      if (stagedCorrelation !== null) {
        if (recoveryAdmission === null || workflowChain === null) {
          throw new TypeError(
            "Staged correlation registration has no recovery preflight",
          );
        }
        workflowChain.recovery.releasePreflight(recoveryAdmission);
        correlationRegistration = stagedCorrelation;
        break;
      }
      commandPublication = completePublicationCandidate;
      const outcome = commandOutcome(
        commandPublication,
        stimulusCommandId(stimulus),
      );
      if (recoveryAdmission !== null) {
        if (outcome === undefined) {
          throw ApplicationFailure.nonRetryable(
            `Recoverable command ${stimulusCommandId(stimulus)} has no outcome`,
            "BpmnCommandOutcomeMissing",
          );
        }
        const record = workflowChain?.recovery.record(recoveryAdmission, outcome);
        if (record !== undefined && workflowChain !== null) {
          workflowChain.capacity.observeRecoveryRecord(
            record,
            commandPublication.execution.headRevision,
          );
        }
      }
      if (
        (
          stimulus.kind === StimulusKind.DeliverMessage ||
          stimulus.kind === StimulusKind.DeliverPayloadMessage
        ) &&
        outcome !== undefined
      ) {
        recordMessageDeliveryOutcome(
          messageDeliveryResolutions,
          stimulus,
          outcome,
        );
      }
      trace.push(...step.observations);
      if (retentionPreflight !== null) {
        runRetention = retentionPreflight.successor;
      }
      switch (step.kind) {
        case ScenarioStepKind.Committed:
        case ScenarioStepKind.Terminal:
          state = step.state;
          eventRaceScheduler.reconcileCommittedState(state);
          for (const scheduler of boundedDeadlineSchedulers) {
            scheduler.reconcileCommittedState(state);
          }
          compensationScheduler.reconcileCommittedState(state);
          break;
        case ScenarioStepKind.HarnessFailure:
          throw ApplicationFailure.nonRetryable(
            "Semantic core exceeded its checked closure boundary",
            "BpmnSemanticClosureFailure",
          );
        default:
          return assertNever(step);
      }
    }

    if (
      correlationRegistration !== null &&
      !correlationRegistrationRetryDeferred
    ) {
      continue;
    }

    const processIsTerminal = isTerminalProcessState(state);
    const stableCheckpoint = workflowChain?.capacity.decideStableCheckpoint(processIsTerminal);
    if (processIsTerminal) {
      workflowChainFence = WorkflowChainFenceState.Terminal;
      await Promise.all([
        condition(allHandlersFinished),
        compensationScheduler.waitForIdle(),
      ]);
      if (
        pendingStimuli.length === 0 &&
        allHandlersFinished() &&
        !compensationScheduler.hasUnreconciledActivities()
      ) {
        break;
      }
      continue;
    }

    if (
      workflowChain !== null &&
      stableCheckpoint?.kind ===
        WorkflowChainStableCheckpointKind.CapacityExceeded
    ) {
      await condition(allHandlersFinished);
      if (pendingStimuli.length !== 0 || !allHandlersFinished()) {
        continue;
      }
      throw workflowChain.capacity.applicationFailure();
    }

    if (
      workflowChain !== null &&
      workflowRolloverPermitted({
        requested: workflowChainFence === WorkflowChainFenceState.Rollover ||
          workflowChain.commandCapacity.rolloverRequested() ||
          runRetention?.rolloverRequested === true ||
          workflowChainRolloverTriggered(
            workflowChain,
            runRetention !== null && runRetention.traceEntries > 0,
          ),
        managedBoundaryDeadlineArmed: boundedDeadlineSchedulers.some((scheduler) =>
          scheduler.hasArmedDeadline()
        ),
        managedReadinessCallbackPending:
          messageBoundedActivityScheduler.hasPendingCallbacks(),
        compensationActivityUnreconciled:
          compensationScheduler.hasUnreconciledActivities(),
      })
    ) {
      workflowChainFence = WorkflowChainFenceState.Rollover;
      await condition(allHandlersFinished);
      if (pendingStimuli.length !== 0 || !allHandlersFinished()) {
        continue;
      }
      const successor = buildWorkflowChainSuccessor(
        workflowChain,
        start,
        semanticProcess,
        state,
        commandPublication,
        completedMessageDeliveryRecords(messageDeliveryResolutions),
        correlationRegistration,
        correlationRegistrationPatchActive,
      );
      return await continueAsNew<WorkflowChainWorkflow>(...successor);
    }

    if (correlationRegistrationRetryDeferred) {
      continue;
    }

    const readinessAction = await waitForHostReadiness({
      state,
      semanticProcess,
      pendingStimuli,
      acceptedStimuli,
      eventRaceScheduler,
      messageBoundedActivityScheduler,
      boundedDeadlineSchedulers,
      compensationScheduler,
      waitForTimer,
      executeEffect,
      effectActivityPolicy,
      failCapacity: failEffectCapacity,
      reserveStimulus,
      hostRecheckRequested: () =>
        workflowChain?.capacity.hasPendingFailure() === true ||
        workflowRolloverPermitted({
          requested:
            workflowChain?.commandCapacity.rolloverRequested() === true,
          managedBoundaryDeadlineArmed: boundedDeadlineSchedulers.some((scheduler) =>
            scheduler.hasArmedDeadline()
          ),
          managedReadinessCallbackPending:
            messageBoundedActivityScheduler.hasPendingCallbacks(),
          compensationActivityUnreconciled:
            compensationScheduler.hasUnreconciledActivities(),
        }),
    });
    if (readinessAction === HostReadinessAction.RecheckMainLoop) {
      continue;
    }
  }

  if (workflowChain !== null) {
    return completeWorkflowChainTerminalResult(
      semanticProcess,
      start.instanceId,
      state,
      trace,
      workflowChain.recovery,
      workflowChain.capacity,
      commandPublication.execution.headRevision,
    );
  }
  return terminalWorkflowResult(
    semanticProcess,
    start.instanceId,
    state,
    trace,
    completedMessageDeliveryRecords(messageDeliveryResolutions),
    null,
  );
}

type WorkflowExecutionResult = Awaited<ReturnType<typeof terminalWorkflowResult>>;

type WorkflowChainWorkflow = (
  start: ProcessStartStimulus,
  semanticProcess: SemanticProcessProgram,
  hostInput: BpmnWorkflowHostInputV1,
  carriedState: BpmnWorkflowContinuationStateV1,
  carriedRecovery: BpmnWorkflowContinuationRecoveryV1,
  carriedPublication: BpmnWorkflowContinuationPublicationV1,
  carriedCorrelation?: BpmnWorkflowContinuationCorrelationV1,
) => Promise<WorkflowTerminalResultV1>;

function assertNever(value: never): never {
  throw new TypeError(`Unsupported Temporal adapter variant: ${String(value)}`);
}
