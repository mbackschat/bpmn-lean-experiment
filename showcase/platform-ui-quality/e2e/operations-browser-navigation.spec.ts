import { expect, test } from "@playwright/test";
import type { Route } from "@playwright/test";
import { waitForStableUi } from "./fixtures.ts";

import {
  executionPublicationLabels,
  installExecutionPublicationFixtures,
} from "./execution-publication-fixtures.ts";
import {
  FixtureIncidentActionState,
  installOperationsApiFixtures,
  operationsFixtureLabels,
} from "./operations-fixtures.ts";

test("instance History direct links survive reload and browser Back/Forward @responsive", async ({ page }) => {
  await installExecutionPublicationFixtures(page);
  await page.goto(`/#/operations?instance=${encodeURIComponent(executionPublicationLabels.processInstanceId)}&view=history`);
  await expect(page.locator('[data-ui="execution-history"]')).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-ui="execution-history"]')).toBeVisible();
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await expect(page.locator('[data-ui="execution-overview"]')).toBeVisible();
  await page.goBack();
  await expect(page.locator('[data-ui="execution-history"]')).toBeVisible();
  await page.goForward();
  await expect(page.locator('[data-ui="execution-overview"]')).toBeVisible();
  await page.getByRole("button", { name: "Back to Process instances" }).click();
  await expect(page.getByRole("button", { name: "Search", exact: true })).toBeVisible();
  expect(new URLSearchParams(new URL(page.url()).hash.split("?")[1]).has("instance")).toBe(false);
});

test("instance filter links restore their public search on reload", async ({ page }) => {
  await installExecutionPublicationFixtures(page);
  const filters = new URLSearchParams({
    filterInstance: executionPublicationLabels.processInstanceId,
    process: executionPublicationLabels.processId,
    version: "4",
    source: "e".repeat(64),
  });
  await page.goto(`/#/operations?${filters}`);
  await expect(page.getByRole("table", { name: "Process instances" })).toBeVisible();
  await expect(page.getByLabel("Process-instance ID", { exact: true })).toHaveValue(executionPublicationLabels.processInstanceId);
  await page.reload();
  await expect(page.getByRole("table", { name: "Process instances" })).toBeVisible();
  await expect(page.getByLabel("Process ID", { exact: true })).toHaveValue(executionPublicationLabels.processId);
});

test("one filter submits once and an obsolete manual search cannot overwrite browser Back", async ({ page }) => {
  await installExecutionPublicationFixtures(page);
  const delayed = Promise.withResolvers<Route>();
  let searches = 0;
  await page.route("**/api/v1/process-instances?**", async (route) => {
    searches += 1;
    if (searches === 2) {
      delayed.resolve(route);
      return;
    }
    if (searches === 3) {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ instances: [], nextCursor: null }) });
      return;
    }
    await route.fallback();
  });
  await page.goto("/#/operations");
  await page.getByLabel("Process-instance ID", { exact: true }).fill(executionPublicationLabels.processInstanceId);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("table", { name: "Process instances" })).toBeVisible();
  expect(searches).toBe(1);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const obsolete = await delayed.promise;
  await page.goBack();
  await expect(page.getByText("No process instances match these filters.")).toBeVisible();
  const response = page.waitForResponse((candidate) => candidate.request() === obsolete.request());
  await obsolete.fallback();
  await response;
  await waitForStableUi(page);
  await expect(page.getByRole("table", { name: "Process instances" })).toHaveCount(0);
  await expect(page.getByLabel("Process-instance ID", { exact: true })).toHaveValue("");
  expect(searches).toBe(3);
});

test("incident Diagram direct links resolve current public identity across reload and history @responsive", async ({ page }) => {
  const capture = await installOperationsApiFixtures(page);
  await page.goto(incidentUrl("diagram"));
  const tabs = page.getByRole("tablist", { name: "Incident detail", exact: true });
  await expect(tabs.getByRole("tab", { name: "Diagram" })).toHaveAttribute("aria-selected", "true");
  await page.reload();
  await expect(tabs.getByRole("tab", { name: "Diagram" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(
    `.djs-element[data-element-id="${operationsFixtureLabels.element}"].bpmn-platform-incident`,
  )).toBeVisible();
  await tabs.getByRole("tab", { name: "Overview" }).click();
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
  await page.goBack();
  await expect(tabs.getByRole("tab", { name: "Diagram" })).toHaveAttribute("aria-selected", "true");
  await page.goForward();
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
  expect(capture.actions).toEqual([]);
});

test("unknown and hostile Operations keys remain nonactionable", async ({ page }) => {
  const capture = await installOperationsApiFixtures(page);
  await installExecutionPublicationFixtures(page);
  const detailReads: string[] = [];
  page.on("request", (request) => {
    if (/\/incidents\/|\/execution(?:\?|$)/u.test(request.url())) detailReads.push(request.url());
  });
  for (const key of ["missing-public-key", '<script>alert("route")</script>']) {
    await page.goto(`/#/operations?instance=${encodeURIComponent(key)}&view=history`);
    await expect(page.getByRole("alert")).toContainText("Process instance unavailable");
    await expect(page.getByRole("button", { name: "Download execution history" })).toHaveCount(0);
    await page.getByRole("button", { name: "Back to Process instances" }).click();
    await page.goto(`/#/operations?tab=incidents&incident=${encodeURIComponent(key)}&view=overview`);
    await expect(page.getByRole("alert")).toContainText("Incident unavailable");
    await expect(page.getByRole("button", { name: "Retry", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cancel Process", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Back to incidents", exact: true }).click();
  }
  expect(detailReads).toEqual([]);
  expect(capture.actions).toEqual([]);
});

test("an uncertain incident retains its exact action across route views and Operations tabs", async ({ page }) => {
  const capture = await installOperationsApiFixtures(page, { actions: FixtureIncidentActionState.RetryResponseLoss });
  await page.goto("/#/operations?tab=incidents");
  await page.getByRole("button", {
    name: `View incident ${operationsFixtureLabels.process} ${operationsFixtureLabels.element} activation 1 generation 1`, exact: true,
  }).click();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  const retry = page.getByRole("button", { name: "Submit Retry again", exact: true });
  await expect(retry).toBeVisible();
  await page.goBack();
  await expect(retry).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to incidents", exact: true })).toBeDisabled();
  const tabs = page.getByRole("tablist", { name: "Operations", exact: true });
  await tabs.getByRole("tab", { name: "Audit", exact: true }).click();
  await tabs.getByRole("tab", { name: "Incidents", exact: true }).click();
  await expect(retry).toBeVisible();
  await retry.click();
  await expect(page.getByRole("status").filter({ hasText: "Retry outcome is indeterminate." })).toBeVisible();
  expect(capture.actions).toHaveLength(2);
  expect(capture.actions[1]).toEqual(capture.actions[0]);
});

function incidentUrl(view: "overview" | "diagram"): string {
  const key = JSON.stringify([
    operationsFixtureLabels.process, operationsFixtureLabels.process,
    operationsFixtureLabels.element, 1, 1,
  ]);
  return `/#/operations?tab=incidents&incident=${encodeURIComponent(JSON.stringify(key))}&view=${view}`;
}
