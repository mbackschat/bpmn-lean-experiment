import type {
  DeepReadonly,
  ScopeOccurrenceId,
  SemanticProcessIdentity,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import type {
  ExecutionPublicationPage,
} from "./semantic-publication.js";
import {
  isFlowNodeOccurrencePublicationResult,
} from "./flow-node-occurrence-publication-validation.js";

export const bpmnFlowNodeOccurrencesQueryName =
  "bpmn-flow-node-occurrences" as const;

export type FlowNodeOccurrencePublicationRequest = DeepReadonly<{
  afterRevision: number;
  limit?: number;
}>;

export enum FlowNodeOccurrenceTerminalKind {
  Completed = "completed",
  Cancelled = "cancelled",
}

export type FlowNodeOccurrenceId = DeepReadonly<{
  processInstanceId: string;
  startRevision: number;
  startIndex: number;
}>;

export type FlowNodeOccurrenceStart = DeepReadonly<{
  id: FlowNodeOccurrenceId;
  processId: string;
  elementId: string;
  owner: ScopeOccurrenceId;
}>;

export type FlowNodeOccurrenceEnd = DeepReadonly<{
  id: FlowNodeOccurrenceId;
  terminal: FlowNodeOccurrenceTerminalKind;
}>;

export type FlowNodeOccurrenceDelta = DeepReadonly<{
  started: FlowNodeOccurrenceStart[];
  ended: FlowNodeOccurrenceEnd[];
}>;

export type FlowNodeOccurrenceTransition = DeepReadonly<{
  revision: number;
  lifecycle: FlowNodeOccurrenceDelta;
}>;

export type FlowNodeOccurrenceBatch = DeepReadonly<{
  commandId: string;
  fromRevision: number;
  throughRevision: number;
  committedAtEpochMs: number;
  transitions: [
    FlowNodeOccurrenceTransition,
    ...FlowNodeOccurrenceTransition[],
  ];
}>;

export type OpenFlowNodeOccurrence = DeepReadonly<{
  id: FlowNodeOccurrenceId;
  processId: string;
  elementId: string;
  owner: ScopeOccurrenceId;
  startedAtEpochMs: number;
}>;

export type FlowNodeOccurrencePage = DeepReadonly<{
  definition: SemanticProcessIdentity;
  processId: string;
  processInstanceId: string;
  requestedAfterRevision: number;
  pageThroughRevision: number;
  headRevision: number;
  batches: FlowNodeOccurrenceBatch[];
  currentOpen: OpenFlowNodeOccurrence[] | null;
}>;

export enum FlowNodeOccurrencePublicationResultKind {
  Available = "available",
  NotReady = "notReady",
  NotFound = "notFound",
  Unavailable = "unavailable",
  Gap = "gap",
}

export type FlowNodeOccurrencePublicationResult = DeepReadonly<
  | {
      kind: FlowNodeOccurrencePublicationResultKind.Available;
      page: FlowNodeOccurrencePage;
    }
  | { kind: FlowNodeOccurrencePublicationResultKind.NotReady }
  | { kind: FlowNodeOccurrencePublicationResultKind.NotFound }
  | { kind: FlowNodeOccurrencePublicationResultKind.Unavailable }
  | { kind: FlowNodeOccurrencePublicationResultKind.Gap }
>;

export type FlowNodeOccurrencePublicationValidationContext = DeepReadonly<{
  program: SemanticProcessProgram;
  processInstanceId: string;
  executionPublication: ExecutionPublicationPage;
  afterRevision?: number;
  limit?: number;
}>;

export type FlowNodeOccurrencePublicationTransportValidationContext =
  DeepReadonly<{
    definition: SemanticProcessIdentity;
    processId: string;
    processInstanceId: string;
    afterRevision: number;
    limit?: number;
  }>;

export function requireFlowNodeOccurrencePublicationRequest(
  value: unknown,
): FlowNodeOccurrencePublicationRequest {
  const keys = isRecord(value) && Object.hasOwn(value, "limit")
    ? ["afterRevision", "limit"]
    : ["afterRevision"];
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, keys) ||
    !isSafe(value.afterRevision, 0) ||
    (Object.hasOwn(value, "limit") &&
      (!isSafe(value.limit, 1) || value.limit > 100))
  ) {
    throw new TypeError(
      "malformed flow-node occurrence publication request",
    );
  }
  return value as FlowNodeOccurrencePublicationRequest;
}

export function requireFlowNodeOccurrencePublicationResult(
  value: unknown,
  context: FlowNodeOccurrencePublicationValidationContext,
): FlowNodeOccurrencePublicationResult {
  if (!isFlowNodeOccurrencePublicationResult(
    value,
    { kind: "program", context },
  )) {
    throw new TypeError(
      "malformed flow-node occurrence publication result",
    );
  }
  return value;
}

/** Strictly checks public transport facts without inventing unseen private state. */
export function requireFlowNodeOccurrencePublicationTransportResult(
  value: unknown,
  context: FlowNodeOccurrencePublicationTransportValidationContext,
): FlowNodeOccurrencePublicationResult {
  if (!isFlowNodeOccurrencePublicationResult(
    value,
    { kind: "transport", context },
  )) {
    throw new TypeError(
      "malformed flow-node occurrence publication transport result",
    );
  }
  return value;
}

function isSafe(value: unknown, minimum: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => keys.includes(key));
}
