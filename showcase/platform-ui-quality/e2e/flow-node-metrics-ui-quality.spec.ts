import { expect, test } from "@playwright/test";

import {
  assertOwnedActionsFit,
  horizontalOverflowFindings,
} from "./geometry.ts";
import {
  FlowNodeMetricsFixtureFailure,
  installFlowNodeMetricsFixtures,
} from "./flow-node-metrics-fixtures.ts";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("Definitions links to exact Operations metrics with reload and browser history @responsive", async ({ page }) => {
  await installFlowNodeMetricsFixtures(page);
  await page.goto("/#/definitions?process=Metrics_Process&version=7");
  const link = page.getByRole("link", { name: "View process metrics", exact: true });
  await expect(link).toHaveAttribute("href", /operations.*tab=metrics.*process=Metrics_Process.*version=7/);
  await link.click();
  await expect(page.getByRole("tab", { name: "Process metrics", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("7 Process instances", { exact: true })).toBeVisible();
  await versionPicker(page).selectOption("8");
  await expect(page.getByText("8 Process instances", { exact: true })).toBeVisible();
  await page.goBack();
  await expect(versionPicker(page)).toHaveValue("7");
  await page.goForward();
  await expect(versionPicker(page)).toHaveValue("8");
  await page.reload();
  await expect(page.getByText("8 Process instances", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "View definition", exact: true }).click();
  await expect(page).toHaveURL(/definitions.*version=8/);
  await expect(page.getByRole("button", { name: "Start version 8" })).toBeVisible();
});

test("legacy metrics links redirect without losing their exact definition", async ({ page }) => {
  await installFlowNodeMetricsFixtures(page);
  await page.goto("/#/definitions?process=Metrics_Process&version=7&tab=metrics");
  await expect(page).toHaveURL(/operations.*tab=metrics/);
  await expect(versionPicker(page)).toHaveValue("7");
  await expect(page.getByText("7 Process instances", { exact: true })).toBeVisible();
});

test("unavailable metrics selections never fall back to another process or version", async ({ page }) => {
  const fixture = await installFlowNodeMetricsFixtures(page);
  for (const search of ["process=missing", "process=Metrics_Process&version=999"]) {
    await page.goto(`/#/operations?tab=metrics&${search}`);
    await expect(page.getByRole("alert")).toContainText("unavailable");
    await expect(page.getByRole("table", { name: "Process metric values" })).toHaveCount(0);
  }
  expect(fixture.metricsRequestCount()).toBe(0);
});

test("empty metrics process selection explains the next step", async ({ page }) => {
  await installFlowNodeMetricsFixtures(page);
  await page.route("**/api/v1/definitions", (route) => route.fulfill({ json: { definitions: [] } }));
  await page.goto("/#/operations?tab=metrics");
  await expect(page.getByText(/No process definitions are available yet/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Definitions" })).toBeVisible();
});

test("Process metrics uses one exact snapshot for badges and its complete table @responsive", async ({ page }) => {
  const fixture = await installFlowNodeMetricsFixtures(page);
  await openMetrics(page);

  const detail = page.getByRole("region", {
    name: "Process metrics for Metrics_Process, version 8",
  });
  const heading = detail.getByRole("heading", { name: "Process metrics" });
  await expect(heading).toBeFocused();
  await expect(detail.getByText("All retained evidence", { exact: true })).toBeVisible();
  await expect(detail.getByText("8 Process instances", { exact: true })).toBeVisible();
  const table = detail.getByRole("table", { name: "Process metric values" });
  await expect(table).toBeVisible();
  await expect(table.getByRole("row")).toHaveCount(7);
  await expect(table.getByRole("row", { name: /Task_Running/u })).toContainText(
    "No completed samples",
  );
  await expect(detail.locator(".bpmn-platform-metric-badge")).toHaveCount(4);
  await expect(detail.getByRole("status").getByText("Task_MissingFromDiagram", { exact: true })).toBeVisible();

  const requestCount = fixture.metricsRequestCount();
  const frequency = detail.getByRole("button", { name: "Frequency" });
  await frequency.focus();
  await page.keyboard.press("Tab");
  const duration = detail.getByRole("button", { name: "Duration" });
  await expect(duration).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(duration).toHaveAttribute("aria-pressed", "true");
  await expect(detail.locator(".bpmn-platform-metric-badge")).toHaveCount(3);
  await expect(detail.locator('[data-element-id="Task_Running"] .bpmn-platform-metric-badge')).toHaveCount(0);
  await expect(detail.locator(".bpmn-platform-metric-badge", { hasText: "15ms" })).toHaveCount(1);
  expect(fixture.metricsRequestCount()).toBe(requestCount);

  await assertNoOverflow(page.locator("html"), "document");
  await assertNoOverflow(detail, "metric detail");
  await assertNoOverflow(table, "metric table");
  await assertOwnedActionsFit(detail);
  await page.screenshot({ path: test.info().outputPath("operations-process-metrics.png") });
});

for (const failure of [
  FlowNodeMetricsFixtureFailure.NotFound,
  FlowNodeMetricsFixtureFailure.Unavailable,
  FlowNodeMetricsFixtureFailure.Transport,
] as const) {
  test(`Process metrics suppresses a prior snapshot after ${failure}`, async ({ page }) => {
    await installFlowNodeMetricsFixtures(page, { failure });
    await openMetrics(page);
    await expect(page.getByRole("table", { name: "Process metric values" })).toBeVisible();
    await versionPicker(page).selectOption("7");
    const alert = page.getByRole("alert");
    await expect(alert).toHaveText("Process metrics are unavailable.");
    await expect(alert).toBeFocused();
    await expect(page.getByRole("table", { name: "Process metric values" })).toHaveCount(0);
    await expect(page.locator(".bpmn-platform-metric-badge")).toHaveCount(0);
  });
}

test("Process metrics Retry is keyboard reachable and loads only the retried exact version", async ({ page }) => {
  await installFlowNodeMetricsFixtures(page, { failVersionSevenOnce: true });
  await openMetrics(page);
  await versionPicker(page).selectOption("7");
  const alert = page.getByRole("alert");
  await expect(alert).toHaveText("Process metrics are unavailable.");
  await expect(alert).toBeFocused();
  await page.keyboard.press("Tab");
  const retry = page.getByRole("button", { name: "Retry" });
  await expect(retry).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Process metrics" })).toBeFocused();
  await expect(page.getByText("7 Process instances", { exact: true })).toBeVisible();
});

test("Process metrics discards delayed old-version and abandoned-tab responses", async ({ page }) => {
  await installFlowNodeMetricsFixtures(page, { delayedVersionSeven: true });
  await openMetrics(page);
  await versionPicker(page).selectOption("7");
  await expect(page.locator('[data-ui="flow-node-metrics-detail"]').getByRole("status")).toContainText("Loading process metrics");
  await expect(page.getByRole("heading", { name: "Process metrics" })).toBeFocused();
  await versionPicker(page).selectOption("8");
  await expect(page.getByText("8 Process instances", { exact: true })).toBeVisible();
  await page.waitForTimeout(700);
  await expect(page.getByText("7 Process instances", { exact: true })).toHaveCount(0);

  await versionPicker(page).selectOption("7");
  await page.getByRole("tab", { name: "Process instances", exact: true }).click();
  await page.waitForTimeout(700);
  await expect(page.getByRole("table", { name: "Process metric values" })).toHaveCount(0);
  await expect(page.locator(".bpmn-platform-metric-badge")).toHaveCount(0);
});

async function openMetrics(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/#/operations?tab=metrics");
  const metricsTab = page.getByRole("tab", { name: "Process metrics", exact: true });
  await expect(metricsTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Process metrics" })).toBeFocused();
  await expect(page.getByText("All retained evidence", { exact: true })).toBeVisible();
}

function versionPicker(page: import("@playwright/test").Page): import("@playwright/test").Locator {
  return page.getByRole("combobox", { name: "Version", exact: true });
}

async function assertNoOverflow(
  locator: import("@playwright/test").Locator,
  label: string,
): Promise<void> {
  expect(await horizontalOverflowFindings(locator), `${label} must not scroll horizontally`).toEqual([]);
}
