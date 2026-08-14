import { createHash } from "node:crypto";

import type { Page, Route } from "@playwright/test";

import { installPublicApiFixtures } from "./fixtures.ts";

export enum ExecutionPublicationFixtureState {
  Available = "available",
  Delayed = "delayed",
  Gap = "gap",
  MalformedExport = "malformedExport",
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
  semanticProfile: "cib-seven-2.2.0:committed-execution-publication-parallel-review",
  startCapabilities: { messageStarts: [], timerStarts: [] },
} as const;

const instance = {
  processInstanceId: executionPublicationLabels.processInstanceId,
  definition,
} as const;

const publicationIdentity = {
  definition: {
    compiler: "bpmn-source-semantic-process",
    semanticProfile: definition.semanticProfile,
    sourceId: definition.source.id,
    sourceSha256,
    sourceOverlay: null,
  },
  processId: definition.processId,
  processInstanceId: instance.processInstanceId,
} as const;

const rootScope = scope("Scope_Process", 1);
const repeatedScopeOne = scope("Scope_Repeated", 1);
const repeatedScopeTwo = scope("Scope_Repeated", 2);

const emptyDelta = {
  consumedTokens: [],
  producedTokens: [],
  enteredScopes: [],
  exitedScopes: [],
} as const;

const batch = {
  commandId: "command-start-enterprise-parallel-compliance-review-000001",
  fromRevision: 0,
  throughRevision: 5,
  transitions: [{
    revision: 1,
    logicalTimeMs: 0,
    transition: {
      kind: "externalStimulus",
      stimulus: {
        kind: "startProcess",
        commandId: "command-start-enterprise-parallel-compliance-review-000001",
        processId: publicationIdentity.processId,
        instanceId: publicationIdentity.processInstanceId,
        initialVariables: [{
          name: "regionalApproval",
          value: { kind: "string", value: "pending-review" },
        }],
      },
    },
    positionDelta: emptyDelta,
  }, {
    revision: 2,
    logicalTimeMs: 0,
    transition: {
      kind: "internalOperation",
      operationId: "Operation_Start",
      operationKind: "initiate",
      origin: { kind: "bpmnElement", elementId: "StartEvent_1" },
      owner: rootScope,
    },
    positionDelta: {
      consumedTokens: [],
      producedTokens: [{ sequenceFlowId: "Flow_Pre", owner: rootScope, multiplicity: 1 }],
      enteredScopes: [{ id: rootScope, parent: null, bpmnElementId: definition.processId }],
      exitedScopes: [],
    },
  }, {
    revision: 3,
    logicalTimeMs: 0,
    transition: {
      kind: "internalOperation",
      operationId: "Operation_Parallel_Fork",
      operationKind: "duplicate",
      origin: { kind: "bpmnElement", elementId: "Gateway_Parallel" },
      owner: rootScope,
    },
    positionDelta: {
      consumedTokens: [{ sequenceFlowId: "Flow_Pre", owner: rootScope, multiplicity: 1 }],
      producedTokens: [
        { sequenceFlowId: "Flow_1", owner: rootScope, multiplicity: 1 },
        { sequenceFlowId: "Flow_2", owner: rootScope, multiplicity: 1 },
      ],
      enteredScopes: [],
      exitedScopes: [],
    },
  }, {
    revision: 4,
    logicalTimeMs: 0,
    transition: {
      kind: "internalOperation",
      operationId: "Operation_Repeated_Review",
      operationKind: "enterScope",
      origin: { kind: "bpmnElement", elementId: executionPublicationLabels.repeatedElementId },
      owner: repeatedScopeOne,
    },
    positionDelta: {
      consumedTokens: [],
      producedTokens: [],
      enteredScopes: [{
        id: repeatedScopeOne,
        parent: rootScope,
        bpmnElementId: executionPublicationLabels.missingElementId,
      }],
      exitedScopes: [],
    },
  }, {
    revision: 5,
    logicalTimeMs: 0,
    transition: {
      kind: "internalOperation",
      operationId: "Operation_Repeated_Review",
      operationKind: "enterScope",
      origin: { kind: "bpmnElement", elementId: executionPublicationLabels.repeatedElementId },
      owner: repeatedScopeTwo,
    },
    positionDelta: {
      consumedTokens: [],
      producedTokens: [],
      enteredScopes: [{
        id: repeatedScopeTwo,
        parent: rootScope,
        bpmnElementId: executionPublicationLabels.missingElementId,
      }],
      exitedScopes: [],
    },
  }],
} as const;

const current = {
  revision: 5,
  state: {
    kind: "state",
    instanceId: publicationIdentity.processInstanceId,
    status: "running",
    activeWaits: [],
    openUserTasks: [],
    openMessageSubscriptions: [],
    openTimers: [],
    openEffects: [],
    openIncidents: [],
    variables: [{
      name: "regionalApproval",
      value: { kind: "string", value: "pending-review" },
    }],
    enabledInteractions: [],
    logicalTimeMs: 0,
  },
  controlTokens: [
    { sequenceFlowId: "Flow_1", owner: rootScope, multiplicity: 1 },
    { sequenceFlowId: "Flow_2", owner: rootScope, multiplicity: 1 },
  ],
  scopes: [{
    id: rootScope,
    parent: null,
    bpmnElementId: definition.processId,
  }, {
    id: repeatedScopeOne,
    parent: rootScope,
    bpmnElementId: executionPublicationLabels.missingElementId,
  }, {
    id: repeatedScopeTwo,
    parent: rootScope,
    bpmnElementId: executionPublicationLabels.missingElementId,
  }],
} as const;

const pageBody = {
  ...publicationIdentity,
  requestedAfterRevision: 0,
  pageThroughRevision: 5,
  headRevision: 5,
  batches: [batch],
  current,
} as const;

const exportBody = {
  format: "bpmn-lean.execution-publication.v1",
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
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (request.method() === "GET" && path === "/api/v1/process-instances") {
      return json(route, { instances: [instance], nextCursor: null }, publicResponses);
    }
    const executionPath = `/api/v1/process-instances/${encodeURIComponent(instance.processInstanceId)}/execution`;
    if (request.method() === "GET" && path === executionPath) {
      if (state === ExecutionPublicationFixtureState.Delayed) await delay(500);
      if (state === ExecutionPublicationFixtureState.Gap) {
        return json(route, {
          error: {
            code: "executionPublicationUnavailable",
            message: "The committed execution publication is unavailable.",
          },
        }, publicResponses, 503);
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
      const body = executionPublicationExportBytes();
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
      path === `/api/v1/definitions/${encodeURIComponent(definition.processId)}/versions/${definition.version}/presentation`
    ) {
      return json(route, diagramPresentation(), publicResponses);
    }
    return route.fallback();
  });
  return { publicResponses };
}

export function executionPublicationExportBytes(): Uint8Array {
  return new TextEncoder().encode(canonicalJson(exportBody));
}

function scope(definitionScopeId: string, activation: number) {
  return {
    processInstanceId: executionPublicationLabels.processInstanceId,
    definitionScopeId,
    activation,
  } as const;
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
