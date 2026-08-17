import { createHash } from "node:crypto";

import type { PostgresqlRuntime } from "@bpmn-lean/platform-postgresql-runtime";
import type { PostgresqlRow } from "@bpmn-lean/platform-postgresql-runtime";

import {
  DefinitionPresentationIntegrityError,
} from "./definition-presentation-contracts.js";
import type {
  BpmnDiagramPresentationSidecar,
  DefinitionPresentationKey,
  DefinitionPresentationRepository,
} from "./definition-presentation-contracts.js";
import {
  encodePostgresqlText,
  requireNonemptyByteText,
  requireSha256,
  requireString,
} from "./postgresql-definition-values.js";

/** Exact insert-or-compare storage for generated BPMN DI sidecars. */
export class PostgresqlDefinitionPresentationRepository
  implements DefinitionPresentationRepository {
  readonly #runtime: PostgresqlRuntime;

  constructor(runtime: PostgresqlRuntime) {
    this.#runtime = runtime;
  }

  async get(
    key: DefinitionPresentationKey,
  ): Promise<BpmnDiagramPresentationSidecar | null> {
    validateKey(key);
    const result = await this.#runtime.query({
      text: `
        SELECT * FROM bpmn_platform.definition_diagram_presentations
        WHERE schema_epoch = $1 AND source_sha256 = $2
          AND effective_generator_sha256 = $3
      `,
      values: [
        key.schemaEpoch,
        key.sourceSha256,
        key.effectiveGeneratorSha256,
      ],
    });
    const row = result.rows[0];
    return row === undefined ? null : decodeSidecar(row);
  }

  async insertOrCompare(
    sidecar: BpmnDiagramPresentationSidecar,
  ): Promise<BpmnDiagramPresentationSidecar> {
    const candidate = snapshotSidecar(sidecar);
    const inserted = await this.#runtime.query({
      text: `
        INSERT INTO bpmn_platform.definition_diagram_presentations (
          schema_epoch, source_sha256, effective_generator_sha256,
          diagram_interchange_sha256, presentation_sha256,
          generator_id, generator_version, diagram_interchange_xml
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (schema_epoch, source_sha256, effective_generator_sha256)
          DO NOTHING
        RETURNING *
      `,
      values: [
        candidate.schemaEpoch,
        candidate.sourceSha256,
        candidate.provenance.effectiveGeneratorSha256,
        candidate.diagramInterchangeSha256,
        candidate.presentationSha256,
        candidate.provenance.generatorId,
        candidate.provenance.generatorVersion,
        encodePostgresqlText(candidate.diagramInterchangeXml),
      ],
    });
    const insertedRow = inserted.rows[0];
    if (insertedRow !== undefined) return decodeSidecar(insertedRow);

    const existing = await this.get(presentationKey(candidate));
    if (existing === null) {
      throw new DefinitionPresentationIntegrityError(
        "definition presentation conflict winner disappeared",
      );
    }
    requireEquivalent(existing, candidate);
    return existing;
  }
}

function decodeSidecar(row: PostgresqlRow): BpmnDiagramPresentationSidecar {
  try {
    if (row.schema_epoch !== 1) {
      throw new TypeError("schema_epoch is not 1");
    }
    if (requireString(row, "generator_id") !== "bpmn-auto-layout" ||
        requireString(row, "generator_version") !== "1.3.0") {
      throw new TypeError("generator provenance is invalid");
    }
    return snapshotSidecar({
      schemaEpoch: 1,
      sourceSha256: requireSha256(row, "source_sha256"),
      diagramInterchangeSha256: requireSha256(
        row,
        "diagram_interchange_sha256",
      ),
      presentationSha256: requireSha256(row, "presentation_sha256"),
      provenance: {
        kind: "generated",
        generatorId: "bpmn-auto-layout",
        generatorVersion: "1.3.0",
        effectiveGeneratorSha256: requireSha256(
          row,
          "effective_generator_sha256",
        ),
      },
      diagramInterchangeXml: requireNonemptyByteText(
        row,
        "diagram_interchange_xml",
      ),
    });
  } catch (error: unknown) {
    throw new DefinitionPresentationIntegrityError(
      `stored definition presentation is invalid: ${errorMessage(error)}`,
    );
  }
}

function snapshotSidecar(
  value: BpmnDiagramPresentationSidecar,
): BpmnDiagramPresentationSidecar {
  if (value.schemaEpoch !== 1) throw new TypeError("sidecar schemaEpoch must be 1");
  validateSha256(value.sourceSha256, "sourceSha256");
  validateSha256(value.diagramInterchangeSha256, "diagramInterchangeSha256");
  validateSha256(value.presentationSha256, "presentationSha256");
  if (value.provenance.kind !== "generated" ||
      value.provenance.generatorId !== "bpmn-auto-layout" ||
      value.provenance.generatorVersion !== "1.3.0") {
    throw new TypeError("sidecar provenance must identify the selected generator");
  }
  validateSha256(
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

function presentationKey(
  value: BpmnDiagramPresentationSidecar,
): DefinitionPresentationKey {
  return {
    schemaEpoch: value.schemaEpoch,
    sourceSha256: value.sourceSha256,
    effectiveGeneratorSha256: value.provenance.effectiveGeneratorSha256,
  };
}

function validateKey(key: DefinitionPresentationKey): void {
  if (key.schemaEpoch !== 1) throw new TypeError("presentation key schemaEpoch must be 1");
  validateSha256(key.sourceSha256, "sourceSha256");
  validateSha256(key.effectiveGeneratorSha256, "effectiveGeneratorSha256");
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

function validateSha256(value: string, label: string): void {
  if (!/^[0-9a-f]{64}$/u.test(value)) throw new TypeError(`${label} must be SHA-256`);
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown stored-value failure";
}
