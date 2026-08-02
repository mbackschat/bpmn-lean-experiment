import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertIndependentlyApproved,
  assertReceiptRow,
  assertReviewContinuity,
  gitLines,
  isOwnerApproved,
  isReviewCommitTarget,
  parseReceipt,
  receiptRow,
  ReviewStage,
  subagentReviewPolicyBaseline,
  type ReviewReceipt,
} from "./independent-review-receipt.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const documentationRoot = path.join(projectRoot, "docs");
const capsuleRoot = path.join(projectRoot, "docs/capsules");

const reviewPolicyBaseline = "f1ef362";
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

test("permits warm closure only as checkpoint-reviewer continuity", () => {
  assert.throws(
    () =>
      assertReceiptRow(
        {
          stage: ReviewStage.Proposal,
          target: subagentReviewPolicyBaseline,
          isolation: "checkpoint-reviewer-warm",
          verdict: "approve",
          correctionAudit: "not-required",
        },
        "warm-proposal",
      ),
    /requires an isolated same-effort sub-agent/u,
  );
  assert.doesNotThrow(() =>
    assertReceiptRow(
      {
        stage: ReviewStage.Closure,
        target: subagentReviewPolicyBaseline,
        isolation: "checkpoint-reviewer-warm",
        verdict: "approve",
        correctionAudit: "not-required",
      },
      "warm-closure",
    ),
  );

  const head = gitLines(["rev-parse", "HEAD"])[0];
  assert.ok(head);
  const receipt = new Map<ReviewStage, ReviewReceipt>([
    [ReviewStage.Proposal, {
      stage: ReviewStage.Proposal,
      target: subagentReviewPolicyBaseline,
      isolation: "fork-turns-none",
      verdict: "approve",
      correctionAudit: "not-required",
    }],
    [ReviewStage.SemanticCheckpoint, {
      stage: ReviewStage.SemanticCheckpoint,
      target: subagentReviewPolicyBaseline,
      isolation: "fork-turns-none",
      verdict: "approve",
      correctionAudit: "not-required",
    }],
    [ReviewStage.Closure, {
      stage: ReviewStage.Closure,
      target: head,
      isolation: "checkpoint-reviewer-warm",
      verdict: "approve",
      correctionAudit: "not-required",
    }],
  ]);
  assert.doesNotThrow(() => assertReviewContinuity(receipt, "warm-spec"));
  receipt.set(ReviewStage.SemanticCheckpoint, {
    stage: ReviewStage.SemanticCheckpoint,
    target: "not-applicable",
    isolation: "not-applicable",
    verdict: "not-required",
    correctionAudit: "not-applicable",
  });
  assert.throws(
    () => assertReviewContinuity(receipt, "warm-without-checkpoint"),
    /needs an approved semantic checkpoint/u,
  );
});

test("permits one cold review for an atomic checkpoint and closure", () => {
  const head = gitLines(["rev-parse", "HEAD"])[0];
  assert.ok(head);
  const combinedReceipt = new Map<ReviewStage, ReviewReceipt>([
    [ReviewStage.Proposal, {
      stage: ReviewStage.Proposal,
      target: subagentReviewPolicyBaseline,
      isolation: "fork-turns-none",
      verdict: "approve",
      correctionAudit: "not-required",
    }],
    [ReviewStage.SemanticCheckpoint, {
      stage: ReviewStage.SemanticCheckpoint,
      target: head,
      isolation: "fork-turns-none-combined",
      verdict: "approve",
      correctionAudit: "not-required",
    }],
    [ReviewStage.Closure, {
      stage: ReviewStage.Closure,
      target: head,
      isolation: "fork-turns-none-combined",
      verdict: "approve",
      correctionAudit: "not-required",
    }],
  ]);

  for (const row of combinedReceipt.values()) {
    assertReceiptRow(row, "combined-review");
  }
  assert.doesNotThrow(() => assertReviewContinuity(combinedReceipt, "combined-review"));

  const mismatchedTarget = new Map(combinedReceipt);
  mismatchedTarget.set(ReviewStage.SemanticCheckpoint, {
    ...receiptRow(
      combinedReceipt,
      ReviewStage.SemanticCheckpoint,
      "combined-review",
    ),
    target: subagentReviewPolicyBaseline,
  });
  assert.throws(
    () => assertReviewContinuity(mismatchedTarget, "combined-review"),
    /must use one immutable target/u,
  );

  const oneSidedCombined = new Map(combinedReceipt);
  oneSidedCombined.set(ReviewStage.Closure, {
    ...receiptRow(combinedReceipt, ReviewStage.Closure, "combined-review"),
    isolation: "fork-turns-none",
  });
  assert.throws(
    () => assertReviewContinuity(oneSidedCombined, "combined-review"),
    /must mark both receipt rows/u,
  );

  const mismatchedVerdict = new Map(combinedReceipt);
  mismatchedVerdict.set(ReviewStage.Closure, {
    ...receiptRow(combinedReceipt, ReviewStage.Closure, "combined-review"),
    verdict: "reject",
  });
  assert.throws(
    () => assertReviewContinuity(mismatchedVerdict, "combined-review"),
    /must record one verdict/u,
  );

  const unmarkedEqualTarget = new Map(combinedReceipt);
  unmarkedEqualTarget.set(ReviewStage.SemanticCheckpoint, {
    ...receiptRow(combinedReceipt, ReviewStage.SemanticCheckpoint, "combined-review"),
    isolation: "fork-turns-none",
  });
  unmarkedEqualTarget.set(ReviewStage.Closure, {
    ...receiptRow(combinedReceipt, ReviewStage.Closure, "combined-review"),
    isolation: "fork-turns-none",
  });
  assert.throws(
    () => assertReviewContinuity(unmarkedEqualTarget, "combined-review"),
    /equal checkpoint and closure targets must attest combined review/u,
  );

  assert.throws(
    () => assertReceiptRow({
      stage: ReviewStage.Proposal,
      target: head,
      isolation: "fork-turns-none-combined",
      verdict: "approve",
      correctionAudit: "not-required",
    }, "combined-proposal"),
    /requires an isolated same-effort sub-agent/u,
  );
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
  assert.match(contributorGuide, /Cold or warm, every reviewer/u);
  assert.match(contributorGuide, /generic or general worker tier/u);
  assert.match(testingSpec, /^## Independent cold-review gate$/mu);
  assert.match(testingSpec, /^### When a warm review is valid$/mu);
  assert.match(testingSpec, /external-fresh-session/u);
  assert.match(testingSpec, /fork-turns-none/u);
  assert.match(testingSpec, /`fork_turns: "none"`/u);
  assert.match(testingSpec, new RegExp(reviewPolicyBaseline, "u"));
  assert.match(testingSpec, new RegExp(subagentReviewPolicyBaseline, "u"));
  assert.match(testingSpec, /same model and reasoning effort/u);
  assert.match(testingSpec, /same root model and reasoning effort/u);
  assert.match(testingSpec, /requires a new `fork-turns-none` closure reviewer/u);
  assert.match(testingSpec, /omits both model and reasoning-effort overrides/u);
  assert.match(testingSpec, /byte-identical/u);
  assert.match(testingSpec, /must delete the capsule-specific pending barrier/u);
  assert.match(testingSpec, /checkpoint-reviewer-warm/u);
  assert.match(testingSpec, /semantic-review-manifest\.ts/u);
  assert.match(testingSpec, /issue-first/u);
  assert.match(testingSpec, /fork-turns-none-combined/u);
  assert.match(testingSpec, /static claim scan/u);
  assert.match(testingSpec, /defer routine focused gates/u);
  assert.match(testingSpec, /stage-specific focus/u);
  assert.match(testingSpec, /semantic-review-packet\.ts/u);
  assert.match(testingSpec, /outputSha256/u);
  assert.match(testingSpec, /routing evidence, not independent proof/u);
  assert.match(contributorGuide, /warm closure continuity/u);
  assert.match(contributorGuide, /single-lane atomic closure/u);
  assert.match(contributorGuide, /semantic review packet/u);
  assert.match(documentationDiscipline, /Independent cold-review receipt/u);
  assert.match(capsuleRegistry, /Independent cold-review receipt/u);
  assert.match(verificationWorkflow, /^\s+fetch-depth: 0$/mu);
});

test("keeps delegated implementation orchestration in its documentation owners", async () => {
  const [contributorGuide, testingSpec] = await Promise.all([
    readFile(path.join(projectRoot, "CLAUDE.md"), "utf8"),
    readFile(path.join(projectRoot, "docs/TESTING-SPEC.md"), "utf8"),
  ]);

  assert.match(contributorGuide, /^### Delegated implementation$/mu);
  assert.match(contributorGuide, /task-shaped name/u);
  assert.match(contributorGuide, /disjoint file ownership/u);
  assert.match(contributorGuide, /root integrator/u);
  assert.match(testingSpec, /^## Delegated implementation protocol$/mu);
  assert.match(testingSpec, /invariant algorithm/u);
  assert.match(testingSpec, /adversarial counterexample/u);
  assert.match(testingSpec, /explicit non-requirements/u);
  assert.match(testingSpec, /Red reproduced/u);
  assert.match(testingSpec, /Root mechanism implemented/u);
  assert.match(testingSpec, /Focused gates green/u);
  assert.match(testingSpec, /repository-wide full gate exactly once/u);
  assert.match(testingSpec, /worktree-local dependency projection/u);
});
