/**
 * The population ingress Workflow and the deployment Workflow ([population ingress](../../../docs/kernel/ARCHITECTURE-SPEC.md#population-ingress)).
 *
 * The ingress takes deployments, chain registrations, population commands and emitted hand-offs as Updates and runs the
 * driver of `population.ts` from its main loop, one action at a time, each through one Activity. Its handlers change
 * only ingress state and never wait on a chain or on the main loop, except a command's handler, which waits for its own
 * answer; so the only wait edges run from a chain to an ingress handler and from the main loop to a chain's population
 * handler or wake handler, and the wait graph is acyclic. A deployment's registration is serialized with every other: it
 * takes the next ordinal, starts the deployment's Workflow and only then becomes visible to commands.
 *
 * An emit the ingress cannot hold is deferred, not refused: its reference waits in this Run's memory, in arrival order,
 * and the Run accepts it as soon as a settled item or a shrunk registration leaves room, then wakes its chain (`emitWake`
 * through `wakePopulationEmit`). The waiting references are never carried, since nothing bounds how many chains defer:
 * a Run that continues as new first hands them back (a `reoffer` wake), and while it does so its validators reject every
 * emit and registration, so a chain's Activity fails as transport does and its retry reaches the next Run. The capacity
 * wait itself is never a retry: a deferred chain waits for its wake.
 *
 * When its history suggests Continue-As-New the ingress releases every waiting command handler with `pending` (the
 * caller reads the answer from `populationResult`), waits for the handlers to finish and carries its state, the item in
 * flight included: it may continue between two receivers of one fan-out. Its argument stays within the continuation
 * bound: a deployment, registration, command or Timer start that would carry it past is refused with
 * `host.capacity.continuation`, an emit is deferred, the ledger yields its oldest answers first, and an item in flight
 * beyond the bound defers the rollover until it settles. Once the rollover measured the whole carry, the machine in flight
 * included, a command or deployment it takes must keep that whole carry within the bound (`rollingAdmits`).
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
  ChainRegistration,
  CommandAnswer,
  DeploymentAnswer,
  DeploymentArgs,
  EmitReference,
  IngressState,
  PopulationActivities,
  PopulationIngressArgs,
  WakeRequest,
} from "./population-contract.js";
import {
  admitWaiting,
  advance,
  answer,
  commandRefusal,
  configurationConflict,
  deploymentOf,
  emptyIngress,
  enqueueCommand,
  enqueueEmit,
  populationCapacity,
  populationResult,
  register,
  registerDeployment,
  registeredDeploymentIds,
  sameEmit,
  startedDeployment,
  takeAnswer,
  type Action,
  type Queued,
} from "./population.js";
import {
  IngressCapacityExceeded,
  carriedState,
  fittedIngress,
  ingressContinuationCode,
  releaseHandlers,
  resumedState,
  rollingAdmits,
} from "./population-carry.js";
import { CapacityBound, canonicalBytes, capacityCode, chainCapacity } from "./capacity.js";
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
  populationDeploymentsQuery,
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

/**
 * The failure of an emit or registration that reached a Run continuing as new: a transport failure its chain's Activity
 * retries until the next Run takes it.
 */
function rollingOver(): ApplicationFailure {
  return ApplicationFailure.create({ message: "the population ingress is continuing as new", type: "PopulationIngressRollingOver" });
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

export function createRunPopulationIngress<P, S, I, M>(
  kernel: KernelPort<P, S, I>,
  port: PopulationPort<P, S, M>,
): (args: PopulationIngressArgs) => Promise<void> {
  return (args) => hostIngress(kernel, port, args);
}

async function hostIngress<P, S, I, M>(kernel: KernelPort<P, S, I>, port: PopulationPort<P, S, M>, args: PopulationIngressArgs): Promise<void> {
  let state: IngressState<M> = args.carried === null ? emptyIngress : resumedState(port, args.carried);
  const frame = {
    population: args.population, config: args.config, rolloverEvents: args.rolloverEvents,
    continuationBytes: chainCapacity.continuationBytes, queryBytes: chainCapacity.queryBytes,
  };
  let rolling = false;
  /** Serializes registrations: each takes its ordinal and starts its Workflow before the next is considered. */
  let registering: Promise<unknown> = Promise.resolve();
  /** This Run's deferred hand-offs, in arrival order; never carried (see the module comment). */
  let waiting: readonly EmitReference[] = [];
  /** The wakes owed to chains, which the main loop sends before its next action. */
  let wakes: readonly WakeRequest[] = [];
  /** Accepts the waiting hand-offs that now fit, in order, and owes each chain its wake. */
  const admitNow = (): void => {
    if (waiting.length === 0) return;
    const admitted = admitWaiting(frame, state, waiting);
    state = admitted.state;
    waiting = admitted.waiting;
    wakes = [...wakes, ...admitted.taken.map((reference): WakeRequest =>
      ({ workflowId: reference.workflowId, wake: { kind: "accepted", commandId: reference.commandId } }))];
  };
  /** Sends every wake owed; each wake handler only marks the chain's emit, so this waits on no chain's main loop. */
  const sendWakes = async (): Promise<void> => {
    const sending = wakes;
    wakes = [];
    await Promise.all(sending.map((request) => activities.wakePopulationEmit(request)));
  };

  setHandler(populationResultQuery, (commandId) => populationResult(state, commandId));
  setHandler(populationDeploymentQuery, (deploymentRequestId) => deploymentOf(state, deploymentRequestId));
  setHandler(populationDeploymentsQuery, () => registeredDeploymentIds(state));
  setHandler(populationBacklogQuery, () => state.queue.length + (state.current === null ? 0 : 1) + waiting.length);
  /** Whether the ingress may take `candidate` now: while it continues as new, only if it can still carry it whole. */
  const admits = (candidate: IngressState<M>): boolean => !rolling || rollingAdmits(port, frame, candidate);

  setHandler(registerDeploymentUpdate, (request) => {
    const turn = registering.then(async (): Promise<DeploymentAnswer> => {
      const program = kernel.decodeProgram(request.program);
      const refusal = kernel.admit(program);
      const candidate = refusal === null
        ? { summary: port.deploymentSummary(program), identifierBytes: port.identifierBytes(program) } : { refused: refusal };
      // One instant for both evaluations: Workflow time advances across the Activity's await, and the answer's
      // `deployedAtMs` must be the one the registry records and `deployment` reports.
      const atMs = Date.now();
      const [next, deployed] = registerDeployment(port, frame, state, request.deploymentRequestId, request.digest, candidate, atMs);
      if (next === state) return deployed;
      if (!admits(next)) return { refused: ingressContinuationCode };
      if (!("deploymentId" in deployed)) {
        state = next;
        return deployed;
      }
      await activities.startDeployment({ population: args.population, deploymentId: deployed.deploymentId, program: request.program });
      // Only registrations change the deployment ordinal, and they are serialized here, so the ordinal is still the one
      // the Workflow started under; the room it needs may not be.
      const [registered, answer] = startedDeployment(port, frame, state, request.deploymentRequestId, request.digest, candidate,
        atMs, deployed.deploymentId, admits);
      state = registered;
      return answer;
    });
    registering = turn.catch(() => undefined);
    return turn;
  }, {
    validator: (request) => {
      const conflict = configurationConflict(args.config, request.config);
      if (conflict !== null) throw rejection(conflict);
      if (canonicalBytes(request.program) > chainCapacity.programBytes) throw rejection(capacityCode(CapacityBound.Program));
      try {
        kernel.decodeProgram(request.program);
      } catch (error) {
        throw rejection(`malformed-program: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  });

  setHandler(populationRegisterUpdate, (registration) => {
    const [next, refused] = register(frame, state, registration);
    state = next;
    // A registration that shrank or left frees room.
    admitNow();
    return refused;
  }, {
    // A registration may grow the carry the rollover measured; its chain's Activity retries into the next Run.
    validator: (_registration: ChainRegistration) => {
      if (rolling) throw rollingOver();
    },
  });

  setHandler(populationEmitUpdate, (reference) => {
    const offered = enqueueEmit(frame, state, reference, waiting);
    if ("state" in offered) {
      state = offered.state;
      return { kind: "accepted" } as const;
    }
    if (!waiting.some((held) => sameEmit(held, reference))) waiting = [...waiting, reference];
    return { kind: "deferred", run: workflowInfo().runId } as const;
  }, {
    validator: (_reference: EmitReference) => {
      if (rolling) throw rollingOver();
    },
  });

  setHandler(populationCommandUpdate, async (request) => {
    const enqueued = enqueueCommand(frame, state, request.commandId, request.kind, request.command, request.digest, waiting);
    if ("refused" in enqueued) throw rejection(enqueued.refused);
    // Its caller does not retry, so a command the rolling Run could not carry is refused, not deferred to the next Run.
    if (!admits(enqueued.state)) throw rejection(ingressContinuationCode);
    const { ticket } = enqueued;
    state = enqueued.state;
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
      const refused = commandRefusal(state, request.command);
      if (refused !== null) throw rejection(refused);
    },
  });

  // A Run rolls over by the override only after one action, so an override below a fresh Run's history still progresses.
  let acted = false;
  const rolloverDue = (): boolean => workflowInfo().continueAsNewSuggested ||
    (acted && args.rolloverEvents !== null && workflowInfo().historyLength >= args.rolloverEvents);
  /** The item in flight the ingress could not carry, measured once: its fan-out only grows until it settles. */
  let unfit: Queued | null = null;
  const carriable = (): boolean => {
    if (state.current === null) return true;
    if (state.current.item === unfit) return false;
    if (fittedIngress(port, frame, state) !== null) return true;
    unfit = state.current.item;
    return false;
  };
  /**
   * A driver step, whose settled item the ingress could not carry even with an empty ledger, fails the ingress closed:
   * admission makes that unreachable from admitted inputs, so it marks a broken invariant, never a capacity outcome.
   */
  const closed = <T>(step: () => T): T => {
    try {
      return step();
    } catch (error) {
      if (error instanceof IngressCapacityExceeded) throw ApplicationFailure.create({ message: ingressContinuationCode, nonRetryable: true });
      throw error;
    }
  };
  for (;;) {
    // An item in flight that the ingress could not carry holds the rollover until it settles; with none, nothing left
    // could shrink the state, which admission should have made impossible, so the ingress fails closed.
    if (rolloverDue() && carriable()) {
      rolling = true;
      // Hands the waiting emits back before the Run ends; no emit is deferred again while it rolls (the validator).
      wakes = [...wakes, ...waiting.map((reference): WakeRequest =>
        ({ workflowId: reference.workflowId, wake: { kind: "reoffer", run: workflowInfo().runId } }))];
      waiting = [];
      await sendWakes();
      await registering;
      await condition(allHandlersFinished);
      const fitted = fittedIngress(port, frame, releaseHandlers(state));
      if (fitted === null) throw ApplicationFailure.create({ message: ingressContinuationCode, nonRetryable: true });
      // The released handlers' commands answer through the ledger, which `populationResult` reads.
      return continueAsNew<(next: PopulationIngressArgs) => Promise<void>>({ ...args, carried: carriedState(port, fitted) });
    }
    await sendWakes();
    const [next, action] = closed(() => advance(port, frame, state, Date.now()));
    state = next;
    admitNow();
    if (action === null) {
      await condition(() => state.queue.length > 0 || wakes.length > 0 || rolloverDue());
      continue;
    }
    const answered = await perform(args, action);
    state = closed(() => answer(port, frame, state, answered, populationCapacity.receivers));
    admitNow();
    acted = true;
  }
}

export function createRunDeployment<P, S, I, M>(
  kernel: KernelPort<P, S, I>,
  port: PopulationPort<P, S, M>,
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
