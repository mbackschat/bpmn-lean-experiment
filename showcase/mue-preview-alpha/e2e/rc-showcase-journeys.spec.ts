import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { rcShowcases } from "../../../model-corpus/rc-showcases.ts";
import { buildProcessShowcaseCatalog } from "../../../scripts/rc-showcase-catalog.ts";
import { decodeDefinitionListResponse, definitionsCollectionPath, decodeProcessInstanceSearchPage, processInstancesPath } from "@bpmn-lean/platform-contracts";
import { setTimeout as delay } from "node:timers/promises";
import { DefinitionApiClient } from "../../../platform/apps/web/src/definitions-api.ts";
import { ProcessExecutionApiClient } from "../../../platform/apps/web/src/process-execution-api.ts";
import { RcShowcaseRuntime } from "../src/rc-showcase-runtime.ts";

for (const automatedParticipants of [false, true]) test.describe(automatedParticipants ? "automated host" : "user host", () => {
  const selections = rcShowcases.filter((entry) => automatedParticipants || entry.mode === "human");
  let runtime: RcShowcaseRuntime;
  test.beforeAll(async () => {
    runtime = await RcShowcaseRuntime.create({
      port: Number(process.env.PLATFORM_PORT),
      ...(automatedParticipants ? { automatedParticipants: true } : {}),
      webAssetDirectory: fileURLToPath(new URL("../../../platform/apps/web/dist", import.meta.url)),
    });
    await runtime.start();
  });
  test.afterAll(async () => { await runtime?.close(); });

  test("RC startup prepares the curated definitions without starting instances", async ({ page, request }) => {
    const models = (await buildProcessShowcaseCatalog(fileURLToPath(new URL("../../../", import.meta.url))))
      .filter((entry) => entry.showcase !== null && (automatedParticipants || entry.showcase.mode === "human"));
    const definitionResponse = await request.get(new URL(definitionsCollectionPath(), runtime.origin).href);
    const { definitions } = decodeDefinitionListResponse(await definitionResponse.json());
    expect(definitions).toHaveLength(models.length);
    const marker = await request.get(`${runtime.origin}/rc-showcase-runtime.json`);
    expect(await marker.json()).toEqual({ kind: "rcShowcaseRuntime", version: 1, automatedParticipants });
    for (const model of models) {
      expect(definitions.filter((definition) => definition.source.sha256 === model.sha256
        && definition.semanticProfile === model.profile)).toHaveLength(1);
    }
    const response = await request.get(new URL(processInstancesPath({ limit: 100 }), runtime.origin).href);
    expect(decodeProcessInstanceSearchPage(await response.json()).instances).toEqual([]);
    await page.goto(`${runtime.origin}/#/definitions?view=showcases`);
    for (const model of models) {
      const row = page.locator(`[data-model-id="${model.id}"]`);
      await expect(row.getByText("Prepared · Ready to start", { exact: true })).toBeVisible();
      await expect(row.getByRole("link", { name: "Open definition", exact: true })).toBeVisible();
      await expect(row.getByRole("link", { name: "Go to Start", exact: true })).toBeVisible();
    }
  });

  test("every prepared showcase opens a complete definition diagram", async ({ page }) => {
    const models = (await buildProcessShowcaseCatalog(fileURLToPath(new URL("../../../", import.meta.url))))
      .filter((entry) => entry.showcase !== null && (automatedParticipants || entry.showcase.mode === "human"));
    await page.setViewportSize({ width: 1600, height: 1000 });
    for (const model of models) {
      await page.goto(`${runtime.origin}/#/definitions?view=showcases`);
      await page.locator(`[data-model-id="${model.id}"]`).getByRole("link", { name: "Open definition", exact: true }).click();
      const diagram = page.locator('[data-ui="definition-diagram-surface"]');
      await expect(diagram, model.id).toHaveAttribute("data-diagram-status", "ready");
      await expect(diagram.locator(".djs-shape").first()).toBeVisible();
      const connection = diagram.locator(".djs-connection .djs-visual path").first();
      await expect(connection).toBeAttached();
      expect(await connection.evaluate((path) => (path as SVGPathElement).getTotalLength())).toBeGreaterThan(0);
      await expect(page.getByRole("button", { name: "Download diagrammed BPMN", exact: true })).toBeEnabled();
      await diagram.screenshot({ path: test.info().outputPath(`${model.id}.png`) });
    }
  });

  for (const selection of selections) {
    test(`RC catalog completes ${selection.modelId} through the public UI`, async ({ page }) => {
      await page.setViewportSize({ width: 1600, height: 900 });
      await page.goto(runtime.origin);
      await navigate(page, "Definitions");
      await page.getByRole("button", { name: "Explore process showcases", exact: true }).click();
      await page.locator(`[data-model-id="${selection.modelId}"]`).getByRole("button").click();
      const catalog = page.getByRole("region", { name: "Process showcases" });
      await expect(catalog.getByRole("heading", { name: "BPMN elements and supported extent" })).toBeVisible();
      await expect(catalog.getByRole("button", { name: "Prepare this showcase" })).toHaveCount(0);
      await catalog.getByRole("link", { name: "Go to Start", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Ready to start", exact: true })).toBeVisible();
      if (selection.mode === "guided") await expect(page.getByText("Automatic demonstration", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: /^Start version \d+$/u }).click();
      let instanceId: string;
      if (selection.mode === "guided") {
        await expect(page).toHaveURL(/#\/operations\?instance=/);
        instanceId = await page.locator('[data-ui="process-execution-detail"]').getAttribute("data-instance-id") ?? "";
        expect(instanceId).not.toBe("");
        await expect(page.getByRole("status").filter({ hasText: "Process completed" })).toBeVisible();
      } else {
        await expect(page.getByText("Process instance started", { exact: true })).toBeVisible();
        instanceId = await page.getByTestId("started-instance-id").innerText();
      }
      if (selection.mode === "human") {
        await page.getByRole("link", { name: "Open task inbox", exact: true }).click();
        await completeHumanWork(page, selection.modelId);
        await navigate(page, "Definitions");
      }
      if (selection.mode === "human") await page.getByRole("button", { name: "View instance in Operations", exact: true }).click();
      const detail = page.locator('[data-ui="process-execution-detail"]');
      await expect(detail).toContainText(instanceId);
      await expect(detail.getByRole("link", { name: "Process description", exact: true })).toHaveAttribute("href", new RegExp(`model=${selection.modelId}`));
      await expect(detail.locator('[data-ui="execution-overview"]')).toContainText("completed");
      await detail.getByRole("tab", { name: "History", exact: true }).click();
      const history = detail.locator('[data-ui="execution-history"]');
      await expect(history).toContainText("startProcess");
      const revisions = await history.locator("[data-revision]").evaluateAll((rows) =>
        rows.map((row) => Number(row.getAttribute("data-revision"))));
      expect(revisions.length).toBeGreaterThan(1);
      expect(revisions).toEqual(revisions.map((_, index) => index + 1));
      if (selection.mode === "human") {
        await detail.getByRole("tab", { name: "Operator history", exact: true }).click();
        await expect(detail).toContainText("claim");
        await expect(detail).toContainText("committed");
        await page.getByRole("tablist", { name: "Operations", exact: true }).getByRole("tab", { name: "Action history", exact: true }).click();
        await page.getByLabel("Process instance ID", { exact: true }).fill(instanceId);
        await page.getByRole("button", { name: "Apply filters", exact: true }).click();
        const actions = page.getByRole("table", { name: "Your task actions", exact: true });
        await expect(actions).toContainText("Claim task");
        await expect(actions).toContainText("Complete task");
        await expect(actions).toContainText("Completed successfully");
        await actions.getByRole("link", { name: "View process", exact: true }).first().click();
        await expect(detail).toContainText(instanceId);
        await expect(detail.getByRole("tab", { name: "Operator history", exact: true })).toHaveAttribute("aria-selected", "true");
      }
    });
  }

  if (!automatedParticipants) test("user host never scripts an explicitly uploaded automated model", async () => {
    const model = (await buildProcessShowcaseCatalog(fileURLToPath(new URL("../../../", import.meta.url))))
      .find((entry) => entry.id === "claim-assessment-with-input-and-decision")!;
    const definitions = new DefinitionApiClient(runtime.origin);
    const deployed = await definitions.deploy({ bytes: new TextEncoder().encode(model.xml), sourceId: "claim.bpmn", semanticProfile: model.profile });
    if (deployed.status !== "deployed") throw new Error("Claim fixture must be admitted");
    const result = await definitions.start(deployed.definition, model.showcase!.start);
    if (result.status !== "started") throw new Error("Claim fixture must start");
    const execution = new ProcessExecutionApiClient(runtime.origin);
    const before = await execution.getComplete(result.instance);
    expect(before.current.state.status).toBe("running");
    expect(before.current.state.openUserTasks).toHaveLength(1);
    // The actor polls every 250 ms; four discovery cycles must leave the published task untouched.
    await delay(1_000);
    const after = await execution.getComplete(result.instance);
    expect(after).toEqual(before);
    runtime.assertHealthy();
  });

});

async function completeHumanWork(page: Page, modelId: string): Promise<void> {
  const tasks = page.getByRole("region", { name: "Tasks" });
  const names = modelId === "parallel-content-and-risk-review"
    ? ["Review content", "Review risk"]
    : modelId === "expense-exception-review" ? ["Review exception"] : ["Approve"];
  for (const name of names) {
    const row = tasks.getByRole("row").filter({ hasText: name });
    await expect(row).toContainText("Unclaimed");
    await expect(row.getByRole("button", { name: `Edit task: ${name}`, exact: true })).toHaveCount(0);
    await row.getByRole("button", { name: "Claim", exact: true }).click();
    await row.getByRole("button", { name: `Edit task: ${name}`, exact: true }).click();
    if (modelId === "expense-exception-review") {
      await tasks.getByLabel("Request reference").fill("EXP-RC-001");
      await tasks.getByLabel("Expense date").fill("2026-09-26");
      await tasks.getByLabel("Approved amount").fill("4250");
      await tasks.getByRole("radio", { name: "Engineering", exact: true }).press("Space");
      await tasks.getByRole("checkbox", { name: "Missing receipt", exact: true }).press("Space");
      await tasks.getByRole("button", { name: "Approve", exact: true }).click();
    } else {
      await tasks.getByRole("radio", { name: "True", exact: true }).press("Space");
      await tasks.getByRole("button", { name: "Complete task", exact: true }).click();
    }
    await expect(tasks.getByRole("button", { name: "Back to tasks", exact: false })).toHaveCount(0);
  }
}

async function navigate(page: Page, name: "Definitions" | "Work" | "Operations"): Promise<void> {
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name, exact: true }).click();
}
