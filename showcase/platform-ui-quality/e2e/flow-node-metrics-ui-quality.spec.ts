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

test("Flow-node metrics uses one exact snapshot for badges and its complete table @responsive", async ({ page }) => {
  const fixture = await installFlowNodeMetricsFixtures(page);
  await openMetrics(page);

  const detail = page.getByRole("region", {
    name: "Flow-node metrics for Metrics_Process, version 8",
  });
  const heading = detail.getByRole("heading", { name: "Flow-node metrics" });
  await expect(heading).toBeFocused();
  await expect(detail.getByText("All retained evidence", { exact: true })).toBeVisible();
  await expect(detail.getByText("8 Process instances", { exact: true })).toBeVisible();
  const table = detail.getByRole("table", { name: "Flow-node metric values" });
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
});

for (const failure of [
  FlowNodeMetricsFixtureFailure.NotFound,
  FlowNodeMetricsFixtureFailure.Unavailable,
  FlowNodeMetricsFixtureFailure.Transport,
] as const) {
  test(`Flow-node metrics suppresses a prior snapshot after ${failure}`, async ({ page }) => {
    await installFlowNodeMetricsFixtures(page, { failure });
    await openMetrics(page);
    await expect(page.getByRole("table", { name: "Flow-node metric values" })).toBeVisible();
    await versionPicker(page).selectOption("7");
    const alert = page.getByRole("alert");
    await expect(alert).toHaveText("Flow-node metrics are unavailable.");
    await expect(alert).toBeFocused();
    await expect(page.getByRole("table", { name: "Flow-node metric values" })).toHaveCount(0);
    await expect(page.locator(".bpmn-platform-metric-badge")).toHaveCount(0);
  });
}

test("Flow-node metrics Retry is keyboard reachable and loads only the retried exact version", async ({ page }) => {
  await installFlowNodeMetricsFixtures(page, { failVersionSevenOnce: true });
  await openMetrics(page);
  await versionPicker(page).selectOption("7");
  const alert = page.getByRole("alert");
  await expect(alert).toHaveText("Flow-node metrics are unavailable.");
  await expect(alert).toBeFocused();
  await page.keyboard.press("Tab");
  const retry = page.getByRole("button", { name: "Retry" });
  await expect(retry).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Flow-node metrics" })).toBeFocused();
  await expect(page.getByText("7 Process instances", { exact: true })).toBeVisible();
});

test("Flow-node metrics discards delayed old-version and abandoned-tab responses", async ({ page }) => {
  await installFlowNodeMetricsFixtures(page, { delayedVersionSeven: true });
  await openMetrics(page);
  await versionPicker(page).selectOption("7");
  await expect(page.locator('[data-ui="flow-node-metrics-detail"]').getByRole("status")).toContainText("Loading flow-node metrics");
  await expect(page.getByRole("heading", { name: "Flow-node metrics" })).toBeFocused();
  await versionPicker(page).selectOption("8");
  await expect(page.getByText("8 Process instances", { exact: true })).toBeVisible();
  await page.waitForTimeout(700);
  await expect(page.getByText("7 Process instances", { exact: true })).toHaveCount(0);

  await versionPicker(page).selectOption("7");
  await page.getByRole("tab", { name: "Diagram", exact: true }).click();
  await page.waitForTimeout(700);
  await expect(page.getByRole("table", { name: "Flow-node metric values" })).toHaveCount(0);
  await expect(page.locator(".bpmn-platform-metric-badge")).toHaveCount(0);
});

async function openMetrics(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Definitions" }).click();
  const diagramTab = page.getByRole("tab", { name: "Diagram", exact: true });
  await diagramTab.focus();
  await page.keyboard.press("ArrowRight");
  const metricsTab = page.getByRole("tab", { name: "Flow-node metrics" });
  await expect(metricsTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Flow-node metrics" })).toBeFocused();
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
