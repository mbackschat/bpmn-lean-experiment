import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/** Locks the README publication table as one uninterrupted Markdown table. */

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const blockStart = "<!-- publication-statistics:language-footprint:start -->";
const blockEnd = "<!-- publication-statistics:language-footprint:end -->";

test("keeps the generated language footprint rows in one Markdown table", async () => {
  const readme = await readFile(path.join(projectRoot, "README.md"), "utf8");
  const start = readme.indexOf(blockStart);
  const end = readme.indexOf(blockEnd, start);

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.equal(readme.indexOf(blockStart, start + blockStart.length), -1);
  assert.equal(readme.indexOf(blockEnd, end + blockEnd.length), -1);
  assert.match(
    readme.slice(start + blockStart.length, end).trim(),
    /^\| Language \| Files \| Code \| Comments \| Blanks \|\n\|---\|---:\|---:\|---:\|---:\|\n\| Java \|[^\n]+\n\| TypeScript \|[^\n]+\n\| Lean \|[^\n]+$/u,
  );
});
