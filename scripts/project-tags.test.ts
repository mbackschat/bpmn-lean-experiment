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
  await writeFile(
    path.join(repository, "package.json"),
    `${JSON.stringify({ version }, null, 2)}\n`,
    "utf8",
  );
  git(repository, "add", "package.json");
  git(repository, "commit", "--quiet", "-m", "baseline");
  return git(repository, "rev-parse", "HEAD");
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
  assert.match(guidance, /tag:create/u);
  assert.match(guidance, /tag:push/u);
  assert.match(guidance, /never force or move/iu);
});
