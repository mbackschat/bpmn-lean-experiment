import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  executionPublicationExportPath, serializeCanonicalExecutionPublicationValue,
} from "@bpmn-lean/platform-contracts";
import type { ExecutionPublicationExport, PublicProcessInstanceIdentity } from "@bpmn-lean/platform-contracts";
import { MuePreviewAlphaShowcaseRuntime } from "../src/showcase-runtime.ts";
import {
  compensationTestActivities, completeCompensationTasks, deployCompensation,
  failureCode, failureMessage, startCompensation,
} from "../test/failed-process-support.ts";
import { collectCompensationPublication, replayCompensationRuns } from "../test/failed-process-evidence.ts";

let runtime: MuePreviewAlphaShowcaseRuntime;
test.beforeAll(async () => {
  runtime = await MuePreviewAlphaShowcaseRuntime.create(compensationTestActivities);
  await runtime.start();
  await runtime.startWorker();
});
test.afterAll(async () => await runtime.close());

test("public Compensation start preserves success and failure through restart, inspection, export and replay", async ({ page, request }) => {
  const definition = await deployCompensation(request);
  const instances: PublicProcessInstanceIdentity[] = [];
  const publications: ExecutionPublicationExport[] = [];
  for (const failed of [false, true]) {
    const instance = await startCompensation(request, definition, failed);
    instances.push(instance);
    await completeCompensationTasks(runtime.workflowClient, instance);
    const publication = await collectCompensationPublication(runtime.workflowClient, instance, failed);
    publications.push(publication);
    const response = await request.get(executionPublicationExportPath(instance.processInstanceId));
    expect(response.status(), await response.text()).toBe(200);
    expect(await response.body()).toEqual(Buffer.from(serializeCanonicalExecutionPublicationValue(publication)));
  }

  await runtime.restartPlatform();
  for (const [index, instance] of instances.entries()) {
    const publication = publications[index]!;
    const response = await request.get(executionPublicationExportPath(instance.processInstanceId));
    expect(response.status(), await response.text()).toBe(200);
    const bytes = Buffer.from(serializeCanonicalExecutionPublicationValue(publication));
    expect(await response.body()).toEqual(bytes);
    await openDetail(page, instance);
    const overview = page.locator('[data-ui="execution-overview"]');
    await expect(overview).toContainText(index === 0 ? "completed" : "failed");
    const failure = page.getByRole("region", { name: "Compensation failure", exact: true });
    if (index === 0) {
      await expect(failure).toHaveCount(0);
    } else {
      await expect(failure).toContainText(failureCode);
      await expect(failure).toContainText(failureMessage);
      for (const [label, element] of [
        ["Trigger", "operation:Throw_Compensate"],
        ["Handler", "EventSubProcess_UndoGroundTravel"],
        ["Effect", "Task_UndoGroundTravel"],
      ]) {
        const identity = failure.getByRole("region", { name: `${label} occurrence`, exact: true });
        await expect(identity).toContainText(instance.processInstanceId);
        await expect(identity).toContainText(element!);
        await expect(identity.locator("dt").filter({ hasText: /^Activation$/u }).locator("+ dd")).toHaveText("1");
      }
      await expect(overview.getByRole("button", { name: /Retry|Cancel/iu })).toHaveCount(0);
    }
    await page.getByRole("tab", { name: "History", exact: true }).click();
    await expect(page.locator('[data-ui="execution-history"]')).toContainText("completeEffect");
    await page.getByRole("tab", { name: "Overview", exact: true }).click();
    const downloadButton = page.getByRole("button", { name: "Download execution history" });
    await expect(downloadButton).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent("download"), downloadButton.click()]);
    expect(await readFile((await download.path())!)).toEqual(bytes);
    await page.getByRole("tab", { name: "Operator history", exact: true }).click();
    await expect(page.locator('[data-ui="operator-history"]')).toBeVisible();
  }

  const failedInstance = instances[1]!;
  const damagedRoute = "**/execution?**";
  await page.route(damagedRoute, async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    if (payload.current?.state.status === "failed") {
      payload.current.state.failure.handlerId.processInstanceId = "wrong-process";
    }
    await route.fulfill({ response, json: payload });
  });
  await openDetail(page, failedInstance);
  await expect(page.getByRole("alert")).toContainText("Committed execution publication unavailable");
  await expect(page.getByRole("region", { name: "Compensation failure", exact: true })).toHaveCount(0);
  await page.unroute(damagedRoute);
  await openDetail(page, failedInstance);
  await expect(page.getByRole("region", { name: "Compensation failure", exact: true })).toContainText(failureMessage);
  expect(await replayCompensationRuns(runtime.workflowClient, instances)).toBeGreaterThanOrEqual(instances.length);
});

async function openDetail(page: Page, instance: PublicProcessInstanceIdentity): Promise<void> {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: "Operations", exact: true }).click();
  await page.getByLabel("Process-instance ID").fill(instance.processInstanceId);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("button", { name: `View details ${instance.processInstanceId}` }).click();
}
