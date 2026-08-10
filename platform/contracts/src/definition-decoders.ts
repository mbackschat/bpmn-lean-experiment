import {
  DefinitionDeployStatus,
  PublicApiErrorCode,
} from "./definitions.js";
import {
  decodeDeployedDefinitionVersion,
  decodeExactPublicSourceIdentity,
} from "./deployed-definition-decoder.js";
import {
  readOwn,
  requireExactKeys,
  requireNonemptyString,
  requireNullableNonemptyString,
  requireObject,
} from "./decoder-primitives.js";
import type {
  AdmissionDiagnostic,
  DefinitionDeployResult,
  DefinitionListResponse,
  DefinitionVersionListResponse,
  DeployedDefinitionVersion,
  LocatedAdmissionElement,
  PublicApiErrorCode as PublicApiErrorCodeValue,
  PublicApiErrorResponse,
  RejectedDefinitionResult,
} from "./definitions.js";

/** Decodes one deployment response and rejects unknown or private fields at every level. */
export function decodeDefinitionDeployResult(value: unknown): DefinitionDeployResult {
  requireObject(value, "deployment result");
  const status = readOwn(value, "status");
  switch (status) {
    case DefinitionDeployStatus.Deployed:
      requireExactKeys(value, "deployment result", ["definition", "status"]);
      return {
        status,
        definition: decodeDeployedDefinitionVersion(
          readOwn(value, "definition"),
          "definition",
        ),
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

/** Decodes a closed public API error response without accepting private details. */
export function decodePublicApiErrorResponse(
  value: unknown,
): PublicApiErrorResponse {
  requireObject(value, "API error response");
  requireExactKeys(value, "API error response", ["error"]);
  const error = readOwn(value, "error");
  requireObject(error, "API error");
  requireExactKeys(error, "API error", ["code", "message"]);
  return {
    error: {
      code: decodePublicApiErrorCode(readOwn(error, "code")),
      message: requireNonemptyString(readOwn(error, "message"), "API error.message"),
    },
  };
}

function decodePublicApiErrorCode(value: unknown): PublicApiErrorCodeValue {
  switch (value) {
    case PublicApiErrorCode.InvalidRequest:
    case PublicApiErrorCode.MethodNotAllowed:
    case PublicApiErrorCode.UnsupportedMediaType:
    case PublicApiErrorCode.PayloadTooLarge:
    case PublicApiErrorCode.NotFound:
    case PublicApiErrorCode.InternalFailure:
      return value;
    default:
      throw new TypeError("API error.code is not a public API error code");
  }
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
    source: decodeExactPublicSourceIdentity(readOwn(value, "source"), "source"),
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
    decodeDeployedDefinitionVersion(definition, `${label}[${index}]`)
  );
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
