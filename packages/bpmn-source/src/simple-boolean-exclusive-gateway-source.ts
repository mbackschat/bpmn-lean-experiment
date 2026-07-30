/**
 * Source projection and exact topology admission for the first Simple Boolean
 * divergent Exclusive Gateway profile.
 */
import {
  CheckedNodeKind,
  GatewayDirection,
  SimpleBooleanExpressionLanguage,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedNode,
  CheckedSequenceFlow,
} from "@bpmn-lean/semantic-core";

import metamodelManifest from "./bpmn-2.0.2-semantic-process-metamodel.json" with {
  type: "json",
};
import {
  asElement,
  hasOnlyOwnKeys,
  readId,
} from "./moddle-graph.js";
import type {
  ElementRecord,
} from "./moddle-graph.js";
import {
  parseSimpleBooleanExpression,
} from "./simple-boolean-expression.js";

const bpmnTypes = metamodelManifest.compilerProjection;
const semanticProfile =
  "bpmn-2.0.2-simple-boolean-exclusive-gateway-draft";

export function projectExclusiveGateway(
  element: ElementRecord,
  id: string,
  flows: ReadonlyArray<CheckedSequenceFlow>,
): Extract<
  CheckedNode,
  { kind: CheckedNodeKind.ExclusiveGateway }
> | undefined {
  if (
    !hasOnlyOwnKeys(element, [
      "$type",
      "id",
      "name",
      "gatewayDirection",
      "default",
    ])
  ) {
    return undefined;
  }
  const declared = element.gatewayDirection;
  if (
    declared !== undefined &&
    (typeof declared !== "string" ||
      !["diverging", "unspecified"].includes(declared.toLowerCase()))
  ) {
    return undefined;
  }
  const defaultFlow = asElement(element.default);
  const defaultFlowId =
    defaultFlow === undefined ? undefined : readId(defaultFlow);
  const outgoing = flows.filter(({ sourceId }) => sourceId === id);
  const candidates = outgoing.filter(({ condition }) => condition !== null);
  const defaultCandidate = outgoing.find(({ id: flowId }) =>
    flowId === defaultFlowId
  );
  if (
    flows.filter(({ targetId }) => targetId === id).length !== 1 ||
    outgoing.length !== 3 ||
    defaultFlowId === undefined ||
    defaultCandidate?.condition !== null ||
    candidates.length !== 2 ||
    candidates.some(({ id: flowId }) => flowId === defaultFlowId)
  ) {
    return undefined;
  }
  const first = candidates[0];
  const second = candidates[1];
  if (first === undefined || second === undefined) {
    return undefined;
  }
  return {
    kind: CheckedNodeKind.ExclusiveGateway,
    id,
    direction: GatewayDirection.Diverging,
    candidateFlowIds: [first.id, second.id],
    defaultFlowId,
  };
}

export function projectSimpleBooleanCondition(
  value: unknown,
  expressionLanguage: unknown,
): CheckedSequenceFlow["condition"] | undefined {
  if (value === undefined) {
    return null;
  }
  const expression = asElement(value);
  if (
    expressionLanguage !== SimpleBooleanExpressionLanguage ||
    expression === undefined ||
    expression.$type !== bpmnTypes.formalExpressionType ||
    !hasOnlyOwnKeys(expression, ["$type", "body"]) ||
    typeof expression.body !== "string" ||
    parseSimpleBooleanExpression(expression.body) === undefined
  ) {
    return undefined;
  }
  return {
    language: SimpleBooleanExpressionLanguage,
    body: expression.body,
  };
}

export function hasSimpleBooleanChoiceTopology(
  nodes: ReadonlyArray<CheckedNode>,
  flows: ReadonlyArray<CheckedSequenceFlow>,
  expressionLanguage: unknown,
  hasExplicitExpressionLanguage: boolean,
  selectedProfile: string,
): boolean {
  if (
    expressionLanguage !== SimpleBooleanExpressionLanguage ||
    !hasExplicitExpressionLanguage ||
    selectedProfile !== semanticProfile ||
    nodes.length !== 8 ||
    flows.length !== 7
  ) {
    return false;
  }
  const start = onlyNode(nodes, CheckedNodeKind.NoneStartEvent);
  const choice = onlyNode(nodes, CheckedNodeKind.ExclusiveGateway);
  const tasks = nodes.filter(
    ({ kind }) => kind === CheckedNodeKind.UserTask,
  );
  const ends = nodes.filter(
    ({ kind }) => kind === CheckedNodeKind.NoneEndEvent,
  );
  if (
    start === undefined ||
    choice === undefined ||
    tasks.length !== 3 ||
    ends.length !== 3 ||
    !hasFlow(flows, start.id, choice.id)
  ) {
    return false;
  }
  const branchFlows = [
    ...choice.candidateFlowIds,
    choice.defaultFlowId,
  ].map((flowId) => flows.find(({ id }) => id === flowId));
  if (
    branchFlows.some(
      (flow) =>
        flow === undefined ||
        flow.sourceId !== choice.id ||
        !tasks.some(({ id }) => id === flow.targetId),
    ) ||
    new Set(branchFlows.map((flow) => flow?.targetId)).size !== 3
  ) {
    return false;
  }
  const taskToEnd = tasks.map((task) =>
    flows.find(({ sourceId }) => sourceId === task.id)
  );
  return (
    taskToEnd.every(
      (flow) =>
        flow !== undefined &&
        flow.condition === null &&
        ends.some(({ id }) => id === flow.targetId),
    ) &&
    new Set(taskToEnd.map((flow) => flow?.targetId)).size === 3
  );
}

function onlyNode<K extends CheckedNodeKind>(
  nodes: ReadonlyArray<CheckedNode>,
  kind: K,
): Extract<CheckedNode, { kind: K }> | undefined {
  const matches = nodes.filter(
    (node): node is Extract<CheckedNode, { kind: K }> =>
      node.kind === kind,
  );
  return matches.length === 1 ? matches[0] : undefined;
}

function hasFlow(
  flows: ReadonlyArray<CheckedSequenceFlow>,
  sourceId: string,
  targetId: string,
): boolean {
  return flows.some(
    (flow) =>
      flow.sourceId === sourceId &&
      flow.targetId === targetId,
  );
}
