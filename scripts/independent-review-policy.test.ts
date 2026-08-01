import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const capsuleRoot = path.join(projectRoot, "docs/capsules");

const reviewPolicyBaseline = "f1ef362";
const expectedPrePolicySpecifications = [
  "BOUNDARY-ERROR-SPEC.md",
  "CREATE-DOCUMENT-DATA-SPEC.md",
  "EMBEDDED-SUBPROCESS-COMPLETION-SPEC.md",
  "EXCLUSIVE-GATEWAY-CONDITION-SPEC.md",
  "INTERMEDIATE-CATCH-MESSAGE-SPEC.md",
  "INTERMEDIATE-CATCH-TIMER-SPEC.md",
  "PARALLEL-FORK-JOIN-SPEC.md",
  "PROCESS-START-DATA-SPEC.md",
  "SCOPED-DATA-SPEC.md",
  "SERVICE-TASK-EFFECT-SPEC.md",
  "SUBPROCESS-ERROR-PROPAGATION-SPEC.md",
  "USER-TASK-COMPLETION-DATA-SPEC.md",
  "USER-TASK-INTERACTION-SPEC.md",
] as const;
const prePolicySpecifications: ReadonlySet<string> = new Set(
  expectedPrePolicySpecifications,
);

const ReviewStage = {
  Proposal: "Proposal",
  SemanticCheckpoint: "Semantic checkpoint",
  Closure: "Closure",
} as const;

type ReviewStage = (typeof ReviewStage)[keyof typeof ReviewStage];

type ReviewReceipt = Readonly<{
  stage: ReviewStage;
  target: string;
  isolation: string;
  verdict: string;
  correctionAudit: string;
}>;

const receiptHeading = "## Independent cold-review receipt";
const commitPattern = /^[0-9a-f]{7,40}$/u;
const approvedVerdicts = new Set(["approve", "approve-with-required-edits"]);

function isOwnerApproved(document: string): boolean {
  const statusHeading = /^## Status\s*$/mu.exec(document);
  assert.ok(statusHeading, "active capsule proposal needs a Status section");
  const statusStart = statusHeading.index + statusHeading[0].length;
  const followingHeading = /^##\s+/gmu;
  followingHeading.lastIndex = statusStart;
  const next = followingHeading.exec(document);
  const statusSection = document.slice(statusStart, next?.index ?? document.length);
  return /\bOwner-approved\b/u.test(statusSection);
}

function isReviewCommitTarget(value: string): boolean {
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

function gitLines(arguments_: ReadonlyArray<string>): ReadonlyArray<string> {
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

function baselineSpecifications(): ReadonlyArray<string> {
  assert.equal(
    isReviewCommitTarget(reviewPolicyBaseline),
    true,
    "the immutable review-policy baseline must remain an ancestor of HEAD",
  );
  return gitLines([
    "ls-tree",
    "-r",
    "--name-only",
    reviewPolicyBaseline,
    "--",
    "docs/capsules",
  ])
    .filter((file) => file.endsWith("-SPEC.md"))
    .map((file) => path.basename(file))
    .sort();
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

function parseReceipt(
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
  return rows;
}

function assertReceiptRow(row: ReviewReceipt, relativePath: string): void {
  const context = `${relativePath} ${row.stage}`;

  if (approvedVerdicts.has(row.verdict) || row.verdict === "reject") {
    assert.equal(
      isReviewCommitTarget(row.target),
      true,
      `${context} needs an immutable review target`,
    );
    if (row.stage === ReviewStage.SemanticCheckpoint) {
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
      assert.equal(
        isReviewCommitTarget(row.correctionAudit),
        true,
        `${context} required edits need a correction-audit target`,
      );
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

function assertExternallyApproved(row: ReviewReceipt, relativePath: string): void {
  assert.ok(
    approvedVerdicts.has(row.verdict),
    `${relativePath} cannot cross ${row.stage} with verdict ${row.verdict}`,
  );
  assert.equal(row.isolation, "external-fresh-session");
}

function receiptRow(
  receipt: ReadonlyMap<ReviewStage, ReviewReceipt>,
  stage: ReviewStage,
  relativePath: string,
): ReviewReceipt {
  const row = receipt.get(stage);
  assert.ok(row, `${relativePath} is missing ${stage}`);
  return row;
}

test("requires review receipts for active proposals and post-policy specifications", async () => {
  const capsuleFiles = await readdir(capsuleRoot);
  assert.deepEqual(
    baselineSpecifications(),
    [...expectedPrePolicySpecifications].sort(),
    "the pre-policy exception set is fixed by its immutable baseline",
  );
  for (const file of prePolicySpecifications) {
    assert.ok(
      capsuleFiles.includes(file),
      `${file} is a stale pre-policy specification exception`,
    );
  }
  const proposals = capsuleFiles.filter((file) => file.endsWith("-PROPOSAL.md"));
  const postPolicySpecifications = capsuleFiles.filter(
    (file) => file.endsWith("-SPEC.md") && !prePolicySpecifications.has(file),
  );

  for (const file of proposals) {
    const relativePath = `docs/capsules/${file}`;
    const document = await readFile(path.join(capsuleRoot, file), "utf8");
    const receipt = parseReceipt(document, relativePath);
    if (isOwnerApproved(document)) {
      assertExternallyApproved(
        receiptRow(receipt, ReviewStage.Proposal, relativePath),
        relativePath,
      );
    }
  }

  for (const file of postPolicySpecifications) {
    const relativePath = `docs/capsules/${file}`;
    const document = await readFile(path.join(capsuleRoot, file), "utf8");
    const receipt = parseReceipt(document, relativePath);
    assertExternallyApproved(
      receiptRow(receipt, ReviewStage.Proposal, relativePath),
      relativePath,
    );
    assertExternallyApproved(
      receiptRow(receipt, ReviewStage.Closure, relativePath),
      relativePath,
    );
  }
});

test("recognizes owner approval independently of status formatting", () => {
  const variants = [
    "## Status\n\n**Owner-approved after independent review.**",
    "## Status\n\n**Status:** Owner-approved on 2026-07-26.",
    "## Status\n\nOwner-approved on 2026-08-01.",
    "## Status\n\n**Status: Owner-approved**",
  ];

  for (const document of variants) {
    assert.equal(isOwnerApproved(document), true, document);
  }
});

test("rejects syntactically valid names that are not review commits", () => {
  assert.equal(isReviewCommitTarget("deadbee"), false);
});

test("keeps the cold-review lifecycle in its documentation owners", async () => {
  const [
    contributorGuide,
    testingSpec,
    documentationDiscipline,
    capsuleRegistry,
    verificationWorkflow,
  ] = await Promise.all([
      readFile(path.join(projectRoot, "CLAUDE.md"), "utf8"),
      readFile(path.join(projectRoot, "docs/TESTING-SPEC.md"), "utf8"),
      readFile(path.join(projectRoot, "docs/DOC-DISCIPLINE.md"), "utf8"),
      readFile(path.join(capsuleRoot, "README.md"), "utf8"),
      readFile(path.join(projectRoot, ".github/workflows/verify.yml"), "utf8"),
    ]);

  assert.match(contributorGuide, /^### Independent cold review$/mu);
  assert.match(contributorGuide, /may not approve, append, rebase, or replace/u);
  assert.match(testingSpec, /^## Independent cold-review gate$/mu);
  assert.match(testingSpec, /external-fresh-session/u);
  assert.match(testingSpec, /fork-turns-none/u);
  assert.match(testingSpec, new RegExp(reviewPolicyBaseline, "u"));
  assert.match(testingSpec, /byte-identical/u);
  assert.match(testingSpec, /must delete the capsule-specific pending barrier/u);
  assert.match(documentationDiscipline, /Independent cold-review receipt/u);
  assert.match(capsuleRegistry, /Independent cold-review receipt/u);
  assert.match(verificationWorkflow, /^\s+fetch-depth: 0$/mu);
});

test("blocks Receive Task downstream lanes while its semantic review is pending", async () => {
  const relativePath = "docs/capsules/RECEIVE-TASK-MESSAGE-PROPOSAL.md";
  const proposal = await readFile(path.join(projectRoot, relativePath), "utf8");
  const receipt = parseReceipt(proposal, relativePath);
  const checkpoint = receiptRow(
    receipt,
    ReviewStage.SemanticCheckpoint,
    relativePath,
  );

  assert.equal(
    checkpoint.verdict,
    "pending",
    "delete this capsule-specific barrier in the same change that records semantic-checkpoint approval",
  );

  const [plan, implementationMap] = await Promise.all([
    readFile(path.join(projectRoot, "docs/PLAN.md"), "utf8"),
    readFile(path.join(projectRoot, "docs/IMPLEMENTATION-MAP.md"), "utf8"),
  ]);
  assert.match(plan, new RegExp(checkpoint.target, "u"));
  assert.match(plan, /independent cold review[^.]*pending/iu);
  assert.match(implementationMap, /independent cold review[^.]*pending/iu);

  const protectedRoots = [
    "packages/differential",
    "packages/temporal-adapter",
    "profiles",
    "runners",
    "scenarios",
  ];
  const changedSinceCheckpoint = gitLines([
    "diff",
    "--name-only",
    checkpoint.target,
    "--",
    ...protectedRoots,
  ]);
  const untracked = gitLines([
    "ls-files",
    "--others",
    "--exclude-standard",
    "--",
    ...protectedRoots,
  ]);
  assert.deepEqual(
    [...new Set([...changedSinceCheckpoint, ...untracked])].sort(),
    [],
    `downstream-lane roots must remain byte-identical to pending checkpoint ${checkpoint.target}`,
  );
});
