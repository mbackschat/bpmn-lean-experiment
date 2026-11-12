import { asElement } from "../moddle-graph.js";
import type { ElementRecord } from "../moddle-graph.js";
import type { Built, ModelNode, ReadContext } from "./model.js";
import { optionalId, requireId } from "./model.js";
import type { KernelJson } from "./wire.js";

/** A read element's identifier is the one its author wrote, so its origin names that identifier in the root process. */
export const headerOf = (node: ModelNode, sourceType: string): KernelJson => {
  const id = requireId(node.element);
  return { id, origin: { definition: null, sourceId: id }, sourceType, parent: node.parent };
};

/** The `default` flow an Activity or Gateway names, `null` when it names none. */
export const defaultFlowOf = (element: ElementRecord): string | null => optionalId(asElement(element.default) ?? {});

export const fixed = (id: string, element: KernelJson): Built => ({ kind: "element", id, build: () => element });

/** CIB `BpmnParse#isAsyncBefore`/`#isAsyncAfter`: exactly the text `true`, and `camunda:async` is `asyncBefore`. */
export function asyncContinuations(ctx: ReadContext, element: ElementRecord): Readonly<{ asyncBefore: boolean; asyncAfter: boolean }> {
  const legacy = ctx.attribute(element, "async") === "true";
  const before = ctx.attribute(element, "asyncBefore") === "true";
  return { asyncBefore: legacy || before, asyncAfter: ctx.attribute(element, "asyncAfter") === "true" };
}

/** An Activity's or Scope's envelope around its flow lists; `extra` overrides the empty mapping defaults. */
export function envelopeFor(
  ctx: ReadContext,
  element: ElementRecord,
  extra: Readonly<Record<string, KernelJson>>,
  boundaries: KernelJson[],
): KernelJson {
  const id = requireId(element);
  // Every handler, so that admission sees a second one (`compensation.handlerCount`) instead of the reader erasing it.
  const handlers = ctx.compensation.filter((entry) => entry.subject === id).map((entry) => entry.handler);
  return {
    incoming: ctx.incoming(id),
    outgoing: ctx.outgoing(id),
    inputs: [],
    outputs: [],
    multiInstance: null,
    compensationHandlers: handlers,
    forCompensation: element.isForCompensation === true,
    defaultFlow: defaultFlowOf(element),
    ...asyncContinuations(ctx, element),
    ...extra,
    boundaries,
  };
}
