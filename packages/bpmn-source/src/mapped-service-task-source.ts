import {
  CheckedNodeKind,
  MappingExpressionKind,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedBpmnErrorRoute,
  CheckedNode,
  CheckedSequenceFlow,
} from "@bpmn-lean/semantic-core";

import type { ElementRecord } from "./moddle-graph.js";
import {
  asElement,
  asElementArray,
  hasOnlyModelledKeys,
  readForeignAttributes,
  readId,
} from "./moddle-graph.js";
import type { MappedServiceTaskSourcePolicy } from "./mapped-service-task-source-policy.js";
import { selectedEffectBinding } from "./mapped-service-task-source-policy.js";
import {
  ProjectedFlowElementShape,
  hasOnlyProjectedFlowElementKeys,
} from "./projected-flow-element-keys.js";

const camundaNamespace = "http://camunda.org/schema/1.0/bpmn";

export function projectMappedSuccessServiceTask(
  value: ElementRecord,
  definitions: ElementRecord,
  policy: MappedServiceTaskSourcePolicy,
): Extract<CheckedNode, { kind: CheckedNodeKind.ServiceTask }> | undefined {
  return hasOnlyProjectedFlowElementKeys(
      value,
      ProjectedFlowElementShape.MappedSuccessServiceTask,
    )
    ? projectMappedServiceTask(value, definitions, policy, null)
    : undefined;
}

export function projectMappedBoundaryServiceTask(
  value: ElementRecord,
  definitions: ElementRecord,
  policy: MappedServiceTaskSourcePolicy,
  bpmnErrorRoute: CheckedBpmnErrorRoute,
): Extract<CheckedNode, { kind: CheckedNodeKind.ServiceTask }> | undefined {
  return hasOnlyProjectedFlowElementKeys(
      value,
      ProjectedFlowElementShape.MappedBoundaryServiceTask,
    )
    ? projectMappedServiceTask(
        value,
        definitions,
        policy,
        bpmnErrorRoute,
      )
    : undefined;
}

function projectMappedServiceTask(
  value: ElementRecord,
  definitions: ElementRecord,
  policy: MappedServiceTaskSourcePolicy,
  bpmnErrorRoute: CheckedBpmnErrorRoute | null,
): Extract<CheckedNode, { kind: CheckedNodeKind.ServiceTask }> | undefined {
  const attributes = readForeignAttributes(value, definitions);
  const delegateExpression = attributes?.get(
    `${camundaNamespace}#delegateExpression`,
  );
  const implementation = typeof value.implementation === "string"
    ? value.implementation
    : null;
  const binding = selectedEffectBinding(
    policy,
    implementation,
    delegateExpression,
  );
  const inputOutput = readMappedInputOutput(value.extensionElements);
  const id = readId(value);
  if (
    id === undefined ||
    binding === undefined ||
    inputOutput === undefined
  ) {
    return undefined;
  }
  return {
    kind: CheckedNodeKind.ServiceTask,
    id,
    descriptor: binding.descriptor,
    inputMappings: [{
      target: inputOutput.inputName,
      expression: {
        kind: MappingExpressionKind.StringLiteral,
        value: inputOutput.inputValue,
      },
    }],
    outputMappings: [{
      target: inputOutput.outputName,
      expression: {
        kind: MappingExpressionKind.LocalVariable,
        name: inputOutput.localName,
      },
    }],
    bpmnErrorRoute,
  };
}

export function projectPlainNode<K extends
  CheckedNodeKind.NoneStartEvent | CheckedNodeKind.NoneEndEvent>(
  value: ElementRecord | undefined,
  kind: K,
): Extract<CheckedNode, { kind: K }> | undefined {
  const id = value === undefined ? undefined : readId(value);
  return value !== undefined &&
      id !== undefined &&
      hasOnlyProjectedFlowElementKeys(value, ProjectedFlowElementShape.PlainNode)
    ? ({ kind, id } as Extract<CheckedNode, { kind: K }>)
    : undefined;
}

export function projectMappedBoundaryIdentityNode<K extends
  CheckedNodeKind.NoneStartEvent | CheckedNodeKind.NoneEndEvent>(
  value: ElementRecord | undefined,
  kind: K,
): Extract<CheckedNode, { kind: K }> | undefined {
  const id = value === undefined ? undefined : readId(value);
  return value !== undefined &&
      id !== undefined &&
      hasOnlyProjectedFlowElementKeys(
        value,
        ProjectedFlowElementShape.MappedBoundaryIdentityNode,
      )
    ? ({ kind, id } as Extract<CheckedNode, { kind: K }>)
    : undefined;
}

export function projectMappedSuccessSequenceFlows(
  values: ReadonlyArray<ElementRecord>,
): ReadonlyArray<CheckedSequenceFlow> | undefined {
  return projectMappedSequenceFlows(
    values,
    (flow) => hasOnlyProjectedFlowElementKeys(
      flow,
      ProjectedFlowElementShape.MappedSuccessSequenceFlow,
    ),
  );
}

export function projectMappedBoundarySequenceFlows(
  values: ReadonlyArray<ElementRecord>,
): ReadonlyArray<CheckedSequenceFlow> | undefined {
  return projectMappedSequenceFlows(
    values,
    (flow) => hasOnlyProjectedFlowElementKeys(
      flow,
      ProjectedFlowElementShape.MappedBoundarySequenceFlow,
    ),
  );
}

function projectMappedSequenceFlows(
  values: ReadonlyArray<ElementRecord>,
  hasSelectedKeys: (flow: ElementRecord) => boolean,
): ReadonlyArray<CheckedSequenceFlow> | undefined {
  const flows = values.map((flow) => {
    const source = asElement(flow.sourceRef);
    const target = asElement(flow.targetRef);
    const id = readId(flow);
    const sourceId = source === undefined ? undefined : readId(source);
    const targetId = target === undefined ? undefined : readId(target);
    return hasSelectedKeys(flow) &&
        id !== undefined &&
        sourceId !== undefined &&
        targetId !== undefined
      ? { id, sourceId, targetId, condition: null }
      : undefined;
  });
  return flows.every((flow) => flow !== undefined)
    ? flows as ReadonlyArray<CheckedSequenceFlow>
    : undefined;
}

export function hasFlow(
  flows: ReadonlyArray<CheckedSequenceFlow>,
  sourceId: string,
  targetId: string,
): boolean {
  return flows.some(
    (flow) => flow.sourceId === sourceId && flow.targetId === targetId,
  );
}

function readMappedInputOutput(value: unknown): Readonly<{
  inputName: string;
  inputValue: string;
  outputName: string;
  localName: string;
}> | undefined {
  const extension = asElement(value);
  const values = asElementArray(extension?.values);
  const inputOutput = values?.[0];
  const children = asElementArray(inputOutput?.$children);
  if (
    extension?.$type !== "bpmn:ExtensionElements" ||
    !hasOnlyModelledKeys(extension, ["$type", "values"]) ||
    values?.length !== 1 ||
    inputOutput?.$type !== "camunda:inputOutput" ||
    !hasOnlyModelledKeys(inputOutput, ["$type", "$children"]) ||
    children?.length !== 2 ||
    !isParameter(children[0], "camunda:inputParameter") ||
    !isParameter(children[1], "camunda:outputParameter")
  ) {
    return undefined;
  }
  const input = children[0];
  const output = children[1];
  const local = typeof output?.$body === "string"
    ? output.$body.match(/^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/u)
    : null;
  return typeof input?.name === "string" &&
      input.name.length > 0 &&
      typeof input.$body === "string" &&
      typeof output?.name === "string" &&
      output.name.length > 0 &&
      local?.[1] !== undefined
    ? {
        inputName: input.name,
        inputValue: input.$body,
        outputName: output.name,
        localName: local[1],
      }
    : undefined;
}

function isParameter(
  value: ElementRecord | undefined,
  type: string,
): boolean {
  return value?.$type === type &&
    typeof value.name === "string" &&
    typeof value.$body === "string" &&
    hasOnlyModelledKeys(value, ["$type", "name", "$body"]);
}
