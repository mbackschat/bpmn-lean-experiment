import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { assertCleanCommittedHead } from "./clean-committed-head.ts";

const projectRoot = path.resolve(import.meta.dirname, "..");

function git(repository: string, ...arguments_: ReadonlyArray<string>): void {
  const result = spawnSync("git", arguments_, { cwd: repository, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

async function initializeRepository(repository: string): Promise<void> {
  await mkdir(repository, { recursive: true });
  git(repository, "init", "--quiet");
  await writeFile(path.join(repository, "tracked.txt"), "committed\n", "utf8");
  git(repository, "add", "tracked.txt");
  git(
    repository,
    "-c", "user.name=Clean Head Test",
    "-c", "user.email=clean-head@example.invalid",
    "commit", "--quiet", "-m", "baseline",
  );
}

test("requires the pre-push gate to observe one clean committed HEAD", async () => {
  const repository = await mkdtemp(path.join(os.tmpdir(), "clean-committed-head-"));
  try {
    await initializeRepository(repository);
    assert.doesNotThrow(() => assertCleanCommittedHead(repository));

    await writeFile(path.join(repository, "tracked.txt"), "unstaged\n", "utf8");
    assert.throws(() => assertCleanCommittedHead(repository), /clean committed HEAD/u);

    git(repository, "restore", "tracked.txt");
    await writeFile(path.join(repository, "untracked.txt"), "untracked\n", "utf8");
    assert.throws(() => assertCleanCommittedHead(repository), /clean committed HEAD/u);

    git(repository, "add", "untracked.txt");
    assert.throws(() => assertCleanCommittedHead(repository), /clean committed HEAD/u);
  } finally {
    await rm(repository, { recursive: true, force: true });
  }
});

test("makes clean committed HEAD the shared local and GitHub pre-push boundary", async () => {
  const [manifestSource, verifyWorkflow, platformWorkflow, showcaseWorkflow, uiWorkflow] = await Promise.all([
    readFile(path.join(projectRoot, "package.json"), "utf8"),
    readFile(path.join(projectRoot, ".github/workflows/verify.yml"), "utf8"),
    readFile(path.join(projectRoot, ".github/workflows/platform-quality.yml"), "utf8"),
    readFile(path.join(projectRoot, ".github/workflows/showcase-quality.yml"), "utf8"),
    readFile(path.join(projectRoot, ".github/workflows/ui-quality.yml"), "utf8"),
  ]);
  const manifest = JSON.parse(manifestSource) as Readonly<{
    scripts?: Readonly<Record<string, string>>;
  }>;

  assert.equal(
    manifest.scripts?.["check:clean-head"],
    "node scripts/clean-committed-head.ts",
  );
  assert.equal(
    manifest.scripts?.["test:pre-push:verify"],
    "pnpm check:clean-head && ./scripts/verify.sh",
  );
  assert.equal(
    manifest.scripts?.["test:pre-push:platform"],
    "pnpm check:clean-head && pnpm test:platform-operations-checkpoint",
  );
  assert.equal(
    manifest.scripts?.["test:pre-push:ui"],
    "pnpm check:clean-head && pnpm test:feedback-policy && pnpm build:platform-web && pnpm test:platform-web:built && pnpm test:ui-quality:built",
  );
  assert.equal(
    manifest.scripts?.["test:pre-push:showcase"],
    "pnpm check:clean-head && pnpm test:feedback-policy && pnpm test:showcase:types",
  );
  assert.match(verifyWorkflow, /run: \.\/scripts\/pnpm\.sh run test:pre-push:verify/u);
  assert.match(platformWorkflow, /run: \.\/scripts\/pnpm\.sh run test:pre-push:platform/u);
  assert.match(showcaseWorkflow, /run: \.\/scripts\/pnpm\.sh run test:pre-push:showcase/u);
  assert.match(uiWorkflow, /run: \.\/scripts\/pnpm\.sh run test:pre-push:ui/u);
});

test("containerized pre-push workflow trusts only the exact checkout before Git inspection", async () => {
  const workflowPath = ".github/workflows/ui-quality.yml";
  const workflow = await readFile(path.join(projectRoot, workflowPath), "utf8");
  const checkoutIndex = workflow.indexOf("uses: actions/checkout@");
  const trustCommand = 'run: git config --global --add safe.directory "$GITHUB_WORKSPACE"';
  const trustIndex = workflow.indexOf(trustCommand);
  const prePushIndex = workflow.indexOf("run: ./scripts/pnpm.sh run test:pre-push:ui");

  assert.ok(checkoutIndex >= 0, `${workflowPath} must check out the repository`);
  assert.ok(
    trustIndex > checkoutIndex && trustIndex < prePushIndex,
    `${workflowPath} must trust its exact checked-out workspace before the clean-head gate`,
  );
  assert.doesNotMatch(
    workflow,
    /safe\.directory\s+["']?\*["']?/u,
    `${workflowPath} must not trust every Git repository`,
  );
});
