import {
  SemanticProfileId,
} from "@bpmn-lean/semantic-core";

import {
  compileA12BoundaryError,
} from "./a12-boundary-error-source.js";
import {
  compileA12CreateDocument,
} from "./a12-create-document-source.js";
import {
  compileCallActivityCheckedProcess,
} from "./call-activity-source.js";
import {
  compileCheckedProcess,
} from "./checked-process-compiler.js";
import {
  BpmnSourceDiagnosticCode,
} from "./contracts.js";
import type {
  BpmnSourceIdentity,
  CheckedCompilationProjection,
} from "./contracts.js";
import {
  asElement,
} from "./moddle-graph.js";
import {
  carriesNoUnconsumedForeignAttribute,
  foreignAttributeConsumingTypes,
  foreignAttributeRejections,
} from "./preserved-element-classification.js";

export const CompilationDispatchId = Object.freeze({
  Generic: "generic",
  A12CreateDocument: "a12CreateDocument",
  A12BoundaryError: "a12BoundaryError",
  CallActivity: "callActivity",
} as const);

export type CompilationDispatchId =
  typeof CompilationDispatchId[keyof typeof CompilationDispatchId];

const ForeignAttributePolicyKind = Object.freeze({
  CollectWithClassification: "collectWithClassification",
  RejectBeforeSelectedShape: "rejectBeforeSelectedShape",
} as const);

type CompilationDispatch =
  | Readonly<{
    id: typeof CompilationDispatchId.Generic;
    semanticProfile: null;
    foreignAttributePolicy:
      typeof ForeignAttributePolicyKind.CollectWithClassification;
    reader: typeof compileCheckedProcess;
  }>
  | Readonly<{
    id: Exclude<CompilationDispatchId, typeof CompilationDispatchId.Generic>;
    semanticProfile: string;
    foreignAttributePolicy:
      typeof ForeignAttributePolicyKind.RejectBeforeSelectedShape;
    rejectionEvidence: string;
    reader: (
      rootElement: unknown,
      source: BpmnSourceIdentity,
    ) => CheckedCompilationProjection;
  }>;

const genericDispatch = {
  id: CompilationDispatchId.Generic,
  semanticProfile: null,
  foreignAttributePolicy: ForeignAttributePolicyKind.CollectWithClassification,
  reader: compileCheckedProcess,
} as const satisfies CompilationDispatch;

/** The complete source-reader denominator; tests derive one adversarial case from every entry. */
export const compilationDispatches: ReadonlyArray<CompilationDispatch> =
  Object.freeze([
    genericDispatch,
    {
      id: CompilationDispatchId.A12CreateDocument,
      semanticProfile: SemanticProfileId.CreateDocument,
      foreignAttributePolicy:
        ForeignAttributePolicyKind.RejectBeforeSelectedShape,
      rejectionEvidence:
        "A foreign attribute no projector consumes must be rejected rather than discarded.",
      reader: compileA12CreateDocument,
    },
    {
      id: CompilationDispatchId.A12BoundaryError,
      semanticProfile: SemanticProfileId.BoundaryError,
      foreignAttributePolicy:
        ForeignAttributePolicyKind.RejectBeforeSelectedShape,
      rejectionEvidence:
        "A foreign attribute no projector consumes must be rejected rather than discarded.",
      reader: compileA12BoundaryError,
    },
    {
      id: CompilationDispatchId.CallActivity,
      semanticProfile: SemanticProfileId.CalledProcessCallActivity,
      foreignAttributePolicy:
        ForeignAttributePolicyKind.RejectBeforeSelectedShape,
      rejectionEvidence:
        "A foreign attribute the compiler does not consume must be rejected rather than discarded.",
      reader: (rootElement, source) =>
        compileCallActivityCheckedProcess(
          rootElement,
          source,
          SemanticProfileId.CalledProcessCallActivity,
        ),
    },
  ]);

export function compileDispatchedCheckedProcess(
  rootElement: unknown,
  source: BpmnSourceIdentity,
  semanticProfile: string,
): CheckedCompilationProjection {
  const dispatch = compilationDispatches.find(
    (entry) => entry.semanticProfile === semanticProfile,
  ) ?? genericDispatch;

  switch (dispatch.foreignAttributePolicy) {
    case ForeignAttributePolicyKind.CollectWithClassification:
      return dispatch.reader(
        rootElement,
        source,
        semanticProfile,
        (definitions, located) =>
          foreignAttributeRejections(
            definitions,
            located,
            foreignAttributeConsumingTypes(semanticProfile),
          ),
      );
    case ForeignAttributePolicyKind.RejectBeforeSelectedShape: {
      const definitions = asElement(rootElement);
      if (
        definitions !== undefined &&
        !carriesNoUnconsumedForeignAttribute(
          definitions,
          foreignAttributeConsumingTypes(semanticProfile),
        )
      ) {
        return unsupported(dispatch.rejectionEvidence);
      }
      return dispatch.reader(rootElement, source);
    }
    default:
      return assertNever(dispatch);
  }
}

function unsupported(evidence: string): CheckedCompilationProjection {
  return {
    checkedProcess: undefined,
    diagnostics: [
      {
        code: BpmnSourceDiagnosticCode.UnsupportedModel,
        element: null,
        evidence,
      },
    ],
  };
}

function assertNever(value: never): never {
  throw new TypeError(`Unknown compilation dispatch ${String(value)}`);
}
