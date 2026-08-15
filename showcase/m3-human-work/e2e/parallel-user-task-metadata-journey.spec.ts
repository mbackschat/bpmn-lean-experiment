import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import { readWorkAudit } from "../test/http-support.ts";
import { parallelMetadataProfile } from "../test/fixture.ts";

const apiOrigin = requireApiOrigin();
const modelPath = fileURLToPath(new URL(
  "../../../scenarios/parallel-user-task-metadata-composition/process.bpmn",
  import.meta.url,
));

test("parallel content and risk review completes its production user journey", async ({ page }) => {
  await page.goto("/", { timeout: 10_000 });

  await navigate(page, "Definitions");
  await page.getByText("Add BPMN definition", { exact: true }).click();
  await page.getByLabel("BPMN XML file").setInputFiles(modelPath);
  await page.getByLabel("Semantic profile ID").fill(parallelMetadataProfile);
  await page.getByRole("button", { name: "Deploy definition", exact: true }).click();
  await expect(page.getByText("Admitted and deployed", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", {
    name: "Process_ParallelUserTaskMetadata, version 1",
    level: 2,
  })).toBeVisible();

  const definitionTabs = page.getByRole("tablist", { name: "Definition views" });
  await definitionTabs.getByRole("tab", { name: "Start", exact: true }).click();
  await page.getByRole("button", { name: "Start version 1", exact: true }).click();
  await expect(page.getByText("Process instance started", { exact: true })).toBeVisible();
  const processInstanceId = await page.getByTestId("started-instance-id").textContent();
  expect(processInstanceId).not.toBeNull();
  expect(processInstanceId).not.toBe("");

  await navigate(page, "Work");
  const tasks = page.getByRole("region", { name: "Tasks" });
  const contentRow = taskRow(tasks, "Review content");
  const riskRow = taskRow(tasks, "Review risk");
  for (const row of [contentRow, riskRow]) {
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Unclaimed");
    await expect(row).toContainText("reviewers");
  }
  await expect(contentRow.getByRole("button", { name: "Review content", exact: true }))
    .toHaveCount(0);
  await expect(riskRow.getByRole("button", { name: "Review risk", exact: true }))
    .toHaveCount(0);
  await expect(tasks.getByRole("button", { name: "Complete task", exact: true }))
    .toHaveCount(0);

  await contentRow.getByRole("button", { name: "Claim", exact: true }).click();
  await expect(contentRow).toContainText("Claimed by demo-user");
  await riskRow.getByRole("button", { name: "Claim", exact: true }).click();
  await expect(riskRow).toContainText("Claimed by demo-user");

  await inspectClaimedTask(tasks, contentRow, {
    elementId: "UserTask_ContentReview",
    fieldName: "contentApproved",
    processInstanceId: processInstanceId!,
    taskName: "Review content",
  });
  await tasks.getByRole("button", { name: "Back to tasks", exact: false }).click();
  await inspectClaimedTask(tasks, riskRow, {
    elementId: "UserTask_RiskReview",
    fieldName: "riskApproved",
    processInstanceId: processInstanceId!,
    taskName: "Review risk",
  });
  await tasks.getByRole("button", { name: "Back to tasks", exact: false }).click();

  await contentRow.getByRole("button", { name: "Review content", exact: true }).click();
  await tasks.getByRole("radio", { name: "True", exact: true }).press("Space");
  await tasks.getByRole("button", { name: "Complete task", exact: true }).click();
  await expect(taskRow(tasks, "Review content")).toHaveCount(0);
  await expect(taskRow(tasks, "Review risk")).toHaveCount(1);

  await openExecution(page, processInstanceId!);
  const detail = page.locator('[data-ui="process-execution-detail"]');
  await expect(detail.locator('[data-ui="execution-overview"]')).toContainText("running");

  await navigate(page, "Work");
  const remainingRiskRow = taskRow(tasks, "Review risk");
  await remainingRiskRow.getByRole("button", { name: "Review risk", exact: true }).click();
  await tasks.getByRole("radio", { name: "True", exact: true }).press("Space");
  await tasks.getByRole("button", { name: "Complete task", exact: true }).click();
  await expect(tasks).toContainText("No current tasks.");

  await openExecution(page, processInstanceId!);
  await expect(detail.locator('[data-ui="execution-overview"]')).toContainText("completed");
  await detail.getByRole("tab", { name: "History", exact: true }).click();
  const history = detail.locator('[data-ui="execution-history"]');
  await expect(history).toContainText("startProcess");
  await expect(history).toContainText("UserTask_ContentReview");
  await expect(history).toContainText("UserTask_RiskReview");
  const revisions = await history.locator("[data-revision]").evaluateAll((rows) =>
    rows.map((row) => Number(row.getAttribute("data-revision")))
  );
  expect(revisions).toEqual(revisions.map((_, index) => index + 1));

  const audit = await readWorkAudit(apiOrigin, {
    hostingProcessInstanceId: processInstanceId!,
  });
  for (const elementId of ["UserTask_ContentReview", "UserTask_RiskReview"]) {
    const events = audit.value.events.filter(({ taskId }) => taskId.elementId === elementId);
    expect(events.map(({ action }) => [action.kind, action.outcome])).toEqual([
      ["claim", "claimed"],
      ["completion", "reserved"],
      ["completion", "committed"],
    ]);
    expect(events.every(({ hostingProcessInstanceId, taskId }) =>
      hostingProcessInstanceId === processInstanceId &&
      taskId.processInstanceId === processInstanceId &&
      taskId.activation === 1
    )).toBe(true);
  }
});

function taskRow(
  tasks: import("@playwright/test").Locator,
  taskName: string,
): import("@playwright/test").Locator {
  return tasks
    .getByRole("table", { name: "Current tasks" })
    .getByRole("row")
    .filter({ hasText: taskName });
}

async function inspectClaimedTask(
  tasks: import("@playwright/test").Locator,
  row: import("@playwright/test").Locator,
  expected: Readonly<{
    elementId: string;
    fieldName: string;
    processInstanceId: string;
    taskName: string;
  }>,
): Promise<void> {
  await row.getByRole("button", { name: expected.taskName, exact: true }).click();
  await expect(tasks.getByRole("heading", { name: expected.taskName, exact: true }))
    .toBeFocused();
  const taskTabs = tasks.getByRole("tablist", { name: "Task detail views" });
  await taskTabs.getByRole("tab", { name: "Diagram", exact: true }).click();
  await expect(tasks.getByText("Generated layout", { exact: true })).toBeVisible();
  await expect(tasks.getByLabel(
    "BPMN diagram for Process_ParallelUserTaskMetadata, version 1",
  )).toContainText(expected.taskName);
  await taskTabs.getByRole("tab", { name: "Details", exact: true }).click();
  await expect(tasks).toContainText(expected.elementId);
  await expect(tasks).toContainText("reviewers");
  await expect(tasks).toContainText(expected.processInstanceId);
  await taskTabs.getByRole("tab", { name: "Form", exact: true }).click();
  await expect(tasks).toContainText(expected.fieldName);
  await expect(tasks.getByRole("radio", { name: "True", exact: true })).not.toBeChecked();
  await expect(tasks.getByRole("radio", { name: "False", exact: true })).not.toBeChecked();
}

async function openExecution(
  page: import("@playwright/test").Page,
  processInstanceId: string,
): Promise<void> {
  await navigate(page, "Operations");
  await page.getByLabel("Process-instance ID").fill(processInstanceId);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const instanceRow = page
    .getByRole("table", { name: "Confirmed Product 2 starts" })
    .getByRole("row")
    .filter({ hasText: processInstanceId });
  await expect(instanceRow).toHaveCount(1);
  await instanceRow.getByRole("button", {
    name: `View details ${processInstanceId}`,
  }).click();
  await expect(page.getByRole("heading", {
    name: `Process instance ${processInstanceId}`,
  })).toBeFocused();
}

async function navigate(
  page: import("@playwright/test").Page,
  workspace: "Definitions" | "Operations" | "Work",
): Promise<void> {
  await page.getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: workspace, exact: true })
    .click();
  await expect(page.getByRole("heading", { name: workspace, level: 1 })).toBeFocused();
}

function requireApiOrigin(): string {
  const value = process.env.PLATFORM_API_ORIGIN;
  if (value === undefined) {
    throw new Error("Playwright config must provide PLATFORM_API_ORIGIN.");
  }
  return value;
}
