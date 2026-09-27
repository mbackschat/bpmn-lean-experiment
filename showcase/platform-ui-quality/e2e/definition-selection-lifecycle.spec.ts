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
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Definitions", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Version", exact: true })).toHaveValue("7");
}

test("Add BPMN uses a modal with explicit dismissal and focus return @responsive", async ({ page }) => {
  await installPublicApiFixtures(page);
  await openDefinitions(page);
  const add = page.getByRole("button", { name: "Add BPMN definition", exact: true });
  const selection = page.getByRole("region", { name: "Definition selection", exact: true });
  await expect(selection.getByRole("button", { name: "Add BPMN definition", exact: true })).toHaveCount(0);
  const alternative = page.getByRole("region", { name: "Add a new definition", exact: true });
  await expect(alternative.getByRole("button", { name: "Add BPMN definition", exact: true })).toBeVisible();
  const selectionBounds = (await selection.boundingBox())!;
  expect((await alternative.boundingBox())!.y - selectionBounds.y - selectionBounds.height).toBeGreaterThanOrEqual(16);
  const dialog = page.getByRole("dialog", { name: "Add BPMN definition", exact: true });
  await add.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("BPMN XML file")).toBeFocused();
  await dialog.getByRole("button", { name: "Deploy definition", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(dialog.getByLabel("BPMN XML file")).toBeFocused();
  const box = (await dialog.boundingBox())!;
  expect(box.width).toBeLessThan(page.viewportSize()!.width);
  expect(box.height).toBeLessThan(page.viewportSize()!.height);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(add).toBeFocused();
  await add.click();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(add).toBeFocused();
  await add.click();
  await page.mouse.click(5, 5);
  await expect(dialog).toHaveCount(0);
  await expect(add).toBeFocused();
});

test("deployment modal keeps errors and input visible and closes only after success", async ({ page }) => {
  await installPublicApiFixtures(page);
  const pending = Promise.withResolvers<void>();
  const requested = Promise.withResolvers<void>();
  let deployments = 0;
  await page.route("**/api/v1/definitions?*", async (route) => {
    deployments++;
    if (deployments === 1) {
      requested.resolve();
      await pending.promise;
      await route.fulfill({ status: 503, json: { error: { code: "internalFailure", message: "Deployment unavailable. Try again." } } });
    } else await route.fulfill({ status: 201, json: { status: "deployed", definition } });
  });
  await openDefinitions(page);
  const add = page.getByRole("button", { name: "Add BPMN definition", exact: true });
  await add.click();
  const dialog = page.getByRole("dialog", { name: "Add BPMN definition", exact: true });
  await dialog.getByLabel("BPMN XML file").setInputFiles({ name: "review.bpmn", mimeType: "application/xml", buffer: Buffer.from("<definitions/>") });
  await dialog.getByLabel("Semantic profile ID").fill(definition.semanticProfile);
  await dialog.getByRole("button", { name: "Deploy definition", exact: true }).click();
  await requested.promise;
  try {
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("status")).toContainText("Deploying");
  } finally { pending.resolve(); }
  await expect(dialog.getByRole("alert")).toContainText("Deployment unavailable");
  await expect(dialog.getByLabel("Semantic profile ID")).toHaveValue(definition.semanticProfile);
  await expect(dialog.getByLabel("BPMN XML file")).toHaveValue(/review.bpmn$/);
  await dialog.getByRole("button", { name: "Deploy definition", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("Admitted and deployed", { exact: true })).toBeVisible();
  await expect(add).toBeFocused();
  expect(deployments).toBe(2);
});

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
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Definitions", exact: true }).click();
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
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Definitions", exact: true }).click();
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

test("a delayed route selection suppresses the preceding version's start action", async ({ page }) => {
  await installPublicApiFixtures(page);
  const older = { ...definition, version: 6 };
  await page.route("**/Process_Responsive_Human_Work_Review/versions", (route) => route.fulfill({ json: { processId: definition.processId, versions: [older, definition] } }));
  await openDefinitions(page);
  await page.getByRole("tab", { name: "Start", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start version 7" })).toBeVisible();
  const pending = Promise.withResolvers<void>();
  const requested = Promise.withResolvers<void>();
  await page.route("**/Process_Responsive_Human_Work_Review/versions", async (route) => {
    requested.resolve();
    await pending.promise;
    await route.fulfill({ json: { processId: definition.processId, versions: [older, definition] } });
  });
  try {
    await page.getByRole("combobox", { name: "Version", exact: true }).selectOption("6");
    await requested.promise;
    await expect(page).toHaveURL(/version=6/);
    await expect(page.getByRole("button", { name: "Start version 7" })).toHaveCount(0);
    pending.resolve();
    await expect(page.getByRole("button", { name: "Start version 6" })).toBeVisible();
  } finally { pending.resolve(); }
});
