/**
 * An in-process population: the ingress driver (`population.ts`) over process chains and deployments held as kernel
 * values, each action answered directly instead of through Activities, Queries and Updates. The in-memory host and the
 * refinement test against the kernel's population runner use it; the Workflows answer the same actions over Temporal.
 * The chains live in the caller's store (`PopulationChains`), so a host that keeps its own chains shares them.
 *
 * Every receiver steps at the time the caller runs the driver at, the host's choice of receiver time
 * ([population ingress](../../../docs/kernel/ARCHITECTURE-SPEC.md#population-ingress)).
 */
import {
  advance,
  answer,
  emptyIngress,
  enqueueCommand,
  enqueueEmit,
  register,
  registerDeployment,
  takeAnswer,
  type Action,
  type Answer,
  type DeploymentAnswer,
  type IngressState,
} from "./population.js";
import type { HostView, JsonValue, PopulationPort, ReachOutcome, Wire } from "./port.js";

/** A process chain as the population reads it: the deployment it runs, its program and its committed state. */
export interface PopulationChain<P, S> {
  readonly deploymentId: number;
  readonly program: P;
  readonly state: S;
}

/**
 * Where the chains live. `set` is called only for a population input, a delivery or a start, which committed `state`
 * under the chain's input identifier `commandId`; a chain's own inputs are its holder's, reported through `committed`.
 */
export interface PopulationChains<P, S> {
  get(workflowId: string): PopulationChain<P, S> | undefined;
  set(workflowId: string, chain: PopulationChain<P, S>, commandId: string): void;
}

/** The kernel status name of a running instance (`Kernel.Publish.statusName`). */
const running = "running";

export class MemoryPopulation<P, S, M> {
  ingress: IngressState<M> = emptyIngress;
  readonly programs = new Map<number, P>();
  /** Each chain's registration revision, which orders its registrations as a chain's publication revision does. */
  private readonly revisions = new Map<string, number>();
  /** Each population start's outcome by its chain, which a repeated start of the identity answers again. */
  private readonly starts = new Map<string, ReachOutcome>();
  /** The intents a committed chain input left, until the ingress settles their emit. */
  private readonly unsettled = new Map<string, Readonly<{ instanceId: string; intents: readonly Wire[] }>>();

  constructor(
    private readonly port: PopulationPort<P, S, M>,
    private readonly hostView: (program: P, state: S) => HostView,
    /** The most receivers one command may reach: the host's capacity, or the kernel's bound to refine the kernel's run. */
    private readonly receivers: number,
    readonly chains: PopulationChains<P, S>,
    /** The Workflow ID of the chain a population start makes for an instance identity. */
    private readonly startedWorkflowId: (instanceId: string) => string = (instanceId) => instanceId,
  ) {}

  /** Register a deployment of `program`, or one admission refused with `refused`. */
  deploy(deploymentRequestId: string, digest: string, program: P | { readonly refused: string }, atMs: number): DeploymentAnswer {
    const candidate = typeof program === "object" && program !== null && "refused" in program
      ? program : { summary: this.port.deploymentSummary(program as P) };
    const [ingress, deployed] = registerDeployment(this.port, this.ingress, deploymentRequestId, digest, candidate, atMs);
    this.ingress = ingress;
    if ("deploymentId" in deployed && !("refused" in candidate)) this.programs.set(deployed.deploymentId, program as P);
    return deployed;
  }

  /**
   * A chain's own committed input `commandId` with its new `state`, which its holder stored: its registration follows
   * the state, and the Signals the input threw are handed to the ingress, which reaches them when the driver next runs.
   */
  committed(workflowId: string, deploymentId: number, program: P, state: S, commandId: string): void {
    this.settle(workflowId, deploymentId, program, state);
    const intents = this.port.intentsOf(program, state);
    if (intents.length === 0) return;
    this.unsettled.set(JSON.stringify([workflowId, commandId]), { instanceId: this.port.instanceIdOf(state), intents });
    this.ingress = enqueueEmit(this.ingress, { workflowId, commandId, count: intents.length, digest: "" });
  }

  /** Submit a population command; its answer once the driver ran it at `atMs`, `null` when the queue refused it. */
  command(commandId: string, kind: string, json: JsonValue, digest: string, atMs: number): JsonValue | null {
    const [ingress, ticket] = enqueueCommand(this.ingress, commandId, kind, json, digest);
    this.ingress = ingress;
    if (ticket === null) return null;
    this.run(atMs);
    const taken = takeAnswer(this.ingress, ticket);
    if (taken === null) throw new TypeError(`command ${commandId} did not settle`);
    this.ingress = taken[0];
    return taken[1];
  }

  /** Run the driver at `atMs` until nothing is queued or in flight. */
  run(atMs: number): void {
    for (;;) {
      const [state, action] = advance(this.port, this.ingress, atMs);
      this.ingress = state;
      if (action === null) break;
      this.ingress = answer(this.port, this.ingress, this.perform(action, atMs), this.receivers);
    }
  }

  private settle(workflowId: string, deploymentId: number, program: P, state: S): void {
    const revision = (this.revisions.get(workflowId) ?? 0) + 1;
    this.revisions.set(workflowId, revision);
    const view = this.hostView(program, state);
    const addresses = view.status === running ? view.addresses ?? [] : [];
    const [ingress, refused] = register(this.ingress, {
      workflowId, processInstanceId: this.port.instanceIdOf(state), deploymentId, revision, addresses,
    });
    if (refused !== null) throw new TypeError(`registration of ${workflowId} refused: ${refused}`);
    this.ingress = ingress;
  }

  private deployment(deploymentId: number): P {
    const program = this.programs.get(deploymentId);
    if (program === undefined) throw new TypeError(`deployment ${String(deploymentId)} holds no program`);
    return program;
  }

  private reached(workflowId: string, commandId: string, deploymentId: number, program: P,
    outcome: ReturnType<PopulationPort<P, S, M>["populationStart"]>): ReachOutcome {
    switch (outcome.kind) {
      case "passed":
      case "failed":
        return outcome;
      case "committed":
        this.chains.set(workflowId, { deploymentId, program, state: outcome.state }, commandId);
        this.settle(workflowId, deploymentId, program, outcome.state);
        return { kind: "committed", instanceId: this.port.instanceIdOf(outcome.state), intents: this.port.intentsOf(program, outcome.state) };
    }
  }

  private perform(action: Action, atMs: number): Answer {
    const port = this.port;
    switch (action.kind) {
      case "readIntents": {
        const held = this.unsettled.get(JSON.stringify([action.workflowId, action.commandId]));
        return held === undefined ? { kind: "intents", instanceId: null, intents: [] } : { kind: "intents", ...held };
      }
      case "settleEmit":
        this.unsettled.delete(JSON.stringify([action.workflowId, action.commandId]));
        return { kind: "settled" };
      case "scanSignal":
        return {
          kind: "signalScan",
          chains: action.chains.map((workflowId) => {
            const chain = this.chains.get(workflowId);
            return chain === undefined
              ? { workflowId, instanceId: null, receivers: [], refusesVariables: false }
              : {
                  workflowId, instanceId: port.instanceIdOf(chain.state), refusesVariables: port.refusesSignalVariables(chain.program),
                  receivers: port.signalReceivers(chain.program, chain.state, action.address, action.emitter),
                };
          }),
          starts: action.deployments.map((deploymentId) => {
            const program = this.deployment(deploymentId);
            return {
              deploymentId, refusesVariables: port.refusesSignalVariables(program),
              receivers: port.signalStartReceivers(program, deploymentId, action.address, action.variables),
            };
          }),
        };
      case "scanMessage":
        return {
          kind: "messageScan",
          chains: action.chains.flatMap((workflowId) => {
            const chain = this.chains.get(workflowId);
            return chain === undefined ? [] : [{ workflowId, scan: port.messageReceivers(chain.program, chain.state, action.publication) }];
          }),
        };
      case "scanMessageStarts":
        return {
          kind: "messageStarts",
          starts: action.deployments.map((deploymentId) =>
            ({ deploymentId, candidates: port.messageStartCandidates(this.deployment(deploymentId), action.message) })),
        };
      case "scanConditionalStarts":
        return {
          kind: "conditionalStarts",
          starts: action.deployments.map((deploymentId) => ({ deploymentId, startEvents: port.conditionalStarts(this.deployment(deploymentId)) })),
        };
      case "deliver": {
        const chain = this.chains.get(action.workflowId);
        if (chain === undefined) return { kind: "reached", outcome: { kind: "gone" } };
        const outcome = port.populationReach(chain.program, chain.state, action.delivery, atMs);
        return {
          kind: "reached",
          outcome: outcome.kind === "skipped" ? outcome
            : this.reached(action.workflowId, action.deliveryId, chain.deploymentId, chain.program, outcome),
        };
      }
      case "start": {
        const program = this.deployment(action.deploymentId);
        const workflowId = this.startedWorkflowId(action.instanceId);
        const recorded = this.starts.get(workflowId);
        if (recorded !== undefined) return { kind: "reached", outcome: recorded };
        if (this.chains.get(workflowId) !== undefined) return { kind: "reached", outcome: { kind: "identityInUse" } };
        const started = port.populationStart(program, action.request, atMs);
        const outcome = this.reached(workflowId, `population:${workflowId}`, action.deploymentId, program, started);
        this.starts.set(workflowId, outcome);
        return { kind: "reached", outcome };
      }
    }
  }
}
