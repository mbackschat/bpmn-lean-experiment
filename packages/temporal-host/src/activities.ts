/**
 * The host's Activities. An effect handler returns what the effect observed, its business result; it throws only for
 * a transport failure, which Temporal retries and the kernel never sees. A Script is evaluated in the Worker, and its
 * result is recorded like any effect result.
 *
 * The population Activities (`population-activities.ts`) reach other Workflows through the Worker's own client.
 */
import { ApplicationFailure } from "@temporalio/activity";

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

export function createHostActivities(options: HostActivityOptions): HostActivities {
  return {
    ...createPopulationActivities(),
    executeEffect: (request) => options.effects(request, { idempotencyKey: request.key }),
    evaluateScript: async (request) => {
      try {
        return evaluateScript(request, { timeoutMs: options.scriptTimeoutMs });
      } catch (error) {
        // A retry cannot help a language the host does not run; the Workflow halts on it.
        if (error instanceof UnsupportedScriptFormat) throw ApplicationFailure.nonRetryable(error.message, error.name);
        throw error;
      }
    },
  };
}
