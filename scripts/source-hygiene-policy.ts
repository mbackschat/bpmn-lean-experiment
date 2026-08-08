import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";

import {
  hardCeiling,
  reviewTarget,
  type SourceMeasurement,
} from "./source-measure.ts";

/** Narrow large-file exceptions, fixed by the immutable owner-approval baseline below. */
export const reviewedLargeFiles: ReadonlyMap<string, string> = new Map();
const sourceHygieneExceptionApprovalBaseline = "3467377";

export type SourceHygieneAssessment = Readonly<{
  hardViolations: ReadonlyArray<SourceMeasurement>;
  unreviewed: ReadonlyArray<SourceMeasurement>;
  invalidReviews: ReadonlyArray<string>;
}>;

/** Applies the review target, hard ceiling, and exception-rationale validity rules. */
export function assessSourceHygiene(
  measurements: ReadonlyArray<SourceMeasurement>,
  reviews: ReadonlyMap<string, string>,
): SourceHygieneAssessment {
  const hardViolations = measurements.filter(({ lines }) => lines > hardCeiling);
  const unreviewed = measurements.filter(
    ({ path, lines }) => lines > reviewTarget && !reviews.has(path),
  );
  const invalidReviews: string[] = [];
  for (const [path, rationale] of reviews) {
    const measurement = measurements.find((candidate) => candidate.path === path);
    if (rationale.trim().length === 0) {
      invalidReviews.push(`${path}: empty rationale`);
    } else if (measurement === undefined) {
      invalidReviews.push(`${path}: stale or untracked path`);
    } else if (measurement.lines <= reviewTarget) {
      invalidReviews.push(`${path}: no longer exceeds the review target`);
    } else if (measurement.lines > hardCeiling) {
      invalidReviews.push(`${path}: cannot exempt the hard ceiling`);
    }
  }
  return { hardViolations, unreviewed, invalidReviews };
}

/** Reports every path or rationale that differs from the owner-approved exception set. */
export function sourceHygieneApprovalFindings(
  reviews: ReadonlyMap<string, string>,
  ownerApprovals: ReadonlyMap<string, string>,
): ReadonlyArray<string> {
  const paths = [
    ...new Set([...reviews.keys(), ...ownerApprovals.keys()]),
  ].sort();
  return paths.flatMap((path) => {
    const rationale = reviews.get(path);
    const approvedRationale = ownerApprovals.get(path);
    if (approvedRationale === undefined) {
      return [`${path}: exception lacks owner approval`];
    }
    if (rationale === undefined) {
      return [`${path}: owner-approved exception is absent`];
    }
    return rationale === approvedRationale
      ? []
      : [`${path}: rationale differs from owner approval`];
  });
}

/** Reads the immutable baseline that proves the live exception set has owner approval. */
export function baselineReviewedLargeFileApprovals(): ReadonlyMap<string, string> {
  const exists = spawnSync(
    "git",
    ["cat-file", "-e", `${sourceHygieneExceptionApprovalBaseline}^{commit}`],
    { stdio: "ignore" },
  );
  const isAncestor = spawnSync(
    "git",
    ["merge-base", "--is-ancestor", sourceHygieneExceptionApprovalBaseline, "HEAD"],
    { stdio: "ignore" },
  );
  assert.equal(
    exists.status,
    0,
    "the source-hygiene approval baseline must be a commit",
  );
  assert.equal(
    isAncestor.status,
    0,
    "the source-hygiene approval baseline must remain an ancestor of HEAD",
  );
  const baselinePolicy = execFileSync(
    "git",
    ["show", `${sourceHygieneExceptionApprovalBaseline}:scripts/source-hygiene-policy.ts`],
    { encoding: "utf8" },
  );
  assert.match(
    baselinePolicy,
    /export const reviewedLargeFiles: ReadonlyMap<string, string> = new Map\(\);/u,
    "the immutable owner-approved baseline must declare the empty exception set",
  );
  return new Map();
}
