import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const documentationRoot = path.join(projectRoot, "docs");
const capsuleRoot = path.join(projectRoot, "docs/capsules");

const reviewPolicyBaseline = "f1ef362";
const subagentReviewPolicyBaseline = "b361681";
const expectedGrandfatheredReviewDocuments = [
  "docs/CIB-SEVEN-COMPATIBILITY-SCOPE-PROPOSAL.md",
  "docs/COMPOSITIONAL-BPMN-ADMISSION-PROPOSAL.md",
  "docs/DUAL-SEMANTIC-CORE-ARCHITECTURE-PROPOSAL.md",
  "docs/PROFILE-PARAMETERIZED-ADMISSION-SPEC.md",
  "docs/RUNNABLE-TEMPORAL-MVP-SPEC.md",
  "docs/SEMANTIC-PROCESS-IL-SPEC.md",
  "docs/TEMPORAL-PROCESS-LIFECYCLE-SPEC.md",
  "docs/TESTING-SPEC.md",
  "docs/capsules/BOUNDARY-ERROR-SPEC.md",
  "docs/capsules/CREATE-DOCUMENT-DATA-SPEC.md",
  "docs/capsules/EMBEDDED-SUBPROCESS-COMPLETION-SPEC.md",
  "docs/capsules/EXCLUSIVE-GATEWAY-CONDITION-SPEC.md",
  "docs/capsules/INTERMEDIATE-CATCH-MESSAGE-SPEC.md",
  "docs/capsules/INTERMEDIATE-CATCH-TIMER-SPEC.md",
  "docs/capsules/PARALLEL-FORK-JOIN-SPEC.md",
  "docs/capsules/PROCESS-START-DATA-SPEC.md",
  "docs/capsules/SCOPED-DATA-SPEC.md",
  "docs/capsules/SERVICE-TASK-EFFECT-SPEC.md",
  "docs/capsules/SUBPROCESS-ERROR-PROPAGATION-SPEC.md",
  "docs/capsules/USER-TASK-COMPLETION-DATA-SPEC.md",
  "docs/capsules/USER-TASK-INTERACTION-SPEC.md",
] as const;
const grandfatheredReviewDocuments: ReadonlySet<string> = new Set(
  expectedGrandfatheredReviewDocuments,
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

function baselineGrandfatheredReviewDocuments(): ReadonlyArray<string> {
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
    "docs",
  ])
    .filter((file) => !file.startsWith("docs/archived/"))
    .filter((file) => !file.startsWith("docs/reference/"))
    .filter(
      (file) =>
        file.endsWith("-SPEC.md") ||
        /^docs\/[^/]+-PROPOSAL\.md$/u.test(file),
    )
    .sort();
}

async function activeReviewDocumentPaths(): Promise<ReadonlyArray<string>> {
  return (await readdir(documentationRoot, { recursive: true }))
    .map((file) => file.split(path.sep).join("/"))
    .filter((file) => !file.startsWith("archived/"))
    .filter((file) => !file.startsWith("reference/"))
    .filter((file) => file.endsWith("-PROPOSAL.md") || file.endsWith("-SPEC.md"))
    .map((file) => `docs/${file}`)
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
    if (usesSubagentReviewPolicy(row.target)) {
      assert.equal(
        row.isolation,
        "fork-turns-none",
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

function assertIndependentlyApproved(row: ReviewReceipt, relativePath: string): void {
  assert.ok(
    approvedVerdicts.has(row.verdict),
    `${relativePath} cannot cross ${row.stage} with verdict ${row.verdict}`,
  );
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
  const reviewDocuments = await activeReviewDocumentPaths();
  const archivedDocuments = new Set(
    await readdir(path.join(documentationRoot, "archived")),
  );
  assert.deepEqual(
    baselineGrandfatheredReviewDocuments(),
    [...expectedGrandfatheredReviewDocuments].sort(),
    "the pre-policy exception set is fixed by its immutable baseline and selection rule",
  );
  for (const relativePath of grandfatheredReviewDocuments) {
    const archivedPath = `docs/archived/${path.basename(relativePath)}`;
    assert.ok(
      reviewDocuments.includes(relativePath) ||
        archivedDocuments.has(path.basename(relativePath)),
      `${relativePath} must remain active or move to ${archivedPath}`,
    );
  }
  const governedDocuments = reviewDocuments.filter(
    (relativePath) => !grandfatheredReviewDocuments.has(relativePath),
  );

  for (const relativePath of governedDocuments) {
    const document = await readFile(path.join(projectRoot, relativePath), "utf8");
    const receipt = parseReceipt(document, relativePath);
    if (relativePath.endsWith("-PROPOSAL.md") && isOwnerApproved(document)) {
      assertIndependentlyApproved(
        receiptRow(receipt, ReviewStage.Proposal, relativePath),
        relativePath,
      );
      continue;
    }
    if (relativePath.endsWith("-SPEC.md")) {
      assertIndependentlyApproved(
        receiptRow(receipt, ReviewStage.Proposal, relativePath),
        relativePath,
      );
      assertIndependentlyApproved(
        receiptRow(receipt, ReviewStage.Closure, relativePath),
        relativePath,
      );
    }
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

test("review jurisdiction is independent of documentation directory", async () => {
  const governed = await activeReviewDocumentPaths();
  assert.ok(governed.includes("docs/SEMANTIC-PROCESS-IL-SPEC.md"));
  assert.ok(governed.includes("docs/CIB-SEVEN-COMPATIBILITY-SCOPE-PROPOSAL.md"));
  assert.ok(governed.includes("docs/capsules/RECEIVE-TASK-MESSAGE-SPEC.md"));
});

test("rejects syntactically valid names that are not review commits", () => {
  assert.equal(isReviewCommitTarget("deadbee"), false);
});

test("requires prospective cold reviews to use an isolated sub-agent", () => {
  assert.doesNotThrow(() =>
    assertReceiptRow(
      {
        stage: ReviewStage.Proposal,
        target: "16904dd",
        isolation: "external-fresh-session",
        verdict: "approve",
        correctionAudit: "not-required",
      },
      "historical-proposal",
    ),
  );
  for (const stage of [
    ReviewStage.Proposal,
    ReviewStage.SemanticCheckpoint,
    ReviewStage.Closure,
  ]) {
    assert.throws(
      () =>
        assertReceiptRow(
          {
            stage,
            target: subagentReviewPolicyBaseline,
            isolation: "external-fresh-session",
            verdict: "approve",
            correctionAudit: "not-required",
          },
          `prospective-${stage}`,
        ),
      /requires an isolated same-effort sub-agent/u,
    );
    assert.doesNotThrow(() =>
      assertReceiptRow(
        {
          stage,
          target: subagentReviewPolicyBaseline,
          isolation: "fork-turns-none",
          verdict: "approve",
          correctionAudit: "not-required",
        },
        `prospective-${stage}`,
      ),
    );
  }
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
  assert.match(contributorGuide, /without a model or reasoning override/u);
  assert.match(testingSpec, /^## Independent cold-review gate$/mu);
  assert.match(testingSpec, /external-fresh-session/u);
  assert.match(testingSpec, /fork-turns-none/u);
  assert.match(testingSpec, /`fork_turns: "none"`/u);
  assert.match(testingSpec, new RegExp(reviewPolicyBaseline, "u"));
  assert.match(testingSpec, new RegExp(subagentReviewPolicyBaseline, "u"));
  assert.match(testingSpec, /same model and reasoning effort/u);
  assert.match(testingSpec, /omits both model and reasoning-effort overrides/u);
  assert.match(testingSpec, /byte-identical/u);
  assert.match(testingSpec, /must delete the capsule-specific pending barrier/u);
  assert.match(documentationDiscipline, /Independent cold-review receipt/u);
  assert.match(capsuleRegistry, /Independent cold-review receipt/u);
  assert.match(verificationWorkflow, /^\s+fetch-depth: 0$/mu);
});
