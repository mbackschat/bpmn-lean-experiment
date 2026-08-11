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
  await expect(page.getByRole("heading", { name: "Definition workspace" })).toBeVisible();

  await deploy(page, processId, versionOneSource);
  await expect(page.locator(".result.accepted")).toContainText(`${processId}, version 1`);
  await deploy(page, processId, versionTwoSource);
  await expect(page.getByRole("button", { name: new RegExp(processId, "u") })).toContainText(
    "Latest version 2",
  );
  await expect(page.locator(".result.accepted")).toContainText(`${processId}, version 2`);

  await page.locator(".versions button", { hasText: "1" }).click();
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
  const result = publication.locator(".message-publication-result");
  await expect(result).toContainText("Publication accepted");
  await publication.getByRole("button", { name: "Refresh publication" }).click();
  await expect(result).toContainText("Publication accepted");
  await expect(result).toContainText(publicationId);
  await expect(result).toContainText(`${processId}, version 1`);
  await expect(result.getByText(/^[0-9a-f]{8}-[0-9a-f-]{27}$/u)).toBeVisible();
  await expect(result).not.toContainText("version 2");
  await expect(result).not.toContainText(/workflow|run id|task queue|memo|command|checked|program/iu);
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
