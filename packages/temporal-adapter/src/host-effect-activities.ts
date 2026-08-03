/**
 * Product implementation of the effect Activity, backed by deterministic configured handlers.
 *
 * The Workflow proxies exactly one Activity type for every semantic effect, so a production Worker
 * that registers none cannot execute an effect-bearing Process at all. This module supplies that
 * implementation for the runnable product without introducing a real integration: each declared
 * neutral descriptor maps to one fixed `EffectExecutionResult`, so an attempt retried by Temporal
 * observes the same result and the semantic core commits exactly what configuration declared.
 *
 * The handler performs no I/O, reads no clock, and derives nothing from the request beyond its
 * descriptor. An undeclared descriptor throws instead of returning a fabricated success the core
 * would commit; the approved Activity retry policy then exhausts and surfaces one typed adapter
 * failure, so this module states no retry policy of its own.
 */
import type { EffectActivities, EffectRequest } from "./effect-probe.js";
import type { HostEffectHandler } from "./host-interaction-plan.js";

export function createHostEffectActivities(
  handlers: ReadonlyArray<HostEffectHandler>,
): EffectActivities {
  const declared = new Map(
    handlers.map((handler) => [
      descriptorKey(handler.protocol, handler.operation),
      handler,
    ]),
  );
  return {
    executeBpmnEffect: async (request: EffectRequest) => {
      const handler = declared.get(
        descriptorKey(request.protocol, request.operation),
      );
      if (handler === undefined) {
        throw new Error(
          `The product run has no configured product effect handler for ${request.protocol}/${request.operation}`,
        );
      }
      return handler.result;
    },
  };
}

/**
 * Keys a handler by its complete neutral descriptor.
 *
 * Protocol and operation are arbitrary validated wire strings that may contain any delimiter, so the
 * key is the JSON encoding of the exact pair, which is injective over string pairs. Joining them
 * with a separator would collide `("a b", "c")` with `("a", "b c")`.
 */
function descriptorKey(protocol: string, operation: string): string {
  return JSON.stringify([protocol, operation]);
}
