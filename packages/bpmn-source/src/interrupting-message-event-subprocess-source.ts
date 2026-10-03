import {
  BoundaryInterruption, CheckedNodeKind, INTERRUPTING_MESSAGE_EVENT_SUBPROCESS_CHECKPOINT_PROFILE_ID,
} from "@bpmn-lean/semantic-core";
import type { CheckedInterruptingMessageEventSubProcess, CheckedNode, CheckedSequenceFlow } from "@bpmn-lean/semantic-core";
import { asElement, asElementArray, readId } from "./moddle-graph.js";
import type { ElementRecord } from "./moddle-graph.js";
import type { ScopedSourceElement } from "./scoped-flow-elements.js";

/** BPMN 10.5.2's interruption default applies only to the selected contained Message Start. */
export function isInterruptingMessageHandlerStart(element: ElementRecord, semanticProfile: string): boolean {
  const parent = asElement(element.$parent);
  return semanticProfile === INTERRUPTING_MESSAGE_EVENT_SUBPROCESS_CHECKPOINT_PROFILE_ID &&
    parent?.$type === "bpmn:SubProcess" && parent.triggeredByEvent === true;
}

/** Retains source containment and the exact child entry; the checked-family validator owns topology. */
export function projectInterruptingMessageEventSubProcesses(
  process: ElementRecord,
  elements: readonly ScopedSourceElement[],
  nodes: readonly CheckedNode[],
  flows: readonly CheckedSequenceFlow[],
): readonly CheckedInterruptingMessageEventSubProcess[] | undefined {
  const handlers = elements.filter(({ element }) => element.$type === "bpmn:SubProcess" && element.triggeredByEvent === true);
  const handler = handlers[0];
  if (handlers.length !== 1 || handler === undefined || handler.element.$parent !== process) return undefined;
  const elementId = readId(handler.element);
  const node = nodes.find((candidate) => candidate.id === elementId);
  const children = asElementArray(handler.element.flowElements);
  const starts = children?.filter((element) => element.$type === "bpmn:StartEvent");
  const start = starts?.[0];
  const startEventId = start === undefined ? undefined : readId(start);
  const startNode = nodes.find((candidate) => candidate.id === startEventId);
  const entryFlows = flows.filter(({ sourceId }) => sourceId === startEventId);
  const entry = entryFlows[0];
  const sourceEntry = elements.find(({ element }) => readId(element) === entry?.id)?.element;
  const definitions = start === undefined ? undefined : asElementArray(start.eventDefinitions);
  const entryTarget = asElement(sourceEntry?.targetRef);
  if (elementId === undefined || node?.kind !== CheckedNodeKind.EmbeddedSubProcess ||
      children === undefined || children.some((child) => child.$parent !== handler.element) ||
      starts?.length !== 1 || start === undefined || startEventId === undefined ||
      (start.isInterrupting !== undefined && start.isInterrupting !== true) ||
      startNode?.kind !== CheckedNodeKind.MessageStartEvent ||
      definitions?.length !== 1 || definitions[0]?.$parent !== start ||
      entryFlows.length !== 1 || entry === undefined || sourceEntry?.$parent !== handler.element ||
      sourceEntry.sourceRef !== start || entryTarget === undefined || !children.includes(entryTarget)) return undefined;
  return [{ parentScopeId: handler.scopeId, handlerScopeId: node.childScopeId, elementId, startEventId,
    channel: startNode.channel, interruption: BoundaryInterruption.Interrupting, childEntryFlowId: entry.id }];
}
