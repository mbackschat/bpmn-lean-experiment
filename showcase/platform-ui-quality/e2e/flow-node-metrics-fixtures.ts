import { createHash } from "node:crypto";

import type { Page, Route } from "@playwright/test";

export enum FlowNodeMetricsFixtureFailure {
  NotFound = "notFound",
  Transport = "transport",
  Unavailable = "unavailable",
}

export type FlowNodeMetricsFixtureOptions = Readonly<{
  delayedVersionSeven?: boolean;
  failure?: FlowNodeMetricsFixtureFailure;
  failVersionSevenOnce?: boolean;
}>;

const processId = "Metrics_Process";
const definitions = [definition(7), definition(8)] as const;

export async function installFlowNodeMetricsFixtures(
  page: Page,
  options: FlowNodeMetricsFixtureOptions = {},
) {
  let metricsRequests = 0;
  let versionSevenRequests = 0;
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== "GET") return notFound(route);
    if (path === "/api/v1/work-tasks") return json(route, { tasks: [] });
    if (path === "/api/v1/definitions") {
      return json(route, { definitions: [definitions[1]] });
    }
    if (path === `/api/v1/definitions/${processId}/versions`) {
      return json(route, { processId, versions: definitions });
    }
    const version = definitionVersion(path);
    if (version === null) return notFound(route);
    const exactDefinition = definitions.find((candidate) => candidate.version === version);
    if (exactDefinition === undefined) return notFound(route);
    if (path.endsWith("/presentation")) {
      return json(route, presentation(exactDefinition));
    }
    if (path.endsWith("/flow-node-metrics")) {
      metricsRequests += 1;
      if (version === 7) {
        versionSevenRequests += 1;
        if (options.delayedVersionSeven === true) await delay(600);
        if (options.failure !== undefined) {
          return failMetrics(route, options.failure);
        }
        if (options.failVersionSevenOnce === true && versionSevenRequests === 1) {
          return failMetrics(route, FlowNodeMetricsFixtureFailure.Unavailable);
        }
      }
      return json(route, metrics(exactDefinition));
    }
    return notFound(route);
  });
  return { metricsRequestCount: () => metricsRequests };
}

function definition(version: number) {
  return {
    processId,
    version,
    source: {
      kind: "bpmnSource",
      id: `metrics-v${version}.bpmn`,
      sha256: String(version).repeat(64),
      byteLength: 1_024,
      declaredEncoding: "UTF-8",
      decodedAs: "UTF-8",
    },
    semanticProfile: "metrics-profile",
    startCapabilities: { messageStarts: [], timerStarts: [] },
  } as const;
}

function metrics(exactDefinition: ReturnType<typeof definition>) {
  return {
    kind: "available",
    snapshot: {
      definition: exactDefinition,
      population: {
        processInstances: exactDefinition.version,
        label: "allRetainedEvidence",
      },
      flowNodes: [{
        elementId: "EndEvent_1",
        frequency: 2,
        running: 0,
        completed: 2,
        cancelled: 0,
        completedDuration: {
          sampleCount: 2,
          minimumMs: 0,
          maximumMs: 0,
          averageMs: 0,
        },
      }, {
        elementId: "StartEvent_1",
        frequency: 3,
        running: 0,
        completed: 3,
        cancelled: 0,
        completedDuration: {
          sampleCount: 3,
          minimumMs: 0,
          maximumMs: 0,
          averageMs: 0,
        },
      }, {
        elementId: "Task_Completed",
        frequency: 3,
        running: 1,
        completed: 2,
        cancelled: 0,
        completedDuration: {
          sampleCount: 2,
          minimumMs: 10,
          maximumMs: 21,
          averageMs: 15,
        },
      }, {
        elementId: "Task_MissingFromDiagram",
        frequency: 1,
        running: 0,
        completed: 1,
        cancelled: 0,
        completedDuration: {
          sampleCount: 1,
          minimumMs: 100,
          maximumMs: 100,
          averageMs: 100,
        },
      }, {
        elementId: "Task_Running",
        frequency: 1,
        running: 1,
        completed: 0,
        cancelled: 0,
        completedDuration: null,
      }],
    },
  } as const;
}

function presentation(exactDefinition: ReturnType<typeof definition>) {
  const presentationBpmnXml = diagrammedBpmnXml();
  return {
    schemaEpoch: 1,
    definition: exactDefinition,
    sourceSha256: exactDefinition.source.sha256,
    presentationSha256: createHash("sha256")
      .update(presentationBpmnXml, "utf8")
      .digest("hex"),
    provenance: { kind: "source" },
    presentationBpmnXml,
  } as const;
}

function diagrammedBpmnXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_Metrics" targetNamespace="https://bpmn-lean.local/metrics">
  <bpmn:process id="${processId}" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1"><bpmn:outgoing>Flow_1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:userTask id="Task_Completed" name="Completed samples"><bpmn:incoming>Flow_1</bpmn:incoming><bpmn:outgoing>Flow_2</bpmn:outgoing></bpmn:userTask>
    <bpmn:userTask id="Task_Running" name="Running only"><bpmn:incoming>Flow_2</bpmn:incoming><bpmn:outgoing>Flow_3</bpmn:outgoing></bpmn:userTask>
    <bpmn:endEvent id="EndEvent_1"><bpmn:incoming>Flow_3</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_Completed"/>
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_Completed" targetRef="Task_Running"/>
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Task_Running" targetRef="EndEvent_1"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_1"><bpmndi:BPMNPlane id="Plane_1" bpmnElement="${processId}">
    <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1"><dc:Bounds x="90" y="122" width="36" height="36"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Task_Completed_di" bpmnElement="Task_Completed"><dc:Bounds x="190" y="100" width="150" height="80"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Task_Running_di" bpmnElement="Task_Running"><dc:Bounds x="410" y="100" width="150" height="80"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1"><dc:Bounds x="630" y="122" width="36" height="36"/></bpmndi:BPMNShape>
    <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1"><di:waypoint x="126" y="140"/><di:waypoint x="190" y="140"/></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2"><di:waypoint x="340" y="140"/><di:waypoint x="410" y="140"/></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="Flow_3_di" bpmnElement="Flow_3"><di:waypoint x="560" y="140"/><di:waypoint x="630" y="140"/></bpmndi:BPMNEdge>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

function definitionVersion(path: string): number | null {
  const match = /^\/api\/v1\/definitions\/Metrics_Process\/versions\/(7|8)\//u.exec(path);
  return match?.[1] === undefined ? null : Number(match[1]);
}

async function failMetrics(
  route: Route,
  failure: FlowNodeMetricsFixtureFailure,
): Promise<void> {
  switch (failure) {
    case FlowNodeMetricsFixtureFailure.NotFound:
      return json(route, {
        error: { code: "notFound", message: "The exact definition was not found." },
      }, 404);
    case FlowNodeMetricsFixtureFailure.Transport:
      return route.abort("connectionfailed");
    case FlowNodeMetricsFixtureFailure.Unavailable:
      return json(route, {
        error: {
          code: "flowNodeMetricsUnavailable",
          message: "Flow-node metrics are unavailable.",
        },
      }, 503);
  }
}

async function notFound(route: Route): Promise<void> {
  await json(route, {
    error: { code: "notFound", message: "No fixed metrics fixture matched." },
  }, 404);
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
