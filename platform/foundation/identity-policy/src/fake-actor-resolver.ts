import type { ActorContext } from "./actor-context.js";
import { snapshotActorContext } from "./actor-context.js";

export interface ActorResolver {
  resolveActor(): ActorContext;
}

/** Resolves the one startup-configured actor snapshot used by the M3 fake policy. */
export class FakeActorResolver implements ActorResolver {
  readonly #actor: ActorContext;

  constructor(actor: ActorContext) {
    this.#actor = snapshotActorContext(actor);
  }

  resolveActor(): ActorContext {
    return this.#actor;
  }
}
