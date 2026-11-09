import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import {
  horizontalOverflowFindings,
} from "./geometry.ts";
import {
  ExecutionPublicationFixtureState,
  executionPublicationExportBytes,
  executionPublicationLabels,
  installExecutionPublicationFixtures,
} from "./execution-publication-fixtures.ts";
import { waitForStableUi } from "./fixtures.ts";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("exact Process-instance selection opens only fresh execution detail and returns focus @responsive", async ({ page }) => {
  await openProcessInstances(page);
  const selection = processSelection(page);
  await selection.focus();
  await page.keyboard.press("Enter");

  const heading = page.getByRole("heading", {
    name: `Process instance ${executionPublicationLabels.processInstanceId}`,
  });
  await expect(heading).toBeFocused();
  const detail = page.locator('[data-ui="process-execution-detail"]');
  await expect(detail).toContainText(executionPublicationLabels.processId);
  await expect(detail.getByRole("tablist", { name: "Process instance detail" }).getByRole("tab")).toHaveCount(4);
  await expect(detail).toContainText("Head revision");
  await expect(detail).toContainText("running");
  await expect(detail.getByText("MUE Preview Alpha", { exact: true })).toHaveCount(0);
  await assertNoOverflow(page.locator("html"), "document");
  await assertNoOverflow(detail, "execution detail");

  await detail.getByRole("button", { name: "Back to Process instances" }).click();
  await expect(selection).toBeFocused();
});

test("Alpha shows only committed sequential Multi-Instance progress @responsive", async ({ page }) => {
  await openExecutionDetail(page, ExecutionPublicationFixtureState.SequentialAlpha);
  const preview = page.locator('[data-ui="mue-preview-alpha"]');
  await expect(preview.getByText("MUE Preview Alpha", { exact: true })).toBeVisible();
  await expect(preview.getByText("Observed in this browser session", { exact: true })).toBeVisible();
  await expect(preview.getByRole("list", { name: "Observed committed revisions" })).toContainText("Revision 5: running");
  // A running instance has neither a terminal output nor a fired Timer to show; the preview invents neither.
  await expect(preview.getByText("Committed terminal output", { exact: true })).toHaveCount(0);
  await expect(preview.getByRole("list", { name: "Committed Timer firings" })).toHaveCount(0);
  await assertNoOverflow(preview, "Alpha progress surface");
});

test("Alpha polling retains exact running and natural terminal samples @responsive", async ({ page }) => {
  await openExecutionDetail(page, ExecutionPublicationFixtureState.SequentialNatural);
  const preview = page.locator('[data-ui="mue-preview-alpha"]');
  await expect(preview.getByRole("list", { name: "Observed committed revisions" })).toContainText("Revision 5: running");
  await expect(preview.getByRole("list", { name: "Observed committed revisions" })).toContainText("Revision 6: completed");
  await expect(preview.getByText("DataObjectReference_OutputResults", { exact: true })).toBeVisible();
  await expect(preview.getByText("accepted", { exact: true })).toBeVisible();
  await expect(preview.getByText("flagged", { exact: true })).toBeVisible();
  await expect(preview.getByText("archived", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Back to Process instances" }).click();
  await processSelection(page).click();
  await expect(preview.getByRole("list", { name: "Observed committed revisions" })).toContainText("Revision 6: completed");
  await expect(preview.getByRole("list", { name: "Observed committed revisions" })).not.toContainText("Revision 5: running");
});

test("Alpha interruption keeps Timer, escalation, and output absence separate @responsive", async ({ page }) => {
  await openExecutionDetail(page, ExecutionPublicationFixtureState.SequentialInterrupted);
  const preview = page.locator('[data-ui="mue-preview-alpha"]');
  const timers = preview.getByRole("list", { name: "Committed Timer firings" });
  await expect(timers).toContainText("timerFire");
  await expect(timers).toContainText("BoundaryTimer_Review");
  await expect(timers).toContainText("fire-timer-alpha");
  await expect(preview.getByRole("list", { name: "Observed committed revisions" })).toContainText("Revision 7: completed");
  await expect(preview.getByText("No output collection is present", { exact: false })).toBeVisible();
  await expect(preview.getByText("This absence alone does not identify the route", { exact: false })).toBeVisible();

  // The escalation is its own committed command in History, never part of the Timer firing evidence.
  await page.getByRole("tab", { name: "History", exact: true }).click();
  const escalation = page.locator('[data-ui="execution-history"] [data-revision="7"]');
  await expect(escalation).toContainText("UserTask_Escalation");
  await expect(escalation).toContainText("complete-escalation-alpha");
});

test("History preserves exact revision order, labels, and repeated occurrence identity @responsive", async ({ page }) => {
  await openExecutionDetail(page);
  await page.getByRole("tab", { name: "History", exact: true }).click();
  const history = page.locator('[data-ui="execution-history"]');
  await expect(history).toBeVisible();
  await expect(history.getByText("Start", { exact: true })).toHaveCount(1);
  await expect(history.getByText("Sequence Flow arrival", { exact: true })).toHaveCount(4);
  expect(await history.locator("[data-revision]").evaluateAll((rows) =>
    rows.map((row) => Number(row.getAttribute("data-revision")))
  )).toEqual([1, 2, 3, 4, 5]);
  // The repeated element is told apart by the scope occurrence that owns each arrival.
  const firstRepeated = history.locator('[data-revision="4"]');
  const secondRepeated = history.locator('[data-revision="5"]');
  await expect(historyFact(firstRepeated, "Element")).toHaveText(executionPublicationLabels.repeatedElementId);
  await expect(historyFact(secondRepeated, "Element")).toHaveText(executionPublicationLabels.repeatedElementId);
  await expect(historyFact(firstRepeated, "Owner scope")).toHaveText("1");
  await expect(historyFact(secondRepeated, "Owner scope")).toHaveText("2");
  await assertNoOverflow(history, "execution History");
});

test("Diagram highlights every present position and reports off-diagram positions honestly @responsive", async ({ page }) => {
  await openExecutionDetail(page);
  await page.getByRole("tab", { name: "Diagram" }).click();
  await waitForStableUi(page, { diagram: true });
  const diagram = page.locator('[data-ui="execution-diagram"]');
  await expectExactDiagramMarkers(diagram);
  const missing = diagram.getByRole("status");
  await expect(missing).toContainText("Open waits outside this diagram");
  await expect(missing).toContainText(executionPublicationLabels.missingElementId);
  // Repeated waits of the off-diagram element keep their own occurrence identity in the list.
  for (const activation of [1, 2]) {
    await expect(diagram.getByText(
      `${executionPublicationLabels.processInstanceId} / ${executionPublicationLabels.missingElementId} / activation ${activation}`,
      { exact: true },
    )).toBeVisible();
  }
  await assertNoOverflow(diagram, "execution Diagram");
});

test("execution export downloads the exact canonical bytes and public surfaces remain host-free", async ({ page }) => {
  const capture = await openExecutionDetail(page);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download execution history" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(
    `execution-${executionPublicationLabels.processInstanceId}.json`,
  );
  const path = await download.path();
  expect(path).not.toBeNull();
  const actual = await readFile(path!);
  expect(actual).toEqual(Buffer.from(executionPublicationExportBytes()));

  const browserState = await page.evaluate(() => ({
    dom: document.documentElement.outerHTML,
    history: { state: history.state, url: location.href },
    storage: {
      local: Object.fromEntries(Object.entries(localStorage)),
      session: Object.fromEntries(Object.entries(sessionStorage)),
    },
  }));
  expect(privateSurfaceFindings({ browserState, transport: capture.publicResponses })).toEqual([]);
});

test("a gapped publication suppresses semantic detail while preserving Operator history", async ({ page }) => {
  await openProcessInstances(page, ExecutionPublicationFixtureState.Gap);
  await processSelection(page).click();
  const unavailable = page.getByRole("alert").filter({
    hasText: "Committed execution publication unavailable.",
  });
  await expect(unavailable).toBeFocused();
  await expect(unavailable).toContainText("Overview, History, Diagram, and execution export are suppressed. Operator history remains available.");
  const tabs = page.getByRole("tablist", { name: "Process instance detail" });
  await expect(tabs.getByRole("tab")).toHaveCount(1);
  await expect(tabs.getByRole("tab", { name: "Operator history" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Download execution history" })).toHaveCount(0);
  await expect(page.locator('[data-ui="execution-history"]')).toHaveCount(0);
  await expect(page.locator('[data-ui="execution-diagram"]')).toHaveCount(0);
});

test("a malformed execution export preserves independent Operator history", async ({ page }) => {
  await openExecutionDetail(page, ExecutionPublicationFixtureState.MalformedExport);
  await page.getByRole("button", { name: "Download execution history" }).click();
  const unavailable = page.getByRole("alert").filter({
    hasText: "Committed execution publication unavailable.",
  });
  await expect(unavailable).toBeFocused();
  await expect(unavailable).toContainText("Overview, History, Diagram, and execution export are suppressed. Operator history remains available.");
  const tabs = page.getByRole("tablist", { name: "Process instance detail" });
  await expect(tabs.getByRole("tab")).toHaveCount(1);
  await expect(tabs.getByRole("tab", { name: "Operator history" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Download execution history" })).toHaveCount(0);
  await expect(page.locator('[data-ui="execution-history"]')).toHaveCount(0);
  await expect(page.locator('[data-ui="execution-diagram"]')).toHaveCount(0);
});

test("Operator history selected during execution loading survives publication arrival", async ({ page }) => {
  await openProcessInstances(page, ExecutionPublicationFixtureState.Delayed);
  const response = page.waitForResponse(isExecutionPageResponse);
  await processSelection(page).click();
  const operatorTab = page.getByRole("tab", { name: "Operator history" });
  await expect(operatorTab).toHaveAttribute("aria-selected", "true");
  await operatorTab.focus();
  await page.keyboard.press("Enter");
  await response;
  await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
  await expect(operatorTab).toHaveAttribute("aria-selected", "true");
  await expect(page.locator('[data-ui="operator-history"]')).toBeVisible();
});

test("tab return restores selected instance and Back invalidates delayed execution responses", async ({ page }) => {
  await openProcessInstances(page, ExecutionPublicationFixtureState.Delayed);
  let selection = processSelection(page);
  const abandonedByTab = page.waitForResponse(isExecutionPageResponse);
  await selection.click();
  const pending = page.getByRole("status").filter({
    hasText: "Loading the complete committed execution publication",
  });
  await expect(pending).toBeFocused();
  await page.getByRole("tab", { name: "Incidents" }).click();
  await abandonedByTab;
  await page.getByRole("tab", { name: "Process instances" }).click();
  await expect(page.locator('[data-ui="process-execution-detail"]')).toBeVisible();
  await page.getByRole("button", { name: "Back to Process instances" }).click();

  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("table", { name: "Process instances" })).toBeVisible();
  selection = processSelection(page);
  const abandonedByBack = page.waitForResponse(isExecutionPageResponse);
  await selection.click();
  await expect(pending).toBeFocused();
  await page.getByRole("button", { name: "Back to Process instances" }).click();
  await expect(selection).toBeFocused();
  await abandonedByBack;
  await expect(page.locator('[data-ui="process-execution-detail"]')).toHaveCount(0);
  await expect(selection).toBeFocused();
});

test("Process execution Diagram visual @visual", async ({ page }) => {
  test.skip(process.platform !== "linux", "Shared visual baselines are Linux-only.");
  test.skip(test.info().project.name !== "chromium-1600", "Manual visual review uses one wide desktop viewport.");
  await openExecutionDetail(page);
  await page.getByRole("tab", { name: "Diagram" }).click();
  await waitForStableUi(page, { diagram: true });
  const detail = page.locator('[data-ui="process-execution-detail"]');
  await expectExactDiagramMarkers(detail.locator('[data-ui="execution-diagram"]'));
  await expect(detail).toHaveScreenshot(
    "process-execution-diagram.png",
    screenshotOptions,
  );
});

const screenshotOptions = {
  animations: "disabled" as const,
  caret: "hide" as const,
  scale: "css" as const,
};

async function openProcessInstances(
  page: import("@playwright/test").Page,
  state: ExecutionPublicationFixtureState = ExecutionPublicationFixtureState.Available,
) {
  const capture = await installExecutionPublicationFixtures(page, state);
  await page.goto("/");
  await page.getByRole("link", { name: "Operations", exact: true }).click();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("table", { name: "Process instances" })).toBeVisible();
  return capture;
}

async function openExecutionDetail(
  page: import("@playwright/test").Page,
  state: ExecutionPublicationFixtureState = ExecutionPublicationFixtureState.Available,
) {
  const capture = await openProcessInstances(page, state);
  await processSelection(page).click();
  await expect(page.locator('[data-ui="process-execution-detail"]')).toBeVisible();
  return capture;
}

function processSelection(page: import("@playwright/test").Page) {
  return page.getByRole("button", {
    name: `View details ${executionPublicationLabels.processInstanceId}`,
  });
}

function isExecutionPageResponse(response: import("@playwright/test").Response): boolean {
  return response.request().method() === "GET" &&
    new URL(response.url()).pathname.endsWith("/execution");
}

async function expectExactDiagramMarkers(
  diagram: import("@playwright/test").Locator,
): Promise<void> {
  await expect(diagram.locator('.djs-element[data-element-id="Task_Left"].bpmn-platform-current')).toHaveCount(1);
  await expect(diagram.getByLabel("Diagram position guide")).toContainText("Open wait");
  await expect(diagram.locator('.djs-element[data-element-id="Task_Left"] > .djs-visual > :first-child')).toHaveCSS("stroke", "rgb(15, 107, 92)");
  await expect(diagram.locator('.djs-element[data-element-id="Task_Left"] > .djs-visual > :first-child')).toHaveCSS("fill", "rgb(230, 242, 239)");
  // Only the open wait that has a shape is marked; no Sequence Flow carries a marker.
  await expect(diagram.locator('.djs-element.bpmn-platform-current')).toHaveCount(1);
  await expect(diagram.locator(`.djs-element[data-element-id="${executionPublicationLabels.processId}"].bpmn-platform-current`)).toHaveCount(0);
  await expect(diagram.locator('.djs-element[data-element-id="Task_Right"].bpmn-platform-current')).toHaveCount(0);
}

function historyFact(
  record: import("@playwright/test").Locator,
  label: string,
): import("@playwright/test").Locator {
  return record.locator("dt").filter({ hasText: new RegExp(`^${label}$`, "u") }).locator("+ dd");
}

async function assertNoOverflow(
  locator: import("@playwright/test").Locator,
  label: string,
) {
  expect(await horizontalOverflowFindings(locator), `${label} must not scroll horizontally`).toEqual([]);
}

const forbiddenPrivateSurface = [
  /locator/iu,
  /workflow[\s_-]*id/iu,
  /run[\s_-]*id/iu,
  /task[\s_-]*queue/iu,
  /event[\s_-]*history/iu,
  /control[\s_-]*place/iu,
  /place[\s_-]*id/iu,
] as const;

function privateSurfaceFindings(value: unknown): string[] {
  const findings: string[] = [];
  scan(value, "$", findings, new Set<object>());
  return findings;
}

function scan(
  value: unknown,
  path: string,
  findings: string[],
  seen: Set<object>,
): void {
  if (typeof value === "string") {
    if (forbiddenPrivateSurface.some((pattern) => pattern.test(value))) findings.push(path);
    return;
  }
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((child, index) => { scan(child, `${path}[${index}]`, findings, seen); });
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (forbiddenPrivateSurface.some((pattern) => pattern.test(key))) findings.push(childPath);
    scan(child, childPath, findings, seen);
  }
}
