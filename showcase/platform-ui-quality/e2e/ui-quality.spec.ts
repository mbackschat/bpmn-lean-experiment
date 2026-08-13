import { expect, test } from "@playwright/test";

import {
  assertOwnedActionsFit,
  horizontalOverflowFindings,
} from "./geometry.ts";
import {
  FixtureCompletionState,
  FixturePresentationState,
  FixtureTaskDetailState,
  FixtureWorkState,
  fixtureLabels,
  installPublicApiFixtures,
  waitForStableUi,
} from "./fixtures.ts";
import type { PublicApiFixtureOptions } from "./fixtures.ts";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("geometry oracle finds contained inner overflow when the document still fits", async ({ page }) => {
  await page.setContent(`
    <style>
      html, body { margin: 0; width: 100%; overflow-x: hidden; }
      #owner { width: 320px; overflow: hidden; }
      #planted { width: 960px; }
    </style>
    <main id="owner"><div id="planted">planted overflow</div></main>
  `);

  const documentFits = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
  expect(documentFits).toBe(true);
  await expect(horizontalOverflowFindings(page.locator("#owner"))).resolves.toEqual([
    expect.objectContaining({ selector: "#owner" }),
  ]);
});

test("task collection remains usable and contained at the declared viewport", async ({ page }) => {
  await openFixture(page);
  const workspace = page.locator("main");
  const taskCollection = page.getByRole("table", { name: "Current tasks" });
  await expect(taskCollection).toBeVisible();
  await expect(taskCollection.getByRole("row")).toHaveCount(5);
  await expect(taskCollection).toContainText(fixtureLabels.task);
  await expect(taskCollection).toContainText(fixtureLabels.process);
  await expect(taskCollection).toContainText(fixtureLabels.actor);
  await expect(taskCollection).toContainText(fixtureLabels.group);

  await assertNoOverflow(page.locator("html"), "document");
  await assertNoOverflow(workspace, "workspace");
  await assertNoOverflow(page.locator('[data-ui="data-table-collection"]'), "task collection");
  const rows = taskCollection.getByRole("row");
  for (let index = 1; index < await rows.count(); index += 1) {
    await assertNoOverflow(rows.nth(index), `task row ${index}`);
  }
  await assertOwnedActionsFit(page.getByRole("region", { name: "Tasks" }));

  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh" })).toBeVisible();
});

test("selected task form preserves keyboard navigation and focus return", async ({ page }) => {
  await openFixture(page);
  const taskButton = page.getByRole("button", { name: fixtureLabels.task });
  await expect(taskButton).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Work", exact: true })).toBeFocused();
  await taskButton.focus();
  await page.keyboard.press("Enter");
  const heading = page.getByRole("heading", { name: fixtureLabels.task });
  await expect(heading).toBeFocused();

  const tabs = page.getByRole("tablist", { name: "Task detail views" });
  const formTab = tabs.getByRole("tab", { name: "Form" });
  await expect(formTab).toHaveAttribute("aria-selected", "true");
  await formTab.focus();
  await page.keyboard.press("ArrowRight");
  const diagramTab = tabs.getByRole("tab", { name: "Diagram" });
  await expect(diagramTab).toBeFocused();
  await expect(diagramTab).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowRight");
  const detailsTab = tabs.getByRole("tab", { name: "Details" });
  await expect(detailsTab).toBeFocused();
  await expect(page.getByRole("tabpanel")).toContainText(fixtureLabels.occurrence);
  await page.keyboard.press("ArrowLeft");
  await expect(diagramTab).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(formTab).toBeFocused();

  await page.getByRole("radio", { name: "True" }).press("Space");
  await expect(page.getByRole("radio", { name: "True" })).toBeChecked();
  await assertNoOverflow(page.locator("main"), "selected form workspace");
  await assertNoOverflow(page.getByRole("tabpanel"), "selected form");
  await assertOwnedActionsFit(page.getByRole("tabpanel"));

  await page.getByRole("button", { name: "Back to tasks" }).click();
  await expect(taskButton).toBeFocused();
});

test("reduced motion is active and task-detail diagram stays contained", async ({ page }) => {
  await openFixture(page);
  await page.getByRole("button", { name: fixtureLabels.task }).click();
  await page.getByRole("tab", { name: "Diagram" }).click();
  await waitForStableUi(page);
  const diagram = page.getByLabel(`BPMN diagram for ${fixtureLabels.process}, version 7`);
  await expect(diagram).toBeVisible();
  await expect(page.getByText("Generated layout", { exact: true })).toBeVisible();
  await assertNoOverflow(page.locator("main"), "diagram workspace");
  await assertNoOverflow(diagram, "diagram");
  await assertOwnedActionsFit(page.getByRole("region", {
    name: `${fixtureLabels.process}, version 7`,
  }));
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  const motion = await page.getByRole("tablist", { name: "Task detail views" }).evaluate(
    (element) => {
      const style = getComputedStyle(element);
      return {
        animationDuration: style.animationDuration,
        scrollBehavior: style.scrollBehavior,
        transitionDuration: style.transitionDuration,
      };
    },
  );
  expect(motion).toEqual({
    animationDuration: "0s",
    scrollBehavior: "auto",
    transitionDuration: "0s",
  });
});

test("loading task snapshots are explicit", async ({ page }) => {
  await openFixture(page, { work: FixtureWorkState.Loading }, false);
  await expect(page.getByRole("status")).toHaveText("Loading current tasks…");
  await expect(page.getByRole("table", { name: "Current tasks" })).toBeVisible();
});

test("empty task snapshots are explicit", async ({ page }) => {
  await openFixture(page, { work: FixtureWorkState.Empty });
  await expect(page.getByText("No current tasks.", { exact: true })).toBeVisible();
});

test("task snapshot errors are explicit", async ({ page }) => {
  await openFixture(page, { work: FixtureWorkState.Error });
  await expect(page.getByRole("alert")).toHaveText("The current Work snapshot is unavailable.");
});

test("incompatible form data remains non-editable", async ({ page }) => {
  await openFixture(page, { taskDetail: FixtureTaskDetailState.Incompatible });
  await page.getByRole("button", { name: fixtureLabels.task }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "The current value does not match the declared field type.",
  );
  await expect(page.getByRole("button", { name: "Complete task" })).toHaveCount(0);
  await expect(page.getByRole("radio")).toHaveCount(0);
});

test("source diagram provenance remains truthful", async ({ page }) => {
  await openDefinitionDiagram(page, FixturePresentationState.Source);
  await expect(page.getByText("Source layout", { exact: true })).toBeVisible();
});

test("unavailable diagrams remain truthful", async ({ page }) => {
  await openDefinitionDiagram(page, FixturePresentationState.Unavailable);
  await expect(page.getByRole("alert")).toContainText("No diagram presentation is available.");
});

test("rendering failures remain truthful", async ({ page }) => {
  await openDefinitionDiagram(page, FixturePresentationState.RenderingFailure);
  await expect(page.getByRole("alert")).toContainText("Diagram view is unavailable");
});

test("called Process task diagrams remain honestly unavailable", async ({ page }) => {
  await openFixture(page, { taskDetail: FixtureTaskDetailState.CalledProcess });
  await page.getByRole("button", { name: fixtureLabels.task }).click();
  await page.getByRole("tab", { name: "Diagram" }).click();
  await expect(page.getByRole("status")).toContainText(
    "this task belongs to a called Process",
  );
});

test("task diagrams reject a missing rendered element", async ({ page }) => {
  await openFixture(page, { presentation: FixturePresentationState.MissingTaskElement });
  await page.getByRole("button", { name: fixtureLabels.task }).click();
  await page.getByRole("tab", { name: "Diagram" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "is not present in the rendered diagram",
  );
});

test("completion retry keeps its exact operation and returns focus to the collection", async ({ page }) => {
  await openFixture(page, {
    completion: FixtureCompletionState.TransportIndeterminateCommitted,
    work: FixtureWorkState.EmptyAfterDetail,
  });
  await openCompletableTask(page);
  await page.getByRole("button", { name: "Complete task" }).click();
  const retry = page.getByRole("button", { name: "Retry completion" });
  await expect(retry).toBeFocused();
  await retry.click();
  await expect(page.getByText(
    "Completion is indeterminate. Retry the exact completion request.",
    { exact: true },
  )).toBeVisible();
  const indeterminateRetry = page.getByRole("button", { name: "Retry completion" });
  await expect(indeterminateRetry).toBeFocused();
  await indeterminateRetry.click();
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeFocused();
});

test("rejected completion focuses its alert and missing work returns focus to the collection", async ({ page }) => {
  await openFixture(page, {
    completion: FixtureCompletionState.Rejected,
    work: FixtureWorkState.EmptyAfterDetail,
  });
  await openCompletableTask(page);
  await page.getByRole("button", { name: "Complete task" }).click();
  const rejection = page.getByRole("alert");
  await expect(rejection).toBeFocused();
  await page.getByRole("button", { name: "Back to tasks" }).click();
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeFocused();
});

test("pending completion disables duplicate submission", async ({ page }) => {
  await openFixture(page, { completion: FixtureCompletionState.PendingCommitted });
  await openCompletableTask(page);
  const complete = page.getByRole("button", { name: "Complete task" });
  await complete.click({ noWaitAfter: true });
  await expect(complete).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeFocused();
});

test("task collection visual @visual", async ({ page }) => {
  test.skip(process.platform !== "linux", "Shared visual baselines are Linux-only.");
  await openFixture(page);
  await waitForStableUi(page);
  await expect(page.getByRole("region", { name: "Tasks" })).toHaveScreenshot(
    "task-collection.png",
    screenshotOptions,
  );
});

test("selected form visual @visual", async ({ page }) => {
  test.skip(process.platform !== "linux", "Shared visual baselines are Linux-only.");
  await openFixture(page);
  await page.getByRole("button", { name: fixtureLabels.task }).click();
  await waitForStableUi(page);
  await expect(page.getByRole("region", { name: "Tasks" })).toHaveScreenshot(
    "selected-form.png",
    screenshotOptions,
  );
});

test("generated definition diagram visual @visual", async ({ page }) => {
  test.skip(process.platform !== "linux", "Shared visual baselines are Linux-only.");
  await openFixture(page);
  await page.getByRole("button", { name: "Definitions" }).click();
  await waitForStableUi(page);
  await expect(page.getByText("Generated layout", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", {
    name: `${fixtureLabels.process}, version 7`,
  })).toHaveScreenshot("definition-generated-diagram.png", screenshotOptions);
});

const screenshotOptions = {
  animations: "disabled" as const,
  caret: "hide" as const,
  scale: "css" as const,
};

async function assertNoOverflow(locator: import("@playwright/test").Locator, label: string) {
  const findings = await horizontalOverflowFindings(locator);
  expect(findings, `${label} must not scroll horizontally`).toEqual([]);
}

async function openFixture(
  page: import("@playwright/test").Page,
  options: PublicApiFixtureOptions = {},
  waitForTasks = true,
): Promise<void> {
  await installPublicApiFixtures(page, options);
  await page.goto("/");
  if (waitForTasks && (options.work ?? FixtureWorkState.Normal) === FixtureWorkState.Normal) {
    await expect(page.getByRole("region", { name: "Tasks" })).toBeVisible();
  }
}

async function openDefinitionDiagram(
  page: import("@playwright/test").Page,
  presentation: FixturePresentationState,
): Promise<void> {
  await openFixture(page, { presentation });
  await page.getByRole("button", { name: "Definitions" }).click();
  await expect(page.getByRole("heading", { name: "Definitions", level: 1 })).toBeVisible();
}

async function openCompletableTask(page: import("@playwright/test").Page): Promise<void> {
  await page.getByRole("button", { name: fixtureLabels.task }).click();
  await page.getByRole("radio", { name: "True" }).press("Space");
}
