import { expect, test } from "@playwright/test";
import { fixtureLabels, installPublicApiFixtures, waitForStableUi } from "./fixtures.ts";

for (const initiallyExpanded of [false, true]) {
  test(`Triggers ${initiallyExpanded ? "collapse" : "expansion"} preserves the reading position @responsive`, async ({ page }) => {
    await installPublicApiFixtures(page);
    await page.goto(`/#/definitions?tab=${initiallyExpanded ? "triggers" : "diagram"}`);
    await waitForStableUi(page, { diagram: true });
    const toggle = page.getByRole("button", { name: `${initiallyExpanded ? "Hide" : "Show"} Triggers`, exact: true });
    await toggle.evaluate((element) => element.scrollIntoView({ block: "end" }));
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(0);
    await toggle.click();
    await expect(page).toHaveURL(initiallyExpanded ? /tab=diagram/ : /tab=triggers/);
    const toggled = page.getByRole("button", { name: `${initiallyExpanded ? "Show" : "Hide"} Triggers`, exact: true });
    await expect(toggled).toHaveAttribute("aria-expanded", String(!initiallyExpanded));
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(before, 0);
    await expect(toggled).toBeInViewport();
    await expect(toggled).toBeFocused();
  });
}

test("Definitions puts Start above its diagram and keeps Triggers in one disclosure @responsive", async ({ page }) => {
  await installPublicApiFixtures(page);
  await page.goto("/#/definitions");
  const start = page.getByRole("button", { name: "Start version 7", exact: true });
  await expect(start).toBeInViewport();
  await expect(page.getByRole("tablist", { name: "Definition views" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start process", exact: true })).toHaveCount(0);
  const diagram = page.locator('[data-ui="definition-diagram-surface"]');
  await expect(diagram).toBeVisible();
  expect((await start.boundingBox())!.y).toBeLessThan((await diagram.boundingBox())!.y);
  await page.screenshot({ path: test.info().outputPath("definitions-start-first.png") });
  const show = page.getByRole("button", { name: "Show Triggers", exact: true });
  await show.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/tab=triggers/);
  const hide = page.getByRole("button", { name: "Hide Triggers", exact: true });
  await expect(hide).toBeFocused();
  await page.keyboard.press("Space");
  await expect(show).toBeFocused();
  await page.goBack();
  await expect(hide).toHaveAttribute("aria-expanded", "true");
  await page.reload();
  await expect(page.getByRole("button", { name: "Hide Triggers", exact: true })).toBeVisible();
});

test("collapsing Triggers preserves a schedule draft without submitting it", async ({ page }) => {
  await installPublicApiFixtures(page);
  const definition = {
    processId: "Scheduled_Process", version: 1,
    source: { kind: "bpmnSource", id: "scheduled.bpmn", sha256: "a".repeat(64), byteLength: 815, declaredEncoding: "UTF-8", decodedAs: "UTF-8" },
    semanticProfile: "timer-start",
    startCapabilities: { messageStarts: [], timerStarts: [{ startEventId: "Start_Timer", durationMs: 1000 }] },
  };
  await page.route("**/api/v1/definitions", (route) => route.fulfill({ json: { definitions: [definition] } }));
  await page.route("**/Scheduled_Process/versions", (route) => route.fulfill({ json: { processId: definition.processId, versions: [definition] } }));
  let mutations = 0;
  page.on("request", (request) => { if (request.method() === "POST") mutations++; });
  await page.goto("/#/definitions?process=Scheduled_Process&version=1&tab=triggers");
  const input = page.getByRole("textbox", { name: "Schedule ID", exact: true });
  await input.fill("retain-my-schedule-draft");
  await page.getByRole("button", { name: "Hide Triggers", exact: true }).click();
  await expect(input).toBeHidden();
  await page.getByRole("button", { name: "Show Triggers", exact: true }).click();
  await expect(input).toHaveValue("retain-my-schedule-draft");
  expect(mutations).toBe(0);
});

test("brand returns to the initial Work page with keyboard and browser history @responsive", async ({ page }) => {
  await installPublicApiFixtures(page);
  await page.goto("/#/work");
  await page.getByRole("button", { name: `Edit task: ${fixtureLabels.task}`, exact: true }).click();
  const taskUrl = page.url();
  const home = page.getByRole("link", { name: "BPMN Lean home", exact: true });
  await expect(home).toHaveAttribute("href", /#\/work$/);
  await home.click();
  await expect(page).toHaveURL(/#\/work$/);
  await expect(page.getByRole("table", { name: "Current tasks" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(taskUrl);
  await expect(page.getByRole("heading", { name: fixtureLabels.task, exact: true })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/#\/work$/);
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "About", exact: true }).click();
  await home.focus();
  await home.press("Enter");
  await expect(page).toHaveURL(/#\/work$/);
  await expect(page.getByRole("heading", { name: "Work", exact: true, level: 1 })).toBeFocused();
  await page.goBack();
  await expect(page).toHaveURL(/#\/about$/);
});

test("workspace and detail links support reload, back and forward @responsive", async ({ page }) => {
  await installPublicApiFixtures(page);
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "Primary navigation" });
  await navigation.getByRole("link", { name: "Definitions", exact: true }).click();
  await expect(page).toHaveURL(/#\/definitions/);
  await expect(page.getByRole("button", { name: "Start version 7", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show Triggers", exact: true }).click();
  const triggersUrl = page.url();
  await page.getByRole("button", { name: "Hide Triggers", exact: true }).click();
  await page.goBack();
  await expect(page.getByRole("button", { name: "Hide Triggers", exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("button", { name: "Show Triggers", exact: true })).toBeVisible();
  await page.goto(triggersUrl);
  await page.reload();
  await expect(page.getByRole("button", { name: "Hide Triggers", exact: true })).toBeVisible();
  await navigation.getByRole("link", { name: "Operations", exact: true }).click();
  await page.getByRole("tab", { name: "Action history", exact: true }).click();
  await expect(page).toHaveURL(/#\/operations\?tab=audit/);
  await page.reload();
  await expect(page.getByRole("tab", { name: "Action history", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.goBack();
  await expect(page.getByRole("tab", { name: "Process instances", exact: true })).toHaveAttribute("aria-selected", "true");
});

test("showcase selection has a shareable URL and back restores the catalog", async ({ page }) => {
  await installPublicApiFixtures(page);
  await page.goto("/#/definitions");
  await page.getByRole("button", { name: "Explore process showcases", exact: true }).click();
  await expect(page).toHaveURL(/view=showcases/);
  await page.getByRole("checkbox", { name: "Include automated examples and engine models" }).check();
  await page.getByRole("button", { name: "Explore Withdraw a resource reservation", exact: true }).click();
  await expect(page).toHaveURL(/model=reservation-withdrawal/);
  const modelUrl = page.url();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Explore process showcases", exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("heading", { name: "Withdraw a resource reservation", exact: true })).toBeVisible();
  await page.goto(modelUrl);
  await expect(page.getByRole("heading", { name: "Withdraw a resource reservation", exact: true })).toBeVisible();
});

test("unknown definition links never fall back to a different executable model", async ({ page }) => {
  await installPublicApiFixtures(page);
  for (const search of ["process=missing", "process=Process_Responsive_Human_Work_Review&version=999"]) {
    await page.goto(`/#/definitions?${search}&tab=start`);
    await expect(page.getByRole("alert")).toContainText(/unavailable/i);
    await expect(page.getByRole("button", { name: /^Start version/ })).toHaveCount(0);
  }
});

test("primary navigation supplies native links and malformed view state uses safe defaults", async ({ page }) => {
  await installPublicApiFixtures(page);
  await page.goto('/#/definitions?tab=unknown&version=-1');
  await expect(page.getByRole("button", { name: "Start version 7", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "About", exact: true })).toHaveAttribute("href", /#\/about$/);
  await page.goto('/#/missing');
  await expect(page.getByRole("heading", { name: "Page unavailable" })).toBeVisible();
});
