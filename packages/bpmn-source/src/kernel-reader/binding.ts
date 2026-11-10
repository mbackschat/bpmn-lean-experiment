import { asElement } from "../moddle-graph.js";
import type { ElementRecord } from "../moddle-graph.js";
import { optionalId, text } from "./model.js";
import type { EffectBinding, ReadContext } from "./model.js";
import type { KernelJson } from "./wire.js";

export const activityProtocol = "urn:bpmn-lean:effect-protocol:activity-v1";
export const operation = (name: string): string => `urn:bpmn-lean:effect-operation:${name}-v1`;

/** The project's own effect implementations, by the source attributes that select them. */
const builtInBindings: ReadonlyArray<EffectBinding> = [
  { implementation: "urn:bpmn-lean:effect:probe-v1", delegateExpression: "${bpmnLeanEffectHandler}", protocol: activityProtocol, operation: operation("probe") },
  { implementation: null, delegateExpression: "${mappedSuccessHandler}", protocol: activityProtocol, operation: operation("mapped-success") },
  { implementation: "urn:bpmn-lean:effect-binding:mapped-boundary-error:v1", delegateExpression: "#{mappedBoundaryErrorHandler}", protocol: activityProtocol, operation: operation("mapped-boundary-error") },
];
const compensationEffectImplementation = "urn:bpmn-lean:effect:compensation-single-effect-v1";

/** CIB attributes that select a Java or external implementation (`BpmnParse#isServiceTaskLike`). */
const implementationAttributes = ["delegateExpression", "class", "expression", "type", "topic"] as const;

export function declaredImplementation(ctx: ReadContext, element: ElementRecord): Readonly<{ name: string; value: string }> | null {
  for (const name of implementationAttributes) {
    const value = ctx.attribute(element, name);
    if (value !== null) return { name, value };
  }
  return null;
}

function boundBy(ctx: ReadContext, element: ElementRecord): EffectBinding | undefined {
  const declared = declaredImplementation(ctx, element);
  const delegate = declared?.name === "delegateExpression" ? declared.value : null;
  const implementation = text(element, "implementation");
  return [...ctx.bindings, ...builtInBindings].find((binding) =>
    binding.delegateExpression === delegate && binding.implementation === implementation);
}

/** The delegate expression an overlay or built-in binding replaces with its operation, `null` when none matches. */
export const boundDelegate = (ctx: ReadContext, element: ElementRecord): string | null =>
  boundBy(ctx, element)?.delegateExpression ?? null;

/**
 * The `EffectBinding` an element selects: an overlay or built-in binding when its source attributes match one;
 * otherwise the source's own attributes unchanged (BPMN's `implementation`, `##WebService` by default, and the declared
 * CIB implementation or `operationRef`), which `Kernel.Admission` refuses when no host implements that protocol.
 */
export function effectBinding(ctx: ReadContext, element: ElementRecord): KernelJson {
  const declared = declaredImplementation(ctx, element);
  const implementation = text(element, "implementation");
  const bound = boundBy(ctx, element);
  if (bound !== undefined) return { protocol: bound.protocol, operation: bound.operation };
  if (implementation === compensationEffectImplementation) {
    return { protocol: activityProtocol, operation: operation("compensation-single-effect") };
  }
  const operationRef = optionalId(asElement(element.operationRef) ?? {});
  return { protocol: implementation ?? "##WebService", operation: declared?.value ?? operationRef ?? "" };
}
