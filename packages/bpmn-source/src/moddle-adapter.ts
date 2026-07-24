import { BpmnModdle } from "bpmn-moddle";

import {
  BpmnSourceDiagnosticCode,
} from "./contracts.js";
import type { BpmnSourceDiagnostic } from "./contracts.js";

export type ImportedBpmnGraph = Readonly<{
  rootElement: unknown;
  warnings: ReadonlyArray<BpmnSourceDiagnostic>;
}>;

export async function importBpmnGraph(
  xml: string,
  deadlineMs: number,
): Promise<ImportedBpmnGraph> {
  const moddle = new BpmnModdle();
  const result = await withDeadline(
    () => moddle.fromXML(xml),
    deadlineMs,
    "bpmn-moddle import",
  );
  if (
    typeof result !== "object" ||
    result === null ||
    !("rootElement" in result) ||
    !("warnings" in result) ||
    !Array.isArray(result.warnings)
  ) {
    throw new TypeError("bpmn-moddle returned an invalid parse result");
  }
  return {
    rootElement: result.rootElement,
    warnings: result.warnings.map(normalizeWarning),
  };
}

function normalizeWarning(warning: unknown): BpmnSourceDiagnostic {
  return {
    code: BpmnSourceDiagnosticCode.ParserWarning,
    evidence: readMessage(warning, "bpmn-moddle reported an unspecified warning"),
  };
}

export function readMessage(value: unknown, fallback: string): string {
  if (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof value.message === "string"
  ) {
    return value.message;
  }
  return fallback;
}

export function parserFailureDiagnostics(
  error: unknown,
): ReadonlyArray<BpmnSourceDiagnostic> {
  const warnings =
    typeof error === "object" &&
    error !== null &&
    "warnings" in error &&
    Array.isArray(error.warnings)
      ? error.warnings.map(normalizeWarning)
      : [];
  return [
    ...warnings,
    {
      code: BpmnSourceDiagnosticCode.ParserFailure,
      evidence: readMessage(error, "bpmn-moddle import failed."),
    },
  ];
}

function withDeadline<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  operationName: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${operationName} exceeded ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  const operationPromise = Promise.resolve().then(operation);
  return Promise.race([operationPromise, deadline]).finally(() => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  });
}
