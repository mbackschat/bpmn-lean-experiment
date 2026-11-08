/**
 * Admission registry, transcribed from `Kernel/AdmissionRegistry.lean`: the first refusal of any element, in
 * program order. Only `run.ts` imports it.
 */
import { ElementTag, assertNever, type Element, type Program } from "./il/types.js";
import { activity } from "./admission/work.js";
import { event } from "./admission/propagation.js";
import { gateway, start } from "./admission/flow.js";

function element(element: Element): string | null {
  switch (element.tag) {
    case ElementTag.Activity:
      return activity(element.payload);
    case ElementTag.Scope:
      return "scope";
    case ElementTag.Event:
      return event(element.payload);
    case ElementTag.Gateway:
      return gateway(element.payload);
    case ElementTag.Start:
      return start(element.payload);
  }
  return assertNever(element);
}

export function admit(program: Program): string | null {
  for (const candidate of program.elements) {
    const refusal = element(candidate);
    if (refusal !== null) {
      return refusal;
    }
  }
  return null;
}
