import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import {
  screenshotCatalog,
  screenshotTargetDirectory,
} from "../src/screenshot-catalog.ts";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const expenseBpmnPath = resolve(
  repositoryRoot,
  "scenarios/expense-exception-review/process.bpmn",
);
const incidentBpmnPath = resolve(
  repositoryRoot,
  "scenarios/service-task-effect/process.bpmn",
);
const expenseProcessId = "Process_ExpenseExceptionReview";
const incidentProcessId = "Process_ServiceTaskEffectProbe";
const expenseProfile = "bpmn-2.0.2-bpmn-lean-structured-human-work-draft";
const retryProfile = "cibseven-2.2.0-service-task-incident-draft";
const cancellationProfile =
  "cibseven-2.2.0-service-task-incident-cancellation-draft";
const instanceIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

test("captures the ordered text-first platform walkthrough landmarks", async ({ page }) => {
  const captured: string[] = [];
  await page.goto("/");
  await stabilizeRendering(page);

  await navigate(page, "About");
  const capabilityBoundary = page.getByLabel("Coverage boundary");
  await expect(capabilityBoundary).toContainText("Not a conformance claim.");
  const capabilityTable = page.getByRole("table", {
    name: "Executable BPMN element and semantic-variant overview",
  });
  await expect(capabilityTable.locator("tbody tr")).toHaveCount(25);
  await capture(page, "01-about-capability-boundary.png", capabilityBoundary, captured);

  await navigate(page, "Definitions");
  await deployDefinition(page, expenseBpmnPath, expenseProfile, expenseProcessId, "1");
  const expenseDiagram = page.getByRole("region", {
    name: `Complete diagram workspace for ${expenseProcessId}, version 1`,
  });
  await expect(expenseDiagram.getByText("Generated layout", { exact: true })).toBeVisible();
  await expect(expenseDiagram.getByLabel(
    `BPMN diagram for ${expenseProcessId}, version 1`,
  )).toBeVisible();
  await capture(page, "02-expense-definition-diagram.png", expenseDiagram, captured);

  const expenseInstanceId = await startSelectedDefinition(page, 1);
  await navigate(page, "Work");
  const tasks = page.getByRole("region", { name: "Tasks" });
  const expenseTask = tasks.getByRole("table", { name: "Current tasks" })
    .getByRole("row")
    .filter({ hasText: "Review exception" });
  await refreshUntilVisible(tasks.getByRole("button", { name: "Refresh", exact: true }), expenseTask);
  await expect(expenseTask).toContainText("reviewers");
  await expect(expenseTask).toContainText("80");
  await expect(expenseTask).toContainText("Unclaimed");
  await capture(page, "03-expense-work-inbox.png", expenseTask, captured);

  await expenseTask.getByRole("button", { name: "Claim", exact: true }).click();
  await expect(expenseTask).toContainText("Claimed by demo-user");
  await expenseTask.getByRole("button", { name: "Review exception", exact: true }).click();
  await expect(tasks.getByRole("heading", { name: "Review exception", exact: true })).toBeFocused();
  const formTab = tasks.getByRole("tablist", { name: "Task detail views" })
    .getByRole("tab", { name: "Form", exact: true });
  await formTab.click();
  await expect(formTab).toHaveAttribute("aria-selected", "true");
  await fillApprovalForm(tasks);
  await expect(tasks.getByLabel("Resolution reason")).toHaveCount(0);
  await capture(
    page,
    "04-expense-structured-form.png",
    tasks.getByRole("heading", { name: "Review exception", exact: true }),
    captured,
  );
  await tasks.getByRole("button", { name: "Approve", exact: true }).click();
  await settleRetainedWorkCompletion(tasks, page);
  await refreshWorkUntilEmpty(tasks, page);

  await openCompletedProcess(page, expenseInstanceId);
  const processDetail = page.getByRole("region", {
    name: `Process instance ${expenseInstanceId}`,
  });
  await expect(processDetail).toContainText("completed");
  await processDetail.getByRole("tab", { name: "History", exact: true }).click();
  const history = processDetail.getByRole("region", { name: "History" });
  await expect(history).toContainText("completeUserTaskInstance");
  await expect(history).toContainText("ReviewException");
  const completionRecord = history.locator("li").filter({
    hasText: "completeUserTaskInstance",
  });
  await expect(completionRecord).toHaveCount(1);
  await capture(page, "05-completed-process-history.png", completionRecord, captured);

  await processDetail.getByRole("tab", { name: "Diagram", exact: true }).click();
  const executionDiagram = processDetail.getByRole("region", {
    name: "Diagram",
    exact: true,
  });
  await expect(executionDiagram.getByText("Generated layout", { exact: true })).toBeVisible();
  await expect(executionDiagram.getByRole("heading", { name: "Diagram", exact: true })).toBeVisible();
  await capture(page, "06-completed-process-diagram.png", executionDiagram, captured);

  await navigate(page, "Definitions");
  await page.getByRole("combobox", { name: "Definition", exact: true })
    .selectOption(expenseProcessId);
  await page.getByRole("combobox", { name: "Version", exact: true }).selectOption("1");
  await page.getByRole("tablist", { name: "Definition views" })
    .getByRole("tab", { name: "Flow-node metrics", exact: true })
    .click();
  const metrics = page.getByRole("region", {
    name: `Flow-node metrics for ${expenseProcessId}, version 1`,
  });
  await expect(metrics.getByText("All retained evidence", { exact: true })).toBeVisible();
  await expect(metrics.getByText("1 Process instance", { exact: true })).toBeVisible();
  await expect(metrics.getByRole("table", { name: "Flow-node metric values" })).toBeVisible();
  await capture(page, "07-definition-flow-node-metrics.png", metrics, captured);

  const retryInstanceId = await deployAndStartIncidentProfile(page, retryProfile, 1);
  const cancellationInstanceId = await deployAndStartIncidentProfile(
    page,
    cancellationProfile,
    2,
  );
  await navigate(page, "Operations");
  const operationsTabs = page.getByRole("tablist", { name: "Operations" });
  const currentIncidents = page.getByRole("table", { name: "Current incidents" });
  await refreshIncidentsUntilVisible(
    operationsTabs,
    currentIncidents,
    retryInstanceId,
    cancellationInstanceId,
  );
  const retryRow = currentIncidents.getByRole("row").filter({ hasText: retryInstanceId });
  const cancellationRow = currentIncidents.getByRole("row")
    .filter({ hasText: cancellationInstanceId });
  await expect(retryRow).toContainText("Retry");
  await expect(retryRow).not.toContainText("Cancel Process");
  await expect(cancellationRow).toContainText("Retry");
  await expect(cancellationRow).toContainText("Cancel Process");
  await capture(
    page,
    "08-current-incidents.png",
    page.getByRole("heading", { name: "Current incidents", level: 2 }),
    captured,
  );

  await openIncident(page, retryInstanceId);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await resubmitRetainedIncidentActionOnce(page, "Submit Retry again");

  await openIncident(page, cancellationInstanceId);
  await page.getByRole("button", { name: "Cancel Process", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Cancel root Process?" });
  await expect(confirmation).toContainText("removes all remaining live work");
  await expect(confirmation.getByRole("button", { name: "Keep Process running" })).toBeFocused();
  await capture(page, "09-cancel-process-confirmation.png", confirmation, captured);
  await confirmation.getByRole("button", { name: "Cancel root Process" }).click();
  await resubmitRetainedIncidentActionOnce(page, "Submit Cancel Process again");
  await refreshIncidentsUntilAbsent(
    operationsTabs,
    currentIncidents,
    cancellationInstanceId,
  );

  await operationsTabs.getByRole("tab", { name: "Audit", exact: true }).click();
  const auditHeading = page.getByRole("heading", { name: "Incident action audit", level: 2 });
  await expect(auditHeading).toBeVisible();
  await page.getByRole("textbox", { name: "Actor ID", exact: true }).fill("demo-user");
  const auditPanel = page.getByRole("region", { name: "Incident action audit" });
  const audit = auditPanel.getByRole("table", { name: "Incident action audit" });
  await refreshAuditUntilActionsCommitted(page, auditPanel, audit);
  await expect(audit).toContainText("demo-user");
  await capture(page, "10-incident-action-audit.png", auditHeading, captured);

  expect(captured).toEqual(screenshotCatalog.map(({ filename }) => filename));
});

async function stabilizeRendering(page: Page): Promise<void> {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-delay: 0s !important;
        animation-duration: 0s !important;
        caret-color: transparent !important;
        scroll-behavior: auto !important;
        transition-delay: 0s !important;
        transition-duration: 0s !important;
      }
    `,
  });
  await page.evaluate(async () => { await document.fonts.ready; });
}

async function navigate(
  page: Page,
  workspace: "About" | "Definitions" | "Operations" | "Work",
): Promise<void> {
  const button = page.getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: workspace, exact: true });
  const heading = page.getByRole("heading", { name: workspace, level: 1 });
  if (await button.getAttribute("aria-current") !== "page") await button.click();
  await expect(heading).toBeVisible();
}

async function deployDefinition(
  page: Page,
  sourcePath: string,
  semanticProfile: string,
  processId: string,
  version: string,
): Promise<void> {
  const sourceInput = page.getByLabel("BPMN XML file");
  if (!await sourceInput.isVisible()) {
    await page.getByText("Add BPMN definition", { exact: true }).click();
  }
  await sourceInput.setInputFiles(sourcePath);
  await page.getByRole("textbox", { name: "Semantic profile ID", exact: true })
    .fill(semanticProfile);
  await page.getByRole("button", { name: "Deploy definition", exact: true }).click();
  await expect(page.getByText("Admitted and deployed", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Definition", exact: true }))
    .toHaveValue(processId);
  await expect(page.getByRole("combobox", { name: "Version", exact: true }))
    .toHaveValue(version);
}

async function startSelectedDefinition(page: Page, version: number): Promise<string> {
  await page.getByRole("tablist", { name: "Definition views" })
    .getByRole("tab", { name: "Start", exact: true })
    .click();
  await page.getByRole("button", { name: `Start version ${version}`, exact: true }).click();
  await expect(page.getByText("Process instance started", { exact: true })).toBeVisible();
  const instanceId = page.getByText(instanceIdPattern, { exact: true });
  await expect(instanceId).toHaveCount(1);
  const value = await instanceId.textContent();
  if (value === null || !instanceIdPattern.test(value)) {
    throw new Error("The public start result did not expose one Process-instance ID.");
  }
  return value;
}

async function refreshUntilVisible(refresh: Locator, target: Locator): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (await target.count() === 1 && await target.isVisible()) return;
    await refresh.click();
  }
  await expect(target).toBeVisible();
}

async function refreshWorkUntilEmpty(tasks: Locator, page: Page): Promise<void> {
  const empty = tasks.getByText("No current tasks.", { exact: true });
  const refresh = tasks.getByRole("button", { name: "Refresh", exact: true });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await empty.isVisible().catch(() => false)) return;
    await refresh.click();
    await page.waitForTimeout(200);
  }
  await expect(empty).toBeVisible();
}

/**
 * Resubmits the retained completion command after an indeterminate response.
 * Re-entering the form would create a different command and lose the Work
 * boundary's exact retry identity.
 */
async function settleRetainedWorkCompletion(tasks: Locator, page: Page): Promise<void> {
  const collectionRefresh = tasks.getByRole("button", { name: "Refresh", exact: true });
  const retry = tasks.getByRole("button", { name: "Retry completion", exact: true });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await collectionRefresh.isVisible().catch(() => false)) return;
    if (await retry.isVisible().catch(() => false)) await retry.click();
    await page.waitForTimeout(200);
  }
  await expect(collectionRefresh).toBeVisible();
}

async function fillApprovalForm(tasks: Locator): Promise<void> {
  await tasks.getByLabel("Request reference").fill("EXP-WALKTHROUGH-001");
  await tasks.getByLabel("Expense date").fill("2026-08-17");
  await tasks.getByLabel("Approved amount").fill("4250");
  await tasks.getByRole("radio", { name: "Engineering", exact: true }).press("Space");
  await tasks.getByRole("checkbox", { name: "Missing receipt", exact: true }).press("Space");
  await tasks.getByRole("checkbox", { name: "Policy exception", exact: true }).press("Space");
  await expect(tasks.getByRole("radio", { name: "True", exact: true })).toBeChecked();
  await expect(tasks.getByRole("button", { name: "Approve", exact: true })).toBeVisible();
}

async function openCompletedProcess(page: Page, processInstanceId: string): Promise<void> {
  await navigate(page, "Operations");
  await page.getByRole("textbox", { name: "Process-instance ID", exact: true })
    .fill(processInstanceId);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const results = page.getByRole("table", { name: "Confirmed Product 2 starts" });
  await expect(results).toContainText(processInstanceId);
  const detail = page.getByRole("region", { name: `Process instance ${processInstanceId}` });
  const historyTab = detail.getByRole("tab", { name: "History", exact: true });
  const unavailable = detail.getByRole("alert");
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await results.getByRole("button", { name: `View details ${processInstanceId}` }).click();
    await expect(detail.getByRole("heading", { name: `Process instance ${processInstanceId}` }))
      .toBeVisible();
    await expect(historyTab.or(unavailable)).toBeVisible();
    if (await historyTab.isVisible()) {
      await expect(detail).toContainText("completed");
      return;
    }
    await detail.getByRole("button", { name: "Back to Process instances" }).click();
    await page.waitForTimeout(200);
  }
  await expect(historyTab).toBeVisible();
}

async function deployAndStartIncidentProfile(
  page: Page,
  semanticProfile: string,
  version: number,
): Promise<string> {
  await navigate(page, "Definitions");
  await deployDefinition(
    page,
    incidentBpmnPath,
    semanticProfile,
    incidentProcessId,
    String(version),
  );
  return await startSelectedDefinition(page, version);
}

async function refreshIncidentsUntilVisible(
  operationsTabs: Locator,
  incidents: Locator,
  retryInstanceId: string,
  cancellationInstanceId: string,
): Promise<void> {
  const processInstancesTab = operationsTabs.getByRole("tab", {
    name: "Process instances",
    exact: true,
  });
  const incidentsTab = operationsTabs.getByRole("tab", { name: "Incidents", exact: true });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await incidentsTab.click();
    const text = await incidents.textContent().catch(() => null);
    if (text?.includes(retryInstanceId) === true && text.includes(cancellationInstanceId)) return;
    await processInstancesTab.click();
    await operationsTabs.page().waitForTimeout(200);
  }
  await incidentsTab.click();
  await expect(incidents).toContainText(retryInstanceId);
  await expect(incidents).toContainText(cancellationInstanceId);
}

/**
 * Refreshes the projected collection only through its visible tab controls.
 * A committed detail action returns to the previously rendered collection,
 * which cannot prove projection convergence without a new public read.
 */
async function refreshIncidentsUntilAbsent(
  operationsTabs: Locator,
  incidents: Locator,
  processInstanceId: string,
): Promise<void> {
  const page = operationsTabs.page();
  const empty = page.getByText("No current incidents.", { exact: true });
  const processInstancesTab = operationsTabs.getByRole("tab", {
    name: "Process instances",
    exact: true,
  });
  const incidentsTab = operationsTabs.getByRole("tab", { name: "Incidents", exact: true });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await processInstancesTab.click();
    await incidentsTab.click();
    // Removing the final incident removes the table itself, so the explicit empty
    // state is as authoritative as a retained table that lacks this exact identity.
    if (await empty.isVisible().catch(() => false)) return;
    if (await incidents.isVisible().catch(() => false)) {
      const text = await incidents.textContent();
      if (text?.includes(processInstanceId) === false) return;
    }
    await page.waitForTimeout(200);
  }
  await expect(empty.or(incidents)).toBeVisible();
  if (await empty.isVisible()) return;
  await expect(incidents).not.toContainText(processInstanceId);
}

/**
 * Requires a fresh exact-detail read after selecting a collection row. Shared
 * mode deliberately does not treat point-in-time collection membership as
 * authorization to act on an incident.
 */
async function openIncident(page: Page, processInstanceId: string): Promise<void> {
  await page.getByRole("button", {
    name: `View incident ${processInstanceId} ServiceTask_Record activation 1 generation 1`,
  }).click();
  const heading = page.getByRole("heading", { name: "Incident ServiceTask_Record", level: 2 });
  const overview = page.getByRole("region", { name: "Incident overview" });
  const retry = page.getByRole("button", { name: "Retry incident detail", exact: true });
  await expect(heading).toBeVisible();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await overview.isVisible().catch(() => false)) return;
    if (await retry.isVisible().catch(() => false)) await retry.click();
    await page.waitForTimeout(200);
  }
  await expect(overview).toBeVisible();
}

/**
 * Resubmits the UI-retained exact action identity once, then leaves convergence
 * to the durable recovery worker. Spinning on this bounded Product 1 call adds
 * no ownership evidence and can starve the rest of the public journey.
 */
async function resubmitRetainedIncidentActionOnce(
  page: Page,
  resubmitLabel: "Submit Retry again" | "Submit Cancel Process again",
): Promise<void> {
  const collection = page.getByRole("heading", { name: "Current incidents", level: 2 });
  const resubmit = page.getByRole("button", { name: resubmitLabel, exact: true });
  await expect(collection.or(resubmit)).toBeVisible();
  if (await collection.isVisible()) return;
  await page.waitForTimeout(1_000);
  await resubmit.click();
  await expect(collection.or(resubmit)).toBeVisible();
  if (await collection.isVisible()) return;
  await page.getByRole("button", { name: "Back to incidents", exact: true }).click();
  await expect(collection).toBeVisible();
}

/**
 * Re-queries the public audit projection until both durable action outcomes are
 * visible. The table is a point-in-time read and does not update by itself. A
 * matching row can render before the request's loading state clears, so the
 * screenshot boundary also waits for the public settled-status message.
 */
async function refreshAuditUntilActionsCommitted(
  page: Page,
  auditPanel: Locator,
  audit: Locator,
): Promise<void> {
  const apply = page.getByRole("button", { name: "Apply audit filters", exact: true });
  const status = auditPanel.getByRole("status");
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await apply.click();
    const text = await audit.textContent().catch(() => null);
    if (
      text?.includes("Retry") === true &&
      text.includes("Cancel Process") &&
      text.includes("committed")
    ) {
      await expect(status).toContainText(/platform action records shown/u);
      return;
    }
    await page.waitForTimeout(200);
  }
  await expect(audit).toContainText("Retry");
  await expect(audit).toContainText("Cancel Process");
  await expect(audit).toContainText("committed");
}

async function capture(
  page: Page,
  filename: typeof screenshotCatalog[number]["filename"],
  landmark: Locator,
  captured: string[],
): Promise<void> {
  const catalogEntry = screenshotCatalog.find((entry) => entry.filename === filename);
  if (catalogEntry === undefined) throw new Error(`Unknown screenshot contract entry ${filename}.`);
  await expect(landmark).toBeVisible();
  await landmark.scrollIntoViewIfNeeded();
  await page.evaluate(async () => { await document.fonts.ready; });
  const path = resolve(repositoryRoot, screenshotTargetDirectory, filename);
  await mkdir(dirname(path), { recursive: true });
  await page.screenshot({
    path,
    animations: "disabled",
    caret: "hide",
    fullPage: false,
    scale: "css",
  });
  captured.push(catalogEntry.filename);
}
