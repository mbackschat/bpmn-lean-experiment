import { createHash } from "node:crypto";

import type { Page, Route } from "@playwright/test";

const sourceSha256 = "a".repeat(64);
const generatorSha256 = "b".repeat(64);
const processId = "Process_Responsive_Human_Work_Review";
const definition = {
  processId,
  version: 7,
  source: {
    kind: "bpmnSource",
    id: "responsive-human-work-review.bpmn",
    sha256: sourceSha256,
    byteLength: 815,
    declaredEncoding: "UTF-8",
    decodedAs: "UTF-8",
  },
  semanticProfile: "user-task-assignment-form-metadata-v1",
  startCapabilities: { messageStarts: [], timerStarts: [] },
} as const;

const longText = {
  task: "Review enterprise customer onboarding request with cross-regional compliance evidence and final supervisory approval",
  process: processId,
  actor: "demo-user-responsible-for-regulated-customer-onboarding-across-europe",
  group: "senior-cross-regional-regulatory-reviewers-and-compliance-supervisors",
  occurrence: "customer-onboarding-occurrence-eu-central-regulated-portfolio-2026-08-13-000001",
} as const;

const tasks = [
  workTask(1, longText.task, longText.occurrence, longText.group, null),
  workTask(2, "Validate corporate ownership evidence", "occurrence-eu-central-000002", "ownership-reviewers", null),
  workTask(3, "Confirm sanctions screening disposition", "occurrence-eu-central-000003", "compliance-reviewers", {
    actorId: longText.actor,
    generation: 1,
  }),
  workTask(4, "Approve customer activation", "occurrence-eu-central-000004", "activation-reviewers", null),
] as const;

export async function installPublicApiFixtures(page: Page): Promise<void> {
  await page.route("**/api/v1/**", async (route) => fulfillPublicRequest(route));
}

export async function waitForStableUi(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[role="status"]').filter({ hasText: "Rendering diagram" })
    .waitFor({ state: "detached" }).catch(() => undefined);
  await page.evaluate(() => new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  ));
}

export const fixtureLabels = longText;

async function fulfillPublicRequest(route: Route): Promise<void> {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname;
  if (request.method() === "GET" && path === "/api/v1/definitions") {
    return json(route, { definitions: [definition] });
  }
  if (
    request.method() === "GET" &&
    path === `/api/v1/definitions/${encodeURIComponent(processId)}/versions`
  ) {
    return json(route, { processId, versions: [definition] });
  }
  if (request.method() === "GET" && path === "/api/v1/work-tasks") {
    return json(route, { tasks });
  }
  if (request.method() === "GET" && path.endsWith("/presentation")) {
    return json(route, diagramPresentation());
  }
  if (request.method() === "GET" && path.startsWith("/api/v1/work-tasks/")) {
    const task = taskFromPath(path);
    if (task !== undefined) return json(route, taskDetail(task));
  }
  return json(route, { error: { code: "notFound", message: "Fixed UI fixture has no matching public response." } }, 404);
}

function workTask(
  activation: number,
  name: string,
  processInstanceId: string,
  group: string,
  claim: null | Readonly<{ actorId: string; generation: number }>,
) {
  return {
    task: {
      id: { processInstanceId, elementId: "UserTask_Review", activation },
      name,
      state: "active",
      metadata: {
        assignment: { candidates: [{ kind: "group", id: group }] },
        form: { fields: [{ key: "approvalDecision", type: "boolean" }] },
      },
    },
    hostingInstance: { processInstanceId, definition },
    claimGeneration: claim?.generation ?? 0,
    claim,
    claimableByCurrentActor: true,
  } as const;
}

function taskFromPath(path: string) {
  const segments = path.split("/");
  if (segments.length !== 7) return undefined;
  const processInstanceId = decodeURIComponent(segments[4] ?? "");
  const elementId = decodeURIComponent(segments[5] ?? "");
  const activation = Number(segments[6]);
  return tasks.find((candidate) =>
    candidate.task.id.processInstanceId === processInstanceId &&
    candidate.task.id.elementId === elementId &&
    candidate.task.id.activation === activation
  );
}

function taskDetail(task: typeof tasks[number]) {
  return {
    workTask: task,
    form: {
      fields: [{
        key: "approvalDecision",
        type: "boolean",
        currentValue: { kind: "absent" },
        compatibility: "compatible",
      }],
    },
  };
}

function diagramPresentation() {
  const presentationBpmnXml = diagrammedBpmnXml();
  return {
    schemaEpoch: 1,
    definition,
    sourceSha256,
    presentationSha256: createHash("sha256").update(presentationBpmnXml, "utf8").digest("hex"),
    provenance: {
      kind: "generated",
      generatorId: "bpmn-auto-layout",
      generatorVersion: "1.3.0",
      effectiveGeneratorSha256: generatorSha256,
    },
    presentationBpmnXml,
  };
}

function diagrammedBpmnXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_UI_Quality" targetNamespace="https://bpmn-lean.local/ui-quality">
  <bpmn:process id="${processId}" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1"><bpmn:outgoing>Flow_1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:userTask id="UserTask_Review" name="Review request"><bpmn:incoming>Flow_1</bpmn:incoming><bpmn:outgoing>Flow_2</bpmn:outgoing></bpmn:userTask>
    <bpmn:endEvent id="EndEvent_1"><bpmn:incoming>Flow_2</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="UserTask_Review"/>
    <bpmn:sequenceFlow id="Flow_2" sourceRef="UserTask_Review" targetRef="EndEvent_1"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_1"><bpmndi:BPMNPlane id="Plane_1" bpmnElement="${processId}">
    <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1"><dc:Bounds x="140" y="122" width="36" height="36"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="UserTask_Review_di" bpmnElement="UserTask_Review"><dc:Bounds x="240" y="100" width="150" height="80"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1"><dc:Bounds x="460" y="122" width="36" height="36"/></bpmndi:BPMNShape>
    <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1"><di:waypoint x="176" y="140"/><di:waypoint x="240" y="140"/></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2"><di:waypoint x="390" y="140"/><di:waypoint x="460" y="140"/></bpmndi:BPMNEdge>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}
