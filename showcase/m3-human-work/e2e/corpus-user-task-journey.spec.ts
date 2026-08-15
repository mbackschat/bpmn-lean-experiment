import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import { readWorkAudit } from "../test/http-support.ts";
import { metadataProfile } from "../test/fixture.ts";

const apiOrigin = requireApiOrigin();
const modelPath = fileURLToPath(new URL(
  "../../../scenarios/user-task-assignment-form-metadata/process.bpmn",
  import.meta.url,
));

test("corpus request-review-with-form completes its production user journey", async ({ page }) => {
  await page.goto("/", { timeout: 10_000 });

  await navigate(page, "Definitions");
  await page.getByText("Add BPMN definition", { exact: true }).click();
  await page.getByLabel("BPMN XML file").setInputFiles(modelPath);
  await page.getByLabel("Semantic profile ID").fill(metadataProfile);
  await page.getByRole("button", { name: "Deploy definition", exact: true }).click();
  await expect(page.getByText("Admitted and deployed", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", {
    name: "Process_UserTaskMetadata, version 1",
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
  const taskRow = tasks
    .getByRole("table", { name: "Current tasks" })
    .getByRole("row")
    .filter({ hasText: "Approve" });
  await expect(taskRow).toHaveCount(1);
  await expect(taskRow).toContainText("Unclaimed");
  await expect(taskRow).toContainText("reviewers");
  await expect(taskRow.getByRole("button", { name: "Approve", exact: true }))
    .toHaveCount(0);
  await expect(tasks.getByRole("button", { name: "Complete task", exact: true }))
    .toHaveCount(0);

  await taskRow.getByRole("button", { name: "Claim", exact: true }).click();
  await expect(taskRow).toContainText("Claimed by demo-user");
  await taskRow.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(tasks.getByRole("heading", { name: "Approve", exact: true })).toBeFocused();
  const taskTabs = tasks.getByRole("tablist", { name: "Task detail views" });
  await taskTabs.getByRole("tab", { name: "Diagram", exact: true }).click();
  await expect(tasks.getByText("Generated layout", { exact: true })).toBeVisible();
  await expect(tasks.getByLabel("BPMN diagram for Process_UserTaskMetadata, version 1"))
    .toContainText("Approve");
  await taskTabs.getByRole("tab", { name: "Details", exact: true }).click();
  await expect(tasks).toContainText("UserTask_Approve");
  await expect(tasks).toContainText("reviewers");
  await expect(tasks).toContainText(processInstanceId!);
  await taskTabs.getByRole("tab", { name: "Form", exact: true }).click();
  await tasks.getByRole("radio", { name: "True", exact: true }).press("Space");
  await tasks.getByRole("button", { name: "Complete task", exact: true }).click();
  await expect(tasks).toContainText("No current tasks.");

  await navigate(page, "Operations");
  await page.getByLabel("Process-instance ID").fill(processInstanceId!);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const instanceTable = page.getByRole("table", { name: "Confirmed Product 2 starts" });
  const instanceRow = instanceTable.getByRole("row").filter({ hasText: processInstanceId! });
  await expect(instanceRow).toHaveCount(1);
  await instanceRow.getByRole("button", {
    name: `View execution ${processInstanceId}`,
  }).click();

  const detail = page.locator('[data-ui="process-execution-detail"]');
  await expect(detail.getByRole("heading", {
    name: `Process instance ${processInstanceId}`,
  })).toBeFocused();
  const overview = detail.locator('[data-ui="execution-overview"]');
  await expect(overview).toContainText("Current status");
  await expect(overview).toContainText("completed");

  await detail.getByRole("tab", { name: "History", exact: true }).click();
  const history = detail.locator('[data-ui="execution-history"]');
  await expect(history).toContainText("startProcess");
  await expect(history).toContainText("completeUserTaskInstance");
  await expect(history).toContainText("UserTask_Approve");
  const revisions = await history.locator("[data-revision]").evaluateAll((rows) =>
    rows.map((row) => Number(row.getAttribute("data-revision")))
  );
  expect(revisions).toEqual(revisions.map((_, index) => index + 1));

  const audit = await readWorkAudit(apiOrigin, {
    hostingProcessInstanceId: processInstanceId!,
  });
  expect(audit.value.events.map(({ action }) => [action.kind, action.outcome]))
    .toEqual([
      ["claim", "claimed"],
      ["completion", "reserved"],
      ["completion", "committed"],
    ]);
  expect(audit.value.events.every(({ hostingProcessInstanceId, taskId }) =>
    hostingProcessInstanceId === processInstanceId &&
    taskId.processInstanceId === processInstanceId &&
    taskId.elementId === "UserTask_Approve" &&
    taskId.activation === 1
  )).toBe(true);
});

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
