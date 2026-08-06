import {
  BpmnCompilationStatus,
  BpmnSourceDiagnosticCode,
} from "./contracts.js";
import type {
  BpmnCompilationResult,
  BpmnSourceDiagnostic,
  BpmnSourceIdentity,
  CompileBpmnToSemanticProcessRequest,
} from "./contracts.js";
import metamodelManifest from "./bpmn-2.0.2-semantic-process-metamodel.json" with {
  type: "json",
};
import {
  importBpmnGraph,
  parserFailureDiagnostics,
  readMessage,
} from "./moddle-adapter.js";
import {
  compileCheckedProcess,
} from "./checked-process-compiler.js";
import {
  a12BoundaryErrorProfile,
  compileA12BoundaryError,
} from "./a12-boundary-error-source.js";
import {
  a12CreateDocumentProfile,
  compileA12CreateDocument,
} from "./a12-create-document-source.js";
import {
  lowerCheckedProcess,
} from "./semantic-process-lowering.js";
import {
  SemanticProfileId,
  isWellFormedSemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import {
  compileCallActivityCheckedProcess,
} from "./call-activity-source.js";
import {
  callActivityDefinitionBindingValid,
} from "./call-activity-lowering.js";

export async function compileBpmnToSemanticProcess(
  request: CompileBpmnToSemanticProcessRequest,
): Promise<BpmnCompilationResult> {
  validateRequest(request);
  const exactBytes = Uint8Array.from(request.bytes);
  const sha256 = await computeSha256(exactBytes);
  const declaredEncoding = readDeclaredEncoding(exactBytes);
  let decodedAs: "UTF-8" | null = null;
  const source = (): BpmnSourceIdentity => ({
    kind: "bpmnSource",
    id: request.sourceId,
    sha256,
    byteLength: exactBytes.byteLength,
    declaredEncoding,
    decodedAs,
  });
  const reject = (
    diagnostics: ReadonlyArray<BpmnSourceDiagnostic>,
  ): BpmnCompilationResult => ({
    status: BpmnCompilationStatus.Rejected,
    source: source(),
    diagnostics,
    checkedProcess: undefined,
    semanticProcess: undefined,
    copyExactBytes: () => Uint8Array.from(exactBytes),
  });

  if (exactBytes.byteLength > request.limits.maxBytes) {
    return reject([
      diagnostic(
        BpmnSourceDiagnosticCode.SourceTooLarge,
        `Source contains ${exactBytes.byteLength} bytes; the caller limit is ${request.limits.maxBytes} bytes.`,
      ),
    ]);
  }
  if (
    declaredEncoding !== null &&
    !/^utf-?8$/iu.test(declaredEncoding)
  ) {
    return reject([
      diagnostic(
        BpmnSourceDiagnosticCode.UnsupportedEncoding,
        `Declared encoding ${declaredEncoding} is not supported by the first ingestion capsule.`,
      ),
    ]);
  }
  if (
    request.expectedSha256 !== undefined &&
    request.expectedSha256 !== sha256
  ) {
    return reject([
      diagnostic(
        BpmnSourceDiagnosticCode.SourceIdentityMismatch,
        `Expected SHA-256 ${request.expectedSha256}; captured ${sha256}.`,
      ),
    ]);
  }

  let xml: string;
  try {
    xml = new TextDecoder("utf-8", { fatal: true }).decode(exactBytes);
    decodedAs = "UTF-8";
  } catch (error: unknown) {
    return reject([
      diagnostic(
        BpmnSourceDiagnosticCode.InvalidUtf8,
        readMessage(error, "Source is not valid UTF-8."),
      ),
    ]);
  }
  if (/<\s*!DOCTYPE\b/iu.test(xml)) {
    return reject([
      diagnostic(
        BpmnSourceDiagnosticCode.DoctypeForbidden,
        "DTD and DOCTYPE declarations are forbidden before BPMN structural parsing.",
      ),
    ]);
  }

  const ambiguous = firstAmbiguousBooleanLexeme(xml);
  if (ambiguous !== undefined) {
    return reject([
      diagnostic(
        BpmnSourceDiagnosticCode.AmbiguousBooleanLexeme,
        `${ambiguous.attribute}="${ambiguous.lexeme}" is not a boolean lexeme this parser preserves.`,
      ),
    ]);
  }

  let imported;
  try {
    imported = await importBpmnGraph(xml, request.limits.parserDeadlineMs);
  } catch (error: unknown) {
    return reject(parserFailureDiagnostics(error));
  }
  if (imported.warnings.length > 0) {
    return reject(imported.warnings);
  }

  const projection =
    request.semanticProfile === SemanticProfileId.CalledProcessCallActivity
      ? compileCallActivityCheckedProcess(
          imported.rootElement,
          source(),
          request.semanticProfile,
        )
      : request.semanticProfile === a12BoundaryErrorProfile
      ? compileA12BoundaryError(imported.rootElement, source())
      : request.semanticProfile === a12CreateDocumentProfile
      ? compileA12CreateDocument(imported.rootElement, source())
      : compileCheckedProcess(
          imported.rootElement,
          source(),
          request.semanticProfile,
        );
  if (projection.diagnostic !== undefined) {
    return reject([projection.diagnostic]);
  }
  const semanticProcess = lowerCheckedProcess(projection.checkedProcess);
  if (
    request.semanticProfile === SemanticProfileId.CalledProcessCallActivity &&
    (!isWellFormedSemanticProcessProgram(semanticProcess) ||
      !callActivityDefinitionBindingValid(
        projection.checkedProcess,
        semanticProcess,
      ))
  ) {
    return reject([
      diagnostic(
        BpmnSourceDiagnosticCode.UnsupportedModel,
        "The lowered Call Activity definition forest is not structurally bound to its checked source.",
      ),
    ]);
  }
  return {
    status: BpmnCompilationStatus.Accepted,
    source: source(),
    diagnostics: [],
    checkedProcess: projection.checkedProcess,
    semanticProcess,
    copyExactBytes: () => Uint8Array.from(exactBytes),
  };
}

function validateRequest(
  request: CompileBpmnToSemanticProcessRequest,
): void {
  if (!(request.bytes instanceof Uint8Array)) {
    throw new TypeError("bytes must be a Uint8Array");
  }
  if (typeof request.sourceId !== "string" || request.sourceId.length === 0) {
    throw new TypeError("sourceId must not be empty");
  }
  if (
    request.expectedSha256 !== undefined &&
    typeof request.expectedSha256 !== "string"
  ) {
    throw new TypeError("expectedSha256 must be a string or undefined");
  }
  if (
    typeof request.semanticProfile !== "string" ||
    request.semanticProfile.length === 0
  ) {
    throw new TypeError("semanticProfile must not be empty");
  }
  if (typeof request.limits !== "object" || request.limits === null) {
    throw new TypeError("limits must be an object");
  }
  validatePositiveSafeInteger(request.limits.maxBytes, "maxBytes");
  validatePositiveSafeInteger(
    request.limits.parserDeadlineMs,
    "parserDeadlineMs",
  );
}

function validatePositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

async function computeSha256(bytes: Uint8Array): Promise<string> {
  const digestInput = new Uint8Array(bytes.byteLength);
  digestInput.set(bytes);
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    digestInput,
  );
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

function readDeclaredEncoding(bytes: Uint8Array): string | null {
  const start =
    bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  const prefixLength = Math.min(bytes.byteLength, start + 512);
  let prefix = "";
  for (let index = start; index < prefixLength; index += 1) {
    prefix += String.fromCharCode(bytes[index] ?? 0);
  }
  const declaration = prefix.match(
    /^\uFEFF?\s*<\?xml\s+[^>]*encoding\s*=\s*["']([^"']+)["'][^>]*\?>/iu,
  );
  return declaration?.[1] ?? null;
}

function diagnostic(
  code: BpmnSourceDiagnosticCode,
  evidence: string,
): BpmnSourceDiagnostic {
  return { code, evidence };
}

/**
 * The first boolean-typed attribute occurrence whose lexeme the parser coercion does not preserve.
 *
 * Checked on the exact decoded source rather than after parsing, because `bpmn-moddle` reduces every
 * `xsd:boolean` attribute to `value === "true"` and reports no warning. Whether that is safe depends
 * on which way the consumer compares: a reader requiring `true` refuses a coerced value, while a
 * reader admitting `false` admits it. Both shapes exist here, so the coercion cannot be left to the
 * consumers.
 *
 * What is refused is exactly the disagreement, not every non-canonical spelling. `xs:boolean` admits
 * `true`, `false`, `1`, and `0`; the coercion maps `false` and `0` to false and `true` to true,
 * agreeing with all three, and maps `1` to false where the type means *true*. So `0` is admitted and
 * `1` is not, which looks asymmetric and is the whole point: `1` is the one valid lexeme the parser
 * silently inverts. Whitespace-padded forms are refused because `whiteSpace=collapse` is the type's
 * rule and applying it here would mean decoding XML outside the parser.
 *
 * The attribute set is derived from the metamodel manifest's `Boolean`-typed properties rather than
 * listed, so it spans exactly the boolean attributes this compiler admits — the class its readers can
 * be fooled by — and a boolean added to the manifest is covered when it is added. The coercion itself
 * applies to every `xsd:boolean` in the full parser descriptor, which is wider than this manifest's
 * declared partial coverage. Enumerating attribute names here would be the same value-not-position
 * mistake that left `cancelActivity='1'` admitted.
 *
 * Deliberately conservative and markup-blind: it rejects the whole source when any occurrence is
 * ambiguous, rather than resolving which element carries it — or whether an element carries it at
 * all, since a commented-out boundary Event or a `name` attribute quoting one is refused too. Narrowing it would require re-parsing
 * the attribute's owner here, which is the parser's job and not this guard's. Both XML
 * attribute-value delimiters are matched, and comparison is by lexeme, so an entity-encoded spelling
 * of a valid boolean such as `&#116;rue` and a whitespace-collapsible `" true "` that `xs:boolean`
 * accepts are also refused. Those over-rejections are the safe direction and are intentional:
 * resolving entities or applying `whiteSpace=collapse` here would mean decoding XML outside the
 * parser.
 */
function firstAmbiguousBooleanLexeme(
  xml: string,
): Readonly<{ attribute: string; lexeme: string }> | undefined {
  for (const attribute of booleanAttributeNames) {
    // Escaped although CMOF identifiers are alphanumeric today: a manifest name is data, and an
    // unescaped metacharacter would widen the pattern silently rather than failing.
    const escaped = attribute.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const occurrence = new RegExp(
      `\\b${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`,
      "gu",
    );
    for (const [, doubleQuoted, singleQuoted] of xml.matchAll(occurrence)) {
      const lexeme = doubleQuoted ?? singleQuoted;
      if (lexeme !== undefined && !coercionAgreesWithXsdBoolean.has(lexeme)) {
        return { attribute, lexeme };
      }
    }
  }
  return undefined;
}

/** The lexemes on which `bpmn-moddle`'s `value === "true"` coercion and `xs:boolean` agree. */
const coercionAgreesWithXsdBoolean: ReadonlySet<string> = new Set([
  "true",
  "false",
  "0",
]);

/** Every `Boolean`-typed property the manifest declares, deduplicated because a name may have several owners. */
export const booleanAttributeNames: ReadonlyArray<string> = [
  ...new Set(
    metamodelManifest.properties
      .filter((property): property is typeof property & { type: "Boolean" } =>
        property.type === "Boolean"
      )
      .map(({ name }) => name),
  ),
].sort();
