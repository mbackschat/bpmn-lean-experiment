import {
  CheckedNodeKind,
  EffectOperation,
  EffectProtocol,
  SemanticProfileId,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedNode,
  EffectDescriptor,
} from "@bpmn-lean/semantic-core";

import metamodelManifest from "./bpmn-2.0.2-semantic-process-metamodel.json" with {
  type: "json",
};
import configuredTaskModdle from "./bpmn-lean-configured-task-moddle.json" with {
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
const taskDefinitionType = `${configuredTaskModdle.prefix}:TaskDefinition`;

/** Closed source-to-neutral-effect policy selected only by the configured Task profile. */
export type ConfiguredTaskProjectionPolicy = Readonly<{
  taskType: string;
  taskDefinitionType: string;
  handlerType: string;
  descriptor: EffectDescriptor;
}>;

const configuredTaskPolicy: ConfiguredTaskProjectionPolicy = Object.freeze({
  taskType: bpmnTypes.taskType,
  taskDefinitionType,
  handlerType: "urn:bpmn-lean:task-handler:probe-v1",
  descriptor: Object.freeze({
    protocol: EffectProtocol.Activity,
    operation: EffectOperation.Probe,
  }),
});

export function configuredTaskProjectionPolicyForProfile(
  semanticProfile: string,
): ConfiguredTaskProjectionPolicy | undefined {
  return semanticProfile === SemanticProfileId.ConfiguredTask
    ? configuredTaskPolicy
    : undefined;
}

/** Projects one exact configured Task while retaining its distinct checked-source kind. */
export function projectConfiguredTask(
  element: ElementRecord,
  id: string,
  policy: ConfiguredTaskProjectionPolicy,
): Extract<CheckedNode, { kind: CheckedNodeKind.ConfiguredTask }> | undefined {
  if (
    element.$type !== policy.taskType ||
    !hasOnlyProjectedFlowElementKeys(
      element,
      ProjectedFlowElementShape.ConfiguredTask,
    )
  ) {
    return undefined;
  }
  const extensionElements = asElement(element.extensionElements);
  if (
    extensionElements?.$type !== bpmnTypes.extensionElementsType ||
    !hasOnlyModelledKeys(extensionElements, ["$type", "values"])
  ) {
    return undefined;
  }
  const definitions = asElementArray(extensionElements.values);
  const definition = definitions?.[0];
  return definitions?.length === 1 &&
      definition?.$type === policy.taskDefinitionType &&
      definition.type === policy.handlerType &&
      hasOnlyModelledKeys(definition, ["$type", "type"])
    ? {
        kind: CheckedNodeKind.ConfiguredTask,
        id,
        descriptor: policy.descriptor,
      }
    : undefined;
}
