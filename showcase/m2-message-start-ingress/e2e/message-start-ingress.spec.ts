import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const profileId = "bpmn-2.0.2-message-start-event-draft";
const templateUrl = new URL(
  "../../../scenarios/message-start-event/process.bpmn",
  import.meta.url,
);

test("publishes the exact version-1 Message Start capability after version 2 exists", async ({ page }) => {
  const token = `${Date.now()}_${process.pid}`;
  const processId = `Process_MessageStart_Browser_${token}`;
  const versionOneOperation = `Operation_ReceiveApprovalRequest_V1_${token}`;
  const versionTwoOperation = `Operation_ReceiveApprovalRequest_V2_${token}`;
  const versionOneSource = await sourceRevision(
    processId,
    versionOneOperation,
    `Review Message Start version 1 ${token}`,
    "one",
  );
  const versionTwoSource = await sourceRevision(
    processId,
    versionTwoOperation,
    `Review Message Start version 2 ${token}`,
    "two",
  );

  await page.goto("/", { timeout: 10_000 });
  await openDefinitions(page);

  await deploy(page, processId, versionOneSource);
  await expect(page.getByRole("combobox", { name: "Definition" })).toHaveValue(processId);
  await expect(page.getByRole("combobox", { name: "Version" })).toHaveValue("1");
  await expect(page.getByText("Generated layout", { exact: true })).toBeVisible();
  await expect(page.getByLabel(`BPMN diagram for ${processId}, version 1`)).toBeVisible();
  await deploy(page, processId, versionTwoSource);
  const versionSelect = page.getByRole("combobox", { name: "Version" });
  await expect(versionSelect).toHaveValue("2");
  await expect(versionSelect.getByRole("option")).toHaveCount(2);

  await versionSelect.selectOption("1");
  await page.getByRole("tab", { name: "Triggers" }).click();
  const publication = page.getByRole("region", { name: "Message Start publication" });
  await expect(publication).toContainText(`${processId}, version 1`);
  const capabilities = publication.getByLabel("Published Message Start capabilities");
  await expect(capabilities).toContainText("MessageStart_ApprovalRequest");
  await expect(capabilities).toContainText("Message_ApprovalRequest");
  await expect(capabilities).toContainText("Interface_ProcessMessages");
  await expect(capabilities).toContainText(versionOneOperation);
  await expect(capabilities).not.toContainText(versionTwoOperation);

  const publicationId = await publication
    .getByRole("textbox", { name: "Publication ID" })
    .inputValue();
  expect(publicationId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
  );
  await publication.getByRole("button", { name: "Publish Message Start" }).click();
  await expect(publication.getByText("Publication accepted")).toBeVisible();
  await publication.getByRole("button", { name: "Refresh publication" }).click();
  await expect(publication.getByText("Publication accepted")).toBeVisible();
  await expect(publication.getByText(publicationId, { exact: true })).toBeVisible();
  await expect(publication.getByText(`${processId}, version 1`, { exact: true })).toBeVisible();
  const processInstance = publication.getByText(
    /^bpmn-platform-message-start-instance-sha256:[0-9a-f]{64}$/u,
  );
  await expect(processInstance).toBeVisible();
  const processInstanceId = requireDistinctProcessInstance(
    await processInstance.textContent(),
    publicationId,
  );
  expect(processInstanceId).toMatch(
    /^bpmn-platform-message-start-instance-sha256:[0-9a-f]{64}$/u,
  );
  expect(() => requireDistinctProcessInstance(publicationId, publicationId)).toThrow(
    /must differ from the publication identity/u,
  );
  await expect(publication).not.toContainText("version 2");
  await expect(publication).not.toContainText(/workflow|run id|task queue|memo|command|checked|program/iu);
});

function requireDistinctProcessInstance(
  rendered: string | null,
  publicationId: string,
): string {
  if (rendered === null || rendered.length === 0) {
    throw new TypeError("accepted publication must render a Process instance identity");
  }
  if (rendered === publicationId) {
    throw new TypeError("Process instance identity must differ from the publication identity");
  }
  return rendered;
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
    .getByRole("button", { name: "Definitions", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Definitions", level: 1 })).toBeVisible();
}

async function sourceRevision(
  processId: string,
  operationId: string,
  taskName: string,
  revision: string,
): Promise<string> {
  const template = await readFile(templateUrl, "utf8");
  return template
    .replaceAll("Definitions_MessageStart", `Definitions_${processId}`)
    .replaceAll("Process_MessageStart", processId)
    .replaceAll("Operation_ReceiveApprovalRequest", operationId)
    .replace('name="Message start then user task"', `name="Browser Message Start ${revision}"`)
    .replace('name="Approve"', `name="${taskName}"`)
    .replace(
      "https://bpmn-lean.local/tests/message-start",
      `https://third-party.invalid/${processId}/${revision}`,
    );
}
