import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const surfaceSectionStart = "## Implemented and absent surfaces";
const surfaceSectionEnd = "## Current evidence";
const maximumReviewUnitWords = 120;

function surfaceSection(markdown: string): string {
  const start = markdown.indexOf(surfaceSectionStart);
  const end = markdown.indexOf(surfaceSectionEnd, start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return markdown.slice(start, end);
}

function wordCount(value: string): number {
  return value.trim().split(/\s+/u).filter(Boolean).length;
}

test("keeps implementation surfaces reviewable outside dense table cells", async () => {
  const implementationMap = await readFile(
    path.join(projectRoot, "docs/IMPLEMENTATION-MAP.md"),
    "utf8",
  );
  const section = surfaceSection(implementationMap);
  const tableRows = section
    .split("\n")
    .filter((line) => line.trimStart().startsWith("|"));
  const oversizedUnits = section
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return (
        trimmed.length > 0 &&
        !trimmed.startsWith("#") &&
        wordCount(trimmed) > maximumReviewUnitWords
      );
    })
    .map((line) => wordCount(line));

  assert.deepEqual(tableRows, []);
  assert.deepEqual(oversizedUnits, []);
});
