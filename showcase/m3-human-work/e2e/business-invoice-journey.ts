import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  decodeDefinitionDeployResult,
  decodeExecutionPublicationExport,
  decodeProcessInstanceStartResult,
  definitionVersionStartPath,
  executionPublicationExportPath,
  executionPublicationIdentityForPublicProcessInstance,
  workTaskPath,
  workTaskReleasePath,
} from "@bpmn-lean/platform-contracts";
import type { PublicProcessInstanceIdentity, PublicWorkTaskId } from "@bpmn-lean/platform-contracts";

import { listWorkTasks, readTaskDetail, readWorkAudit } from "../test/http-support.ts";

type StringBindings = readonly (readonly [name: string, value: string])[];
type InvoiceTask = Readonly<{
  elementId: string;
  activation: number;
  name: string;
  initial: string;
  submitted: string;
}>;
type InvoiceJourney = Readonly<{
  fixture: string;
  scenario: string;
  profile: string;
  processId: string;
  initialVariables: StringBindings;
  tasks: readonly InvoiceTask[];
  effects: readonly (readonly [elementId: string, activation: number, outcome: "success" | "bpmnError"])[];
  finalVariables: StringBindings;
}>;

export async function completeInvoiceJourney(page: Page, journey: InvoiceJourney): Promise<void> {
  const apiOrigin = process.env.PLATFORM_API_ORIGIN;
  if (apiOrigin === undefined) throw new Error("M3 config must provide PLATFORM_API_ORIGIN.");
  const instance = await deployAndStart(page, journey);
  const completed: PublicWorkTaskId[] = [];
  await navigate(page, "Work");
  const tasks = page.getByRole("region", { name: "Tasks" });

  for (const expected of journey.tasks) {
    await expect.poll(async () => {
      const snapshot = (await listWorkTasks(apiOrigin)).value;
      return snapshot.tasks.filter((task) => task.hostingInstance.processInstanceId === instance.processInstanceId)
        .map(({ task }) => [task.id.elementId, task.id.activation]);
    }).toEqual([[expected.elementId, expected.activation]]);
    await tasks.getByRole("button", { name: "Refresh", exact: true }).click();
    const snapshot = (await listWorkTasks(apiOrigin)).value;
    const published = snapshot.tasks.find((task) => task.hostingInstance.processInstanceId === instance.processInstanceId);
    expect(published).toBeDefined();
    expect(published!.hostingInstance).toEqual(instance);
    expect(published!.task.metadata).toEqual({
      assignment: { candidates: [{ kind: "group", id: "reviewers" }] },
      form: { fields: [{ key: "request", type: "string" }] },
    });
    const id = published!.task.id;
    expect(completed).not.toContainEqual(id);
    const row = tasks.getByRole("table", { name: "Current tasks" }).getByRole("row")
      .filter({ has: page.getByText(expected.name, { exact: true }) });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("reviewers");
    await expect(row).toContainText("Unclaimed");
    await expect(row.getByRole("button", { name: `Edit task: ${expected.name}`, exact: true })).toHaveCount(0);
    await expect(tasks.getByRole("button", { name: "Complete task", exact: true })).toHaveCount(0);
    await row.getByRole("button", { name: "Claim", exact: true }).click();
    await expect(row).toContainText("Claimed by demo-user");
    if (completed.length === 0) {
      await row.getByRole("button", { name: "Release", exact: true }).click();
      await expect(row).toContainText("Unclaimed");
      await expect(row.getByRole("button", { name: `Edit task: ${expected.name}`, exact: true })).toHaveCount(0);
      await row.getByRole("button", { name: "Claim", exact: true }).click();
      await expect(row).toContainText("Claimed by demo-user");
    }
    await row.getByRole("button", { name: `Edit task: ${expected.name}`, exact: true }).click();
    await expect(tasks.getByRole("heading", { name: expected.name, exact: true })).toBeFocused();
    await expect(tasks.getByLabel("request", { exact: true })).toHaveValue(expected.initial);
    await tasks.getByLabel("request", { exact: true }).fill(expected.submitted);
    if (completed.length === 0) {
      const current = (await readTaskDetail(apiOrigin, id)).value;
      const released = await fetch(new URL(workTaskReleasePath(id, {
        actionId: `release-before-completion-${instance.processInstanceId}`,
        generation: current.workTask.claim!.generation,
      }), apiOrigin), {
        method: "DELETE",
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(5_000),
      });
      expect(released.status).toBe(200);
      await released.arrayBuffer();
      const refusal = page.waitForResponse((response) => response.request().method() === "PUT" && new URL(response.url()).pathname.startsWith("/api/v1/work-task-completions/"));
      await tasks.getByRole("button", { name: "Complete task", exact: true }).click();
      expect((await refusal).status()).toBe(404);
      await expect(tasks.getByRole("alert")).toBeFocused();
      await expect(tasks.getByRole("button", { name: "Retry completion", exact: true })).toHaveCount(0);
      await tasks.getByRole("button", { name: "Back to tasks", exact: false }).click();
      await tasks.getByRole("button", { name: "Refresh", exact: true }).click();
      await expect(row).toContainText("Unclaimed");
      await row.getByRole("button", { name: "Claim", exact: true }).click();
      await row.getByRole("button", { name: `Edit task: ${expected.name}`, exact: true }).click();
      await tasks.getByLabel("request", { exact: true }).fill(expected.submitted);
    }
    await tasks.getByRole("button", { name: "Complete task", exact: true }).click();
    await expect(tasks.getByRole("button", { name: "Refresh", exact: true })).toBeVisible();
    completed.push(id);
    await expect.poll(async () => {
      const response = await fetch(new URL(workTaskPath(id), apiOrigin), { signal: AbortSignal.timeout(5_000) });
      await response.arrayBuffer();
      return response.status;
    }).toBe(404);
  }

  await expect(tasks).toContainText("No current tasks.");
  await proveCompletion(page, apiOrigin, instance, journey, completed);
}

async function deployAndStart(page: Page, journey: InvoiceJourney): Promise<PublicProcessInstanceIdentity> {
  const modelPath = projectPath(`packages/bpmn-source/test/fixtures/business-public-delivery/${journey.fixture}.bpmn`);
  const overlayPath = projectPath(`scenarios/${journey.scenario}/source-overlay.json`);
  const overlayDigest = createHash("sha256").update(await readFile(overlayPath)).digest("hex");
  const modelDigest = createHash("sha256").update(await readFile(modelPath)).digest("hex");
  await page.goto("/", { timeout: 10_000 });
  await navigate(page, "Definitions");
  await page.getByText("Add BPMN definition", { exact: true }).click();
  await page.getByLabel("BPMN XML file").setInputFiles(modelPath);
  await page.getByLabel("Semantic profile ID").fill(journey.profile);
  await page.getByLabel("Source overlay JSON file (optional)").setInputFiles(overlayPath);
  await page.getByLabel("Source overlay ID", { exact: true }).fill("invoice-handlers");
  let deploymentRequests = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/v1/definitions") deploymentRequests += 1;
  });
  await page.getByRole("button", { name: "Deploy definition", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Supply the source overlay file, ID and SHA-256 together.");
  expect(deploymentRequests).toBe(0);
  await page.getByLabel("Source overlay SHA-256", { exact: true }).fill(overlayDigest);
  const deploymentResponse = page.waitForResponse((response) =>
    response.request().method() === "POST" && new URL(response.url()).pathname === "/api/v1/definitions"
  );
  await page.getByRole("button", { name: "Deploy definition", exact: true }).click();
  const deployed = decodeDefinitionDeployResult(await (await deploymentResponse).json());
  expect(deployed.status).toBe("deployed");
  if (deployed.status !== "deployed") throw new Error(JSON.stringify(deployed.diagnostics));
  expect(deployed.definition.processId).toBe(journey.processId);
  expect(deployed.definition.source.sha256).toBe(modelDigest);
  expect(deployed.definition.sourceOverlay).toEqual({ id: "invoice-handlers", sha256: overlayDigest });
  await expect(page.getByText("Admitted and deployed", { exact: true })).toBeVisible();
  const startPath = definitionVersionStartPath(deployed.definition.processId, deployed.definition.version);
  let startRequests = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === startPath) startRequests += 1;
  });
  for (const [index, [name, value]] of journey.initialVariables.entries()) {
    await page.getByRole("button", { name: "Add input", exact: true }).click();
    const input = page.getByRole("group", { name: `Input ${index + 1} · String`, exact: true });
    if (index === 0) {
      await page.getByRole("button", { name: `Start version ${deployed.definition.version}`, exact: true }).click();
      await expect(page.getByRole("alert")).toBeVisible();
      expect(startRequests).toBe(0);
    }
    await input.getByLabel("Name", { exact: true }).fill(name);
    await input.getByLabel("String value", { exact: true }).fill(value);
  }
  const startResponse = page.waitForResponse((response) =>
    response.request().method() === "POST" && new URL(response.url()).pathname === startPath
  );
  await page.getByRole("button", { name: `Start version ${deployed.definition.version}`, exact: true }).click();
  const started = decodeProcessInstanceStartResult(await (await startResponse).json());
  expect(started.status).toBe("started");
  if (started.status !== "started") throw new Error(started.failure.evidence);
  expect(started.instance.definition).toEqual(deployed.definition);
  await expect(page.getByText("Process instance started", { exact: true })).toBeVisible();
  await expect(page.getByTestId("started-instance-id")).toHaveText(started.instance.processInstanceId);
  return started.instance;
}

async function proveCompletion(
  page: Page,
  apiOrigin: string,
  instance: PublicProcessInstanceIdentity,
  journey: InvoiceJourney,
  completed: readonly PublicWorkTaskId[],
): Promise<void> {
  const response = await fetch(new URL(executionPublicationExportPath(instance.processInstanceId), apiOrigin), {
    signal: AbortSignal.timeout(5_000),
  });
  expect(response.status).toBe(200);
  const publication = decodeExecutionPublicationExport(await response.json(), executionPublicationIdentityForPublicProcessInstance(instance));
  expect(publication.current.state.status).toBe("completed");
  expect(publication.current.state.openIncidents).toEqual([]);
  expect(publication.current.state.variables).toEqual(bindings(journey.finalVariables));
  const stimuli = publication.batches.flatMap((batch) => batch.transitions.flatMap(({ transition }) =>
    transition.kind === "externalStimulus" ? [transition.stimulus] : []
  ));
  expect(stimuli.filter((stimulus) => stimulus.kind === "startProcess").map((stimulus) => stimulus.initialVariables))
    .toEqual([bindings(journey.initialVariables)]);
  expect(stimuli.filter((stimulus) => stimulus.kind === "completeUserTaskInstance").map(({ taskId, submittedValues }) =>
    ({ taskId, submittedValues })
  )).toEqual(completed.map((taskId, index) => ({
    taskId, submittedValues: bindings([["request", journey.tasks[index]!.submitted]]),
  })));
  expect(stimuli.filter((stimulus) => stimulus.kind === "completeEffect").map(({ effectId, result }) =>
    [effectId.elementId, effectId.activation, result.kind]
  )).toEqual(journey.effects);

  await navigate(page, "Operations");
  await page.getByLabel("Process-instance ID").fill(instance.processInstanceId);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("button", { name: `View details ${instance.processInstanceId}`, exact: true }).click();
  const detail = page.locator('[data-ui="process-execution-detail"]');
  await expect(detail.locator('[data-ui="execution-overview"]')).toContainText("completed");
  await detail.getByRole("tab", { name: "History", exact: true }).click();
  const revisions = await detail.locator('[data-ui="execution-history"] [data-revision]').evaluateAll((rows) =>
    rows.map((row) => Number(row.getAttribute("data-revision")))
  );
  expect(revisions).toEqual(Array.from({ length: publication.headRevision }, (_, index) => index + 1));
  const audit = (await readWorkAudit(apiOrigin, { hostingProcessInstanceId: instance.processInstanceId })).value;
  expect(audit.nextCursor).toBeNull();
  expect(audit.events.map(({ taskId, action }) => [taskId, action.kind, action.outcome])).toEqual(
    completed.flatMap((taskId, index) => [
      [taskId, "claim", "claimed"],
      ...(index === 0 ? [
        [taskId, "release", "released"], [taskId, "claim", "claimed"],
        [taskId, "release", "released"], [taskId, "claim", "claimed"],
      ] : []),
      [taskId, "completion", "reserved"],
      [taskId, "completion", "committed"],
    ]),
  );
  expect(audit.events.every(({ hostingProcessInstanceId, actorId }) =>
    hostingProcessInstanceId === instance.processInstanceId && actorId === "demo-user"
  )).toBe(true);
}

function bindings(entries: StringBindings) {
  return entries.map(([name, value]) => ({ name, value: { kind: "string" as const, value } }));
}

function projectPath(relative: string): string {
  return fileURLToPath(new URL(`../../../${relative}`, import.meta.url));
}

async function navigate(page: Page, workspace: "Definitions" | "Work" | "Operations"): Promise<void> {
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: workspace, exact: true }).click();
  await expect(page.getByRole("heading", { name: workspace, level: 1 })).toBeFocused();
}
