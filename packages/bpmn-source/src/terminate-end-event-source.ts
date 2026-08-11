import {
  CheckedNodeKind,
  SemanticProfileId,
} from "@bpmn-lean/semantic-core";
import type { CheckedNode } from "@bpmn-lean/semantic-core";

import metamodelManifest from "./bpmn-2.0.2-semantic-process-metamodel.json" with {
  type: "json",
};
import {
  asElementArray,
  hasOnlyModelledKeys,
} from "./moddle-graph.js";
import type { ElementRecord } from "./moddle-graph.js";
import {
  ProjectedFlowElementShape,
  hasOnlyProjectedFlowElementKeys,
} from "./projected-flow-element-keys.js";
import type { ExactContainmentCardinality } from "./singleton-containment-admission.js";
import type { ScopedSourceElement } from "./scoped-flow-elements.js";

const bpmnTypes = metamodelManifest.compilerProjection;

/** Projects one identity-only End Event carrying one inline empty Terminate Event Definition. */
export function projectTerminateEndEvent(
  element: ElementRecord,
  id: string,
): Extract<CheckedNode, { kind: CheckedNodeKind.TerminateEndEvent }> | undefined {
  if (
    !hasOnlyProjectedFlowElementKeys(
      element,
      ProjectedFlowElementShape.TerminateEndEvent,
    )
  ) {
    return undefined;
  }
  const definitions = asElementArray(element.eventDefinitions);
  const definition = definitions?.[0];
  return definitions?.length === 1 &&
      definition?.$type === bpmnTypes.terminateEventDefinitionType &&
      hasOnlyModelledKeys(definition, ["$type"])
    ? { kind: CheckedNodeKind.TerminateEndEvent, id }
    : undefined;
}

/** The selected source profile requires one ordinary, non-Event Sub-Process. */
export function terminateEndSourcePropertiesValid(
  elements: ReadonlyArray<ScopedSourceElement>,
  semanticProfile: string,
): boolean {
  if (semanticProfile !== SemanticProfileId.TerminateEnd) {
    return true;
  }
  const subProcesses = elements.filter(
    ({ element }) => element.$type === bpmnTypes.subProcessType,
  );
  return subProcesses.length === 1 &&
    subProcesses.every(({ element }) =>
      element.triggeredByEvent === undefined || element.triggeredByEvent === false
    );
}

/** Raw/imported cardinality lock for the one inline definition selected by this profile. */
export function terminateEndContainmentCardinalities(
  semanticProfile: string,
): ReadonlyArray<ExactContainmentCardinality> {
  return semanticProfile === SemanticProfileId.TerminateEnd
    ? [{
        property: "ThrowEvent.eventDefinitions[TerminateEventDefinition]",
        projectedType: bpmnTypes.terminateEventDefinitionType,
        xmlLocalName: "terminateEventDefinition",
        expectedOccurrences: 1,
      }]
    : [];
}
