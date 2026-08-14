/** Product 1 committed-execution observation behind one opaque Process locator. */
import type {
  SemanticProcessIdentity,
} from "@bpmn-lean/semantic-core";
import {
  TemporalExecutionPublicationResultKind,
  observeTemporalExecutionPublication,
} from "@bpmn-lean/temporal-client/execution-publication";
import type {
  TemporalExecutionPublicationClient,
  TemporalExecutionPublicationResult,
} from "@bpmn-lean/temporal-client/execution-publication";
import {
  TemporalFlowNodeOccurrencePublicationResultKind,
  observeTemporalFlowNodeOccurrences,
} from "@bpmn-lean/temporal-client/flow-node-occurrence-publication";
import type {
  TemporalFlowNodeOccurrencePublicationClient,
  TemporalFlowNodeOccurrencePublicationResult,
} from "@bpmn-lean/temporal-client/flow-node-occurrence-publication";

import {
  engineProcessWorkflowIdFromLocator,
  parseEngineProcessLocator,
} from "./process-locator.js";
import type { EngineProcessLocator } from "./process-locator.js";

export const EngineExecutionPublicationResultKind:
  typeof TemporalExecutionPublicationResultKind =
  TemporalExecutionPublicationResultKind;
export type EngineExecutionPublicationResult =
  TemporalExecutionPublicationResult;

export type EngineProcessExecutionObservationRequest = Readonly<{
  temporalClient: TemporalExecutionPublicationClient;
  locator: EngineProcessLocator;
  definition: SemanticProcessIdentity;
  processId: string;
  processInstanceId: string;
  afterRevision: number;
  limit?: number;
}>;

/** Reads a strict public page without accepting or returning a host address or Program. */
export function observeEngineProcessExecution(
  request: EngineProcessExecutionObservationRequest,
): Promise<EngineExecutionPublicationResult> {
  const locator = parseEngineProcessLocator(request.locator);
  return observeTemporalExecutionPublication(
    request.temporalClient,
    engineProcessWorkflowIdFromLocator(locator),
    {
      definition: request.definition,
      processId: request.processId,
      processInstanceId: request.processInstanceId,
    },
    {
      afterRevision: request.afterRevision,
      ...(request.limit === undefined ? {} : { limit: request.limit }),
    },
  );
}

export const EngineFlowNodeOccurrencePublicationResultKind:
  typeof TemporalFlowNodeOccurrencePublicationResultKind =
  TemporalFlowNodeOccurrencePublicationResultKind;
export type EngineFlowNodeOccurrencePublicationResult =
  TemporalFlowNodeOccurrencePublicationResult;

export type EngineProcessFlowNodeOccurrenceObservationRequest = Readonly<{
  temporalClient: TemporalFlowNodeOccurrencePublicationClient;
  locator: EngineProcessLocator;
  definition: SemanticProcessIdentity;
  processId: string;
  processInstanceId: string;
  afterRevision: number;
  limit?: number;
}>;

/** Reads strict occurrence facts through Product 1's opaque Process locator. */
export function observeEngineProcessFlowNodeOccurrences(
  request: EngineProcessFlowNodeOccurrenceObservationRequest,
): Promise<EngineFlowNodeOccurrencePublicationResult> {
  const locator = parseEngineProcessLocator(request.locator);
  return observeTemporalFlowNodeOccurrences(
    request.temporalClient,
    engineProcessWorkflowIdFromLocator(locator),
    {
      definition: request.definition,
      processId: request.processId,
      processInstanceId: request.processInstanceId,
    },
    {
      afterRevision: request.afterRevision,
      ...(request.limit === undefined ? {} : { limit: request.limit }),
    },
  );
}
