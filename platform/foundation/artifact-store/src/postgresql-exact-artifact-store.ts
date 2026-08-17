import type { PostgresqlSession } from "@bpmn-lean/platform-postgresql-runtime";

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

type ArtifactRow = Readonly<Record<string, unknown>> &
  Readonly<{
    sha256: unknown;
    byte_length: unknown;
    bytes: unknown;
  }>;

/** Stores immutable exact artifacts in the caller-owned shared PostgreSQL runtime. */
export class PostgresqlExactArtifactStore {
  readonly #database: Pick<PostgresqlSession, "query">;

  constructor(database: Pick<PostgresqlSession, "query">) {
    this.#database = database;
  }

  /**
   * Inserts one verified caller-owned byte snapshot without replacing an occupied digest. An exact
   * occupied row is idempotent; any divergent or corrupt occupied row fails closed.
   */
  async put(request: ArtifactPutRequest): Promise<ArtifactPutResult> {
    const { sha256, bytes: snapshot } = snapshotVerifiedArtifact(request);

    const insertion = await this.#database.query({
      text: `
        INSERT INTO bpmn_platform.exact_artifacts (sha256, byte_length, bytes)
        VALUES ($1, $2, $3)
        ON CONFLICT DO NOTHING
        RETURNING sha256
      `,
      values: [sha256, snapshot.byteLength, Buffer.from(snapshot)],
    });
    if (insertion.rowCount === 1) {
      return { status: ArtifactPutStatus.Stored };
    }
    if (insertion.rowCount !== 0) {
      throw new ArtifactConflictError(sha256);
    }

    const occupied = await this.#readRow(sha256);
    verifyStoredRow(sha256, occupied, snapshot);
    return { status: ArtifactPutStatus.AlreadyPresent };
  }

  /** Returns detached verified bytes, `null` for absence, or a typed conflict for corruption. */
  async get(sha256: string): Promise<Uint8Array | null> {
    validateArtifactSha256(sha256);
    const row = await this.#readRow(sha256);
    return row === null ? null : verifyStoredRow(sha256, row);
  }

  async #readRow(sha256: string): Promise<ArtifactRow | null> {
    const result = await this.#database.query<ArtifactRow>({
      text: `
        SELECT sha256, byte_length::text AS byte_length, bytes
        FROM bpmn_platform.exact_artifacts
        WHERE sha256 = $1
      `,
      values: [sha256],
    });
    if (result.rows.length === 0) {
      return null;
    }
    if (result.rows.length !== 1) {
      throw new ArtifactConflictError(sha256);
    }
    return result.rows[0] ?? null;
  }
}

function verifyStoredRow(
  expectedSha256: string,
  row: ArtifactRow | null,
  expectedBytes?: Uint8Array,
): Uint8Array {
  if (row === null || row.sha256 !== expectedSha256) {
    throw new ArtifactConflictError(expectedSha256);
  }
  const storedLength = parseStoredLength(row.byte_length);
  return verifyStoredArtifactBytes(
    expectedSha256,
    storedLength,
    row.bytes,
    expectedBytes,
  );
}

function parseStoredLength(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && /^(?:0|[1-9][0-9]*)$/u.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}
