import { readFileSync } from "node:fs";
import path from "node:path";

export type CoverageRowState = "open" | "held" | "done";

const stateCell = /^\s*(open|held|done)\b/u;

/**
 * The state of every row of the coverage target's delivery task list, read from the task table's last cell.
 *
 * A row whose last cell starts with none of `open`, `held` and `done` is refused rather than skipped, so a reworded
 * state can never read as "not done".
 */
export function parseCoverageRowStates(target: string): ReadonlyMap<string, CoverageRowState> {
  const states = new Map<string, CoverageRowState>();
  for (const [, id, cells] of target.matchAll(/^\| `(PC-[A-Z]+-\d{2})` \|(.*)\|$/gmu)) {
    const state = stateCell.exec(cells!.slice(cells!.lastIndexOf("|") + 1))?.[1];
    if (state === undefined) throw new Error(`${id}: the state cell starts with none of open, held and done`);
    if (states.has(id!)) throw new Error(`${id}: listed twice in the delivery task list`);
    states.set(id!, state as CoverageRowState);
  }
  return states;
}

export function readCoverageRowStates(projectRoot: string): ReadonlyMap<string, CoverageRowState> {
  return parseCoverageRowStates(readFileSync(path.join(projectRoot, "docs", "PRACTICAL-CIB7-COVERAGE-TARGET.md"), "utf8"));
}
