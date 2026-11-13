import type { Locator } from "@playwright/test";

/**
 * One input row of the History view, in revision order: the input kind, the element the row names (`None` when the
 * kernel names none, as for a command), the Signals its command's batch published in order, and whether that batch
 * ended the instance, which the kernel publishes as the root scope (`0`) going idle. A User Task completion is a
 * `write` and a `complete` Signal where the profile installs the submission before completing (CIB's
 * `TaskService.complete`), and part of the command's own transition under the standards OutputSet rule, so the
 * Signals are asserted per model rather than read as "the command completed work".
 */
export type HistoryInput = Readonly<{ input: string; element: string; signals: readonly string[]; endsInstance: boolean }>;

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
      const next = facts.findIndex((later, at) => at > index && later.has("Input"));
      const batch = facts.slice(index + 1, next === -1 ? undefined : next)
        .filter((later) => later.get("Command ID") === command);
      return [{
        input,
        element: row.get("Element") ?? "",
        signals: batch.flatMap((later) => later.has("Signal") ? [later.get("Signal")!] : []),
        endsInstance: batch.some((later) => later.get("Idle scope") === "0"),
      }];
    });
  });
}
