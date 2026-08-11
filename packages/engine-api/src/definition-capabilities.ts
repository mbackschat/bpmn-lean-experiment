import { SemanticOperationKind } from "@bpmn-lean/semantic-core";
import type {
  DeepReadonly,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

export type EngineTimerStartCapability = DeepReadonly<{
  startEventId: string;
  durationMs: number;
}>;

export type EngineDefinitionStartCapabilities = DeepReadonly<{
  timerStarts: readonly EngineTimerStartCapability[];
}>;

/** Projects only the resolved start facts a Product 1 scheduling consumer needs. */
export function engineDefinitionStartCapabilities(
  program: SemanticProcessProgram,
): EngineDefinitionStartCapabilities {
  return {
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
