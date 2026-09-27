import { expect, test } from "@playwright/test";
import type { Page, Route } from "@playwright/test";

import {
  FixtureIncidentActionState,
  installOperationsApiFixtures,
  operationsFixtureLabels,
} from "./operations-fixtures.ts";

test("pending incident Retry blocks Back until settlement", async ({ page }) => {
  await installOperationsApiFixtures(page);
  const request = Promise.withResolvers<Route>();
  await page.route("**/api/v1/incident-actions/**", (route) => {
    request.resolve(route);
  });
  await openPrimaryIncident(page);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  const route = await request.promise;
  const back = page.getByRole("button", { name: "Back to incidents", exact: true });
  await expect(back).toBeDisabled();
  await expect(page.getByText(
    "Resolve the pending or uncertain action before returning to incidents.",
    { exact: true },
  )).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeDisabled();

  const detailTabs = page.getByRole("tablist", { name: "Incident detail", exact: true });
  await detailTabs.getByRole("tab", { name: "Audit", exact: true }).click();
  await detailTabs.getByRole("tab", { name: "Overview", exact: true }).click();
  await expect(back).toBeDisabled();
  await expect(page.getByRole("status").filter({ hasText: "Retry pending." })).toBeVisible();

  await fulfillCommitted(route);
  await expect(page.getByRole("heading", { name: "Current incidents", exact: true })).toBeFocused();
  await incidentSelection(page, "secondary").click();
  await expect(page.getByRole("heading", {
    name: `Incident ${operationsFixtureLabels.secondElement}`, exact: true,
  })).toBeFocused();
});

test("uncertain incident Retry retains exact identity across detail and workspace navigation", async ({ page }) => {
  const capture = await installOperationsApiFixtures(page, {
    actions: FixtureIncidentActionState.RetryResponseLoss,
  });
  await openPrimaryIncident(page);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  const exactRetry = page.getByRole("button", { name: "Submit Retry again", exact: true });
  await expect(exactRetry).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to incidents", exact: true })).toBeDisabled();

  const detailTabs = page.getByRole("tablist", { name: "Incident detail", exact: true });
  await detailTabs.getByRole("tab", { name: "Audit", exact: true }).click();
  await detailTabs.getByRole("tab", { name: "Overview", exact: true }).click();
  await expect(exactRetry).toBeVisible();
  expect(capture.actions).toHaveLength(1);

  const operationsTabs = page.getByRole("tablist", { name: "Operations", exact: true });
  await operationsTabs.getByRole("tab", { name: "Audit", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Incident action audit", exact: true })).toBeVisible();
  await operationsTabs.getByRole("tab", { name: "Incidents", exact: true }).click();
  await expect(exactRetry).toBeVisible();
  await expect(page.getByRole("heading", {
    name: `Incident ${operationsFixtureLabels.element}`, exact: true,
  })).toBeVisible();
  await exactRetry.click();
  await expect(page.getByRole("status").filter({ hasText: "Retry outcome is indeterminate." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to incidents", exact: true })).toBeDisabled();

  const navigation = page.getByRole("navigation", { name: "Primary navigation" });
  await navigation.getByRole("link", { name: "Work", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Work", level: 1 })).toBeVisible();
  await navigation.getByRole("link", { name: "Operations", exact: true }).click();
  await expect(exactRetry).toBeVisible();
  await exactRetry.click();
  await expect(page.getByRole("heading", { name: "Current incidents", exact: true })).toBeFocused();
  expect(capture.actions).toHaveLength(3);
  expect(capture.actions[1]).toEqual(capture.actions[0]);
  expect(capture.actions[2]).toEqual(capture.actions[0]);
});

test("definite incident refusal releases the navigation guard", async ({ page }) => {
  await installOperationsApiFixtures(page);
  await openPrimaryIncident(page);
  await page.getByRole("button", { name: "Cancel Process", exact: true }).click();
  await page.getByRole("dialog", { name: "Cancel root Process?" })
    .getByRole("button", { name: "Cancel root Process", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Rejected, no longer current." })).toBeVisible();
  const back = page.getByRole("button", { name: "Return to Incidents", exact: true });
  await expect(back).toBeEnabled();
  await back.click();
  await expect(incidentSelection(page, "primary")).toBeFocused();
});

async function openPrimaryIncident(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: "Operations", exact: true }).click();
  await page.getByRole("tablist", { name: "Operations", exact: true })
    .getByRole("tab", { name: "Incidents", exact: true }).click();
  await incidentSelection(page, "primary").click();
  await expect(page.getByRole("heading", {
    name: `Incident ${operationsFixtureLabels.element}`, exact: true,
  })).toBeFocused();
}

function incidentSelection(page: Page, incident: "primary" | "secondary") {
  const process = incident === "primary"
    ? operationsFixtureLabels.process : operationsFixtureLabels.secondProcess;
  const element = incident === "primary"
    ? operationsFixtureLabels.element : operationsFixtureLabels.secondElement;
  return page.getByRole("button", {
    name: `View incident ${process} ${element} activation 1 generation 1`, exact: true,
  });
}

async function fulfillCommitted(route: Route): Promise<void> {
  const actionId = decodeURIComponent(new URL(route.request().url()).pathname
    .slice("/api/v1/incident-actions/".length));
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ state: "committed", actionId, interaction: route.request().postDataJSON() }),
  });
}
