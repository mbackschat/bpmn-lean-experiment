import { SemanticOperationKind } from "@bpmn-lean/semantic-core";
import type {
  CorrelatedMessageAddress,
  DeepReadonly,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

export type EngineTimerStartCapability = DeepReadonly<{
  startEventId: string;
  durationMs: number;
}>;

export type EngineOperationMessageChannel = DeepReadonly<{
  kind: "operationMessage";
  interfaceId: string;
  interfaceOperationId: string;
  messageId: string;
}>;

export type EngineMessageStartCapability = DeepReadonly<{
  startEventId: string;
  channel: EngineOperationMessageChannel;
}>;

export type EngineDefinitionStartCapabilities = DeepReadonly<{
  messageStarts: readonly EngineMessageStartCapability[];
  timerStarts: readonly EngineTimerStartCapability[];
}>;

export type EngineCorrelatedMessageCapability = DeepReadonly<{
  catchEventId: string;
  address: CorrelatedMessageAddress;
}>;

export type EngineDefinitionCorrelationCapabilities = DeepReadonly<{
  messages: readonly EngineCorrelatedMessageCapability[];
}>;

/** Projects only the resolved start facts a Product 1 scheduling consumer needs. */
export function engineDefinitionStartCapabilities(
  program: SemanticProcessProgram,
): EngineDefinitionStartCapabilities {
  return {
    messageStarts: program.operations.flatMap((operation) => {
      switch (operation.kind) {
        case SemanticOperationKind.InitiateMessage:
          return [{
            startEventId: operation.origin.elementId,
            channel: {
              kind: operation.channel.kind,
              interfaceId: operation.channel.interfaceId,
              interfaceOperationId: operation.channel.interfaceOperationId,
              messageId: operation.channel.messageId,
            },
          }];
        default:
          return [];
      }
    }),
    timerStarts: program.operations.flatMap((operation) => {
      switch (operation.kind) {
        case SemanticOperationKind.InitiateTimer:
          return [{
            startEventId: operation.origin.elementId,
            durationMs: operation.timer.durationMs,
          }];
        default:
          return [];
      }
    }),
  };
}

/** Projects complete definition-scoped addresses without publishing a Process target. */
export function engineDefinitionCorrelationCapabilities(
  program: SemanticProcessProgram,
): EngineDefinitionCorrelationCapabilities {
  return {
    messages: program.operations.flatMap((operation) => {
      switch (operation.kind) {
        case SemanticOperationKind.AwaitCorrelatedPayloadMessage:
          return [{
            catchEventId: operation.origin.elementId,
            address: {
              definition: program.identity,
              processId: program.processId,
              channel: operation.message.channel,
              correlationKeyId: operation.correlationKeyId,
            },
          }];
        default:
          return [];
      }
    }),
  };
}
