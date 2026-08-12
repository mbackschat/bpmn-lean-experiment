import { expect, test } from "@playwright/test";

import {
  deployDefinition,
  readWorkAudit,
  startDefinition,
} from "../test/http-support.ts";
import {
  humanWorkSources,
  metadataProfile,
} from "../test/fixture.ts";

const apiOrigin = "http://127.0.0.1:3203";

test("claims and completes a Boolean task through the global Human Work panel", async ({ page }) => {
  const token = `${Date.now()}_${process.pid}`;
  const sources = await humanWorkSources(token);
  const definition = (await deployDefinition(apiOrigin, {
    bytes: sources.metadata,
    sourceId: `browser-human-work-${token}.bpmn`,
    semanticProfile: metadataProfile,
  })).value;
  const started = (await startDefinition(apiOrigin, definition)).value.instance;

  await page.goto("/", { timeout: 10_000 });
  const panel = page.getByRole("region", { name: "Human work" });
  await expect(panel).toBeVisible();
  const table = panel.getByRole("table", { name: "Current tasks" });
  const taskName = `Review request ${token}`;
  const row = table.getByRole("row").filter({ hasText: taskName });
  await expect(row).toHaveCount(1);
  await expect(row.locator("th, td")).toHaveCount(5);
  await expect(row).toContainText("reviewers");
  await expect(row).toContainText("Unclaimed");

  await row.getByRole("button", { name: "Claim", exact: true }).click();
  await expect(row).toContainText("Claimed by demo-user");
  await page.reload();
  const reloadedPanel = page.getByRole("region", { name: "Human work" });
  const reloadedRow = reloadedPanel
    .getByRole("table", { name: "Current tasks" })
    .getByRole("row")
    .filter({ hasText: taskName });
  await expect(reloadedRow).toContainText("Claimed by demo-user");

  await reloadedRow.getByRole("button", { name: taskName }).click();
  const trueChoice = reloadedPanel.getByRole("radio", { name: "True" });
  const falseChoice = reloadedPanel.getByRole("radio", { name: "False" });
  await expect(trueChoice).not.toBeChecked();
  await expect(falseChoice).not.toBeChecked();
  await trueChoice.press("Space");
  await expect(trueChoice).toBeChecked();
  await expect(falseChoice).not.toBeChecked();
  await reloadedPanel.getByRole("button", { name: "Complete task" }).click();
  await expect(reloadedPanel).toContainText("No current tasks.");
  await expect(reloadedPanel.getByRole("table", { name: "Current tasks" }))
    .toHaveCount(0);

  const audit = await readWorkAudit(apiOrigin);
  expect(audit.value.events.map(({ action }) => [action.kind, action.outcome]))
    .toEqual([
      ["claim", "claimed"],
      ["completion", "reserved"],
      ["completion", "committed"],
    ]);
  expect(audit.value.events.every(({ hostingProcessInstanceId, taskId }) =>
    hostingProcessInstanceId === started.processInstanceId &&
    taskId.processInstanceId === started.processInstanceId
  )).toBe(true);
  await expect(reloadedPanel).not.toContainText(
    /workflow(?: id)?|run id|task queue|schedule|history|locator|memo|intent sha/iu,
  );
});
