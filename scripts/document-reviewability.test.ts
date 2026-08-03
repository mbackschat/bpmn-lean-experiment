import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const surfaceSectionStart = "## Implemented and absent surfaces";
const surfaceSectionEnd = "## Current evidence";
const maximumReviewUnitWords = 120;
const profileCapabilitySectionStart = "## Current profile capabilities";
const profileCapabilitySectionEnd = "## Structural validators";
const semanticProfileMapStart =
  "export const SemanticProfileId = Object.freeze({";
const semanticProfileMapEnd = "} as const);";

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

function profileCapabilityRows(markdown: string): ReadonlyArray<string> {
  const start = markdown.indexOf(profileCapabilitySectionStart);
  const end = markdown.indexOf(profileCapabilitySectionEnd, start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return markdown.slice(start, end).split("\n").filter((line) =>
    line.startsWith("| ") &&
    !line.startsWith("| Profile |") &&
    !line.startsWith("|---")
  );
}

function registeredSemanticProfileIds(source: string): ReadonlyArray<string> {
  const start = source.indexOf(semanticProfileMapStart);
  const end = source.indexOf(semanticProfileMapEnd, start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const section = source.slice(start, end);
  const profileIds = [...section.matchAll(/:\s*"([^"]+)"/gu)].map(
    (match) => {
      const profileId = match[1];
      if (profileId === undefined) {
        throw new Error("Semantic profile registry entry has no string value.");
      }
      return profileId;
    },
  );
  assert.equal(new Set(profileIds).size, profileIds.length);
  return profileIds;
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

test("covers every registered semantic profile in the admission capability table", async () => {
  const admissionSpecification = await readFile(
    path.join(projectRoot, "docs/PROFILE-PARAMETERIZED-ADMISSION-SPEC.md"),
    "utf8",
  );
  const profileSource = await readFile(
    path.join(
      projectRoot,
      "packages/semantic-core/src/semantic-process-profile.ts",
    ),
    "utf8",
  );
  const rows = profileCapabilityRows(admissionSpecification);
  const profileIds = registeredSemanticProfileIds(profileSource);
  const rowCounts = new Map(
    profileIds.map((profileId) => [
      profileId,
      rows.filter((row) => row.includes(`\`${profileId}\``)).length,
    ]),
  );

  assert.deepEqual(
    {
      rowCount: rows.length,
      missingOrDuplicateProfiles: profileIds.filter(
        (profileId) => rowCounts.get(profileId) !== 1,
      ),
    },
    {
      rowCount: profileIds.length,
      missingOrDuplicateProfiles: [],
    },
  );
});
