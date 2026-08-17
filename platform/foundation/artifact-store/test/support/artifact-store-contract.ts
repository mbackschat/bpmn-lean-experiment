import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import {
  ArtifactConflictError,
  ArtifactDigestError,
  ArtifactDigestMismatchError,
  ArtifactPutStatus,
} from "../../dist/index.js";
import type {
  ArtifactPutRequest,
  ArtifactPutResult,
} from "../../dist/index.js";

const encoder = new TextEncoder();

export type ExactArtifactStoreContract = Readonly<{
  put(request: ArtifactPutRequest): Promise<ArtifactPutResult>;
  get(sha256: string): Promise<Uint8Array | null>;
}>;

export type StoredArtifactRecord = Readonly<{
  sha256: string;
  byteLength: number;
  bytes: Uint8Array;
}>;

export type ArtifactStoreFixture = Readonly<{
  store: ExactArtifactStoreContract;
  corruptStoredContent(sha256: string): Promise<void>;
  readStoredRecord(sha256: string): Promise<StoredArtifactRecord>;
}>;

export type WithArtifactStoreFixture = (
  run: (fixture: ArtifactStoreFixture) => Promise<void>,
) => Promise<void>;

export function registerExactArtifactStoreContract(
  implementationName: string,
  withFixture: WithArtifactStoreFixture,
): void {
  test(`${implementationName} distinguishes publication from exact repetition`, async () => {
    await withFixture(async ({ store }) => {
      const bytes = encoder.encode("one immutable artifact");
      const sha256 = digest(bytes);

      assert.deepEqual(await store.put({ sha256, bytes }), {
        status: ArtifactPutStatus.Stored,
      });
      assert.deepEqual(await store.put({ sha256, bytes }), {
        status: ArtifactPutStatus.AlreadyPresent,
      });
    });
  });

  test(`${implementationName} makes concurrent duplicate publication idempotent`, async () => {
    await withFixture(async ({ store }) => {
      const bytes = encoder.encode("a concurrently published artifact");
      const sha256 = digest(bytes);
      const results = await Promise.all([
        store.put({ sha256, bytes }),
        store.put({ sha256, bytes }),
      ]);

      assert.deepEqual(
        results.map(({ status }) => status).sort(),
        [ArtifactPutStatus.AlreadyPresent, ArtifactPutStatus.Stored].sort(),
      );
      assert.deepEqual(await store.get(sha256), bytes);
    });
  });

  test(`${implementationName} rejects invalid and mismatched identities`, async () => {
    await withFixture(async ({ store }) => {
      const invalid = [
        "",
        "A".repeat(64),
        "f".repeat(63),
        `../${"f".repeat(61)}`,
        `${"f".repeat(64)}/../escape`,
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

      const bytes = encoder.encode("source bytes");
      const otherDigest = digest(encoder.encode("other source bytes"));
      await assert.rejects(
        store.put({ sha256: otherDigest, bytes }),
        (error: unknown) => error instanceof ArtifactDigestMismatchError,
      );
      assert.equal(await store.get(otherDigest), null);
      assert.equal(await store.get("0".repeat(64)), null);
    });
  });

  test(`${implementationName} snapshots input synchronously and returns defensive copies`, async () => {
    await withFixture(async ({ store }) => {
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

  test(`${implementationName} fails closed on corrupt occupied content`, async () => {
    await withFixture(async ({ store, corruptStoredContent, readStoredRecord }) => {
      const bytes = encoder.encode("immutable corrupt target");
      const sha256 = digest(bytes);
      await store.put({ sha256, bytes });
      await corruptStoredContent(sha256);
      const corruptRecord = await readStoredRecord(sha256);

      await assert.rejects(
        store.get(sha256),
        (error: unknown) =>
          error instanceof ArtifactConflictError && error.sha256 === sha256,
      );
      await assert.rejects(
        store.put({ sha256, bytes }),
        (error: unknown) =>
          error instanceof ArtifactConflictError && error.sha256 === sha256,
      );
      assert.deepEqual(await readStoredRecord(sha256), corruptRecord);
    });
  });
}

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
