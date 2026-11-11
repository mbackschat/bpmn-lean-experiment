/**
 * The population ingress Workflow and the deployment Workflow ([population ingress](../../../docs/kernel/ARCHITECTURE-SPEC.md#population-ingress)).
 *
 * The ingress takes deployments, chain registrations, population commands and emitted hand-offs as Updates and runs the
 * driver of `population.ts` from its main loop, one action at a time, each through one Activity. Its handlers change
 * only ingress state and never wait on a chain or on the main loop, except a command's handler, which waits for its own
 * answer; so the only wait edges run from a chain to an ingress handler and from the main loop to a chain's population
 * handler, and the wait graph is acyclic. A deployment's registration is serialized with every other: it takes the next
 * ordinal, starts the deployment's Workflow and only then becomes visible to commands.
 *
 * When its history suggests Continue-As-New the ingress releases every waiting command handler with `pending` (the
 * caller reads the answer from `populationResult`), waits for the handlers to finish and carries its state, the item in
 * flight included: it may continue between two receivers of one fan-out.
 *
 * The deployment Workflow holds one registered deployment's program, never steps, and answers Queries over it.
 */
import {
  ApplicationFailure,
  allHandlersFinished,
  condition,
  continueAsNew,
  proxyActivities,
  setHandler,
  workflowInfo,
} from "@temporalio/workflow";

import type {
  Answer,
  CommandAnswer,
  DeploymentAnswer,
  DeploymentArgs,
  IngressState,
  PopulationActivities,
  PopulationIngressArgs,
} from "./population-contract.js";
import {
  advance,
  answer,
  configurationConflict,
  deploymentOf,
  emptyIngress,
  enqueueCommand,
  enqueueEmit,
  populationCapacity,
  populationResult,
  queueFullCode,
  register,
  registerDeployment,
  releaseHandlers,
  takeAnswer,
  type Action,
} from "./population.js";
import type { JsonValue, KernelPort, PopulationPort } from "./port.js";
import {
  deploymentConditionalStartsQuery,
  deploymentMessageStartsQuery,
  deploymentProgramQuery,
  deploymentSignalStartsQuery,
  populationCommandUpdate,
  populationEmitUpdate,
  populationRegisterUpdate,
  populationBacklogQuery,
  populationDeploymentQuery,
  populationResultQuery,
  registerDeploymentUpdate,
  rejectionType,
} from "./protocol.js";

/** Transport retries only: an Activity's answer is a routing fact; its transport failure never is one. */
const activities = proxyActivities<PopulationActivities>({
  startToCloseTimeout: "1m",
  retry: { initialInterval: "1s", backoffCoefficient: 2, maximumInterval: "1m" },
});

function rejection(code: string): ApplicationFailure {
  return ApplicationFailure.create({ message: code, type: rejectionType, nonRetryable: true });
}

async function perform(population: PopulationIngressArgs, action: Action): Promise<Answer> {
  switch (action.kind) {
    case "readIntents": {
      const held = await activities.readPopulationIntents({ workflowId: action.workflowId, commandId: action.commandId });
      return held === null ? { kind: "intents", instanceId: null, intents: [] } : { kind: "intents", ...held };
    }
    case "settleEmit":
      await activities.settlePopulationEmit({ workflowId: action.workflowId, commandId: action.commandId });
      return { kind: "settled" };
    case "scanSignal":
    case "scanMessage":
    case "scanMessageStarts":
    case "scanConditionalStarts":
      return activities.scanPopulation({ population: population.population, action });
    case "deliver":
      return { kind: "reached", outcome: await activities.deliverPopulation(action) };
    case "start":
      return {
        kind: "reached",
        outcome: await activities.startPopulation({
          population: population.population, config: population.config, deploymentId: action.deploymentId,
          instanceId: action.instanceId, request: action.request,
        }),
      };
  }
}

export function createRunPopulationIngress<P, S, I>(
  kernel: KernelPort<P, S, I>,
  port: PopulationPort<P, S>,
): (args: PopulationIngressArgs) => Promise<void> {
  return (args) => hostIngress(kernel, port, args);
}

async function hostIngress<P, S, I>(kernel: KernelPort<P, S, I>, port: PopulationPort<P, S>, args: PopulationIngressArgs): Promise<void> {
  let state: IngressState = args.carried ?? emptyIngress;
  let rolling = false;
  /** Serializes registrations: each takes its ordinal and starts its Workflow before the next is considered. */
  let registering: Promise<unknown> = Promise.resolve();

  setHandler(populationResultQuery, (commandId) => populationResult(state, commandId));
  setHandler(populationDeploymentQuery, (deploymentRequestId) => deploymentOf(state, deploymentRequestId));
  setHandler(populationBacklogQuery, () => state.queue.length + (state.current === null ? 0 : 1));

  setHandler(registerDeploymentUpdate, (request) => {
    const turn = registering.then(async (): Promise<DeploymentAnswer> => {
      const program = kernel.decodeProgram(request.program);
      const refusal = kernel.admit(program);
      const candidate = refusal === null ? { summary: port.deploymentSummary(program) } : { refused: refusal };
      // One instant for both evaluations: Workflow time advances across the Activity's await, and the answer's
      // `deployedAtMs` must be the one the registry records and `deployment` reports.
      const atMs = Date.now();
      const [next, deployed] = registerDeployment(port, state, request.deploymentRequestId, request.digest, candidate, atMs);
      if (next === state) return deployed;
      if ("deploymentId" in deployed) {
        await activities.startDeployment({ population: args.population, deploymentId: deployed.deploymentId, program: request.program });
      }
      // Only registrations change the deployment ordinal, and they are serialized here, so the ordinal is still free.
      const [registered] = registerDeployment(port, state, request.deploymentRequestId, request.digest, candidate, atMs);
      state = registered;
      return deployed;
    });
    registering = turn.catch(() => undefined);
    return turn;
  }, {
    validator: (request) => {
      const conflict = configurationConflict(args.config, request.config);
      if (conflict !== null) throw rejection(conflict);
      try {
        kernel.decodeProgram(request.program);
      } catch (error) {
        throw rejection(`malformed-program: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  });

  setHandler(populationRegisterUpdate, (registration) => {
    const [next, refused] = register(state, registration);
    state = next;
    return refused;
  });

  setHandler(populationEmitUpdate, (reference) => {
    state = enqueueEmit(state, reference);
  });

  setHandler(populationCommandUpdate, async (request) => {
    const [next, ticket] = enqueueCommand(state, request.commandId, request.kind, request.command, request.digest);
    if (ticket === null) throw rejection(queueFullCode);
    state = next;
    await condition(() => rolling || state.answers.some(([held]) => held === ticket));
    const taken = takeAnswer(state, ticket);
    if (taken === null) return { kind: "pending" };
    state = taken[0];
    return { kind: "answered", answer: taken[1] as unknown as CommandAnswer };
  }, {
    validator: (request) => {
      const conflict = configurationConflict(args.config, request.config);
      if (conflict !== null) throw rejection(conflict);
      try {
        port.decodeCommand(request.kind, request.command);
      } catch (error) {
        throw rejection(`malformed-command: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (state.queue.filter((item) => item.kind === "command").length >= populationCapacity.queue) throw rejection(queueFullCode);
    },
  });

  // A Run rolls over by the override only after one action, so an override below a fresh Run's history still progresses.
  let acted = false;
  const rolloverDue = (): boolean => workflowInfo().continueAsNewSuggested ||
    (acted && args.rolloverEvents !== null && workflowInfo().historyLength >= args.rolloverEvents);
  for (;;) {
    if (rolloverDue()) {
      rolling = true;
      await registering;
      await condition(allHandlersFinished);
      // The released handlers' commands answer through the ledger, which `populationResult` reads.
      return continueAsNew<(next: PopulationIngressArgs) => Promise<void>>({ ...args, carried: releaseHandlers(state) });
    }
    const [next, action] = advance(port, state, Date.now());
    state = next;
    if (action === null) {
      await condition(() => state.queue.length > 0 || rolloverDue());
      continue;
    }
    const answered = await perform(args, action);
    state = answer(port, state, answered);
    acted = true;
  }
}

export function createRunDeployment<P, S, I>(
  kernel: KernelPort<P, S, I>,
  port: PopulationPort<P, S>,
): (args: DeploymentArgs) => Promise<void> {
  return async (args) => {
    const program = kernel.decodeProgram(args.program);
    setHandler(deploymentProgramQuery, (): JsonValue => args.program);
    setHandler(deploymentSignalStartsQuery, (address, variables) => ({
      receivers: port.signalStartReceivers(program, args.deploymentId, address, variables),
      refusesVariables: port.refusesSignalVariables(program),
    }));
    setHandler(deploymentMessageStartsQuery, (message) => port.messageStartCandidates(program, message));
    setHandler(deploymentConditionalStartsQuery, () => port.conditionalStarts(program));
    // A deployment is held for good: it answers Queries and never receives an Update, so its history stays one task.
    await condition(() => false);
  };
}
