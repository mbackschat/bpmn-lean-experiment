/** Shared exact occurrence normalization for cross-instance observation comparisons. */
import { StimulusKind } from "@bpmn-lean/semantic-core";
import type {
  EnabledInteraction,
  OccurrenceId,
} from "@bpmn-lean/semantic-core";

export function normalizeEnabledInteraction(
  interaction: EnabledInteraction,
  normalizeOccurrence: (id: OccurrenceId) => OccurrenceId,
): EnabledInteraction {
  switch (interaction.kind) {
    case StimulusKind.CompleteUserTaskInstance:
      return {
        ...interaction,
        taskId: normalizeOccurrence(interaction.taskId),
      };
    case StimulusKind.DeliverMessage:
      return {
        ...interaction,
        subscriptionId: normalizeOccurrence(interaction.subscriptionId),
      };
    case StimulusKind.RetryIncident:
      return {
        ...interaction,
        incidentId: {
          ...interaction.incidentId,
          effectId: normalizeOccurrence(interaction.incidentId.effectId),
        },
      };
    default:
      return assertNever(interaction);
  }
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported interaction: ${JSON.stringify(value)}`);
}
