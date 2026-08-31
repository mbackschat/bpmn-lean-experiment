import type {
  CorrelatedMessageAddress,
} from "@bpmn-lean/semantic-core";
import type {
  WorkflowClient,
} from "@temporalio/client";

import {
  bpmnCorrelationIngressConfigurationQueryName,
  bpmnCorrelationIngressProtocolVersion,
  bpmnCorrelationIngressWorkflowType,
  correlationIngressWorkflowId,
  createCorrelationIngressEcho,
  requireCorrelationIngressEcho,
  sameCorrelationIngressEcho,
  withDeadline,
} from "@bpmn-lean/temporal-protocol";
import type {
  CorrelationIngressConfiguration,
} from "@bpmn-lean/temporal-protocol";

import type {
  TemporalDefinitionStartClient,
} from "./definition-start-client.js";

const operationDeadlineMs = 5_000;

export type TemporalCorrelationIngressClient = TemporalDefinitionStartClient;

export type EnsureCorrelationIngressRequest = Readonly<{
  address: CorrelatedMessageAddress;
  configuration: CorrelationIngressConfiguration;
  taskQueue: string;
}>;

export const CorrelationIngressEnsureResultKind = Object.freeze({
  Ready: "ready",
  Unavailable: "unavailable",
} as const);

export type CorrelationIngressEnsureResult =
  | Readonly<{
      kind: typeof CorrelationIngressEnsureResultKind.Ready;
      workflowId: string;
    }>
  | Readonly<{
      kind: typeof CorrelationIngressEnsureResultKind.Unavailable;
      workflowId: string;
      failure: Readonly<{
        kind: "unqueryable" | "echoMismatch";
      }>;
    }>;

/** Ensures one canonical ingress and accepts no start outcome without an exact echo Query. */
export async function ensureCorrelationIngress(
  client: TemporalCorrelationIngressClient,
  request: EnsureCorrelationIngressRequest,
): Promise<CorrelationIngressEnsureResult> {
  requireNonempty(request.taskQueue, "taskQueue");
  const expectedEcho = createCorrelationIngressEcho(
    request.address,
    request.configuration,
  );
  const workflowId = correlationIngressWorkflowId(expectedEcho.address);
  const workflowClient = workflowClientOf(client);
  try {
    await withDeadline(
      workflowClient.start(bpmnCorrelationIngressWorkflowType, {
        taskQueue: request.taskQueue,
        workflowId,
        workflowIdReusePolicy: "REJECT_DUPLICATE",
        workflowIdConflictPolicy: "FAIL",
        args: [expectedEcho.address, expectedEcho.configuration],
      }),
      operationDeadlineMs,
      "Correlation ingress Workflow creation",
    );
  } catch {
    // MESSAGE-KEY-CORRELATION-PROPOSAL.md § Registration and candidate-completeness barrier makes the exact Query authoritative across collision and lost-response recovery.
  }

  let observed: unknown;
  try {
    observed = await withDeadline(
      workflowClient.getHandle(workflowId).query(
        bpmnCorrelationIngressConfigurationQueryName,
      ),
      operationDeadlineMs,
      "Correlation ingress configuration Query",
    );
  } catch {
    return {
      kind: CorrelationIngressEnsureResultKind.Unavailable,
      workflowId,
      failure: { kind: "unqueryable" },
    };
  }

  try {
    const actualEcho = requireCorrelationIngressEcho(observed);
    if (sameCorrelationIngressEcho(expectedEcho, actualEcho)) {
      return { kind: CorrelationIngressEnsureResultKind.Ready, workflowId };
    }
  } catch {
    // Callers can act only on exact readiness, so malformed and divergent echoes share one closed result.
  }
  return {
    kind: CorrelationIngressEnsureResultKind.Unavailable,
    workflowId,
    failure: { kind: "echoMismatch" },
  };
}

export const temporalCorrelationIngressProtocolVersion =
  bpmnCorrelationIngressProtocolVersion;

function workflowClientOf(
  client: TemporalCorrelationIngressClient,
): WorkflowClient {
  const concrete = client as unknown as Readonly<{ workflow?: WorkflowClient }>;
  return concrete.workflow ?? client as unknown as WorkflowClient;
}

function requireNonempty(value: string, name: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} must not be empty`);
  }
}
