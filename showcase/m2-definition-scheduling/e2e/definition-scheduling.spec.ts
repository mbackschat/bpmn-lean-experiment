import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const profileId = "bpmn-2.0.2-timer-start-event-draft";
const templateUrl = new URL(
  "../../../scenarios/timer-start-event/process.bpmn",
  import.meta.url,
);

test("schedules exact version 1 before publishing version 2 and displays the started binding", async ({ page }) => {
  const token = `${Date.now()}_${process.pid}`;
  const processId = `Process_Timer_Browser_${token}`;
  const versionOneTaskName = `Review scheduled version 1 ${token}`;
  const versionTwoTaskName = `Review later version 2 ${token}`;
  const versionOneSource = await sourceRevision(processId, versionOneTaskName, "one");
  const versionTwoSource = await sourceRevision(processId, versionTwoTaskName, "two");
  const activationAt = nextWholeSecond(8);
  const dueAt = new Date(Date.parse(activationAt) + 1_000).toISOString();

  await page.goto("/", { timeout: 10_000 });
  await expect(page.getByRole("heading", { name: "Definition workspace" })).toBeVisible();

  await deploy(page, processId, versionOneSource);
  await expect(page.getByText("Admitted and deployed")).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(processId, "u") })).toContainText(
    "Latest version 1",
  );
  await expect(page.locator(".result.accepted")).toContainText(`${processId}, version 1`);
  await expect(page.locator(".diagram-canvas svg[data-element-id]")).toBeVisible();
  await expect(page.locator("a.bjs-powered-by")).toBeVisible();
  const schedules = page.getByRole("region", { name: "Definition schedules" });
  await expect(schedules.getByLabel("Published Timer Start capabilities")).toContainText(
    "TimerStart_PT1S",
  );
  await expect(schedules.getByLabel("Published Timer Start capabilities")).toContainText("1000 ms");

  const scheduleId = await schedules.getByRole("textbox", { name: "Schedule ID" }).inputValue();
  expect(scheduleId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
  );
  await schedules.getByRole("textbox", { name: "Activation instant" }).fill(activationAt);
  await schedules.getByRole("button", { name: "Create schedule" }).click();
  const schedule = schedules.getByRole("listitem").filter({ hasText: scheduleId });
  await expect(schedule).toContainText("scheduled");
  await expect(schedule.getByText(activationAt, { exact: true })).toBeVisible();
  await expect(schedule.getByText(dueAt, { exact: true })).toBeVisible();

  await deploy(page, processId, versionTwoSource);
  await expect(page.getByRole("button", { name: new RegExp(processId, "u") })).toContainText(
    "Latest version 2",
  );
  await expect(page.locator(".result.accepted")).toContainText(`${processId}, version 2`);
  await expect(page.locator(".versions button")).toHaveCount(2);
  expect(Date.now()).toBeLessThan(Date.parse(dueAt));
  await page.locator(".versions button", { hasText: "1" }).click();
  await expect(schedules).toContainText(`Every schedule remains bound to ${processId}, version 1.`);

  await expect.poll(
    async () => {
      await schedule.getByRole("button", { name: /^(?:Refresh|Working…)$/u }).click();
      return await schedule.locator("strong").textContent();
    },
    {
      message: "exact-version schedule should publish its started Process instance",
      timeout: 15_000,
      intervals: [250, 500, 1_000],
    },
  ).toBe("started");
  await expect(schedule).toContainText(`${processId}, version 1`);
  await expect(schedule).not.toContainText("version 2");
});

async function deploy(page: Page, processId: string, source: string): Promise<void> {
  await page.locator('input[name="source"]').setInputFiles({
    name: `${processId}.bpmn`,
    mimeType: "application/bpmn+xml",
    buffer: Buffer.from(source, "utf8"),
  });
  await page.locator('input[name="semanticProfile"]').fill(profileId);
  await page.getByRole("button", { name: "Deploy definition" }).click();
}

async function sourceRevision(
  processId: string,
  taskName: string,
  revision: string,
): Promise<string> {
  const template = await readFile(templateUrl, "utf8");
  return template
    .replaceAll("Definitions_TimerStart", `Definitions_${processId}`)
    .replaceAll("Process_TimerStart", processId)
    .replace('name="Timer start then user task"', `name="Browser timer definition ${revision}"`)
    .replace('name="Review"', `name="${taskName}"`)
    .replace(
      "https://bpmn-lean.local/tests/timer-start",
      `https://third-party.invalid/${processId}/${revision}`,
    );
}

function nextWholeSecond(secondsFromNow: number): string {
  const wholeSecond = Math.ceil(Date.now() / 1_000) * 1_000;
  return new Date(wholeSecond + secondsFromNow * 1_000).toISOString();
}
