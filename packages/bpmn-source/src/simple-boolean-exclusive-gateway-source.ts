/**
 * Source projection for the first Simple Boolean divergent Exclusive Gateway
 * profile. Structural graph admission is owned separately.
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
  hasOnlyModelledKeys,
  readId,
} from "./moddle-graph.js";
import type {
  ElementRecord,
} from "./moddle-graph.js";
import {
  parseSimpleBooleanExpression,
} from "./simple-boolean-expression.js";
import { declaredGatewayDirectionMatches } from "./gateway-direction-source.js";
import {
  ProjectedFlowElementShape,
  hasOnlyProjectedFlowElementKeys,
} from "./projected-flow-element-keys.js";

const bpmnTypes = metamodelManifest.compilerProjection;

export function projectExclusiveGateway(
  element: ElementRecord,
  id: string,
  flows: ReadonlyArray<CheckedSequenceFlow>,
): Extract<
  CheckedNode,
  { kind: CheckedNodeKind.ExclusiveGateway }
> | undefined {
  if (
    !hasOnlyProjectedFlowElementKeys(
      element,
      ProjectedFlowElementShape.ExclusiveOrInclusiveGateway,
    )
  ) {
    return undefined;
  }
  if (
    !declaredGatewayDirectionMatches(
      element.gatewayDirection,
      GatewayDirection.Diverging,
    )
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
    !hasOnlyModelledKeys(expression, ["$type", "body"]) ||
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
