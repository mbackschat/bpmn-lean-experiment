import { expect, test } from "@playwright/test";
import { installPublicApiFixtures } from "./fixtures.ts";

test("showcases distinguish manual work, simulated participants and retained engine evidence @responsive", async ({ page }) => {
  await installPublicApiFixtures(page);
  await page.route("**/rc-showcase-runtime.json", (route) => route.fulfill({ status: 404 }));
  await page.goto("/");
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("button", { name: "Definitions", exact: true }).click();
  const explore = page.getByRole("button", { name: "Explore process showcases", exact: true });
  await explore.focus();
  await page.keyboard.press("Enter");
  const catalog = page.getByRole("region", { name: "Process showcases" });
  await expect(catalog.getByRole("heading", { name: "Explore process showcases", exact: true })).toBeFocused();
  await expect(catalog.locator("[data-model-id]")).toHaveCount(12);
  await catalog.getByLabel("Find a process or BPMN element").fill("Transaction");
  await expect(catalog.locator("[data-model-id]")).toHaveCount(1);
  await catalog.getByRole("button", { name: "Explore Withdraw a resource reservation", exact: true }).click();
  await expect(catalog.getByRole("heading", { name: "Withdraw a resource reservation", exact: true })).toBeFocused();
  await expect(catalog).toContainText("Cancel Boundary");
  await expect(catalog).toContainText("Guided simulation");
  await expect(catalog.getByRole("button", { name: "Prepare this showcase" })).toBeDisabled();
  await expect(catalog).toContainText("Guided execution is unavailable");
  await expect(catalog).toContainText("Finite scenario agreement is not a universal proof");
  await expect(page.locator("html")).toHaveJSProperty("scrollWidth", await page.locator("html").evaluate((element) => element.clientWidth));
  await catalog.getByRole("button", { name: "Back to showcase catalog" }).click();
  await expect(catalog.getByRole("button", { name: "Explore Withdraw a resource reservation", exact: true })).toBeFocused();
  await catalog.getByLabel("Find a process or BPMN element").fill("");
  await catalog.getByLabel("Include all retained engine models").check();
  await expect(catalog.locator("[data-model-id]")).toHaveCount(45);
  await catalog.getByRole("button", { name: "Explore Prepare two work items in parallel", exact: true }).click();
  await expect(catalog).toContainText("metadata-free");
  await expect(catalog.getByRole("button", { name: "Prepare this showcase" })).toHaveCount(0);
  await catalog.getByRole("button", { name: "Back to definitions" }).click();
  await expect(explore).toBeFocused();
});

test("showcase preparation keeps its originating selection until the response settles", async ({ page }) => {
  await installPublicApiFixtures(page);
  const pending = Promise.withResolvers<void>();
  const requested = Promise.withResolvers<void>();
  await page.route("**/api/v1/definitions?*", async (route) => {
    requested.resolve();
    await pending.promise;
    await route.fulfill({ status: 503, json: { error: { code: "notFound", message: "Preparation unavailable." } } });
  });
  await page.goto("/");
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("button", { name: "Definitions", exact: true }).click();
  await page.getByRole("button", { name: "Explore process showcases", exact: true }).click();
  await page.getByRole("button", { name: "Explore Review content and risk in parallel", exact: true }).click();
  await page.getByRole("button", { name: "Prepare this showcase" }).click();
  await requested.promise;
  try {
    await expect(page.getByRole("button", { name: "Back to showcase catalog" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Back to definitions" })).toBeDisabled();
  } finally { pending.resolve(); }
  await expect(page.getByRole("alert")).toContainText("Preparation unavailable");
  await expect(page.getByRole("button", { name: "Back to showcase catalog" })).toBeEnabled();
});
