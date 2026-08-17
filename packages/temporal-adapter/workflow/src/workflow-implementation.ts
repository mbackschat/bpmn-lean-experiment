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
  CancelIncidentProcessStimulus,
  CanonicalObservation,
  CompleteUserTaskInstanceStimulus,
  DeliverMessageStimulus,
  OpenUserTask,
  RetryIncidentStimulus,
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
  defineSignal,
  defineUpdate,
  patched,
  setHandler,
} from "@temporalio/workflow";

import {
  bpmnBoundedActivitySchedulerUnavailableFailureType,
  bpmnCompleteUserTaskUpdateName,
  bpmnDeliverMessageSignalName,
  bpmnMessageDeliveryResultQueryName,
  bpmnOpenUserTasksQueryName,
  bpmnWorkflowChainPatchId,
  bpmnUserTaskDetailQueryName,
  bpmnTraceQueryName,
  bpmnWorkflowChainCapacityExhaustedFailureType,
  workflowChainProductionLimit,
  WorkflowChainBudgetKind,
} from "@bpmn-lean/temporal-protocol";
import type {
  BpmnCompleteUserTaskUpdateArguments,
  BpmnDeliverMessageSignalArguments,
  BpmnMessageDeliveryResultQueryArguments,
  BpmnUserTaskDetailQueryArguments,
  BpmnWorkflowContinuationPublicationV1,
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
  acceptMessageDelivery,
  completedMessageDeliveryRecords,
  findMessageDeliveryResolution,
  recordMessageDeliveryOutcome,
} from "./message-delivery-ledger.js";
import {
  acceptedStimulus,
  validateCompleteUserTaskUpdate,
  validateDeliverMessageSignal,
} from "./workflow-wire-validation.js";
import {
  ActivationDrain,
} from "./activation-tagged-readiness.js";
import {
  boundedActivityDeadlineFamily,
  boundedScopeDeadlineFamily,
  createBoundedDeadlineScheduler,
  monitoredActivityDeadlineFamily,
} from "./bounded-deadline-scheduler.js";
import {
  createEventRaceReadinessScheduler,
} from "./event-race-readiness-scheduler.js";
import {
  projectUserTaskDetail,
} from "@bpmn-lean/temporal-protocol";
import {
  failRejectedHostEffectResult,
} from "./effect-execution-host.js";
import { effectActivityPolicyForProfile } from "./effect-activity-policy.js";
import {
  bpmnRetryEffectIncidentUpdate,
  validateRetryEffectIncidentUpdate,
} from "./incident-update-handler.js";
import {
  bpmnCancelIncidentProcessUpdate,
  validateCancelIncidentProcessUpdate,
} from "./incident-cancellation-update-handler.js";
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
import { terminalWorkflowResult } from "./workflow-terminal-completion.js";
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
  buildWorkflowChainSuccessor,
  initializeWorkflowChain,
  isExternallyRecoverableStimulus,
  recoveredWorkflowCommandOutcome,
  registerWorkflowChainRecoveryQuery,
  validateWorkflowChainUpdate,
  workflowCommandIdentityConflict,
  workflowChainRolloverTriggered,
  WorkflowChainFenceState,
} from "./workflow-chain-continuation.js";
import type {
  WorkflowChainRuntime,
} from "./workflow-chain-continuation.js";
import { registerWorkflowPublicationQueries } from "./workflow-publication-segments.js";

export const bpmnTraceQuery =
  defineQuery<ReadonlyArray<CanonicalObservation>>(bpmnTraceQueryName);
export const bpmnOpenUserTasksQuery =
  defineQuery<ReadonlyArray<OpenUserTask>>(bpmnOpenUserTasksQueryName);
export const bpmnUserTaskDetailQuery = defineQuery<
  UserTaskDetail | null,
  BpmnUserTaskDetailQueryArguments
>(bpmnUserTaskDetailQueryName);
export const bpmnCompleteUserTaskUpdate: ReturnType<
  typeof defineUpdate<CommandOutcome, BpmnCompleteUserTaskUpdateArguments>
> = defineUpdate<
  CommandOutcome,
  BpmnCompleteUserTaskUpdateArguments
>(bpmnCompleteUserTaskUpdateName);
export const bpmnDeliverMessageSignal = defineSignal<
  BpmnDeliverMessageSignalArguments
>(bpmnDeliverMessageSignalName);
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
): Promise<WorkflowExecutionResult> {
  const chainInitialization = hostInput !== undefined &&
      patched(bpmnWorkflowChainPatchId)
    ? initializeWorkflowChain(
        start,
        semanticProcess,
        hostInput,
        carriedState,
        carriedRecovery,
        carriedPublication,
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
  const workflowChain = chainInitialization?.runtime ?? null;
  let workflowChainFence = WorkflowChainFenceState.Active;
  const effectActivityPolicy = effectActivityPolicyForProfile(
    semanticProcess.identity.semanticProfile,
  );
  const eventRaceScheduler = createEventRaceReadinessScheduler(
    waitForTimer,
    eventRaceActivationDrain,
  );
  // One scheduler per boundary-deadline host kind. Each owns only the deadlines its own family
  // defines, so at most one ever claims a given committed state and none can schedule another
  // family's pair under the wrong refusal identity.
  const boundedDeadlineSchedulers = [
    createBoundedDeadlineScheduler(
      semanticProcess,
      waitForTimer,
      boundedActivityDeadlineFamily,
    ),
    createBoundedDeadlineScheduler(
      semanticProcess,
      waitForTimer,
      boundedScopeDeadlineFamily,
    ),
    createBoundedDeadlineScheduler(
      semanticProcess,
      waitForTimer,
      monitoredActivityDeadlineFamily,
    ),
  ] as const;
  const boundedDeadlineSchedulerFor = (candidate: RuntimeState) =>
    boundedDeadlineSchedulers.find((scheduler) =>
      scheduler.ownsCommittedDeadline(candidate)
    );

  // A successor resumes only committed state. Pending host work and the original Start never cross
  // the Run boundary, while an initial Run must place Start before any registered handler can run.
  if (chainInitialization?.restored === null || chainInitialization === null) {
    enqueueStimulus(acceptedStimuli, pendingStimuli, start);
  }

  if (workflowChain !== null) {
    registerWorkflowChainRecoveryQuery(
      start.instanceId,
      workflowChain.recovery,
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
  setHandler(bpmnDeliverMessageSignal, (stimulus) => {
    validateDeliverMessageSignal(stimulus);
    const accepted = acceptedStimulus(
      acceptedStimuli,
      stimulus.commandId,
    );
    const acceptance = acceptMessageDelivery(
      messageDeliveryResolutions,
      stimulus,
      accepted,
    );
    const scheduledByEventRace = eventRaceScheduler.recordMessageCallback(
      state,
      stimulus,
      acceptance.enqueue,
    );
    if (acceptance.enqueue) {
      acceptedStimuli.push(stimulus);
      if (!scheduledByEventRace) {
        pendingStimuli.push(stimulus);
      }
    }
  });
  setHandler(
    bpmnCompleteUserTaskUpdate,
    async (stimulus) => {
      const recovered = recoveredWorkflowCommandOutcome(workflowChain, stimulus);
      if (recovered !== undefined) {
        return recovered;
      }
      // A bounded completion races its deadline, so the scheduler classifies it by activation
      // instead of the loop draining it in arrival order.
      if (
        boundedDeadlineSchedulerFor(state)?.recordCompletionCallback(
          state,
          stimulus,
        ) === true
      ) {
        acceptedStimuli.push(stimulus);
      } else {
        enqueueStimulus(acceptedStimuli, pendingStimuli, stimulus);
      }
      await condition(
        () =>
          commandOutcome(commandPublication, stimulus.commandId) !== undefined,
      );
      const outcome = commandOutcome(commandPublication, stimulus.commandId);
      if (outcome === undefined) {
        throw ApplicationFailure.nonRetryable(
          `Semantic loop ended without an outcome for ${stimulus.commandId}`,
          "BpmnCommandOutcomeMissing",
        );
      }
      return outcome;
    },
    {
      validator: (stimulus) => {
        validateCompleteUserTaskUpdate(acceptedStimuli, stimulus);
        validateWorkflowChainUpdate(workflowChain, workflowChainFence, stimulus);
      },
    },
  );
  setHandler(
    bpmnRetryEffectIncidentUpdate,
    async (stimulus: RetryIncidentStimulus) => {
      const recovered = recoveredWorkflowCommandOutcome(workflowChain, stimulus);
      if (recovered !== undefined) {
        return recovered;
      }
      enqueueStimulus(acceptedStimuli, pendingStimuli, stimulus);
      await condition(
        () => commandOutcome(commandPublication, stimulus.commandId) !== undefined,
      );
      const outcome = commandOutcome(commandPublication, stimulus.commandId);
      if (outcome === undefined) {
        throw ApplicationFailure.nonRetryable(
          `Semantic loop ended without an outcome for ${stimulus.commandId}`,
          "BpmnCommandOutcomeMissing",
        );
      }
      return outcome;
    },
    {
      validator: (stimulus) => {
        validateRetryEffectIncidentUpdate(acceptedStimuli, stimulus);
        validateWorkflowChainUpdate(workflowChain, workflowChainFence, stimulus);
      },
    },
  );
  setHandler(
    bpmnCancelIncidentProcessUpdate,
    async (stimulus: CancelIncidentProcessStimulus) => {
      const recovered = recoveredWorkflowCommandOutcome(workflowChain, stimulus);
      if (recovered !== undefined) {
        return recovered;
      }
      enqueueStimulus(acceptedStimuli, pendingStimuli, stimulus);
      await condition(
        () => commandOutcome(commandPublication, stimulus.commandId) !== undefined,
      );
      const outcome = commandOutcome(commandPublication, stimulus.commandId);
      if (outcome === undefined) {
        throw ApplicationFailure.nonRetryable(
          `Semantic loop ended without an outcome for ${stimulus.commandId}`,
          "BpmnCommandOutcomeMissing",
        );
      }
      return outcome;
    },
    {
      validator: (stimulus) => {
        validateCancelIncidentProcessUpdate(
          acceptedStimuli,
          start.instanceId,
          stimulus,
        );
        validateWorkflowChainUpdate(workflowChain, workflowChainFence, stimulus);
      },
    },
  );

  while (true) {
    while (pendingStimuli.length > 0) {
      const stimulus = pendingStimuli.shift();
      if (stimulus === undefined) {
        throw ApplicationFailure.nonRetryable(
          "Semantic input queue lost an accepted stimulus",
          "BpmnSemanticQueueFailure",
        );
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
          case WorkflowCommandRecoveryPreflightKind.CapacityExceeded: {
            const budget = preflight.exhausted[0];
            if (budget === undefined) {
              throw new TypeError("Command-recovery capacity lost its exhausted bound");
            }
            const observedValue = budget ===
                WorkflowChainBudgetKind.CommandRecoveryLedgerEntries
              ? preflight.observedEntryCount
              : preflight.observedCanonicalUtf8Bytes;
            throw ApplicationFailure.nonRetryable(
              "Workflow command-recovery capacity is exhausted",
              bpmnWorkflowChainCapacityExhaustedFailureType,
              {
                budget,
                configuredBound: workflowChainProductionLimit(budget),
                observedValue,
                processInstanceId: start.instanceId,
                publicRevision: commandPublication.execution.headRevision,
                runOrdinal: workflowChain.runOrdinal,
              },
            );
          }
          case WorkflowCommandRecoveryPreflightKind.Admitted:
            recoveryAdmission = preflight.admission;
            break;
          default:
            return assertNever(preflight);
        }
      }
      const step = advanceScenario(semanticProcess, state, stimulus);
      const publicationCandidate = integrateCommandPublication(
        semanticProcess,
        commandPublication,
        stimulus,
        step,
        () => Date.now(),
      );
      if (
        step.kind === ScenarioStepKind.Terminal &&
        stimulus.kind === StimulusKind.CompleteEffect
      ) {
        failRejectedHostEffectResult(state, stimulus);
      }
      commandPublication = recordCommandPublicationOutcome(
        publicationCandidate,
        stimulus,
        step.observations,
      );
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
        workflowChain?.recovery.record(recoveryAdmission, outcome);
      }
      if (
        stimulus.kind === StimulusKind.DeliverMessage &&
        outcome !== undefined
      ) {
        recordMessageDeliveryOutcome(
          messageDeliveryResolutions,
          stimulus,
          outcome,
        );
      }
      trace.push(...step.observations);
      switch (step.kind) {
        case ScenarioStepKind.Committed:
        case ScenarioStepKind.Terminal:
          state = step.state;
          eventRaceScheduler.reconcileCommittedState(state);
          for (const scheduler of boundedDeadlineSchedulers) {
            scheduler.reconcileCommittedState(state);
          }
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

    if (isTerminalProcessState(state)) {
      workflowChainFence = WorkflowChainFenceState.Terminal;
      await condition(allHandlersFinished);
      if (pendingStimuli.length === 0 && allHandlersFinished()) {
        break;
      }
      continue;
    }

    if (
      workflowChain !== null &&
      (
        workflowChainFence === WorkflowChainFenceState.Rollover ||
        workflowChainRolloverTriggered(workflowChain)
      )
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
      );
      return await continueAsNew<WorkflowChainWorkflow>(...successor);
    }

    const readinessAction = await waitForHostReadiness(
      state,
      semanticProcess,
      pendingStimuli,
      acceptedStimuli,
      eventRaceScheduler,
      boundedDeadlineSchedulers,
      waitForTimer,
      executeEffect,
      effectActivityPolicy,
    );
    if (readinessAction === HostReadinessAction.RecheckMainLoop) {
      continue;
    }
  }

  return terminalWorkflowResult(
    semanticProcess,
    start.instanceId,
    state,
    trace,
    completedMessageDeliveryRecords(messageDeliveryResolutions),
    workflowChain?.recovery ?? null,
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
) => Promise<WorkflowTerminalResultV1>;

function assertNever(value: never): never {
  throw new TypeError(`Unsupported Temporal adapter variant: ${String(value)}`);
}
