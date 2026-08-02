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
