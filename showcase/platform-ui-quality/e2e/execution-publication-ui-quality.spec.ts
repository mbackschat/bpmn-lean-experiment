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

test("exact Process-instance selection opens only fresh execution detail and returns focus", async ({ page }) => {
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
  await expect(detail.getByRole("tablist", { name: "Process instance detail" }).getByRole("tab")).toHaveCount(3);
  await expect(detail).toContainText("Head revision");
  await expect(detail).toContainText("running");
  await assertNoOverflow(page.locator("html"), "document");
  await assertNoOverflow(detail, "execution detail");

  await detail.getByRole("button", { name: "Back to Process instances" }).click();
  await expect(selection).toBeFocused();
});

test("History preserves exact revision order, labels, and repeated occurrence identity", async ({ page }) => {
  await openExecutionDetail(page);
  await page.getByRole("tab", { name: "History" }).click();
  const history = page.locator('[data-ui="execution-history"]');
  await expect(history).toBeVisible();
  await expect(history.getByText("External stimulus", { exact: true })).toHaveCount(1);
  await expect(history.getByText("Internal operation", { exact: true })).toHaveCount(4);
  expect(await history.locator("[data-revision]").evaluateAll((rows) =>
    rows.map((row) => Number(row.getAttribute("data-revision")))
  )).toEqual([1, 2, 3, 4, 5]);
  const firstRepeated = history.locator('[data-revision="4"]');
  const secondRepeated = history.locator('[data-revision="5"]');
  await expect(firstRepeated).toContainText(executionPublicationLabels.repeatedElementId);
  await expect(secondRepeated).toContainText(executionPublicationLabels.repeatedElementId);
  await expect(firstRepeated).toContainText("Scope_Repeated / activation 1");
  await expect(secondRepeated).toContainText("Scope_Repeated / activation 2");
  await assertNoOverflow(history, "execution History");
});

test("Diagram highlights every present position and reports off-diagram positions honestly", async ({ page }) => {
  await openExecutionDetail(page);
  await page.getByRole("tab", { name: "Diagram" }).click();
  await waitForStableUi(page);
  const diagram = page.locator('[data-ui="execution-diagram"]');
  await expectExactDiagramMarkers(diagram);
  const missing = diagram.getByRole("status");
  await expect(missing).toContainText("Published positions outside this diagram");
  await expect(missing).toContainText(executionPublicationLabels.missingElementId);
  await expect(diagram.getByText("Scope_Repeated / activation 1", { exact: false })).toBeVisible();
  await expect(diagram.getByText("Scope_Repeated / activation 2", { exact: false })).toBeVisible();
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

test("a gapped publication suppresses History, Diagram, and export", async ({ page }) => {
  await openProcessInstances(page, ExecutionPublicationFixtureState.Gap);
  await processSelection(page).click();
  const unavailable = page.getByRole("alert").filter({
    hasText: "Committed execution publication unavailable.",
  });
  await expect(unavailable).toBeFocused();
  await expect(unavailable).toContainText("History, Diagram, and export are suppressed.");
  await expect(page.getByRole("tablist", { name: "Process instance detail" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Download execution history" })).toHaveCount(0);
  await expect(page.locator('[data-ui="execution-history"]')).toHaveCount(0);
  await expect(page.locator('[data-ui="execution-diagram"]')).toHaveCount(0);
});

test("a malformed export suppresses the complete execution detail", async ({ page }) => {
  await openExecutionDetail(page, ExecutionPublicationFixtureState.MalformedExport);
  await page.getByRole("button", { name: "Download execution history" }).click();
  const unavailable = page.getByRole("alert").filter({
    hasText: "Committed execution publication unavailable.",
  });
  await expect(unavailable).toBeFocused();
  await expect(unavailable).toContainText("History, Diagram, and export are suppressed.");
  await expect(page.getByRole("tablist", { name: "Process instance detail" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Download execution history" })).toHaveCount(0);
  await expect(page.locator('[data-ui="execution-history"]')).toHaveCount(0);
  await expect(page.locator('[data-ui="execution-diagram"]')).toHaveCount(0);
});

test("tab abandonment and Back invalidate delayed execution responses", async ({ page }) => {
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
  await expect(page.locator('[data-ui="process-execution-detail"]')).toHaveCount(0);

  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("table", { name: "Confirmed Product 2 starts" })).toBeVisible();
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

test("Process execution History visual @visual", async ({ page }) => {
  test.skip(process.platform !== "linux", "Shared visual baselines are Linux-only.");
  await openExecutionDetail(page);
  await page.getByRole("tab", { name: "History" }).click();
  await waitForStableUi(page);
  await expect(page.locator('[data-ui="process-execution-detail"]')).toHaveScreenshot(
    "process-execution-history.png",
    screenshotOptions,
  );
});

test("Process execution Diagram visual @visual", async ({ page }) => {
  test.skip(process.platform !== "linux", "Shared visual baselines are Linux-only.");
  await openExecutionDetail(page);
  await page.getByRole("tab", { name: "Diagram" }).click();
  await waitForStableUi(page);
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
  await page.getByRole("button", { name: "Operations", exact: true }).click();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("table", { name: "Confirmed Product 2 starts" })).toBeVisible();
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
    name: `View execution ${executionPublicationLabels.processInstanceId}`,
  });
}

function isExecutionPageResponse(response: import("@playwright/test").Response): boolean {
  return response.request().method() === "GET" &&
    new URL(response.url()).pathname.endsWith("/execution");
}

async function expectExactDiagramMarkers(
  diagram: import("@playwright/test").Locator,
): Promise<void> {
  await expect(diagram.locator('.djs-element[data-element-id="Flow_1"].bpmn-platform-current')).toHaveCount(1);
  await expect(diagram.locator('.djs-element[data-element-id="Flow_2"].bpmn-platform-current')).toHaveCount(1);
  await expect(diagram.locator('.djs-element[data-element-id="Task_Left"].bpmn-platform-current')).toHaveCount(1);
  await expect(diagram.getByLabel("Diagram position guide")).toContainText("Current control token");
  await expect(diagram.getByLabel("Diagram position guide")).toContainText("Active wait");
  await expect(diagram.locator('.djs-element[data-element-id="Flow_1"] > .djs-visual > path')).toHaveCSS("stroke", "rgb(15, 107, 92)");
  await expect(diagram.locator('.djs-element[data-element-id="Flow_2"] > .djs-visual > path')).toHaveCSS("stroke", "rgb(15, 107, 92)");
  await expect(diagram.locator('.djs-element[data-element-id="Flow_1"] > .djs-visual marker path')).toHaveCSS("fill", "rgb(15, 107, 92)");
  await expect(diagram.locator('.djs-element[data-element-id="Task_Left"] > .djs-visual > :first-child')).toHaveCSS("stroke", "rgb(15, 107, 92)");
  await expect(diagram.locator('.djs-element[data-element-id="Task_Left"] > .djs-visual > :first-child')).toHaveCSS("fill", "rgb(230, 242, 239)");
  await expect(diagram.locator('.djs-element.bpmn-platform-current')).toHaveCount(3);
  await expect(diagram.locator(`.djs-element[data-element-id="${executionPublicationLabels.processId}"].bpmn-platform-current`)).toHaveCount(0);
  await expect(diagram.locator('.djs-element[data-element-id="Task_Right"].bpmn-platform-current')).toHaveCount(0);
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
