import type {
  DeepReadonly,
  SemanticProcessIdentity,
  SemanticProcessProgram,
  UnnumberedCommittedTransitionRecord,
  UnnumberedCurrentCommittedExecution,
} from "@bpmn-lean/semantic-core";

import {
  isExecutionPublicationExport,
  isExecutionPublicationPage,
  isExecutionPublicationResult,
} from "./semantic-publication-validation.js";

export const executionPublicationExportFormat =
  "bpmn-lean.execution-publication.v1" as const;
export const bpmnExecutionPublicationQueryName =
  "bpmn-execution-publication" as const;

export type ExecutionPublicationRequest = DeepReadonly<{
  afterRevision: number;
  limit?: number;
}>;

export function requireExecutionPublicationRequest(
  value: unknown,
): ExecutionPublicationRequest {
  const keys = isRecord(value) && Object.hasOwn(value, "limit")
    ? ["afterRevision", "limit"]
    : ["afterRevision"];
  if (!isRecord(value) || !hasOnlyKeys(value, keys) ||
    !isSafe(value.afterRevision, 0) ||
    (Object.hasOwn(value, "limit") && (!isSafe(value.limit, 1) || value.limit > 100))) {
    throw new TypeError("malformed execution publication request");
  }
  return value as ExecutionPublicationRequest;
}

export type CommittedTransitionRecord = DeepReadonly<{
  revision: number;
} & UnnumberedCommittedTransitionRecord>;

export type CommittedTransitionBatch = DeepReadonly<{
  commandId: string;
  fromRevision: number;
  throughRevision: number;
  transitions: [CommittedTransitionRecord, ...CommittedTransitionRecord[]];
}>;

export type CurrentCommittedExecution = DeepReadonly<{
  revision: number;
} & UnnumberedCurrentCommittedExecution>;

export type ExecutionPublicationPage = DeepReadonly<{
  definition: SemanticProcessIdentity;
  processId: string;
  processInstanceId: string;
  requestedAfterRevision: number;
  pageThroughRevision: number;
  headRevision: number;
  batches: CommittedTransitionBatch[];
  current: CurrentCommittedExecution | null;
}>;

export enum ExecutionPublicationResultKind {
  Available = "available",
  NotReady = "notReady",
  NotFound = "notFound",
  Unavailable = "unavailable",
  Gap = "gap",
}

export type ExecutionPublicationResult = DeepReadonly<
  | { kind: ExecutionPublicationResultKind.Available; page: ExecutionPublicationPage }
  | { kind: ExecutionPublicationResultKind.NotReady }
  | { kind: ExecutionPublicationResultKind.NotFound }
  | { kind: ExecutionPublicationResultKind.Unavailable }
  | { kind: ExecutionPublicationResultKind.Gap }
>;

export type ExecutionPublicationExport = DeepReadonly<{
  format: typeof executionPublicationExportFormat;
  definition: SemanticProcessIdentity;
  processId: string;
  processInstanceId: string;
  headRevision: number;
  batches: [CommittedTransitionBatch, ...CommittedTransitionBatch[]];
  current: CurrentCommittedExecution;
}>;

export type ExecutionPublicationValidationContext = DeepReadonly<{
  program: SemanticProcessProgram;
  processInstanceId: string;
  afterRevision?: number;
  limit?: number;
}>;

export type ExecutionPublicationTransportValidationContext = DeepReadonly<{
  definition: SemanticProcessIdentity;
  processId: string;
  processInstanceId: string;
  afterRevision: number;
  limit?: number;
}>;

export function requireExecutionPublicationPage(
  value: unknown,
  context: ExecutionPublicationValidationContext,
): ExecutionPublicationPage {
  if (!isExecutionPublicationPage(value, { kind: "program", context }, true)) {
    throw new TypeError("Temporal Workflow returned a malformed execution publication page");
  }
  return value;
}

export function requireExecutionPublicationResult(
  value: unknown,
  context: ExecutionPublicationValidationContext,
): ExecutionPublicationResult {
  if (!isExecutionPublicationResult(value, { kind: "program", context })) {
    throw new TypeError("Temporal Workflow returned a malformed execution publication result");
  }
  return value;
}

/** Strictly checks public transport facts without claiming private Program correspondence. */
export function requireExecutionPublicationTransportResult(
  value: unknown,
  context: ExecutionPublicationTransportValidationContext,
): ExecutionPublicationResult {
  if (!isExecutionPublicationResult(value, { kind: "transport", context })) {
    throw new TypeError("malformed execution publication transport result");
  }
  return value;
}

export function requireExecutionPublicationExport(
  value: unknown,
  context: ExecutionPublicationValidationContext,
): ExecutionPublicationExport {
  if (!isExecutionPublicationExport(value, context)) {
    throw new TypeError("malformed execution publication export");
  }
  return value;
}

function isSafe(value: unknown, minimum: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key));
}
