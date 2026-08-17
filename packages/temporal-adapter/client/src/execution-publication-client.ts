/** Strict retained execution-publication Query transport inside Product 1. */
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
  ExecutionPublicationResultKind,
  bpmnExecutionPublicationQueryName,
  requireExecutionPublicationRequest,
  requireExecutionPublicationTransportResult,
  withDeadline,
} from "@bpmn-lean/temporal-protocol";
import type {
  BpmnProcessWorkflow,
  ExecutionPublicationRequest,
  ExecutionPublicationResult,
} from "@bpmn-lean/temporal-protocol";

import type { TemporalDefinitionStartClient } from "./definition-start-client.js";
import {
  WorkflowPublicationObservationKind,
  observeWorkflowPublicationSegment,
} from "./workflow-publication-segment-client.js";

const operationDeadlineMs = 5_000;

export type TemporalExecutionPublicationClient = TemporalDefinitionStartClient;
export const TemporalExecutionPublicationResultKind =
  ExecutionPublicationResultKind;
export type TemporalExecutionPublicationRequest = ExecutionPublicationRequest;
export type TemporalExecutionPublicationResult = ExecutionPublicationResult;

export type TemporalExecutionPublicationIdentity = DeepReadonly<{
  definition: SemanticProcessIdentity;
  processId: string;
  processInstanceId: string;
}>;

/**
 * Reads one strict page at a private host address while validating only public
 * identity and wire equations. Exact Program correspondence remains a producer check.
 */
export async function observeTemporalExecutionPublication(
  client: TemporalExecutionPublicationClient,
  workflowId: string,
  expectedValue: TemporalExecutionPublicationIdentity,
  requestValue: ExecutionPublicationRequest,
): Promise<ExecutionPublicationResult> {
  const expected = snapshotIdentity(expectedValue);
  const request = requireExecutionPublicationRequest(requestValue);
  requireNonempty(workflowId, "workflowId");
  const workflowClient = workflowClientOf(client);
  const observation = await observeWorkflowPublicationSegment(
    workflowClient,
    workflowId,
    expected.processInstanceId,
    request,
  );
  switch (observation.kind) {
    case WorkflowPublicationObservationKind.Paired:
      return requireExecutionPublicationTransportResult(observation.execution, {
        ...expected,
        afterRevision: request.afterRevision,
        ...(request.limit === undefined ? {} : { limit: request.limit }),
      });
    case WorkflowPublicationObservationKind.NotFound:
      return { kind: ExecutionPublicationResultKind.NotFound };
    case WorkflowPublicationObservationKind.Unavailable:
      return { kind: ExecutionPublicationResultKind.Unavailable };
    case WorkflowPublicationObservationKind.Legacy:
      break;
    default:
      return assertNever(observation);
  }
  let value: unknown;
  try {
    value = await withDeadline(
      workflowClient.getHandle<BpmnProcessWorkflow>(workflowId)
        .query<unknown, [ExecutionPublicationRequest]>(
          bpmnExecutionPublicationQueryName,
          request,
        ),
      operationDeadlineMs,
      "execution publication Query",
    );
  } catch (error: unknown) {
    return error instanceof WorkflowNotFoundError
      ? { kind: ExecutionPublicationResultKind.NotFound }
      : { kind: ExecutionPublicationResultKind.Unavailable };
  }
  return requireExecutionPublicationTransportResult(value, {
    ...expected,
    afterRevision: request.afterRevision,
    ...(request.limit === undefined ? {} : { limit: request.limit }),
  });
}

function snapshotIdentity(
  value: TemporalExecutionPublicationIdentity,
): TemporalExecutionPublicationIdentity {
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
    throw new TypeError("malformed execution publication identity");
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
  client: TemporalExecutionPublicationClient,
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

function assertNever(value: never): never {
  throw new TypeError(`Unsupported Workflow publication observation: ${String(value)}`);
}
