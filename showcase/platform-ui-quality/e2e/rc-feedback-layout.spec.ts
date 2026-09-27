import { expect, test } from "@playwright/test";
import { installPublicApiFixtures } from "./fixtures.ts";

test("About captions use the available width without losing desktop table layout @responsive", async ({ page }) => {
  await installPublicApiFixtures(page);
  await page.goto("/");
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "About", exact: true }).click();
  await page.getByRole("button", { name: "Show Executable BPMN elements and variants", exact: true }).click();
  await page.evaluate(() => document.fonts.ready);

  for (const name of [
    "Executable BPMN element and semantic-variant overview",
  ]) {
    const table = page.getByRole("table", { name, exact: true });
    const caption = table.locator("caption");
    await expect(caption).toBeVisible();
    const geometry = await caption.evaluate((element) => {
      const tableElement = element.closest("table")!;
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return {
        widthRatio: bounds.width / tableElement.getBoundingClientRect().width,
        textHeight: bounds.height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
          - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth),
        lineHeight: parseFloat(style.lineHeight),
        captionDisplay: style.display,
        tableDisplay: getComputedStyle(tableElement).display,
      };
    });
    expect.soft(geometry.widthRatio, `${name}: caption occupies the table width`).toBeGreaterThanOrEqual(0.9);
    expect.soft(geometry.textHeight, `${name}: caption fits within two lines`).toBeLessThanOrEqual(geometry.lineHeight * 2 + 1);
    if (page.viewportSize()!.width === 1600) {
      expect(geometry.tableDisplay).toBe("table");
      expect(geometry.captionDisplay).toBe("table-caption");
    }
  }
});
