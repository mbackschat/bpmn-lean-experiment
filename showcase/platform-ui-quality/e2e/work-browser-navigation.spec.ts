import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { FixtureCompletionState, fixtureLabels, installPublicApiFixtures } from "./fixtures.ts";

const selectedKey = JSON.stringify([
  fixtureLabels.occurrence, fixtureLabels.occurrence, "UserTask_Review", 1,
]);

test("Work task and view links survive reload, Back and Forward", async ({ page }) => {
  await installPublicApiFixtures(page);
  await page.goto("/#/work");
  await page.getByRole("button", { name: `Edit task: ${fixtureLabels.task}`, exact: true }).click();
  await expect.poll(() => taskKey(page)).toBe(selectedKey);
  await page.getByRole("radio", { name: "False", exact: true }).press("Space");
  await page.getByRole("tab", { name: "Diagram", exact: true }).click();
  await expect(page).toHaveURL(/view=diagram/);
  await page.getByRole("tab", { name: "Details", exact: true }).click();
  await expect(page).toHaveURL(/view=details/);
  const detailsUrl = page.url();
  await page.goBack();
  await expect(page.getByRole("tab", { name: "Diagram", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.goBack();
  await expect(page.getByRole("radio", { name: "False", exact: true })).toBeChecked();
  await page.goForward();
  await expect(page.getByRole("tab", { name: "Diagram", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.goto(detailsUrl);
  await page.reload();
  await expect(page.getByRole("heading", { name: fixtureLabels.task, exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Details", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Back to tasks" }).click();
  await expect.poll(() => taskKey(page)).toBeNull();
  await expect(page).not.toHaveURL(/view=/);
  await page.goBack();
  await expect(page.getByRole("tab", { name: "Details", exact: true })).toHaveAttribute("aria-selected", "true");
});

for (const [name, key] of [
  ["missing", JSON.stringify(["missing", "missing", "UserTask_Review", 1])],
  ["unclaimed", JSON.stringify(["occurrence-eu-central-000002", "occurrence-eu-central-000002", "UserTask_Review", 2])],
] as const) {
  test(`a ${name} task link cannot fabricate actionable detail`, async ({ page }) => {
    await installPublicApiFixtures(page);
    const mutations = recordMutations(page);
    let detailReads = 0;
    page.on("request", (request) => {
      if (request.method() === "GET" && new URL(request.url()).pathname.startsWith("/api/v1/work-tasks/")) detailReads += 1;
    });
    await page.goto(workUrl(key));
    await expect(page.getByRole("status")).toContainText(/task.*unavailable/i);
    await expect(page.getByRole("button", { name: "Complete task", exact: true })).toHaveCount(0);
    await expect(page.getByRole("radio")).toHaveCount(0);
    expect(detailReads).toBe(0);
    expect(mutations).toHaveLength(0);
    await page.getByRole("button", { name: "Back to tasks" }).click();
    await expect(page.getByRole("table", { name: "Current tasks" })).toBeVisible();
    await expect.poll(() => taskKey(page)).toBeNull();
  });
}

test("uncertain Work completion survives browser Back and workspace navigation without a new action", async ({ page }) => {
  await installPublicApiFixtures(page, { completion: FixtureCompletionState.TransportIndeterminateCommitted });
  const mutations = recordMutations(page);
  await page.goto("/#/work");
  await page.getByRole("button", { name: `Edit task: ${fixtureLabels.task}`, exact: true }).click();
  await expect.poll(() => taskKey(page)).toBe(selectedKey);
  await page.getByRole("radio", { name: "True", exact: true }).press("Space");
  await page.getByRole("button", { name: "Complete task", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry completion" })).toBeVisible();
  await page.getByRole("link", { name: "BPMN Lean home", exact: true }).click();
  await expect.poll(() => taskKey(page)).toBe(selectedKey);
  await expect(page.getByRole("alert")).toContainText("Resolve the pending or uncertain action");
  await page.goBack();
  await expect.poll(() => taskKey(page)).toBe(selectedKey);
  await expect(page.getByRole("button", { name: "Retry completion" })).toBeVisible();
  await page.getByRole("tab", { name: "Details", exact: true }).click();
  await page.goBack();
  await expect(page.getByRole("button", { name: "Retry completion" })).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Primary navigation" });
  await navigation.getByRole("link", { name: "Definitions", exact: true }).click();
  await navigation.getByRole("link", { name: "Work", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry completion" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Complete task", exact: true })).toHaveCount(0);
  expect(mutations).toHaveLength(1);
  await page.getByRole("button", { name: "Retry completion" }).click();
  await expect(page.getByText("Completion is indeterminate. Retry the exact completion request.")).toBeVisible();
  await page.goBack();
  await navigation.getByRole("link", { name: "Work", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry completion" })).toBeVisible();
  expect(mutations).toEqual([mutations[0], mutations[0]]);
  await page.getByRole("button", { name: "Retry completion" }).click();
  await expect(page.getByRole("table", { name: "Current tasks" })).toBeVisible();
  await expect.poll(() => taskKey(page)).toBeNull();
  expect(mutations).toEqual([mutations[0], mutations[0], mutations[0]]);
  await page.goBack();
  await page.goForward();
  await expect(page.getByRole("table", { name: "Current tasks" })).toBeVisible();
  expect(mutations).toHaveLength(3);
});

test("completion committed while Work is hidden keeps Definitions active and clears the saved task route", async ({ page }) => {
  await installPublicApiFixtures(page, { completion: FixtureCompletionState.Committed });
  const mutations = recordMutations(page);
  let finishCompletion!: () => void;
  const completionHeld = new Promise<void>((resolve) => { finishCompletion = resolve; });
  await page.route("**/api/v1/work-task-completions/*", async (route) => {
    await completionHeld;
    await route.fallback();
  });
  try {
    await page.goto("/#/work");
    await page.getByRole("button", { name: `Edit task: ${fixtureLabels.task}`, exact: true }).click();
    await page.getByRole("radio", { name: "True", exact: true }).press("Space");
    const completionRequested = page.waitForRequest("**/api/v1/work-task-completions/*");
    await page.getByRole("button", { name: "Complete task", exact: true }).click();
    await completionRequested;
    await expect(page.getByRole("button", { name: "Back to tasks" })).toBeDisabled();

    const navigation = page.getByRole("navigation", { name: "Primary navigation" });
    const workLink = navigation.getByRole("link", { name: "Work", exact: true });
    await navigation.getByRole("link", { name: "Definitions", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Definitions", exact: true, level: 1 })).toBeVisible();
    await expect(workLink).toHaveAttribute("href", /task=/);

    const completionResponse = page.waitForResponse("**/api/v1/work-task-completions/*");
    finishCompletion();
    await completionResponse;
    await expect(workLink).toHaveAttribute("href", /#\/work$/);
    await expect(page).toHaveURL(/#\/definitions(?:\?|$)/);
    await expect(page.getByRole("heading", { name: "Definitions", exact: true, level: 1 })).toBeVisible();
    expect(mutations).toHaveLength(1);

    await workLink.click();
    await expect(page).toHaveURL(/#\/work$/);
    await expect(page.getByRole("table", { name: "Current tasks" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Complete task", exact: true })).toHaveCount(0);
    expect(mutations).toHaveLength(1);
  } finally {
    finishCompletion();
  }
});

function workUrl(key: string): string {
  return `/#/work?${new URLSearchParams({ task: JSON.stringify(key), view: "form" })}`;
}

function taskKey(page: Page): string | null {
  const raw = new URLSearchParams(new URL(page.url()).hash.split("?")[1]).get("task");
  if (raw === null) return null;
  return JSON.parse(raw) as string;
}

function recordMutations(page: Page): { method: string; url: string; body: string | null }[] {
  const requests: { method: string; url: string; body: string | null }[] = [];
  page.on("request", (request) => {
    if (["POST", "PUT", "DELETE"].includes(request.method()) && new URL(request.url()).pathname.startsWith("/api/")) {
      requests.push({ method: request.method(), url: request.url(), body: request.postData() });
    }
  });
  return requests;
}
