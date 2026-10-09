import { expect, test } from "@playwright/test";

import { decodePublicTaskDetail } from "../../../platform/contracts/src/work-task-form-decoders.ts";
import type { PublicWorkTask } from "../../../platform/contracts/src/work-tasks.ts";
import { fixtureLabels, installPublicApiFixtures } from "./fixtures.ts";

test("reclaimed task cannot submit cached detail from its previous claim generation", async ({ page }) => {
  await installPublicApiFixtures(page);
  await page.goto("/#/work");
  const tasks = page.getByRole("region", { name: "Tasks" });
  const editName = `Edit task: ${fixtureLabels.task}`;
  const firstDetail = page.waitForResponse((response) => response.request().method() === "GET"
    && new URL(response.url()).pathname.startsWith("/api/v1/work-tasks/")
    && !new URL(response.url()).pathname.endsWith("/claim"));
  await tasks.getByRole("button", { name: editName, exact: true }).click();
  const original = decodePublicTaskDetail(await (await firstDetail).json());
  await expect(tasks.getByRole("radio", { name: "True", exact: true })).toBeVisible();
  expect(original.workTask.claim?.generation).toBe(1);
  await tasks.getByRole("button", { name: "Back to tasks", exact: false }).click();

  const id = original.workTask.task.id;
  const taskPath = `/api/v1/work-tasks/${encodeURIComponent(id.processInstanceId)}/${encodeURIComponent(id.elementId)}/${id.activation}`;
  let current: PublicWorkTask = original.workTask;
  let completed = false;
  const pending = Promise.withResolvers<void>();
  const requested = Promise.withResolvers<void>();
  const completions: unknown[] = [];
  await page.route("**/api/v1/work-tasks**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "GET" && url.pathname === "/api/v1/work-tasks") {
      return route.fulfill({ json: { tasks: completed ? [] : [current] } });
    }
    if (request.method() === "DELETE" && url.pathname === `${taskPath}/claim`) {
      expect(url.searchParams.get("generation")).toBe("1");
      current = { ...current, claimGeneration: 2, claim: null, claimableByCurrentActor: true };
      return route.fulfill({ json: { taskId: id, claimGeneration: 2, released: true } });
    }
    if (request.method() === "PUT" && url.pathname === `${taskPath}/claim`) {
      expect(request.postDataJSON()).toMatchObject({ expectedGeneration: 2 });
      current = { ...current, claimGeneration: 3, claim: { actorId: "demo-user", generation: 3 }, claimableByCurrentActor: false };
      return route.fulfill({ status: 201, json: { taskId: id, claim: current.claim } });
    }
    if (request.method() === "GET" && url.pathname === taskPath) {
      requested.resolve();
      await pending.promise;
      return route.fulfill({ json: {
        workTask: current,
        form: { fields: [{ key: "approvalDecision", type: "boolean", currentValue: { kind: "boolean", value: true }, compatibility: "compatible" }] },
      } });
    }
    return route.fallback();
  });
  await page.route("**/api/v1/work-task-completions/*", async (route) => {
    completions.push(route.request().postDataJSON());
    completed = true;
    return route.fulfill({ json: {
      state: "committed", actionId: decodeURIComponent(new URL(route.request().url()).pathname.split("/").at(-1) ?? ""), taskId: id,
    } });
  });

  const row = tasks.getByRole("row").filter({ has: page.getByText(fixtureLabels.task, { exact: true }) });
  await row.getByRole("button", { name: "Release", exact: true }).click();
  await expect(row).toContainText("Unclaimed");
  await row.getByRole("button", { name: "Claim", exact: true }).click();
  await expect(row).toContainText("Claimed by demo-user");
  await row.getByRole("button", { name: editName, exact: true }).click();
  await requested.promise;
  try {
    await expect(tasks.getByRole("button", { name: "Complete task", exact: true })).toHaveCount(0);
    await expect(tasks.getByRole("radio")).toHaveCount(0);
    await expect(tasks.getByRole("status")).toHaveText("Loading task detail…");
    expect(completions).toEqual([]);
  } finally { pending.resolve(); }
  await expect(tasks.getByRole("radio", { name: "True", exact: true })).toBeChecked();
  await tasks.getByRole("radio", { name: "False", exact: true }).press("Space");
  await tasks.getByRole("button", { name: "Complete task", exact: true }).click();
  await expect(tasks).toContainText("No current tasks.");
  expect(completions).toEqual([{ taskId: id, expectedClaimGeneration: 3,
    submittedValues: [{ key: "approvalDecision", value: { kind: "boolean", value: false } }],
  }]);
});
