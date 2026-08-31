/** Temporal Signal and Update admission for externally recoverable BPMN commands. */
import {
  CommandOutcome,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type {
  CancelIncidentProcessStimulus,
  RetryIncidentStimulus,
  RuntimeState,
  Stimulus,
} from "@bpmn-lean/semantic-core";
import {
  ApplicationFailure,
  defineSignal,
  defineUpdate,
  setHandler,
} from "@temporalio/workflow";
import {
  bpmnCompleteUserTaskUpdateName,
  bpmnDeliverMessageSignalName,
  bpmnWorkflowRolloverInProgressFailureType,
} from "@bpmn-lean/temporal-protocol";
import type {
  BpmnCompleteUserTaskUpdateArguments,
  BpmnDeliverMessageSignalArguments,
  MessageDeliveryResolution,
  MessageDeliveryStimulus,
} from "@bpmn-lean/temporal-protocol";

import type {
  BoundedDeadlineScheduler,
} from "./bounded-deadline-scheduler.js";
import type {
  CommandPublicationState,
} from "./command-publication-integration.js";
import { commandOutcome } from "./command-publication-integration.js";
import type {
  EventRaceReadinessScheduler,
} from "./event-race-readiness-scheduler.js";
import type {
  MessageBoundedActivityReadinessScheduler,
} from "./message-bounded-activity-readiness-scheduler.js";
import {
  bpmnCancelIncidentProcessUpdate,
  validateCancelIncidentProcessUpdate,
} from "./incident-cancellation-update-handler.js";
import {
  bpmnRetryEffectIncidentUpdate,
  validateRetryEffectIncidentUpdate,
} from "./incident-update-handler.js";
import {
  acceptMessageDelivery,
  messageDeliveryWillEnqueue,
} from "./message-delivery-ledger.js";
import {
  acceptWorkflowChainSignalCapacity,
  awaitWorkflowCommandOutcome,
} from "./workflow-chain-capacity.js";
import type {
  WorkflowChainRuntime,
} from "./workflow-chain-continuation.js";
import {
  recoveredWorkflowCommandOutcome,
  validateWorkflowChainUpdate,
  WorkflowChainFenceState,
} from "./workflow-chain-continuation.js";
import {
  WorkflowCommandCapacityPreflightKind,
} from "./workflow-command-capacity.js";
import { WorkflowCommandRecoveryLookupKind } from "./workflow-command-recovery.js";
import { enqueueStimulus } from "./workflow-host-readiness.js";
import {
  acceptedStimulus,
  validateCompleteUserTaskUpdate,
  validateDeliverMessageSignal,
} from "./workflow-wire-validation.js";

export const bpmnCompleteUserTaskUpdate: ReturnType<
  typeof defineUpdate<CommandOutcome, BpmnCompleteUserTaskUpdateArguments>
> = defineUpdate<CommandOutcome, BpmnCompleteUserTaskUpdateArguments>(
  bpmnCompleteUserTaskUpdateName,
);

export const bpmnDeliverMessageSignal = defineSignal<
  BpmnDeliverMessageSignalArguments
>(bpmnDeliverMessageSignalName);

type WorkflowCommandIngressOptions = Readonly<{
  processInstanceId: string;
  acceptedStimuli: Stimulus[];
  pendingStimuli: Stimulus[];
  messageDeliveryResolutions: MessageDeliveryResolution[];
  workflowChain: WorkflowChainRuntime | null;
  currentState: () => RuntimeState;
  currentPublication: () => CommandPublicationState;
  currentFence: () => WorkflowChainFenceState;
  eventRaceScheduler: EventRaceReadinessScheduler;
  messageBoundedActivityScheduler: MessageBoundedActivityReadinessScheduler;
  boundedDeadlineSchedulerFor: (
    state: RuntimeState,
  ) => BoundedDeadlineScheduler | undefined;
  reserveStimulus: (stimulus: Stimulus) => boolean;
}>;

/**
 * Registers all mutable command ingress against live Workflow state.
 *
 * Temporal invokes these callbacks after registration, so the three accessors deliberately read the
 * current state, publication, and fence instead of capturing their registration-time values.
 */
export function registerWorkflowCommandIngress(
  options: WorkflowCommandIngressOptions,
): void {
  const {
    processInstanceId,
    acceptedStimuli,
    pendingStimuli,
    messageDeliveryResolutions,
    workflowChain,
    currentState,
    currentPublication,
    currentFence,
    eventRaceScheduler,
    messageBoundedActivityScheduler,
    boundedDeadlineSchedulerFor,
    reserveStimulus,
  } = options;

  setHandler(bpmnDeliverMessageSignal, (stimulus: MessageDeliveryStimulus) => {
    validateDeliverMessageSignal(stimulus);
    if (!acceptWorkflowChainSignalCapacity(workflowChain, stimulus)) {
      return;
    }
    const accepted = acceptedStimulus(
      acceptedStimuli,
      stimulus.commandId,
    );
    // A conflict record also retains the full Signal stimulus, so its byte bound must pass before
    // either a pending or request-failure Message record can become Workflow state.
    if (!acceptUnqueuedSignalCapacity(
      workflowChain,
      stimulus,
      currentPublication().execution.headRevision,
    )) {
      return;
    }
    if (
      messageDeliveryWillEnqueue(
        messageDeliveryResolutions,
        stimulus,
        accepted,
      ) && !reserveStimulus(stimulus)
    ) {
      return;
    }
    const acceptance = acceptMessageDelivery(
      messageDeliveryResolutions,
      stimulus,
      accepted,
    );
    const state = currentState();
    const scheduledByManagedRace =
      messageBoundedActivityScheduler.recordMessageCallback(
        state,
        stimulus,
        acceptance.enqueue,
      ) || (
        stimulus.kind === StimulusKind.DeliverMessage &&
        eventRaceScheduler.recordMessageCallback(
          state,
          stimulus,
          acceptance.enqueue,
        )
      );
    if (acceptance.enqueue) {
      acceptedStimuli.push(stimulus);
      if (!scheduledByManagedRace) {
        pendingStimuli.push(stimulus);
      }
    }
  });

  setHandler(
    bpmnCompleteUserTaskUpdate,
    async (stimulus) => {
      return await runWorkflowUpdate(
        workflowChain,
        stimulus,
        currentPublication().execution.headRevision,
        async () => {
          // A managed completion races either a Message callback or a deadline, so its scheduler
          // classifies the activation instead of letting loop arrival order choose the winner.
          const state = currentState();
          if (
            messageBoundedActivityScheduler.recordCompletionCallback(
              state,
              stimulus,
            ) || boundedDeadlineSchedulerFor(state)?.recordCompletionCallback(
              state,
              stimulus,
            ) === true
          ) {
            acceptedStimuli.push(stimulus);
          } else {
            enqueueStimulus(
              acceptedStimuli,
              pendingStimuli,
              stimulus,
              reserveStimulus,
            );
          }
          return await awaitWorkflowCommandOutcome(
            stimulus.commandId,
            () => commandOutcome(currentPublication(), stimulus.commandId),
            workflowChain?.capacity ?? null,
          );
        },
      );
    },
    {
      validator: (stimulus) => {
        validateCompleteUserTaskUpdate(acceptedStimuli, stimulus);
        validateWorkflowChainUpdate(
          workflowChain,
          currentFence(),
          stimulus,
          currentPublication().execution.headRevision,
        );
        validateWorkflowUpdateCapacity(
          workflowChain,
          stimulus,
          currentPublication().execution.headRevision,
        );
      },
    },
  );

  setHandler(
    bpmnRetryEffectIncidentUpdate,
    async (stimulus: RetryIncidentStimulus) => {
      return await runWorkflowUpdate(
        workflowChain,
        stimulus,
        currentPublication().execution.headRevision,
        async () => {
          enqueueStimulus(
            acceptedStimuli,
            pendingStimuli,
            stimulus,
            reserveStimulus,
          );
          return await awaitWorkflowCommandOutcome(
            stimulus.commandId,
            () => commandOutcome(currentPublication(), stimulus.commandId),
            workflowChain?.capacity ?? null,
          );
        },
      );
    },
    {
      validator: (stimulus) => {
        validateRetryEffectIncidentUpdate(acceptedStimuli, stimulus);
        validateWorkflowChainUpdate(
          workflowChain,
          currentFence(),
          stimulus,
          currentPublication().execution.headRevision,
        );
        validateWorkflowUpdateCapacity(
          workflowChain,
          stimulus,
          currentPublication().execution.headRevision,
        );
      },
    },
  );

  setHandler(
    bpmnCancelIncidentProcessUpdate,
    async (stimulus: CancelIncidentProcessStimulus) => {
      return await runWorkflowUpdate(
        workflowChain,
        stimulus,
        currentPublication().execution.headRevision,
        async () => {
          enqueueStimulus(
            acceptedStimuli,
            pendingStimuli,
            stimulus,
            reserveStimulus,
          );
          return await awaitWorkflowCommandOutcome(
            stimulus.commandId,
            () => commandOutcome(currentPublication(), stimulus.commandId),
            workflowChain?.capacity ?? null,
          );
        },
      );
    },
    {
      validator: (stimulus) => {
        validateCancelIncidentProcessUpdate(
          acceptedStimuli,
          processInstanceId,
          stimulus,
        );
        validateWorkflowChainUpdate(
          workflowChain,
          currentFence(),
          stimulus,
          currentPublication().execution.headRevision,
        );
        validateWorkflowUpdateCapacity(
          workflowChain,
          stimulus,
          currentPublication().execution.headRevision,
        );
      },
    },
  );
}

function acceptUnqueuedSignalCapacity(
  workflowChain: WorkflowChainRuntime | null,
  stimulus: Stimulus,
  publicRevision: number,
): boolean {
  if (workflowChain === null) {
    return true;
  }
  const preflight = workflowChain.commandCapacity.preflightStimulus(stimulus);
  switch (preflight.kind) {
    case WorkflowCommandCapacityPreflightKind.Ready:
      return true;
    case WorkflowCommandCapacityPreflightKind.CapacityExceeded:
      workflowChain.capacity.retainObservedCapacity(
        preflight.failure,
        publicRevision,
      );
      return false;
    case WorkflowCommandCapacityPreflightKind.Rollover:
      throw new TypeError("Signal stimulus preflight cannot request rollover");
    default:
      return assertNever(preflight);
  }
}

async function runWorkflowUpdate(
  workflowChain: WorkflowChainRuntime | null,
  stimulus: Stimulus,
  publicRevision: number,
  execute: () => Promise<CommandOutcome>,
): Promise<CommandOutcome> {
  const recovered = recoveredWorkflowCommandOutcome(workflowChain, stimulus);
  if (workflowChain === null) {
    return recovered ?? await execute();
  }
  const preflight = workflowChain.commandCapacity.beginUpdate(
    stimulus,
    recovered === undefined,
  );
  requireReadyUpdateCapacity(workflowChain, preflight, publicRevision);
  try {
    return recovered ?? await execute();
  } finally {
    workflowChain.commandCapacity.finishUpdate();
  }
}

function validateWorkflowUpdateCapacity(
  workflowChain: WorkflowChainRuntime | null,
  stimulus: Stimulus,
  publicRevision: number,
): void {
  if (workflowChain === null) {
    return;
  }
  const recovered = workflowChain.recovery.lookup(stimulus);
  const preflight = workflowChain.commandCapacity.preflightUpdate(
    stimulus,
    recovered.kind !== WorkflowCommandRecoveryLookupKind.Resolved,
  );
  requireReadyUpdateCapacity(workflowChain, preflight, publicRevision);
}

function requireReadyUpdateCapacity(
  workflowChain: WorkflowChainRuntime,
  preflight: ReturnType<WorkflowChainRuntime["commandCapacity"]["preflightUpdate"]>,
  publicRevision: number,
): void {
  switch (preflight.kind) {
    case WorkflowCommandCapacityPreflightKind.Ready:
      return;
    case WorkflowCommandCapacityPreflightKind.Rollover:
      throw ApplicationFailure.retryable(
        "Workflow rollover or ingress drain is required before accepting another Update",
        bpmnWorkflowRolloverInProgressFailureType,
      );
    case WorkflowCommandCapacityPreflightKind.CapacityExceeded:
      throw workflowChain.capacity.applicationFailureForObservedCapacity(
        preflight.failure,
        publicRevision,
      );
    default:
      return assertNever(preflight);
  }
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported Workflow command ingress variant: ${String(value)}`);
}
