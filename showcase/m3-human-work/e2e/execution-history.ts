import type { Locator } from "@playwright/test";

/**
 * One input row of the History view, in revision order: the input kind, the element the row names (`None` when the
 * kernel names none, as for a command) and whether its command's batch completed an occurrence, which the kernel
 * publishes as a `complete` Signal row under the same command ID.
 */
export type HistoryInput = Readonly<{ input: string; element: string; completes: boolean }>;

/** The input rows of the rendered History, read from each row's labelled facts. */
export async function historyInputs(history: Locator): Promise<HistoryInput[]> {
  return await history.locator("[data-revision]").evaluateAll((rows) => {
    // The showcase type-checks without the DOM library, so the term's shape is spelled out.
    type Term = Readonly<{ textContent: string | null; nextElementSibling: Readonly<{ textContent: string | null }> | null }>;
    const facts = rows.map((row) => new Map((Array.from(row.querySelectorAll("dt")) as Term[]).map((term) =>
      [term.textContent ?? "", term.nextElementSibling?.textContent ?? ""] as const)));
    return facts.flatMap((row, index) => {
      const input = row.get("Input");
      if (input === undefined) return [];
      const command = row.get("Command ID");
      const completes = facts.slice(index + 1)
        .some((later) => later.get("Command ID") === command && later.get("Signal") === "complete");
      return [{ input, element: row.get("Element") ?? "", completes }];
    });
  });
}
