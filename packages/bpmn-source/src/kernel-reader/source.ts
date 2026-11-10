import { asElement, asElementArray } from "../moddle-graph.js";
import type { ElementRecord } from "../moddle-graph.js";
import metamodelManifest from "../bpmn-2.0.2-semantic-process-metamodel.json" with { type: "json" };
import { importBpmnGraph } from "../moddle-adapter.js";
import { isSourceOffsetInsideBpmnUserTaskRendering } from "../opaque-rendering-retention.js";
import { firstContainmentCardinalityMismatch } from "../singleton-containment-admission.js";
import { parseStrictJson } from "../source-overlay-json.js";
import { ReadRefusal, ReadRefusalCode } from "./model.js";
import type { EffectBinding } from "./model.js";
import { bindReference } from "./references.js";
import { firstSchemaViolation } from "./schema.js";

/** One BPMN source and its optional overlay; `profile` is identity data and selects no reader behaviour. */
export type KernelSource = Readonly<{
  bytes: Uint8Array;
  expectedSha256?: string;
  overlay: Readonly<{ id: string; sha256: string; bytes: Uint8Array }> | null;
  profile: string;
  limits: Readonly<{ maxBytes: number; parserDeadlineMs: number }>;
}>;

export type ParsedSource = Readonly<{
  sha256: string;
  definitions: ElementRecord;
  bindings: ReadonlyArray<EffectBinding>;
  inertAttributes: ReadonlySet<string>;
}>;

const refuse = (code: ReadRefusalCode, evidence: string): never => {
  throw new ReadRefusal(code, null, evidence);
};

async function sha256Of(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", copy);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The encoding the source's XML declaration names, `null` when it names none; the reader accepts only UTF-8. */
export function declaredSourceEncoding(bytes: Uint8Array): string | null {
  const start = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  const prefix = String.fromCharCode(...bytes.subarray(start, Math.min(bytes.byteLength, start + 512)));
  return /^\s*<\?xml\s+[^>]*encoding\s*=\s*["']([^"']+)["'][^>]*\?>/iu.exec(prefix)?.[1] ?? null;
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return refuse(ReadRefusalCode.SourceEncoding, "source is not valid UTF-8");
  }
}

const booleanAttributes: ReadonlyArray<string> = [...new Set(metamodelManifest.properties
  .filter((property) => property.type === "Boolean").map(({ name }) => name))];
const preservedBooleanLexemes: ReadonlySet<string> = new Set(["true", "false", "0"]);

/** `bpmn-moddle` reduces an `xsd:boolean` to `value === "true"`, so `1` would silently read as false. */
function refuseAmbiguousBoolean(xml: string): void {
  for (const attribute of booleanAttributes) {
    for (const [, double, single] of xml.matchAll(new RegExp(`\\b${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "gu"))) {
      const lexeme = double ?? single;
      if (lexeme !== undefined && !preservedBooleanLexemes.has(lexeme)) {
        refuse(ReadRefusalCode.SourceAmbiguousBoolean, `${attribute}="${lexeme}"`);
      }
    }
  }
}

function offsetOf(xml: string, line: number, column: number): number | undefined {
  let offset = 0;
  for (let current = 1; current < line; current += 1) {
    const newline = xml.indexOf("\n", offset);
    if (newline < 0) return undefined;
    offset = newline + 1;
  }
  return Math.min(offset + column, xml.length);
}

/** A warning raised inside a User Task's `bpmn:rendering` is opaque content, kept only in the exact bytes. */
function isOpaqueRenderingWarning(xml: string, evidence: string): boolean {
  const position = /(?:^|\n)\s*line:\s*(\d+)\s*\n\s*column:\s*(\d+)/u.exec(evidence);
  if (position === null) return false;
  const offset = offsetOf(xml, Number(position[1]), Number(position[2]));
  return offset !== undefined && isSourceOffsetInsideBpmnUserTaskRendering(xml, offset);
}

function readBinding(value: unknown): EffectBinding | undefined {
  const binding = asElement(value);
  const source = asElement(binding?.source);
  const descriptor = asElement(binding?.descriptor);
  return source !== undefined && descriptor !== undefined && typeof source.delegateExpression === "string" &&
    (source.implementation === null || typeof source.implementation === "string") &&
    typeof descriptor.protocol === "string" && typeof descriptor.operation === "string"
    ? {
        implementation: source.implementation as string | null,
        delegateExpression: source.delegateExpression,
        protocol: descriptor.protocol,
        operation: descriptor.operation,
      }
    : undefined;
}

type OverlayFacts = Pick<ParsedSource, "bindings" | "inertAttributes">;

async function readOverlay(source: KernelSource): Promise<OverlayFacts> {
  if (source.overlay === null) return { bindings: [], inertAttributes: new Set() };
  if (await sha256Of(source.overlay.bytes) !== source.overlay.sha256) refuse(ReadRefusalCode.SourceOverlay, "overlay digest mismatch");
  let artifact: ElementRecord | undefined;
  try {
    artifact = asElement(parseStrictJson(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(source.overlay.bytes)));
  } catch {
    refuse(ReadRefusalCode.SourceOverlay, "overlay is not strict UTF-8 JSON");
  }
  const bindings = (Array.isArray(artifact?.effectBindings) ? artifact.effectBindings : []).map(readBinding);
  const attributes = asElementArray(artifact?.inertAttributes);
  if (artifact?.kind !== "bpmnSourceOverlay" || bindings.includes(undefined) || attributes === undefined) {
    refuse(ReadRefusalCode.SourceOverlay, "overlay does not satisfy the overlay contract");
  }
  return {
    bindings: bindings as EffectBinding[],
    inertAttributes: new Set((attributes ?? []).map((entry) => {
      const name = asElement(entry.expandedName);
      return `${String(name?.namespaceUri)}#${String(name?.localName)}`;
    })),
  };
}

/** Reads bytes to a parsed tree, refusing only what cannot be read faithfully; exact bytes stay with the caller. */
export async function parseKernelSource(source: KernelSource): Promise<ParsedSource> {
  if (source.bytes.byteLength > source.limits.maxBytes) {
    refuse(ReadRefusalCode.SourceTooLarge, `${source.bytes.byteLength} bytes`);
  }
  const sha256 = await sha256Of(source.bytes);
  if (source.expectedSha256 !== undefined && source.expectedSha256 !== sha256) {
    refuse(ReadRefusalCode.SourceIdentityMismatch, `captured ${sha256}`);
  }
  const encoding = declaredSourceEncoding(source.bytes);
  if (encoding !== null && !/^utf-?8$/iu.test(encoding)) refuse(ReadRefusalCode.SourceEncoding, encoding);
  const xml = decodeUtf8(source.bytes);
  if (/<\s*!DOCTYPE\b/iu.test(xml)) refuse(ReadRefusalCode.SourceDoctype, "DOCTYPE present");
  refuseAmbiguousBoolean(xml);
  const overlay = await readOverlay(source);

  let imported: Awaited<ReturnType<typeof importBpmnGraph>>;
  try {
    imported = await importBpmnGraph(xml, source.limits.parserDeadlineMs);
  } catch (error: unknown) {
    throw new ReadRefusal(ReadRefusalCode.ParserFailure, null, error instanceof Error ? error.message : "bpmn-moddle import failed");
  }
  const definitions = asElement(imported.rootElement);
  if (definitions === undefined) return refuse(ReadRefusalCode.ParserFailure, "no root element");
  for (const warning of imported.warnings) {
    if (isOpaqueRenderingWarning(xml, warning.evidence)) continue;
    const reference = imported.references.get(warning);
    if (reference === undefined) throw new ReadRefusal(ReadRefusalCode.ParserWarning, warning.element?.id ?? null, warning.evidence);
    bindReference(reference, definitions, imported.located.keys());
  }
  const cardinality = firstContainmentCardinalityMismatch(xml, imported.located);
  if (cardinality !== undefined) {
    refuse(ReadRefusalCode.SourceContainmentCardinality, `${cardinality.property}: ${cardinality.sourceOccurrences} in source, ${cardinality.projectedOccurrences} retained`);
  }
  const schema = firstSchemaViolation(xml);
  if (schema !== undefined) throw new ReadRefusal(ReadRefusalCode.SourceSchema, schema.element, schema.evidence);
  return { sha256, definitions, ...overlay };
}
