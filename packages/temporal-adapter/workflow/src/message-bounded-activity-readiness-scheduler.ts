/** Durable readiness scheduling for one User Task with an interrupting Message boundary handler. */
import {
  StimulusKind,
  messageBoundedPairForSubscription,
  sameMessageChannel,
  sameOccurrenceId,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  DeliverMessageStimulus,
  RuntimeState,
  SemanticProcessProgram,
  Stimulus,
} from "@bpmn-lean/semantic-core";
import {
  bpmnMessageBoundedActivitySchedulerUnavailableFailureType,
} from "@bpmn-lean/temporal-protocol";
import type {
  MessageDeliveryStimulus,
} from "@bpmn-lean/temporal-protocol";
import { ApplicationFailure } from "@temporalio/workflow";

import {
  ActivationDrain,
  createActivationTaggedReadiness,
} from "./activation-tagged-readiness.js";
import { hostInvariantFailure } from "./host-invariant.js";

type MessageBoundedPair = NonNullable<
  ReturnType<typeof messageBoundedPairForSubscription>
>;

type PairIdentity = Readonly<{
  operationId: string;
  activity: Readonly<{
    processInstanceId: string;
    activityElementId: string;
    activation: number;
  }>;
  task: Readonly<{
    processInstanceId: string;
    elementId: string;
    activation: number;
  }>;
  message: Readonly<{
    processInstanceId: string;
    elementId: string;
    activation: number;
  }>;
}>;

export type MessageBoundedActivityReadiness =
  | Readonly<{
    kind: typeof StimulusKind.DeliverMessage;
    pair: PairIdentity | null;
    stimulus: DeliverMessageStimulus;
    submitToCore: boolean;
  }>
  | Readonly<{
    kind: typeof StimulusKind.DeliverPayloadMessage;
    pair: null;
    stimulus: Extract<
      MessageDeliveryStimulus,
      { kind: typeof StimulusKind.DeliverPayloadMessage }
    >;
    submitToCore: boolean;
  }>
  | Readonly<{
    kind: typeof StimulusKind.CompleteUserTaskInstance;
    pair: PairIdentity | null;
    stimulus: CompleteUserTaskInstanceStimulus;
  }>;

export type MessageBoundedActivityReadinessScheduler = Readonly<{
  hasPendingCallbacks: () => boolean;
  ownsCommittedPair: (state: RuntimeState) => boolean;
  recordMessageCallback: (
    state: RuntimeState,
    stimulus: MessageDeliveryStimulus,
    submitToCore: boolean,
  ) => boolean;
  recordCompletionCallback: (
    state: RuntimeState,
    stimulus: CompleteUserTaskInstanceStimulus,
  ) => boolean;
  waitForReadiness: (state: RuntimeState) => Promise<ReadonlyArray<Stimulus>>;
}>;

/**
 * Creates the host owner for the one admitted Message/completion race.
 *
 * Activation batching comes from the shared readiness primitive. Pair membership stays here because
 * a Signal and an Update may race only when both address the same exact committed Activity pair.
 */
export function createMessageBoundedActivityReadinessScheduler(
  semanticProcess: SemanticProcessProgram,
): MessageBoundedActivityReadinessScheduler {
  const readiness = createActivationTaggedReadiness<
    MessageBoundedActivityReadiness
  >(
    ActivationDrain.Required,
    "Message-bounded Activity scheduler woke without one classified callback",
  );
  let pendingCallbackCount = 0;

  return {
    hasPendingCallbacks() {
      return pendingCallbackCount > 0;
    },

    ownsCommittedPair(state) {
      return managedPair(semanticProcess, state) !== undefined;
    },

    recordMessageCallback(state, stimulus, submitToCore) {
      const callback = classifyMessageBoundedActivityCallback(
        semanticProcess,
        state,
        stimulus,
        submitToCore,
      );
      if (
        callback?.kind !== StimulusKind.DeliverMessage &&
        callback?.kind !== StimulusKind.DeliverPayloadMessage
      ) {
        return false;
      }
      readiness.record(callback);
      pendingCallbackCount += 1;
      return true;
    },

    recordCompletionCallback(state, stimulus) {
      const callback = classifyMessageBoundedActivityCallback(
        semanticProcess,
        state,
        stimulus,
      );
      if (callback?.kind !== StimulusKind.CompleteUserTaskInstance) {
        return false;
      }
      readiness.record(callback);
      pendingCallbackCount += 1;
      return true;
    },

    async waitForReadiness(state) {
      if (managedPair(semanticProcess, state) === undefined) {
        throw hostInvariantFailure(
          "Managed Message-bounded Activity is not one exact task and Message pair",
        );
      }
      const batch = await readiness.takeBatch();
      pendingCallbackCount -= batch.length;
      return selectMessageBoundedActivityStimuli(batch);
    },
  };
}

/** Classifies every callback family the managed wait must wake for, tagging only exact pair members. */
export function classifyMessageBoundedActivityCallback(
  semanticProcess: SemanticProcessProgram,
  state: RuntimeState,
  stimulus: Stimulus,
  submitToCore = true,
): MessageBoundedActivityReadiness | undefined {
  const pair = managedPair(semanticProcess, state);
  if (pair === undefined) {
    return undefined;
  }
  switch (stimulus.kind) {
    case StimulusKind.DeliverMessage:
      return {
        kind: StimulusKind.DeliverMessage,
        pair: sameOccurrenceId(stimulus.subscriptionId, pair.message.id) &&
            sameMessageChannel(
              stimulus.channel,
              pair.definition.boundaryMessage.channel,
            )
          ? pairIdentity(pair)
          : null,
        stimulus,
        submitToCore,
      };
    case StimulusKind.DeliverPayloadMessage:
      return {
        kind: StimulusKind.DeliverPayloadMessage,
        pair: null,
        stimulus,
        submitToCore,
      };
    case StimulusKind.CompleteUserTaskInstance:
      return {
        kind: StimulusKind.CompleteUserTaskInstance,
        pair: stimulus.submittedValues.length === 0 &&
            sameOccurrenceId(stimulus.taskId, pair.task.id)
          ? pairIdentity(pair)
          : null,
        stimulus,
      };
    default:
      return undefined;
  }
}

/** Chooses no winner when one activation makes both arms of the same committed pair ready. */
export function selectMessageBoundedActivityStimuli(
  batch: ReadonlyArray<MessageBoundedActivityReadiness>,
): ReadonlyArray<Stimulus> {
  const messages = batch.filter(
    (callback): callback is Extract<
      MessageBoundedActivityReadiness,
      { kind: typeof StimulusKind.DeliverMessage }
    > & Readonly<{ pair: PairIdentity }> =>
      callback.kind === StimulusKind.DeliverMessage &&
      callback.submitToCore &&
      callback.pair !== null,
  );
  const completions = batch.filter(
    (callback): callback is Extract<
      MessageBoundedActivityReadiness,
      { kind: typeof StimulusKind.CompleteUserTaskInstance }
    > & Readonly<{ pair: PairIdentity }> =>
      callback.kind === StimulusKind.CompleteUserTaskInstance &&
      callback.pair !== null,
  );
  if (messages.some((message) =>
    completions.some((completion) => samePair(message.pair, completion.pair))
  )) {
    throw ApplicationFailure.nonRetryable(
      "Message and Activity completion shared one Workflow activation with no defined winner",
      bpmnMessageBoundedActivitySchedulerUnavailableFailureType,
    );
  }

  const stimuli: Stimulus[] = [];
  for (const callback of batch) {
    switch (callback.kind) {
      case StimulusKind.DeliverMessage:
      case StimulusKind.DeliverPayloadMessage:
        if (callback.submitToCore) {
          stimuli.push(callback.stimulus);
        }
        break;
      case StimulusKind.CompleteUserTaskInstance:
        stimuli.push(callback.stimulus);
        break;
      default:
        assertNever(callback);
    }
  }
  return stimuli;
}

/** Resolve through the core's complete join, then reject zero or multiple committed pairs. */
function managedPair(
  semanticProcess: SemanticProcessProgram,
  state: RuntimeState,
): MessageBoundedPair | undefined {
  const pairs = state.messageWaits.flatMap(({ id }) => {
    const pair = messageBoundedPairForSubscription(semanticProcess, state, id);
    return pair === undefined ? [] : [pair];
  });
  return pairs.length === 1 ? pairs[0] : undefined;
}

function pairIdentity(pair: MessageBoundedPair): PairIdentity {
  return {
    operationId: pair.definition.id,
    activity: pair.record.id,
    task: pair.task.id,
    message: pair.message.id,
  };
}

function samePair(left: PairIdentity, right: PairIdentity): boolean {
  return left.operationId === right.operationId &&
    left.activity.processInstanceId === right.activity.processInstanceId &&
    left.activity.activityElementId === right.activity.activityElementId &&
    left.activity.activation === right.activity.activation &&
    sameOccurrenceId(left.task, right.task) &&
    sameOccurrenceId(left.message, right.message);
}

function assertNever(value: never): never {
  throw new TypeError(
    `Unsupported Message-bounded Activity callback: ${String(value)}`,
  );
}
