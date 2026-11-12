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

/**
 * The binding whose source attributes the element declares. An event definition has no `implementation` attribute
 * (`tMessageEventDefinition`, Semantic.xsd:999-1008), so it matches on its `delegateExpression` alone.
 */
function boundBy(ctx: ReadContext, element: ElementRecord): EffectBinding | undefined {
  const declared = declaredImplementation(ctx, element);
  const delegate = declared?.name === "delegateExpression" ? declared.value : null;
  const implementation = text(element, "implementation");
  const eventDefinition = String(element.$type).endsWith("EventDefinition");
  return [...ctx.bindings, ...builtInBindings].find((binding) =>
    binding.delegateExpression === delegate && (eventDefinition ? delegate !== null : binding.implementation === implementation));
}

/**
 * The root identifier of the element's `camunda:delegateExpression`, which CIB resolves against process variables before
 * its beans (`JuelExpressionManager.java:144-150`); `Kernel.Admission` compares it with the declared names
 * (`work.handlerKeyName`, CIB-LIM-0017).
 */
export function handlerKey(ctx: ReadContext, element: ElementRecord): string | null {
  const declared = declaredImplementation(ctx, element);
  if (declared?.name !== "delegateExpression") return null;
  return /^[$#]\{\s*([A-Za-z_$][\w$]*)/u.exec(declared.value)?.[1] ?? null;
}

/**
 * The `EffectBinding` an element selects: an overlay or built-in binding when its source attributes match one;
 * otherwise BPMN's `implementation` (`##WebService` by default) with the `operationRef`, which `Kernel.Admission`
 * refuses when no host implements that protocol. A declared CIB implementation that no binding matches reads as no
 * operation, refused as `work.service.unboundImplementation`: its delegate, class, expression or topic names product
 * code, which stays out of the program; CIB reads only that implementation (`BpmnParse#parseServiceTaskLike`) and
 * deploys the task (CIB-LIM-0051).
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
  return { protocol: implementation ?? "##WebService", operation: declared === null ? operationRef ?? "" : "" };
}
