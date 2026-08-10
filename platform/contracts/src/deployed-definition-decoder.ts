import type {
  DeployedDefinitionVersion,
  ExactPublicSourceIdentity,
} from "./definitions.js";
import {
  readOwn,
  requireExactKeys,
  requireNonemptyString,
  requireNonnegativeSafeInteger,
  requireNullableNonemptyString,
  requireObject,
  requirePositiveSafeInteger,
  requireString,
} from "./decoder-primitives.js";

const lowercaseSha256 = /^[0-9a-f]{64}$/u;

export function decodeDeployedDefinitionVersion(
  value: unknown,
  label: string,
): DeployedDefinitionVersion {
  requireObject(value, label);
  requireExactKeys(value, label, ["processId", "semanticProfile", "source", "version"]);
  return {
    processId: requireNonemptyString(readOwn(value, "processId"), `${label}.processId`),
    version: requirePositiveSafeInteger(readOwn(value, "version"), `${label}.version`),
    source: decodeExactPublicSourceIdentity(
      readOwn(value, "source"),
      `${label}.source`,
    ),
    semanticProfile: requireNonemptyString(
      readOwn(value, "semanticProfile"),
      `${label}.semanticProfile`,
    ),
  };
}

export function decodeExactPublicSourceIdentity(
  value: unknown,
  label: string,
): ExactPublicSourceIdentity {
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
