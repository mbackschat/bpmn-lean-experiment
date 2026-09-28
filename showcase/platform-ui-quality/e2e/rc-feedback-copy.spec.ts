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
  await expect(page.getByLabel("Include automated examples and engine models")).toBeVisible();
  await expect(page.getByText("Additional models document technical coverage. Automated examples require a separate automation host; they are not interactive human-work showcases.", { exact: true })).toBeVisible();
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Operations", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Process instances", exact: true })).toBeVisible();
  await expect(page.getByText("Instances started through this app, including scheduled and message-triggered starts.", { exact: true })).toBeVisible();
});

test("Process instance cards explain values and keep technical details optional @responsive", async ({ page }) => {
  await installPublicApiFixtures(page);
  const instance = {
    processInstanceId: "example-instance",
    definition: {
      processId: "Process_Order", version: 3, semanticProfile: "example-execution-profile",
      source: { kind: "bpmnSource", id: "orders.bpmn", sha256: "d".repeat(64), byteLength: 1, declaredEncoding: "UTF-8", decodedAs: "UTF-8" },
      startCapabilities: { messageStarts: [], timerStarts: [] },
    },
  };
  await page.route("**/api/v1/process-instances?**", (route) => route.fulfill({ json: {
    instances: [instance, { ...instance, processInstanceId: "another-instance" }], nextCursor: null,
  } }));
  await page.goto("/#/operations");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const table = page.getByRole("table", { name: "Process instances", exact: true });
  await expect(table).toBeVisible();
  await table.locator("..").evaluate((container) => { container.style.maxWidth = "50rem"; });
  const rows = table.locator("tbody tr");
  await expect(rows).toHaveCount(2);
  for (const row of await rows.all()) {
    for (const label of ["Process", "Instance ID", "Definition version", "Technical details", "Action"]) {
      const cell = row.locator(`[data-label="${label}"]`);
      await expect(cell).toBeVisible();
      expect(await cell.evaluate((element) => getComputedStyle(element, "::before").content)).toBe(`"${label}"`);
    }
    await expect(row.getByText("example-execution-profile", { exact: true })).not.toBeVisible();
    const before = (await row.boundingBox())!;
    const show = row.getByRole("button", { name: "Show Technical details", exact: true });
    await show.focus();
    await page.keyboard.press("Enter");
    const toggle = row.getByRole("button", { name: "Hide Technical details", exact: true });
    const controls = await toggle.getAttribute("aria-controls");
    const details = page.locator(`[id="${controls}"]`);
    await expect(details).toBeVisible();
    expect((await details.boundingBox())!.width).toBeGreaterThanOrEqual((await table.boundingBox())!.width * 0.9);
    const expandedSummary = (await row.boundingBox())!;
    expect((await details.boundingBox())!.y).toBeGreaterThanOrEqual(expandedSummary.y + expandedSummary.height - 1);
    expect((await row.boundingBox())!.height).toBeLessThanOrEqual(before.height + 1);
    await expect(details.getByText("BPMN file", { exact: true })).toBeVisible();
    await expect(details.getByText("orders.bpmn", { exact: true })).toBeVisible();
    await expect(details.getByText("example-execution-profile", { exact: true })).toBeVisible();
    await table.screenshot({ path: test.info().outputPath(`process-details-${await rows.count()}.png`) });
    await toggle.focus();
    await page.keyboard.press("Space");
    await expect(show).toBeFocused();
    await expect(row.getByText("example-execution-profile", { exact: true })).not.toBeVisible();
  }
  expect(await table.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await table.screenshot({ path: test.info().outputPath("labelled-process-cards.png") });
});
