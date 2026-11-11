/**
 * The host's Activities. An effect handler returns what the effect observed, its business result; it throws only for
 * a transport failure, which Temporal retries and the kernel never sees. A Script is evaluated in the Worker, and its
 * result is recorded like any effect result.
 *
 * The correlation Activities reach other Workflows through the Worker's own client: a process's registration at the
 * ingress of its address (Update-with-Start, so the first registration starts the ingress), the ingress's question to
 * every candidate chain, and its delivery to the sole match, an Update whose identifier the publication's command
 * fixes, so a retried attempt is the same Update.
 */
import { ApplicationFailure, Context } from "@temporalio/activity";
import { WithStartWorkflowOperation, WorkflowNotFoundError } from "@temporalio/client";

import { submitUpdate } from "./client.js";
import { ingressWorkflowId } from "./correlation-address.js";
import type { CandidateMatches } from "./correlation.js";
import type { EffectRequest } from "./host-machine.js";
import type { EffectResult, OccurrenceId } from "./port.js";
import {
  correlationQuery,
  deliverUpdate,
  ingressWorkflowType,
  registerUpdate,
  type HostActivities,
  type IngressArgs,
} from "./protocol.js";
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
    registerCorrelation: async (request) => {
      const { client, info } = Context.current();
      const start = new WithStartWorkflowOperation<(args: IngressArgs) => Promise<void>>(ingressWorkflowType, {
        workflowId: ingressWorkflowId(request.correlationScope, request.channel),
        taskQueue: info.taskQueue,
        workflowIdConflictPolicy: "USE_EXISTING",
        args: [{ correlationScope: request.correlationScope, channel: request.channel, carried: null }],
      });
      await client.workflow.executeUpdateWithStart(registerUpdate, { args: [request.registration], startWorkflowOperation: start });
    },
    scanCorrelation: async (request) => {
      const { client } = Context.current();
      return Promise.all(request.candidates.map(async (workflowId): Promise<CandidateMatches> => {
        try {
          const occurrences: readonly OccurrenceId[] =
            await client.workflow.getHandle(workflowId).query(correlationQuery, request.question);
          return { workflowId, occurrences };
        } catch (error) {
          if (error instanceof WorkflowNotFoundError) return { workflowId, occurrences: null };
          throw error;
        }
      }));
    },
    deliverCorrelated: async (request) => {
      const { client } = Context.current();
      const commandId = (request.stimulus as { readonly commandId?: unknown } | null)?.commandId;
      if (typeof commandId !== "string") throw ApplicationFailure.nonRetryable("a correlated delivery names no command");
      return submitUpdate(client, request.workflowId, deliverUpdate, request.stimulus, `correlated:${commandId}`);
    },
  };
}
