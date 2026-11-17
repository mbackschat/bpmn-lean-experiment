import { asElement } from "../moddle-graph.js";
import type { ElementRecord } from "../moddle-graph.js";
import type { Built, ModelNode, ReadContext } from "./model.js";
import { ReadRefusal, ReadRefusalCode, optionalId, requireId } from "./model.js";
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

/**
 * The settings of the jobs an element's asynchronous continuations create, each as written: `camunda:exclusive`, read as
 * CIB's `BpmnParse#isExclusive` reads it, exactly `true` is true, and the text of `camunda:failedJobRetryTimeCycle`,
 * which CIB reads from the element's extensions (`DefaultFailedJobParseListener.java:181-205`) and refuses twice.
 */
export function jobSettings(ctx: ReadContext, element: ElementRecord): Readonly<{ exclusive: boolean | null; retryCycle: string | null }> {
  const exclusive = ctx.attribute(element, "exclusive");
  return { exclusive: exclusive === null ? null : exclusive === "true", retryCycle: retryCycle(ctx, element) };
}

/** The text of an element's `camunda:failedJobRetryTimeCycle`, `null` without one; a second is refused, as CIB's `elementNS`. */
export function retryCycle(ctx: ReadContext, element: ElementRecord): string | null {
  const cycles = ctx.extensions(element, "failedJobRetryTimeCycle");
  if (cycles.length > 1) {
    throw new ReadRefusal(ReadRefusalCode.FactNotCarried, optionalId(element), "a second camunda:failedJobRetryTimeCycle");
  }
  const cycle = cycles[0];
  return cycle === undefined ? null : typeof cycle.$body === "string" ? cycle.$body : "";
}

/**
 * A `camunda:formRef` with its `formRefBinding` and `formRefVersion`, each as written (`BpmnParse.java:2851-2886`); the two
 * are read only beside a `formRef`, so without one they stay unconsumed and the reader refuses them.
 */
export function formRef(ctx: ReadContext, element: ElementRecord): KernelJson {
  const key = ctx.attribute(element, "formRef");
  if (key === null) return null;
  return { key, binding: ctx.attribute(element, "formRefBinding"), version: ctx.attribute(element, "formRefVersion") };
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
    ...jobSettings(ctx, element),
    structuredInputs: [],
    structuredOutputs: [],
    ...extra,
    boundaries,
  };
}
