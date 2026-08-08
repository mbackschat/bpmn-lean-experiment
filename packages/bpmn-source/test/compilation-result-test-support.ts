import {
  BpmnCompilationStatus,
} from "@bpmn-lean/bpmn-source";
import type {
  BpmnCompilationResult,
} from "@bpmn-lean/bpmn-source";

export function publicCompilationProjection(result: BpmnCompilationResult) {
  return {
    status: result.status,
    source: result.source,
    diagnostics: result.diagnostics,
    checkedProcess: result.checkedProcess ?? null,
    semanticProcess: result.semanticProcess ?? null,
    exactBytesHex: result.status === BpmnCompilationStatus.Accepted
      ? Array.from(
          result.copyExactBytes(),
          (byte) => byte.toString(16).padStart(2, "0"),
        ).join("")
      : null,
  };
}

export function asRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : undefined;
}
