import { createHash } from "node:crypto";

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

export type VerifiedArtifactSnapshot = Readonly<{
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

/** Raised when occupied artifact storage does not contain the claimed exact bytes. */
export class ArtifactConflictError extends Error {
  readonly sha256: string;

  constructor(sha256: string) {
    super(`artifact storage for SHA-256 ${sha256} is occupied by different content`);
    this.name = "ArtifactConflictError";
    this.sha256 = sha256;
  }
}

/** Validates identity and snapshots caller-owned bytes before an adapter's first async boundary. */
export function snapshotVerifiedArtifact(
  request: ArtifactPutRequest,
): VerifiedArtifactSnapshot {
  const sha256 = request.sha256;
  validateArtifactSha256(sha256);
  const bytes = Uint8Array.from(request.bytes);
  const actualSha256 = artifactSha256(bytes);
  if (actualSha256 !== sha256) {
    throw new ArtifactDigestMismatchError(sha256, actualSha256);
  }
  return { sha256, bytes };
}

export function validateArtifactSha256(sha256: string): void {
  if (!sha256Pattern.test(sha256)) {
    throw new ArtifactDigestError(sha256);
  }
}

/** Revalidates bytes crossing a storage trust boundary and returns a detached copy. */
export function verifyStoredArtifactBytes(
  sha256: string,
  storedByteLength: number | null,
  storedValue: unknown,
  expectedBytes?: Uint8Array,
): Uint8Array {
  if (!(storedValue instanceof Uint8Array)) {
    throw new ArtifactConflictError(sha256);
  }
  const storedBytes = Uint8Array.from(storedValue);
  if (
    storedByteLength !== storedBytes.byteLength ||
    artifactSha256(storedBytes) !== sha256 ||
    (expectedBytes !== undefined && !artifactBytesEqual(storedBytes, expectedBytes))
  ) {
    throw new ArtifactConflictError(sha256);
  }
  return storedBytes;
}

function artifactSha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function artifactBytesEqual(left: Uint8Array, right: Uint8Array): boolean {
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
