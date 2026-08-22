import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

export const subagentReviewPolicyBaseline = "b361681";

export const ReviewStage = Object.freeze({
  Proposal: "Proposal",
  SemanticCheckpoint: "Semantic checkpoint",
  Closure: "Closure",
} as const);

export type ReviewStage = (typeof ReviewStage)[keyof typeof ReviewStage];

export type ReviewReceipt = Readonly<{
  stage: ReviewStage;
  target: string;
  isolation: string;
  verdict: string;
  correctionAudit: string;
}>;

const receiptHeading = "## Independent cold-review receipt";
const commitPattern = /^[0-9a-f]{7,40}$/u;
const approvedVerdicts = new Set(["approve", "approve-with-required-edits"]);

/** The standing per-stage correction-audit bound. Exceeding it takes an owner authorization. */
const standingCorrectionAuditBound = 2;

/** Attests an owner authorization Git cannot check, the same way `fork-turns-none` does. */
const ownerAuthorizedRounds = "owner-authorized";

export const ProposalLifecycle = Object.freeze({
  Draft: "draft",
  OwnerApproved: "owner-approved",
  ImplementationInProgress: "implementation-in-progress",
  ImplementedAwaitingClosure: "implemented-awaiting-closure",
  Superseded: "superseded",
  Archived: "archived",
} as const);

export type ProposalLifecycle =
  (typeof ProposalLifecycle)[keyof typeof ProposalLifecycle];

export const ProposalReview = Object.freeze({
  Pending: "pending",
  Approved: "approved",
  ApprovedWithRequiredEdits: "approved-with-required-edits",
  Rejected: "rejected",
  NotRequired: "not-required",
} as const);

export type ProposalReview = (typeof ProposalReview)[keyof typeof ProposalReview];

export type ProposalStatus = Readonly<{
  lifecycle: ProposalLifecycle;
  review: ProposalReview;
}>;

function proposalLifecycle(value: string): ProposalLifecycle {
  switch (value) {
    case ProposalLifecycle.Draft:
    case ProposalLifecycle.OwnerApproved:
    case ProposalLifecycle.ImplementationInProgress:
    case ProposalLifecycle.ImplementedAwaitingClosure:
    case ProposalLifecycle.Superseded:
    case ProposalLifecycle.Archived:
      return value;
    default:
      return assert.fail(`unknown proposal lifecycle: ${value}`);
  }
}

function proposalReview(value: string): ProposalReview {
  switch (value) {
    case ProposalReview.Pending:
    case ProposalReview.Approved:
    case ProposalReview.ApprovedWithRequiredEdits:
    case ProposalReview.Rejected:
    case ProposalReview.NotRequired:
      return value;
    default:
      return assert.fail(`unknown proposal review: ${value}`);
  }
}

export function parseProposalStatus(document: string): ProposalStatus {
  const statusHeading = /^## Status\s*$/mu.exec(document);
  assert.ok(statusHeading, "active proposal needs a Status section");
  const statusStart = statusHeading.index + statusHeading[0].length;
  const followingHeading = /^##\s+/gmu;
  followingHeading.lastIndex = statusStart;
  const next = followingHeading.exec(document);
  const lines = document.slice(statusStart, next?.index ?? document.length)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  assert.equal(lines.length, 2, "proposal Status must contain exactly Lifecycle and Review lines");
  const lifecycle = /^Lifecycle: ([a-z-]+)$/u.exec(lines[0] ?? "");
  const review = /^Review: ([a-z-]+)$/u.exec(lines[1] ?? "");
  assert.ok(lifecycle?.[1] !== undefined, "proposal Status needs `Lifecycle: <closed-value>`");
  assert.ok(review?.[1] !== undefined, "proposal Status needs `Review: <closed-value>`");
  return {
    lifecycle: proposalLifecycle(lifecycle[1]),
    review: proposalReview(review[1]),
  };
}

export function isOwnerApproved(document: string): boolean {
  switch (parseProposalStatus(document).lifecycle) {
    case ProposalLifecycle.OwnerApproved:
    case ProposalLifecycle.ImplementationInProgress:
    case ProposalLifecycle.ImplementedAwaitingClosure:
      return true;
    case ProposalLifecycle.Draft:
    case ProposalLifecycle.Superseded:
    case ProposalLifecycle.Archived:
      return false;
  }
}

export function isReviewCommitTarget(value: string): boolean {
  if (!commitPattern.test(value)) {
    return false;
  }
  const exists = spawnSync("git", ["cat-file", "-e", `${value}^{commit}`], {
    cwd: projectRoot,
    stdio: "ignore",
  });
  if (exists.status !== 0) {
    return false;
  }
  const isAncestor = spawnSync(
    "git",
    ["merge-base", "--is-ancestor", value, "HEAD"],
    { cwd: projectRoot, stdio: "ignore" },
  );
  return isAncestor.status === 0;
}

function isCommitAncestor(ancestor: string, descendant: string): boolean {
  const result = spawnSync(
    "git",
    ["merge-base", "--is-ancestor", ancestor, descendant],
    { cwd: projectRoot, stdio: "ignore" },
  );
  assert.ok(
    result.status === 0 || result.status === 1,
    `cannot compare commits ${ancestor} and ${descendant}`,
  );
  return result.status === 0;
}

function usesSubagentReviewPolicy(value: string): boolean {
  assert.equal(
    isReviewCommitTarget(subagentReviewPolicyBaseline),
    true,
    "the immutable sub-agent review-policy baseline must remain an ancestor of HEAD",
  );
  const isStrictHistoricalAncestor =
    isCommitAncestor(value, subagentReviewPolicyBaseline) &&
    !isCommitAncestor(subagentReviewPolicyBaseline, value);
  return !isStrictHistoricalAncestor;
}

export function gitLines(arguments_: ReadonlyArray<string>): ReadonlyArray<string> {
  const result = spawnSync("git", arguments_, {
    cwd: projectRoot,
    encoding: "utf8",
  });
  assert.equal(
    result.status,
    0,
    `git ${arguments_.join(" ")} failed: ${result.stderr}`,
  );
  return result.stdout.split("\n").filter(Boolean);
}

function parseReviewStage(value: string): ReviewStage {
  switch (value) {
    case ReviewStage.Proposal:
    case ReviewStage.SemanticCheckpoint:
    case ReviewStage.Closure:
      return value;
    default:
      return assert.fail(`unknown review stage: ${value}`);
  }
}

export function parseReceipt(
  document: string,
  relativePath: string,
): Map<ReviewStage, ReviewReceipt> {
  const headingIndex = document.indexOf(receiptHeading);
  assert.notEqual(
    headingIndex,
    -1,
    `${relativePath} must contain ${receiptHeading}`,
  );

  const followingHeadingIndex = document.indexOf("\n## ", headingIndex + receiptHeading.length);
  const section = document.slice(
    headingIndex,
    followingHeadingIndex === -1 ? document.length : followingHeadingIndex,
  );
  const rows = new Map<ReviewStage, ReviewReceipt>();
  const rowPattern = /^\|\s*(Proposal|Semantic checkpoint|Closure)\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|$/gmu;

  for (const match of section.matchAll(rowPattern)) {
    const [, stage, target, isolation, verdict, correctionAudit] = match;
    assert.ok(stage && target && isolation && verdict && correctionAudit);
    const typedStage = parseReviewStage(stage);
    assert.equal(rows.has(typedStage), false, `${relativePath} repeats ${stage}`);
    rows.set(typedStage, {
      stage: typedStage,
      target,
      isolation,
      verdict,
      correctionAudit,
    });
  }

  assert.deepEqual(
    [...rows.keys()],
    [ReviewStage.Proposal, ReviewStage.SemanticCheckpoint, ReviewStage.Closure],
    `${relativePath} must record the three review stages in lifecycle order`,
  );
  for (const row of rows.values()) {
    assertReceiptRow(row, relativePath);
  }
  assertReviewContinuity(rows, relativePath);
  return rows;
}

/**
 * The commits a stage's correction audits landed at, in round order.
 *
 * The cell holds one commit per completed round, so the count *is* the round count. A cell naming a
 * single commit is a one-round list, which is why every receipt written before this contract stays
 * valid without being rewritten. Non-commit entries — the placeholders and the authorization
 * attestation — are not rounds and are excluded.
 */
export function correctionAuditRounds(cell: string): ReadonlyArray<string> {
  return cell
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => commitPattern.test(entry));
}

/**
 * Rejects an unbounded correction-audit loop.
 *
 * Every round is fresh prose and fresh prose can carry a fresh defect, so a loop that closes each
 * round's findings can run indefinitely while every round looks like convergence. The bound is what
 * forces the third round to be an owner decision rather than the author's. `owner-authorized` cannot
 * be verified from Git, so it is an attestation and is required to be false-free by being rejected
 * when the row records no rounds past the bound to authorize.
 */
function assertCorrectionAuditRounds(row: ReviewReceipt, context: string): void {
  const entries = row.correctionAudit.split(",").map((entry) => entry.trim());
  const authorizedAt = entries.indexOf(ownerAuthorizedRounds);
  if (authorizedAt !== -1) {
    assert.equal(
      authorizedAt,
      entries.length - 1,
      `${context} \`${ownerAuthorizedRounds}\` must be the last correction-audit entry`,
    );
  }
  const rounds = entries.filter((entry) => entry !== ownerAuthorizedRounds);
  assert.ok(
    rounds.length > 0 && rounds.every((entry) => isReviewCommitTarget(entry)),
    `${context} required edits need a correction-audit target`,
  );
  assert.equal(
    new Set(rounds).size,
    rounds.length,
    `${context} repeats correction-audit target`,
  );
  if (rounds.length > standingCorrectionAuditBound) {
    assert.notEqual(
      authorizedAt,
      -1,
      `${context} more than two correction-audit rounds need \`${ownerAuthorizedRounds}\``,
    );
    return;
  }
  assert.equal(
    authorizedAt,
    -1,
    `${context} \`${ownerAuthorizedRounds}\` claims rounds past the bound that this row does not record`,
  );
}

export function assertReceiptRow(row: ReviewReceipt, relativePath: string): void {
  const context = `${relativePath} ${row.stage}`;

  if (approvedVerdicts.has(row.verdict) || row.verdict === "reject") {
    assert.equal(
      isReviewCommitTarget(row.target),
      true,
      `${context} needs an immutable review target`,
    );
    if (usesSubagentReviewPolicy(row.target)) {
      const combinedColdReview =
        (row.stage === ReviewStage.SemanticCheckpoint ||
          row.stage === ReviewStage.Closure) &&
        row.isolation === "fork-turns-none-combined";
      const warmCheckpointClosure =
        row.stage === ReviewStage.Closure &&
        row.isolation === "checkpoint-reviewer-warm";
      assert.ok(
        combinedColdReview ||
          warmCheckpointClosure ||
          row.isolation === "fork-turns-none",
        `${context} requires an isolated same-effort sub-agent`,
      );
    } else if (row.stage === ReviewStage.SemanticCheckpoint) {
      assert.ok(
        row.isolation === "external-fresh-session" || row.isolation === "fork-turns-none",
        `${context} must be context-isolated`,
      );
    } else {
      assert.equal(
        row.isolation,
        "external-fresh-session",
        `${context} requires a fresh external session`,
      );
    }
    if (row.verdict === "approve-with-required-edits") {
      assertCorrectionAuditRounds(row, context);
    } else {
      assert.equal(row.correctionAudit, "not-required");
    }
    return;
  }

  if (row.verdict === "pending") {
    if (row.stage === ReviewStage.Proposal && row.target === "not-recorded") {
      assert.equal(row.isolation, "not-recorded");
      assert.equal(row.correctionAudit, "not-applicable");
      return;
    }
    assert.equal(
      isReviewCommitTarget(row.target),
      true,
      `${context} needs the pending review target`,
    );
    assert.equal(row.isolation, "not-recorded");
    assert.equal(row.correctionAudit, "not-applicable");
    return;
  }

  if (row.verdict === "not-required") {
    assert.equal(row.stage, ReviewStage.SemanticCheckpoint);
    assert.equal(row.target, "not-applicable");
    assert.equal(row.isolation, "not-applicable");
    assert.equal(row.correctionAudit, "not-applicable");
    return;
  }

  assert.equal(row.verdict, "not-reached", `${context} has an unknown verdict`);
  assert.ok(
    row.stage === ReviewStage.SemanticCheckpoint || row.stage === ReviewStage.Closure,
    `${context} cannot use not-reached`,
  );
  assert.equal(row.target, "not-applicable");
  assert.equal(row.isolation, "not-applicable");
  assert.equal(row.correctionAudit, "not-applicable");
}

export function assertReviewContinuity(
  receipt: ReadonlyMap<ReviewStage, ReviewReceipt>,
  relativePath: string,
): void {
  const checkpoint = receipt.get(ReviewStage.SemanticCheckpoint);
  const closure = receipt.get(ReviewStage.Closure);
  const combinedIsolation = "fork-turns-none-combined";
  const usesCombinedReview =
    checkpoint?.isolation === combinedIsolation ||
    closure?.isolation === combinedIsolation;
  if (usesCombinedReview) {
    assert.equal(
      checkpoint?.isolation,
      combinedIsolation,
      `${relativePath} combined review must mark both receipt rows`,
    );
    assert.equal(
      closure?.isolation,
      combinedIsolation,
      `${relativePath} combined review must mark both receipt rows`,
    );
    assert.equal(
      checkpoint?.target,
      closure?.target,
      `${relativePath} combined review must use one immutable target`,
    );
    assert.equal(
      checkpoint?.verdict,
      closure?.verdict,
      `${relativePath} combined review must record one verdict`,
    );
    assert.equal(
      checkpoint?.correctionAudit,
      closure?.correctionAudit,
      `${relativePath} combined review must record one correction audit`,
    );
    return;
  }
  if (
    checkpoint?.target !== "not-applicable" &&
    checkpoint?.target === closure?.target
  ) {
    throw new Error(
      `${relativePath} equal checkpoint and closure targets must attest combined review`,
    );
  }
  if (closure?.isolation !== "checkpoint-reviewer-warm") {
    return;
  }
  assert.ok(checkpoint, `${relativePath} warm closure needs a semantic checkpoint`);
  assert.ok(
    approvedVerdicts.has(checkpoint.verdict),
    `${relativePath} warm closure needs an approved semantic checkpoint`,
  );
  assert.notEqual(
    checkpoint.target,
    closure.target,
    `${relativePath} warm closure must follow its semantic checkpoint`,
  );
  assert.equal(
    isCommitAncestor(checkpoint.target, closure.target),
    true,
    `${relativePath} warm closure target must descend from its semantic checkpoint`,
  );
}

export function assertIndependentlyApproved(
  row: ReviewReceipt,
  relativePath: string,
): void {
  assert.ok(
    approvedVerdicts.has(row.verdict),
    `${relativePath} cannot cross ${row.stage} with verdict ${row.verdict}`,
  );
}

export function receiptRow(
  receipt: ReadonlyMap<ReviewStage, ReviewReceipt>,
  stage: ReviewStage,
  relativePath: string,
): ReviewReceipt {
  const row = receipt.get(stage);
  assert.ok(row, `${relativePath} is missing ${stage}`);
  return row;
}
