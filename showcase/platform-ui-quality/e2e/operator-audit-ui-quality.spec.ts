import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import {
  assertOwnedActionsFit,
  horizontalOverflowFindings,
} from "./geometry.ts";
import {
  OperatorAuditExecutionState,
  OperatorAuditFixtureState,
  installOperatorAuditFixtures,
  operatorAuditExportBytes,
  operatorAuditLabels,
} from "./operator-audit-fixtures.ts";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("Operator history preserves two source-local arrays and downloads retained exact bytes", async ({ page }) => {
  const capture = await openProcessDetail(page);
  await selectOperatorHistoryWithKeyboard(page);
  const history = page.locator('[data-ui="operator-history"]');

  await expect(history.getByRole("heading", { name: "Work actions (2)" })).toBeVisible();
  await expect(history.getByRole("heading", { name: "Incident actions (2)" })).toBeVisible();
  await expect(history).toContainText(`Captured head ${operatorAuditLabels.workHeadEventId}`);
  await expect(history).toContainText(`Captured head ${operatorAuditLabels.incidentHeadEventId}`);

  const work = history.getByRole("table", { name: "Work actions" });
  const incidents = history.getByRole("table", { name: "Incident actions" });
  await expect(work.getByRole("row")).toHaveCount(3);
  await expect(incidents.getByRole("row")).toHaveCount(3);
  expect(await eventIds(work)).toEqual(operatorAuditLabels.workEventIds);
  expect(await eventIds(incidents)).toEqual(operatorAuditLabels.incidentEventIds);
  const [workBox, incidentBox] = await Promise.all([work.boundingBox(), incidents.boundingBox()]);
  expect(workBox).not.toBeNull();
  expect(incidentBox).not.toBeNull();
  if (workBox === null || incidentBox === null) throw new Error("operator audit table geometry is unavailable");
  expect(workBox.y + workBox.height, "Work rows must remain wholly before incident rows").toBeLessThanOrEqual(incidentBox.y);

  const downloadPromise = page.waitForEvent("download");
  const downloadButton = history.getByRole("button", { name: "Download operator audit" });
  await downloadButton.focus();
  await page.keyboard.press("Enter");
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(operatorAuditLabels.filename);
  const path = await download.path();
  if (path === null) throw new Error("operator audit download path is unavailable");
  expect(await readFile(path)).toEqual(Buffer.from(operatorAuditExportBytes()));

  const browserState = await publicBrowserState(page);
  expect(privateSurfaceFindings({ browserState, responses: capture.publicResponses })).toEqual([]);
});

test("execution unavailability leaves the independently usable operator audit", async ({ page }) => {
  await openProcessDetail(page, {
    execution: OperatorAuditExecutionState.Unavailable,
  });
  const detail = page.locator('[data-ui="process-execution-detail"]');
  const executionFailure = detail.getByRole("alert").filter({
    hasText: "Committed execution publication unavailable.",
  });
  await expect(executionFailure).toBeFocused();
  await expect(executionFailure).toContainText("Operator history remains available.");
  const tabs = detail.getByRole("tablist", { name: "Process instance detail" });
  await expect(tabs.getByRole("tab")).toHaveCount(1);
  await expect(tabs.getByRole("tab", { name: "Operator history" })).toHaveAttribute("aria-selected", "true");
  await expect(detail.getByRole("table", { name: "Work actions" })).toBeVisible();
  await expect(detail.getByRole("table", { name: "Incident actions" })).toBeVisible();
  await expect(detail.getByRole("button", { name: "Download operator audit" })).toBeVisible();
});

test("operator-audit unavailability leaves execution usable and focuses its own alert", async ({ page }) => {
  await openProcessDetail(page, {
    audit: OperatorAuditFixtureState.Unavailable,
  });
  await expect(page.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Download execution history" })).toBeVisible();
  await selectOperatorHistoryWithKeyboard(page);

  const failure = page.locator('[data-ui="operator-history"]').getByRole("alert");
  await expect(failure).toBeFocused();
  await expect(failure).toHaveText(
    "Operator audit unavailable. The complete operator audit is unavailable.",
  );
  await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download operator audit" })).toHaveCount(0);
});

test("a private host field is rejected without reaching browser-owned state", async ({ page }) => {
  await openProcessDetail(page, {
    audit: OperatorAuditFixtureState.PrivateHostField,
  });
  await selectOperatorHistoryWithKeyboard(page);

  const history = page.locator('[data-ui="operator-history"]');
  const failure = history.getByRole("alert");
  await expect(failure).toBeFocused();
  await expect(failure).toContainText("operator audit export is not the exact canonical representation");
  await expect(history.getByRole("table")).toHaveCount(0);
  await expect(history.getByRole("button", { name: "Download operator audit" })).toHaveCount(0);
  expect(privateSurfaceFindings(await publicBrowserState(page))).toEqual([]);
});

test("empty source streams remain independently disclosed", async ({ page }) => {
  await openProcessDetail(page, {
    audit: OperatorAuditFixtureState.Empty,
  });
  await selectOperatorHistoryWithKeyboard(page);
  const history = page.locator('[data-ui="operator-history"]');

  await expect(history.getByRole("heading", { name: "Work actions (0)" })).toBeVisible();
  await expect(history.getByRole("heading", { name: "Incident actions (0)" })).toBeVisible();
  await expect(history.getByText("Captured head: empty", { exact: true })).toHaveCount(2);
  await expect(history.getByText("No Work actions were captured through this empty head.", { exact: true })).toBeVisible();
  await expect(history.getByText("No incident actions were captured through this empty head.", { exact: true })).toBeVisible();
  await expect(history.getByRole("table")).toHaveCount(0);
  await expect(history.getByRole("button", { name: "Download operator audit" })).toBeVisible();
});

test("operator history contains every desktop-width owner and row @responsive", async ({ page }) => {
  await openProcessDetail(page);
  await page.getByRole("tab", { name: "Operator history" }).click();
  const detail = page.locator('[data-ui="process-execution-detail"]');
  const history = page.locator('[data-ui="operator-history"]');
  await expect(history.getByRole("table")).toHaveCount(2);

  await assertNoOverflow(page.locator("html"), "document");
  await assertNoOverflow(page.locator("main"), "workspace");
  await assertNoOverflow(detail, "Process detail");
  await assertNoOverflow(history, "Operator history section");
  const collections = history.locator('[data-ui="data-table-collection"]');
  for (let index = 0; index < await collections.count(); index += 1) {
    await assertNoOverflow(collections.nth(index), `operator audit collection ${index + 1}`);
  }
  const rows = history.locator("tbody tr");
  for (let index = 0; index < await rows.count(); index += 1) {
    await assertNoOverflow(rows.nth(index), `operator audit row ${index + 1}`);
  }
  await assertOwnedActionsFit(detail);
  await assertOwnedActionsFit(history);
});

async function openProcessDetail(
  page: Page,
  options: Parameters<typeof installOperatorAuditFixtures>[1] = {},
) {
  const capture = await installOperatorAuditFixtures(page, options);
  await page.goto("/");
  await page.getByRole("button", { name: "Operations", exact: true }).click();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("table", { name: "Confirmed Product 2 starts" })).toBeVisible();
  await page.getByRole("button", {
    name: `View details ${operatorAuditLabels.processInstanceId}`,
  }).click();
  await expect(page.locator('[data-ui="process-execution-detail"]')).toBeVisible();
  return capture;
}

async function selectOperatorHistoryWithKeyboard(page: Page): Promise<void> {
  const tab = page.getByRole("tab", { name: "Operator history" });
  await tab.focus();
  await page.keyboard.press("Enter");
  await expect(tab).toHaveAttribute("aria-selected", "true");
}

async function eventIds(table: Locator): Promise<string[]> {
  return table.locator("tbody tr td:first-child").allTextContents();
}

async function assertNoOverflow(locator: Locator, label: string): Promise<void> {
  expect(await horizontalOverflowFindings(locator), `${label} must not scroll horizontally`).toEqual([]);
}

async function publicBrowserState(page: Page): Promise<unknown> {
  return page.evaluate(() => ({
    dom: document.documentElement.outerHTML,
    history: { state: history.state, url: location.href },
    storage: {
      local: Object.fromEntries(Object.entries(localStorage)),
      session: Object.fromEntries(Object.entries(sessionStorage)),
    },
  }));
}

const forbiddenPrivateSurface = [
  /workflow[\s_-]*id/iu,
  /run[\s_-]*id/iu,
  /task[\s_-]*queue/iu,
  /database[\s_-]*(?:id|ordinal)/iu,
  /private[\s_-]*ordinal/iu,
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
    value.forEach((item, index) => { scan(item, `${path}[${index}]`, findings, seen); });
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    const child = `${path}.${key}`;
    if (forbiddenPrivateSurface.some((pattern) => pattern.test(key))) findings.push(child);
    scan(item, child, findings, seen);
  }
}
