import { SemanticProfileId } from "@bpmn-lean/semantic-core";

import {
  locateContainedElements,
  orderedElementDiagnostics,
  rejectElement,
} from "./admission-diagnostics.js";
import type { ElementRejection } from "./admission-diagnostics.js";
import {
  BpmnAdmissionCapability,
  BpmnSourceDiagnosticCode,
} from "./contracts.js";
import type {
  BpmnSourceIdentity,
  CheckedCompilationProjection,
} from "./contracts.js";
import {
  compileMappedBoundaryErrorServiceTask,
} from "./mapped-boundary-error-service-task-source.js";
import {
  compileMappedSuccessServiceTask,
} from "./mapped-success-service-task-source.js";
import {
  admitsInertAttribute,
  selectMappedServiceTaskSourcePolicy,
} from "./mapped-service-task-source-policy.js";
import { asElement, asElementArray } from "./moddle-graph.js";
import type { ElementRecord } from "./moddle-graph.js";
import {
  exactForeignAttributeRejections,
} from "./preserved-element-classification.js";
import type { AdmittedSourceOverlay } from "./source-overlay.js";

/** Applies the mandatory selected-profile policy before either mapped source projector runs. */
export function compileMappedServiceTaskSource(
  rootElement: unknown,
  source: BpmnSourceIdentity,
  semanticProfile:
    | typeof SemanticProfileId.MappedSuccessServiceTask
    | typeof SemanticProfileId.MappedBoundaryErrorServiceTask,
  overlay: AdmittedSourceOverlay | null,
): CheckedCompilationProjection {
  const selection = selectMappedServiceTaskSourcePolicy(
    semanticProfile,
    overlay,
  );
  if (selection.policy === null) {
    return unsupported(selection.rejection);
  }
  const projection = semanticProfile ===
      SemanticProfileId.MappedSuccessServiceTask
    ? compileMappedSuccessServiceTask(rootElement, source, selection.policy)
    : compileMappedBoundaryErrorServiceTask(
        rootElement,
        source,
        selection.policy,
      );
  const definitions = asElement(rootElement);
  if (definitions === undefined) {
    return projection;
  }
  const located = locateContainedElements(definitions);
  const classification = [
    ...exactForeignAttributeRejections(
      definitions,
      located,
      (elementType, namespaceUri, localName) =>
        elementType === "bpmn:ServiceTask" &&
          namespaceUri === "http://camunda.org/schema/1.0/bpmn" &&
          localName === "delegateExpression" ||
        admitsInertAttribute(
          selection.policy,
          elementType,
          namespaceUri,
          localName,
        ),
    ),
    ...unsupportedSelectedFlowElements(definitions, located, semanticProfile),
  ];
  return classification.length === 0
    ? projection
    : {
        checkedProcess: undefined,
        diagnostics: [
          ...orderedElementDiagnostics(classification),
          ...(projection.checkedProcess === undefined
            ? projection.diagnostics.filter(({ element }) => element === null)
            : []),
        ],
      };
}

function unsupportedSelectedFlowElements(
  definitions: ElementRecord,
  located: ReadonlyMap<ElementRecord, Parameters<typeof rejectElement>[1]>,
  semanticProfile: string,
): ReadonlyArray<ElementRejection> {
  const roots = asElementArray(definitions.rootElements);
  const process = roots?.find(({ $type }) => $type === "bpmn:Process");
  const elements = asElementArray(process?.flowElements);
  if (elements === undefined) {
    return [];
  }
  const allowed = semanticProfile === SemanticProfileId.MappedSuccessServiceTask
    ? new Set([
        "bpmn:StartEvent",
        "bpmn:ServiceTask",
        "bpmn:EndEvent",
        "bpmn:SequenceFlow",
      ])
    : new Set([
        "bpmn:StartEvent",
        "bpmn:ServiceTask",
        "bpmn:BoundaryEvent",
        "bpmn:UserTask",
        "bpmn:EndEvent",
        "bpmn:SequenceFlow",
      ]);
  return elements.flatMap((element) => {
    const locus = located.get(element);
    return locus === undefined || allowed.has(String(element.$type))
      ? []
      : [
          rejectElement(
            element,
            locus,
            BpmnSourceDiagnosticCode.UnsupportedElementType,
            null,
            BpmnAdmissionCapability.ExecuteElementType,
          ),
        ];
  });
}

function unsupported(evidence: string): CheckedCompilationProjection {
  return {
    checkedProcess: undefined,
    diagnostics: [{
      code: BpmnSourceDiagnosticCode.UnsupportedModel,
      element: null,
      evidence,
    }],
  };
}
