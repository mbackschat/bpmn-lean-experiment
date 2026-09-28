import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import type { PublicStructuredTaskFormV1, PublicTaskDetail, PublicWorkTask } from "../../../platform/contracts/src/work-tasks.ts";

for (const kind of ["boolean", "string"] as const) {
  test(`legacy ${kind} draft survives Form–Diagram–Form and resets for another task @responsive`, async ({ page }) => {
    const details = [legacyDetail(kind, 1), legacyDetail(kind, 2)];
    await installWorkFixtures(page, details);
    await page.goto("/");
    await page.getByRole("button", { name: "Edit task: Review 1", exact: true }).click();
    if (kind === "boolean") await page.getByRole("radio", { name: "False", exact: true }).press("Space");
    else await page.getByRole("textbox", { name: "decision", exact: true }).fill("Keep my exact draft");

    await visitDiagramAndReturn(page);
    if (kind === "boolean") await expect(page.getByRole("radio", { name: "False", exact: true })).toBeChecked();
    else await expect(page.getByRole("textbox", { name: "decision", exact: true })).toHaveValue("Keep my exact draft");

    await page.getByRole("button", { name: "Back to tasks" }).click();
    await page.getByRole("button", { name: "Edit task: Review 2", exact: true }).click();
    if (kind === "boolean") {
      await expect(page.getByRole("radio", { name: "False", exact: true })).not.toBeChecked();
      await expect(page.getByRole("radio", { name: "True", exact: true })).not.toBeChecked();
    } else await expect(page.getByRole("textbox", { name: "decision", exact: true })).toHaveValue("");
  });
}

test("structured resolution buttons stay content-sized in narrow containers @responsive", async ({ page }) => {
  await installWorkFixtures(page, [structuredDetail(1)]);
  await page.goto("/");
  await page.locator("main").evaluate((element) => { element.style.maxWidth = "740px"; });
  await page.getByRole("button", { name: "Edit task: Review 1", exact: true }).click();
  for (const name of ["Approve", "Request changes"]) {
    const button = page.getByRole("button", { name, exact: true });
    await expect(button).toBeVisible();
    expect((await button.boundingBox())!.width).toBeLessThan(220);
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
});

test("Work draft survives primary navigation away and back @responsive", async ({ page }) => {
  await installWorkFixtures(page, [structuredDetail(1)]);
  await page.goto("/");
  await page.getByRole("button", { name: "Edit task: Review 1", exact: true }).click();
  await page.getByRole("textbox", { name: "Reference", exact: true }).fill("Workspace draft");
  await page.getByRole("radio", { name: "False", exact: true }).press("Space");
  await page.getByRole("button", { name: "Request changes", exact: true }).click();
  await page.getByRole("textbox", { name: "Reason", exact: true }).fill("Keep the selected action");
  await page.getByRole("link", { name: "Definitions", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Reference", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Work", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Reference", exact: true })).toHaveValue("Workspace draft");
  await expect(page.getByRole("radio", { name: "False", exact: true })).toBeChecked();
  await expect(page.getByRole("textbox", { name: "Reason", exact: true })).toHaveValue("Keep the selected action");
});

test("retained completion makes radio and checkbox choices visibly unavailable @responsive", async ({ page }) => {
  await installWorkFixtures(page, [structuredDetail(1)]);
  await page.goto("/");
  await page.getByRole("button", { name: "Edit task: Review 1", exact: true }).click();
  await page.getByRole("textbox", { name: "Reference", exact: true }).fill("Pending delivery");
  await page.getByRole("checkbox", { name: "Receipt", exact: true }).press("Space");
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry completion" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to tasks" })).toBeDisabled();
  for (const control of [page.getByRole("radio", { name: "True", exact: true }), page.getByRole("checkbox", { name: "Receipt", exact: true })]) {
    await expect(control).toBeDisabled();
    const label = control.locator("xpath=ancestor::label[1]");
    await expect(label).toHaveCSS("cursor", "not-allowed");
    expect(await label.evaluate((element) => getComputedStyle(element).color)).toBe("rgb(82, 100, 95)");
  }
});

test("structured input and selected resolution survive tabs, including exact completion retry @responsive", async ({ page }) => {
  const requests = await installWorkFixtures(page, [structuredDetail(1), structuredDetail(2)]);
  await page.goto("/");
  await page.getByRole("button", { name: "Edit task: Review 1", exact: true }).click();
  await page.getByRole("textbox", { name: "Reference", exact: true }).fill("Draft-4711");
  await page.getByRole("radio", { name: "False", exact: true }).press("Space");
  await page.getByRole("button", { name: "Request changes", exact: true }).click();
  await page.getByRole("textbox", { name: "Reason", exact: true }).fill("Retain this explanation");
  await visitDiagramAndReturn(page);
  await expect(page.getByRole("textbox", { name: "Reference", exact: true })).toHaveValue("Draft-4711");
  await expect(page.getByRole("radio", { name: "False", exact: true })).toBeChecked();
  await expect(page.getByRole("textbox", { name: "Reason", exact: true })).toHaveValue("Retain this explanation");
  expect(requests).toHaveLength(0);

  await page.getByRole("button", { name: "Request changes", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry completion" })).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0]!.body).toMatchObject({
    resolutionActionId: "changes", fields: { reference: "Draft-4711", notify: false, reason: "Retain this explanation" },
  });
  await visitDiagramAndReturn(page);
  await expect(page.getByRole("textbox", { name: "Reference", exact: true })).toHaveValue("Draft-4711");
  await expect(page.getByRole("textbox", { name: "Reason", exact: true })).toHaveValue("Retain this explanation");
  await expect(page.getByRole("textbox", { name: "Reference", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Retry completion" }).click();
  await expect(page.getByRole("table", { name: "Current tasks" })).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);

  await page.getByRole("button", { name: "Edit task: Review 2", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Reference", exact: true })).toHaveValue("");
  await expect(page.getByRole("radio", { name: "True", exact: true })).toBeChecked();
  await expect(page.getByRole("textbox", { name: "Reason", exact: true })).toHaveCount(0);
});

test("an incompatible structured Boolean is unavailable, never an empty editable choice @responsive", async ({ page }) => {
  const requests = await installWorkFixtures(page, [structuredDetail(1, true)]);
  await page.goto("/");
  await page.getByRole("button", { name: "Edit task: Review 1", exact: true }).click();
  const panel = page.getByRole("tabpanel", { name: "Form", exact: true });
  await expect(panel.getByRole("alert")).toContainText(/unavailable/i);
  await expect(panel.getByRole("alert")).toContainText("Notify submitter");
  await expect(panel.getByRole("alert")).toContainText(/incompatible/i);
  await expect(panel.locator("input, textarea, select, button")).toHaveCount(0);
  await visitDiagramAndReturn(page);
  await expect(panel.locator("input, textarea, select, button")).toHaveCount(0);
  expect(requests).toHaveLength(0);
});

async function visitDiagramAndReturn(page: Page): Promise<void> {
  await page.getByRole("tab", { name: "Diagram", exact: true }).click();
  await expect(page.getByRole("tabpanel", { name: "Diagram", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(page.getByRole("radio")).toHaveCount(0);
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => {
    const panel = document.activeElement?.closest('[role="tabpanel"]');
    return panel === null || panel === undefined || !panel.querySelector('input[name="decision"], input[name="reference"]');
  })).toBe(true);
  await page.getByRole("tab", { name: "Form", exact: true }).click();
}

function task(activation: number): PublicWorkTask {
  return {
    task: { id: { processInstanceId: "draft-instance", elementId: "Review", activation },
      name: `Review ${activation}`, state: "active",
      metadata: { assignment: { candidates: [{ kind: "group", id: "reviewers" }] } } },
    hostingInstance: { processInstanceId: "draft-instance", definition: {
      processId: "DraftReview", version: 1, semanticProfile: "bpmn-2.0.2-bpmn-lean-structured-human-work-draft",
      source: { kind: "bpmnSource", id: "draft-review", sha256: "a".repeat(64), byteLength: 100,
        declaredEncoding: "UTF-8", decodedAs: "UTF-8" },
      startCapabilities: { messageStarts: [], timerStarts: [] },
    } },
    claimGeneration: 1, claim: { actorId: "demo-user", generation: 1 }, claimableByCurrentActor: true,
  };
}

function legacyDetail(type: "boolean" | "string", activation: number): PublicTaskDetail {
  const workTask = task(activation);
  return {
    workTask: { ...workTask, task: { ...workTask.task, metadata: {
      assignment: { candidates: [{ kind: "group", id: "reviewers" }] },
      form: { fields: [{ key: "decision", type }] },
    } } },
    form: { fields: [{ key: "decision", type, currentValue: { kind: "absent" }, compatibility: "compatible" }] },
  };
}

function structuredDetail(activation: number, incompatible = false): PublicTaskDetail {
  const workTask = task(activation);
  const form: PublicStructuredTaskFormV1 = {
    schemaVersion: "bpmn-lean-structured-task-form/v1",
    catalogIdentity: { processId: "DraftReview", version: 1, sourceSha256: "a".repeat(64),
      semanticProfile: workTask.hostingInstance.definition.semanticProfile },
    taskDefinition: { elementId: "Review", description: "Review the request and explain any changes.", worklistPriority: 50,
      form: { schemaVersion: "bpmn-lean-structured-form/v1", resolutionVariable: "resolution",
        actions: [
          { id: "approve", label: "Approve", intent: "primary", resolutionValue: "approved" },
          { id: "changes", label: "Request changes", intent: "neutral", resolutionValue: "changes-requested" },
        ],
        fields: [
          { key: "reference", label: "Reference", kind: "text", multiline: false, minLength: 1, maxLength: 200,
            defaultValue: null, helpText: null, visibleForActions: "all", requiredForActions: ["approve", "changes"] },
          { key: "notify", label: "Notify submitter", kind: "boolean", defaultValue: true, helpText: null,
            visibleForActions: "all", requiredForActions: ["approve", "changes"] },
          { key: "attachments", label: "Attachments", kind: "multipleChoice", defaultValue: [], helpText: null,
            visibleForActions: "all", requiredForActions: [], options: [{ value: "receipt", label: "Receipt" }], maxItems: 1 },
          { key: "reason", label: "Reason", kind: "text", multiline: true, minLength: 1, maxLength: 200,
            defaultValue: null, helpText: null, visibleForActions: ["changes"], requiredForActions: ["changes"] },
        ],
      } },
    fields: [
      { key: "reference", currentValue: { kind: "absent" }, compatibility: "compatible" },
      { key: "notify", currentValue: incompatible ? { kind: "string", value: "false" } : { kind: "absent" },
        compatibility: incompatible ? "incompatible" : "compatible" },
      { key: "attachments", currentValue: { kind: "absent" }, compatibility: "compatible" },
      { key: "reason", currentValue: { kind: "absent" }, compatibility: "compatible" },
    ],
  };
  return { workTask: { ...workTask, catalogPresentation: { worklistPriority: 50 } }, form };
}

async function installWorkFixtures(page: Page, details: readonly PublicTaskDetail[]) {
  const requests: { path: string; body: unknown }[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (request.method() === "GET" && path === "/api/v1/work-tasks") return json({ tasks: details.map((detail) => detail.workTask) });
    if (request.method() === "GET" && path.startsWith("/api/v1/work-tasks/")) {
      const detail = details.find(({ workTask }) => path.endsWith(`/Review/${workTask.task.id.activation}`));
      if (detail !== undefined) return json(detail);
    }
    if (request.method() === "PUT" && path.startsWith("/api/v1/work-task-completions/")) {
      const body = request.postDataJSON() as { taskId: unknown };
      requests.push({ path, body });
      if (requests.length === 1) return route.abort("connectionfailed");
      return json({ state: "committed", actionId: decodeURIComponent(path.split("/").at(-1)!), taskId: body.taskId });
    }
    return json({ error: { code: "notFound", message: "No diagram presentation is available in this fixture." } }, 404);
  });
  return requests;
}
