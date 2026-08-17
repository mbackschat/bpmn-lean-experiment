import { randomUUID } from "node:crypto";
import { link, mkdir, open, readFile, unlink } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { join } from "node:path";

import {
  ArtifactConflictError,
  ArtifactPutStatus,
  snapshotVerifiedArtifact,
  validateArtifactSha256,
  verifyStoredArtifactBytes,
} from "./artifact-contracts.js";
import type {
  ArtifactPutRequest,
  ArtifactPutResult,
} from "./artifact-contracts.js";

export {
  ArtifactConflictError,
  ArtifactDigestError,
  ArtifactDigestMismatchError,
  ArtifactPutStatus,
} from "./artifact-contracts.js";
export type {
  ArtifactPutRequest,
  ArtifactPutResult,
} from "./artifact-contracts.js";

/**
 * Stores exact bytes under their verified SHA-256 identity on one local filesystem.
 *
 * Publication is atomic and never replaces an existing path. The caller retains ownership of both
 * input and returned arrays: `put` snapshots input synchronously and `get` returns a fresh copy.
 */
export class FileArtifactStore {
  readonly #storageDirectory: string;

  constructor(rootDirectory: string) {
    this.#storageDirectory = join(rootDirectory, "sha256");
  }

  /**
   * Verifies and publishes one caller-owned byte array without replacing existing content.
   * Returns whether this call stored the artifact or found an exact duplicate. Invalid identities,
   * mismatched bytes, and occupied paths with different content reject with their typed errors.
   */
  async put(request: ArtifactPutRequest): Promise<ArtifactPutResult> {
    const { sha256, bytes: snapshot } = snapshotVerifiedArtifact(request);

    await mkdir(this.#storageDirectory, { recursive: true });
    const targetPath = join(this.#storageDirectory, sha256);
    const temporaryPath = join(
      this.#storageDirectory,
      `.${sha256}.${randomUUID()}.tmp`,
    );
    let temporaryFile: FileHandle | null = null;

    try {
      temporaryFile = await open(temporaryPath, "wx", 0o600);
      try {
        await temporaryFile.writeFile(snapshot);
        await temporaryFile.sync();
      } finally {
        await temporaryFile.close();
        temporaryFile = null;
      }

      try {
        await link(temporaryPath, targetPath);
        return { status: ArtifactPutStatus.Stored };
      } catch (error: unknown) {
        if (!hasCode(error, "EEXIST")) {
          throw error;
        }
        return await this.#verifyExisting(targetPath, sha256, snapshot);
      }
    } finally {
      if (temporaryFile !== null) {
        await temporaryFile.close();
      }
      await removeIfPresent(temporaryPath);
    }
  }

  /**
   * Retrieves a fresh byte array for one canonical SHA-256 identity, or `null` when it is absent.
   * Invalid identities reject with `ArtifactDigestError`; other filesystem failures propagate.
   */
  async get(sha256: string): Promise<Uint8Array | null> {
    validateArtifactSha256(sha256);
    try {
      const bytes = await readFile(join(this.#storageDirectory, sha256));
      return verifyStoredArtifactBytes(sha256, bytes.byteLength, bytes);
    } catch (error: unknown) {
      if (hasCode(error, "ENOENT")) {
        return null;
      }
      throw error;
    }
  }

  async #verifyExisting(
    targetPath: string,
    sha256: string,
    expectedBytes: Uint8Array,
  ): Promise<ArtifactPutResult> {
    let existingBytes: Uint8Array;
    try {
      existingBytes = await readFile(targetPath);
    } catch {
      throw new ArtifactConflictError(sha256);
    }
    verifyStoredArtifactBytes(
      sha256,
      existingBytes.byteLength,
      existingBytes,
      expectedBytes,
    );
    return { status: ArtifactPutStatus.AlreadyPresent };
  }
}

function hasCode(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}

async function removeIfPresent(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error: unknown) {
    if (!hasCode(error, "ENOENT")) {
      throw error;
    }
  }
}

export { PostgresqlExactArtifactStore } from "./postgresql-exact-artifact-store.js";
