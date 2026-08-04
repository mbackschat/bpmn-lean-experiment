/**
 * Reads rows out of a maintained Markdown table so a guard can compare its cells.
 *
 * Shared because two guards over different ledgers need the same reading: the BPMN requirement
 * ledger's dispositions and the process-assessment ledger's escalation rule. Both address cells by
 * fixed index, so the column count is checked here rather than at each call site.
 */
import assert from "node:assert/strict";

/**
 * The data rows of the first Markdown table between two headings, header and rule line dropped.
 *
 * @param expectedCellCount asserted per row. A changed column count would otherwise leave a caller's
 * fixed cell indices addressing a different claim while still comparing two equal lists.
 */
export function markdownTableRows(
  markdown: string,
  sectionStart: string,
  sectionEnd: string,
  expectedCellCount: number,
): ReadonlyArray<ReadonlyArray<string>> {
  const start = markdown.indexOf(sectionStart);
  const end = markdown.indexOf(sectionEnd, start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return markdown
    .slice(start, end)
    .split("\n")
    .filter((line) => line.startsWith("| ") && !line.startsWith("|---"))
    .slice(1)
    .map((line) => {
      const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
      assert.equal(cells.length, expectedCellCount);
      return cells;
    });
}

/** Strips the code-span markup a ledger uses around identifiers and dispositions. */
export function withoutBackticks(cell: string): string {
  return cell.replaceAll("`", "");
}
