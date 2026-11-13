/**
 * A chain's bookkeeping of the hand-offs it offers the population ingress within one Run
 * ([population ingress](../../../docs/kernel/ARCHITECTURE-SPEC.md#population-ingress)). An emit is answered once the
 * ingress accepted it, which the chain carries (`UnsettledEmit.accepted`), or deferred it in this Run, which it keeps in
 * memory only: a deferral belongs to the ingress Run that made it, and the chain's next Run offers the emit again, which
 * the ingress answers alike. The emit barrier waits for answers, never for acceptance, so no Update of the chain waits on
 * room at the ingress; the ingress keeps arrival order across chains, so each chain's emits stay in commit order.
 */
import { assertNever } from "./host-machine.js";
import type { EmitVerdict, EmitWake, UnsettledEmit } from "./population-contract.js";

export interface Offers {
  /** The emits the ingress deferred in this Run, by command identifier. */
  readonly deferred: readonly string[];
  /** The ingress Run that last handed deferred emits back: a deferral it answered is void, even one arriving later. */
  readonly handedBack: string | null;
}

export const noOffers: Offers = { deferred: [], handedBack: null };

/** The emits to offer, in commit order: neither accepted nor deferred in this Run. */
export function dueOffers(emits: readonly UnsettledEmit[], offers: Offers): readonly UnsettledEmit[] {
  return emits.filter((emit) => !emit.accepted && !offers.deferred.includes(emit.commandId));
}

/** Whether the ingress answered every emit committed so far: the emit barrier. */
export function allAnswered(emits: readonly UnsettledEmit[], offers: Offers): boolean {
  return dueOffers(emits, offers).length === 0;
}

/** The emits and offers once the ingress answered the offer of `commandId` with `verdict`. */
export function offered(emits: readonly UnsettledEmit[], offers: Offers, commandId: string, verdict: EmitVerdict):
  { readonly emits: readonly UnsettledEmit[]; readonly offers: Offers } {
  // A wake or the emit's settlement may have answered it while the offer was in flight.
  if (!emits.some((emit) => emit.commandId === commandId && !emit.accepted)) return { emits, offers };
  switch (verdict.kind) {
    case "accepted":
      return {
        emits: emits.map((emit) => emit.commandId === commandId ? { ...emit, accepted: true } : emit),
        offers: { ...offers, deferred: offers.deferred.filter((held) => held !== commandId) },
      };
    case "deferred":
      // A Run that handed its deferred emits back holds this one no more; the next Run is offered it.
      if (verdict.run === offers.handedBack || offers.deferred.includes(commandId)) return { emits, offers };
      return { emits, offers: { ...offers, deferred: [...offers.deferred, commandId] } };
  }
  return assertNever(verdict);
}

/** The offers once ingress Run `wake.run` handed back the deferred emits it names. */
export function handedBack(offers: Offers, wake: EmitWake): Offers {
  return { handedBack: wake.run, deferred: offers.deferred.filter((held) => !wake.commandIds.includes(held)) };
}
