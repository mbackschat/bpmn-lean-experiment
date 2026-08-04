import {
  CheckedNodeKind,
  SemanticOperationKind,
  SemanticOriginKind,
  compareCanonicalStrings,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedNode,
  CheckedProcess,
  SemanticOperation,
} from "@bpmn-lean/semantic-core";

import { controlPlaceId } from "./semantic-process-identifiers.js";

export function lowerEventRaceOperation(
  node: Extract<CheckedNode, { kind: CheckedNodeKind.EventBasedGateway }>,
  source: CheckedProcess,
): Extract<SemanticOperation, { kind: SemanticOperationKind.AwaitEventRace }> {
  const configured = source.sequenceFlows.filter(({ sourceId }) => sourceId === node.id);
  const messageConfiguration = configured.find(({ targetId }) =>
    source.nodes.some(
      (candidate) =>
        candidate.id === targetId &&
        candidate.kind === CheckedNodeKind.IntermediateCatchMessageEvent,
    )
  );
  const timerConfiguration = configured.find(({ targetId }) =>
    source.nodes.some(
      (candidate) =>
        candidate.id === targetId &&
        candidate.kind === CheckedNodeKind.IntermediateCatchTimerEvent,
    )
  );
  const message = messageConfiguration === undefined
    ? undefined
    : source.nodes.find(
        (candidate): candidate is Extract<CheckedNode, {
          kind: CheckedNodeKind.IntermediateCatchMessageEvent;
        }> =>
          candidate.id === messageConfiguration.targetId &&
          candidate.kind === CheckedNodeKind.IntermediateCatchMessageEvent,
      );
  const timer = timerConfiguration === undefined
    ? undefined
    : source.nodes.find(
        (candidate): candidate is Extract<CheckedNode, {
          kind: CheckedNodeKind.IntermediateCatchTimerEvent;
        }> =>
          candidate.id === timerConfiguration.targetId &&
          candidate.kind === CheckedNodeKind.IntermediateCatchTimerEvent,
      );
  if (
    configured.length !== 2 ||
    messageConfiguration === undefined ||
    timerConfiguration === undefined ||
    message === undefined ||
    timer === undefined
  ) {
    throw new TypeError(`Checked Event-Based Gateway ${node.id} requires one Message and one Timer configuration`);
  }
  return {
    id: `operation:${node.id}`,
    kind: SemanticOperationKind.AwaitEventRace,
    origin: { kind: SemanticOriginKind.BpmnElement, elementId: node.id },
    input: onlyFlowPlace(source, node.id, "incoming"),
    message: {
      configurationOrigin: {
        kind: SemanticOriginKind.BpmnSequenceFlow,
        elementId: messageConfiguration.id,
      },
      elementId: message.id,
      channel: message.channel,
      output: onlyFlowPlace(source, message.id, "outgoing"),
    },
    timer: {
      configurationOrigin: {
        kind: SemanticOriginKind.BpmnSequenceFlow,
        elementId: timerConfiguration.id,
      },
      elementId: timer.id,
      durationMs: 1000,
      output: onlyFlowPlace(source, timer.id, "outgoing"),
    },
  };
}

export function isEventRaceCatch(
  source: CheckedProcess,
  nodeId: string,
): boolean {
  return source.sequenceFlows.some(({ sourceId, targetId }) =>
    targetId === nodeId &&
    source.nodes.some(
      (node) => node.id === sourceId && node.kind === CheckedNodeKind.EventBasedGateway,
    )
  );
}

export function eventRaceConfigurationFlowIds(
  source: CheckedProcess,
): ReadonlySet<string> {
  const gateways = new Set(
    source.nodes
      .filter(({ kind }) => kind === CheckedNodeKind.EventBasedGateway)
      .map(({ id }) => id),
  );
  return new Set(
    source.sequenceFlows
      .filter(({ sourceId }) => gateways.has(sourceId))
      .map(({ id }) => id),
  );
}

function onlyFlowPlace(
  source: CheckedProcess,
  nodeId: string,
  direction: "incoming" | "outgoing",
): string {
  const flows = source.sequenceFlows
    .filter((flow) =>
      direction === "incoming" ? flow.targetId === nodeId : flow.sourceId === nodeId
    )
    .map(({ id }) => controlPlaceId(id))
    .sort(compareCanonicalStrings);
  const flow = flows[0];
  if (flows.length !== 1 || flow === undefined) {
    throw new TypeError(`Checked node ${nodeId} requires exactly one ${direction} flow`);
  }
  return flow;
}
