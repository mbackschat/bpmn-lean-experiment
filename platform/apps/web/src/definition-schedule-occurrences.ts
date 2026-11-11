import type { DefinitionScheduleOccurrence } from "@bpmn-lean/platform-contracts";

/** How many occurrences the picker lists at a time. */
export const occurrencePageSize = 10;

/**
 * One listed page of the engine's occurrences: the selection stays on a still-listed occurrence and otherwise falls to
 * the first; `laterFrom` is where the next page starts, `null` when this page was not full, so no later one exists.
 */
export type OccurrencePage = Readonly<{
  occurrences: readonly DefinitionScheduleOccurrence[];
  selected: string | null;
  laterFrom: string | null;
}>;

export function occurrencePage(
  listed: readonly DefinitionScheduleOccurrence[],
  previousSelection: string | null,
  pageSize: number = occurrencePageSize,
): OccurrencePage {
  const selected = listed.some(({ dueAt }) => dueAt === previousSelection)
    ? previousSelection
    : listed[0]?.dueAt ?? null;
  const last = listed.at(-1);
  const laterFrom = listed.length >= pageSize && last !== undefined
    ? new Date(Date.parse(last.dueAt) + 1).toISOString()
    : null;
  return { occurrences: listed, selected, laterFrom };
}
