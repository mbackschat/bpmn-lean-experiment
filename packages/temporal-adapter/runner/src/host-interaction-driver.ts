/**
 * Product-side driver that answers only the external interactions a committed state publishes.
 *
 * The driver is deliberately blind to BPMN topology, profiles, and element roles: it reads the
 * canonical `enabledInteractions` set and open host waits, matches them against declared
 * configuration, and submits ordinary production commands. Configuration selects *which* published
 * interaction to answer; the occurrence identity always comes from the publication, so no product
 * code constructs a task, subscription, or activation identity.
 *
 * Precedence per committed state is load-bearing and not interchangeable:
 *
 * 1. answer the first unconsumed response whose interaction is currently enabled;
 * 2. otherwise keep waiting while any timer or effect wait is open, because a host-resolved wait may
 *    still withdraw the enabled interactions — an armed Event-Based Gateway publishes a Message
 *    interaction that a timer winner is expected to cancel, so refusing here would reject a
 *    legitimate Process;
 * 3. otherwise refuse, distinguishing an enabled interaction nobody answers from a Process that can
 *    no longer progress at all.
 *
 * Declared response order — never observation order — decides between two simultaneously enabled
 * interactions, so host iteration order can never present itself as BPMN behavior.
 */
import { setTimeout as hostDelay } from "node:timers/promises";

import {
  CommandOutcome,
  ProcessStatus,
  StimulusKind,
  sameMessageChannel,
} from "@bpmn-lean/semantic-core";
import type {
  CancelIncidentProcessStimulus,
  CompleteUserTaskInstanceStimulus,
  DeepReadonly,
  EnabledInteraction,
  StateObservation,
} from "@bpmn-lean/semantic-core";

import {
  ProcessCommandResultKind,
} from "@bpmn-lean/temporal-protocol";
import type {
  ProcessCommandResult,
  MessageDeliveryStimulus,
  UserTaskDetail,
  UserTaskDetailRequest,
} from "@bpmn-lean/temporal-protocol";
import type { HostInteractionResponse } from "./host-interaction-plan.js";

export type HostInteractionPort = Readonly<{
  readState: () => Promise<StateObservation>;
  readUserTaskDetail: (
    request: UserTaskDetailRequest,
  ) => Promise<UserTaskDetail | null>;
  submitCompletion: (
    stimulus: CompleteUserTaskInstanceStimulus,
  ) => Promise<ProcessCommandResult>;
  submitMessage: (
    stimulus: MessageDeliveryStimulus,
  ) => Promise<ProcessCommandResult>;
  submitCancellation: (
    stimulus: CancelIncidentProcessStimulus,
  ) => Promise<ProcessCommandResult>;
}>;

export const HostInteractionEventKind = {
  StateObserved: "stateObserved",
  InteractionReady: "interactionReady",
  DelayStarted: "delayStarted",
  DelayFinished: "delayFinished",
  InteractionResolved: "interactionResolved",
  HostWaitObserved: "hostWaitObserved",
} as const;

export type HostInteractionEvent = DeepReadonly<
  | {
      kind: typeof HostInteractionEventKind.StateObserved;
      state: StateObservation;
    }
  | {
      kind: typeof HostInteractionEventKind.InteractionReady;
      interaction: EnabledInteraction;
      detail: UserTaskDetail | null;
    }
  | {
      kind: typeof HostInteractionEventKind.DelayStarted;
      delayMs: number;
    }
  | {
      kind: typeof HostInteractionEventKind.DelayFinished;
      delayMs: number;
    }
  | {
      kind: typeof HostInteractionEventKind.InteractionResolved;
      result: ProcessCommandResult;
    }
  | {
      kind: typeof HostInteractionEventKind.HostWaitObserved;
      openTimers: number;
      openEffects: number;
    }
>;

export const HostInteractionResultKind = {
  Driven: "driven",
  Refused: "refused",
} as const;

export const HostInteractionRefusalCode = {
  UnmatchedEnabledInteraction: "unmatchedEnabledInteraction",
  AmbiguousResponse: "ambiguousResponse",
  InteractionNotCommitted: "interactionNotCommitted",
  TaskDetailUnavailable: "taskDetailUnavailable",
  UnconsumedResponses: "unconsumedResponses",
  StalledProcess: "stalledProcess",
  ObservationLimitExceeded: "observationLimitExceeded",
} as const;

export type HostInteractionRefusalCode =
  typeof HostInteractionRefusalCode[keyof typeof HostInteractionRefusalCode];

export type HostInteractionResult = DeepReadonly<
  | {
      kind: typeof HostInteractionResultKind.Driven;
      submitted: number;
    }
  | {
      kind: typeof HostInteractionResultKind.Refused;
      code: HostInteractionRefusalCode;
      evidence: string;
      result?: ProcessCommandResult;
    }
>;

/**
 * Bounds how many committed states one product run may read.
 *
 * A host-resolved wait that never resolves would otherwise poll forever. The limit is a harness
 * safety boundary, not a semantic timeout: exceeding it is a product refusal, never a BPMN outcome.
 */
const observationLimit = 600;
const hostPollIntervalMs = 250;

type PendingResponse = {
  readonly response: HostInteractionResponse;
  consumed: boolean;
};

export async function driveHostInteractions(
  plan: ReadonlyArray<HostInteractionResponse>,
  port: HostInteractionPort,
  wait: (delayMs: number) => Promise<void> = waitForHostDelay,
  observe: (event: HostInteractionEvent) => void = () => undefined,
): Promise<HostInteractionResult> {
  const pending: PendingResponse[] = plan.map((response) => ({
    response,
    consumed: false,
  }));
  let submitted = 0;

  for (let step = 0; step < observationLimit; step += 1) {
    const state = await port.readState();
    observe({ kind: HostInteractionEventKind.StateObserved, state });
    if (
      state.status === ProcessStatus.Completed ||
      state.status === ProcessStatus.Cancelled ||
      state.status === ProcessStatus.Failed
    ) {
      const unconsumed = pending.filter(({ consumed }) => !consumed).length;
      if (unconsumed > 0) {
        return refuse(
          HostInteractionRefusalCode.UnconsumedResponses,
          `Process terminated with ${unconsumed} configured interaction response(s) never answered.`,
        );
      }
      return { kind: HostInteractionResultKind.Driven, submitted };
    }

    const selection = selectInteraction(pending, state.enabledInteractions);
    switch (selection.kind) {
      case SelectionKind.Ambiguous:
        return refuse(
          HostInteractionRefusalCode.AmbiguousResponse,
          `One configured response matches ${selection.matches} enabled occurrences; the driver does not choose between them.`,
        );
      case SelectionKind.None: {
        const hostWaits = state.openTimers.length + state.openEffects.length;
        if (hostWaits > 0) {
          observe({
            kind: HostInteractionEventKind.HostWaitObserved,
            openTimers: state.openTimers.length,
            openEffects: state.openEffects.length,
          });
          await wait(hostPollIntervalMs);
          continue;
        }
        if (state.enabledInteractions.length > 0) {
          return refuse(
            HostInteractionRefusalCode.UnmatchedEnabledInteraction,
            `${state.enabledInteractions.length} interaction(s) are enabled and no unconsumed response answers any of them.`,
          );
        }
        return refuse(
          HostInteractionRefusalCode.StalledProcess,
          "Running Process published neither an enabled interaction nor an open timer or effect wait.",
        );
      }
      case SelectionKind.Matched:
        break;
      default:
        return assertNever(selection);
    }

    const outcome = await answerInteraction(
      selection.interaction,
      selection.pending.response,
      port,
      wait,
      observe,
    );
    if (outcome.kind === HostInteractionResultKind.Refused) {
      return outcome;
    }
    selection.pending.consumed = true;
    submitted += 1;
  }

  return refuse(
    HostInteractionRefusalCode.ObservationLimitExceeded,
    `Product run read ${observationLimit} committed states without reaching a terminal Process.`,
  );
}

const SelectionKind = {
  Matched: "matched",
  None: "none",
  Ambiguous: "ambiguous",
} as const;

type Selection =
  | {
      kind: typeof SelectionKind.Matched;
      pending: PendingResponse;
      interaction: EnabledInteraction;
    }
  | { kind: typeof SelectionKind.None }
  | { kind: typeof SelectionKind.Ambiguous; matches: number };

/** Declared response order decides; observation order never does. */
function selectInteraction(
  pending: ReadonlyArray<PendingResponse>,
  enabled: ReadonlyArray<EnabledInteraction>,
): Selection {
  for (const candidate of pending) {
    if (candidate.consumed) {
      continue;
    }
    const matches = enabled.filter((interaction) =>
      answersInteraction(candidate.response, interaction),
    );
    if (matches.length > 1) {
      return { kind: SelectionKind.Ambiguous, matches: matches.length };
    }
    const [interaction] = matches;
    if (interaction !== undefined) {
      return { kind: SelectionKind.Matched, pending: candidate, interaction };
    }
  }
  return { kind: SelectionKind.None };
}

function answersInteraction(
  response: HostInteractionResponse,
  interaction: EnabledInteraction,
): boolean {
  switch (response.kind) {
    case StimulusKind.CompleteUserTaskInstance:
      return interaction.kind === StimulusKind.CompleteUserTaskInstance &&
        interaction.taskId.elementId === response.elementId;
    case StimulusKind.DeliverMessage:
      return interaction.kind === StimulusKind.DeliverMessage &&
        sameMessageChannel(interaction.channel, response.channel);
    case StimulusKind.DeliverPayloadMessage:
      return interaction.kind === StimulusKind.DeliverPayloadMessage &&
        sameMessageChannel(interaction.channel, response.channel);
    case StimulusKind.CancelIncidentProcess:
      return interaction.kind === StimulusKind.CancelIncidentProcess;
    default:
      return assertNever(response);
  }
}

async function answerInteraction(
  interaction: EnabledInteraction,
  response: HostInteractionResponse,
  port: HostInteractionPort,
  wait: (delayMs: number) => Promise<void>,
  observe: (event: HostInteractionEvent) => void,
): Promise<HostInteractionResult> {
  const detail = interaction.kind === StimulusKind.CompleteUserTaskInstance &&
      response.kind === StimulusKind.CompleteUserTaskInstance
    ? await port.readUserTaskDetail({
      taskId: interaction.taskId,
      inputVariableNames: response.inputVariableNames,
    })
    : null;
  if (
    interaction.kind === StimulusKind.CompleteUserTaskInstance &&
    detail === null
  ) {
    return refuse(
      HostInteractionRefusalCode.TaskDetailUnavailable,
      "Published User Task interaction had no readable detail.",
    );
  }
  observe({
    kind: HostInteractionEventKind.InteractionReady,
    interaction,
    detail,
  });
  observe({
    kind: HostInteractionEventKind.DelayStarted,
    delayMs: response.delayMs,
  });
  await wait(response.delayMs);
  observe({
    kind: HostInteractionEventKind.DelayFinished,
    delayMs: response.delayMs,
  });

  const result = await submitAnswer(interaction, response, port);
  observe({ kind: HostInteractionEventKind.InteractionResolved, result });
  if (!isCommitted(result)) {
    return {
      kind: HostInteractionResultKind.Refused,
      code: HostInteractionRefusalCode.InteractionNotCommitted,
      evidence:
        "Semantic core did not commit the submitted interaction; the product reports its typed result unchanged.",
      result,
    };
  }
  return { kind: HostInteractionResultKind.Driven, submitted: 1 };
}

/**
 * Builds the command from the published occurrence identity only.
 *
 * The command identifier is occurrence-bound, so a resubmitted answer for the same occurrence
 * deduplicates against the same accepted command instead of creating a second one. It deliberately
 * excludes the submitted values; no reachable path submits differing content for one occurrence
 * because each configured response is consumed at most once.
 */
async function submitAnswer(
  interaction: EnabledInteraction,
  response: HostInteractionResponse,
  port: HostInteractionPort,
): Promise<ProcessCommandResult> {
  if (
    interaction.kind === StimulusKind.CompleteUserTaskInstance &&
    response.kind === StimulusKind.CompleteUserTaskInstance
  ) {
    return port.submitCompletion({
      kind: StimulusKind.CompleteUserTaskInstance,
      commandId:
        `mvp-complete-task:${interaction.taskId.elementId}:${interaction.taskId.activation}`,
      taskId: interaction.taskId,
      submittedValues: response.submittedValues,
    });
  }
  if (
    interaction.kind === StimulusKind.DeliverMessage &&
    response.kind === StimulusKind.DeliverMessage
  ) {
    return port.submitMessage({
      kind: StimulusKind.DeliverMessage,
      commandId:
        `mvp-deliver-message:${interaction.subscriptionId.elementId}:${interaction.subscriptionId.activation}`,
      subscriptionId: interaction.subscriptionId,
      channel: interaction.channel,
    });
  }
  if (
    interaction.kind === StimulusKind.DeliverPayloadMessage &&
    response.kind === StimulusKind.DeliverPayloadMessage
  ) {
    return port.submitMessage({
      kind: StimulusKind.DeliverPayloadMessage,
      commandId:
        `mvp-deliver-payload-message:${interaction.subscriptionId.elementId}:${interaction.subscriptionId.activation}`,
      subscriptionId: interaction.subscriptionId,
      channel: interaction.channel,
      payload: response.payload,
    });
  }
  if (
    interaction.kind === StimulusKind.CancelIncidentProcess &&
    response.kind === StimulusKind.CancelIncidentProcess
  ) {
    return port.submitCancellation({
      kind: StimulusKind.CancelIncidentProcess,
      commandId:
        `mvp-cancel-incident-process:${interaction.incidentId.effectId.elementId}:${interaction.incidentId.effectId.activation}:${interaction.incidentId.generation}`,
      processInstanceId: interaction.processInstanceId,
      incidentId: interaction.incidentId,
    });
  }
  throw new TypeError(
    "Matched interaction and configured response disagree on stimulus kind",
  );
}

function isCommitted(result: ProcessCommandResult): boolean {
  return result.kind === ProcessCommandResultKind.Semantic &&
    result.outcome === CommandOutcome.Committed;
}

function refuse(
  code: HostInteractionRefusalCode,
  evidence: string,
): HostInteractionResult {
  return { kind: HostInteractionResultKind.Refused, code, evidence };
}

async function waitForHostDelay(delayMs: number): Promise<void> {
  await hostDelay(delayMs);
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported host interaction variant: ${String(value)}`);
}
