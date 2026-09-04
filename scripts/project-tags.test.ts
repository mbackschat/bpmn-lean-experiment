import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  createProjectTag,
  ProjectTagKind,
  projectTagName,
  pushProjectTag,
} from "./project-tags.ts";

const projectRoot = path.resolve(import.meta.dirname, "..");
const receiptRunner = path.join(projectRoot, "scripts/run-with-receipt.sh");

function git(repository: string, ...arguments_: ReadonlyArray<string>): string {
  const result = spawnSync("git", arguments_, {
    cwd: repository,
    encoding: "utf8",
  });
  assert.equal(
    result.status,
    0,
    `git ${arguments_.join(" ")} failed:\n${result.stdout}${result.stderr}`,
  );
  return result.stdout.trim();
}

async function initializeRepository(repository: string, version = "0.2.0"): Promise<string> {
  await mkdir(repository, { recursive: true });
  git(repository, "init", "--quiet");
  git(repository, "config", "user.name", "Project Tag Test");
  git(repository, "config", "user.email", "project-tags@example.invalid");
  await mkdir(path.join(repository, "scripts"), { recursive: true });
  await writeFile(
    path.join(repository, "package.json"),
    `${JSON.stringify({ version }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(repository, "publication-statistics.status"),
    "ok\n",
    "utf8",
  );
  await writeFile(
    path.join(repository, "scripts/publication-statistics.ts"),
    [
      'import { readFileSync } from "node:fs";',
      'const status = readFileSync(new URL("../publication-statistics.status", import.meta.url), "utf8").trim();',
      'if (status === "ok") {',
      '  process.stdout.write("PUBLICATION_STATISTICS_OK\\n");',
      '} else {',
      '  process.stderr.write(`${status}\\n`);',
      '  process.exitCode = 1;',
      '}',
      "",
    ].join("\n"),
    "utf8",
  );
  git(repository, "add", "package.json", "publication-statistics.status", "scripts/publication-statistics.ts");
  git(repository, "commit", "--quiet", "-m", "baseline");
  return git(repository, "rev-parse", "HEAD");
}

function successfulReceipt(repository: string, name: string): string {
  const receipt = path.join(repository, ".git", "test-receipts", name);
  const result = spawnSync(
    receiptRunner,
    [receipt, "--", process.execPath, "-e", "process.exit(0)"],
    { cwd: repository, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  return receipt;
}

test("keeps phase and release tags in distinct conventional namespaces", () => {
  assert.equal(
    projectTagName({ kind: ProjectTagKind.Phase, identifier: "horizon-1" }),
    "phase/horizon-1",
  );
  assert.equal(
    projectTagName({ kind: ProjectTagKind.Release, identifier: "0.2.0" }),
    "v0.2.0",
  );
  assert.equal(
    projectTagName({ kind: ProjectTagKind.Release, identifier: "1.0.0-rc.1" }),
    "v1.0.0-rc.1",
  );

  for (const identifier of ["M7", "m7", "mvp", "horizon_1", "horizon/1", "-horizon"]) {
    assert.throws(
      () => projectTagName({ kind: ProjectTagKind.Phase, identifier }),
      /phase identifier/u,
    );
  }
  for (const identifier of ["v0.2.0", "0.2", "01.2.3", "0.2.0+build.1"]) {
    assert.throws(
      () => projectTagName({ kind: ProjectTagKind.Release, identifier }),
      /Semantic Versioning/u,
    );
  }
});

test("creates an immutable annotated phase tag at one clean committed HEAD", async () => {
  const repository = await mkdtemp(path.join(os.tmpdir(), "project-phase-tag-"));
  try {
    const head = await initializeRepository(repository);
    const request = {
      kind: ProjectTagKind.Phase,
      identifier: "horizon-1",
      message: "Horizon 1: shared persistence and projections",
      receiptDirectories: [successfulReceipt(repository, "horizon-1")],
    } as const;

    assert.deepEqual(createProjectTag(repository, request), {
      name: "phase/horizon-1",
      status: "created",
      target: head,
    });
    assert.equal(git(repository, "cat-file", "-t", "phase/horizon-1"), "tag");
    assert.equal(git(repository, "rev-list", "-n", "1", "phase/horizon-1"), head);
    assert.equal(
      git(repository, "for-each-ref", "refs/tags/phase/horizon-1", "--format=%(subject)"),
      request.message,
    );
    assert.equal(createProjectTag(repository, request).status, "verified");

    await writeFile(path.join(repository, "dirty.txt"), "dirty\n", "utf8");
    assert.throws(
      () => createProjectTag(repository, {
        kind: ProjectTagKind.Phase,
        identifier: "horizon-2",
        message: "Horizon 2 complete",
        receiptDirectories: [request.receiptDirectories[0]],
      }),
      /clean committed HEAD/u,
    );
  } finally {
    await rm(repository, { recursive: true, force: true });
  }
});

test("binds release tags to the committed package version and refuses collisions", async () => {
  const repository = await mkdtemp(path.join(os.tmpdir(), "project-release-tag-"));
  try {
    const head = await initializeRepository(repository, "0.2.0-rc.1");
    const request = {
      kind: ProjectTagKind.Release,
      identifier: "0.2.0-rc.1",
      message: "Release 0.2.0-rc.1",
      receiptDirectories: [successfulReceipt(repository, "release")],
    } as const;
    assert.deepEqual(createProjectTag(repository, request), {
      name: "v0.2.0-rc.1",
      status: "created",
      target: head,
    });
    assert.throws(
      () => createProjectTag(repository, {
        ...request,
        identifier: "0.2.0",
      }),
      /package\.json version/u,
    );

    git(repository, "tag", "--delete", "v0.2.0-rc.1");
    git(repository, "tag", "v0.2.0-rc.1", head);
    assert.throws(() => createProjectTag(repository, request), /annotated/u);
  } finally {
    await rm(repository, { recursive: true, force: true });
  }
});

test("refuses phase and release tags without current publication statistics", async () => {
  const repository = await mkdtemp(path.join(os.tmpdir(), "project-tag-publication-"));
  try {
    await initializeRepository(repository);

    await writeFile(
      path.join(repository, "publication-statistics.status"),
      "PUBLICATION_STATISTICS_STALE",
      "utf8",
    );
    git(repository, "add", "publication-statistics.status");
    git(repository, "commit", "--quiet", "-m", "make statistics stale");
    const staleReceipt = successfulReceipt(repository, "stale");
    assert.throws(
      () => createProjectTag(repository, {
        kind: ProjectTagKind.Phase,
        identifier: "stale-statistics",
        message: "Stale statistics must block publication",
        receiptDirectories: [staleReceipt],
      }),
      /PUBLICATION_STATISTICS_STALE/u,
    );

    await writeFile(
      path.join(repository, "publication-statistics.status"),
      "publication statistics require Tokei on the maintainer's machine",
      "utf8",
    );
    git(repository, "add", "publication-statistics.status");
    git(repository, "commit", "--quiet", "-m", "make Tokei unavailable");
    const missingToolReceipt = successfulReceipt(repository, "missing-tool");
    assert.throws(
      () => createProjectTag(repository, {
        kind: ProjectTagKind.Release,
        identifier: "0.2.0",
        message: "Release 0.2.0",
        receiptDirectories: [missingToolReceipt],
      }),
      /publication statistics require Tokei/u,
    );
  } finally {
    await rm(repository, { recursive: true, force: true });
  }
});

test("pushes one exact tag without overwriting a remote collision", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "project-tag-push-"));
  const repository = path.join(root, "work");
  const remote = path.join(root, "remote.git");
  try {
    const head = await initializeRepository(repository);
    await mkdir(remote, { recursive: true });
    git(remote, "init", "--quiet", "--bare");
    git(repository, "remote", "add", "origin", remote);
    const request = {
      kind: ProjectTagKind.Phase,
      identifier: "horizon-1",
      message: "Horizon 1 complete",
      receiptDirectories: [successfulReceipt(repository, "push")],
    } as const;
    const created = createProjectTag(repository, request);

    assert.equal(pushProjectTag(repository, "origin", created.name), "pushed");
    assert.equal(
      git(repository, "--git-dir", remote, "rev-parse", "refs/tags/phase/horizon-1^{commit}"),
      head,
    );
    assert.equal(pushProjectTag(repository, "origin", created.name), "verified");

    git(repository, "tag", "--delete", created.name);
    git(repository, "tag", "--annotate", created.name, head, "--message", "conflicting object");
    assert.throws(
      () => pushProjectTag(repository, "origin", created.name),
      /remote tag.*conflicts/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("requires successful verification receipts for the exact tagged HEAD", async () => {
  const repository = await mkdtemp(path.join(os.tmpdir(), "project-tag-receipts-"));
  try {
    await initializeRepository(repository);
    const request = {
      kind: ProjectTagKind.Phase,
      identifier: "receipt-boundary",
      message: "Receipt boundary complete",
    } as const;

    assert.throws(
      () => createProjectTag(repository, { ...request, receiptDirectories: [] }),
      /at least one verification receipt/u,
    );

    const oldReceipt = successfulReceipt(repository, "old-head");
    await writeFile(path.join(repository, "next.txt"), "next\n", "utf8");
    git(repository, "add", "next.txt");
    git(repository, "commit", "--quiet", "-m", "advance head");
    assert.throws(
      () => createProjectTag(repository, {
        ...request,
        receiptDirectories: [oldReceipt],
      }),
      /receipt.*does not match HEAD/iu,
    );

    const failedReceipt = path.join(repository, ".git", "test-receipts", "failed");
    const failed = spawnSync(
      receiptRunner,
      [failedReceipt, "--", process.execPath, "-e", "process.exit(7)"],
      { cwd: repository, encoding: "utf8" },
    );
    assert.equal(failed.status, 7);
    assert.throws(
      () => createProjectTag(repository, {
        ...request,
        receiptDirectories: [failedReceipt],
      }),
      /receipt.*exit status 7/iu,
    );

    const currentReceipt = successfulReceipt(repository, "current-head");
    assert.equal(
      createProjectTag(repository, {
        ...request,
        receiptDirectories: [currentReceipt],
      }).status,
      "created",
    );
  } finally {
    await rm(repository, { recursive: true, force: true });
  }
});

test("publishes the maintained commands and convention", async () => {
  const [manifestSource, guidance] = await Promise.all([
    readFile(path.join(projectRoot, "package.json"), "utf8"),
    readFile(path.join(projectRoot, "CLAUDE.md"), "utf8"),
  ]);
  const manifest = JSON.parse(manifestSource) as Readonly<{
    scripts?: Readonly<Record<string, string>>;
  }>;
  assert.equal(manifest.scripts?.["tag:create"], "node scripts/project-tags.ts create");
  assert.equal(manifest.scripts?.["tag:push"], "node scripts/project-tags.ts push");
  assert.match(guidance, /`phase\/<kebab-case>`/u);
  assert.match(guidance, /`vMAJOR\.MINOR\.PATCH\[-prerelease\]`/u);
  assert.match(guidance, /project-tags\.ts create/u);
  assert.match(guidance, /project-tags\.ts push/u);
  assert.match(guidance, /--receipt <absolute-receipt-directory>/u);
  assert.match(guidance, /exact target commit/u);
  assert.match(guidance, /never force or move/iu);
});
