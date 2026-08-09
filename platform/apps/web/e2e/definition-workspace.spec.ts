import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

const profileId = "bpmn-2.0.2-user-task-preserved-notation-draft";
const templateUrl = new URL(
  "../../../../scenarios/user-task-preserved-notation/process.bpmn",
  import.meta.url,
);

test("deploys, versions, renders, and rejects a runtime-created third-party definition", async ({ page }) => {
  const token = `${Date.now()}_${process.pid}`;
  const processId = `Process_Browser_${token}`;
  const firstTaskName = `Review browser upload ${token}`;
  const secondTaskName = `Review browser revision ${token}`;
  const firstSource = await sourceRevision(processId, firstTaskName, "one");
  const secondSource = await sourceRevision(processId, secondTaskName, "two");

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Definition workspace" })).toBeVisible();

  await deploy(page, processId, firstSource);
  await expect(page.getByText("Admitted and deployed")).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(processId, "u") })).toContainText("Latest version 1");
  const diagram = page.locator(".diagram-canvas svg[data-element-id]");
  await expect(diagram).toContainText(diagramText(firstTaskName));
  const attribution = page.locator("a.bjs-powered-by");
  await expect(attribution).toBeVisible();
  await expect(attribution).toHaveAttribute("href", /bpmn\.io/u);

  await deploy(page, processId, secondSource);
  await expect(page.getByRole("button", { name: new RegExp(processId, "u") })).toContainText("Latest version 2");
  await expect(page.locator(".versions button")).toHaveCount(2);
  await expect(diagram).toContainText(diagramText(secondTaskName));

  const rejectedSource = secondSource.replaceAll("bpmn:userTask", "bpmn:scriptTask");
  await deploy(page, processId, rejectedSource);
  await expect(page.getByText("Not deployed")).toBeVisible();
  await expect(page.getByText(/Element UserTask_Approve/u)).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(processId, "u") })).toContainText("Latest version 2");
});

function diagramText(value: string): RegExp {
  return new RegExp(value.replaceAll(" ", "\\s*"), "u");
}

async function deploy(
  page: import("@playwright/test").Page,
  processId: string,
  source: string,
): Promise<void> {
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
    .replaceAll("Definitions_SequentialUserTask", `Definitions_${processId}`)
    .replaceAll("Process_SequentialUserTask", processId)
    .replace('name="Sequential user task"', `name="Browser definition ${revision}"`)
    .replace('name="Approve"', `name="${taskName}"`)
    .replace(
      "https://bpmn-lean.local/scenarios/sequential-user-task",
      `https://third-party.invalid/${processId}/${revision}`,
    );
}
