import {
  decodeCanonicalHumanTaskCatalogV1,
  serializeHumanTaskCatalogV1,
} from "@bpmn-lean/platform-contracts";
import type { HumanTaskCatalogV1 } from "@bpmn-lean/platform-contracts";
import type { PostgresqlRow } from "@bpmn-lean/platform-postgresql-runtime";

import type {
  DefinitionMetadata,
  DefinitionReference,
  NewDefinitionMetadata,
} from "./contracts.js";
import {
  decodeDefinitionStartCapabilities,
  encodeDefinitionStartCapabilities,
} from "./definition-capabilities.js";

const sha256Pattern = /^[0-9a-f]{64}$/u;
const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

export function snapshotNewDefinitionMetadata(
  metadata: NewDefinitionMetadata,
): NewDefinitionMetadata {
  const exact = decodeDefinitionMetadata(definitionValueRow(metadata, 1));
  return {
    processId: exact.processId,
    source: exact.source,
    semanticProfile: exact.semanticProfile,
    startCapabilities: exact.startCapabilities,
  };
}

export function snapshotDefinitionMetadata(
  metadata: DefinitionMetadata,
): DefinitionMetadata {
  return decodeNonemptyDefinitionMetadata(definitionValueRow(metadata, metadata.version));
}

function definitionValueRow(
  metadata: DefinitionMetadata | NewDefinitionMetadata,
  version: number,
): PostgresqlRow {
  return {
    process_id: encodePostgresqlText(metadata.processId),
    version,
    source_kind: metadata.source.kind,
    source_id: encodePostgresqlText(metadata.source.id),
    source_sha256: metadata.source.sha256,
    source_byte_length: metadata.source.byteLength,
    source_declared_encoding: encodeNullablePostgresqlText(
      metadata.source.declaredEncoding,
    ),
    source_decoded_as: metadata.source.decodedAs,
    semantic_profile: encodePostgresqlText(metadata.semanticProfile),
    start_capabilities_json: encodeDefinitionStartCapabilities(
      metadata.startCapabilities,
    ),
  };
}

export function decodeDefinitionMetadata(
  row: PostgresqlRow,
): DefinitionMetadata {
  const sourceKind = requireString(row, "source_kind");
  const decodedAs = requireNullableString(row, "source_decoded_as");
  if (
    sourceKind !== "bpmnSource" ||
    (decodedAs !== null && decodedAs !== "UTF-8")
  ) {
    throw new TypeError("PostgreSQL definition value has invalid source identity");
  }
  return {
    processId: requireByteText(row, "process_id"),
    version: requirePositiveSafeInteger(row, "version"),
    source: {
      kind: sourceKind,
      id: requireByteText(row, "source_id"),
      sha256: requireSha256(row, "source_sha256"),
      byteLength: requireNonnegativeSafeInteger(row, "source_byte_length"),
      declaredEncoding: requireNullableByteText(row, "source_declared_encoding"),
      decodedAs,
    },
    semanticProfile: requireByteText(row, "semantic_profile"),
    startCapabilities: decodeDefinitionStartCapabilities(
      requireString(row, "start_capabilities_json"),
    ),
  };
}

export function decodeNonemptyDefinitionMetadata(
  row: PostgresqlRow,
): DefinitionMetadata {
  const metadata = decodeDefinitionMetadata(row);
  for (const [label, value] of [
    ["process_id", metadata.processId],
    ["source_id", metadata.source.id],
    ["semantic_profile", metadata.semanticProfile],
  ] as const) {
    if (value.length === 0) {
      throw new TypeError(`PostgreSQL stored value has invalid ${label}`);
    }
  }
  return metadata;
}

export function encodeBoundHumanTaskCatalog(
  metadata: NewDefinitionMetadata,
  catalog: HumanTaskCatalogV1 | null,
): string | null {
  if (catalog === null) return null;
  if (
    catalog.processId !== metadata.processId ||
    catalog.semanticProfile !== metadata.semanticProfile ||
    catalog.sourceSha256 !== metadata.source.sha256
  ) {
    throw new TypeError("Human Task catalog identity does not match its definition");
  }
  return utf8Decoder.decode(serializeHumanTaskCatalogV1(catalog));
}

export function decodeBoundHumanTaskCatalog(
  row: PostgresqlRow,
  reference: DefinitionReference,
): HumanTaskCatalogV1 | null {
  const encoded = requireNullableString(row, "human_task_catalog_json");
  if (encoded === null) return null;
  const catalog = decodeCanonicalHumanTaskCatalogV1(utf8Encoder.encode(encoded));
  const canonical = utf8Decoder.decode(serializeHumanTaskCatalogV1(catalog));
  if (
    canonical !== encoded ||
    catalog.processId !== reference.processId ||
    catalog.semanticProfile !== requireNonemptyByteText(row, "semantic_profile") ||
    catalog.sourceSha256 !== requireSha256(row, "source_sha256")
  ) {
    throw new TypeError("PostgreSQL Human Task catalog definition identity drifted");
  }
  return catalog;
}

export function metadataSqlValues(
  metadata: DefinitionMetadata | NewDefinitionMetadata,
): readonly unknown[] {
  return [
    metadata.source.kind,
    encodePostgresqlText(metadata.source.id),
    metadata.source.sha256,
    metadata.source.byteLength,
    encodeNullablePostgresqlText(metadata.source.declaredEncoding),
    metadata.source.decodedAs,
    encodePostgresqlText(metadata.semanticProfile),
    encodeDefinitionStartCapabilities(metadata.startCapabilities),
  ];
}

export function requireString(row: PostgresqlRow, field: string): string {
  const value = row[field];
  if (typeof value !== "string") {
    throw new TypeError(`PostgreSQL stored value has invalid ${field}`);
  }
  return value;
}

export function requireNonemptyString(
  row: PostgresqlRow,
  field: string,
): string {
  const value = requireString(row, field);
  if (value.length === 0 || !value.isWellFormed()) {
    throw new TypeError(`PostgreSQL stored value has invalid ${field}`);
  }
  return value;
}

export function encodePostgresqlText(value: string): Buffer {
  if (typeof value !== "string" || !value.isWellFormed()) {
    throw new TypeError("PostgreSQL exact text must be well-formed Unicode");
  }
  return Buffer.from(value, "utf8");
}

export function encodeNullablePostgresqlText(value: string | null): Buffer | null {
  return value === null ? null : encodePostgresqlText(value);
}

export function requireByteText(row: PostgresqlRow, field: string): string {
  const value = row[field];
  if (!(value instanceof Uint8Array)) {
    throw new TypeError(`PostgreSQL stored value has invalid ${field}`);
  }
  try {
    return utf8Decoder.decode(value);
  } catch (error: unknown) {
    throw new TypeError(`PostgreSQL stored value has invalid ${field}`, {
      cause: error,
    });
  }
}

export function requireNonemptyByteText(
  row: PostgresqlRow,
  field: string,
): string {
  const value = requireByteText(row, field);
  if (value.length === 0 || !value.isWellFormed()) {
    throw new TypeError(`PostgreSQL stored value has invalid ${field}`);
  }
  return value;
}

export function requireNullableByteText(
  row: PostgresqlRow,
  field: string,
): string | null {
  return row[field] === null ? null : requireByteText(row, field);
}

export function requireNullableString(
  row: PostgresqlRow,
  field: string,
): string | null {
  const value = row[field];
  if (value !== null && typeof value !== "string") {
    throw new TypeError(`PostgreSQL stored value has invalid ${field}`);
  }
  return value;
}

export function requirePositiveSafeInteger(
  row: PostgresqlRow,
  field: string,
): number {
  const value = requireSafeInteger(row, field);
  if (value <= 0) {
    throw new TypeError(`PostgreSQL stored value has invalid ${field}`);
  }
  return value;
}

export function requireNonnegativeSafeInteger(
  row: PostgresqlRow,
  field: string,
): number {
  const value = requireSafeInteger(row, field);
  if (value < 0) {
    throw new TypeError(`PostgreSQL stored value has invalid ${field}`);
  }
  return value;
}

export function requireBoolean(row: PostgresqlRow, field: string): boolean {
  const value = row[field];
  if (typeof value !== "boolean") {
    throw new TypeError(`PostgreSQL stored value has invalid ${field}`);
  }
  return value;
}

export function requireSha256(row: PostgresqlRow, field: string): string {
  const value = requireString(row, field);
  if (!sha256Pattern.test(value)) {
    throw new TypeError(`PostgreSQL stored value has invalid ${field}`);
  }
  return value;
}

export function hasPostgresqlCode(error: unknown, code: string): boolean {
  return error instanceof Error &&
    "code" in error &&
    error.code === code;
}

function requireSafeInteger(row: PostgresqlRow, field: string): number {
  const raw = row[field];
  const value = typeof raw === "string" && /^(?:0|[1-9][0-9]*)$/u.test(raw)
    ? Number(raw)
    : raw;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new TypeError(`PostgreSQL stored value has invalid ${field}`);
  }
  return value;
}
