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
  processInstanceWorkflowId,
} from "./population-address.js";
import { PopulationClient } from "./population-client.js";
import {
  PopulationRefused,
  deploymentWorkflowType,
  type Answer,
  type DeploymentArgs,
  type PopulationActivities,
  type PopulationIngressArgs,
  type ScanRequest,
} from "./population-contract.js";
import { queueFullCode } from "./population.js";
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

/**
 * `null` when the Workflow `read` addresses does not exist or refuses it as closed; any other failure is transport's,
 * which Temporal retries.
 */
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

type ScanAction = ScanRequest["action"];

async function scan(client: Client, population: string, action: ScanAction): Promise<Answer> {
  const chain = (workflowId: string) => client.workflow.getHandle(workflowId);
  const deployment = (deploymentId: number) => client.workflow.getHandle(deploymentWorkflowId(population, deploymentId));
  switch (action.kind) {
    case "scanSignal": {
      const question = { address: action.address, emitter: action.emitter };
      const [chains, starts] = await Promise.all([
        Promise.all(action.chains.map(async (workflowId) => {
          const answered = await unlessGone(() => chain(workflowId).query(populationSignalQuery, question));
          return answered === null
            ? { workflowId, instanceId: null, receivers: [], refusesVariables: false }
            : { workflowId, ...answered };
        })),
        Promise.all(action.deployments.map(async (deploymentId) => {
          const answered = await deployment(deploymentId)
            .query(deploymentSignalStartsQuery, action.address, action.variables);
          return { deploymentId, ...answered };
        })),
      ]);
      return { kind: "signalScan", chains, starts };
    }
    case "scanMessage": {
      const chains = await Promise.all(action.chains.map(async (workflowId) => {
        const receivers = await unlessGone(() => chain(workflowId).query(populationMessageQuery, action.publication));
        return { workflowId, receivers: receivers ?? [] };
      }));
      return { kind: "messageScan", chains };
    }
    case "scanMessageStarts": {
      const starts = await Promise.all(action.deployments.map(async (deploymentId) => {
        const candidates = await deployment(deploymentId).query(deploymentMessageStartsQuery, action.message);
        return { deploymentId, candidates };
      }));
      return { kind: "messageStarts", starts };
    }
    case "scanConditionalStarts": {
      const starts = await Promise.all(action.deployments.map(async (deploymentId) =>
        ({ deploymentId, startEvents: await deployment(deploymentId).query(deploymentConditionalStartsQuery) })));
      return { kind: "conditionalStarts", starts };
    }
  }
}

/**
 * A population Activity's Update or Query waits for a Workflow task of its own Task Queue, which only a polling Worker
 * takes and a draining Worker no longer polls. Every population Activity therefore settles as cancelled once its
 * Worker cancels it, which a shutting-down Worker does at once (`shutdownGraceTime` defaults to 0), and abandons its
 * unanswered call: the native connection takes no abort signal
 * (`@temporalio/worker` 1.21.0 `NativeConnection.sendRequest`), so, as after a Worker crash, the abandoned call may
 * still take effect and the Activity's retry repeats it.
 */
function settlingOnCancellation(activities: PopulationActivities): PopulationActivities {
  const settling = <Request, Result>(activity: (request: Request) => Promise<Result>) =>
    (request: Request): Promise<Result> => Promise.race([activity(request), Context.current().cancelled]);
  return {
    scanPopulation: settling(activities.scanPopulation),
    deliverPopulation: settling(activities.deliverPopulation),
    startPopulation: settling(activities.startPopulation),
    readPopulationIntents: settling(activities.readPopulationIntents),
    settlePopulationEmit: settling(activities.settlePopulationEmit),
    registerPopulation: settling(activities.registerPopulation),
    emitPopulation: settling(activities.emitPopulation),
    startDeployment: settling(activities.startDeployment),
    fireTimerStart: settling(activities.fireTimerStart),
  };
}

export function createPopulationActivities(): PopulationActivities {
  return settlingOnCancellation({
    scanPopulation: async (request) => scan(Context.current().client, request.population, request.action),
    deliverPopulation: async (request) => {
      const { client } = Context.current();
      const delivery = { deliveryId: request.deliveryId, delivery: request.delivery };
      const outcome = await unlessGone(() => client.workflow.getHandle(request.workflowId)
        .executeUpdate(populationDeliverUpdate, { args: [delivery], updateId: request.deliveryId }));
      return outcome ?? { kind: "gone" };
    },
    startPopulation: async (request) => {
      const { client, info } = Context.current();
      const program: JsonValue = await client.workflow
        .getHandle(deploymentWorkflowId(request.population, request.deploymentId)).query(deploymentProgramQuery);
      const workflowId = processInstanceWorkflowId(request.population, request.instanceId);
      const start = new WithStartWorkflowOperation<(args: RunProcessArgs) => Promise<ProcessResult>>(workflowType, {
        workflowId,
        taskQueue: info.taskQueue,
        workflowIdConflictPolicy: "USE_EXISTING",
        workflowIdReusePolicy: "REJECT_DUPLICATE",
        args: [{
          kind: RunKind.PopulationStart, program, config: request.config,
          population: { population: request.population, deploymentId: request.deploymentId }, request: request.request,
        }],
      });
      try {
        return await client.workflow.executeUpdateWithStart(populationStartedUpdate, { startWorkflowOperation: start });
      } catch (error) {
        // The instance identity started once and its chain has closed: its recorded start answers again, and a closed
        // chain no population start made holds the identity as a running one does.
        if (!(error instanceof WorkflowExecutionAlreadyStartedError)) throw error;
        const recorded: ReachOutcome | null = await client.workflow.getHandle(workflowId)
          .query(populationStartOutcomeQuery);
        return recorded ?? { kind: "identityInUse" };
      }
    },
    readPopulationIntents: async (request) => {
      const { client } = Context.current();
      return unlessGone(() => client.workflow.getHandle(request.workflowId).query(pendingIntentsQuery, request.commandId));
    },
    settlePopulationEmit: async (request) => {
      const { client } = Context.current();
      await unlessGone(() => client.workflow.getHandle(request.workflowId)
        .executeUpdate(emitSettledUpdate, { args: [request.commandId] }));
    },
    registerPopulation: async (request) => ingress(Context.current().client, request.population)
      .executeUpdate(populationRegisterUpdate, { args: [request.registration] }),
    emitPopulation: async (request) => {
      await ingress(Context.current().client, request.population)
        .executeUpdate(populationEmitUpdate, { args: [request.reference], updateId: emitUpdateId(request.reference) });
    },
    startDeployment: async (request) => {
      const { client, info } = Context.current();
      const args: DeploymentArgs = {
        population: request.population, deploymentId: request.deploymentId, program: request.program,
      };
      try {
        await client.workflow.start<(args: DeploymentArgs) => Promise<void>>(deploymentWorkflowType, {
          workflowId: deploymentWorkflowId(request.population, request.deploymentId), taskQueue: info.taskQueue,
          workflowIdConflictPolicy: "USE_EXISTING", args: [args],
        });
      } catch (error) {
        if (!(error instanceof WorkflowExecutionAlreadyStartedError)) throw error;
      }
    },
    fireTimerStart: async (request) => {
      const { client, info } = Context.current();
      const population = new PopulationClient(client, info.taskQueue, request.population, request.config);
      try {
        return await population.command("timerStart", {
          commandId: request.commandId, deploymentId: request.deploymentId, startEvent: request.startEvent, dueMs: request.dueMs,
        });
      } catch (error) {
        // A full queue drains, so its refusal is retried; any other refusal before acceptance answers every retry alike.
        if (error instanceof PopulationRefused && error.code !== queueFullCode) {
          throw ApplicationFailure.nonRetryable(error.code, "PopulationRefused");
        }
        throw error;
      }
    },
  });
}
