import assert from "node:assert/strict";
import { test } from "node:test";

import {
  fingerprintReviewSections,
} from "./semantic-review-manifest.ts";

const baseline = `# Capsule

## Semantic rules

Rule A.

## Public contract

Field A.

## Exclusions

Feature B.

## Evidence

Lean and TypeScript.
`;

const selections = {
  account: ["Semantic rules"],
  contract: ["Public contract"],
  exclusions: ["Exclusions"],
  evidence: ["Evidence"],
} as const;

test("the review manifest proves all four closure boundaries unchanged", () => {
  const manifest = fingerprintReviewSections(baseline, baseline, selections);

  assert.equal(manifest.eligibleForWarmClosure, true);
  assert.equal(manifest.sections.length, 4);
  assert.equal(manifest.sections.every(({ unchanged }) => unchanged), true);
  assert.match(manifest.manifestSha256, /^[0-9a-f]{64}$/u);
});

test("the review manifest rejects a changed selected contract", () => {
  const target = baseline.replace("Field A.", "Field A and Field B.");
  const manifest = fingerprintReviewSections(baseline, target, selections);

  assert.equal(manifest.eligibleForWarmClosure, false);
  assert.deepEqual(
    manifest.sections.filter(({ unchanged }) => !unchanged).map(({ category }) => category),
    ["contract"],
  );
});

test("the review manifest rejects omitted or duplicate headings", () => {
  assert.throws(
    () => fingerprintReviewSections(baseline, baseline, {
      ...selections,
      evidence: [],
    }),
    /evidence needs at least one section/u,
  );
  assert.throws(
    () => fingerprintReviewSections(`${baseline}\n## Evidence\n\nDuplicate.\n`, baseline, selections),
    /heading must occur exactly once/u,
  );
});
