import { asElement } from "../moddle-graph.js";
import type { ElementRecord } from "../moddle-graph.js";
import { defaultFlowOf, fixed, headerOf } from "./build.js";
import { FlowElementKind, ReadRefusal, ReadRefusalCode, requireId } from "./model.js";
import type { Built, ModelNode, ReadContext } from "./model.js";
import { assertNever, ctor } from "./wire.js";
import type { KernelJson } from "./wire.js";

type GatewayKind = FlowElementKind.ExclusiveGateway | FlowElementKind.InclusiveGateway |
  FlowElementKind.ParallelGateway | FlowElementKind.EventBasedGateway;

const flowById = (ctx: ReadContext, id: string): ElementRecord | undefined =>
  ctx.flows.find((flow) => flow.id === id);

/**
 * Outgoing flows other than the default, in document order: conditions are evaluated in that order (§13.4.2). Each
 * condition lives on its `Flow`.
 */
function candidateFlows(ctx: ReadContext, id: string, defaultFlow: string | null): string[] {
  return ctx.outgoing(id)
    .filter((flow) => flow !== defaultFlow)
    .sort((left, right) => (ctx.flowOrder.get(left) ?? 0) - (ctx.flowOrder.get(right) ?? 0));
}

function exclusiveKind(ctx: ReadContext, id: string, element: ElementRecord): KernelJson {
  const defaultFlow = defaultFlowOf(element);
  return ctor("exclusive", {
    candidates: candidateFlows(ctx, id, defaultFlow),
    default: defaultFlow,
  });
}

/**
 * An Inclusive Gateway takes every true condition (§13.4.3), so its candidates are an unordered set kept in id order.
 * One whose outflows carry no condition and no default is a pure join and lists no candidates.
 */
function inclusiveKind(ctx: ReadContext, id: string, element: ElementRecord): KernelJson {
  const defaultFlow = defaultFlowOf(element);
  const flows = ctx.outgoing(id).filter((flow) => flow !== defaultFlow);
  const conditioned = flows.some((flow) => asElement(flowById(ctx, flow)?.conditionExpression) !== undefined);
  return ctor("inclusive", {
    candidates: conditioned || defaultFlow !== null ? flows : [],
    default: defaultFlow,
  });
}

function gatewayKind(ctx: ReadContext, id: string, node: ModelNode, kind: GatewayKind): KernelJson {
  switch (kind) {
    case FlowElementKind.ExclusiveGateway:
      return exclusiveKind(ctx, id, node.element);
    case FlowElementKind.InclusiveGateway:
      return inclusiveKind(ctx, id, node.element);
    case FlowElementKind.ParallelGateway:
      return "parallel";
    case FlowElementKind.EventBasedGateway:
      return "eventBased";
  }
  return assertNever(kind);
}

/**
 * An instantiating Event-Based Gateway, Exclusive or Parallel (BPMN 2.0.2 §10.6.6, Table 10.127), starts the Process it
 * begins, which `GatewayKind.eventBased` has no field for; the reader refuses it rather than read a gateway that waits
 * (PC-CF-05).
 */
function refuseInstantiation(node: ModelNode, kind: GatewayKind): void {
  if (kind === FlowElementKind.EventBasedGateway && (node.element.instantiate === true || node.element.eventGatewayType === "Parallel")) {
    throw new ReadRefusal(ReadRefusalCode.EventBasedGatewayInstantiate, requireId(node.element),
      `instantiate ${String(node.element.instantiate)}, eventGatewayType ${String(node.element.eventGatewayType)}`);
  }
}

export function readGateway(ctx: ReadContext, node: ModelNode, kind: GatewayKind): Built {
  refuseInstantiation(node, kind);
  const id = requireId(node.element);
  return fixed(id, ctor("gateway", {
    header: headerOf(node, kind),
    payload: { kind: gatewayKind(ctx, id, node, kind), incoming: ctx.incoming(id), outgoing: ctx.outgoing(id) },
  }));
}
