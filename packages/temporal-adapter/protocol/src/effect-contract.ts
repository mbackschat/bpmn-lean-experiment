import { EffectExecutionResultKind } from "@bpmn-lean/semantic-core";
import type {
  DeepReadonly,
  EffectDescriptor,
  EffectExecutionResult,
  VariableBinding,
} from "@bpmn-lean/semantic-core";

export { EffectExecutionResultKind };
export type { EffectExecutionResult };

export type EffectRequest = EffectDescriptor & DeepReadonly<{
  idempotencyKey: string;
  arguments: VariableBinding[];
}>;

export type EffectActivities = DeepReadonly<{
  executeBpmnEffect(
    request: EffectRequest,
  ): Promise<EffectExecutionResult>;
}>;
