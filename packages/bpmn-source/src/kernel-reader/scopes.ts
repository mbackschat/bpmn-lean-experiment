import type { ElementRecord } from "../moddle-graph.js";
import { envelopeFor, headerOf } from "./build.js";
import { startSubscription } from "./events.js";
import { byId, FlowElementKind, ReadRefusal, ReadRefusalCode, list, optionalId, requireId } from "./model.js";
import type { Built, ModelNode, ReadContext } from "./model.js";
import { inputOutputParameters } from "./data.js";
import { readActivityData } from "./work.js";
import { assertNever, ctor } from "./wire.js";
import type { KernelJson } from "./wire.js";

/** Children of one container: its own nodes by id, then the compensation handlers it holds in subject order. */
export function childIds(ctx: ReadContext, container: ElementRecord): string[] {
  const compensationBoundaries = new Set(ctx.compensation.map((entry) => entry.boundary));
  const own = ctx.childrenOf(container)
    .filter((node) => !compensationBoundaries.has(requireId(node.element)) && !ctx.handlers.has(requireId(node.element)) &&
      !ctx.erased.has(requireId(node.element)))
    .sort(byId)
    .map((node) => requireId(node.element));
  const handled = ctx.compensation.filter((entry) => entry.container === container);
  return [...own, ...handled.filter((entry) => entry.boundary !== null).map((entry) => entry.handler),
    ...handled.filter((entry) => entry.boundary === null).map((entry) => entry.handler)];
}

function eventSubProcessKind(ctx: ReadContext, node: ModelNode): KernelJson {
  const start = list(node.element, "flowElements").find((element) => element.$type === "bpmn:StartEvent");
  const subscription = start === undefined ? null : startSubscription(ctx, start);
  if (start === undefined || subscription === null) {
    throw new ReadRefusal(ReadRefusalCode.EventSubProcessStart, optionalId(node.element), "no triggered start Event");
  }
  return ctor("eventSubProcess", { start: subscription, interrupting: start.isInterrupting !== false });
}

type ScopeKind = FlowElementKind.SubProcess | FlowElementKind.Transaction;

function scopeKind(ctx: ReadContext, node: ModelNode, kind: ScopeKind): KernelJson {
  switch (kind) {
    case FlowElementKind.Transaction:
      return "transaction";
    case FlowElementKind.SubProcess:
      return node.element.triggeredByEvent === true ? eventSubProcessKind(ctx, node) : "embedded";
  }
  return assertNever(kind);
}

export function readScope(ctx: ReadContext, node: ModelNode, kind: ScopeKind): Built {
  const id = requireId(node.element);
  const data = readActivityData(ctx, node.element, true);
  const payload = {
    kind: scopeKind(ctx, node, kind),
    children: childIds(ctx, node.element),
    localVariables: inputOutputParameters(ctx, node.element).targets,
  };
  return {
    kind: "element",
    id,
    build: (boundaries) => ctor("scope", {
      header: headerOf(node, kind),
      payload: { ...payload, envelope: envelopeFor(ctx, id, data, boundaries) },
    }),
  };
}
