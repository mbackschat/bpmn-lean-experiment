import type { Locator } from "@playwright/test";

export type HorizontalOverflowFinding = Readonly<{
  selector: string;
  scrollWidth: number;
  clientWidth: number;
}>;

/** Finds every measured owner whose own content box overflows horizontally. */
export async function horizontalOverflowFindings(
  owner: Locator,
): Promise<HorizontalOverflowFinding[]> {
  return owner.evaluateAll((elements) => elements.flatMap((element) => {
    if (!(element instanceof HTMLElement)) return [];
    const selector = element.id.length > 0
      ? `#${CSS.escape(element.id)}`
      : element.getAttribute("aria-label") === null
        ? element.tagName.toLowerCase()
        : `${element.tagName.toLowerCase()}[aria-label=${JSON.stringify(element.getAttribute("aria-label"))}]`;
    return element.scrollWidth <= element.clientWidth ? [] : [{
      selector,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }];
  }));
}

export async function assertOwnedActionsFit(owner: Locator): Promise<void> {
  const violations = await owner.evaluateAll((owners) => owners.flatMap((candidate) => {
    if (!(candidate instanceof HTMLElement)) return [];
    const ownerBox = candidate.getBoundingClientRect();
    const ownerSelector = candidate.id.length > 0
      ? `#${CSS.escape(candidate.id)}`
      : candidate.getAttribute("aria-label") === null
        ? candidate.tagName.toLowerCase()
        : `${candidate.tagName.toLowerCase()}[aria-label=${JSON.stringify(candidate.getAttribute("aria-label"))}]`;
    return Array.from(candidate.querySelectorAll(
      "button, a, input:not([type=radio]):not([type=checkbox]), select, label[data-rac]",
    ))
      .flatMap((action) => {
        if (!(action instanceof HTMLElement)) return [];
        const box = action.getBoundingClientRect();
        const tolerance = 1;
        return box.left >= ownerBox.left - tolerance &&
          box.right <= ownerBox.right + tolerance
          ? []
          : [{
              action: action.getAttribute("aria-label") ??
                action.textContent?.trim() ??
                action.getAttribute("name") ??
                action.tagName.toLowerCase(),
              actionLeft: box.left,
              actionRight: box.right,
              owner: ownerSelector,
              ownerLeft: ownerBox.left,
              ownerRight: ownerBox.right,
            }];
      });
  }));
  if (violations.length > 0) {
    throw new Error(`Actions escape their owning surface: ${JSON.stringify(violations)}`);
  }
}
