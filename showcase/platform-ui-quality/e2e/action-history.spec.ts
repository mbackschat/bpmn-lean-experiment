import { expect, test } from "@playwright/test";
import type { Page, Route } from "@playwright/test";
import { installPublicApiFixtures } from "./fixtures.ts";
import { horizontalOverflowFindings } from "./geometry.ts";

const instance = "9f612faf-2334-4f15-a800-4699c5d17e71";
const work = [
  { eventId: "5d81888f-6b76-411f-ac0b-ebfe37a53da9", actorId: "demo-user", recordedAt: "2026-09-28T10:00:00.000Z", hostingProcessInstanceId: instance,
    taskId: { processInstanceId: instance, elementId: "Approve", activation: 1 },
    action: { kind: "claim", actionId: "782efb08-d718-4f50-a1a7-24e98884171d", outcome: "claimed" } },
  { eventId: "work-2", actorId: "demo-user", recordedAt: "2026-09-28T09:00:00.000Z", hostingProcessInstanceId: instance,
    taskId: { processInstanceId: instance, elementId: "Approve", activation: 1 },
    action: { kind: "completion", actionId: "complete-1", outcome: "committed" } },
];
const incidents = [{ eventId: "incident-1", actorId: "operator", recordedAt: "2026-09-28T09:30:00.000Z", hostingProcessInstanceId: "service-instance-002",
  incidentId: { effectId: { processInstanceId: "service-instance-002", elementId: "RecordOrder", activation: 1 }, generation: 1 },
  actionId: "retry-1", actionKind: "retryIncident", outcome: "committed" }];

async function fixtures(page: Page, options: { empty?: boolean; failWork?: boolean } = {}) {
  await installPublicApiFixtures(page);
  const requests: URL[] = [];
  await page.route("**/api/v1/*-audit?**", async (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    const task = url.pathname.endsWith("work-audit");
    if (task && options.failWork) return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "internalFailure", message: "History temporarily unavailable." } }) });
    const selected = url.searchParams.get("hostingProcessInstanceId");
    const rows = (task ? work : incidents).filter((row) => !selected || row.hostingProcessInstanceId === selected);
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({
      events: options.empty ? [] : task ? (url.searchParams.has("cursor") ? rows.slice(1) : rows.slice(0, 1)) : rows,
      nextCursor: !options.empty && task && rows.length > 1 && !url.searchParams.has("cursor") ? "v1.MQ" : null,
    }) });
  });
  return requests;
}

test("Action history includes task and incident actions with independent paging and process links @responsive", async ({ page }) => {
  const requests = await fixtures(page);
  await page.goto("/#/operations?tab=audit&view=overview");
  await expect(page.getByRole("tab", { name: "Action history", exact: true })).toHaveAttribute("aria-selected", "true");
  const history = page.getByRole("region", { name: "Action history", exact: true });
  await expect(history.getByRole("table", { name: "Your task actions" })).toContainText("Claim task");
  await expect(history.getByRole("table", { name: "Incident actions" })).toContainText("Retry service");
  await history.getByRole("button", { name: "Load more task actions" }).click();
  const tasks = history.getByRole("table", { name: "Your task actions" });
  await expect(tasks).toContainText("Complete task");
  expect(await tasks.locator("tbody tr").allTextContents()).toEqual([expect.stringContaining("Claim task"), expect.stringContaining("Complete task")]);
  expect(requests.filter((url) => url.searchParams.has("cursor")).map((url) => url.pathname)).toEqual(["/api/v1/work-audit"]);
  await expect(tasks.getByRole("link", { name: "View process", exact: true }).first()).toHaveAttribute("href", new RegExp(`instance=${instance}.*view=operator-history`));
  expect(await horizontalOverflowFindings(page.locator("html"))).toEqual([]);
  expect(await horizontalOverflowFindings(history)).toEqual([]);
  await history.screenshot({ path: test.info().outputPath("action-history.png") });
});

test("history filters survive reload and browser history without sharing cursors", async ({ page }) => {
  const requests = await fixtures(page);
  await page.goto("/#/operations?tab=audit");
  await page.getByLabel("Activity type", { exact: true }).selectOption("tasks");
  await page.getByLabel("Process instance ID", { exact: true }).fill(instance);
  await page.getByRole("button", { name: "Apply filters", exact: true }).click();
  await expect(page).toHaveURL(/auditType=tasks/);
  await expect(page.getByRole("table", { name: "Incident actions" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Process instance ID", { exact: true })).toHaveValue(instance);
  await expect(page.getByRole("table", { name: "Your task actions" })).toBeVisible();
  expect(requests.at(-1)?.searchParams.get("hostingProcessInstanceId")).toBe(instance);
  await page.goBack();
  await expect(page.getByRole("table", { name: "Incident actions" })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("table", { name: "Incident actions" })).toHaveCount(0);
});

test("unavailable task history is not an empty history and leaves incident history usable", async ({ page }) => {
  await fixtures(page, { failWork: true });
  await page.goto("/#/operations?tab=audit");
  await expect(page.getByRole("alert")).toContainText("Task history unavailable");
  await expect(page.getByRole("table", { name: "Incident actions" })).toBeVisible();
  await expect(page.getByText("No task actions match these filters.", { exact: true })).toHaveCount(0);
});

test("empty history explains which ordinary actions will appear", async ({ page }) => {
  await fixtures(page, { empty: true });
  await page.goto("/#/operations?tab=audit");
  await expect(page.getByText("No task actions match these filters.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open task inbox", exact: true })).toBeVisible();
  await expect(page.getByText("No incident actions match these filters.", { exact: true })).toBeVisible();
});

test("expanded action details use the record width without stretching its summary @responsive", async ({ page }) => {
  await fixtures(page);
  await page.goto("/#/operations?tab=audit");
  for (const name of ["Your task actions", "Incident actions"]) {
    const table = page.getByRole("table", { name, exact: true });
    const row = table.locator("tbody tr").first();
    const before = (await row.boundingBox())!;
    const toggle = row.getByRole("button", { name: /^(Show|Hide) (Technical )?details$/i });
    await toggle.focus();
    await page.keyboard.press("Enter");
    const controls = await toggle.getAttribute("aria-controls");
    expect(controls).not.toBeNull();
    const details = page.locator(`[id="${controls}"]`);
    await expect(details).toBeVisible();
    const box = (await details.boundingBox())!;
    const tableBox = (await table.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(tableBox.width * 0.9);
    const expandedSummary = (await row.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(expandedSummary.y + expandedSummary.height - 1);
    expect((await row.boundingBox())!.height).toBeLessThanOrEqual(before.height + 1);
    await expect(details.getByText("Action ID", { exact: true })).toBeVisible();
    await expect(details.getByText("Event ID", { exact: true })).toBeVisible();
    await expect(details.locator("pre")).toBeHidden();
    await details.getByRole("button", { name: "Show raw record", exact: true }).click();
    await expect(details.locator("pre")).toContainText('"eventId"');
    await expect(details.locator("pre")).toBeVisible();
    expect((await row.boundingBox())!.height).toBeLessThanOrEqual(before.height + 1);
    expect(await horizontalOverflowFindings(details)).toEqual([]);
    await table.screenshot({ path: test.info().outputPath(`${name}-expanded.png`) });
    await toggle.focus();
    await page.keyboard.press("Space");
    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(details).toHaveCount(0);
    expect((await row.boundingBox())!.height).toBeLessThanOrEqual(before.height + 1);
  }
});

test("an obsolete history page cannot overwrite a new process filter", async ({ page }) => {
  await fixtures(page);
  const delayed = Promise.withResolvers<Route>();
  await page.route("**/api/v1/work-audit?**", async (route) => {
    if (!new URL(route.request().url()).searchParams.has("hostingProcessInstanceId")) {
      delayed.resolve(route);
      return;
    }
    return route.fallback();
  });
  await page.goto("/#/operations?tab=audit");
  const obsolete = await delayed.promise;
  await page.getByLabel("Process instance ID", { exact: true }).fill("no-matching-process");
  await page.getByRole("button", { name: "Apply filters", exact: true }).click();
  await expect(page.getByText("No task actions match these filters.", { exact: true })).toBeVisible();
  const response = page.waitForResponse((candidate) => candidate.request() === obsolete.request());
  await obsolete.fallback();
  await response;
  await expect(page.getByRole("table", { name: "Your task actions" })).toHaveCount(0);
  await expect(page.getByLabel("Process instance ID", { exact: true })).toHaveValue("no-matching-process");
});

test("repeated pages fail visibly and Refresh recovers without duplicating actions", async ({ page }) => {
  await fixtures(page);
  await page.route("**/api/v1/work-audit?**", async (route) => {
    if (!new URL(route.request().url()).searchParams.has("cursor")) return route.fallback();
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ events: work.slice(0, 1), nextCursor: "v1.MQ" }) });
  });
  await page.goto("/#/operations?tab=audit");
  await page.getByRole("button", { name: "Load more task actions" }).click();
  await expect(page.getByRole("alert")).toContainText("repeats a page or event");
  await expect(page.getByRole("table", { name: "Your task actions" }).locator("tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "Refresh history" }).click();
  await expect(page.getByRole("button", { name: "Load more task actions" })).toBeEnabled();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
