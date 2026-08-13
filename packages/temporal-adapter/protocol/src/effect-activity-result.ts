/** Host-only Activity outcome. Semantic result arms retain their existing wire shape. */
import {
  isWellFormedEffectExecutionResult,
} from "@bpmn-lean/semantic-core";
import type {
  DeepReadonly,
  EffectExecutionResult,
} from "@bpmn-lean/semantic-core";

export const EffectActivityResultKind = Object.freeze({
  TechnicalFailure: "technicalFailure",
} as const);

export type EffectTechnicalFailure = DeepReadonly<{
  kind: typeof EffectActivityResultKind.TechnicalFailure;
}>;

export type EffectActivityResult =
  | EffectExecutionResult
  | EffectTechnicalFailure;

export function isWellFormedEffectActivityResult(
  value: unknown,
): value is EffectActivityResult {
  return isWellFormedEffectExecutionResult(value) ||
    (
      isRecord(value) &&
      Object.keys(value).length === 1 &&
      value.kind === EffectActivityResultKind.TechnicalFailure
    );
}

export function isEffectTechnicalFailure(
  value: EffectActivityResult,
): value is EffectTechnicalFailure {
  return value.kind === EffectActivityResultKind.TechnicalFailure;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
