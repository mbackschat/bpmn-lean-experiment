/**
 * Product 2's view of a definition's starts: Message starts on an operation channel, which its publication contract
 * addresses, and Timer starts with the delay the engine resolves for them. A Message start on another channel is
 * outside that contract, so a definition with one is refused at the gateway with a stable code.
 */
import type { EngineDefinitionCapabilities, EngineTimerSchedule } from "@bpmn-lean/engine-api";
import type {
  PublicDefinitionStartCapabilities,
  PublicMessageStartCapability,
  PublicOperationMessageChannel,
  PublicTimerStartCapability,
} from "@bpmn-lean/platform-contracts";

export type DefinitionOperationMessageChannel = PublicOperationMessageChannel;
export type DefinitionMessageStartCapability = PublicMessageStartCapability;
export type DefinitionTimerStartCapability = PublicTimerStartCapability;
export type DefinitionStartCapabilities = PublicDefinitionStartCapabilities;

/** The refusal of a definition whose start Product 2 cannot address. */
export const unaddressableMessageStartCode = "platform.messageStartChannel";

export type StartCapabilityMapping =
  | Readonly<{ kind: "mapped"; capabilities: DefinitionStartCapabilities }>
  | Readonly<{ kind: "refused"; code: string; element: string; evidence: string }>;


export function mapDefinitionStartCapabilities(capabilities: EngineDefinitionCapabilities): StartCapabilityMapping {
  const messageStarts: DefinitionMessageStartCapability[] = [];
  const timerStarts: DefinitionTimerStartCapability[] = [];
  for (const start of capabilities.starts) {
    if (start.trigger.kind === "message") {
      const channel = start.trigger.channel;
      if (channel.kind !== "operationMessage") {
        return {
          kind: "refused",
          code: unaddressableMessageStartCode,
          element: start.startEventId,
          evidence: "A Message start that names no Operation cannot be addressed by a Product 2 publication.",
        };
      }
      messageStarts.push({ startEventId: start.startEventId, channel: { ...channel } });
    }
    // A one-shot Schedule realizes a delay; a date, a cycle and a Cron expression have none.
    if (start.schedule !== null) {
      timerStarts.push({ startEventId: start.startEventId, durationMs: "durationMs" in start.schedule ? start.schedule.durationMs : null });
    }
  }
  return { kind: "mapped", capabilities: { messageStarts, timerStarts } };
}

/** The resolved schedule of the Timer start `startEventId`, `null` when the definition publishes no such start. */
export function engineTimerSchedule(capabilities: EngineDefinitionCapabilities, startEventId: string): EngineTimerSchedule | null {
  const selected = capabilities.starts.filter((start) => start.startEventId === startEventId && start.schedule !== null);
  return selected.length === 1 ? selected[0]!.schedule : null;
}

/** The value with every object's keys sorted, so stored and recompiled capabilities compare by content. */
function sortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort()
      .map((key) => [key, sortedKeys((value as Record<string, unknown>)[key])]));
  }
  return value;
}

function canonical(value: unknown): string {
  return JSON.stringify(sortedKeys(value));
}

/** Whether the stored capabilities are what the definition compiles to now. */
export function sameStartCapabilities(left: DefinitionStartCapabilities, right: DefinitionStartCapabilities): boolean {
  return canonical(left) === canonical(right);
}
