/**
 * Shapes and checks every engine operation shares: definition identity, values in the scenario contract's form,
 * occurrence identity, and the content digest that binds a prepared operation to what it later dispatches.
 */
import { createHash } from "node:crypto";

import type { JsonValue } from "@bpmn-lean/temporal-host/host";

export type { JsonValue };

/**
 * A definition: its key (the root Process id), its source digest and the platform's deployed version. The version is
 * `null` only on a compilation, which precedes deployment; every start and publication names the stored version.
 */
export type EngineDefinitionRef = Readonly<{
  definitionKey: string;
  version: number | null;
  sha256: string;
}>;

export type EngineSourceOverlayIdentity = Readonly<{ id: string; sha256: string }>;

/** An overlay selection: the exact bytes, snapshotted before any asynchronous work. */
export type EngineSourceOverlaySelection = Readonly<{ id: string; sha256: string; bytes: Uint8Array }>;

/**
 * A semantic profile as data: its identifier, which is identity only, and the CIB relation identifiers that select the
 * kernel's options ([register](../../../docs/CIB-BPMN-RELATION-REGISTER.md)). The caller resolves it from the catalog.
 */
export type EngineProfile = Readonly<{ id: string; relations: readonly string[] }>;

/**
 * Everything that distinguishes one deployed definition from another: definitions whose keys agree but whose source,
 * overlay or profile differ are distinct.
 */
export type EngineDefinitionIdentity = Readonly<{
  ref: EngineDefinitionRef;
  profile: string;
  sourceOverlay: EngineSourceOverlayIdentity | null;
}>;

/**
 * The exact source bytes compiled: `declaredEncoding` is what the XML declaration names, and `decodedAs` the encoding
 * the reader decoded with, `null` when the reader refused the source.
 */
export type EngineSourceIdentity = Readonly<{
  id: string;
  sha256: string;
  byteLength: number;
  declaredEncoding: string | null;
  decodedAs: "UTF-8" | null;
}>;

export type EngineLimits = Readonly<{ maxBytes: number; parserDeadlineMs: number }>;

/** A public occurrence identity (`Kernel.Run.referenceJson`). */
export type EngineOccurrenceId = Readonly<{ processInstanceId: string; elementId: string; activation: number }>;

/** A value in the scenario contract's `variableValue` form, the kernel value codec's wire form. */
export type EngineValue =
  | Readonly<{ kind: "null" }>
  | Readonly<{ kind: "boolean"; value: boolean }>
  | Readonly<{ kind: "integer"; value: number }>
  | Readonly<{ kind: "decimal"; coefficient: string; scale: number }>
  | Readonly<{ kind: "string"; value: string }>
  | Readonly<{ kind: "stringList"; value: readonly string[] }>
  | Readonly<{ kind: "list"; value: readonly EngineValue[] }>
  | Readonly<{ kind: "map"; value: readonly EngineBinding[] }>;

export type EngineBinding = Readonly<{ name: string; value: EngineValue }>;

/** A failure a caller can show: a stable code and its evidence. */
export type EngineFailure = Readonly<{ code: string; evidence: string }>;

/** A prepared operation's content digest, compared before dispatch and against what the host retained. */
export type EngineIntent = Readonly<{ protocol: string; intentSha256: string }>;

export function requireWireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0 || !value.isWellFormed()) {
    throw new TypeError(`${name} must be a nonempty well-formed Unicode string`);
  }
  return value;
}

export function requireBytes(value: unknown, name: string): Uint8Array {
  if (!(value instanceof Uint8Array)) throw new TypeError(`${name} must be a Uint8Array`);
  return Uint8Array.from(value);
}

export function snapshotOverlay(selection: EngineSourceOverlaySelection | null | undefined): EngineSourceOverlaySelection | null {
  if (selection === null || selection === undefined) return null;
  return {
    id: requireWireString(selection.id, "sourceOverlay.id"),
    sha256: requireWireString(selection.sha256, "sourceOverlay.sha256"),
    bytes: requireBytes(selection.bytes, "sourceOverlay.bytes"),
  };
}

export function snapshotProfile(profile: EngineProfile): EngineProfile {
  return {
    id: requireWireString(profile.id, "profile.id"),
    relations: profile.relations.map((relation) => requireWireString(relation, "profile.relations")),
  };
}

export function overlayIdentity(selection: EngineSourceOverlaySelection | null): EngineSourceOverlayIdentity | null {
  return selection === null ? null : { id: selection.id, sha256: selection.sha256 };
}

/** The value with every object's keys in code-unit order, so `JSON.stringify` no longer depends on construction order. */
function sortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => [key, sortedKeys(entry)]));
  }
  return value;
}

/** JSON in which equal content has equal bytes whatever the construction order. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortedKeys(value));
}

export function sha256Hex(text: string | Uint8Array): string {
  return createHash("sha256").update(text).digest("hex");
}

export function sameJson(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

export function sameIdentity(left: EngineDefinitionIdentity, right: EngineDefinitionIdentity): boolean {
  return sameJson(left, right);
}

/** A JSON object member, or `undefined` when `json` is no object or lacks it. */
export function member(json: unknown, key: string): unknown {
  return json !== null && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>)[key] : undefined;
}
