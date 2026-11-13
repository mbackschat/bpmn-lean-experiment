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

/** Each row ID named in the first cell of an `## Open rows` table row, with the spec that names it. */
function openRowEntries(): { spec: string; row: string }[] {
  const dir = path.join(root, "docs", "kernel", "semantics");
  return readdirSync(dir).filter((name) => name.endsWith(".md")).flatMap((spec) => {
    const section = /^## Open rows\n([\s\S]*?)(?=^## |(?![\s\S]))/mu.exec(readFileSync(path.join(dir, spec), "utf8"));
    return [...(section?.[1] ?? "").matchAll(/^\| ([^|\n]*)\|/gmu)]
      .flatMap((cell) => [...(cell[1] ?? "").matchAll(/PC-[A-Z]+-\d+/gu)].map((id) => ({ spec, row: id[0] })));
  });
}

// Closing a row moved its coverage status to done while the owning semantics specs kept it under "Open rows" three
// times (the pilot, wave 1 and its follow-up closure, 2026-11-10), so a spec kept claiming work owed on a closed row.
test("a closed coverage row is listed in no semantics spec's open rows", () => {
  const done = doneRows();
  assert.ok(done.size > 0, "the coverage target must record closed rows");
  const entries = openRowEntries();
  assert.ok(entries.length > 0, "the semantics specs must list open rows");
  assert.deepEqual(entries.filter((entry) => done.has(entry.row)), []);
});
