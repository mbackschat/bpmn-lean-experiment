/**
 * Admission registry, transcribed from `Kernel/AdmissionRegistry.lean`: the first refusal of any element, in
 * program order. Only `run.ts` imports it.
 */
import { ElementTag, EventRoleTag, assertNever, type Element, type Program } from "./il/types.js";
import * as Flow from "./admission/flow.js";
import * as Work from "./admission/work.js";
import * as MultiInstance from "./admission/multi-instance.js";
import * as Propagation from "./admission/propagation.js";
import * as Scopes from "./admission/scopes.js";
import * as Subscriptions from "./admission/subscriptions.js";

export function element(candidate: Element): string | null {
  switch (candidate.tag) {
    case ElementTag.Activity: {
      const envelope = candidate.payload.envelope;
      return Work.activity(candidate.payload) ??
        (envelope.multiInstance === null ? null : MultiInstance.activity(envelope, envelope.multiInstance)) ??
        Subscriptions.boundaries(envelope.boundaries);
    }
    case ElementTag.Scope:
      return Scopes.scope(candidate.payload) ?? Subscriptions.boundaries(candidate.payload.envelope.boundaries);
    case ElementTag.Event: {
      const role = candidate.payload.role;
      switch (role.tag) {
        case EventRoleTag.Catch:
          return Subscriptions.catchEvent(role.subscription);
        case EventRoleTag.Throw:
          return Propagation.throwRecord(role.record);
        case EventRoleTag.LinkCatch:
          return Flow.link(candidate.payload);
        case EventRoleTag.LinkThrow:
          return Flow.link(candidate.payload);
      }
      return assertNever(role);
    }
    case ElementTag.Gateway:
      return Flow.gateway(candidate.payload);
    case ElementTag.Start: {
      const subscription = candidate.payload.subscription;
      return Flow.start(candidate.payload) ??
        (subscription === null ? null : Subscriptions.start(candidate.header.parent !== null, subscription));
    }
  }
  return assertNever(candidate);
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
