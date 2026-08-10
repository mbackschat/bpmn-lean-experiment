import { CheckedNodeKind } from "@bpmn-lean/semantic-core";
import type { CheckedNode } from "@bpmn-lean/semantic-core";

import metamodelManifest from "./bpmn-2.0.2-semantic-process-metamodel.json" with {
  type: "json",
};
import {
  asElement,
  asElementArray,
  hasOnlyModelledKeys,
} from "./moddle-graph.js";
import type { ElementRecord } from "./moddle-graph.js";
import {
  ProjectedFlowElementShape,
  hasOnlyProjectedFlowElementKeys,
} from "./projected-flow-element-keys.js";

const bpmnTypes = metamodelManifest.compilerProjection;

/** Projects one exact top-level, payload-free `PT1S` Timer Start Event. */
export function projectTimerStartEvent(
  element: ElementRecord,
  id: string,
): Extract<CheckedNode, { kind: CheckedNodeKind.TimerStartEvent }> | undefined {
  if (
    !hasOnlyProjectedFlowElementKeys(
      element,
      ProjectedFlowElementShape.TimerStartEvent,
    ) ||
    Object.hasOwn(element, "isInterrupting") ||
    Object.hasOwn(element, "parallelMultiple") ||
    element.eventDefinitionRef !== undefined ||
    element.dataOutputs !== undefined ||
    element.outputSet !== undefined ||
    element.dataOutputAssociations !== undefined ||
    !hasExactTimerDefinition(element.eventDefinitions)
  ) {
    return undefined;
  }
  return {
    kind: CheckedNodeKind.TimerStartEvent,
    id,
    durationLiteral: "PT1S",
  };
}

function hasExactTimerDefinition(value: unknown): boolean {
  const definitions = asElementArray(value);
  const definition = definitions?.[0];
  if (
    definitions === undefined ||
    definitions.length !== 1 ||
    definition === undefined ||
    definition.$type !== bpmnTypes.timerEventDefinitionType ||
    !hasOnlyModelledKeys(definition, ["$type", "timeDuration"])
  ) {
    return false;
  }
  const duration = asElement(definition.timeDuration);
  return duration !== undefined &&
    duration.$type === bpmnTypes.formalExpressionType &&
    hasOnlyModelledKeys(duration, ["$type", "body"]) &&
    duration.body === "PT1S";
}
