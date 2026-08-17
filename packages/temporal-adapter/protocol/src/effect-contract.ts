import { EffectExecutionResultKind } from "@bpmn-lean/semantic-core";
import type {
  DeepReadonly,
  EffectDescriptor,
  EffectExecutionResult,
  VariableBinding,
} from "@bpmn-lean/semantic-core";
import type {
  EffectActivityImplementationResult,
  EffectActivityResult,
} from "./effect-activity-result.js";

export { EffectExecutionResultKind };
export type { EffectExecutionResult };

export type EffectRequest = EffectDescriptor & DeepReadonly<{
  idempotencyKey: string;
  arguments: VariableBinding[];
}>;

export type EffectActivities = DeepReadonly<{
  executeBpmnEffect(
    request: EffectRequest,
  ): Promise<EffectActivityResult>;
}>;

/** Caller-supplied implementation before the production Worker applies transport bounds. */
export type EffectActivityImplementations = DeepReadonly<{
  executeBpmnEffect(
    request: EffectRequest,
  ): Promise<EffectActivityImplementationResult>;
}>;
