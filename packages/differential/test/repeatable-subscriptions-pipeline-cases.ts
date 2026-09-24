import { CanonicalObservationKind } from "@bpmn-lean/semantic-core";
import { DisagreementKind } from "@bpmn-lean/differential";
import { TemporalCompletionDelivery, TemporalExecutionSchedule } from "@bpmn-lean/temporal-testkit";
import { PipelineReplaySelection, TemporalCaseRelation } from "./pipeline-types.ts";
import type { MutableScenarioResult, MutableStateObservation, PipelineCase } from "./pipeline-types.ts";

type MutationKind = "timerIdentity" | "handlerMultiplicity" | "messageLifetime" | "withdrawnTimer" | "withdrawnMessage";
function stateAt(result: MutableScenarioResult, index: number): MutableStateObservation {
  const state = result.trace[index];
  if (state?.kind !== CanonicalObservationKind.State) throw new Error("Subscription mutation requires its exact state observation");
  return state;
}
function subscriptionCase(
  id: PipelineCase["id"], name: string, file: string, kind: MutationKind,
  index: number, path: string, expected: number, actual: number,
): PipelineCase {
  return Object.freeze({
    id, scenarioRelativePath: `scenarios/repeatable-event-subscriptions/${file}.scenario.json`,
    bpmnRelativePath: `scenarios/repeatable-event-subscriptions/${name}.bpmn`, workflowIdPrefix: id,
    cib: null, expectedWaitTraceLength: 3, completionDelivery: TemporalCompletionDelivery.Ordered,
    temporalRelation: TemporalCaseRelation.ExactSemantic, executionSchedule: TemporalExecutionSchedule.StimulusOrder,
    effectSchedules: null, replaySelection: PipelineReplaySelection.Primary,
    injectMutation(result: MutableScenarioResult) {
      const state = stateAt(result, index);
      const initial = stateAt(result, 2);
      switch (kind) {
        case "timerIdentity": {
          const timer = state.openTimers[0];
          if (timer?.id.activation !== expected) throw new Error("Subscription mutation requires the fresh recurring Timer");
          timer.id.activation = actual;
          break;
        }
        case "handlerMultiplicity": {
          const handler = state.openUserTasks.findIndex(({ id }) => id.elementId === "HandleReminder");
          if (state.openUserTasks.length !== expected || handler < 0) throw new Error("Subscription mutation requires a retained handler occurrence");
          state.openUserTasks.splice(handler, 1);
          break;
        }
        case "messageLifetime":
          if (state.openMessageSubscriptions.length !== expected) throw new Error("Subscription mutation requires a surviving Message host");
          state.openMessageSubscriptions = [];
          break;
        case "withdrawnTimer":
          if (state.openTimers.length !== 0 || initial.openTimers.length !== 1) throw new Error("Subscription mutation requires exact Timer withdrawal");
          state.openTimers = structuredClone(initial.openTimers);
          break;
        case "withdrawnMessage":
          if (state.openMessageSubscriptions.length !== 0 || initial.openMessageSubscriptions.length !== 1) throw new Error("Subscription mutation requires exact Message withdrawal");
          state.openMessageSubscriptions = structuredClone(initial.openMessageSubscriptions);
          break;
      }
    },
    expectedInjectedDisagreement: { kind: DisagreementKind.ObservationValue as const, path, expected, actual },
  });
}

export const repeatableSubscriptionPipelineCases = Object.freeze([
  subscriptionCase("subscription-boundary-message-repeat", "boundary-message", "boundary-message-repeat", "handlerMultiplicity", 6, "trace[6].openUserTasks.length", 5, 4),
  subscriptionCase("subscription-boundary-message-completion-first", "boundary-message", "boundary-message-completion-first", "withdrawnMessage", 4, "trace[4].openMessageSubscriptions.length", 0, 1),
  subscriptionCase("subscription-boundary-timer-repeat", "boundary-timer", "boundary-timer-repeat", "timerIdentity", 6, "trace[6].openTimers[0].id.activation", 3, 2),
  subscriptionCase("subscription-boundary-timer-completion-first", "boundary-timer", "boundary-timer-completion-first", "withdrawnTimer", 4, "trace[4].openTimers.length", 0, 1),
  subscriptionCase("subscription-subprocess-boundary-timer-repeat", "subprocess-boundary-timer", "subprocess-boundary-timer-repeat", "timerIdentity", 6, "trace[6].openTimers[0].id.activation", 3, 2),
  subscriptionCase("subscription-subprocess-boundary-timer-completion-first", "subprocess-boundary-timer", "subprocess-boundary-timer-completion-first", "withdrawnTimer", 4, "trace[4].openTimers.length", 0, 1),
  subscriptionCase("subscription-subprocess-boundary-one-shot-fire", "subprocess-boundary-one-shot", "subprocess-boundary-one-shot-fire", "handlerMultiplicity", 6, "trace[6].openUserTasks.length", 3, 2),
  subscriptionCase("subscription-message-host-with-child-entry-repeat", "message-host-with-child-entry", "message-host-with-child-entry-repeat", "messageLifetime", 6, "trace[6].openMessageSubscriptions.length", 1, 0),
  subscriptionCase("subscription-catch-message-resume", "catch-message", "catch-message-resume", "withdrawnMessage", 4, "trace[4].openMessageSubscriptions.length", 0, 1),
  subscriptionCase("subscription-catch-message-cancel", "catch-message", "catch-message-cancel", "withdrawnMessage", 4, "trace[4].openMessageSubscriptions.length", 0, 1),
  subscriptionCase("subscription-catch-timer-resume", "catch-timer", "catch-timer-resume", "withdrawnTimer", 4, "trace[4].openTimers.length", 0, 1),
  subscriptionCase("subscription-catch-timer-cancel", "catch-timer", "catch-timer-cancel", "withdrawnTimer", 4, "trace[4].openTimers.length", 0, 1),
  subscriptionCase("subscription-receive-task-resume", "receive-task", "receive-task-resume", "withdrawnMessage", 4, "trace[4].openMessageSubscriptions.length", 0, 1),
  subscriptionCase("subscription-receive-task-cancel", "receive-task", "receive-task-cancel", "withdrawnMessage", 4, "trace[4].openMessageSubscriptions.length", 0, 1),
]);
