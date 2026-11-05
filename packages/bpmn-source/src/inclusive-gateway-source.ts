/**
 * Source projection for structured Inclusive Gateway regions: the exact profile's one split over three User Tasks, and
 * under `wide` the nested scope-data profile's regions of any admitted arity, unconditioned outputs and optional
 * default (IGR-ADMIT-01), whose admission decides the rest.
 */
import {
  CheckedNodeKind,
  GatewayDirection,
  RegionVertexKind,
  compareCanonicalStrings,
  regionPairedJoin,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedNode,
  CheckedSequenceFlow,
  RegionGraph,
} from "@bpmn-lean/semantic-core";

import metamodelManifest from "./bpmn-2.0.2-semantic-process-metamodel.json" with {
  type: "json",
};
import {
  asElement,
  asElementArray,
  readId,
} from "./moddle-graph.js";
import type { ElementRecord } from "./moddle-graph.js";
import { declaredGatewayDirectionMatches } from "./gateway-direction-source.js";
import {
  ProjectedFlowElementShape,
  hasOnlyProjectedFlowElementKeys,
} from "./projected-flow-element-keys.js";

const bpmnTypes = metamodelManifest.compilerProjection;

export function projectInclusiveGateway(
  element: ElementRecord,
  id: string,
  flows: ReadonlyArray<CheckedSequenceFlow>,
  elements: ReadonlyArray<ElementRecord>,
  wide = false,
): Extract<CheckedNode, { kind: CheckedNodeKind.InclusiveGateway }> | undefined {
  if (!hasOnlyProjectedFlowElementKeys(
    element,
    ProjectedFlowElementShape.ExclusiveOrInclusiveGateway,
  )) {
    return undefined;
  }
  const incoming = flows.filter(({ targetId }) => targetId === id);
  const outgoing = flows.filter(({ sourceId }) => sourceId === id);
  const branches = (count: number) => wide ? count >= 2 : count === 3;
  const direction = incoming.length === 1 && branches(outgoing.length)
    ? GatewayDirection.Diverging
    : branches(incoming.length) && outgoing.length === 1
      ? GatewayDirection.Converging
      : undefined;
  if (
    direction === undefined ||
    !declaredGatewayDirectionMatches(element.gatewayDirection, direction)
  ) {
    return undefined;
  }
  if (direction === GatewayDirection.Diverging) {
    return wide ? projectWideDivergingGateway(element, id, outgoing)
      : projectDivergingGateway(element, id, incoming, outgoing);
  }
  if (element.default !== undefined) {
    return undefined;
  }
  const pairedGatewayId = derivePairedGatewayId(id, flows, elements);
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

/**
 * Every non-default output is a candidate, conditioned or not; the default, when named, carries no condition. Whether
 * the outputs and default satisfy IGR-ADMIT-01 condition 3 is admission's decision, so a refused split stays visible.
 */
function projectWideDivergingGateway(
  element: ElementRecord,
  id: string,
  outgoing: ReadonlyArray<CheckedSequenceFlow>,
): Extract<
  CheckedNode,
  { kind: CheckedNodeKind.InclusiveGateway; direction: GatewayDirection.Diverging }
> | undefined {
  const defaultFlow = asElement(element.default);
  const defaultFlowId = defaultFlow === undefined ? undefined : readId(defaultFlow);
  const defaultCandidate = outgoing.find(({ id: flowId }) => flowId === defaultFlowId);
  const [first, ...rest] = outgoing
    .filter(({ id: flowId }) => flowId !== defaultFlowId)
    .map(({ id: flowId }) => flowId)
    .sort(compareCanonicalStrings);
  if (first === undefined || (defaultFlowId !== undefined && defaultCandidate?.condition !== null)) {
    return undefined;
  }
  return {
    kind: CheckedNodeKind.InclusiveGateway,
    id,
    direction: GatewayDirection.Diverging,
    candidateFlowIds: [first, ...rest],
    ...(defaultFlowId === undefined ? {} : { defaultFlowId }),
  };
}

/**
 * IGR-BIND-01's walk over the scope's elements: the join's paired split is the one diverging Inclusive Gateway whose
 * every branch reaches this join through a distinct input, passing nested regions whole.
 */
function derivePairedGatewayId(
  joinId: string,
  flows: ReadonlyArray<CheckedSequenceFlow>,
  elements: ReadonlyArray<ElementRecord>,
): string | undefined {
  const contracted = linkContractedScope(flows, elements);
  const graph = sourceRegionGraph(contracted.flows, contracted.elements);
  const paired = [...graph.vertices.values()].filter((vertex) =>
    vertex.kind === RegionVertexKind.Split && regionPairedJoin(graph, vertex)?.id === joinId
  );
  return paired.length === 1 ? paired[0]?.id : undefined;
}

/**
 * LNK-ADMIT-01: the walk reads the scope as its Link-contracted twin, as admission does, so a pair on a region branch
 * pairs the join exactly as its explicit flow would. A name without exactly one throw and one catch in this scope, or a
 * pair breaking the flow rules, stays raw here and is refused by the contraction (`link-contraction.ts`).
 */
function linkContractedScope(
  flows: ReadonlyArray<CheckedSequenceFlow>,
  elements: ReadonlyArray<ElementRecord>,
): Readonly<{ flows: ReadonlyArray<CheckedSequenceFlow>; elements: ReadonlyArray<ElementRecord> }> {
  const ends = (type: string) => elements.flatMap((element) => {
    const definitions = asElementArray(element.eventDefinitions);
    const id = readId(element);
    const name = definitions?.length === 1 && definitions[0]!.$type === "bpmn:LinkEventDefinition"
      ? definitions[0]!.name : undefined;
    return element.$type === type && id !== undefined && typeof name === "string" ? [{ id, name }] : [];
  });
  const throws = ends(bpmnTypes.intermediateThrowEventType);
  const catches = ends(bpmnTypes.intermediateCatchEventType);
  const successor = new Map<string, string>();
  const removedFlows = new Set<string>();
  for (const throwEnd of throws) {
    const pair = catches.filter(({ name }) => name === throwEnd.name);
    const sameName = throws.filter(({ name }) => name === throwEnd.name);
    const leaving = flows.filter(({ sourceId }) => sourceId === pair[0]?.id);
    if (pair.length !== 1 || sameName.length !== 1 || leaving.length !== 1 ||
      flows.some(({ sourceId, targetId }) => sourceId === throwEnd.id || targetId === pair[0]!.id)) continue;
    successor.set(throwEnd.id, leaving[0]!.targetId);
    removedFlows.add(leaving[0]!.id);
  }
  if (successor.size === 0) return { flows, elements };
  const removedNodes = new Set([...successor.keys(), ...[...removedFlows].map((flowId) =>
    flows.find(({ id }) => id === flowId)!.sourceId)]);
  return {
    flows: flows.filter(({ id }) => !removedFlows.has(id)).map((flow) => {
      const target = successor.get(flow.targetId);
      return target === undefined ? flow : { ...flow, targetId: target };
    }),
    elements: elements.filter((element) => !removedNodes.has(readId(element) ?? "")),
  };
}

function sourceVertexKind(type: unknown, inputs: number, outputs: number): RegionVertexKind {
  switch (type) {
    case bpmnTypes.userTaskType:
    case bpmnTypes.serviceTaskType:
    case bpmnTypes.sendTaskType:
    case bpmnTypes.subProcessType: return RegionVertexKind.Work;
    // PTSM-ADMIT-01: a several-flow pass-through node is classified as its lowered `duplicate` or many-input merge is.
    case bpmnTypes.taskType:
    case bpmnTypes.manualTaskType:
    case bpmnTypes.intermediateThrowEventType:
      return outputs >= 2 ? RegionVertexKind.Fork : inputs >= 2 ? RegionVertexKind.Other : RegionVertexKind.Pass;
    case bpmnTypes.parallelGatewayType:
      return inputs === 1 ? RegionVertexKind.Fork : outputs === 1 ? RegionVertexKind.Join : RegionVertexKind.Other;
    case bpmnTypes.inclusiveGatewayType:
      return inputs === 1 ? RegionVertexKind.Split : outputs === 1 ? RegionVertexKind.InclusiveJoin : RegionVertexKind.Other;
    case bpmnTypes.endEventType: return RegionVertexKind.End;
    case bpmnTypes.callActivityType: return RegionVertexKind.Call;
    default: return RegionVertexKind.Other;
  }
}

function sourceRegionGraph(
  flows: ReadonlyArray<CheckedSequenceFlow>,
  elements: ReadonlyArray<ElementRecord>,
): RegionGraph {
  const vertices = elements.flatMap((element) => {
    const id = readId(element);
    if (id === undefined || element.$type === "bpmn:SequenceFlow") return [];
    const outputs = flows.filter(({ sourceId }) => sourceId === id).map((flow) => ({ id: flow.id, target: flow.targetId }));
    const inputs = flows.filter(({ targetId }) => targetId === id).map(({ id: flowId }) => flowId);
    return [[id, { id, kind: sourceVertexKind(element.$type, inputs.length, outputs.length), scope: "", outputs, inputs }]] as const;
  });
  return { root: "", vertices: new Map(vertices) };
}
