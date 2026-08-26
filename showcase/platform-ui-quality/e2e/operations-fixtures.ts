import { createHash } from "node:crypto";

import type { Page, Route } from "@playwright/test";

import {
  installPublicApiFixtures,
} from "./fixtures.ts";

export enum FixtureIncidentCollectionState {
  Normal = "normal",
  Empty = "empty",
  Loading = "loading",
  Error = "error",
  Unavailable = "unavailable",
}

export enum FixtureIncidentActionState {
  Stable = "stable",
  RetryResponseLoss = "retryResponseLoss",
  Pending = "pending",
}

export enum FixtureIncidentAuditState {
  Normal = "normal",
  Empty = "empty",
  Loading = "loading",
  Error = "error",
}

export type OperationsFixtureOptions = Readonly<{
  actions?: FixtureIncidentActionState;
  audit?: FixtureIncidentAuditState;
  incidents?: FixtureIncidentCollectionState;
}>;

export type CapturedIncidentAction = Readonly<{
  body: string;
  url: string;
}>;

export type OperationsFixtureCapture = Readonly<{
  actions: CapturedIncidentAction[];
}>;

const sourceSha256 = "c".repeat(64);
const presentationGeneratorSha256 = "d".repeat(64);
const processId = "Process_Enterprise_Incident_Recovery_And_Regulatory_Cancellation";
const secondProcessId = "Process_Incident_Retry_Only";

const definition = definitionVersion(
  processId,
  "cib-seven-2.2.0:service-task-incident-cancellation",
);
const retryOnlyDefinition = definitionVersion(
  secondProcessId,
  "cib-seven-2.2.0:service-task-incident-retry",
);

export const operationsFixtureLabels = {
  actor: "operator-responsible-for-european-regulatory-incident-recovery-2026",
  element: "ServiceTask_Transmit_Validated_Customer_Onboarding_To_Regulated_Core_Banking_System",
  process: "incident-process-instance-eu-central-regulated-onboarding-2026-08-14-000001",
  processModel: processId,
  secondElement: "ServiceTask_Retry_External_Compliance_Check",
  secondProcess: "incident-process-instance-eu-central-regulated-onboarding-2026-08-14-000002",
} as const;

const primaryIncident = incident(
  operationsFixtureLabels.process,
  operationsFixtureLabels.element,
  definition,
  true,
);
const secondaryIncident = incident(
  operationsFixtureLabels.secondProcess,
  operationsFixtureLabels.secondElement,
  retryOnlyDefinition,
  false,
);

export async function installOperationsApiFixtures(
  page: Page,
  options: OperationsFixtureOptions = {},
): Promise<OperationsFixtureCapture> {
  await installPublicApiFixtures(page);
  const actions: CapturedIncidentAction[] = [];
  const actionAttempts = new Map<string, number>();
  const committedProjectionLagReads = new Map<string, number>();
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (request.method() === "GET" && path === "/api/v1/incidents") {
      return fulfillIncidentCollection(
        route,
        options.incidents ?? FixtureIncidentCollectionState.Normal,
        committedProjectionLagReads,
      );
    }
    if (request.method() === "GET" && path.startsWith("/api/v1/incidents/")) {
      const current = incidentFromDetailPath(path);
      return current === undefined
        ? json(route, apiError("The current incident was not found."), 404)
        : json(route, current);
    }
    if (request.method() === "PUT" && path.startsWith("/api/v1/incident-actions/")) {
      const body = request.postData() ?? "";
      actions.push({ body, url: request.url() });
      const attempt = (actionAttempts.get(path) ?? 0) + 1;
      actionAttempts.set(path, attempt);
      const committed = await fulfillIncidentAction(
        route,
        body,
        options.actions ?? FixtureIncidentActionState.Stable,
        attempt,
      );
      if (committed) committedProjectionLagReads.set(incidentActionKey(body), 2);
      return;
    }
    if (request.method() === "GET" && path === "/api/v1/incident-audit") {
      return fulfillIncidentAudit(
        route,
        options.audit ?? FixtureIncidentAuditState.Normal,
        url,
      );
    }
    if (
      request.method() === "GET" &&
      path.includes(`/api/v1/definitions/${encodeURIComponent(processId)}/`) &&
      path.endsWith("/presentation")
    ) {
      return json(route, incidentDiagramPresentation());
    }
    return route.fallback();
  });
  return { actions };
}

function definitionVersion(
  exactProcessId: string,
  semanticProfile: string,
) {
  return {
    processId: exactProcessId,
    version: 1,
    source: {
      kind: "bpmnSource",
      id: `${exactProcessId}.bpmn`,
      sha256: sourceSha256,
      byteLength: 1_024,
      declaredEncoding: "UTF-8",
      decodedAs: "UTF-8",
    },
    semanticProfile,
    startCapabilities: { messageStarts: [], timerStarts: [] },
  } as const;
}

function incident(
  processInstanceId: string,
  elementId: string,
  exactDefinition: ReturnType<typeof definitionVersion>,
  cancellable: boolean,
) {
  const effectId = { processInstanceId, elementId, activation: 1 } as const;
  const incidentId = { effectId, generation: 1 } as const;
  const retry = { kind: "retryIncident", incidentId } as const;
  const cancel = {
    kind: "cancelIncidentProcess",
    processInstanceId,
    incidentId,
  } as const;
  return {
    hostingInstance: { processInstanceId, definition: exactDefinition },
    incident: {
      kind: "effectExecutionFailed",
      id: incidentId,
      effect: {
        id: effectId,
        descriptor: {
          protocol: "cibDelegate",
          operation: "transmitValidatedCustomerOnboarding",
        },
        arguments: [],
      },
    },
    availableInteractions: cancellable ? [retry, cancel] : [retry],
  } as const;
}

async function fulfillIncidentCollection(
  route: Route,
  state: FixtureIncidentCollectionState,
  committedProjectionLagReads: Map<string, number>,
): Promise<void> {
  switch (state) {
    case FixtureIncidentCollectionState.Normal:
      return json(route, {
        incidents: [primaryIncident, secondaryIncident].filter((incident) => {
          const key = publicIncidentKey(incident);
          const remainingLagReads = committedProjectionLagReads.get(key);
          if (remainingLagReads === undefined) return true;
          if (remainingLagReads === 0) return false;
          committedProjectionLagReads.set(key, remainingLagReads - 1);
          return true;
        }),
      });
    case FixtureIncidentCollectionState.Empty:
      return json(route, { incidents: [] });
    case FixtureIncidentCollectionState.Loading:
      await delay(500);
      return json(route, { incidents: [primaryIncident, secondaryIncident] });
    case FixtureIncidentCollectionState.Error:
      return json(route, apiError("The incident request could not be completed.", "internalFailure"), 500);
    case FixtureIncidentCollectionState.Unavailable:
      return json(route, apiError(
        "The current incident snapshot is unavailable.",
        "incidentSnapshotUnavailable",
      ), 503);
  }
}

async function fulfillIncidentAction(
  route: Route,
  body: string,
  state: FixtureIncidentActionState,
  attempt: number,
): Promise<boolean> {
  const request = JSON.parse(body) as Readonly<{
    kind: "cancelIncidentProcess" | "retryIncident";
  }>;
  const actionId = decodeURIComponent(
    new URL(route.request().url()).pathname.slice("/api/v1/incident-actions/".length),
  );
  if (request.kind === "cancelIncidentProcess") {
    await json(route, {
      state: "rejected",
      actionId,
      interaction: request,
      engineResult: { kind: "processClosed", status: "cancelled" },
    });
    return false;
  }
  switch (state) {
    case FixtureIncidentActionState.Stable:
      await json(route, {
        state: "committed",
        actionId,
        interaction: request,
      });
      return true;
    case FixtureIncidentActionState.Pending:
      await delay(500);
      await json(route, {
        state: "committed",
        actionId,
        interaction: request,
      });
      return true;
    case FixtureIncidentActionState.RetryResponseLoss:
      switch (attempt) {
        case 1:
          await route.abort("connectionfailed");
          return false;
        case 2:
          await json(route, {
            state: "indeterminate",
            actionId,
            interaction: request,
          }, 202);
          return false;
        default:
          await json(route, {
            state: "committed",
            actionId,
            interaction: request,
          });
          return true;
      }
  }
}

function incidentActionKey(body: string): string {
  const request = JSON.parse(body) as Readonly<{
    incidentId: Readonly<{
      effectId: Readonly<{
        activation: number;
        elementId: string;
        processInstanceId: string;
      }>;
      generation: number;
    }>;
  }>;
  return [
    request.incidentId.effectId.processInstanceId,
    request.incidentId.effectId.elementId,
    request.incidentId.effectId.activation,
    request.incidentId.generation,
  ].join("\u0000");
}

function publicIncidentKey(candidate: typeof primaryIncident | typeof secondaryIncident): string {
  const id = candidate.incident.id;
  return [
    id.effectId.processInstanceId,
    id.effectId.elementId,
    id.effectId.activation,
    id.generation,
  ].join("\u0000");
}

async function fulfillIncidentAudit(
  route: Route,
  state: FixtureIncidentAuditState,
  url: URL,
): Promise<void> {
  switch (state) {
    case FixtureIncidentAuditState.Loading:
      await delay(500);
      return json(route, auditPage(url));
    case FixtureIncidentAuditState.Error:
      return json(route, apiError("Incident audit is unavailable.", "internalFailure"), 500);
    case FixtureIncidentAuditState.Empty:
      return json(route, { events: [], nextCursor: null });
    case FixtureIncidentAuditState.Normal:
      return json(route, auditPage(url));
  }
}

function auditPage(url: URL) {
  const secondPage = url.searchParams.has("cursor");
  return {
    events: [auditEvent(secondPage ? "audit-event-000003" : "audit-event-000001", secondPage
      ? "committed"
      : "reserved")],
    nextCursor: secondPage ? null : "v1.cGFnZS0y",
  };
}

function auditEvent(eventId: string, outcome: "committed" | "reserved") {
  return {
    eventId,
    actorId: operationsFixtureLabels.actor,
    recordedAt: outcome === "reserved"
      ? "2026-08-14T08:00:00.000Z"
      : "2026-08-14T08:00:01.000Z",
    hostingProcessInstanceId: operationsFixtureLabels.process,
    incidentId: primaryIncident.incident.id,
    actionId: "incident-action-retry-regulated-onboarding-000001",
    actionKind: "retryIncident",
    outcome,
  } as const;
}

function incidentFromDetailPath(path: string) {
  const candidates = [primaryIncident, secondaryIncident] as const;
  return candidates.find((candidate) => {
    const id = candidate.incident.id;
    return path === `/api/v1/incidents/${encodeURIComponent(id.effectId.processInstanceId)}/${encodeURIComponent(id.effectId.elementId)}/${id.effectId.activation}/generations/${id.generation}`;
  });
}

function incidentDiagramPresentation() {
  const presentationBpmnXml = incidentDiagrammedBpmnXml();
  return {
    schemaEpoch: 1,
    definition,
    sourceSha256,
    presentationSha256: createHash("sha256").update(presentationBpmnXml, "utf8").digest("hex"),
    provenance: {
      kind: "generated",
      generatorId: "bpmn-auto-layout",
      generatorVersion: "1.3.0",
      effectiveGeneratorSha256: presentationGeneratorSha256,
    },
    presentationBpmnXml,
  };
}

function incidentDiagrammedBpmnXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_Incident_UI_Quality" targetNamespace="https://bpmn-lean.local/incident-ui-quality">
  <bpmn:process id="${processId}" isExecutable="true">
    <bpmn:startEvent id="StartEvent_Incident"><bpmn:outgoing>Flow_Incident_1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:serviceTask id="${operationsFixtureLabels.element}" name="Transmit validated onboarding"><bpmn:incoming>Flow_Incident_1</bpmn:incoming><bpmn:outgoing>Flow_Incident_2</bpmn:outgoing></bpmn:serviceTask>
    <bpmn:endEvent id="EndEvent_Incident"><bpmn:incoming>Flow_Incident_2</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_Incident_1" sourceRef="StartEvent_Incident" targetRef="${operationsFixtureLabels.element}"/>
    <bpmn:sequenceFlow id="Flow_Incident_2" sourceRef="${operationsFixtureLabels.element}" targetRef="EndEvent_Incident"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_Incident"><bpmndi:BPMNPlane id="Plane_Incident" bpmnElement="${processId}">
    <bpmndi:BPMNShape id="StartEvent_Incident_di" bpmnElement="StartEvent_Incident"><dc:Bounds x="140" y="122" width="36" height="36"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="ServiceTask_Incident_di" bpmnElement="${operationsFixtureLabels.element}"><dc:Bounds x="240" y="100" width="180" height="80"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="EndEvent_Incident_di" bpmnElement="EndEvent_Incident"><dc:Bounds x="490" y="122" width="36" height="36"/></bpmndi:BPMNShape>
    <bpmndi:BPMNEdge id="Flow_Incident_1_di" bpmnElement="Flow_Incident_1"><di:waypoint x="176" y="140"/><di:waypoint x="240" y="140"/></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="Flow_Incident_2_di" bpmnElement="Flow_Incident_2"><di:waypoint x="420" y="140"/><di:waypoint x="490" y="140"/></bpmndi:BPMNEdge>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

function apiError(message: string, code = "notFound") {
  return { error: { code, message } };
}

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
