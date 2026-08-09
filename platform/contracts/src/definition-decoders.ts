import { DefinitionDeployStatus } from "./definitions.js";
import type {
  AdmissionDiagnostic,
  DefinitionDeployResult,
  DefinitionListResponse,
  DefinitionVersionListResponse,
  DeployedDefinitionVersion,
  ExactPublicSourceIdentity,
  LocatedAdmissionElement,
  RejectedDefinitionResult,
} from "./definitions.js";

const lowercaseSha256 = /^[0-9a-f]{64}$/u;

/** Decodes one deployment response and rejects unknown or private fields at every level. */
export function decodeDefinitionDeployResult(value: unknown): DefinitionDeployResult {
  requireObject(value, "deployment result");
  const status = readOwn(value, "status");
  switch (status) {
    case DefinitionDeployStatus.Deployed:
      requireExactKeys(value, "deployment result", ["definition", "status"]);
      return {
        status,
        definition: decodeDefinitionVersion(readOwn(value, "definition"), "definition"),
      };
    case DefinitionDeployStatus.Rejected:
      return decodeRejectedDefinition(value);
    default:
      throw new TypeError("deployment result.status must be deployed or rejected");
  }
}

/** Decodes the collection response used by definition-list clients. */
export function decodeDefinitionListResponse(value: unknown): DefinitionListResponse {
  requireObject(value, "definition list");
  requireExactKeys(value, "definition list", ["definitions"]);
  return {
    definitions: decodeDefinitionArray(readOwn(value, "definitions"), "definitions"),
  };
}

/** Decodes one process's complete public version list and checks its repeated identity. */
export function decodeDefinitionVersionListResponse(
  value: unknown,
): DefinitionVersionListResponse {
  requireObject(value, "definition version list");
  requireExactKeys(value, "definition version list", ["processId", "versions"]);
  const processId = requireNonemptyString(readOwn(value, "processId"), "processId");
  const versions = decodeDefinitionArray(readOwn(value, "versions"), "versions");
  versions.forEach((version, index) => {
    if (version.processId !== processId) {
      throw new TypeError(`versions[${index}].processId must equal processId`);
    }
  });
  return { processId, versions };
}

function decodeRejectedDefinition(value: object): RejectedDefinitionResult {
  requireExactKeys(value, "deployment result", [
    "diagnostics",
    "semanticProfile",
    "source",
    "status",
  ]);
  const diagnosticsValue = readOwn(value, "diagnostics");
  if (!Array.isArray(diagnosticsValue) || diagnosticsValue.length === 0) {
    throw new TypeError("diagnostics must be a nonempty array");
  }
  const first = decodeDiagnostic(diagnosticsValue[0], "diagnostics[0]");
  const remainder = diagnosticsValue.slice(1).map((diagnostic, index) =>
    decodeDiagnostic(diagnostic, `diagnostics[${index + 1}]`)
  );
  return {
    status: DefinitionDeployStatus.Rejected,
    source: decodeSource(readOwn(value, "source"), "source"),
    semanticProfile: requireNonemptyString(
      readOwn(value, "semanticProfile"),
      "semanticProfile",
    ),
    diagnostics: [first, ...remainder],
  };
}

function decodeDefinitionArray(
  value: unknown,
  label: string,
): ReadonlyArray<DeployedDefinitionVersion> {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be an array`);
  }
  return value.map((definition, index) =>
    decodeDefinitionVersion(definition, `${label}[${index}]`)
  );
}

function decodeDefinitionVersion(
  value: unknown,
  label: string,
): DeployedDefinitionVersion {
  requireObject(value, label);
  requireExactKeys(value, label, ["processId", "semanticProfile", "source", "version"]);
  return {
    processId: requireNonemptyString(readOwn(value, "processId"), `${label}.processId`),
    version: requirePositiveSafeInteger(readOwn(value, "version"), `${label}.version`),
    source: decodeSource(readOwn(value, "source"), `${label}.source`),
    semanticProfile: requireNonemptyString(
      readOwn(value, "semanticProfile"),
      `${label}.semanticProfile`,
    ),
  };
}

function decodeSource(value: unknown, label: string): ExactPublicSourceIdentity {
  requireObject(value, label);
  requireExactKeys(value, label, [
    "byteLength",
    "declaredEncoding",
    "decodedAs",
    "id",
    "kind",
    "sha256",
  ]);
  const kind = readOwn(value, "kind");
  if (kind !== "bpmnSource") {
    throw new TypeError(`${label}.kind must be bpmnSource`);
  }
  const sha256 = requireString(readOwn(value, "sha256"), `${label}.sha256`);
  if (!lowercaseSha256.test(sha256)) {
    throw new TypeError(`${label}.sha256 must be a lowercase SHA-256 digest`);
  }
  const decodedAs = readOwn(value, "decodedAs");
  if (decodedAs !== null && decodedAs !== "UTF-8") {
    throw new TypeError(`${label}.decodedAs must be null or UTF-8`);
  }
  return {
    kind,
    id: requireNonemptyString(readOwn(value, "id"), `${label}.id`),
    sha256,
    byteLength: requireNonnegativeSafeInteger(
      readOwn(value, "byteLength"),
      `${label}.byteLength`,
    ),
    declaredEncoding: requireNullableNonemptyString(
      readOwn(value, "declaredEncoding"),
      `${label}.declaredEncoding`,
    ),
    decodedAs,
  };
}

function decodeDiagnostic(value: unknown, label: string): AdmissionDiagnostic {
  requireObject(value, label);
  requireExactKeys(value, "diagnostic", ["code", "element", "evidence"]);
  const element = readOwn(value, "element");
  return {
    code: requireNonemptyString(readOwn(value, "code"), `${label}.code`),
    element: element === null ? null : decodeLocatedElement(element, `${label}.element`),
    evidence: requireNonemptyString(readOwn(value, "evidence"), `${label}.evidence`),
  };
}

function decodeLocatedElement(
  value: unknown,
  label: string,
): LocatedAdmissionElement {
  requireObject(value, label);
  requireExactKeys(value, label, [
    "containmentPath",
    "id",
    "requiredCapability",
    "subject",
    "type",
  ]);
  return {
    id: requireNullableNonemptyString(readOwn(value, "id"), `${label}.id`),
    type: requireNullableNonemptyString(readOwn(value, "type"), `${label}.type`),
    containmentPath: requireNonemptyString(
      readOwn(value, "containmentPath"),
      `${label}.containmentPath`,
    ),
    subject: requireNullableNonemptyString(
      readOwn(value, "subject"),
      `${label}.subject`,
    ),
    requiredCapability: requireNullableNonemptyString(
      readOwn(value, "requiredCapability"),
      `${label}.requiredCapability`,
    ),
  };
}

function requireObject(value: unknown, label: string): asserts value is object {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain object`);
  }
}

function requireExactKeys(
  value: object,
  label: string,
  expectedKeys: ReadonlyArray<string>,
): void {
  const actual = Reflect.ownKeys(value);
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key) => typeof key !== "string") ||
    actual.toSorted().some((key, index) => key !== expected[index])
  ) {
    throw new TypeError(`${label} must contain exactly its public fields`);
  }
}

function readOwn<Key extends string>(value: object, key: Key): unknown {
  if (!hasOwn(value, key)) {
    throw new TypeError(`missing required field ${key}`);
  }
  return value[key];
}

function hasOwn<Key extends string>(
  value: object,
  key: Key,
): value is object & { readonly [Property in Key]: unknown } {
  return Object.hasOwn(value, key);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be a string`);
  }
  return value;
}

function requireNonemptyString(value: unknown, label: string): string {
  const decoded = requireString(value, label);
  if (decoded.length === 0) {
    throw new TypeError(`${label} must not be empty`);
  }
  return decoded;
}

function requireNullableNonemptyString(
  value: unknown,
  label: string,
): string | null {
  return value === null ? null : requireNonemptyString(value, label);
}

function requirePositiveSafeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return value;
}

function requireNonnegativeSafeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a nonnegative safe integer`);
  }
  return value;
}
