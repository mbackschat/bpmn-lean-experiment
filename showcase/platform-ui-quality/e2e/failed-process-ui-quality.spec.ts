import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import {
  FailedProcessFixtureStatus,
  failedProcessExportBytes,
  failedProcessLabels,
  installFailedProcessFixtures,
} from "./failed-process-fixtures.ts";
import { horizontalOverflowFindings } from "./geometry.ts";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("failed Overview preserves literal failure and all complete occurrence identities @responsive", async ({ page }) => {
  const selection = await openDetail(page);
  await expect(page.getByRole("heading", {
    name: `Process instance ${failedProcessLabels.processInstanceId}`,
  })).toBeFocused();
  const detail = page.locator('[data-ui="process-execution-detail"]');
  const failure = page.getByRole("region", { name: "Compensation failure", exact: true });
  await expect(failure).toBeVisible();
  expect(await fact(detail, "Current status").textContent()).toBe("failed");
  expect(await fact(failure, "Code").textContent()).toBe(failedProcessLabels.code);
  expect(await fact(failure, "Message").textContent()).toBe(failedProcessLabels.message);
  for (const [role, activation] of [["Trigger", 17], ["Handler", 18], ["Effect", 19]] as const) {
    const occurrence = failure.getByRole("region", { name: `${role} occurrence`, exact: true });
    expect(await fact(occurrence, "Process-instance ID").textContent()).toBe(failedProcessLabels.processInstanceId);
    expect(await fact(occurrence, "Element ID").textContent()).toBe(failedProcessLabels.elementId);
    expect(await fact(occurrence, "Activation").textContent()).toBe(String(activation));
  }
  await expect(failure.locator("img, script")).toHaveCount(0);
  expect(await page.locator("body").getAttribute("data-injected")).toBeNull();
  await expect(detail.getByRole("button", { name: /retry|cancel|recover|repair/iu })).toHaveCount(0);
  await noOverflow(page, detail);
  expect(await horizontalOverflowFindings(failure.locator("section, dl, dd"))).toEqual([]);

  const back = detail.getByRole("button", { name: "Back to Process instances" });
  await back.focus();
  await page.keyboard.press("Enter");
  await expect(selection).toBeFocused();
});

for (const [label, message] of [["absent", null], ["empty", ""]] as const) {
  test(`failed Overview keeps ${label} message distinct`, async ({ page }) => {
    await openDetail(page, message);
    const failure = page.getByRole("region", { name: "Compensation failure", exact: true });
    await expect(failure).toBeVisible();
    expect(await fact(failure, "Message").textContent()).toBe(message === null ? "Absent (null)" : "");
    await exactDownload(page, message);
  });
}

test("failed History stays readable with exact export and independent unavailable Diagram @responsive", async ({ page }) => {
  await openDetail(page);
  await exactDownload(page, failedProcessLabels.message);
  const overview = page.getByRole("tab", { name: "Overview", exact: true });
  await overview.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "History", exact: true })).toBeFocused();
  const history = page.locator('[data-ui="execution-history"]');
  await expect(history).toBeVisible();
  expect(await history.locator("[data-revision]").evaluateAll((rows) =>
    rows.map((row) => row.getAttribute("data-revision"))
  )).toEqual(["1", "2"]);
  const effect = history.locator('[data-revision="2"]');
  await expect(effect).toContainText("completeEffect");
  await expect(effect).toContainText(`${failedProcessLabels.processInstanceId} / ${failedProcessLabels.elementId} / activation 19`);
  await effect.getByRole("button", { name: "Show Exact stimulus values", exact: true }).click();
  await expect(effect.getByRole("button", { name: "Hide Exact stimulus values", exact: true })).toHaveAttribute("aria-expanded", "true");
  const stimulus = JSON.parse(await effect.locator("pre").innerText()) as { result: { message: string; code: string } };
  expect(stimulus.result).toMatchObject({ code: failedProcessLabels.code, message: failedProcessLabels.message });
  await noOverflow(page, history);
  expect(await horizontalOverflowFindings(history.locator("li, dl, dd, pre"))).toEqual([]);

  await page.getByRole("tab", { name: "Diagram", exact: true }).click();
  const diagram = page.locator('[data-ui="execution-diagram"]');
  await expect(diagram.getByRole("alert")).toContainText("Diagram view is unavailable:");
  await expect(diagram.locator(".bpmn-platform-current")).toHaveCount(0);
  await expect(diagram.getByText("None.", { exact: true })).toHaveCount(3);
  await noOverflow(page, diagram);
  await page.getByRole("tab", { name: "Operator history", exact: true }).click();
  const audit = page.locator('[data-ui="operator-history"]');
  await expect(audit.getByRole("heading", { name: "Work actions (0)", exact: true })).toBeVisible();
  await expect(audit.getByRole("heading", { name: "Incident actions (0)", exact: true })).toBeVisible();
  await expect(audit.getByRole("alert")).toHaveCount(0);
});

for (const status of [FailedProcessFixtureStatus.Running, FailedProcessFixtureStatus.Completed, FailedProcessFixtureStatus.Cancelled]) {
  test(`${status} Overview retains its independent status and controls`, async ({ page }) => {
    await openDetail(page, null, status);
    const detail = page.locator('[data-ui="process-execution-detail"]');
    expect(await fact(detail, "Current status").textContent()).toBe(status);
    await expect(detail.getByRole("region", { name: "Compensation failure", exact: true })).toHaveCount(0);
    await expect(detail.getByRole("tab")).toHaveCount(4);
    await expect(detail.getByRole("button", { name: "Download execution history" })).toBeEnabled();
    await exactDownload(page, null, status);
  });
}

function fact(owner: Locator, label: string): Locator {
  return owner.locator("dt").filter({ hasText: new RegExp(`^${label}$`, "u") }).locator("+ dd");
}

async function openDetail(
  page: Page,
  message: string | null = failedProcessLabels.message,
  status = FailedProcessFixtureStatus.Failed,
) {
  await installFailedProcessFixtures(page, message, status);
  await page.goto("/");
  await page.getByRole("link", { name: "Operations", exact: true }).click();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const selection = page.getByRole("button", { name: `View details ${failedProcessLabels.processInstanceId}` });
  await selection.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-ui="execution-overview"]')).toBeVisible();
  return selection;
}

async function exactDownload(page: Page, message: string | null, status = FailedProcessFixtureStatus.Failed) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download execution history" }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe("execution-failed-process.json");
  const path = await download.path();
  expect(path).not.toBeNull();
  expect(await readFile(path!)).toEqual(Buffer.from(failedProcessExportBytes(message, status)));
}

async function noOverflow(page: Page, owner: Locator): Promise<void> {
  expect(await horizontalOverflowFindings(page.locator("html"))).toEqual([]);
  expect(await horizontalOverflowFindings(owner)).toEqual([]);
}
