import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { readCoverageRowStates } from "./coverage-row-states.ts";

const root = path.resolve(import.meta.dirname, "..");

/** The coverage rows whose status cell starts with `done`: the closure record every other document follows. */
function doneRows(): Set<string> {
  return new Set([...readCoverageRowStates(root)].filter(([, state]) => state === "done").map(([row]) => row));
}

/** Each row ID named in the first cell of a table row under a spec text's `## Open rows` heading. */
function openRowIds(text: string): string[] {
  const section = /^## Open rows\n([\s\S]*?)(?=^## |(?![\s\S]))/mu.exec(text);
  return [...(section?.[1] ?? "").matchAll(/^\| ([^|\n]*)\|/gmu)]
    .flatMap((cell) => [...(cell[1] ?? "").matchAll(/PC-[A-Z]+-\d+/gu)].map((id) => id[0]));
}

/** Each row ID a semantics spec lists under `## Open rows`, with the spec that names it. */
function openRowEntries(): { spec: string; row: string }[] {
  const dir = path.join(root, "docs", "kernel", "semantics");
  return readdirSync(dir).filter((name) => name.endsWith(".md")).flatMap((spec) =>
    openRowIds(readFileSync(path.join(dir, spec), "utf8")).map((row) => ({ spec, row })));
}

// Closing a row moved its coverage status to done while the owning semantics specs kept it under "Open rows" three
// times (the pilot, wave 1 and its follow-up closure, 2026-11-10), so a spec kept claiming work owed on a closed row.
test("a closed coverage row is listed in no semantics spec's open rows", () => {
  const done = doneRows();
  assert.ok(done.size > 0, "the coverage target must record closed rows");
  assert.deepEqual(openRowEntries().filter((entry) => done.has(entry.row)), []);
});

// Every spec may legitimately list no open row once its rows close, so the reader is held to a seeded spec instead of
// to the live documents: it must find the first-cell IDs of the Open rows table and nothing outside that section.
test("the open-rows reader finds each first-cell row ID of the Open rows section only", () => {
  const spec = [
    "## Interpretation", "", "| PC-FLOW-09 | outside the section |", "",
    "## Open rows", "", "| Row | Owed |", "|---|---|", "| PC-BASIC-03 | waits on PC-JOURNEY-01 |", "| PC-CF-02, PC-CF-03 | both |", "",
    "## Sources", "", "| PC-MI-01 | outside again |", "",
  ].join("\n");
  assert.deepEqual(openRowIds(spec), ["PC-BASIC-03", "PC-CF-02", "PC-CF-03"]);
  assert.deepEqual(openRowIds("## Open rows\n\nNone: every row this document owns is closed.\n"), []);
});
