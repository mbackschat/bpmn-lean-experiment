/**
 * The host's Activities. An effect handler returns what the effect observed, its business result; it throws only for
 * a transport failure, which Temporal retries and the kernel never sees. A Script is evaluated in the Worker, and its
 * result is recorded like any effect result.
 *
 * The population Activities (`population-activities.ts`) reach other Workflows through the Worker's own client.
 */
import { ApplicationFailure } from "@temporalio/activity";

import { CapacityBound, canonicalBytes, capacityCode, chainCapacity } from "./capacity.js";
import type { EffectRequest } from "./host-machine.js";
import type { EffectResult } from "./port.js";
import type { HostActivities } from "./protocol.js";
import { createPopulationActivities } from "./population-activities.js";
import { UnsupportedScriptFormat, evaluateScript } from "./script-handler.js";

export interface EffectContext {
  /** Stable across transport retries and Workflow Runs for one effect attempt; a handler with external writes honours it. */
  readonly idempotencyKey: string;
}

export type EffectHandler = (request: EffectRequest, context: EffectContext) => Promise<EffectResult>;

export interface HostActivityOptions {
  readonly effects: EffectHandler;
  readonly scriptTimeoutMs: number;
}

/**
 * `result` once measured before the Activity returns it: one beyond the effect-result bound fails the Activity for good,
 * and the chain halts with the bound's code, rather than Temporal refusing an oversized payload after the fact.
 */
function bounded(result: EffectResult): EffectResult {
  if (canonicalBytes(result) <= chainCapacity.effectResultBytes) return result;
  const code = capacityCode(CapacityBound.EffectResult);
  throw ApplicationFailure.nonRetryable(code, code);
}

export function createHostActivities(options: HostActivityOptions): HostActivities {
  return {
    ...createPopulationActivities(),
    executeEffect: async (request) => bounded(await options.effects(request, { idempotencyKey: request.key })),
    evaluateScript: async (request) => {
      try {
        return bounded(evaluateScript(request, { timeoutMs: options.scriptTimeoutMs }));
      } catch (error) {
        // A retry cannot help a language the host does not run; the Workflow halts on it.
        if (error instanceof UnsupportedScriptFormat) throw ApplicationFailure.nonRetryable(error.message, error.name);
        throw error;
      }
    },
  };
}
