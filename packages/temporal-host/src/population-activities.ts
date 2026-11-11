/**
 * The population Activities: each transports one ingress action to the chains or deployments it names, or one chain's
 * registration or emit to the ingress, and retries transport failures only. A chain or Workflow that no longer exists
 * is an answer (`gone`, `null`), never a retry.
 */
import { ApplicationFailure, Context } from "@temporalio/activity";
import {
  WithStartWorkflowOperation,
  WorkflowExecutionAlreadyStartedError,
  WorkflowNotFoundError,
  WorkflowUpdateFailedError,
  type Client,
} from "@temporalio/client";

import { RunKind, rejectionType, workflowType, type ProcessResult, type RunProcessArgs } from "./host-contract.js";
import {
  deploymentWorkflowId,
  emitUpdateId,
  populationIngressWorkflowId,
  populationInstanceWorkflowId,
} from "./population-address.js";
import {
  deploymentWorkflowType,
  type Answer,
  type DeploymentArgs,
  type PopulationActivities,
  type PopulationIngressArgs,
} from "./population-contract.js";
import type { JsonValue, ReachOutcome } from "./port.js";
import {
  deploymentConditionalStartsQuery,
  deploymentMessageStartsQuery,
  deploymentProgramQuery,
  deploymentSignalStartsQuery,
  emitSettledUpdate,
  pendingIntentsQuery,
  populationDeliverUpdate,
  populationEmitUpdate,
  populationMessageQuery,
  populationRegisterUpdate,
  populationSignalQuery,
  populationStartOutcomeQuery,
  populationStartedUpdate,
} from "./protocol.js";

type Ingress = (args: PopulationIngressArgs) => Promise<void>;

/** `null` when the Workflow `read` addresses does not exist; any other failure is transport's, which Temporal retries. */
async function unlessGone<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof WorkflowNotFoundError) return null;
    if (error instanceof WorkflowUpdateFailedError && error.cause instanceof ApplicationFailure &&
        error.cause.type === rejectionType) {
      return null;
    }
    throw error;
  }
}

/**
 * The population's ingress. A chain belongs to a population only once its deployment registered there, which started
 * the ingress, so a chain's Update never starts one.
 */
function ingress(client: Client, population: string) {
  return client.workflow.getHandle<Ingress>(populationIngressWorkflowId(population));
}

async function scan(client: Client, population: string, action: Parameters<PopulationActivities["scanPopulation"]>[0]["action"]): Promise<Answer> {
  const deployment = (deploymentId: number) => client.workflow.getHandle(deploymentWorkflowId(population, deploymentId));
  switch (action.kind) {
    case "scanSignal": {
      const [chains, starts] = await Promise.all([
        Promise.all(action.chains.map(async (workflowId) => {
          const answered = await unlessGone(() => client.workflow.getHandle(workflowId)
            .query(populationSignalQuery, { address: action.address, emitter: action.emitter }));
          return answered === null ? { workflowId, instanceId: null, receivers: [], refusesVariables: false } : { workflowId, ...answered };
        })),
        Promise.all(action.deployments.map(async (deploymentId) =>
          ({ deploymentId, ...await deployment(deploymentId).query(deploymentSignalStartsQuery, action.address, action.variables) }))),
      ]);
      return { kind: "signalScan", chains, starts };
    }
    case "scanMessage": {
      const chains = await Promise.all(action.chains.map(async (workflowId) =>
        ({ workflowId, receivers: await unlessGone(() => client.workflow.getHandle(workflowId).query(populationMessageQuery, action.publication)) ?? [] })));
      return { kind: "messageScan", chains };
    }
    case "scanMessageStarts":
      return {
        kind: "messageStarts",
        starts: await Promise.all(action.deployments.map(async (deploymentId) =>
          ({ deploymentId, candidates: await deployment(deploymentId).query(deploymentMessageStartsQuery, action.message) }))),
      };
    case "scanConditionalStarts":
      return {
        kind: "conditionalStarts",
        starts: await Promise.all(action.deployments.map(async (deploymentId) =>
          ({ deploymentId, startEvents: await deployment(deploymentId).query(deploymentConditionalStartsQuery) }))),
      };
  }
}

export function createPopulationActivities(): PopulationActivities {
  return {
    scanPopulation: async (request) => scan(Context.current().client, request.population, request.action),
    deliverPopulation: async (request) => {
      const { client } = Context.current();
      const outcome = await unlessGone(() => client.workflow.getHandle(request.workflowId)
        .executeUpdate(populationDeliverUpdate, { args: [{ deliveryId: request.deliveryId, delivery: request.delivery }], updateId: request.deliveryId }));
      return outcome ?? { kind: "gone" };
    },
    startPopulation: async (request) => {
      const { client, info } = Context.current();
      const program: JsonValue = await client.workflow.getHandle(deploymentWorkflowId(request.population, request.deploymentId)).query(deploymentProgramQuery);
      const workflowId = populationInstanceWorkflowId(request.population, request.instanceId);
      const start = new WithStartWorkflowOperation<(args: RunProcessArgs) => Promise<ProcessResult>>(workflowType, {
        workflowId,
        taskQueue: info.taskQueue,
        workflowIdConflictPolicy: "USE_EXISTING",
        workflowIdReusePolicy: "REJECT_DUPLICATE",
        args: [{
          kind: RunKind.PopulationStart, program, config: request.config, correlationScope: null,
          population: { population: request.population, deploymentId: request.deploymentId }, request: request.request,
        }],
      });
      try {
        return await client.workflow.executeUpdateWithStart(populationStartedUpdate, { startWorkflowOperation: start });
      } catch (error) {
        // The instance identity started once and its chain has closed: its recorded start answers again.
        if (!(error instanceof WorkflowExecutionAlreadyStartedError)) throw error;
        const recorded: ReachOutcome | null = await client.workflow.getHandle(workflowId).query(populationStartOutcomeQuery);
        if (recorded === null) throw ApplicationFailure.nonRetryable(`chain ${workflowId} recorded no population start`);
        return recorded;
      }
    },
    readPopulationIntents: async (request) =>
      unlessGone(() => Context.current().client.workflow.getHandle(request.workflowId).query(pendingIntentsQuery, request.commandId)),
    settlePopulationEmit: async (request) => {
      await unlessGone(() => Context.current().client.workflow.getHandle(request.workflowId).executeUpdate(emitSettledUpdate, { args: [request.commandId] }));
    },
    registerPopulation: async (request) =>
      ingress(Context.current().client, request.population).executeUpdate(populationRegisterUpdate, { args: [request.registration] }),
    emitPopulation: async (request) => {
      await ingress(Context.current().client, request.population)
        .executeUpdate(populationEmitUpdate, { args: [request.reference], updateId: emitUpdateId(request.reference) });
    },
    startDeployment: async (request) => {
      const { client, info } = Context.current();
      const args: DeploymentArgs = { population: request.population, deploymentId: request.deploymentId, program: request.program };
      try {
        await client.workflow.start<(args: DeploymentArgs) => Promise<void>>(deploymentWorkflowType, {
          workflowId: deploymentWorkflowId(request.population, request.deploymentId), taskQueue: info.taskQueue,
          workflowIdConflictPolicy: "USE_EXISTING", args: [args],
        });
      } catch (error) {
        if (!(error instanceof WorkflowExecutionAlreadyStartedError)) throw error;
      }
    },
  };
}
