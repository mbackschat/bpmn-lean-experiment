import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, open, readFile, unlink } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { join } from "node:path";

const sha256Pattern = /^[0-9a-f]{64}$/u;

export const ArtifactPutStatus = {
  Stored: "stored",
  AlreadyPresent: "already-present",
} as const;

export type ArtifactPutStatus =
  (typeof ArtifactPutStatus)[keyof typeof ArtifactPutStatus];

export type ArtifactPutResult = Readonly<{
  status: ArtifactPutStatus;
}>;

export type ArtifactPutRequest = Readonly<{
  sha256: string;
  bytes: Uint8Array;
}>;

/** Raised when a digest is not the canonical lowercase SHA-256 representation. */
export class ArtifactDigestError extends Error {
  readonly sha256: string;

  constructor(sha256: string) {
    super("artifact digest must be exactly 64 lowercase hexadecimal characters");
    this.name = "ArtifactDigestError";
    this.sha256 = sha256;
  }
}

/** Raised before storage when the supplied bytes do not have the claimed identity. */
export class ArtifactDigestMismatchError extends Error {
  readonly claimedSha256: string;
  readonly actualSha256: string;

  constructor(claimedSha256: string, actualSha256: string) {
    super(
      `artifact bytes have SHA-256 ${actualSha256}, not the claimed ${claimedSha256}`,
    );
    this.name = "ArtifactDigestMismatchError";
    this.claimedSha256 = claimedSha256;
    this.actualSha256 = actualSha256;
  }
}

/** Raised when an occupied content path does not contain the claimed exact bytes. */
export class ArtifactConflictError extends Error {
  readonly sha256: string;

  constructor(sha256: string) {
    super(`artifact path for SHA-256 ${sha256} is occupied by different content`);
    this.name = "ArtifactConflictError";
    this.sha256 = sha256;
  }
}

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
    const sha256 = request.sha256;
    validateSha256(sha256);
    const snapshot = Uint8Array.from(request.bytes);
    const actualSha256 = sha256Of(snapshot);
    if (actualSha256 !== sha256) {
      throw new ArtifactDigestMismatchError(sha256, actualSha256);
    }

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
    validateSha256(sha256);
    try {
      const bytes = await readFile(join(this.#storageDirectory, sha256));
      return Uint8Array.from(bytes);
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
    if (!bytesEqual(existingBytes, expectedBytes)) {
      throw new ArtifactConflictError(sha256);
    }
    return { status: ArtifactPutStatus.AlreadyPresent };
  }
}

function validateSha256(sha256: string): void {
  if (!sha256Pattern.test(sha256)) {
    throw new ArtifactDigestError(sha256);
  }
}

function sha256Of(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) {
    return false;
  }
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
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
