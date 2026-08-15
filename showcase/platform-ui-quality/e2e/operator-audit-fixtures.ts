import type { Page, Route } from "@playwright/test";

import {
  ExecutionPublicationFixtureState,
  executionPublicationLabels,
  installExecutionPublicationFixtures,
} from "./execution-publication-fixtures.ts";

export enum OperatorAuditFixtureState {
  Available = "available",
  Empty = "empty",
  Unavailable = "unavailable",
  PrivateHostField = "privateHostField",
}

export enum OperatorAuditExecutionState {
  Available = "available",
  Unavailable = "unavailable",
}

export type OperatorAuditFixtureOptions = Readonly<{
  audit?: OperatorAuditFixtureState;
  execution?: OperatorAuditExecutionState;
}>;

export type OperatorAuditFixtureCapture = Readonly<{
  publicResponses: unknown[];
}>;

export const operatorAuditLabels = {
  filename: "operator-audit-process-instance-enterprise-parallel-compliance-review-eu-central-2026-08-14-000.json",
  incidentEventIds: [
    "incident-audit-event-eu-central-2026-08-15-000001",
    "incident-audit-event-eu-central-2026-08-15-000002",
  ],
  incidentHeadEventId: "incident-audit-event-eu-central-2026-08-15-000002",
  processInstanceId: executionPublicationLabels.processInstanceId,
  workEventIds: [
    "work-audit-event-eu-central-2026-08-15-000001",
    "work-audit-event-eu-central-2026-08-15-000002",
  ],
  workHeadEventId: "work-audit-event-eu-central-2026-08-15-000002",
} as const;

const definition = {
  processId: executionPublicationLabels.processId,
  version: 4,
  source: {
    kind: "bpmnSource",
    id: "enterprise-parallel-compliance-review-with-long-responsive-identifier.bpmn",
    sha256: "e".repeat(64),
    byteLength: 2_048,
    declaredEncoding: "UTF-8",
    decodedAs: "UTF-8",
  },
  semanticProfile: "cib-seven-2.2.0:committed-execution-publication-parallel-review",
  startCapabilities: { messageStarts: [], timerStarts: [] },
} as const;

const instance = {
  processInstanceId: operatorAuditLabels.processInstanceId,
  definition,
} as const;

const workEvents = [{
  eventId: operatorAuditLabels.workEventIds[0],
  actorId: "regional-compliance-analyst-with-long-responsive-identity-eu-central",
  recordedAt: "2026-08-15T12:00:02.000Z",
  hostingProcessInstanceId: instance.processInstanceId,
  taskId: {
    processInstanceId: instance.processInstanceId,
    elementId: "UserTask_Validate_Corporate_Ownership_Evidence_With_Long_Identifier",
    activation: 1,
  },
  action: {
    kind: "claim",
    actionId: "work-action-claim-corporate-ownership-review-eu-central-000001",
    outcome: "claimed",
  },
}, {
  eventId: operatorAuditLabels.workEventIds[1],
  actorId: "regional-compliance-supervisor-with-long-responsive-identity-eu-central",
  recordedAt: "2026-08-15T12:00:00.000Z",
  hostingProcessInstanceId: instance.processInstanceId,
  taskId: {
    processInstanceId: instance.processInstanceId,
    elementId: "UserTask_Validate_Corporate_Ownership_Evidence_With_Long_Identifier",
    activation: 1,
  },
  action: {
    kind: "completion",
    actionId: "work-action-complete-corporate-ownership-review-eu-central-000002",
    outcome: "committed",
  },
}] as const;

const incidentEvents = [{
  eventId: operatorAuditLabels.incidentEventIds[0],
  actorId: "operations-recovery-specialist-with-long-responsive-identity-eu-central",
  recordedAt: "2026-08-15T12:00:00.000Z",
  hostingProcessInstanceId: instance.processInstanceId,
  incidentId: {
    effectId: {
      processInstanceId: instance.processInstanceId,
      elementId: "ServiceTask_External_Risk_Screening_With_Long_Identifier",
      activation: 2,
    },
    generation: 1,
  },
  actionId: "incident-action-retry-external-risk-screening-eu-central-000001",
  actionKind: "retryIncident",
  outcome: "committed",
}, {
  eventId: operatorAuditLabels.incidentEventIds[1],
  actorId: "operations-cancellation-supervisor-with-long-responsive-identity-eu-central",
  recordedAt: "2026-08-15T12:00:02.000Z",
  hostingProcessInstanceId: instance.processInstanceId,
  incidentId: {
    effectId: {
      processInstanceId: instance.processInstanceId,
      elementId: "ServiceTask_External_Risk_Screening_With_Long_Identifier",
      activation: 2,
    },
    generation: 1,
  },
  actionId: "incident-action-cancel-external-risk-screening-eu-central-000002",
  actionKind: "cancelIncidentProcess",
  outcome: "rejected",
}] as const;

const availableExport = {
  format: "bpmn-lean.operator-audit.v1",
  instance,
  work: {
    headEventId: operatorAuditLabels.workHeadEventId,
    events: workEvents,
  },
  incidentActions: {
    headEventId: operatorAuditLabels.incidentHeadEventId,
    events: incidentEvents,
  },
} as const;

const emptyExport = {
  format: "bpmn-lean.operator-audit.v1",
  instance,
  work: { headEventId: null, events: [] },
  incidentActions: { headEventId: null, events: [] },
} as const;

export async function installOperatorAuditFixtures(
  page: Page,
  options: OperatorAuditFixtureOptions = {},
): Promise<OperatorAuditFixtureCapture> {
  const execution = await installExecutionPublicationFixtures(
    page,
    options.execution === OperatorAuditExecutionState.Unavailable
      ? ExecutionPublicationFixtureState.Gap
      : ExecutionPublicationFixtureState.Available,
  );
  const operatorResponses: unknown[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const expectedPath = `/api/v1/process-instances/${encodeURIComponent(instance.processInstanceId)}/operator-audit/export`;
    if (request.method() !== "GET" || path !== expectedPath) {
      return route.fallback();
    }
    switch (options.audit ?? OperatorAuditFixtureState.Available) {
      case OperatorAuditFixtureState.Available:
        return canonicalAttachment(route, availableExport, operatorResponses);
      case OperatorAuditFixtureState.Empty:
        return canonicalAttachment(route, emptyExport, operatorResponses);
      case OperatorAuditFixtureState.Unavailable:
        return json(route, {
          error: {
            code: "operatorAuditUnavailable",
            message: "The complete operator audit is unavailable.",
          },
        }, operatorResponses, 503);
      case OperatorAuditFixtureState.PrivateHostField:
        return canonicalAttachment(route, {
          ...availableExport,
          workflowId: "private-host-fact-must-not-cross-the-public-contract",
        }, operatorResponses);
    }
  });
  return { publicResponses: [execution.publicResponses, operatorResponses] };
}

export function operatorAuditExportBytes(
  state: OperatorAuditFixtureState.Available | OperatorAuditFixtureState.Empty =
    OperatorAuditFixtureState.Available,
): Uint8Array {
  return new TextEncoder().encode(canonicalJson(
    state === OperatorAuditFixtureState.Empty ? emptyExport : availableExport,
  ));
}

async function canonicalAttachment(
  route: Route,
  body: unknown,
  capture: unknown[],
): Promise<void> {
  capture.push(body);
  await route.fulfill({
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${operatorAuditLabels.filename}"`,
    },
    body: Buffer.from(new TextEncoder().encode(canonicalJson(body))),
  });
}

async function json(
  route: Route,
  body: unknown,
  capture: unknown[],
  status: number,
): Promise<void> {
  capture.push(body);
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  switch (typeof value) {
    case "boolean": return value ? "true" : "false";
    case "number": return String(value);
    case "string": return JSON.stringify(value);
    case "object": {
      const record = value as Record<string, unknown>;
      return `{${Object.keys(record).sort().map((key) =>
        `${JSON.stringify(key)}:${canonicalJson(record[key])}`
      ).join(",")}}`;
    }
    default: throw new TypeError("unsupported operator-audit fixture JSON value");
  }
}
