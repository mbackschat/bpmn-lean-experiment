import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";

import {
  hardCeiling,
  reviewTarget,
  type SourceMeasurement,
} from "./source-measure.ts";

/**
 * Large-file exceptions the owner approved, recorded in a commit of their own. They take effect only once a later
 * commit names that commit as the baseline and lists them in `reviewedLargeFiles`, so no commit approves the
 * exceptions it activates.
 */
export const ownerApprovedLargeFiles: ReadonlyMap<string, string> = new Map([
  ["BpmnSemantics/SemanticProcess/InternalCommutationStateFrames.lean", "Owner decision A, corrected on 2026-10-29: the hidden-bodies conversion grew this module only by `import all` lines the minimizer proved necessary and by `run_meta privateEquations` calls (owner decision 2) that keep its rewrites' equation lemmas private; its declarations did not grow."],
  ["BpmnSemantics/SemanticProcess/InternalRegionalPairLifecycleFrame.lean", "Owner decision A, corrected on 2026-10-29: the hidden-bodies conversion grew this module only by `import all` lines the minimizer proved necessary and by `run_meta privateEquations` calls (owner decision 2) that keep its rewrites' equation lemmas private; its declarations did not grow."],
  ["BpmnSemantics/SemanticProcess/MixedTaskControlFlowDataProofs.lean", "Owner decision A, corrected on 2026-10-29: the hidden-bodies conversion grew this module only by `import all` lines the minimizer proved necessary and by `run_meta privateEquations` calls (owner decision 2) that keep its rewrites' equation lemmas private; its declarations did not grow."],
  ["BpmnSemantics/SemanticProcess/MixedTaskControlFlowLifecycleProofs.lean", "Owner decision A, corrected on 2026-10-29: the hidden-bodies conversion grew this module only by `import all` lines the minimizer proved necessary and by `run_meta privateEquations` calls (owner decision 2) that keep its rewrites' equation lemmas private; its declarations did not grow."],
  ["BpmnSemantics/SemanticProcess/ParallelMultiInstanceRuntimeStateEntryPreservation.lean", "Owner decision A, corrected on 2026-10-29: the hidden-bodies conversion grew this module only by `import all` lines the minimizer proved necessary and by `run_meta privateEquations` calls (owner decision 2) that keep its rewrites' equation lemmas private; its declarations did not grow."],
  ["BpmnSemantics/SemanticProcess/ParallelMultiInstanceRuntimeWellFormedness.lean", "Owner approval of every size exception found in this session (\"I confirm all 18 exceptions with the corrected reason, yes and all exceptions you find in this session!\"); measured 801 nonblank lines on 2026-10-31: F2 stage 2 grew this module from 800 only by one `run_meta privateEquations` call line that keeps the equation lemmas of the three hidden RuntimeState definitions its proofs rewrite with private; its declarations did not grow."],
  ["BpmnSemantics/SemanticProcess/ParallelScopeCommandReplay.lean", "Owner decision A, corrected on 2026-10-29: the hidden-bodies conversion grew this module only by `import all` lines the minimizer proved necessary and by `run_meta privateEquations` calls (owner decision 2) that keep its rewrites' equation lemmas private; its declarations did not grow."],
  ["BpmnSemantics/SemanticProcess/ParallelScopeLifetimeAccounting.lean", "Owner decision A, corrected on 2026-10-29: the hidden-bodies conversion grew this module only by `import all` lines the minimizer proved necessary and by `run_meta privateEquations` calls (owner decision 2) that keep its rewrites' equation lemmas private; its declarations did not grow."],
  ["BpmnSemantics/SemanticProcess/ParallelScopeParentAccounting.lean", "Owner decision A, corrected on 2026-10-29: the hidden-bodies conversion grew this module only by `import all` lines the minimizer proved necessary and by `run_meta privateEquations` calls (owner decision 2) that keep its rewrites' equation lemmas private; its declarations did not grow."],
  ["BpmnSemantics/SemanticProcess/ParallelScopeProgress.lean", "Owner decision A, corrected on 2026-10-29: the hidden-bodies conversion grew this module only by `import all` lines the minimizer proved necessary and by `run_meta privateEquations` calls (owner decision 2) that keep its rewrites' equation lemmas private; its declarations did not grow."],
  ["BpmnSemantics/SemanticProcess/ParallelScopeRetirementProgress.lean", "Owner decision A, corrected on 2026-10-29: the hidden-bodies conversion grew this module only by `import all` lines the minimizer proved necessary and by `run_meta privateEquations` calls (owner decision 2) that keep its rewrites' equation lemmas private; its declarations did not grow."],
  ["BpmnSemantics/SemanticProcess/SequentialScopeRuntimeValidityProofs.lean", "Owner decision A, corrected on 2026-10-29: the hidden-bodies conversion grew this module only by `import all` lines the minimizer proved necessary and by `run_meta privateEquations` calls (owner decision 2) that keep its rewrites' equation lemmas private; its declarations did not grow."],
  ["BpmnSemantics/SemanticProcess/SequentialScopeTransition.lean", "Owner decision A, corrected on 2026-10-29: the hidden-bodies conversion grew this module only by `import all` lines the minimizer proved necessary and by `run_meta privateEquations` calls (owner decision 2) that keep its rewrites' equation lemmas private; its declarations did not grow."],
  ["BpmnSemantics/SemanticProcess/SerialBusinessTaskLifecycleProofs.lean", "Owner decision A, corrected on 2026-10-29: the hidden-bodies conversion grew this module only by `import all` lines the minimizer proved necessary and by `run_meta privateEquations` calls (owner decision 2) that keep its rewrites' equation lemmas private; its declarations did not grow."],
  ["BpmnSemantics/SemanticProcess/SerialBusinessTaskProgressProofs.lean", "Owner decision A, corrected on 2026-10-29: the hidden-bodies conversion grew this module only by `import all` lines the minimizer proved necessary and by `run_meta privateEquations` calls (owner decision 2) that keep its rewrites' equation lemmas private; its declarations did not grow."],
  ["BpmnSemantics/SemanticProcess/StructuredCompositionAdmissionProofs.lean", "Owner decision A, corrected on 2026-10-29: the hidden-bodies conversion grew this module only by `import all` lines the minimizer proved necessary and by `run_meta privateEquations` calls (owner decision 2) that keep its rewrites' equation lemmas private; its declarations did not grow."],
  ["BpmnSemantics/SemanticProcess/StructuredCompositionClosureProofs.lean", "Owner decision A, corrected on 2026-10-29: the hidden-bodies conversion grew this module only by `import all` lines the minimizer proved necessary and by `run_meta privateEquations` calls (owner decision 2) that keep its rewrites' equation lemmas private; its declarations did not grow."],
  ["BpmnSemantics/SemanticProcess/StructuredCompositionControlProofs.lean", "Owner decision A, corrected on 2026-10-29: the hidden-bodies conversion grew this module only by `import all` lines the minimizer proved necessary and by `run_meta privateEquations` calls (owner decision 2) that keep its rewrites' equation lemmas private; its declarations did not grow."],
  ["BpmnSemantics/SemanticProcess/StructuredCompositionDataProofs.lean", "Owner decision A, corrected on 2026-10-29: the hidden-bodies conversion grew this module only by `import all` lines the minimizer proved necessary and by `run_meta privateEquations` calls (owner decision 2) that keep its rewrites' equation lemmas private; its declarations did not grow."],
  ["scripts/lean-fanout-bounds.ts", "Owner approval of every size exception found in this session (\"I confirm all 18 exceptions with the corrected reason, yes and all exceptions you find in this session!\"); measured 859 nonblank lines on 2026-10-31: the #55 re-seed brought it to 827 on 2026-10-30 with the ratchet entries and reason constants for the recorded generated-lemma leaks, the helper's new importers and the leak witness's rewrite allowance, and F2 of the closure review added the kernel modules' body-edit bounds, hidden-edit bounds and allowance entries, their reasons and two owner-decision entries (+29), and the afd2b1ba closure review's corrections the measured reasons of three kernel modules that still export bodies (+3). A split per ratchet must keep the rise, debt and owner-decision guards, which read this one file at the base commit, so it is a change of its own."],
]);
/** Narrow large-file exceptions in force; each must equal an approval the baseline below records. */
export const reviewedLargeFiles: ReadonlyMap<string, string> = new Map(ownerApprovedLargeFiles);
const sourceHygieneExceptionApprovalBaseline = "ae04dabe";

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
  return ownerApprovalsIn(execFileSync(
    "git",
    ["show", `${sourceHygieneExceptionApprovalBaseline}:scripts/source-hygiene-policy.ts`],
    { encoding: "utf8" },
  ));
}

/**
 * The `ownerApprovedLargeFiles` entries a policy source records, or none when it records no such constant. The source
 * is read as text, because a committed revision cannot import its workspace dependencies; an entry that is not a pair
 * of string literals throws rather than reading as no approval.
 */
export function ownerApprovalsIn(policySource: string): ReadonlyMap<string, string> {
  const declaration = /export const ownerApprovedLargeFiles: ReadonlyMap<string, string> = new Map\((?:\[([\s\S]*?)\n\])?\);/u
    .exec(policySource);
  if (declaration?.[1] === undefined) return new Map();
  const literal = String.raw`"((?:[^"\\]|\\.)*)"`;
  return new Map(declaration[1].split("\n").filter((line) => line.trim() !== "").map((line) => {
    const entry = new RegExp(String.raw`^\s*\[${literal},\s*${literal}\],?\s*$`, "u").exec(line);
    if (entry === null) throw new Error(`unreadable owner approval: ${line.trim()}`);
    return [JSON.parse(`"${entry[1]}"`), JSON.parse(`"${entry[2]}"`)] as const;
  }));
}
