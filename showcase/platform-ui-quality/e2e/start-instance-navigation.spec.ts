import { expect, test } from "@playwright/test";

import {
  executionPublicationLabels,
  installExecutionPublicationFixtures,
} from "./execution-publication-fixtures.ts";

test("diagram leads to explicit start and its exact instance without a search @responsive", async ({ page }) => {
  await installExecutionPublicationFixtures(page);
  const definition = {
    processId: executionPublicationLabels.processId,
    version: 4,
    source: {
      kind: "bpmnSource",
      id: "enterprise-parallel-compliance-review-with-long-responsive-identifier.bpmn",
      sha256: "e".repeat(64),
      byteLength: 2_048,
      declaredEncoding: "UTF-8",
      decodedAs: "UTF-8",
    },
    semanticProfile: "cib-seven-2.2.0:committed-execution-publication-parallel-review",
    startCapabilities: { messageStarts: [], timerStarts: [] },
  } as const;
  const instance = {
    processInstanceId: executionPublicationLabels.processInstanceId,
    definition,
  } as const;
  const versionsPath = `/api/v1/definitions/${encodeURIComponent(definition.processId)}/versions`;
  const startPath = `${versionsPath}/${definition.version}/start`;
  await page.route("**/api/v1/definitions", (route) =>
    route.fulfill({ json: { definitions: [definition] } }));
  await page.route(`**${versionsPath}`, (route) =>
    route.fulfill({ json: { processId: definition.processId, versions: [definition] } }));
  await page.route(`**${startPath}`, (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({ initialVariables: [] });
    return route.fulfill({ status: 201, json: { status: "started", instance } });
  });
  const executionRequests: string[] = [];
  const searchRequests: string[] = [];
  const startRequests: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/execution")) executionRequests.push(path);
    if (path === "/api/v1/process-instances") searchRequests.push(path);
    if (path.endsWith("/start")) startRequests.push(path);
  });

  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "Primary navigation" });
  await navigation.getByRole("link", { name: "Definitions", exact: true }).click();
  const shortcut = page.getByRole("button", { name: "Start process", exact: true });
  await expect(shortcut).toBeInViewport();
  await shortcut.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Ready to start", exact: true })).toBeFocused();
  await expect(page).toHaveURL(/tab=start/);
  expect(startRequests).toEqual([]);
  await page.getByRole("button", { name: "Start version 4", exact: true }).click();
  await expect(page.getByTestId("started-instance-id")).toHaveText(instance.processInstanceId);
  await expect(page.getByText("What happens next", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open task inbox", exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: "Diagram", exact: true }).click();
  await page.getByRole("button", { name: "Start process", exact: true }).click();
  await expect(page.getByTestId("started-instance-id")).toHaveText(instance.processInstanceId);
  expect(startRequests).toHaveLength(1);

  const openInstance = page.getByRole("button", { name: "View instance in Operations", exact: true });
  await expect(openInstance).toBeVisible();
  await openInstance.focus();
  await page.keyboard.press("Enter");
  await expect(navigation.getByRole("link", { name: "Operations", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: `Process instance ${instance.processInstanceId}`, exact: true })).toBeFocused();
  const detail = page.locator('[data-ui="process-execution-detail"]');
  await expect(detail).toContainText(definition.processId);
  await expect(detail.getByRole("tab", { name: "Overview", exact: true })).toHaveAttribute("aria-selected", "true");
  expect(executionRequests).toEqual([
    `/api/v1/process-instances/${encodeURIComponent(instance.processInstanceId)}/execution`,
  ]);
  expect(searchRequests).toEqual([]);

  await detail.getByRole("button", { name: "Back to Process instances", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Process instances", exact: true })).toBeFocused();
  await expect(detail).toHaveCount(0);

  await page.getByRole("tab", { name: "Audit", exact: true }).click();
  await page.getByRole("tab", { name: "Process instances", exact: true }).click();
  await expect(page.getByRole("button", { name: "Search", exact: true })).toBeVisible();
  await expect(detail).toHaveCount(0);
  expect(executionRequests).toHaveLength(1);

  await navigation.getByRole("link", { name: "Definitions", exact: true }).click();
  await openInstance.click();
  await expect(page.getByRole("heading", { name: `Process instance ${instance.processInstanceId}`, exact: true })).toBeFocused();
  expect(executionRequests).toEqual([
    `/api/v1/process-instances/${encodeURIComponent(instance.processInstanceId)}/execution`,
    `/api/v1/process-instances/${encodeURIComponent(instance.processInstanceId)}/execution`,
  ]);
  expect(searchRequests).toEqual([]);
});
