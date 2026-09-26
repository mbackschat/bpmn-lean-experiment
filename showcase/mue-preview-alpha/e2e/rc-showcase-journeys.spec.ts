import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { rcShowcases } from "../../../model-corpus/rc-showcases.ts";
import { RcShowcaseRuntime } from "../src/rc-showcase-runtime.ts";

let runtime: RcShowcaseRuntime;
test.beforeAll(async () => {
  runtime = await RcShowcaseRuntime.create({
    port: Number(process.env.PLATFORM_PORT),
    webAssetDirectory: fileURLToPath(new URL("../../../platform/apps/web/dist", import.meta.url)),
  });
  await runtime.start();
});
test.afterAll(async () => { await runtime?.close(); });

for (const selection of rcShowcases) {
  test(`RC catalog completes ${selection.modelId} through the public UI`, async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto(runtime.origin);
    await navigate(page, "Definitions");
    await page.getByRole("button", { name: "Explore process showcases", exact: true }).click();
    await page.locator(`[data-model-id="${selection.modelId}"]`).getByRole("button").click();
    const catalog = page.getByRole("region", { name: "Process showcases" });
    await expect(catalog.getByRole("heading", { name: "BPMN elements and supported extent" })).toBeVisible();
    await catalog.getByRole("button", { name: "Prepare this showcase" }).click();
    await page.getByRole("tablist", { name: "Definition views" }).getByRole("tab", { name: "Start", exact: true }).click();
    await page.getByRole("button", { name: /^Start version \d+$/u }).click();
    await expect(page.getByText("Process instance started", { exact: true })).toBeVisible();
    const instanceId = await page.getByTestId("started-instance-id").innerText();
    if (selection.mode === "human") await completeHumanWork(page, selection.modelId);
    await navigate(page, "Operations");
    await page.getByLabel("Process-instance ID").fill(instanceId);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByRole("button", { name: `View details ${instanceId}`, exact: true }).click();
    const detail = page.locator('[data-ui="process-execution-detail"]');
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
    }
  });
}

async function completeHumanWork(page: Page, modelId: string): Promise<void> {
  await navigate(page, "Work");
  const tasks = page.getByRole("region", { name: "Tasks" });
  const names = modelId === "parallel-content-and-risk-review"
    ? ["Review content", "Review risk"]
    : modelId === "expense-exception-review" ? ["Review exception"] : ["Approve"];
  for (const name of names) {
    const row = tasks.getByRole("row").filter({ hasText: name });
    await expect(row).toContainText("Unclaimed");
    await expect(row.getByRole("button", { name, exact: true })).toHaveCount(0);
    await row.getByRole("button", { name: "Claim", exact: true }).click();
    await row.getByRole("button", { name, exact: true }).click();
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
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("button", { name, exact: true }).click();
}
