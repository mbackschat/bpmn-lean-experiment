import { expect, test } from "@playwright/test";

import { mvpCapabilityCatalog } from "../../../model-corpus/mvp-capabilities.ts";
import { muePreviewBetaTestOracle } from "../../../scripts/mue-preview-beta-test-oracle.ts";

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

test("task collection remains usable and contained at the declared viewport @responsive", async ({ page }) => {
  await openFixture(page);
  const workspace = page.locator("main");
  const taskCollection = page.getByRole("table", { name: "Current tasks" });
  await expect(taskCollection).toBeVisible();
  await expect(taskCollection.getByRole("row")).toHaveCount(5);
  await expect(taskCollection).toContainText(fixtureLabels.task);
  await expect(taskCollection).toContainText(fixtureLabels.process);
  await expect(taskCollection).toContainText(fixtureLabels.actor);
  await expect(taskCollection).toContainText(fixtureLabels.group);
  await expect(taskCollection.locator("tbody td").evaluateAll((cells) =>
    cells.flatMap((cell, index) =>
      getComputedStyle(cell).overflowWrap === "anywhere" ? [] : [index]
    )
  ), "every table cell must wrap identifier-shaped content").resolves.toEqual([]);

  await assertNoOverflow(page.locator("html"), "document");
  await assertNoOverflow(workspace, "workspace");
  await assertNoOverflow(page.locator('[data-ui="data-table-collection"]'), "task collection");
  const rows = taskCollection.getByRole("row");
  for (let index = 1; index < await rows.count(); index += 1) {
    await assertNoOverflow(rows.nth(index), `task row ${index}`);
  }
  await assertOwnedActionsFit(page.getByRole("region", { name: "Tasks" }));
  for (const claim of await taskCollection.getByRole("button", { name: "Claim", exact: true }).all()) {
    const box = (await claim.boundingBox())!;
    expect(box.width).toBeLessThan(200);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }

  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh" })).toBeVisible();
});

test("selected task form preserves keyboard navigation and focus return @responsive", async ({ page }) => {
  await openFixture(page);
  const taskButton = page.getByRole("button", { name: `Edit task: ${fixtureLabels.task}`, exact: true });
  await expect(taskButton).toHaveText("Edit task");
  const taskRow = page.getByRole("row").filter({ hasText: fixtureLabels.task });
  await expect(taskRow.getByRole("cell").first().getByRole("button")).toHaveCount(0);
  await expect(taskRow.getByRole("cell").last().getByRole("button", { name: `Edit task: ${fixtureLabels.task}`, exact: true })).toBeVisible();
  await expect(taskButton).toHaveCSS("background-color", "rgb(15, 107, 92)");
  await expect(page.getByRole("table", { name: "Current tasks" }).getByText(fixtureLabels.task, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: fixtureLabels.task, exact: true })).toHaveCount(0);
  await expect(taskButton).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "BPMN Lean home", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Work", exact: true })).toBeFocused();
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

test("About groups capability families with independent and bulk collapse @responsive", async ({ page }) => {
  await openFixture(page);
  await page.getByRole("link", { name: "About", exact: true }).click();
  await page.getByRole("button", { name: "Show Executable BPMN elements and variants", exact: true }).click();
  const families = [...new Set(mvpCapabilityCatalog.capabilities.map(({ family }) => family))];
  const overview = page.getByRole("region", { name: "Executable BPMN element and semantic-variant overview", exact: true });
  await expect(overview).toBeVisible();
  await expect(overview.getByRole("table")).toHaveCount(0);
  for (const family of families) {
    const count = mvpCapabilityCatalog.capabilities.filter((entry) => entry.family === family).length;
    await expect(overview.getByRole("button", { name: `Show ${family} (${count})`, exact: true })).toHaveAttribute("aria-expanded", "false");
  }
  const first = overview.getByRole("button", { name: /^Show Process structure / });
  await first.focus();
  await page.keyboard.press("Enter");
  await expect(overview.getByRole("table")).toHaveCount(1);
  const hide = overview.getByRole("button", { name: /^Hide Process structure / });
  await expect(hide).toBeFocused();
  await page.keyboard.press("Space");
  await expect(first).toBeFocused();
  await expect(overview.getByRole("table")).toHaveCount(0);
  await overview.getByRole("button", { name: "Expand all families", exact: true }).click();
  await expect(overview.getByRole("table")).toHaveCount(families.length);
  await overview.getByRole("button", { name: "Collapse all families", exact: true }).click();
  await expect(overview.getByRole("table")).toHaveCount(0);
  await expect(overview.getByRole("button", { name: "Collapse all families", exact: true })).toBeFocused();
  await assertNoOverflow(overview, "collapsed family overview");
});

test("About exposes the versioned capability boundary without overflow @responsive", async ({ page }) => {
  await openFixture(page);
  await page.getByRole("link", { name: "About", exact: true }).click();

  await expect(page.getByRole("heading", { name: "About", level: 1 })).toBeFocused();
  await expect(page.getByRole("heading", { name: "BPMN Lean 0.1.0" })).toBeVisible();
  await expect(page.getByText("Not a conformance claim.", { exact: true })).toBeVisible();
  await expect(page.getByText("CIB Seven 2.2.0", { exact: true })).toBeVisible();
  const showCheckpoints = page.getByRole("button", { name: "Show Implementation checkpoints", exact: true });
  await expect(page.getByRole("list", { name: "Implementation checkpoints" })).not.toBeVisible();
  await showCheckpoints.focus();
  await page.keyboard.press("Enter");
  const checkpoints = page.getByRole("list", { name: "Implementation checkpoints" });
  await expect(checkpoints).toBeVisible();
  await expect(checkpoints.getByRole("button")).toHaveCount(0);
  await expect(checkpoints.locator("[data-beta-content-id]")).toHaveCount(
    muePreviewBetaTestOracle.length,
  );
  expect(await checkpoints.locator("[data-beta-content-id]").evaluateAll((rows) =>
    rows.map((row) => row.getAttribute("data-beta-content-id"))
  )).toEqual(muePreviewBetaTestOracle.map(({ id }) => id));
  for (const expectation of muePreviewBetaTestOracle) {
    const row = checkpoints.locator(`[data-beta-content-id="${expectation.id}"]`);
    await expect(row.getByRole("heading", { name: expectation.title, exact: true })).toBeVisible();
    await expect(row.locator("dd").nth(0)).toHaveText(expectation.evidenceLabel);
    await expect(row.locator("dd").nth(1)).toHaveText(expectation.productSurfaceLabel);
    await expect(row.locator("dd").nth(2)).toHaveText(
      `${expectation.boundary}; ${expectation.remainingLimit}`,
    );
    await assertNoOverflow(row, "expanded checkpoint");

  }
  const showCapabilities = page.getByRole("button", { name: "Show Executable BPMN elements and variants", exact: true });
  await showCapabilities.click();
  const capabilityTable = page.getByRole("region", {
    name: "Executable BPMN element and semantic-variant overview",
  });
  await capabilityTable.getByRole("button", { name: "Expand all families", exact: true }).click();
  await expect(checkpoints).toBeVisible();
  await expect(capabilityTable.locator("tbody tr")).toHaveCount(
    mvpCapabilityCatalog.capabilities.length,
  );
  expect(await capabilityTable.locator("tbody tr").evaluateAll((rows) =>
    rows.map((row) => row.getAttribute("data-capability-id")).sort()
  )).toEqual(mvpCapabilityCatalog.capabilities.map(({ id }) => id).sort());
  const timerStart = capabilityTable.locator('[data-capability-id="timerStartEvent"]');
  await expect(timerStart).toContainText("Timer Start Event");
  await expect(timerStart).toContainText("no recurrence or calendar form");
  await expect(timerStart).toContainText("No CIB target selected");

  await assertNoOverflow(page.locator("html"), "About document");
  await assertNoOverflow(page.locator("main"), "About workspace");
  await assertNoOverflow(checkpoints, "checkpoint disclosures");
  await assertNoOverflow(capabilityTable, "capability table");
  for (const [title, content] of [
    ["Implementation checkpoints", checkpoints],
    ["Executable BPMN elements and variants", capabilityTable],
  ] as const) {
    const hide = page.getByRole("button", { name: `Hide ${title}`, exact: true });
    await hide.focus();
    await page.keyboard.press("Space");
    await expect(content).not.toBeVisible();
    const show = page.getByRole("button", { name: `Show ${title}`, exact: true });
    await expect(show).toBeFocused();
    const section = page.locator('[data-ui="inline-disclosure"]').filter({ has: show });
    expect((await section.boundingBox())!.height).toBeCloseTo((await show.boundingBox())!.height, 0);
  }
});

test("reduced motion is active and task-detail diagram stays contained @responsive", async ({ page }) => {
  await openFixture(page);
  await page.getByRole("button", { name: `Edit task: ${fixtureLabels.task}` }).click();
  await page.getByRole("tab", { name: "Diagram" }).click();
  await waitForStableUi(page, { diagram: true });
  const completeDiagram = page.getByRole("region", {
    name: `Complete diagram workspace for ${fixtureLabels.process}, version 7`,
    exact: true,
  });
  await expect(completeDiagram).toBeVisible();
  const diagram = page.getByLabel(`BPMN diagram for ${fixtureLabels.process}, version 7`);
  await expect(diagram).toBeVisible();
  await expect(completeDiagram.getByRole("heading", {
    name: `${fixtureLabels.process}, version 7`,
  })).toBeVisible();
  await expect(completeDiagram.getByText("Generated layout", { exact: true })).toBeVisible();
  await expect(completeDiagram.getByText("Derived presentation copy, not admitted source.")).toBeVisible();
  await expect(completeDiagram.getByRole("button", {
    name: "Download diagrammed BPMN",
  })).toBeVisible();
  await expect(completeDiagram.getByText(/aaaaaaaaaaaa/u)).toBeVisible();
  await assertNoOverflow(page.locator("main"), "diagram workspace");
  await assertNoOverflow(completeDiagram, "complete diagram workspace");
  await assertOwnedActionsFit(completeDiagram);
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

test("empty task snapshots keep Refresh content-sized in narrow containers @responsive", async ({ page }) => {
  await openFixture(page, { work: FixtureWorkState.Empty });
  await expect(page.getByText("No current tasks.", { exact: true })).toBeVisible();
  const panel = page.getByRole("region", { name: "Tasks", exact: true });
  await panel.evaluate((element) => { element.style.maxWidth = "740px"; });
  const refresh = panel.getByRole("button", { name: "Refresh", exact: true });
  expect((await refresh.boundingBox())!.width).toBeLessThan(160);
  expect((await refresh.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await refresh.focus();
  await page.keyboard.press("Enter");
  await expect(refresh).toBeEnabled();
  await expect(refresh).toBeFocused();
  await panel.screenshot({ path: test.info().outputPath("compact-refresh.png") });
});

test("task completion actions stay content-sized in narrow containers @responsive", async ({ page }) => {
  await openFixture(page);
  await page.locator("main").evaluate((element) => { element.style.maxWidth = "740px"; });
  await openCompletableTask(page);
  const complete = page.getByRole("button", { name: "Complete task", exact: true });
  await expect(complete).toBeVisible();
  expect((await complete.boundingBox())!.width).toBeLessThan(220);
  expect((await complete.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await assertOwnedActionsFit(page.locator("main"));
});

test("unclaimed tasks cannot enter the completion flow", async ({ page }) => {
  await openFixture(page);
  const row = page.getByRole("table", { name: "Current tasks" })
    .getByRole("row")
    .filter({ hasText: "Validate corporate ownership evidence" });

  await expect(row.getByText("Unclaimed", { exact: true })).toBeVisible();
  await expect(row.getByRole("button", {
    name: "Edit task: Validate corporate ownership evidence",
    exact: true,
  })).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Claim", exact: true })).toBeVisible();
});

test("task snapshot errors are explicit", async ({ page }) => {
  await openFixture(page, { work: FixtureWorkState.Error });
  await expect(page.getByRole("alert")).toHaveText("The current Work snapshot is unavailable.");
});

test("incompatible form data remains non-editable", async ({ page }) => {
  await openFixture(page, { taskDetail: FixtureTaskDetailState.Incompatible });
  await page.getByRole("button", { name: `Edit task: ${fixtureLabels.task}` }).click();
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
  await page.getByRole("button", { name: `Edit task: ${fixtureLabels.task}` }).click();
  await page.getByRole("tab", { name: "Diagram" }).click();
  await expect(page.getByRole("status")).toContainText(
    "this task belongs to a called Process",
  );
});

test("task diagrams reject a missing rendered element", async ({ page }) => {
  await openFixture(page, { presentation: FixturePresentationState.MissingTaskElement });
  await page.getByRole("button", { name: `Edit task: ${fixtureLabels.task}` }).click();
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

test("known completion conflicts are not presented as unknown delivery", async ({ page }) => {
  await openFixture(page, { completion: FixtureCompletionState.KnownConflict });
  await openCompletableTask(page);
  await page.getByRole("button", { name: "Complete task" }).click();

  await expect(page.getByRole("alert")).toHaveText(
    "Completion was not accepted because the task claim is no longer current.",
  );
  await expect(page.getByRole("button", { name: "Retry completion" })).toHaveCount(0);
  await expect(page.getByText(/delivery is unknown/iu)).toHaveCount(0);
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
  await page.getByRole("link", { name: "Definitions" }).click();
  await expect(page.getByRole("heading", { name: "Definitions", level: 1 })).toBeVisible();
}

async function openCompletableTask(page: import("@playwright/test").Page): Promise<void> {
  await page.getByRole("button", { name: `Edit task: ${fixtureLabels.task}` }).click();
  await page.getByRole("radio", { name: "True" }).press("Space");
}
