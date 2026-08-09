import type {
  CheckedProcess,
  DeepReadonly,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

export enum BpmnCompilationStatus {
  Accepted = "accepted",
  Rejected = "rejected",
}

export enum BpmnSourceDiagnosticCode {
  SourceTooLarge = "sourceTooLarge",
  UnsupportedEncoding = "unsupportedEncoding",
  InvalidUtf8 = "invalidUtf8",
  DoctypeForbidden = "doctypeForbidden",
  AmbiguousBooleanLexeme = "ambiguousBooleanLexeme",
  ParserFailure = "parserFailure",
  ParserWarning = "parserWarning",
  SourceIdentityMismatch = "sourceIdentityMismatch",
  InvalidSourceOverlay = "invalidSourceOverlay",
  UnsupportedModel = "unsupportedModel",
  /** A parsed element the selected profile neither executes nor preserves. */
  UnsupportedElementType = "unsupportedElementType",
  /** An own property of an otherwise admitted element that the profile neither executes nor preserves. */
  UnsupportedProperty = "unsupportedProperty",
  /** An extension attribute no projector reads, which would otherwise be discarded unexamined. */
  UnconsumedForeignAttribute = "unconsumedForeignAttribute",
  /** A resolved reference pointing at an element outside the type its property declares. */
  ReferenceTargetTypeMismatch = "referenceTargetTypeMismatch",
}

/**
 * What the selected semantic profile would have to gain for a rejected element to be admitted.
 *
 * This answers *what would make this file compile*, which is the question an external uploader has
 * and the reason a reason code alone is not enough. It is closed and carries no capability the
 * project cannot grant: a malformed source reports no requirement at all rather than an unreachable
 * one.
 */
export enum BpmnAdmissionCapability {
  /** Execute this element's type, giving it token-flow meaning. */
  ExecuteElementType = "executeElementType",
  /** Retain this element's type without executing it. */
  PreserveElementType = "preserveElementType",
  /** Retain this own property of an executed element without exposing it to projection. */
  PreserveProperty = "preserveProperty",
  /** Read this extension attribute in a projector that refuses what it does not recognize. */
  ConsumeForeignAttribute = "consumeForeignAttribute",
}

/**
 * The element one admission diagnostic is about.
 *
 * `id` is nullable because `Semantic.xsd` declares `<xsd:attribute name="id" type="xsd:ID"
 * use="optional"/>`, and this contract describes instance documents. `type` is nullable for the
 * narrower reason that a parsed value can be an object the parser did not resolve to a modelled
 * element; reporting it without a type is still better than dropping the rejection.
 *
 * `containmentPath` is what locates an element the source did not name, written as the parser's own
 * property names and array indices from the document root, for example
 * `definitions/rootElements[1]/flowElements[5]`. It follows containment only, so a resolved reference
 * never appears in a path.
 */
export type BpmnSourceElement = DeepReadonly<{
  id: string | null;
  type: string | null;
  containmentPath: string;
  /**
   * The own property, qualified extension attribute, or reference property the reason names.
   *
   * `null` when the reason is about the element itself rather than one of its properties.
   */
  subject: string | null;
  /** `null` when no capability admits the element, which means the source is malformed. */
  requiredCapability: BpmnAdmissionCapability | null;
}>;

/**
 * One reason a source was refused.
 *
 * `element` is required and nullable rather than optional: a diagnostic either locates an element or
 * states that it does not, and an absent field would leave those two indistinguishable. It is `null`
 * for every rejection stated over the whole document or over the checked graph rather than over one
 * parsed element.
 *
 * `code` is the machine-readable reason. `evidence` is a rendering of the same fact for a human and
 * is derived, not authored per call site, so an identical source yields an identical list.
 */
export type BpmnSourceDiagnostic = DeepReadonly<{
  code: BpmnSourceDiagnosticCode;
  element: BpmnSourceElement | null;
  evidence: string;
}>;

/**
 * What one profile compiler produced from an admitted `bpmn:Definitions`.
 *
 * Package-internal: the published result is `BpmnCompilationResult`, whose accepted case cannot
 * carry a diagnostic at all. The refusal side is a list rather than one record because a source can
 * fail in several places at once, and telling its author about one of them is the behavior
 * per-element diagnostics exist to replace.
 */
export type CheckedCompilationProjection =
  | Readonly<{
    checkedProcess: CheckedProcess;
    diagnostics: readonly [];
  }>
  | Readonly<{
    checkedProcess: undefined;
    diagnostics: ReadonlyArray<BpmnSourceDiagnostic>;
  }>;

export type BpmnSourceIdentity = DeepReadonly<{
  kind: "bpmnSource";
  id: string;
  sha256: string;
  byteLength: number;
  declaredEncoding: string | null;
  decodedAs: "UTF-8" | null;
}>;

export type BpmnSourceLimits = DeepReadonly<{
  maxBytes: number;
  parserDeadlineMs: number;
}>;

/** Exact registered overlay identity and bytes selected for one compilation. */
export type SourceOverlaySelection = Readonly<{
  id: string;
  sha256: string;
  bytes: Uint8Array;
}>;

/**
 * Compilation snapshots BPMN and selected overlay `bytes` before asynchronous work.
 *
 * This contract is intentionally shallow: TypeScript cannot make a
 * `Uint8Array` deeply immutable because its mutation methods remain callable.
 */
export type CompileBpmnToSemanticProcessRequest = Readonly<{
  bytes: Uint8Array;
  sourceId: string;
  expectedSha256: string | undefined;
  semanticProfile: string;
  sourceOverlay: SourceOverlaySelection | null;
  limits: BpmnSourceLimits;
}>;

type ExactSourceCapture = DeepReadonly<{
  source: BpmnSourceIdentity;
  copyExactBytes: () => Uint8Array;
}>;

export type AcceptedBpmnCompilation = ExactSourceCapture &
  DeepReadonly<{
    status: BpmnCompilationStatus.Accepted;
    diagnostics: readonly [];
    checkedProcess: CheckedProcess;
    semanticProcess: SemanticProcessProgram;
  }>;

export type RejectedBpmnCompilation = ExactSourceCapture &
  DeepReadonly<{
    status: BpmnCompilationStatus.Rejected;
    diagnostics: BpmnSourceDiagnostic[];
    checkedProcess: undefined;
    semanticProcess: undefined;
  }>;

export type BpmnCompilationResult =
  | AcceptedBpmnCompilation
  | RejectedBpmnCompilation;
