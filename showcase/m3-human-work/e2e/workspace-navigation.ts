import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

export type Workspace = "About" | "Definitions" | "Operations" | "Work";

/**
 * Opens a workspace through primary navigation and waits for the focus the shell gives it. Operations returns to the
 * Process instance its link retains, whose heading then owns focus, otherwise the workspace heading does. The retained
 * selection is read from the link before the click, never probed afterwards: the detail reloads on return, so a probe
 * of what is visible races its focus (UI release acceptance run 43390329524).
 */
export async function navigate(page: Page, workspace: Workspace): Promise<void> {
  const link = page.getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: workspace, exact: true });
  const heading = page.getByRole("heading", { name: workspace, level: 1 });
  if (await link.getAttribute("aria-current") === "page") {
    await expect(heading).toBeVisible();
    return;
  }
  const href = await link.getAttribute("href");
  if (href === null) throw new Error("Primary navigation must publish its destination.");
  const destinationSearch = new URLSearchParams(new URL(href, page.url()).hash.split("?")[1]);
  // Retained URL selection outlives hidden Activity content: docs/BPM-PLATFORM-INFORMATION-ARCHITECTURE-SPEC.md#browser-location-and-state-ownership.
  const instanceId = workspace === "Operations" ? destinationSearch.get("instance") : null;
  const focusTarget = instanceId === null ? heading : page.getByRole("heading", {
    name: `Process instance ${instanceId}`,
    exact: true,
    level: 2,
  });
  await link.click();
  await expect(heading).toBeVisible();
  await expect(focusTarget).toBeFocused();
}

/** Whether Operations currently shows a retained Process instance, read from the location the shell owns. */
export function operationsRetainsInstance(page: Page): boolean {
  return new URLSearchParams(new URL(page.url()).hash.split("?")[1]).get("instance") !== null;
}
