import { expect, test } from "@playwright/test";
import { installPublicApiFixtures } from "./fixtures.ts";
import { fileURLToPath } from "node:url";
import { buildProcessShowcaseCatalog } from "../../../scripts/rc-showcase-catalog.ts";

test("showcase descriptions identify their BPMN processes before preparation @responsive", async ({ page }) => {
  await installPublicApiFixtures(page);
  await page.goto("/#/definitions?process=Unrelated_Process&version=1&view=showcases&model=claim-assessment-with-input-and-decision");
  const identity = page.getByRole("region", { name: "BPMN process identity", exact: true });
  await expect(identity).toContainText("BPMN process ID");
  await expect(identity).toContainText("Process_ClaimAssessment");
  await expect(identity).not.toContainText("Unrelated_Process");
  await page.goto("/#/definitions?view=showcases&model=parallel-content-and-risk-review");
  await expect(identity).toContainText("BPMN name");
  await expect(identity).toContainText("Parallel content and risk review");
  await expect(identity).toContainText("Process_ParallelUserTaskMetadata");
  await page.goto("/#/definitions?view=showcases&model=called-process-fulfilment");
  await expect(identity).toContainText("CallerProcess");
  await expect(identity).toContainText("CalledProcess");
});

test("prepared showcases link to the published exact definition without redeployment @responsive", async ({ page }) => {
  await installPublicApiFixtures(page);
  const entries = await buildProcessShowcaseCatalog(fileURLToPath(new URL("../../../", import.meta.url)));
  const model = entries.find((entry) => entry.id === "request-review-with-form")!;
  const definition = {
    processId: "Prepared_Showcase", version: 7,
    source: { kind: "bpmnSource", id: "process.bpmn", sha256: model.sha256, byteLength: Buffer.byteLength(model.xml), declaredEncoding: "UTF-8", decodedAs: "UTF-8" },
    semanticProfile: model.profile, startCapabilities: { messageStarts: [], timerStarts: [] },
  };
  let mutations = 0;
  page.on("request", (request) => { if (request.method() === "POST") mutations++; });
  await page.route("**/api/v1/definitions", (route) => route.fulfill({ json: { definitions: [definition] } }));
  await page.route("**/Prepared_Showcase/versions", (route) => route.fulfill({ json: { processId: definition.processId, versions: [definition] } }));
  await page.goto("/#/definitions?view=showcases");
  const row = page.locator(`[data-model-id="${model.id}"]`);
  await expect(row.getByText("Prepared · Ready to start", { exact: true })).toBeVisible();
  await row.getByRole("link", { name: "Open definition", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Version", exact: true })).toHaveValue("7");
  await expect(page.getByRole("button", { name: "Start version 7", exact: true })).toBeVisible();
  const description = page.getByRole("link", { name: "Process description", exact: true });
  await expect(description).toHaveAttribute("href", /model=request-review-with-form/);
  await description.click();
  await expect(page.getByRole("heading", { name: model.title, exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("combobox", { name: "Version", exact: true })).toHaveValue("7");
  await page.goForward();
  await page.getByRole("button", { name: "Back to definitions", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Version", exact: true })).toHaveValue("7");
  await page.getByRole("button", { name: "Explore process showcases", exact: true }).click();
  await row.getByRole("link", { name: "Go to Start", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start version 7", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Start version 7", exact: true })).toBeVisible();
  expect(mutations).toBe(0);
});

for (const modelId of ["request-review-with-form", "external-service-recording", "ordered-batch-document-review"]) {
  test(`showcase ${modelId} leads from preparation to explicit start and next action @responsive`, async ({ page }) => {
    await installPublicApiFixtures(page);
    const entries = await buildProcessShowcaseCatalog(fileURLToPath(new URL("../../../", import.meta.url)));
    const model = entries.find((entry) => entry.id === modelId)!;
    const definition = {
      processId: "Prepared_Showcase", version: 3,
      source: { kind: "bpmnSource", id: "process.bpmn", sha256: model.sha256, byteLength: Buffer.byteLength(model.xml), declaredEncoding: "UTF-8", decodedAs: "UTF-8" },
      semanticProfile: model.profile, startCapabilities: { messageStarts: [], timerStarts: [] },
    };
    const newer = { ...definition, version: 4 };
    let prepared = false;
    let starts = 0;
    await page.route("**/rc-showcase-runtime.json", (route) => route.fulfill({ json: { kind: "rcShowcaseRuntime", version: 1, automatedParticipants: true } }));
    await page.route("**/api/v1/definitions", (route) => route.fulfill({ json: { definitions: prepared ? [newer] : [] } }));
    await page.route("**/Prepared_Showcase/versions", (route) => route.fulfill({ json: { processId: definition.processId, versions: [definition, newer] } }));
    await page.route("**/api/v1/definitions?*", (route) => {
      prepared = true;
      return route.fulfill({ status: 201, json: { status: "deployed", definition } });
    });
    await page.route("**/versions/3/start", (route) => {
      starts++;
      expect(route.request().postDataJSON()).toEqual(model.showcase!.start);
      return route.fulfill({ status: 201, json: { status: "started", instance: { processInstanceId: "prepared-instance", definition } } });
    });
    await page.goto(`/#/definitions?view=showcases&model=${model.id}`);
    await page.getByRole("button", { name: "Prepare this showcase" }).click();
    await expect(page.getByRole("heading", { name: "Ready to start", exact: true })).toBeFocused();
    await expect(page.getByRole("region", { name: "Ready to start", exact: true })).toContainText(model.title);
    await expect(page.getByRole("combobox", { name: "Version", exact: true })).toHaveValue("3");
    expect(starts).toBe(0);
    if (model.showcase!.start.initialVariables.length > 0) {
      await page.getByRole("button", { name: "Show Showcase start data", exact: true }).click();
      const hide = page.getByRole("button", { name: "Hide Showcase start data", exact: true });
      await expect(hide).toHaveAttribute("aria-expanded", "true");
      await hide.click();
    }
    const start = page.getByRole("button", { name: "Start version 3", exact: true });
    await expect(start).toBeInViewport();
    await start.click();
    if (model.showcase!.mode === "guided") {
      await expect(page).toHaveURL(/#\/operations\?instance=prepared-instance/);
      await page.goBack();
    }
    await expect(page.getByText("What happens next", { exact: true })).toBeVisible();
    const nextAction = page.getByRole("button", { name: "View instance in Operations", exact: true });
    await expect(nextAction).toBeVisible();
    const spacing = await nextAction.evaluate((button) => {
      const paragraph = button.previousElementSibling!;
      return button.getBoundingClientRect().top - paragraph.getBoundingClientRect().bottom;
    });
    expect(spacing).toBeGreaterThanOrEqual(16);
    await page.getByRole("link", { name: "Process description", exact: true }).click();
    await expect(page.getByRole("heading", { name: model.title, exact: true })).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId("started-instance-id")).toHaveText("prepared-instance");
    expect(starts).toBe(1);
    const inbox = page.getByRole("link", { name: "Open task inbox", exact: true });
    if (model.showcase!.mode === "human") {
      await expect(inbox).toBeVisible();
      await inbox.click();
      await expect(page).toHaveURL(/#\/work$/);
    } else await expect(inbox).toHaveCount(0);
    await expect(page.locator("html")).toHaveJSProperty("scrollWidth", await page.locator("html").evaluate((element) => element.clientWidth));
  });
}

test("showcase disclosures use explicit Show and Hide buttons and expand inline @responsive", async ({ page }) => {
  await installPublicApiFixtures(page);
  await page.goto("/#/definitions?view=showcases");
  const show = page.getByRole("button", { name: "Show What this demonstrates about the approach", exact: true });
  const disclosure = page.locator('[data-ui="inline-disclosure"]').filter({ has: show });
  expect((await disclosure.boundingBox())!.height).toBeCloseTo((await show.boundingBox())!.height, 0);
  const search = page.getByLabel("Find a process or BPMN element");
  const before = (await search.boundingBox())!.y;
  await show.focus();
  await page.keyboard.press("Enter");
  const hide = page.getByRole("button", { name: "Hide What this demonstrates about the approach", exact: true });
  await expect(hide).toBeFocused();
  await expect(hide).toHaveAttribute("aria-expanded", "true");
  expect((await search.boundingBox())!.y).toBeGreaterThan(before);
  await page.keyboard.press("Space");
  await expect(show).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "Explore Review content and risk in parallel", exact: true }).click();
  await page.getByRole("button", { name: "Show Exact source and profile", exact: true }).click();
  await expect(page.locator('[data-ui="inline-disclosure"] pre')).toBeVisible();
  await page.getByRole("button", { name: "Hide Exact source and profile", exact: true }).click();
  await expect(page.locator('[data-ui="inline-disclosure"] pre')).not.toBeVisible();
});

test("showcases distinguish manual work, simulated participants and retained engine evidence @responsive", async ({ page }) => {
  await installPublicApiFixtures(page);
  await page.route("**/rc-showcase-runtime.json", (route) => route.fulfill({ status: 404 }));
  await page.goto("/");
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Definitions", exact: true }).click();
  const explore = page.getByRole("button", { name: "Explore process showcases", exact: true });
  await explore.focus();
  await page.keyboard.press("Enter");
  const catalog = page.getByRole("region", { name: "Process showcases" });
  await expect(catalog.getByRole("heading", { name: "Explore process showcases", exact: true })).toBeFocused();
  await expect(catalog.locator("[data-model-id]")).toHaveCount(3);
  await catalog.getByLabel("Include automated examples and engine models").check();
  await catalog.getByLabel("Find a process or BPMN element").fill("Transaction");
  await expect(catalog.locator("[data-model-id]")).toHaveCount(1);
  await catalog.getByRole("button", { name: "Explore Withdraw a resource reservation", exact: true }).click();
  await expect(catalog.getByRole("heading", { name: "Withdraw a resource reservation", exact: true })).toBeFocused();
  await expect(catalog).toContainText("Cancel Boundary");
  await expect(catalog).toContainText("Guided simulation");
  await expect(catalog.getByRole("button", { name: "Prepare this showcase" })).toBeDisabled();
  await expect(catalog).toContainText("Guided execution is unavailable");
  await expect(catalog).toContainText("Finite scenario agreement is not a universal proof");
  await expect(page.locator("html")).toHaveJSProperty("scrollWidth", await page.locator("html").evaluate((element) => element.clientWidth));
  await catalog.getByRole("button", { name: "Back to showcase catalog" }).click();
  await expect(catalog.getByRole("button", { name: "Explore Withdraw a resource reservation", exact: true })).toBeFocused();
  await catalog.getByLabel("Find a process or BPMN element").fill("");
  await catalog.getByLabel("Include automated examples and engine models").check();
  await expect(catalog.locator("[data-model-id]")).toHaveCount(45);
  await catalog.getByRole("button", { name: "Explore Prepare two work items in parallel", exact: true }).click();
  await expect(catalog).toContainText("metadata-free");
  await expect(catalog.getByRole("button", { name: "Prepare this showcase" })).toHaveCount(0);
  await catalog.getByRole("button", { name: "Back to definitions" }).click();
  await expect(explore).toBeFocused();
});

test("showcase preparation keeps its originating selection until the response settles", async ({ page }) => {
  await installPublicApiFixtures(page);
  const pending = Promise.withResolvers<void>();
  const requested = Promise.withResolvers<void>();
  await page.route("**/api/v1/definitions?*", async (route) => {
    requested.resolve();
    await pending.promise;
    await route.fulfill({ status: 503, json: { error: { code: "notFound", message: "Preparation unavailable." } } });
  });
  await page.goto("/");
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Definitions", exact: true }).click();
  await page.getByRole("button", { name: "Explore process showcases", exact: true }).click();
  await page.getByRole("button", { name: "Explore Review content and risk in parallel", exact: true }).click();
  await page.getByRole("button", { name: "Prepare this showcase" }).click();
  await requested.promise;
  try {
    await expect(page.getByRole("button", { name: "Back to showcase catalog" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Back to definitions" })).toBeDisabled();
  } finally { pending.resolve(); }
  await expect(page.getByRole("alert")).toContainText("Preparation unavailable");
  await expect(page.getByRole("button", { name: "Back to showcase catalog" })).toBeEnabled();
});

for (const marker of [null, { kind: "rcShowcaseRuntime", version: 1 }, { kind: "rcShowcaseRuntime", version: 1, automatedParticipants: false }]) {
  test(`user catalog keeps automated participants unavailable: ${JSON.stringify(marker)}`, async ({ page }) => {
    await installPublicApiFixtures(page);
    await page.route("**/rc-showcase-runtime.json", (route) => marker === null
      ? route.fulfill({ status: 404 }) : route.fulfill({ json: marker }));
    await page.goto("/#/definitions?view=showcases");
    const catalog = page.getByRole("region", { name: "Process showcases" });
    await expect(catalog.locator("[data-model-id]")).toHaveCount(3);
    await expect(catalog).toContainText("Tasks wait for you");
    await page.goto("/#/definitions?view=showcases&model=claim-assessment-with-input-and-decision");
    await expect(catalog.getByRole("button", { name: "Prepare this showcase" })).toBeDisabled();
    await expect(catalog).toContainText("demo:rc:automated");
  });
}
