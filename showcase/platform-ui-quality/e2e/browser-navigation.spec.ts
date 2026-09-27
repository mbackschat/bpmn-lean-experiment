import { expect, test } from "@playwright/test";
import { fixtureLabels, installPublicApiFixtures } from "./fixtures.ts";

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
  await page.getByRole("tab", { name: "Start", exact: true }).click();
  await expect(page).toHaveURL(/tab=start/);
  const startUrl = page.url();
  await page.getByRole("tab", { name: "Diagram", exact: true }).click();
  await page.goBack();
  await expect(page.getByRole("tab", { name: "Start", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.goForward();
  await expect(page.getByRole("tab", { name: "Diagram", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.goto(startUrl);
  await expect(page.getByRole("tab", { name: "Start", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.reload();
  await expect(page.getByRole("button", { name: "Start version 7", exact: true })).toBeVisible();
  await navigation.getByRole("link", { name: "Operations", exact: true }).click();
  await page.getByRole("tab", { name: "Audit", exact: true }).click();
  await expect(page).toHaveURL(/#\/operations\?tab=audit/);
  await page.reload();
  await expect(page.getByRole("tab", { name: "Audit", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.goBack();
  await expect(page.getByRole("tab", { name: "Process instances", exact: true })).toHaveAttribute("aria-selected", "true");
});

test("showcase selection has a shareable URL and back restores the catalog", async ({ page }) => {
  await installPublicApiFixtures(page);
  await page.goto("/#/definitions");
  await page.getByRole("button", { name: "Explore process showcases", exact: true }).click();
  await expect(page).toHaveURL(/view=showcases/);
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
  await expect(page.getByRole("tab", { name: "Diagram", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "About", exact: true })).toHaveAttribute("href", /#\/about$/);
  await page.goto('/#/missing');
  await expect(page.getByRole("heading", { name: "Page unavailable" })).toBeVisible();
});
