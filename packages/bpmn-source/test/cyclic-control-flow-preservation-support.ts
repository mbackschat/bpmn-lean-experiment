import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import type { BpmnSourceIdentity } from "@bpmn-lean/bpmn-source";
import type { DeepReadonly } from "@bpmn-lean/semantic-core";

import {
  resolveCurrentPreservationRegistrations,
} from "./cyclic-control-flow-preservation-registrations.ts";
import type {
  PreservationRegistrationBinding,
  RegistrationKind,
} from "./cyclic-control-flow-preservation-registrations.ts";

/** Closed, read-only snapshot contract and verifier for exact baseline compiler output. */
const baselineCommit = "7529150bf3a83de7e36734cf8d401924a0811b7d";
const expectedRegistrationCount = 56;
const expectedCatalogCount = 19;
const expectedRegistrationInventorySha256 =
  "7217befd4f27026c20dd6fc8b397d49e55c539497ed30f456e9cbfc55bebf9a5";
const expectedCatalogInventorySha256 =
  "8cb8ec63e922a3cd8f0c3fa14fe1db34706a1a5c94bc4a956728d5f16ec19679";
const expectedFixtureSha256 =
  "679f5a4323b027e93bf6d34d8054c7e877f4611f9aa7e9e2e896cc41dd880c55";
const sha256Pattern = /^[0-9a-f]{64}$/u;
const projectRoot = path.resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const fixtureUrl = new URL(
  "./fixtures/cyclic-control-flow-baseline.json",
  import.meta.url,
);
const limits = Object.freeze({
  maxBytes: 1024 * 1024,
  parserDeadlineMs: 1_000,
});

type JsonObject = Readonly<Record<string, unknown>>;
type FrozenBinding = PreservationRegistrationBinding;

type FrozenCatalogEntry = DeepReadonly<{
  key: string;
  sourceRelativePath: string;
  sourceId: string;
  semanticProfile: string;
  profileRelativePath: string;
  sourceSha256: string;
  profileSha256: string;
  admission: {
    status: "accepted";
    source: BpmnSourceIdentity;
    diagnostics: readonly [];
  };
  checkedProcess: unknown;
  semanticProcess: unknown;
}>;

export type FrozenPreservationArtifact = DeepReadonly<{
  kind: "cyclicControlFlowPreservationBaseline";
  formatVersion: 1;
  baselineCommit: string;
  registrations: ReadonlyArray<FrozenBinding>;
  catalog: ReadonlyArray<FrozenCatalogEntry>;
}>;

/** Reads the committed baseline bytes without exposing a producer or replacement path. */
export async function readPreservationFixtureBytes(): Promise<Buffer> {
  return readFile(fixtureUrl);
}

/** Rejects any replacement of the exact artifact produced by the immutable baseline. */
export async function verifyPreservationFixtureBytes(
  bytes: Uint8Array,
): Promise<FrozenPreservationArtifact> {
  requireEqual(sha256(bytes), expectedFixtureSha256, "baseline artifact SHA-256");
  return verifyCyclicControlFlowPreservation(decodePreservationArtifact(bytes));
}

export function decodePreservationArtifact(
  bytes: Uint8Array,
): FrozenPreservationArtifact {
  const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
  const root = exactObject(parsed, "artifact", [
    "baselineCommit",
    "catalog",
    "formatVersion",
    "kind",
    "registrations",
  ]);
  exactLiteral(root.kind, "cyclicControlFlowPreservationBaseline", "artifact.kind");
  exactLiteral(root.formatVersion, 1, "artifact.formatVersion");
  const registrations = arrayValue(root.registrations, "artifact.registrations")
    .map((value, index) => decodeBinding(value, `registrations[${index}]`));
  const catalog = arrayValue(root.catalog, "artifact.catalog")
    .map((value, index) => decodeCatalogEntry(value, `catalog[${index}]`));
  return {
    kind: "cyclicControlFlowPreservationBaseline",
    formatVersion: 1,
    baselineCommit: stringValue(root.baselineCommit, "artifact.baselineCommit"),
    registrations,
    catalog,
  };
}

/** Verifies the frozen artifact against current bytes, registrations, and compiler output. */
export async function verifyCyclicControlFlowPreservation(
  candidate: unknown,
): Promise<FrozenPreservationArtifact> {
  const artifact = decodePreservationArtifact(
    new TextEncoder().encode(JSON.stringify(candidate)),
  );
  requireEqual(artifact.baselineCommit, baselineCommit, "baseline target");
  requireEqual(
    artifact.registrations.length,
    expectedRegistrationCount,
    "baseline registration count",
  );
  requireEqual(
    artifact.catalog.length,
    expectedCatalogCount,
    "baseline catalog count",
  );
  requireSortedUnique(
    artifact.registrations.map(({ kind, relativePath }) => `${kind}:${relativePath}`),
    "baseline registrations",
  );
  requireSortedUnique(
    artifact.catalog.map(({ key }) => key),
    "baseline catalog",
  );
  requireEqual(
    inventorySha256(
      artifact.registrations.map(
        ({ kind, relativePath }) => `${kind}:${relativePath}`,
      ),
    ),
    expectedRegistrationInventorySha256,
    "baseline registration inventory",
  );
  requireEqual(
    inventorySha256(artifact.catalog.map(({ key }) => key)),
    expectedCatalogInventorySha256,
    "baseline catalog inventory",
  );

  const currentRegistrations = await resolveCurrentPreservationRegistrations();
  const currentByRegistration = uniqueMap(
    currentRegistrations,
    ({ kind, relativePath }) => `${kind}:${relativePath}`,
    "current registration",
  );
  for (const registration of artifact.registrations) {
    const registrationKey = `${registration.kind}:${registration.relativePath}`;
    const current = currentByRegistration.get(registrationKey);
    if (current === undefined) {
      throw new Error(`baseline registration is no longer registered: ${registrationKey}`);
    }
    requireDeepEqual(current, registration, `baseline registration ${registrationKey}`);
  }

  const frozenCatalog = uniqueMap(
    artifact.catalog,
    ({ key }) => key,
    "baseline catalog entry",
  );
  const catalogKeysFromRegistrations = [
    ...new Set(artifact.registrations.map(({ catalogKey }) => catalogKey)),
  ].sort(compareCodeUnits);
  requireDeepEqual(
    artifact.catalog.map(({ key }) => key),
    catalogKeysFromRegistrations,
    "catalog keys derived from registrations",
  );

  for (const registration of artifact.registrations) {
    const entry = frozenCatalog.get(registration.catalogKey);
    if (entry === undefined) {
      throw new Error(`registration has no catalog entry: ${registration.catalogKey}`);
    }
    requireDeepEqual(
      catalogBinding(entry),
      registrationBinding(registration),
      `catalog binding ${entry.key}`,
    );
  }
  for (const entry of artifact.catalog) {
    await verifyCatalogEntry(entry);
  }
  return artifact;
}

function decodeBinding(value: unknown, label: string): FrozenBinding {
  const object = exactObject(value, label, [
    "catalogKey",
    "kind",
    "profileRelativePath",
    "profileSha256",
    "relativePath",
    "semanticProfile",
    "sha256",
    "sourceId",
    "sourceRelativePath",
    "sourceSha256",
  ]);
  const kind = registrationKind(object.kind, `${label}.kind`);
  const relativePath = safeRelativePath(object.relativePath, `${label}.relativePath`);
  const sourceRelativePath = safeRelativePath(
    object.sourceRelativePath,
    `${label}.sourceRelativePath`,
  );
  const sourceId = nonemptyString(object.sourceId, `${label}.sourceId`);
  const semanticProfile = nonemptyString(
    object.semanticProfile,
    `${label}.semanticProfile`,
  );
  const profileRelativePath = safeRelativePath(
    object.profileRelativePath,
    `${label}.profileRelativePath`,
  );
  requireEqual(
    profileRelativePath,
    `profiles/${semanticProfile}/profile.json`,
    `${label} profile path`,
  );
  const catalogKey = stringValue(object.catalogKey, `${label}.catalogKey`);
  requireEqual(
    catalogKey,
    keyFor(sourceRelativePath, sourceId, semanticProfile),
    `${label} catalog key`,
  );
  return {
    kind,
    relativePath,
    sha256: digestValue(object.sha256, `${label}.sha256`),
    sourceRelativePath,
    sourceId,
    semanticProfile,
    profileRelativePath,
    sourceSha256: digestValue(object.sourceSha256, `${label}.sourceSha256`),
    profileSha256: digestValue(object.profileSha256, `${label}.profileSha256`),
    catalogKey,
  };
}

function decodeCatalogEntry(value: unknown, label: string): FrozenCatalogEntry {
  const object = exactObject(value, label, [
    "admission",
    "checkedProcess",
    "key",
    "profileRelativePath",
    "profileSha256",
    "semanticProcess",
    "semanticProfile",
    "sourceId",
    "sourceRelativePath",
    "sourceSha256",
  ]);
  const admission = exactObject(object.admission, `${label}.admission`, [
    "diagnostics",
    "source",
    "status",
  ]);
  exactLiteral(admission.status, "accepted", `${label}.admission.status`);
  const diagnostics = arrayValue(
    admission.diagnostics,
    `${label}.admission.diagnostics`,
  );
  requireEqual(diagnostics.length, 0, `${label} accepted diagnostics`);
  const sourceRelativePath = safeRelativePath(
    object.sourceRelativePath,
    `${label}.sourceRelativePath`,
  );
  const sourceId = nonemptyString(object.sourceId, `${label}.sourceId`);
  const semanticProfile = nonemptyString(
    object.semanticProfile,
    `${label}.semanticProfile`,
  );
  const profileRelativePath = safeRelativePath(
    object.profileRelativePath,
    `${label}.profileRelativePath`,
  );
  requireEqual(
    profileRelativePath,
    `profiles/${semanticProfile}/profile.json`,
    `${label} profile path`,
  );
  const key = stringValue(object.key, `${label}.key`);
  requireEqual(
    key,
    keyFor(sourceRelativePath, sourceId, semanticProfile),
    `${label} key`,
  );
  objectValue(object.checkedProcess, `${label}.checkedProcess`);
  objectValue(object.semanticProcess, `${label}.semanticProcess`);
  return {
    key,
    sourceRelativePath,
    sourceId,
    semanticProfile,
    profileRelativePath,
    sourceSha256: digestValue(object.sourceSha256, `${label}.sourceSha256`),
    profileSha256: digestValue(object.profileSha256, `${label}.profileSha256`),
    admission: {
      status: "accepted",
      source: decodeSourceIdentity(admission.source, `${label}.admission.source`),
      diagnostics: [],
    },
    checkedProcess: object.checkedProcess,
    semanticProcess: object.semanticProcess,
  };
}

function decodeSourceIdentity(value: unknown, label: string): BpmnSourceIdentity {
  const object = exactObject(value, label, [
    "byteLength",
    "declaredEncoding",
    "decodedAs",
    "id",
    "kind",
    "sha256",
  ]);
  exactLiteral(object.kind, "bpmnSource", `${label}.kind`);
  const declaredEncoding = nullableString(
    object.declaredEncoding,
    `${label}.declaredEncoding`,
  );
  if (object.decodedAs !== null && object.decodedAs !== "UTF-8") {
    throw new Error(`${label}.decodedAs must be UTF-8 or null`);
  }
  const byteLength = object.byteLength;
  if (!Number.isSafeInteger(byteLength) || typeof byteLength !== "number" || byteLength < 0) {
    throw new Error(`${label}.byteLength must be a non-negative safe integer`);
  }
  return {
    kind: "bpmnSource",
    id: nonemptyString(object.id, `${label}.id`),
    sha256: digestValue(object.sha256, `${label}.sha256`),
    byteLength,
    declaredEncoding,
    decodedAs: object.decodedAs,
  };
}

async function verifyCatalogEntry(entry: FrozenCatalogEntry): Promise<void> {
  const [sourceBytes, profileBytes] = await Promise.all([
    readFile(resolveInside(entry.sourceRelativePath)),
    readFile(resolveInside(entry.profileRelativePath)),
  ]);
  requireEqual(sha256(sourceBytes), entry.sourceSha256, `${entry.key} source SHA-256`);
  requireEqual(sha256(profileBytes), entry.profileSha256, `${entry.key} profile SHA-256`);
  const result = await compileBpmnToSemanticProcess({
    bytes: sourceBytes,
    sourceId: entry.sourceId,
    expectedSha256: entry.sourceSha256,
    semanticProfile: entry.semanticProfile,
    sourceOverlay: null,
    limits,
  });
  if (result.status !== BpmnCompilationStatus.Accepted) {
    throw new Error(`${entry.key} admission changed to ${result.status}`);
  }
  requireDeepEqual(
    {
      status: result.status,
      source: result.source,
      diagnostics: result.diagnostics,
    },
    entry.admission,
    `${entry.key} admission projection`,
  );
  requireDeepEqual(result.checkedProcess, entry.checkedProcess, `${entry.key} checked projection`);
  requireDeepEqual(
    result.semanticProcess,
    entry.semanticProcess,
    `${entry.key} Semantic Process projection`,
  );
}

function registrationBinding(registration: FrozenBinding): JsonObject {
  return {
    sourceRelativePath: registration.sourceRelativePath,
    sourceId: registration.sourceId,
    semanticProfile: registration.semanticProfile,
    profileRelativePath: registration.profileRelativePath,
    sourceSha256: registration.sourceSha256,
    profileSha256: registration.profileSha256,
  };
}

function catalogBinding(entry: FrozenCatalogEntry): JsonObject {
  return {
    sourceRelativePath: entry.sourceRelativePath,
    sourceId: entry.sourceId,
    semanticProfile: entry.semanticProfile,
    profileRelativePath: entry.profileRelativePath,
    sourceSha256: entry.sourceSha256,
    profileSha256: entry.profileSha256,
  };
}

function exactObject(value: unknown, label: string, keys: ReadonlyArray<string>): JsonObject {
  const object = objectValue(value, label);
  requireDeepEqual(Object.keys(object).sort(compareCodeUnits), [...keys].sort(compareCodeUnits), `${label} keys`);
  return object;
}

function objectValue(value: unknown, label: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonObject;
}

function arrayValue(value: unknown, label: string): ReadonlyArray<unknown> {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value;
}

function registrationKind(value: unknown, label: string): RegistrationKind {
  if (
    value !== "artifactCase" &&
    value !== "normativeArtifactCase" &&
    value !== "productExample"
  ) {
    throw new Error(
      `${label} must be artifactCase, normativeArtifactCase, or productExample`,
    );
  }
  return value;
}

function nonemptyString(value: unknown, label: string): string {
  const string = stringValue(value, label);
  if (string.length === 0) {
    throw new Error(`${label} must not be empty`);
  }
  return string;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`);
  }
  return value;
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null) {
    return null;
  }
  return stringValue(value, label);
}

function digestValue(value: unknown, label: string): string {
  const digest = stringValue(value, label);
  if (!sha256Pattern.test(digest)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest`);
  }
  return digest;
}

function safeRelativePath(value: unknown, label: string): string {
  const relativePath = nonemptyString(value, label);
  if (
    path.isAbsolute(relativePath) ||
    relativePath.includes("\\") ||
    path.posix.normalize(relativePath) !== relativePath ||
    relativePath === ".." ||
    relativePath.startsWith("../")
  ) {
    throw new Error(`${label} must be a normalized project-relative POSIX path`);
  }
  return relativePath;
}

function resolveInside(relativePath: string): string {
  safeRelativePath(relativePath, "relative path");
  const absolutePath = path.resolve(projectRoot, relativePath);
  if (absolutePath !== projectRoot && !absolutePath.startsWith(`${projectRoot}${path.sep}`)) {
    throw new Error(`path escapes project root: ${relativePath}`);
  }
  return absolutePath;
}

function keyFor(sourceRelativePath: string, sourceId: string, semanticProfile: string): string {
  return `${sourceRelativePath}::${sourceId}::${semanticProfile}`;
}

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function inventorySha256(values: ReadonlyArray<string>): string {
  return sha256(`${values.join("\n")}\n`);
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function requireSortedUnique(values: ReadonlyArray<string>, label: string): void {
  requireDeepEqual(values, [...values].sort(compareCodeUnits), `${label} order`);
  requireEqual(new Set(values).size, values.length, `${label} uniqueness`);
}

function uniqueMap<T>(
  values: ReadonlyArray<T>,
  keyOf: (value: T) => string,
  label: string,
): ReadonlyMap<string, T> {
  const result = new Map<string, T>();
  for (const value of values) {
    const key = keyOf(value);
    if (result.has(key)) {
      throw new Error(`${label} is duplicated: ${key}`);
    }
    result.set(key, value);
  }
  return result;
}

function exactLiteral<T extends string | number>(
  actual: unknown,
  expected: T,
  label: string,
): asserts actual is T {
  requireEqual(actual, expected, label);
}

function requireEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label} differs: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function requireDeepEqual(actual: unknown, expected: unknown, label: string): void {
  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error(`${label} differs`);
  }
}
