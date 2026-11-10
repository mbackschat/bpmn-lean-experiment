import { asElement } from "../moddle-graph.js";
import type { ElementRecord } from "../moddle-graph.js";
import { defaultFlowOf, fixed, headerOf } from "./build.js";
import { FlowElementKind, requireId } from "./model.js";
import type { Built, ModelNode, ReadContext } from "./model.js";
import { assertNever, ctor } from "./wire.js";
import type { KernelJson } from "./wire.js";

type GatewayKind = FlowElementKind.ExclusiveGateway | FlowElementKind.InclusiveGateway |
  FlowElementKind.ParallelGateway | FlowElementKind.EventBasedGateway;

const flowById = (ctx: ReadContext, id: string): ElementRecord | undefined =>
  ctx.flows.find((flow) => flow.id === id);

/**
 * Outgoing flows other than the default, in document order (`ctx.outgoing`'s): conditions are evaluated in that order
 * (§13.4.2). Each condition lives on its `Flow`.
 */
function candidateFlows(ctx: ReadContext, id: string, defaultFlow: string | null): string[] {
  return ctx.outgoing(id).filter((flow) => flow !== defaultFlow);
}

function exclusiveKind(ctx: ReadContext, id: string, element: ElementRecord): KernelJson {
  const defaultFlow = defaultFlowOf(element);
  return ctor("exclusive", {
    candidates: candidateFlows(ctx, id, defaultFlow),
    default: defaultFlow,
  });
}

/**
 * An Inclusive Gateway takes every true condition (§13.4.3); its candidates keep document order, the order its branches
 * start in (`docs/kernel/IL-SPEC.md`, `gateway`). One whose outflows carry no condition and no default is a pure join
 * and lists no candidates.
 */
function inclusiveKind(ctx: ReadContext, id: string, element: ElementRecord): KernelJson {
  const defaultFlow = defaultFlowOf(element);
  const flows = candidateFlows(ctx, id, defaultFlow);
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
      return ctor("eventBased", { instantiation: instantiation(node.element) });
  }
  return assertNever(kind);
}

/**
 * How an Event-Based Gateway begins (BPMN 2.0.2 §10.6.6, Table 10.127): `instantiate="true"` starts the Process,
 * Exclusive or, with `eventGatewayType="Parallel"`, Parallel; a Parallel type is read as instantiating without
 * `instantiate` too, since only an instantiating gateway has a Parallel meaning. Admission refuses both
 * (`gateway.eventBased.instantiate`).
 */
function instantiation(element: ElementRecord): string {
  if (element.eventGatewayType === "Parallel") return "parallel";
  return element.instantiate === true ? "exclusive" : "none";
}

export function readGateway(ctx: ReadContext, node: ModelNode, kind: GatewayKind): Built {
  const id = requireId(node.element);
  return fixed(id, ctor("gateway", {
    header: headerOf(node, kind),
    payload: { kind: gatewayKind(ctx, id, node, kind), incoming: ctx.incoming(id), outgoing: ctx.outgoing(id) },
  }));
}
