import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  ArtifactConflictError,
  ArtifactDigestError,
  ArtifactDigestMismatchError,
  ArtifactPutStatus,
  FileArtifactStore,
} from "../dist/index.js";

const encoder = new TextEncoder();

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function withStore(
  run: (fixture: Readonly<{ root: string; store: FileArtifactStore }>) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-artifacts-"));
  try {
    await run({ root, store: new FileArtifactStore(root) });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("rejects a corrupt existing artifact without replacing it", async () => {
  await withStore(async ({ root, store }) => {
    const bytes = encoder.encode("admitted BPMN bytes");
    const sha256 = digest(bytes);
    const corrupt = encoder.encode("different existing bytes");
    const targetDirectory = join(root, "sha256");
    const target = join(targetDirectory, sha256);
    await mkdir(targetDirectory, { recursive: true });
    await writeFile(target, corrupt);

    await assert.rejects(
      store.put({ sha256, bytes }),
      (error: unknown) => error instanceof ArtifactConflictError,
    );
    assert.deepEqual(Uint8Array.from(await readFile(target)), corrupt);
    assert.deepEqual(await readdir(targetDirectory), [sha256]);
  });
});

test("rejects a digest mismatch before creating storage", async () => {
  await withStore(async ({ root, store }) => {
    const bytes = encoder.encode("source bytes");
    const otherDigest = digest(encoder.encode("other source bytes"));

    await assert.rejects(
      store.put({ sha256: otherDigest, bytes }),
      (error: unknown) => error instanceof ArtifactDigestMismatchError,
    );
    assert.deepEqual(await readdir(root), []);
  });
});

test("treats sequential and concurrent exact duplicates as idempotent", async () => {
  await withStore(async ({ root, store }) => {
    const bytes = encoder.encode("one immutable artifact");
    const sha256 = digest(bytes);

    assert.deepEqual(await store.put({ sha256, bytes }), {
      status: ArtifactPutStatus.Stored,
    });
    assert.deepEqual(await store.put({ sha256, bytes }), {
      status: ArtifactPutStatus.AlreadyPresent,
    });

    const concurrentBytes = encoder.encode("a concurrently published artifact");
    const concurrentDigest = digest(concurrentBytes);
    const results = await Promise.all([
      store.put({ sha256: concurrentDigest, bytes: concurrentBytes }),
      store.put({ sha256: concurrentDigest, bytes: concurrentBytes }),
    ]);
    assert.deepEqual(
      results.map(({ status }) => status).sort(),
      [ArtifactPutStatus.AlreadyPresent, ArtifactPutStatus.Stored].sort(),
    );
    assert.deepEqual(
      Uint8Array.from(await readFile(join(root, "sha256", concurrentDigest))),
      concurrentBytes,
    );
    assert.deepEqual(
      (await readdir(join(root, "sha256"))).filter((name) => name.startsWith(".")),
      [],
    );
  });
});

test("snapshots caller identity and bytes synchronously and returns defensive copies", async () => {
  await withStore(async ({ store }) => {
    const original = encoder.encode("caller-owned bytes");
    const expected = Uint8Array.from(original);
    const sha256 = digest(original);
    const request = { sha256, bytes: original };

    const publication = store.put(request);
    request.sha256 = "../mutated-after-validation";
    original.fill(0);
    await publication;

    const first = await store.get(sha256);
    assert.deepEqual(first, expected);
    assert.ok(first !== null);
    first.fill(1);
    assert.deepEqual(await store.get(sha256), expected);
  });
});

test("rejects invalid digest paths and reports a missing valid digest", async () => {
  await withStore(async ({ root, store }) => {
    const validMissing = "0".repeat(64);
    const invalid = [
      "",
      "A".repeat(64),
      "f".repeat(63),
      "../" + "f".repeat(61),
      "f".repeat(64) + "/../escape",
    ];

    for (const sha256 of invalid) {
      await assert.rejects(
        store.get(sha256),
        (error: unknown) => error instanceof ArtifactDigestError,
        sha256,
      );
      await assert.rejects(
        store.put({ sha256, bytes: new Uint8Array() }),
        (error: unknown) => error instanceof ArtifactDigestError,
        sha256,
      );
    }
    assert.equal(await store.get(validMissing), null);
    assert.deepEqual(await readdir(root), []);
  });
});
