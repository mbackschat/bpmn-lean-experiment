/** Platform-owned copy of the exact Product 1 definition-start capability contract. */
import type {
  EngineDefinitionCompilationResult,
} from "@bpmn-lean/engine-api";

type AcceptedCompilation = Extract<
  EngineDefinitionCompilationResult,
  { status: "accepted" }
>;

export type DefinitionOperationMessageChannel = Readonly<{
  kind: "operationMessage";
  interfaceId: string;
  interfaceOperationId: string;
  messageId: string;
}>;

export type DefinitionMessageStartCapability = Readonly<{
  startEventId: string;
  channel: DefinitionOperationMessageChannel;
}>;

export type DefinitionTimerStartCapability = Readonly<{
  startEventId: string;
  durationMs: number;
}>;

export type DefinitionStartCapabilities = Readonly<{
  messageStarts: readonly DefinitionMessageStartCapability[];
  timerStarts: readonly DefinitionTimerStartCapability[];
}>;

export function mapDefinitionStartCapabilities(
  capabilities: AcceptedCompilation["startCapabilities"],
): DefinitionStartCapabilities {
  return {
    messageStarts: capabilities.messageStarts.map((capability) => ({
      startEventId: capability.startEventId,
      channel: {
        kind: capability.channel.kind,
        interfaceId: capability.channel.interfaceId,
        interfaceOperationId: capability.channel.interfaceOperationId,
        messageId: capability.channel.messageId,
      },
    })),
    timerStarts: capabilities.timerStarts.map(
      ({ startEventId, durationMs }) => ({ startEventId, durationMs }),
    ),
  };
}
