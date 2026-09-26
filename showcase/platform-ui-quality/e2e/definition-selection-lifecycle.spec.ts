import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { installPublicApiFixtures } from "./fixtures.ts";

const definition = {
  processId: "Process_Responsive_Human_Work_Review", version: 7,
  source: { kind: "bpmnSource", id: "responsive-human-work-review.bpmn", sha256: "a".repeat(64), byteLength: 815, declaredEncoding: "UTF-8", decodedAs: "UTF-8" },
  semanticProfile: "user-task-assignment-form-metadata-v1",
  startCapabilities: { messageStarts: [], timerStarts: [] },
};

async function openDefinitions(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("button", { name: "Definitions", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Version", exact: true })).toHaveValue("7");
}

test("latest definition selection wins over delayed version requests", async ({ page }) => {
  await installPublicApiFixtures(page);
  const second = { ...definition, processId: "Process_Second" };
  const third = { ...definition, processId: "Process_Third" };
  await page.route("**/api/v1/definitions", (route) => route.fulfill({ json: { definitions: [definition, second, third] } }));
  const pending = Promise.withResolvers<void>();
  const requested = Promise.withResolvers<void>();
  await page.route("**/Process_Second/versions", async (route) => {
    requested.resolve();
    await pending.promise;
    await route.fulfill({ json: { processId: second.processId, versions: [second] } });
  });
  await page.route("**/Process_Third/versions", (route) => route.fulfill({ json: { processId: third.processId, versions: [third] } }));
  await openDefinitions(page);
  const selection = page.getByRole("combobox", { name: "Definition", exact: true });
  await selection.selectOption(second.processId);
  await requested.promise;
  await selection.selectOption(third.processId);
  await expect(selection).toHaveValue(third.processId);
  const response = page.waitForResponse("**/Process_Second/versions");
  pending.resolve();
  await response;
  await page.waitForLoadState("networkidle");
  await expect(selection).toHaveValue(third.processId);
});

test("start results stay with the exact version that was started", async ({ page }) => {
  await installPublicApiFixtures(page);
  const newer = { ...definition, version: 8 };
  await page.route("**/Process_Responsive_Human_Work_Review/versions", (route) => route.fulfill({ json: { processId: definition.processId, versions: [definition, newer] } }));
  const pending = Promise.withResolvers<void>();
  const requested = Promise.withResolvers<void>();
  await page.route("**/versions/7/start", async (route) => {
    requested.resolve();
    await pending.promise;
    await route.fulfill({ status: 201, json: { status: "started", instance: { processInstanceId: "instance-version-7", definition } } });
  });
  await page.goto("/");
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("button", { name: "Definitions", exact: true }).click();
  await page.getByRole("combobox", { name: "Version", exact: true }).selectOption("7");
  await page.getByRole("tab", { name: "Start", exact: true }).click();
  await page.getByRole("button", { name: "Start version 7" }).click();
  await requested.promise;
  await page.getByRole("combobox", { name: "Version", exact: true }).selectOption("8");
  await page.getByRole("tab", { name: "Start", exact: true }).click();
  const response = page.waitForResponse("**/versions/7/start");
  pending.resolve();
  await response;
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("started-instance-id")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start version 8" })).toBeEnabled();
});

test("deployment keeps its exact returned version when a newer version is listed", async ({ page }) => {
  await installPublicApiFixtures(page);
  const newer = { ...definition, version: 8 };
  await page.route("**/Process_Responsive_Human_Work_Review/versions", (route) => route.fulfill({ json: { processId: definition.processId, versions: [definition, newer] } }));
  await page.route("**/api/v1/definitions?*", (route) => route.fulfill({ status: 201, json: { status: "deployed", definition } }));
  await page.goto("/");
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("button", { name: "Definitions", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Version", exact: true })).toHaveValue("8");
  await page.getByText("Add BPMN definition", { exact: true }).click();
  await page.getByLabel("BPMN XML file").setInputFiles({ name: "review.bpmn", mimeType: "application/xml", buffer: Buffer.from("<definitions/>") });
  await page.getByLabel("Semantic profile ID").fill(definition.semanticProfile);
  await page.getByRole("button", { name: "Deploy definition", exact: true }).click();
  await expect(page.getByText("Admitted and deployed", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Version", exact: true })).toHaveValue("7");
});

test("failed next-version diagram never exposes the preceding diagram", async ({ page }) => {
  await installPublicApiFixtures(page);
  const older = { ...definition, version: 6 };
  await page.route("**/Process_Responsive_Human_Work_Review/versions", (route) => route.fulfill({ json: { processId: definition.processId, versions: [older, definition] } }));
  await page.route("**/versions/6/presentation", (route) => route.fulfill({ status: 404, json: { error: { code: "notFound", message: "No diagram presentation is available." } } }));
  await openDefinitions(page);
  await expect(page.locator(".djs-container")).toBeVisible();
  await page.getByRole("combobox", { name: "Version", exact: true }).selectOption("6");
  await expect(page.getByRole("alert")).toContainText("Diagram view is unavailable");
  await expect(page.locator(".djs-container")).not.toBeVisible();
});
