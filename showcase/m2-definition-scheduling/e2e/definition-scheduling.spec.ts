import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

const profileId = "bpmn-2.0.2";
const templateUrl = new URL(
  "../../../scenarios/timer-start-event/process.bpmn",
  import.meta.url,
);

/**
 * An occurrence counts from the version's engine registration, so it must outlast the UI steps that run before the
 * later version is deployed; the template's Start Event ID keeps its original spelling.
 */
const timerDuration = { iso: "PT8S", ms: 8_000 } as const;

test("schedules a listed occurrence, sees it refused once version 2 supersedes it, and starts version 2's occurrence", async ({ page }) => {
  const token = `${Date.now()}_${process.pid}`;
  const processId = `Process_Timer_Browser_${token}`;
  const versionOneTaskName = `Review scheduled version 1 ${token}`;
  const versionTwoTaskName = `Review later version 2 ${token}`;
  const versionOneSource = await sourceRevision(processId, versionOneTaskName, "one");
  const versionTwoSource = await sourceRevision(processId, versionTwoTaskName, "two");

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
  await page.getByRole("button", { name: "Show Triggers", exact: true }).click();
  const schedules = page.getByRole("region", { name: "Definition schedules" });
  await expect(schedules.getByLabel("Published Timer Start capabilities")).toContainText(
    "TimerStart_PT1S",
  );
  await expect(schedules.getByLabel("Published Timer Start capabilities")).toContainText(
    `${timerDuration.ms} ms`,
  );

  const scheduleOneId = await schedules.getByRole("textbox", { name: "Schedule ID" }).inputValue();
  expect(scheduleOneId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
  );
  const dueAtOne = await selectOnlyOccurrence(schedules);
  expect(Date.parse(dueAtOne)).toBeGreaterThan(Date.now());
  await expect(schedules.getByRole("textbox", { name: "Activation instant" })).toHaveCount(0);
  await schedules.getByRole("button", { name: "Create schedule" }).click();
  const scheduleOne = scheduleItem(schedules, scheduleOneId);
  await expect(scheduleOne).toContainText("scheduled");
  await expect(scheduleOne.getByText("Due", { exact: true })).toBeVisible();
  await expect(scheduleOne.getByText(dueAtOne, { exact: true })).toBeVisible();
  await expect(scheduleOne).not.toContainText("Activation");

  await deploy(page, processId, versionTwoSource);
  const versionSelect = page.getByRole("combobox", { name: "Version" });
  await expect(versionSelect).toHaveValue("2");
  await expect(versionSelect.getByRole("option")).toHaveCount(2);
  expect(Date.now()).toBeLessThan(Date.parse(dueAtOne));
  await expect(page.getByRole("button", { name: "Hide Triggers", exact: true })).toHaveAttribute("aria-expanded", "true");
  await expect(schedules).toContainText(`Every schedule remains bound to ${processId}, version 2.`);
  await expect(scheduleOne).toHaveCount(0);

  const scheduleTwoId = await schedules.getByRole("textbox", { name: "Schedule ID" }).inputValue();
  expect(scheduleTwoId).not.toBe(scheduleOneId);
  const radios = schedules.getByRole("group", { name: "Occurrence" }).getByRole("radio");
  // The picker keeps version 1's listing until version 2's own occurrences replace it.
  await expect.poll(() => radios.first().getAttribute("value"), {
    message: "the picker should list version 2's own occurrence",
  }).not.toBe(dueAtOne);
  const dueAtTwo = await selectOnlyOccurrence(schedules);
  expect(Date.parse(dueAtTwo)).toBeGreaterThan(Date.parse(dueAtOne));
  await schedules.getByRole("button", { name: "Create schedule" }).click();
  const scheduleTwo = scheduleItem(schedules, scheduleTwoId);
  await expect(scheduleTwo).toContainText("scheduled");
  await expect(scheduleTwo.getByText(dueAtTwo, { exact: true })).toBeVisible();

  await versionSelect.selectOption("1");
  await expect(schedules).toContainText(`Every schedule remains bound to ${processId}, version 1.`);
  await pollUntilStatus(scheduleOne, "refused");
  await expect(scheduleOne.getByText("Engine refusal", { exact: true })).toBeVisible();
  await expect(scheduleOne).toContainText("timer-start-superseded");
  await expect(scheduleOne).not.toContainText("Process instance");

  await versionSelect.selectOption("2");
  await expect(schedules).toContainText(`Every schedule remains bound to ${processId}, version 2.`);
  await pollUntilStatus(scheduleTwo, "started");
  await expect(scheduleTwo.getByText("Process instance", { exact: true })).toBeVisible();
  await expect(scheduleTwo).toContainText(`${processId}, version 2`);
  await expect(scheduleTwo).toContainText("timer:");
  await expect(scheduleTwo).not.toContainText("version 1");
});

/** The picker's one listed occurrence: selected, and returned as the canonical instant its radio carries. */
async function selectOnlyOccurrence(schedules: Locator): Promise<string> {
  const picker = schedules.getByRole("group", { name: "Occurrence" });
  const radios = picker.getByRole("radio");
  await expect(radios).toHaveCount(1);
  const dueAt = await radios.first().getAttribute("value");
  if (dueAt === null) {
    throw new TypeError("the occurrence radio must carry its due instant as its value");
  }
  await picker.getByRole("radio", { name: dueAt }).check();
  await expect(picker.getByRole("radio", { name: dueAt })).toBeChecked();
  return dueAt;
}

function scheduleItem(schedules: Locator, scheduleId: string): Locator {
  return schedules.getByRole("list", { name: "Definition schedules" })
    .getByRole("listitem")
    .filter({ hasText: scheduleId });
}

async function pollUntilStatus(schedule: Locator, status: string): Promise<void> {
  // The list reloads when the version changes, and a click inside the poll would wait for an item that is not there yet.
  await expect(schedule).toBeVisible();
  await expect.poll(
    async () => {
      await schedule.getByRole("button", { name: /^(?:Refresh|Working…)$/u }).click();
      return await schedule.getByText(status, { exact: true }).isVisible();
    },
    {
      message: `the schedule should publish its ${status} status`,
      timeout: 20_000,
      intervals: [250, 500, 1_000],
    },
  ).toBe(true);
}

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
    .getByRole("link", { name: "Definitions", exact: true })
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
    .replace(">PT1S<", `>${timerDuration.iso}<`)
    .replace(
      "https://bpmn-lean.local/tests/timer-start",
      `https://third-party.invalid/${processId}/${revision}`,
    );
}
