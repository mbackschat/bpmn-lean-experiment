import { expect, test } from "@playwright/test";
import { installPublicApiFixtures } from "./fixtures.ts";

test("Definitions separates showcase navigation from model selection @responsive", async ({ page }) => {
  await installPublicApiFixtures(page);
  await page.goto("/");
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Definitions", exact: true }).click();
  const button = page.getByRole("button", { name: "Explore process showcases", exact: true });
  const selection = page.getByRole("region", { name: "Definition selection" });
  const b = (await button.boundingBox())!;
  const s = (await selection.boundingBox())!;
  expect(s.y - b.y - b.height).toBeGreaterThanOrEqual(16);
  await button.click();
  await expect(page.getByLabel("Show additional models (view only)")).toBeVisible();
  await expect(page.getByText("These additional models document engine coverage. They do not have a runnable walkthrough in this app.", { exact: true })).toBeVisible();
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Operations", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Process instances", exact: true })).toBeVisible();
  await expect(page.getByText("Instances started through this app, including scheduled and message-triggered starts.", { exact: true })).toBeVisible();
});
