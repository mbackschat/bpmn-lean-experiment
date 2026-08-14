import { createHash } from "node:crypto";

import type { Page, Route } from "@playwright/test";

export enum FixtureWorkState {
  Normal = "normal",
  Empty = "empty",
  Error = "error",
  Loading = "loading",
  EmptyAfterDetail = "emptyAfterDetail",
}

export enum FixtureTaskDetailState {
  Compatible = "compatible",
  Incompatible = "incompatible",
  CalledProcess = "calledProcess",
}

export enum FixturePresentationState {
  Generated = "generated",
  Source = "source",
  Unavailable = "unavailable",
  RenderingFailure = "renderingFailure",
  MissingTaskElement = "missingTaskElement",
}

export enum FixtureCompletionState {
  Committed = "committed",
  Rejected = "rejected",
  TransportIndeterminateCommitted = "transportIndeterminateCommitted",
  PendingCommitted = "pendingCommitted",
}

export type PublicApiFixtureOptions = Readonly<{
  completion?: FixtureCompletionState;
  presentation?: FixturePresentationState;
  taskDetail?: FixtureTaskDetailState;
  work?: FixtureWorkState;
}>;

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
  workTask(1, longText.task, longText.occurrence, longText.group, {
    actorId: "demo-user",
    generation: 1,
  }),
  workTask(2, "Validate corporate ownership evidence", "occurrence-eu-central-000002", "ownership-reviewers", null),
  workTask(3, "Confirm sanctions screening disposition", "occurrence-eu-central-000003", "compliance-reviewers", {
    actorId: longText.actor,
    generation: 1,
  }),
  workTask(4, "Approve customer activation", "occurrence-eu-central-000004", "activation-reviewers", null),
] as const;

export async function installPublicApiFixtures(
  page: Page,
  options: PublicApiFixtureOptions = {},
): Promise<void> {
  let completionAttempt = 0;
  let detailRequested = false;
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "GET" && path === "/api/v1/work-tasks") {
      const work = options.work ?? FixtureWorkState.Normal;
      if (work === FixtureWorkState.Loading) await delay(500);
      if (work === FixtureWorkState.Error) {
        return json(route, {
          error: {
            code: "workSnapshotUnavailable",
            message: "The current Work snapshot is unavailable.",
          },
        }, 503);
      }
      if (
        work === FixtureWorkState.Empty ||
        (work === FixtureWorkState.EmptyAfterDetail && detailRequested)
      ) {
        return json(route, { tasks: [] });
      }
      return json(route, { tasks: taskCandidates(options) });
    }
    if (request.method() === "GET" && path.startsWith("/api/v1/work-tasks/")) {
      detailRequested = true;
    }
    if (request.method() === "PUT" && path.startsWith("/api/v1/work-task-completions/")) {
      completionAttempt += 1;
      return fulfillCompletion(
        route,
        options.completion ?? FixtureCompletionState.Committed,
        completionAttempt,
      );
    }
    return fulfillPublicRequest(route, options);
  });
}

export async function waitForStableUi(
  page: Page,
  options: Readonly<{ diagram?: boolean }> = {},
): Promise<void> {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  if (options.diagram === true) {
    await page.locator(
      '[data-ui="definition-diagram-surface"][data-diagram-status="ready"]',
    ).waitFor({ state: "visible" });
  }
  await page.evaluate(() => new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  ));
}

export const fixtureLabels = longText;

async function fulfillPublicRequest(
  route: Route,
  options: PublicApiFixtureOptions,
): Promise<void> {
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
  if (request.method() === "GET" && path.endsWith("/presentation")) {
    switch (options.presentation ?? FixturePresentationState.Generated) {
      case FixturePresentationState.Generated:
        return json(route, diagramPresentation("generated"));
      case FixturePresentationState.Source:
        return json(route, diagramPresentation("source"));
      case FixturePresentationState.Unavailable:
        return json(route, {
          error: { code: "notFound", message: "No diagram presentation is available." },
        }, 404);
      case FixturePresentationState.RenderingFailure:
        return json(route, diagramPresentation("generated", "<not-bpmn/>"));
      case FixturePresentationState.MissingTaskElement:
        return json(route, diagramPresentation(
          "generated",
          diagrammedBpmnXml().replaceAll("UserTask_Review", "UserTask_Other"),
        ));
    }
  }
  if (request.method() === "GET" && path.startsWith("/api/v1/work-tasks/")) {
    const task = taskFromPath(path, taskCandidates(options));
    if (task !== undefined) {
      return json(route, taskDetail(
        task,
        options.taskDetail ?? FixtureTaskDetailState.Compatible,
      ));
    }
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

function taskFromPath(
  path: string,
  candidates: readonly ReturnType<typeof workTask>[],
) {
  const segments = path.split("/");
  if (segments.length !== 7) return undefined;
  const processInstanceId = decodeURIComponent(segments[4] ?? "");
  const elementId = decodeURIComponent(segments[5] ?? "");
  const activation = Number(segments[6]);
  return candidates.find((candidate) =>
    candidate.task.id.processInstanceId === processInstanceId &&
    candidate.task.id.elementId === elementId &&
    candidate.task.id.activation === activation
  );
}

function taskCandidates(options: PublicApiFixtureOptions) {
  if (options.taskDetail !== FixtureTaskDetailState.CalledProcess) return tasks;
  const selected = tasks[0];
  if (selected === undefined) return tasks;
  return [{
    ...selected,
    task: {
      ...selected.task,
      id: { ...selected.task.id, processInstanceId: "called-process-instance-42" },
    },
  }, ...tasks.slice(1)] as const;
}

function taskDetail(
  task: typeof tasks[number],
  state: FixtureTaskDetailState,
) {
  const exactTask = state === FixtureTaskDetailState.CalledProcess
    ? {
        ...task,
        task: {
          ...task.task,
          id: { ...task.task.id, processInstanceId: "called-process-instance-42" },
        },
      }
    : task;
  return {
    workTask: exactTask,
    form: {
      fields: [{
        key: "approvalDecision",
        type: "boolean",
        currentValue: state === FixtureTaskDetailState.Incompatible
          ? { kind: "string", value: "false" }
          : { kind: "absent" },
        compatibility: state === FixtureTaskDetailState.Incompatible
          ? "incompatible"
          : "compatible",
      }],
    },
  };
}

function diagramPresentation(
  provenanceKind: "source" | "generated",
  exactXml = diagrammedBpmnXml(),
) {
  const presentationBpmnXml = exactXml;
  return {
    schemaEpoch: 1,
    definition,
    sourceSha256,
    presentationSha256: createHash("sha256").update(presentationBpmnXml, "utf8").digest("hex"),
    provenance: provenanceKind === "source"
      ? { kind: "source" }
      : {
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

async function fulfillCompletion(
  route: Route,
  state: FixtureCompletionState,
  attempt: number,
): Promise<void> {
  const request = route.request();
  const path = new URL(request.url()).pathname;
  const actionId = decodeURIComponent(
    path.slice("/api/v1/work-task-completions/".length),
  );
  const body = await request.postDataJSON() as Readonly<{
    taskId: unknown;
  }>;
  switch (state) {
    case FixtureCompletionState.Committed:
      return json(route, { state: "committed", actionId, taskId: body.taskId });
    case FixtureCompletionState.Rejected:
      return json(route, {
        state: "rejected",
        actionId,
        taskId: body.taskId,
        engineResult: { kind: "semantic", outcome: "rolledBack" },
      });
    case FixtureCompletionState.PendingCommitted:
      await delay(500);
      return json(route, { state: "committed", actionId, taskId: body.taskId });
    case FixtureCompletionState.TransportIndeterminateCommitted:
      switch (attempt) {
        case 1:
          return route.abort("connectionfailed");
        case 2:
          return json(route, {
            state: "indeterminate",
            actionId,
            taskId: body.taskId,
          }, 202);
        default:
          return json(route, { state: "committed", actionId, taskId: body.taskId });
      }
  }
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
