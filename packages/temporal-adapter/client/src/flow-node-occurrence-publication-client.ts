/** Strict retained flow-node occurrence Query transport inside Product 1. */
import {
  SemanticProcessCompilerId,
  isSourceOverlayIdentityOrNull,
  isWellFormedWireString,
} from "@bpmn-lean/semantic-core";
import type {
  DeepReadonly,
  SemanticProcessIdentity,
} from "@bpmn-lean/semantic-core";
import { WorkflowNotFoundError } from "@temporalio/client";
import type { WorkflowClient } from "@temporalio/client";
import {
  FlowNodeOccurrencePublicationResultKind,
  bpmnFlowNodeOccurrencesQueryName,
  requireFlowNodeOccurrencePublicationRequest,
  requireFlowNodeOccurrencePublicationTransportResult,
  withDeadline,
} from "@bpmn-lean/temporal-protocol";
import type {
  BpmnProcessWorkflow,
  FlowNodeOccurrencePublicationRequest,
  FlowNodeOccurrencePublicationResult,
} from "@bpmn-lean/temporal-protocol";

import type { TemporalDefinitionStartClient } from "./definition-start-client.js";

const operationDeadlineMs = 5_000;

export type TemporalFlowNodeOccurrencePublicationClient =
  TemporalDefinitionStartClient;
export const TemporalFlowNodeOccurrencePublicationResultKind =
  FlowNodeOccurrencePublicationResultKind;
export type TemporalFlowNodeOccurrencePublicationRequest =
  FlowNodeOccurrencePublicationRequest;
export type TemporalFlowNodeOccurrencePublicationResult =
  FlowNodeOccurrencePublicationResult;

export type TemporalFlowNodeOccurrencePublicationIdentity = DeepReadonly<{
  definition: SemanticProcessIdentity;
  processId: string;
  processInstanceId: string;
}>;

/** Reads one representation-free occurrence page at a private host address. */
export async function observeTemporalFlowNodeOccurrences(
  client: TemporalFlowNodeOccurrencePublicationClient,
  workflowId: string,
  expectedValue: TemporalFlowNodeOccurrencePublicationIdentity,
  requestValue: FlowNodeOccurrencePublicationRequest,
): Promise<FlowNodeOccurrencePublicationResult> {
  const expected = snapshotIdentity(expectedValue);
  const request = requireFlowNodeOccurrencePublicationRequest(requestValue);
  requireNonempty(workflowId, "workflowId");
  let value: unknown;
  try {
    value = await withDeadline(
      workflowClientOf(client).getHandle<BpmnProcessWorkflow>(workflowId)
        .query<unknown, [FlowNodeOccurrencePublicationRequest]>(
          bpmnFlowNodeOccurrencesQueryName,
          request,
        ),
      operationDeadlineMs,
      "flow-node occurrence publication Query",
    );
  } catch (error: unknown) {
    return error instanceof WorkflowNotFoundError
      ? { kind: FlowNodeOccurrencePublicationResultKind.NotFound }
      : { kind: FlowNodeOccurrencePublicationResultKind.Unavailable };
  }
  return requireFlowNodeOccurrencePublicationTransportResult(value, {
    ...expected,
    afterRevision: request.afterRevision,
    ...(request.limit === undefined ? {} : { limit: request.limit }),
  });
}

function snapshotIdentity(
  value: TemporalFlowNodeOccurrencePublicationIdentity,
): TemporalFlowNodeOccurrencePublicationIdentity {
  const definition = value.definition;
  if (
    definition.compiler !== SemanticProcessCompilerId.BpmnSourceSemanticProcess ||
    !isNonempty(definition.semanticProfile) ||
    !isNonempty(definition.sourceId) ||
    !/^[0-9a-f]{64}$/u.test(definition.sourceSha256) ||
    !isSourceOverlayIdentityOrNull(definition.sourceOverlay) ||
    !isNonempty(value.processId) ||
    !isNonempty(value.processInstanceId)
  ) {
    throw new TypeError("malformed flow-node occurrence publication identity");
  }
  return {
    definition: {
      compiler: definition.compiler,
      semanticProfile: definition.semanticProfile,
      sourceId: definition.sourceId,
      sourceSha256: definition.sourceSha256,
      sourceOverlay: definition.sourceOverlay === null
        ? null
        : { ...definition.sourceOverlay },
    },
    processId: value.processId,
    processInstanceId: value.processInstanceId,
  };
}

function workflowClientOf(
  client: TemporalFlowNodeOccurrencePublicationClient,
): WorkflowClient {
  const concrete = client as unknown as Readonly<{ workflow?: WorkflowClient }>;
  return concrete.workflow ?? client as unknown as WorkflowClient;
}

function requireNonempty(value: string, name: string): void {
  if (!isNonempty(value)) {
    throw new TypeError(`${name} must be a nonempty well-formed Unicode string`);
  }
}

function isNonempty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 &&
    isWellFormedWireString(value);
}
