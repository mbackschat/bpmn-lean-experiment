import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { SQLOutputValue } from "node:sqlite";

import {
  DefinitionPresentationIntegrityError,
} from "./definition-presentation-contracts.js";
import type {
  BpmnDiagramPresentationSidecar,
  DefinitionPresentationKey,
  DefinitionPresentationRepository,
} from "./definition-presentation-contracts.js";
import { requireDefinitionDatabaseSchemaEpoch } from "./database-schema-epoch.js";

const defaultBusyTimeoutMs = 5_000;

/** Exact insert-or-compare storage for generated BPMN DI sidecars. */
export class SqliteDefinitionPresentationRepository
  implements DefinitionPresentationRepository {
  readonly #database: DatabaseSync;

  constructor(databaseFile: string, busyTimeoutMs: number = defaultBusyTimeoutMs) {
    if (!Number.isSafeInteger(busyTimeoutMs) || busyTimeoutMs <= 0) {
      throw new RangeError("busyTimeoutMs must be a positive safe integer");
    }
    this.#database = new DatabaseSync(databaseFile);
    this.#database.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
    try {
      requireDefinitionDatabaseSchemaEpoch(this.#database);
      initializeSchema(this.#database);
    } catch (error: unknown) {
      this.#database.close();
      throw error;
    }
  }

  async get(
    key: DefinitionPresentationKey,
  ): Promise<BpmnDiagramPresentationSidecar | null> {
    validateKey(key);
    const row = this.#database.prepare(`
      SELECT * FROM definition_diagram_presentations
      WHERE schema_epoch = ? AND source_sha256 = ?
        AND effective_generator_sha256 = ?
    `).get(key.schemaEpoch, key.sourceSha256, key.effectiveGeneratorSha256);
    return row === undefined ? null : decodeSidecar(row);
  }

  async insertOrCompare(
    sidecar: BpmnDiagramPresentationSidecar,
  ): Promise<BpmnDiagramPresentationSidecar> {
    const candidate = snapshotSidecar(sidecar);
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const key = presentationKey(candidate);
      const existingRow = this.#database.prepare(`
        SELECT * FROM definition_diagram_presentations
        WHERE schema_epoch = ? AND source_sha256 = ?
          AND effective_generator_sha256 = ?
      `).get(key.schemaEpoch, key.sourceSha256, key.effectiveGeneratorSha256);
      if (existingRow !== undefined) {
        const existing = decodeSidecar(existingRow);
        requireEquivalent(existing, candidate);
        this.#database.exec("COMMIT");
        return existing;
      }
      this.#database.prepare(`
        INSERT INTO definition_diagram_presentations (
          schema_epoch, source_sha256, effective_generator_sha256,
          diagram_interchange_sha256, presentation_sha256,
          generator_id, generator_version, diagram_interchange_xml
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        candidate.schemaEpoch,
        candidate.sourceSha256,
        candidate.provenance.effectiveGeneratorSha256,
        candidate.diagramInterchangeSha256,
        candidate.presentationSha256,
        candidate.provenance.generatorId,
        candidate.provenance.generatorVersion,
        candidate.diagramInterchangeXml,
      );
      this.#database.exec("COMMIT");
      return candidate;
    } catch (error: unknown) {
      if (this.#database.isTransaction) this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    if (this.#database.isOpen) this.#database.close();
  }
}

function initializeSchema(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS definition_diagram_presentations (
      schema_epoch INTEGER NOT NULL CHECK (schema_epoch = 1),
      source_sha256 TEXT NOT NULL CHECK (
        length(source_sha256) = 64 AND source_sha256 NOT GLOB '*[^0-9a-f]*'
      ),
      effective_generator_sha256 TEXT NOT NULL CHECK (
        length(effective_generator_sha256) = 64
        AND effective_generator_sha256 NOT GLOB '*[^0-9a-f]*'
      ),
      diagram_interchange_sha256 TEXT NOT NULL CHECK (
        length(diagram_interchange_sha256) = 64
        AND diagram_interchange_sha256 NOT GLOB '*[^0-9a-f]*'
      ),
      presentation_sha256 TEXT NOT NULL CHECK (
        length(presentation_sha256) = 64
        AND presentation_sha256 NOT GLOB '*[^0-9a-f]*'
      ),
      generator_id TEXT NOT NULL CHECK (generator_id = 'bpmn-auto-layout'),
      generator_version TEXT NOT NULL CHECK (generator_version = '1.3.0'),
      diagram_interchange_xml TEXT NOT NULL CHECK (length(diagram_interchange_xml) > 0),
      PRIMARY KEY (schema_epoch, source_sha256, effective_generator_sha256)
    ) STRICT
  `);
  const columns = database.prepare(`
    SELECT name, type, "notnull", pk
    FROM pragma_table_info('definition_diagram_presentations')
    ORDER BY cid
  `).all();
  const expected = [
    ["schema_epoch", "INTEGER", 1, 1],
    ["source_sha256", "TEXT", 1, 2],
    ["effective_generator_sha256", "TEXT", 1, 3],
    ["diagram_interchange_sha256", "TEXT", 1, 0],
    ["presentation_sha256", "TEXT", 1, 0],
    ["generator_id", "TEXT", 1, 0],
    ["generator_version", "TEXT", 1, 0],
    ["diagram_interchange_xml", "TEXT", 1, 0],
  ] as const;
  if (columns.length !== expected.length || columns.some((column, index) => {
    const wanted = expected[index];
    return wanted === undefined || column.name !== wanted[0] ||
      column.type !== wanted[1] || column.notnull !== wanted[2] ||
      column.pk !== wanted[3];
  })) {
    throw new DefinitionPresentationIntegrityError(
      "definition presentation table does not match schema epoch 1",
    );
  }
}

function decodeSidecar(row: Record<string, SQLOutputValue>): BpmnDiagramPresentationSidecar {
  const sidecar = {
    schemaEpoch: requireNumber(row, "schema_epoch"),
    sourceSha256: requireString(row, "source_sha256"),
    diagramInterchangeSha256: requireString(row, "diagram_interchange_sha256"),
    presentationSha256: requireString(row, "presentation_sha256"),
    provenance: {
      kind: "generated" as const,
      generatorId: requireExactString(
        row,
        "generator_id",
        "bpmn-auto-layout",
      ),
      generatorVersion: requireExactString(
        row,
        "generator_version",
        "1.3.0",
      ),
      effectiveGeneratorSha256: requireString(row, "effective_generator_sha256"),
    },
    diagramInterchangeXml: requireString(row, "diagram_interchange_xml"),
  };
  try {
    return snapshotSidecar(sidecar);
  } catch (error: unknown) {
    throw new DefinitionPresentationIntegrityError(
      `stored definition presentation is invalid: ${errorMessage(error)}`,
    );
  }
}

function snapshotSidecar(value: BpmnDiagramPresentationSidecar): BpmnDiagramPresentationSidecar {
  if (value.schemaEpoch !== 1) throw new TypeError("sidecar schemaEpoch must be 1");
  requireSha256(value.sourceSha256, "sourceSha256");
  requireSha256(value.diagramInterchangeSha256, "diagramInterchangeSha256");
  requireSha256(value.presentationSha256, "presentationSha256");
  if (value.provenance.kind !== "generated" ||
      value.provenance.generatorId !== "bpmn-auto-layout" ||
      value.provenance.generatorVersion !== "1.3.0") {
    throw new TypeError("sidecar provenance must identify the selected generator");
  }
  requireSha256(
    value.provenance.effectiveGeneratorSha256,
    "effectiveGeneratorSha256",
  );
  if (typeof value.diagramInterchangeXml !== "string" ||
      value.diagramInterchangeXml.length === 0 ||
      !value.diagramInterchangeXml.isWellFormed()) {
    throw new TypeError("diagramInterchangeXml must be nonempty well-formed Unicode");
  }
  if (sha256(value.diagramInterchangeXml) !== value.diagramInterchangeSha256) {
    throw new TypeError("diagramInterchangeSha256 does not match exact UTF-8 XML");
  }
  return structuredClone(value);
}

function presentationKey(value: BpmnDiagramPresentationSidecar): DefinitionPresentationKey {
  return {
    schemaEpoch: value.schemaEpoch,
    sourceSha256: value.sourceSha256,
    effectiveGeneratorSha256: value.provenance.effectiveGeneratorSha256,
  };
}

function validateKey(key: DefinitionPresentationKey): void {
  if (key.schemaEpoch !== 1) throw new TypeError("presentation key schemaEpoch must be 1");
  requireSha256(key.sourceSha256, "sourceSha256");
  requireSha256(key.effectiveGeneratorSha256, "effectiveGeneratorSha256");
}

function requireEquivalent(
  left: BpmnDiagramPresentationSidecar,
  right: BpmnDiagramPresentationSidecar,
): void {
  if (
    left.schemaEpoch !== right.schemaEpoch ||
    left.sourceSha256 !== right.sourceSha256 ||
    left.diagramInterchangeSha256 !== right.diagramInterchangeSha256 ||
    left.presentationSha256 !== right.presentationSha256 ||
    left.provenance.kind !== right.provenance.kind ||
    left.provenance.generatorId !== right.provenance.generatorId ||
    left.provenance.generatorVersion !== right.provenance.generatorVersion ||
    left.provenance.effectiveGeneratorSha256 !==
      right.provenance.effectiveGeneratorSha256 ||
    left.diagramInterchangeXml !== right.diagramInterchangeXml
  ) {
    throw new DefinitionPresentationIntegrityError(
      "stored definition presentation conflicts with the candidate sidecar",
    );
  }
}

function requireString(row: Record<string, SQLOutputValue>, field: string): string {
  const value = row[field];
  if (typeof value !== "string") {
    throw new DefinitionPresentationIntegrityError(`stored ${field} is not text`);
  }
  return value;
}

function requireExactString<const Value extends string>(
  row: Record<string, SQLOutputValue>,
  field: string,
  expected: Value,
): Value {
  if (row[field] !== expected) {
    throw new DefinitionPresentationIntegrityError(
      `stored ${field} does not match ${expected}`,
    );
  }
  return expected;
}

function requireNumber(row: Record<string, SQLOutputValue>, field: string): 1 {
  if (row[field] !== 1) {
    throw new DefinitionPresentationIntegrityError(`stored ${field} is not 1`);
  }
  return 1;
}

function requireSha256(value: string, label: string): void {
  if (!/^[0-9a-f]{64}$/u.test(value)) throw new TypeError(`${label} must be SHA-256`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown stored-value failure";
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
