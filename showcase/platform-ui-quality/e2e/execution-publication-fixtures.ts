import { createHash } from "node:crypto";

import type { Page, Route } from "@playwright/test";

import { installPublicApiFixtures } from "./fixtures.ts";
import {
  AlphaFixtureJourney,
  muePreviewAlphaExecutionPage,
} from "./mue-preview-alpha-fixtures.ts";

export enum ExecutionPublicationFixtureState {
  Available = "available",
  Delayed = "delayed",
  Gap = "gap",
  MalformedExport = "malformedExport",
  SequentialAlpha = "sequentialAlpha",
  SequentialInterrupted = "sequentialInterrupted",
  SequentialNatural = "sequentialNatural",
}

export type ExecutionPublicationFixtureCapture = Readonly<{
  publicResponses: unknown[];
}>;

export const executionPublicationLabels = {
  processId: "Process_Enterprise_Parallel_Compliance_Review_With_Long_Responsive_Identifier",
  processInstanceId: "process-instance-enterprise-parallel-compliance-review-eu-central-2026-08-14-000001",
  repeatedElementId: "UserTask_Repeated_Review",
  missingElementId: "Called_Process_Position_Not_Rendered_In_Parent_Diagram",
} as const;

const sourceSha256 = "e".repeat(64);
const presentationGeneratorSha256 = "f".repeat(64);
const definition = {
  processId: executionPublicationLabels.processId,
  version: 4,
  source: {
    kind: "bpmnSource",
    id: "enterprise-parallel-compliance-review-with-long-responsive-identifier.bpmn",
    sha256: sourceSha256,
    byteLength: 2_048,
    declaredEncoding: "UTF-8",
    decodedAs: "UTF-8",
  },
  semanticProfile: "cibseven-2.2.0",
  sourceOverlay: null,
  startCapabilities: { messageStarts: [], timerStarts: [] },
} as const;

const instance = {
  processInstanceId: executionPublicationLabels.processInstanceId,
  definition,
} as const;

/** A publication names its definition as the engine does (`semantic-publication.schema.json#/$defs/definitionIdentity`). */
function publicationIdentityOf(exact: Readonly<{
  processId: string;
  version: number;
  source: Readonly<{ sha256: string }>;
  semanticProfile: string;
}>) {
  return {
    definition: {
      ref: { definitionKey: exact.processId, version: exact.version, sha256: exact.source.sha256 },
      profile: exact.semanticProfile,
      sourceOverlay: null,
    },
    processInstanceId: executionPublicationLabels.processInstanceId,
  } as const;
}

const publicationIdentity = publicationIdentityOf(definition);

const alphaDefinition = {
  ...definition,
  processId: "Process_SequentialMultiInstanceReview",
  version: 1,
  source: {
    ...definition.source,
    id: "sequential-multi-instance-review.bpmn",
    sha256: "982f77f7fcca2d01bd2357c11057c5fdb6aaf3b383ac351a93aa32ab1bbca3ff",
    byteLength: 5_681,
  },
  semanticProfile: "bpmn-2.0.2",
} as const;

const alphaInstance = {
  processInstanceId: executionPublicationLabels.processInstanceId,
  definition: alphaDefinition,
} as const;

const alphaPublicationIdentity = publicationIdentityOf(alphaDefinition);

/** The record of one kernel micro-step: its cause, the element it acted on and the scope occurrence that owns it. */
function arrival(
  revision: number,
  flow: string,
  element: string,
  sourceType: string,
  owner: number,
) {
  return {
    revision,
    role: { kind: "arrive", flow },
    element,
    sourceType,
    owner,
  } as const;
}

// The repeated element arrives under two distinct scope occurrences, so only its owner tells the arrivals apart.
const batch = {
  commandId: "command-start-enterprise-parallel-compliance-review-000001",
  fromRevision: 0,
  throughRevision: 5,
  transitions: [{
    revision: 1,
    role: { kind: "input", input: "start" },
    element: "StartEvent_1",
    sourceType: "startEvent",
    owner: 0,
  },
  arrival(2, "Flow_Pre", "Gateway_Parallel", "parallelGateway", 0),
  arrival(3, "Flow_1", "Task_Left", "userTask", 0),
  arrival(4, "Flow_Repeat", executionPublicationLabels.repeatedElementId, "userTask", 1),
  arrival(5, "Flow_Repeat", executionPublicationLabels.repeatedElementId, "userTask", 2)],
} as const;

/** One open wait of the root instance, in the engine's typed form (`canonical-result.schema.json#/$defs/openWait`). */
function effectWait(elementId: string, activation: number) {
  return {
    id: { processInstanceId: executionPublicationLabels.processInstanceId, elementId, activation },
    definition: null,
    input: "effectResult",
    detail: {
      kind: "effect",
      protocol: "cibDelegate",
      operation: "recordComplianceReview",
      arguments: [],
      failures: 0,
      send: null,
    },
  } as const;
}

const taskLeftWait = {
  id: { processInstanceId: executionPublicationLabels.processInstanceId, elementId: "Task_Left", activation: 1 },
  definition: null,
  input: "command",
  detail: {
    kind: "userTask",
    name: null,
    assignee: null,
    candidateUsers: [],
    candidateGroups: [],
    formKey: null,
    formFields: [],
    dueDate: null,
    followUpDate: null,
    priority: null,
    inputs: [],
  },
} as const;

// Open waits stay in the canonical order of their occurrences: element identifier, then activation.
const current = {
  revision: 5,
  state: {
    kind: "state",
    instanceId: publicationIdentity.processInstanceId,
    status: "running",
    logicalTimeMs: 0,
    variables: [{
      name: "regionalApproval",
      value: { kind: "string", value: "pending-review" },
    }],
    scopes: [],
    openWaits: [
      effectWait(executionPublicationLabels.missingElementId, 1),
      effectWait(executionPublicationLabels.missingElementId, 2),
      taskLeftWait,
    ],
  },
} as const;

const pageBody = {
  ...publicationIdentity,
  requestedAfterRevision: 0,
  pageThroughRevision: 5,
  headRevision: 5,
  batches: [batch],
  current,
} as const;

const alphaPageBody = {
  ...pageBody,
  ...alphaPublicationIdentity,
} as const;

const exportBody = {
  format: "bpmn-lean.execution-publication",
  ...publicationIdentity,
  headRevision: 5,
  batches: [batch],
  current,
} as const;

export async function installExecutionPublicationFixtures(
  page: Page,
  state: ExecutionPublicationFixtureState = ExecutionPublicationFixtureState.Available,
): Promise<ExecutionPublicationFixtureCapture> {
  await installPublicApiFixtures(page);
  const publicResponses: unknown[] = [];
  let sequentialExecutionRequests = 0;
  const selectedInstance = isAlphaFixtureState(state) ? alphaInstance : instance;
  const alphaBase = {
    batch,
    current,
    pageBody: alphaPageBody,
    processInstanceId: alphaPublicationIdentity.processInstanceId,
  } as const;

  function alphaPage(journey: AlphaFixtureJourney): unknown {
    return muePreviewAlphaExecutionPage(alphaBase, journey, sequentialExecutionRequests);
  }

  /** The Alpha export is the running snapshot: the download journey belongs to the ordinary state. */
  function alphaExportBytes(): Uint8Array {
    const { requestedAfterRevision: _requested, pageThroughRevision: _through, ...running } =
      muePreviewAlphaExecutionPage(alphaBase, AlphaFixtureJourney.Running, 1);
    return new TextEncoder().encode(canonicalJson({ format: exportBody.format, ...running }));
  }

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (request.method() === "GET" && path === "/api/v1/process-instances") {
      return json(route, { instances: [selectedInstance], nextCursor: null }, publicResponses);
    }
    const executionPath = `/api/v1/process-instances/${encodeURIComponent(instance.processInstanceId)}/execution`;
    if (request.method() === "GET" && path === executionPath) {
      sequentialExecutionRequests += 1;
      if (state === ExecutionPublicationFixtureState.Delayed) await delay(500);
      if (state === ExecutionPublicationFixtureState.Gap) {
        return json(route, {
          error: {
            code: "executionPublicationUnavailable",
            message: "The committed execution publication is unavailable.",
          },
        }, publicResponses, 503);
      }
      if (state === ExecutionPublicationFixtureState.SequentialAlpha) {
        return json(route, alphaPage(AlphaFixtureJourney.Running), publicResponses);
      }
      if (state === ExecutionPublicationFixtureState.SequentialNatural) {
        return json(route, alphaPage(AlphaFixtureJourney.Natural), publicResponses);
      }
      if (state === ExecutionPublicationFixtureState.SequentialInterrupted) {
        return json(route, alphaPage(AlphaFixtureJourney.Interrupted), publicResponses);
      }
      return json(route, pageBody, publicResponses);
    }
    if (request.method() === "GET" && path === `${executionPath}/export`) {
      if (state === ExecutionPublicationFixtureState.MalformedExport) {
        return route.fulfill({
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "content-disposition": `attachment; filename="execution-${instance.processInstanceId}.json"`,
          },
          body: JSON.stringify({ workflowId: "private-host-fact" }),
        });
      }
      const body = isAlphaFixtureState(state) ? alphaExportBytes() : executionPublicationExportBytes();
      publicResponses.push(new TextDecoder().decode(body));
      return route.fulfill({
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-disposition": `attachment; filename="execution-${instance.processInstanceId}.json"`,
        },
        body: Buffer.from(body),
      });
    }
    if (
      request.method() === "GET" &&
      path === `/api/v1/process-instances/${encodeURIComponent(instance.processInstanceId)}/operator-audit/export`
    ) {
      const body = {
        format: "bpmn-lean.operator-audit.v1",
        instance: selectedInstance,
        work: { headEventId: null, events: [] },
        incidentActions: { headEventId: null, events: [] },
      } as const;
      publicResponses.push(body);
      return route.fulfill({
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-disposition": `attachment; filename="operator-audit-${instance.processInstanceId.slice(0, 80)}.json"`,
        },
        body: Buffer.from(new TextEncoder().encode(canonicalJson(body))),
      });
    }
    if (
      request.method() === "GET" &&
      path === `/api/v1/definitions/${encodeURIComponent(definition.processId)}/versions/${definition.version}/presentation`
    ) {
      return json(route, diagramPresentation(), publicResponses);
    }
    return route.fallback();
  });
  return { publicResponses };
}

function isAlphaFixtureState(state: ExecutionPublicationFixtureState): boolean {
  switch (state) {
    case ExecutionPublicationFixtureState.SequentialAlpha:
    case ExecutionPublicationFixtureState.SequentialInterrupted:
    case ExecutionPublicationFixtureState.SequentialNatural:
      return true;
    case ExecutionPublicationFixtureState.Available:
    case ExecutionPublicationFixtureState.Delayed:
    case ExecutionPublicationFixtureState.Gap:
    case ExecutionPublicationFixtureState.MalformedExport:
      return false;
  }
}

export function executionPublicationExportBytes(): Uint8Array {
  return new TextEncoder().encode(canonicalJson(exportBody));
}

function diagramPresentation() {
  const presentationBpmnXml = diagramXml();
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

function diagramXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_Execution" targetNamespace="https://bpmn-lean.local/execution">
  <bpmn:process id="${definition.processId}" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1"><bpmn:outgoing>Flow_Pre</bpmn:outgoing></bpmn:startEvent>
    <bpmn:parallelGateway id="Gateway_Parallel"><bpmn:incoming>Flow_Pre</bpmn:incoming><bpmn:outgoing>Flow_1</bpmn:outgoing><bpmn:outgoing>Flow_2</bpmn:outgoing></bpmn:parallelGateway>
    <bpmn:userTask id="Task_Left"><bpmn:incoming>Flow_1</bpmn:incoming></bpmn:userTask>
    <bpmn:userTask id="Task_Right"><bpmn:incoming>Flow_2</bpmn:incoming></bpmn:userTask>
    <bpmn:sequenceFlow id="Flow_Pre" sourceRef="StartEvent_1" targetRef="Gateway_Parallel"/>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Gateway_Parallel" targetRef="Task_Left"/>
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Gateway_Parallel" targetRef="Task_Right"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_Execution"><bpmndi:BPMNPlane id="Plane_Execution" bpmnElement="${definition.processId}">
    <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1"><dc:Bounds x="80" y="152" width="36" height="36"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Gateway_Parallel_di" bpmnElement="Gateway_Parallel"><dc:Bounds x="180" y="145" width="50" height="50"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Task_Left_di" bpmnElement="Task_Left"><dc:Bounds x="330" y="80" width="120" height="80"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Task_Right_di" bpmnElement="Task_Right"><dc:Bounds x="330" y="210" width="120" height="80"/></bpmndi:BPMNShape>
    <bpmndi:BPMNEdge id="Flow_Pre_di" bpmnElement="Flow_Pre"><di:waypoint x="116" y="170"/><di:waypoint x="180" y="170"/></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1"><di:waypoint x="205" y="145"/><di:waypoint x="205" y="120"/><di:waypoint x="330" y="120"/></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2"><di:waypoint x="205" y="195"/><di:waypoint x="205" y="250"/><di:waypoint x="330" y="250"/></bpmndi:BPMNEdge>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;
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
      return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
    }
    default: throw new TypeError("unsupported fixture JSON value");
  }
}

async function json(
  route: Route,
  body: unknown,
  capture: unknown[],
  status = 200,
): Promise<void> {
  capture.push(body);
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
