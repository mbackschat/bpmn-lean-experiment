import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { installPublicApiFixtures, waitForStableUi } from "./fixtures.ts";
import { assertOwnedActionsFit, horizontalOverflowFindings } from "./geometry.ts";

const definition = {
  processId: "Process_Responsive_Human_Work_Review", version: 7,
  source: { kind: "bpmnSource", id: "responsive-human-work-review.bpmn", sha256: "a".repeat(64), byteLength: 815, declaredEncoding: "UTF-8", decodedAs: "UTF-8" },
  semanticProfile: "user-task-assignment-form-metadata-v1",
  sourceOverlay: null,
  startCapabilities: { messageStarts: [], timerStarts: [] },
} as const;

const overlayId = "business-invoice-human-work-" + "exact-source-binding-".repeat(8);
const overlaySha256 = "b".repeat(64);
const overlayJson = '{"kind":"humanWorkSourceOverlay","version":1}';

async function openDefinitions(page: Page): Promise<void> {
  await page.goto("/#/definitions");
  await expect(page.getByRole("combobox", { name: "Version", exact: true })).toHaveValue("7");
  await expect(page.getByRole("button", { name: "Start version 7", exact: true })).toBeVisible();
}

async function fillDeployment(dialog: Locator): Promise<void> {
  await dialog.getByLabel("BPMN XML file", { exact: true }).setInputFiles({
    name: "business-invoice-review-with-an-exact-human-work-source-binding.bpmn",
    mimeType: "application/xml", buffer: Buffer.from("<definitions/>"),
  });
  await dialog.getByLabel("Semantic profile ID", { exact: true }).fill(definition.semanticProfile);
  await dialog.getByLabel("Source overlay JSON file (optional)", { exact: true }).setInputFiles({
    name: "business-invoice-review-with-an-exact-human-work-source-binding.json",
    mimeType: "application/json", buffer: Buffer.from(overlayJson),
  });
  await dialog.getByLabel("Source overlay ID", { exact: true }).fill(overlayId);
}

async function expectKeyboardFocus(control: Locator): Promise<void> {
  await expect(control).toBeFocused();
  await expect(control).toHaveCSS("outline-style", "solid");
  await expect(control).toHaveCSS("outline-width", "2px");
}

async function expectContainedControls(page: Page, owner: Locator): Promise<void> {
  expect(await horizontalOverflowFindings(page.locator("html"))).toEqual([]);
  expect(await horizontalOverflowFindings(owner)).toEqual([]);
  expect(await horizontalOverflowFindings(owner.locator("form, fieldset, label"))).toEqual([]);
  await assertOwnedActionsFit(owner);
  const tooShort = await owner.locator("button, input").evaluateAll((controls) =>
    controls.filter((control) => control.getBoundingClientRect().height < 44)
      .map((control) => control.getAttribute("aria-label") ?? control.getAttribute("name") ?? control.tagName));
  expect(tooShort).toEqual([]);
}

test("source overlay fields follow the modal keyboard loop and fit their owner @responsive", async ({ page }, testInfo) => {
  await installPublicApiFixtures(page);
  await openDefinitions(page);
  const add = page.getByRole("button", { name: "Add BPMN definition", exact: true });
  await add.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Add BPMN definition", exact: true });
  const source = dialog.getByLabel("BPMN XML file", { exact: true });
  const profile = dialog.getByLabel("Semantic profile ID", { exact: true });
  const overlay = dialog.getByLabel("Source overlay JSON file (optional)", { exact: true });
  const id = dialog.getByLabel("Source overlay ID", { exact: true });
  const sha256 = dialog.getByLabel("Source overlay SHA-256", { exact: true });
  await expect(source).toBeFocused();
  await expect(overlay).toHaveValue("");
  await expect(id).toHaveValue("");
  await expect(sha256).toHaveValue("");
  for (const control of [profile, overlay, id, sha256,
    dialog.getByRole("button", { name: "Cancel", exact: true }),
    dialog.getByRole("button", { name: "Deploy definition", exact: true }), source]) {
    await page.keyboard.press("Tab");
    await expectKeyboardFocus(control);
  }
  await fillDeployment(dialog);
  await sha256.fill(overlaySha256);
  await waitForStableUi(page);
  await expectContainedControls(page, dialog);
  await expect(dialog).toBeInViewport({ ratio: 1 });
  await expect(dialog.getByRole("button", { name: "Deploy definition", exact: true })).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: testInfo.outputPath("source-overlay-form.png") });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(add).toBeFocused();
});

test("source overlay validation and failed deployment retain the complete draft and block pending edits", async ({ page }) => {
  await installPublicApiFixtures(page);
  const pending = Promise.withResolvers<void>();
  const requested = Promise.withResolvers<void>();
  const deployments: string[] = [];
  await page.route("**/api/v1/definitions?*", async (route) => {
    deployments.push(route.request().postData() ?? "");
    if (deployments.length === 1) {
      requested.resolve();
      await pending.promise;
      await route.fulfill({ status: 503, json: { error: { code: "internalFailure", message: "Overlay deployment unavailable. Try again." } } });
    } else {
      await route.fulfill({ status: 201, json: { status: "deployed", definition } });
    }
  });
  await openDefinitions(page);
  await page.getByRole("button", { name: "Add BPMN definition", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add BPMN definition", exact: true });
  const deploy = dialog.getByRole("button", { name: "Deploy definition", exact: true });
  await fillDeployment(dialog);
  await deploy.click();
  await expect(dialog.getByRole("alert")).toHaveText("Supply the source overlay file, ID and SHA-256 together.");
  expect(deployments).toEqual([]);
  await dialog.getByLabel("Source overlay SHA-256", { exact: true }).fill(overlaySha256);
  const overlay = dialog.getByLabel("Source overlay JSON file (optional)", { exact: true });
  const id = dialog.getByLabel("Source overlay ID", { exact: true });
  const sha256 = dialog.getByLabel("Source overlay SHA-256", { exact: true });
  for (const invalid of [
    { bytes: Buffer.alloc(0), id: overlayId, sha256: overlaySha256,
      error: "Choose a nonempty source overlay file of at most 65536 bytes." },
    { bytes: Buffer.alloc(65_537), id: overlayId, sha256: overlaySha256,
      error: "Choose a nonempty source overlay file of at most 65536 bytes." },
    { bytes: Buffer.from(overlayJson), id: "🚀".repeat(257), sha256: overlaySha256,
      error: "Source overlay ID must contain 1–256 well-formed Unicode characters." },
    { bytes: Buffer.from(overlayJson), id: overlayId, sha256: overlaySha256.toUpperCase(),
      error: "Source overlay SHA-256 must contain exactly 64 lowercase hexadecimal characters." },
  ]) {
    await overlay.setInputFiles({ name: "invalid-source-overlay.json", mimeType: "application/json", buffer: invalid.bytes });
    await id.fill(invalid.id);
    await sha256.fill(invalid.sha256);
    await deploy.click();
    await expect(dialog.getByRole("alert")).toHaveText(invalid.error);
    expect(deployments).toEqual([]);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("BPMN XML file", { exact: true })).toHaveValue(/exact-human-work-source-binding.bpmn$/u);
    await expect(dialog.getByLabel("Semantic profile ID", { exact: true })).toHaveValue(definition.semanticProfile);
    await expect(overlay).toHaveValue(/invalid-source-overlay.json$/u);
    expect(await overlay.evaluate((input: HTMLInputElement) => input.files?.[0]?.size)).toBe(invalid.bytes.length);
    await expect(id).toHaveValue(invalid.id);
    await expect(sha256).toHaveValue(invalid.sha256);
    await expect(deploy).toBeEnabled();
  }
  await fillDeployment(dialog);
  await sha256.fill(overlaySha256);
  await deploy.click();
  await requested.promise;
  try {
    for (const label of ["BPMN XML file", "Semantic profile ID", "Source overlay JSON file (optional)", "Source overlay ID", "Source overlay SHA-256"]) {
      await expect(dialog.getByLabel(label, { exact: true })).toBeDisabled();
    }
    await expect(deploy).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeDisabled();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Space");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("status")).toContainText("Deploying");
    expect(deployments).toHaveLength(1);
  } finally { pending.resolve(); }
  await expect(dialog.getByRole("alert")).toContainText("Overlay deployment unavailable");
  await expect(dialog.getByLabel("BPMN XML file", { exact: true })).toHaveValue(/exact-human-work-source-binding.bpmn$/u);
  await expect(dialog.getByLabel("Source overlay JSON file (optional)", { exact: true })).toHaveValue(/exact-human-work-source-binding.json$/u);
  await expect(dialog.getByLabel("Semantic profile ID", { exact: true })).toHaveValue(definition.semanticProfile);
  await expect(dialog.getByLabel("Source overlay ID", { exact: true })).toHaveValue(overlayId);
  await expect(dialog.getByLabel("Source overlay SHA-256", { exact: true })).toHaveValue(overlaySha256);
  await expect(dialog.getByLabel("Source overlay ID", { exact: true })).toBeEnabled();
  await deploy.click();
  await expect(dialog).toHaveCount(0);
  expect(deployments).toHaveLength(2);
  for (const body of deployments) {
    expect(body).toContain(overlayJson);
    expect(body).toContain(overlayId);
    expect(body).toContain(overlaySha256);
  }
});

test("explicit String rows start empty, use keyboard focus and fit their owner @responsive", async ({ page }, testInfo) => {
  await installPublicApiFixtures(page);
  await openDefinitions(page);
  const start = page.getByRole("region", { name: "Ready to start", exact: true });
  const add = start.getByRole("button", { name: "Add input", exact: true });
  await expect(start.getByRole("group")).toHaveCount(0);
  await add.focus();
  await page.keyboard.press("Enter");
  const first = start.getByRole("group", { name: "Input 1 · String", exact: true });
  const name = first.getByLabel("Name", { exact: true });
  const value = first.getByLabel("String value", { exact: true });
  await expectKeyboardFocus(name);
  await expect(name).toHaveValue("");
  await expect(value).toHaveValue("");
  await page.keyboard.type("request");
  await page.keyboard.press("Tab");
  await expectKeyboardFocus(value);
  await page.keyboard.type(" Invoice 17 · Delta ");
  await page.keyboard.press("Tab");
  await expectKeyboardFocus(first.getByRole("button", { name: "Remove input 1", exact: true }));
  await page.keyboard.press("Space");
  await expect(start.getByRole("group")).toHaveCount(0);
  await expectKeyboardFocus(add);
  await page.keyboard.press("Enter");
  await first.getByLabel("Name", { exact: true }).fill("business-request-correlation-".repeat(5));
  await first.getByLabel("String value", { exact: true }).fill("Long literal business input with spaces and punctuation · ".repeat(6));
  await add.focus();
  await page.keyboard.press("Enter");
  const second = start.getByRole("group", { name: "Input 2 · String", exact: true });
  await expectKeyboardFocus(second.getByLabel("Name", { exact: true }));
  await expect(second.getByLabel("Name", { exact: true })).toHaveValue("");
  await expect(second.getByLabel("String value", { exact: true })).toHaveValue("");
  await second.getByLabel("Name", { exact: true }).fill("request");
  await second.getByLabel("String value", { exact: true }).fill("Invoice 17");
  await expect(first.getByLabel("Name", { exact: true })).toHaveValue("business-request-correlation-".repeat(5));
  await waitForStableUi(page);
  await expectContainedControls(page, start);
  await assertOwnedActionsFit(first);
  await assertOwnedActionsFit(second);
  await page.screenshot({ path: testInfo.outputPath("string-start-rows.png"), fullPage: true });
});

test("String drafts survive permitted navigation and a failed Start without edits or duplicate submission pending", async ({ page }) => {
  await installPublicApiFixtures(page);
  const pending = Promise.withResolvers<void>();
  const requested = Promise.withResolvers<void>();
  const commands: unknown[] = [];
  await page.route("**/versions/7/start", async (route) => {
    commands.push(route.request().postDataJSON());
    if (commands.length === 1) {
      requested.resolve();
      await pending.promise;
      await route.fulfill({ status: 503, json: { error: { code: "internalFailure", message: "Start unavailable. Try again." } } });
    } else {
      await route.fulfill({ status: 201, json: { status: "started", instance: { processInstanceId: "literal-input-instance", definition } } });
    }
  });
  await openDefinitions(page);
  const panel = page.getByRole("region", { name: "Ready to start", exact: true });
  const add = panel.getByRole("button", { name: "Add input", exact: true });
  await add.click();
  const first = panel.getByRole("group", { name: "Input 1 · String", exact: true });
  await panel.getByRole("button", { name: "Start version 7", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("name must not be empty");
  expect(commands).toEqual([]);
  await first.getByLabel("Name", { exact: true }).fill("request");
  await first.getByLabel("String value", { exact: true }).fill(" Invoice 17 · Δ ");
  await add.click();
  const second = panel.getByRole("group", { name: "Input 2 · String", exact: true });
  await second.getByLabel("String value", { exact: true }).fill("second literal value");
  for (const duplicateName of ["request", " request "]) {
    await first.getByLabel("Name", { exact: true }).fill(duplicateName);
    await second.getByLabel("Name", { exact: true }).fill(duplicateName);
    await panel.getByRole("button", { name: "Start version 7", exact: true }).click();
    await expect(panel.getByRole("alert")).toHaveText("Input names must be unique.");
    expect(commands).toEqual([]);
    await expect(first.getByLabel("Name", { exact: true })).toHaveValue(duplicateName);
    await expect(first.getByLabel("String value", { exact: true })).toHaveValue(" Invoice 17 · Δ ");
    await expect(second.getByLabel("Name", { exact: true })).toHaveValue(duplicateName);
    await expect(second.getByLabel("String value", { exact: true })).toHaveValue("second literal value");
  }
  await first.getByLabel("Name", { exact: true }).fill("request");
  await second.getByLabel("Name", { exact: true }).fill("correlationId");
  await second.getByLabel("String value", { exact: true }).fill("");
  const navigation = page.getByRole("navigation", { name: "Primary navigation" });
  await navigation.getByRole("link", { name: "About", exact: true }).click();
  await navigation.getByRole("link", { name: "Definitions", exact: true }).click();
  await page.getByRole("button", { name: "Explore process showcases", exact: true }).click();
  await page.getByRole("button", { name: "Back to definitions", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Version", exact: true })).toHaveValue("7");
  await expect(first.getByLabel("Name", { exact: true })).toHaveValue("request");
  await expect(first.getByLabel("String value", { exact: true })).toHaveValue(" Invoice 17 · Δ ");
  await expect(second.getByLabel("Name", { exact: true })).toHaveValue("correlationId");
  await expect(second.getByLabel("String value", { exact: true })).toHaveValue("");
  await panel.getByRole("button", { name: "Start version 7", exact: true }).click();
  await requested.promise;
  try {
    for (const row of [first, second]) {
      await expect(row.getByLabel("Name", { exact: true })).toBeDisabled();
      await expect(row.getByLabel("String value", { exact: true })).toBeDisabled();
      await expect(row.getByRole("button", { name: /^Remove input/u })).toBeDisabled();
    }
    await expect(add).toBeDisabled();
    await expect(panel.getByRole("button", { name: "Starting…", exact: true })).toBeDisabled();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Space");
    expect(commands).toHaveLength(1);
  } finally { pending.resolve(); }
  await expect(panel.getByRole("alert")).toContainText("Start unavailable");
  await expect(first.getByLabel("String value", { exact: true })).toHaveValue(" Invoice 17 · Δ ");
  await expect(second.getByLabel("Name", { exact: true })).toHaveValue("correlationId");
  await expect(first.getByLabel("Name", { exact: true })).toBeEnabled();
  await expect(add).toBeEnabled();
  await panel.getByRole("button", { name: "Start version 7", exact: true }).click();
  await expect(page.getByTestId("started-instance-id")).toHaveText("literal-input-instance");
  const expected = { initialVariables: [
    { name: "correlationId", value: { kind: "string", value: "" } },
    { name: "request", value: { kind: "string", value: " Invoice 17 · Δ " } },
  ] };
  expect(commands).toEqual([expected, expected]);
  await panel.getByRole("button", { name: "Remove input 1", exact: true }).click();
  await panel.getByRole("button", { name: "Remove input 1", exact: true }).click();
  await expect(panel.getByRole("group")).toHaveCount(0);
  await panel.getByRole("button", { name: "Start version 7", exact: true }).click();
  await expect.poll(() => commands.length).toBe(3);
  expect(commands[2]).toEqual({ initialVariables: [] });
});
