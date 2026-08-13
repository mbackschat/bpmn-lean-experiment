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
  await openDefinitions(page);

  await deploy(page, processId, versionOneSource);
  await expect(page.getByText("Admitted and deployed")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Definition" })).toHaveValue(processId);
  await expect(page.getByRole("combobox", { name: "Version" })).toHaveValue("1");
  await expect(page.getByText("Generated layout", { exact: true })).toBeVisible();
  const diagram = page.getByLabel(`BPMN diagram for ${processId}, version 1`);
  await expect(diagram).toBeVisible();
  await expect(diagram.getByRole("link", { name: "Powered by bpmn.io" })).toBeVisible();
  await page.getByRole("tab", { name: "Triggers" }).click();
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
  const versionSelect = page.getByRole("combobox", { name: "Version" });
  await expect(versionSelect).toHaveValue("2");
  await expect(versionSelect.getByRole("option")).toHaveCount(2);
  expect(Date.now()).toBeLessThan(Date.parse(dueAt));
  await versionSelect.selectOption("1");
  await page.getByRole("tab", { name: "Triggers" }).click();
  await expect(schedules).toContainText(`Every schedule remains bound to ${processId}, version 1.`);

  await expect.poll(
    async () => {
      await schedule.getByRole("button", { name: /^(?:Refresh|Working…)$/u }).click();
      return await schedule.getByText("started", { exact: true }).isVisible();
    },
    {
      message: "exact-version schedule should publish its started Process instance",
      timeout: 15_000,
      intervals: [250, 500, 1_000],
    },
  ).toBe(true);
  await expect(schedule).toContainText(`${processId}, version 1`);
  await expect(schedule).not.toContainText("version 2");
});

async function deploy(page: Page, processId: string, source: string): Promise<void> {
  const sourceInput = page.getByLabel("BPMN XML file");
  if (!await sourceInput.isVisible()) {
    await page.getByText("Add BPMN definition", { exact: true }).click();
  }
  await sourceInput.setInputFiles({
    name: `${processId}.bpmn`,
    mimeType: "application/bpmn+xml",
    buffer: Buffer.from(source, "utf8"),
  });
  await page.getByRole("textbox", { name: "Semantic profile ID" }).fill(profileId);
  await page.getByRole("button", { name: "Deploy definition" }).click();
}

async function openDefinitions(page: Page): Promise<void> {
  await page.getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: "Definitions", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Definitions", level: 1 })).toBeVisible();
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
