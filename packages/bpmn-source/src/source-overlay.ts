import {
  compareCanonicalStrings,
  isWellFormedWireString,
} from "@bpmn-lean/semantic-core";
import type {
  EffectDescriptor,
  SourceOverlayIdentity,
} from "@bpmn-lean/semantic-core";

import type { SourceOverlaySelection } from "./contracts.js";
import { parseStrictJson } from "./source-overlay-json.js";

export const maxSourceOverlayBytes = 65_536;

export type SourceEffectBinding = Readonly<{
  source: Readonly<{
    implementation: string | null;
    delegateExpression: string;
  }>;
  descriptor: EffectDescriptor;
}>;

export type SourceInertAttribute = Readonly<{
  elementType: string;
  expandedName: Readonly<{
    namespaceUri: string;
    localName: string;
  }>;
}>;

export type AdmittedSourceOverlay = Readonly<{
  identity: SourceOverlayIdentity;
  semanticProfile: string;
  effectBindings: ReadonlyArray<SourceEffectBinding>;
  inertAttributes: ReadonlyArray<SourceInertAttribute>;
}>;

export type SourceOverlayAdmission =
  | Readonly<{ overlay: AdmittedSourceOverlay; rejection: null }>
  | Readonly<{ overlay: null; rejection: string }>;

export async function admitSourceOverlay(
  selection: SourceOverlaySelection,
): Promise<SourceOverlayAdmission> {
  if (selection.bytes.byteLength > maxSourceOverlayBytes) {
    return rejected(
      `Source overlay contains ${selection.bytes.byteLength} bytes; the limit is ${maxSourceOverlayBytes} bytes.`,
    );
  }
  const bytes = Uint8Array.from(selection.bytes);
  const sha256 = await computeSha256(bytes);
  if (sha256 !== selection.sha256) {
    return rejected(
      `Source overlay expected SHA-256 ${selection.sha256}; captured ${sha256}.`,
    );
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return rejected("Source overlay is not valid UTF-8.");
  }
  let value: unknown;
  try {
    value = parseStrictJson(text);
  } catch (error: unknown) {
    return rejected(readMessage(error, "Source overlay is not valid strict JSON."));
  }
  const artifact = decodeArtifact(value, { id: selection.id, sha256 });
  return artifact === undefined
    ? rejected("Source overlay does not satisfy the closed overlay contract.")
    : { overlay: artifact, rejection: null };
}

function decodeArtifact(
  value: unknown,
  identity: SourceOverlayIdentity,
): AdmittedSourceOverlay | undefined {
  const artifact = asExactRecord(value, [
    "kind",
    "id",
    "semanticProfile",
    "effectBindings",
    "inertAttributes",
  ]);
  if (
    artifact === undefined ||
    artifact.kind !== "bpmnSourceOverlay" ||
    artifact.id !== identity.id ||
    !isBoundedScalar(artifact.id, 256) ||
    !isBoundedScalar(artifact.semanticProfile, 256) ||
    !Array.isArray(artifact.effectBindings) ||
    artifact.effectBindings.length > 64 ||
    !Array.isArray(artifact.inertAttributes) ||
    artifact.inertAttributes.length > 64
  ) {
    return undefined;
  }
  const effectBindings = artifact.effectBindings.map(decodeEffectBinding);
  const inertAttributes = artifact.inertAttributes.map(decodeInertAttribute);
  if (
    effectBindings.some((entry) => entry === undefined) ||
    inertAttributes.some((entry) => entry === undefined)
  ) {
    return undefined;
  }
  const bindings = effectBindings as ReadonlyArray<SourceEffectBinding>;
  const attributes = inertAttributes as ReadonlyArray<SourceInertAttribute>;
  if (
    !isStrictlyCanonical(bindings, compareEffectBindings) ||
    !isStrictlyCanonical(attributes, compareInertAttributes)
  ) {
    return undefined;
  }
  return Object.freeze({
    identity: Object.freeze({ ...identity }),
    semanticProfile: artifact.semanticProfile,
    effectBindings: Object.freeze(bindings),
    inertAttributes: Object.freeze(attributes),
  });
}

function decodeEffectBinding(value: unknown): SourceEffectBinding | undefined {
  const binding = asExactRecord(value, ["source", "descriptor"]);
  const source = asExactRecord(binding?.source, [
    "implementation",
    "delegateExpression",
  ]);
  const descriptor = asExactRecord(binding?.descriptor, [
    "protocol",
    "operation",
  ]);
  if (
    binding === undefined ||
    source === undefined ||
    descriptor === undefined ||
    !(source.implementation === null || isBoundedScalar(source.implementation, 1_024)) ||
    !isBoundedScalar(source.delegateExpression, 1_024) ||
    !isBoundedScalar(descriptor.protocol, 1_024) ||
    !isBoundedScalar(descriptor.operation, 1_024)
  ) {
    return undefined;
  }
  return Object.freeze({
    source: Object.freeze({
      implementation: source.implementation,
      delegateExpression: source.delegateExpression,
    }),
    descriptor: Object.freeze({
      protocol: descriptor.protocol,
      operation: descriptor.operation,
    }),
  });
}

function decodeInertAttribute(value: unknown): SourceInertAttribute | undefined {
  const attribute = asExactRecord(value, ["elementType", "expandedName"]);
  const expandedName = asExactRecord(attribute?.expandedName, [
    "namespaceUri",
    "localName",
  ]);
  if (
    attribute === undefined ||
    expandedName === undefined ||
    !isNonWildcardScalar(attribute.elementType) ||
    !isNonWildcardScalar(expandedName.namespaceUri) ||
    !isNonWildcardScalar(expandedName.localName)
  ) {
    return undefined;
  }
  return Object.freeze({
    elementType: attribute.elementType,
    expandedName: Object.freeze({
      namespaceUri: expandedName.namespaceUri,
      localName: expandedName.localName,
    }),
  });
}

function isBoundedScalar(value: unknown, maximum: number): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    isWellFormedWireString(value) &&
    [...value].length <= maximum;
}

function isNonWildcardScalar(value: unknown): value is string {
  return isBoundedScalar(value, 1_024) && !value.includes("*");
}

function asExactRecord(
  value: unknown,
  keys: ReadonlyArray<string>,
): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => actual.includes(key))
    ? value as Record<string, unknown>
    : undefined;
}

function isStrictlyCanonical<T>(
  values: ReadonlyArray<T>,
  compare: (left: T, right: T) => number,
): boolean {
  return values.every((value, index) =>
    index === 0 || compare(values[index - 1] as T, value) < 0
  );
}

function compareEffectBindings(
  left: SourceEffectBinding,
  right: SourceEffectBinding,
): number {
  return compareNullable(left.source.implementation, right.source.implementation) ||
    compareCanonicalStrings(
      left.source.delegateExpression,
      right.source.delegateExpression,
    ) ||
    compareCanonicalStrings(left.descriptor.protocol, right.descriptor.protocol) ||
    compareCanonicalStrings(left.descriptor.operation, right.descriptor.operation);
}

function compareInertAttributes(
  left: SourceInertAttribute,
  right: SourceInertAttribute,
): number {
  return compareCanonicalStrings(left.elementType, right.elementType) ||
    compareCanonicalStrings(
      left.expandedName.namespaceUri,
      right.expandedName.namespaceUri,
    ) ||
    compareCanonicalStrings(
      left.expandedName.localName,
      right.expandedName.localName,
    );
}

function compareNullable(left: string | null, right: string | null): number {
  if (left === null || right === null) {
    return left === right ? 0 : left === null ? -1 : 1;
  }
  return compareCanonicalStrings(left, right);
}

function rejected(rejection: string): SourceOverlayAdmission {
  return { overlay: null, rejection };
}

function readMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : fallback;
}

async function computeSha256(bytes: Uint8Array): Promise<string> {
  const input = new Uint8Array(bytes.byteLength);
  input.set(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", input);
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}
