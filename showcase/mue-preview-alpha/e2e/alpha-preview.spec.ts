import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  ProcessInstanceStartStatus,
  decodeProcessInstanceStartResult,
} from "@bpmn-lean/platform-contracts";
import type { PublicProcessInstanceIdentity } from "@bpmn-lean/platform-contracts";

import { MuePreviewAlphaShowcaseRuntime } from "../src/showcase-runtime.ts";
import {
  AlphaDemoLandmark,
  alphaDemoLandmarkLabel,
  readAlphaDemoPauseMs,
} from "../src/audience-pacing.ts";
import {
  exactNaturalResults,
  processId,
  semanticProfile,
} from "../test/fixture.ts";

const modelPath = fileURLToPath(new URL(
  "../../../scenarios/sequential-multi-instance/process.bpmn",
  import.meta.url,
));
let runtime: MuePreviewAlphaShowcaseRuntime;
const audiencePauseMs = readAlphaDemoPauseMs(process.env);

test.beforeAll(async () => {
  runtime = await MuePreviewAlphaShowcaseRuntime.create();
  await runtime.start();
});

test.afterAll(async () => {
  await runtime.close();
});

test("shows both exact Alpha branches through the production browser and replays every Run", async ({ page }) => {
  await page.setViewportSize({ width: 1_600, height: 900 });
  await page.goto("/");
  await deployExactDefinition(page);

  const natural = await startExactDefinition(page);
  await openInitialExecution(page, natural);
  const naturalPreview = preview(page);
  await expect(naturalPreview).toContainText("Current inputcontract");
  await expect(naturalPreview).toContainText("Completed0");
  await runtime.runNatural(natural);
  await expect(page.locator('[data-ui="execution-overview"]')).toContainText("completed");
  await expect(naturalPreview.getByText("Committed terminal output", { exact: true })).toBeVisible();
  await expect(
    naturalPreview.getByRole("list").last().getByRole("listitem"),
  ).toHaveText([...exactNaturalResults]);
  await pauseAtAudienceLandmark(page, AlphaDemoLandmark.NaturalCompleted);
  await runtime.stopWorker();

  await navigate(page, "Definitions");
  const interrupted = await startExactDefinition(page);
  await openInitialExecution(page, interrupted);
  const interruptedPreview = preview(page);
  await expect(interruptedPreview).toContainText("Current inputcontract");

  const escalationReady = Promise.withResolvers<void>();
  const escalationRelease = Promise.withResolvers<void>();
  const interruptedActor = runtime.runInterrupted(interrupted, {
    onEscalationReady: () => { escalationReady.resolve(); },
    waitForEscalationRelease: async () => { await escalationRelease.promise; },
  });
  try {
    await escalationReady.promise;
    await expect(interruptedPreview.getByRole("list", {
      name: "Committed Timer commands",
    })).toContainText("fireTimer");
    await expect(interruptedPreview.getByRole("list", {
      name: "Published completion interactions",
    })).toContainText("UserTask_Escalation / activation 1");
    await pauseAtAudienceLandmark(page, AlphaDemoLandmark.InterruptionReady);
  } finally {
    escalationRelease.resolve();
  }
  await interruptedActor;
  await expect(page.locator('[data-ui="execution-overview"]')).toContainText("completed");
  await expect(interruptedPreview).toContainText(
    "No output collection is present in this committed terminal state.",
  );
  await pauseAtAudienceLandmark(page, AlphaDemoLandmark.InterruptedCompleted);

  await page.setViewportSize({ width: 1_280, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(interruptedPreview).toBeVisible();
  await expect(page.getByText(/MUE complete/iu)).toHaveCount(0);

  const evidence = await runtime.verifyAndReplay(
    natural.processInstanceId,
    interrupted.processInstanceId,
  );
  expect(evidence.natural).toMatchObject({
    status: "completed",
    committedUpdates: 3,
    timerFirings: 0,
    timerCancellations: 1,
  });
  expect(evidence.interrupted).toMatchObject({
    status: "completed",
    committedUpdates: 2,
    timerFirings: 1,
    timerCancellations: 0,
  });
  expect(evidence.natural.replayedRuns).toBe(evidence.natural.runs);
  expect(evidence.interrupted.replayedRuns).toBe(evidence.interrupted.runs);
  expect(evidence.natural.runs).toBeGreaterThan(0);
  expect(evidence.interrupted.runs).toBeGreaterThan(0);
});

async function deployExactDefinition(page: Page): Promise<void> {
  await navigate(page, "Definitions");
  await page.getByText("Add BPMN definition", { exact: true }).click();
  await page.getByLabel("BPMN XML file").setInputFiles(modelPath);
  await page.getByLabel("Semantic profile ID").fill(semanticProfile);
  await page.getByRole("button", { name: "Deploy definition", exact: true }).click();
  await expect(page.getByText("Admitted and deployed", { exact: true })).toBeVisible();
}

async function startExactDefinition(page: Page): Promise<PublicProcessInstanceIdentity> {
  await navigate(page, "Definitions");
  await page.getByRole("combobox", { name: "Definition", exact: true })
    .selectOption(processId);
  await page.getByRole("tablist", { name: "Definition views" })
    .getByRole("tab", { name: "Start", exact: true }).click();
  await expect(page.getByTestId("mue-preview-alpha-start-input")).toContainText(
    "contract, invoice, receipt",
  );
  const responsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST" &&
    new URL(response.url()).pathname.endsWith("/start")
  );
  await page.getByRole("button", { name: /Start version \d+/u }).click();
  const result = decodeProcessInstanceStartResult(await (await responsePromise).json());
  expect(result.status).toBe(ProcessInstanceStartStatus.Started);
  if (result.status !== ProcessInstanceStartStatus.Started) {
    throw new Error(`Alpha exact start was rejected: ${result.failure.evidence}`);
  }
  await expect(page.getByText("Process instance started", { exact: true })).toBeVisible();
  return result.instance;
}

async function openInitialExecution(
  page: Page,
  instance: PublicProcessInstanceIdentity,
): Promise<void> {
  await navigate(page, "Operations");
  await page.getByLabel("Process-instance ID").fill(instance.processInstanceId);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const details = page.getByRole("button", {
    name: `View details ${instance.processInstanceId}`,
  });
  await expect(details).toBeVisible();
  const workerStart = runtime.startWorker();
  await details.click();
  await workerStart;
  await expect(preview(page)).toBeVisible();
  await expect(preview(page).getByRole("heading", {
    name: "Sequential Multi-Instance progress",
  })).toBeVisible();
}

function preview(page: Page) {
  return page.locator('[data-ui="mue-preview-alpha"]');
}

async function pauseAtAudienceLandmark(
  page: Page,
  landmark: AlphaDemoLandmark,
): Promise<void> {
  if (audiencePauseMs === 0) return;
  const label = alphaDemoLandmarkLabel(landmark);
  process.stdout.write(`ALPHA_DEMO_LANDMARK ${landmark} label=${label}\n`);
  await page.waitForTimeout(audiencePauseMs);
}

async function navigate(
  page: Page,
  workspace: "Definitions" | "Operations",
): Promise<void> {
  const button = page.getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: workspace, exact: true });
  if (await button.getAttribute("aria-current") !== "page") await button.click();
  await expect(page.getByRole("heading", { name: workspace, level: 1 })).toBeVisible();
}
