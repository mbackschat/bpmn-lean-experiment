import type { Built, ModelNode, ReadContext } from "./model.js";
import { requireId } from "./model.js";
import type { KernelJson } from "./wire.js";

export const headerOf = (node: ModelNode, sourceType: string): KernelJson => ({
  id: requireId(node.element),
  sourceType,
  parent: node.parent,
});

export const fixed = (id: string, element: KernelJson): Built => ({ kind: "element", id, build: () => element });

/** An Activity's or Scope's envelope around its flow lists; `extra` overrides the empty mapping defaults. */
export function envelopeFor(
  ctx: ReadContext,
  id: string,
  extra: Readonly<Record<string, KernelJson>>,
  boundaries: KernelJson[],
): KernelJson {
  return {
    incoming: ctx.incoming(id),
    outgoing: ctx.outgoing(id),
    inputs: [],
    outputs: [],
    multiInstance: null,
    compensationHandler: ctx.compensation.find((entry) => entry.subject === id)?.handler ?? null,
    ...extra,
    boundaries,
  };
}
