/** Temporal Signal and Update admission for externally recoverable BPMN commands. */
import {
  CommandOutcome,
} from "@bpmn-lean/semantic-core";
import type {
  CancelIncidentProcessStimulus,
  DeliverMessageStimulus,
  RetryIncidentStimulus,
  RuntimeState,
  Stimulus,
} from "@bpmn-lean/semantic-core";
import {
  defineSignal,
  defineUpdate,
  setHandler,
} from "@temporalio/workflow";
import {
  bpmnCompleteUserTaskUpdateName,
  bpmnDeliverMessageSignalName,
} from "@bpmn-lean/temporal-protocol";
import type {
  BpmnCompleteUserTaskUpdateArguments,
  BpmnDeliverMessageSignalArguments,
  MessageDeliveryResolution,
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
  boundedDeadlineSchedulerFor: (
    state: RuntimeState,
  ) => BoundedDeadlineScheduler | undefined;
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
    boundedDeadlineSchedulerFor,
  } = options;

  setHandler(bpmnDeliverMessageSignal, (stimulus: DeliverMessageStimulus) => {
    validateDeliverMessageSignal(stimulus);
    if (!acceptWorkflowChainSignalCapacity(workflowChain, stimulus)) {
      return;
    }
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
      currentState(),
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
      const state = currentState();
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
      return await awaitWorkflowCommandOutcome(
        stimulus.commandId,
        () => commandOutcome(currentPublication(), stimulus.commandId),
        workflowChain?.capacity ?? null,
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
      return await awaitWorkflowCommandOutcome(
        stimulus.commandId,
        () => commandOutcome(currentPublication(), stimulus.commandId),
        workflowChain?.capacity ?? null,
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
      return await awaitWorkflowCommandOutcome(
        stimulus.commandId,
        () => commandOutcome(currentPublication(), stimulus.commandId),
        workflowChain?.capacity ?? null,
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
      },
    },
  );
}
