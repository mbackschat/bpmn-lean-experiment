/** Source projection for the bounded structured Inclusive Gateway region. */
import {
  CheckedNodeKind,
  GatewayDirection,
  compareCanonicalStrings,
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
import type { ElementRecord } from "./moddle-graph.js";
import { declaredGatewayDirectionMatches } from "./gateway-direction-source.js";

const bpmnTypes = metamodelManifest.compilerProjection;

export function projectInclusiveGateway(
  element: ElementRecord,
  id: string,
  flows: ReadonlyArray<CheckedSequenceFlow>,
  elements: ReadonlyArray<ElementRecord>,
): Extract<CheckedNode, { kind: CheckedNodeKind.InclusiveGateway }> | undefined {
  if (!hasOnlyOwnKeys(element, ["$type", "id", "name", "gatewayDirection", "default"])) {
    return undefined;
  }
  const incoming = flows.filter(({ targetId }) => targetId === id);
  const outgoing = flows.filter(({ sourceId }) => sourceId === id);
  const direction = incoming.length === 1 && outgoing.length === 3
    ? GatewayDirection.Diverging
    : incoming.length === 3 && outgoing.length === 1
      ? GatewayDirection.Converging
      : undefined;
  if (
    direction === undefined ||
    !declaredGatewayDirectionMatches(element.gatewayDirection, direction)
  ) {
    return undefined;
  }
  if (direction === GatewayDirection.Diverging) {
    return projectDivergingGateway(element, id, incoming, outgoing);
  }
  if (element.default !== undefined) {
    return undefined;
  }
  const pairedGatewayId = derivePairedGatewayId(incoming, flows, elements);
  return pairedGatewayId === undefined
    ? undefined
    : {
        kind: CheckedNodeKind.InclusiveGateway,
        id,
        direction: GatewayDirection.Converging,
        pairedGatewayId,
      };
}

function projectDivergingGateway(
  element: ElementRecord,
  id: string,
  incoming: ReadonlyArray<CheckedSequenceFlow>,
  outgoing: ReadonlyArray<CheckedSequenceFlow>,
): Extract<
  CheckedNode,
  { kind: CheckedNodeKind.InclusiveGateway; direction: GatewayDirection.Diverging }
> | undefined {
  const defaultFlow = asElement(element.default);
  const defaultFlowId = defaultFlow === undefined ? undefined : readId(defaultFlow);
  const candidates = outgoing
    .filter(({ condition }) => condition !== null)
    .sort((left, right) => compareCanonicalStrings(left.id, right.id));
  const defaultCandidate = outgoing.find(({ id: flowId }) => flowId === defaultFlowId);
  const first = candidates[0];
  const second = candidates[1];
  if (
    incoming.length !== 1 ||
    defaultFlowId === undefined ||
    defaultCandidate?.condition !== null ||
    candidates.length !== 2 ||
    first === undefined ||
    second === undefined ||
    candidates.some(({ id: flowId }) => flowId === defaultFlowId)
  ) {
    return undefined;
  }
  return {
    kind: CheckedNodeKind.InclusiveGateway,
    id,
    direction: GatewayDirection.Diverging,
    candidateFlowIds: [first.id, second.id],
    defaultFlowId,
  };
}

function derivePairedGatewayId(
  joinInputs: ReadonlyArray<CheckedSequenceFlow>,
  flows: ReadonlyArray<CheckedSequenceFlow>,
  elements: ReadonlyArray<ElementRecord>,
): string | undefined {
  const branchSources = joinInputs.map(({ sourceId }) => sourceId);
  if (new Set(branchSources).size !== 3) {
    return undefined;
  }
  const splitIds = branchSources.map((taskId) => {
    const task = elements.find((candidate) => readId(candidate) === taskId);
    const taskInputs = flows.filter(({ targetId }) => targetId === taskId);
    return task?.$type === bpmnTypes.userTaskType && taskInputs.length === 1
      ? taskInputs[0]?.sourceId
      : undefined;
  });
  const splitId = splitIds[0];
  const split = elements.find((candidate) => readId(candidate) === splitId);
  return splitId !== undefined &&
      splitIds.every((candidate) => candidate === splitId) &&
      split?.$type === bpmnTypes.inclusiveGatewayType
    ? splitId
    : undefined;
}
