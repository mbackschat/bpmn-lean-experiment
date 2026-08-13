import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

const profileId = "bpmn-2.0.2-user-task-preserved-notation-draft";
const templateUrl = new URL(
  "../../../scenarios/user-task-preserved-notation/process.bpmn",
  import.meta.url,
);

test("deploys, versions, renders, starts, and rejects a runtime-created third-party definition", async ({ page }) => {
  const token = `${Date.now()}_${process.pid}`;
  const processId = `Process_Browser_${token}`;
  const firstTaskName = `Review browser upload ${token}`;
  const secondTaskName = `Review browser revision ${token}`;
  const firstSource = await sourceRevision(processId, firstTaskName, "one");
  const secondSource = await sourceRevision(processId, secondTaskName, "two");

  await page.goto("/");
  await openDefinitions(page);

  await deploy(page, processId, firstSource);
  await expect(page.getByText("Admitted and deployed")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Definition" })).toHaveValue(processId);
  await expect(page.getByRole("combobox", { name: "Version" })).toHaveValue("1");
  const diagram = page.getByLabel(`BPMN diagram for ${processId}, version 1`);
  await expect(page.getByText("Source layout", { exact: true })).toBeVisible();
  await expect(diagram.getByText(diagramText(firstTaskName))).toBeVisible();
  const attribution = diagram.getByRole("link", { name: "Powered by bpmn.io" });
  await expect(attribution).toHaveAttribute("href", /bpmn\.io/u);

  await deploy(page, processId, secondSource);
  const versionSelect = page.getByRole("combobox", { name: "Version" });
  await expect(versionSelect).toHaveValue("2");
  await expect(versionSelect.getByRole("option")).toHaveCount(2);
  const revisedDiagram = page.getByLabel(`BPMN diagram for ${processId}, version 2`);
  await expect(revisedDiagram.getByText(diagramText(secondTaskName))).toBeVisible();

  await versionSelect.selectOption("1");
  await page.getByRole("tab", { name: "Start" }).click();
  const startPanel = page.getByRole("region", { name: "Start this definition" });
  await page.getByRole("button", { name: "Start version 1" }).click();
  await expect(startPanel.getByText("Process instance started")).toBeVisible();
  await expect(startPanel.getByText(`${processId}, version 1`, { exact: true })).toBeVisible();
  await expect(startPanel.getByText(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
  )).toBeVisible();

  const rejectedSource = secondSource.replaceAll("bpmn:userTask", "bpmn:scriptTask");
  await deploy(page, processId, rejectedSource);
  await expect(page.getByText("Not deployed")).toBeVisible();
  await expect(page.getByText(/Element UserTask_Approve/u)).toBeVisible();
  await expect(versionSelect).toHaveValue("1");
  await versionSelect.selectOption("2");
  await expect(versionSelect).toHaveValue("2");
});

function diagramText(value: string): RegExp {
  return new RegExp(value.replaceAll(" ", "\\s*"), "u");
}

async function deploy(
  page: import("@playwright/test").Page,
  processId: string,
  source: string,
): Promise<void> {
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

async function openDefinitions(page: import("@playwright/test").Page): Promise<void> {
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
    .replaceAll("Definitions_SequentialUserTask", `Definitions_${processId}`)
    .replaceAll("Process_SequentialUserTask", processId)
    .replace('name="Sequential user task"', `name="Browser definition ${revision}"`)
    .replace('name="Approve"', `name="${taskName}"`)
    .replace(
      "https://bpmn-lean.local/scenarios/sequential-user-task",
      `https://third-party.invalid/${processId}/${revision}`,
    );
}
