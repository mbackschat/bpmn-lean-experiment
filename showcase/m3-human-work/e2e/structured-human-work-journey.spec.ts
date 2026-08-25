import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import {
  claimTask,
  completeTask,
  deployDefinition,
  listWorkTasks,
  readWorkAudit,
  startDefinition,
} from "../test/http-support.ts";
import {
  humanWorkSources,
  metadataProfile,
  structuredHumanWorkProfile,
} from "../test/fixture.ts";
import {
  HeadlineDemoLandmark,
  headlineDemoLandmarkLabel,
  headlineDemoTimeoutMs,
  readHeadlineDemoConfig,
} from "../src/headline-demo.ts";

const apiOrigin = requireApiOrigin();
const modelPath = fileURLToPath(new URL(
  "../../../scenarios/expense-exception-review/process.bpmn",
  import.meta.url,
));
const headlineDemo = readHeadlineDemoConfig(process.env);

test.describe.configure({
  retries: 0,
  timeout: headlineDemoTimeoutMs(headlineDemo),
});

for (const viewport of [{ width: 1280, height: 800 }, { width: 1600, height: 900 }]) {
  test(`expense exception structured Human Work completes every action at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const completionCapture: CompletionCapture = {
      poisonNext: !headlineDemo.enabled,
      accepted: null,
    };
    await interceptFirstValidCompletion(page, completionCapture);
    await page.goto("/", { timeout: 10_000 });

    if (headlineDemo.enabled) {
      await navigate(page, "About");
      const capabilityTable = page.getByRole("table", {
        name: "Executable BPMN element and semantic-variant overview",
      });
      await expect(page.getByRole("complementary", {
        name: "Coverage boundary",
      })).toContainText("Not a conformance claim");
      const variantCount = await capabilityTable.locator("tbody tr").count();
      expect(variantCount).toBeGreaterThan(0);
      await expect(page.getByText("Evidence-backed variants", { exact: true })
        .locator("..")).toContainText(String(variantCount));
      await presentHeadlineLandmark(page, HeadlineDemoLandmark.CapabilityBreadth);
    }

    await deployRetainedDefinition(page);
    if (headlineDemo.enabled) {
      await presentHeadlineLandmark(page, HeadlineDemoLandmark.ProcessDiagram);
    }
    const token = `${viewport.width}_${Date.now()}_${process.pid}`;
    const control = await deployLowerPriorityControl(token);
    const processIds: string[] = [];

    for (const action of ["Approve", "Request changes", "Abort"] as const) {
      const processInstanceId = await startRetainedDefinition(page);
      processIds.push(processInstanceId);
      await navigate(page, "Work");
      const tasks = page.getByRole("region", { name: "Tasks" });
      const structuredRow = taskRow(tasks, "Review exception");
      await expect(structuredRow).toHaveCount(1);
      await expect(structuredRow).toContainText("80");

      if (action === "Approve") {
        const rows = await tasks.getByRole("table", { name: "Current tasks" })
          .getByRole("row")
          .allTextContents();
        expect(rows.findIndex((row) => row.includes("Review exception")))
          .toBeLessThan(rows.findIndex((row) => row.includes(`Review request ${token}`)));
        await completeLowerPriorityControl(control.processInstanceId, token);
        await tasks.getByRole("button", { name: "Refresh", exact: true }).click();
      }

      await structuredRow.getByRole("button", { name: "Claim", exact: true }).click();
      await expect(structuredRow).toContainText("Claimed by demo-user");
      await structuredRow.getByRole("button", { name: "Review exception", exact: true }).click();
      await expect(tasks.getByRole("heading", { name: "Review exception", exact: true })).toBeFocused();
      await expect(tasks).toContainText("Review the expense exception and choose a resolution.");
      const taskTabs = tasks.getByRole("tablist", { name: "Task detail views" });
      await taskTabs.getByRole("tab", { name: "Details", exact: true }).click();
      await expect(tasks).toContainText("Worklist priority80");
      await taskTabs.getByRole("tab", { name: "Form", exact: true }).click();

      await completeStructuredForm(page, tasks, action, viewport.width);
      if (action === "Approve" && !headlineDemo.enabled) {
        await expect(tasks.getByRole("alert")).toContainText("The form contains an unknown field.");
        await expect(tasks.getByRole("alert")).toBeFocused();
        expect((await readWorkAudit(apiOrigin, {
          hostingProcessInstanceId: processInstanceId,
        })).value.events.map(({ action: auditAction }) => auditAction.kind)).toEqual(["claim"]);
        await tasks.getByRole("button", { name: "Approve", exact: true }).click();
      }
      await expect(tasks).toContainText("No current tasks.");

      if (action === "Approve") {
        await proveCanonicalRetryAndConflict(completionCapture);
      }
      await proveTerminalHistory(page, processInstanceId);
      if (headlineDemo.enabled && action === "Abort") {
        await presentHeadlineLandmark(page, HeadlineDemoLandmark.CommittedEvidence);
      }
      await proveExactAudit(processInstanceId);
    }

    expect(processIds).toHaveLength(3);
    expect(await page.evaluate(() => {
      const browser = globalThis as typeof globalThis & Readonly<{
        document: Readonly<{ documentElement: Readonly<{ scrollWidth: number }> }>;
        innerWidth: number;
      }>;
      return browser.document.documentElement.scrollWidth <= browser.innerWidth;
    })).toBe(true);
  });
}

type ResolutionAction = "Approve" | "Request changes" | "Abort";

async function deployRetainedDefinition(page: import("@playwright/test").Page): Promise<void> {
  await navigate(page, "Definitions");
  await page.getByText("Add BPMN definition", { exact: true }).click();
  await page.getByLabel("BPMN XML file").setInputFiles(modelPath);
  await page.getByLabel("Semantic profile ID").fill(structuredHumanWorkProfile);
  await page.getByRole("button", { name: "Deploy definition", exact: true }).click();
  await expect(page.getByText("Admitted and deployed", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", {
    name: /Process_ExpenseExceptionReview, version \d+/u,
    level: 2,
  })).toBeVisible();
}

async function startRetainedDefinition(page: import("@playwright/test").Page): Promise<string> {
  await navigate(page, "Definitions");
  await page.getByRole("combobox", { name: "Definition", exact: true })
    .selectOption("Process_ExpenseExceptionReview");
  const definitionTabs = page.getByRole("tablist", { name: "Definition views" });
  await definitionTabs.getByRole("tab", { name: "Start", exact: true }).click();
  await page.getByRole("button", { name: /Start version \d+/u }).click();
  await expect(page.getByText("Process instance started", { exact: true })).toBeVisible();
  const processInstanceId = await page.getByTestId("started-instance-id").textContent();
  expect(processInstanceId).not.toBeNull();
  expect(processInstanceId).not.toBe("");
  return processInstanceId!;
}

async function completeStructuredForm(
  page: import("@playwright/test").Page,
  tasks: import("@playwright/test").Locator,
  action: ResolutionAction,
  viewportWidth: number,
): Promise<void> {
  await tasks.getByRole("button", { name: action, exact: true }).click();
  await expect(tasks.getByRole("alert")).toContainText("Check the highlighted form input.");
  await expect(tasks.getByLabel("Request reference")).toBeFocused();

  await tasks.getByLabel("Request reference").fill(`EXP-${viewportWidth}-${action}`);
  await tasks.getByLabel("Expense date").fill("2026-08-16");
  if (action === "Approve") {
    await tasks.getByLabel("Approved amount").fill("4250");
  }
  if (action !== "Abort") {
    await tasks.getByRole("radio", { name: "Engineering", exact: true }).press("Space");
  }
  await tasks.getByRole("checkbox", { name: "Missing receipt", exact: true }).press("Space");
  await tasks.getByRole("checkbox", { name: "Policy exception", exact: true }).press("Space");
  if (action === "Abort") {
    await tasks.getByRole("radio", { name: "False", exact: true }).press("Space");
  } else {
    await expect(tasks.getByRole("radio", { name: "True", exact: true })).toBeChecked();
  }
  if (action !== "Approve") {
    await expect(tasks.getByLabel("Resolution reason")).toBeVisible();
    await tasks.getByLabel("Resolution reason").fill(
      action === "Abort" ? "Duplicate expense." : "Attach the missing receipt.",
    );
  } else {
    await expect(tasks.getByLabel("Resolution reason")).toHaveCount(0);
  }
  if (headlineDemo.enabled) {
    await presentHeadlineLandmark(page, formLandmark(action));
  }
  await tasks.getByRole("button", { name: action, exact: true }).click();
}

function formLandmark(action: ResolutionAction): HeadlineDemoLandmark {
  switch (action) {
    case "Approve":
      return HeadlineDemoLandmark.ApproveForm;
    case "Request changes":
      return HeadlineDemoLandmark.RequestChangesForm;
    case "Abort":
      return HeadlineDemoLandmark.AbortForm;
  }
}

async function presentHeadlineLandmark(
  page: import("@playwright/test").Page,
  landmark: HeadlineDemoLandmark,
): Promise<void> {
  const label = headlineDemoLandmarkLabel(landmark);
  process.stdout.write(`MUE_HEADLINE_LANDMARK ${landmark} label=${label}\n`);
  await page.waitForTimeout(headlineDemo.pauseMs);
}

type CompletionCapture = {
  poisonNext: boolean;
  accepted: Readonly<{ path: string; request: Record<string, unknown> }> | null;
};

async function interceptFirstValidCompletion(
  page: import("@playwright/test").Page,
  capture: CompletionCapture,
): Promise<void> {
  await page.route("**/api/v1/work-task-completions/*", async (route) => {
    const request = route.request();
    const body = request.postDataJSON() as Record<string, unknown>;
    if (capture.poisonNext) {
      capture.poisonNext = false;
      const fields = body.fields as Record<string, unknown>;
      await route.continue({
        postData: JSON.stringify({ ...body, fields: { ...fields, plantedUnknown: "refused" } }),
      });
      return;
    }
    capture.accepted = Object.freeze({
      path: new URL(request.url()).pathname,
      request: structuredClone(body),
    });
    await route.continue();
  });
}

async function proveCanonicalRetryAndConflict(capture: CompletionCapture): Promise<void> {
  expect(capture.accepted).not.toBeNull();
  const accepted = capture.accepted!;
  const fields = accepted.request.fields as Record<string, unknown>;
  expect(fields.riskFlags).toEqual(["policy", "receipt"]);
  const permuted = {
    ...accepted.request,
    fields: { ...fields, riskFlags: ["receipt", "policy"] },
  };
  const recovered = await fetch(new URL(accepted.path, apiOrigin), {
    method: "PUT",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(permuted),
  });
  expect(recovered.status).toBe(200);
  expect((await recovered.json() as { state: unknown }).state).toBe("committed");

  const conflict = await fetch(new URL(accepted.path, apiOrigin), {
    method: "PUT",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ ...accepted.request, resolutionActionId: "abort" }),
  });
  expect(conflict.status).toBe(409);
}

async function proveTerminalHistory(
  page: import("@playwright/test").Page,
  processInstanceId: string,
): Promise<void> {
  await navigate(page, "Operations");
  await page.getByLabel("Process-instance ID").fill(processInstanceId);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const row = page.getByRole("table", { name: "Confirmed Product 2 starts" })
    .getByRole("row")
    .filter({ hasText: processInstanceId });
  await row.getByRole("button", { name: `View details ${processInstanceId}` }).click();
  const detail = page.locator('[data-ui="process-execution-detail"]');
  await expect(detail.locator('[data-ui="execution-overview"]')).toContainText("completed");
  await detail.getByRole("tab", { name: "History", exact: true }).click();
  const history = detail.locator('[data-ui="execution-history"]');
  await expect(history).toContainText("ReviewException");
  await expect(history).toContainText("completeUserTaskInstance");
  const revisions = await history.locator("[data-revision]").evaluateAll((rows) =>
    rows.map((entry) => Number(entry.getAttribute("data-revision")))
  );
  expect(revisions).toEqual(revisions.map((_, index) => index + 1));
}

async function proveExactAudit(processInstanceId: string): Promise<void> {
  const audit = await readWorkAudit(apiOrigin, { hostingProcessInstanceId: processInstanceId });
  expect(audit.value.events.map(({ action }) => [action.kind, action.outcome])).toEqual([
    ["claim", "claimed"],
    ["completion", "reserved"],
    ["completion", "committed"],
  ]);
  expect(audit.value.events.every(({ hostingProcessInstanceId, taskId }) =>
    hostingProcessInstanceId === processInstanceId &&
    taskId.processInstanceId === processInstanceId &&
    taskId.elementId === "ReviewException" &&
    taskId.activation === 1
  )).toBe(true);
}

async function deployLowerPriorityControl(token: string): Promise<Readonly<{ processInstanceId: string }>> {
  const sources = await humanWorkSources(token);
  const definition = (await deployDefinition(apiOrigin, {
    bytes: sources.metadata,
    sourceId: `structured-priority-control-${token}.bpmn`,
    semanticProfile: metadataProfile,
  })).value;
  return (await startDefinition(apiOrigin, definition)).value.instance;
}

async function completeLowerPriorityControl(processInstanceId: string, token: string): Promise<void> {
  const snapshot = await listWorkTasks(apiOrigin);
  const task = snapshot.value.tasks.find((candidate) =>
    candidate.hostingInstance.processInstanceId === processInstanceId &&
    candidate.task.name === `Review request ${token}`
  );
  expect(task).toBeDefined();
  const claimed = await claimTask(apiOrigin, task!.task.id, {
    actionId: `priority-control-claim-${token}`,
    expectedGeneration: task!.claimGeneration,
  });
  const result = await completeTask(apiOrigin, `priority-control-complete-${token}`, {
    taskId: task!.task.id,
    expectedClaimGeneration: claimed.value.claim.generation,
    submittedValues: [{ key: "approved", value: { kind: "boolean", value: true } }],
  });
  expect(result.value.state).toBe("committed");
}

function taskRow(
  tasks: import("@playwright/test").Locator,
  name: string,
): import("@playwright/test").Locator {
  return tasks.getByRole("table", { name: "Current tasks" })
    .getByRole("row")
    .filter({ hasText: name });
}

async function navigate(
  page: import("@playwright/test").Page,
  workspace: "About" | "Definitions" | "Operations" | "Work",
): Promise<void> {
  const button = page.getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: workspace, exact: true });
  const heading = page.getByRole("heading", { name: workspace, level: 1 });
  if (await button.getAttribute("aria-current") === "page") {
    await expect(heading).toBeVisible();
    return;
  }
  await button.click();
  await expect(heading).toBeFocused();
}

function requireApiOrigin(): string {
  const value = process.env.PLATFORM_API_ORIGIN;
  if (value === undefined) throw new Error("Playwright config must provide PLATFORM_API_ORIGIN.");
  return value;
}
