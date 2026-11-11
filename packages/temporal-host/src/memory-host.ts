/**
 * An in-process `ProcessHost` for tests of the host's clients: each chain is one kernel state applied through the same
 * pure core the Workflow uses (`applyInput`, the publication log, the host clock rule), with no Temporal server.
 *
 * It realizes only what a client observes: start verdicts under a Workflow ID used once, Update verdicts (a rejection
 * carries no revision, as a refused Update never enters history), queries, populations run by the same driver as the
 * population ingress Workflow (`population-memory.ts`) over the host's own chains, and the retained description. A
 * population runs its driver at the host clock as soon as a command or a chain's committed input gives it work, so a
 * thrown Signal reaches its receivers before the input's caller resumes. It drives no timers or Activities; a test that
 * needs them uses the hosted witnesses.
 */
import { canonicalJson } from "./canonical-json.js";
import {
  Scheduling,
  workflowType,
  type CommandResult,
  type HostConfig,
  type HostSnapshot,
  snapshotView,
  workflowClosed,
} from "./host-contract.js";
import { applyInput, assertNever, clockStimulus, hostOwnsLogicalTime } from "./host-machine.js";
import { kernelPort } from "./kernel-port.js";
import { populationCommandDigest, processInstanceWorkflowId } from "./population-address.js";
import {
  PopulationRefused,
  type CommandAnswer,
  type DeploymentAnswer,
  type PopulationResult,
  type PopulationScope,
} from "./population-contract.js";
import { MemoryPopulation, type PopulationChain, type PopulationChains } from "./population-memory.js";
import { populationPort } from "./population-port.js";
import { configurationConflict, deploymentOf, populationCapacity, populationResult, queueFullCode } from "./population.js";

export { MemoryPopulation, type PopulationChain, type PopulationChains } from "./population-memory.js";
export { populationPort } from "./population-port.js";
import { Route, type HostView, type JsonValue, type KernelPort, type PopulationPort } from "./port.js";
import { appendJournal, initialCursor, openLog, readPage, type PublicationLog, type PublicationPage } from "./publication.js";
import type { PopulationHost, ProcessDescription, ProcessHost, StartRequest } from "./process-port.js";

/** The kernel's status name for an instance that has not ended (`Kernel.Publish.statusName`). */
const running = "running";

interface Chain<P, S> {
  readonly program: P;
  readonly config: HostConfig;
  readonly population: PopulationScope | null;
  readonly memo: Readonly<Record<string, JsonValue>> | null;
  instance: { readonly state: S; readonly view: HostView } | null;
  log: PublicationLog;
}

export interface MemoryProcessHostOptions {
  readonly taskQueue: string;
  /** Workflow time in epoch milliseconds, stamped on inputs under durable scheduling. */
  readonly now?: () => number;
}

/** A `ProcessHost` whose test can also deliver what the Workflow itself would: a due timer or an effect's result. */
export interface MemoryProcessHost extends ProcessHost {
  /** Applies a `timerFire` or `effectResult` stimulus as the host's own arrival, at the host clock under durable scheduling. */
  arrive(workflowId: string, stimulus: JsonValue): Promise<CommandResult>;
  /** The chain's encoded kernel state, `null` before a committed start, as the Workflow's `state` query answers it. */
  state(workflowId: string): Promise<JsonValue>;
  /** The population `name` over this host's chains, whose chains run under `config`. */
  population(name: string, config: HostConfig): PopulationHost;
}

export class UnknownWorkflow extends Error {
  override readonly name = "UnknownWorkflow";
}

class MemoryHost<P, S, I, M> implements MemoryProcessHost {
  readonly #chains = new Map<string, Chain<P, S>>();
  readonly #populations = new Map<string, { readonly config: HostConfig; readonly driver: MemoryPopulation<P, S, M> }>();

  constructor(
    private readonly port: KernelPort<P, S, I>,
    private readonly populationPort: PopulationPort<P, S, M>,
    private readonly taskQueue: string,
    private readonly now: () => number,
  ) {}

  async start(request: StartRequest): Promise<CommandResult> {
    if (this.#chains.has(request.workflowId)) return { outcome: "rejected", code: "workflow-already-started", revision: null };
    const program = this.port.decodeProgram(request.program);
    const chain: Chain<P, S> = {
      program,
      config: request.config,
      population: request.population ?? null,
      memo: request.memo ?? null,
      instance: null,
      log: openLog(initialCursor),
    };
    this.#chains.set(request.workflowId, chain);
    const refusal = this.port.admit(program);
    if (refusal !== null) return { outcome: "unsupported", code: refusal, revision: null };
    const started = this.#apply(request.workflowId, chain, request.start, Route.Start);
    return started.outcome === "committed" ? started : { ...started, revision: null };
  }

  command(workflowId: string, stimulus: JsonValue): Promise<CommandResult> {
    return this.#submit(workflowId, stimulus, Route.Command);
  }

  deliver(workflowId: string, stimulus: JsonValue): Promise<CommandResult> {
    return this.#submit(workflowId, stimulus, Route.Deliver);
  }

  async arrive(workflowId: string, stimulus: JsonValue): Promise<CommandResult> {
    const chain = this.#chains.get(workflowId);
    if (chain === undefined || !this.#running(chain)) return { outcome: "rejected", code: workflowClosed, revision: null };
    const route = this.port.route(this.port.decodeStimulus(stimulus).input);
    switch (route) {
      case Route.TimerFire:
      case Route.EffectResult:
        return this.#apply(workflowId, chain, stimulus, route);
      case Route.Start:
      case Route.Command:
      case Route.Deliver:
        throw new TypeError(`a ${route} stimulus is a client's input, not a host arrival`);
    }
    return assertNever(route);
  }

  population(name: string, config: HostConfig): PopulationHost {
    const driver = (): MemoryPopulation<P, S, M> => {
      const held = this.#population(name, config);
      const conflict = configurationConflict(held.config, config);
      if (conflict !== null) throw new PopulationRefused(conflict);
      return held.driver;
    };
    return {
      population: name,
      registerDeployment: async (request) => {
        const population = driver();
        const program = this.port.decodeProgram(request.program);
        const refusal = this.port.admit(program);
        return population.deploy(request.deploymentRequestId, request.digest, refusal === null ? program : { refused: refusal },
          this.now());
      },
      deployment: async (deploymentRequestId): Promise<DeploymentAnswer | null> =>
        deploymentOf(driver().ingress, deploymentRequestId),
      command: async (kind, command): Promise<CommandAnswer> => {
        const population = driver();
        try {
          this.populationPort.decodeCommand(kind, command);
        } catch (error) {
          // The ingress's validator: a command the kernel's codec cannot read is refused before acceptance.
          throw new PopulationRefused(`malformed-command: ${error instanceof Error ? error.message : String(error)}`);
        }
        const answer = population.command(command.commandId, kind, command, populationCommandDigest(kind, command), this.now());
        if (answer === null) throw new PopulationRefused(queueFullCode);
        return answer as unknown as CommandAnswer;
      },
      result: async (commandId) => populationResult(driver().ingress, commandId) as unknown as PopulationResult,
    };
  }

  async observation(workflowId: string): Promise<JsonValue> {
    const chain = this.#chain(workflowId);
    return chain.instance === null ? null : this.port.observation(chain.program, chain.instance.state);
  }

  async state(workflowId: string): Promise<JsonValue> {
    const chain = this.#chain(workflowId);
    return chain.instance === null ? null : this.port.encodeState(chain.instance.state);
  }

  async hostView(workflowId: string): Promise<HostSnapshot> {
    const chain = this.#chain(workflowId);
    return { revision: chain.log.cursor.revision, view: chain.instance === null ? null : snapshotView(chain.instance.view), halt: null, registering: false };
  }

  async publication(workflowId: string, afterRevision: number, limit = 100): Promise<PublicationPage> {
    return readPage(this.#chain(workflowId).log, afterRevision, limit);
  }

  async describe(workflowId: string): Promise<ProcessDescription | null> {
    const chain = this.#chains.get(workflowId);
    if (chain === undefined) return null;
    return { workflowId, workflowType, taskQueue: this.taskQueue, running: this.#running(chain), memo: chain.memo };
  }

  #chain(workflowId: string): Chain<P, S> {
    const chain = this.#chains.get(workflowId);
    if (chain === undefined) throw new UnknownWorkflow(workflowId);
    return chain;
  }

  #running(chain: Chain<P, S>): boolean {
    return chain.instance !== null && chain.instance.view.status === running;
  }

  /** The population `name`, made on first use with `config`, the configuration of the chains it starts. */
  #population(name: string, config: HostConfig): { readonly config: HostConfig; readonly driver: MemoryPopulation<P, S, M> } {
    const held = this.#populations.get(name);
    if (held !== undefined) return held;
    const made = {
      config: JSON.parse(canonicalJson(config)) as HostConfig,
      driver: new MemoryPopulation(this.populationPort, this.port.hostView, populationCapacity.receivers, this.#store(name, config),
        (instanceId) => processInstanceWorkflowId(name, instanceId)),
    };
    this.#populations.set(name, made);
    return made;
  }

  /** The chains of population `name`, as its driver reads them; a population start makes a chain under `config`. */
  #store(name: string, config: HostConfig): PopulationChains<P, S> {
    return {
      get: (workflowId) => {
        const chain = this.#chains.get(workflowId);
        if (chain === undefined || chain.instance === null || chain.population?.population !== name) return undefined;
        return { deploymentId: chain.population.deploymentId, program: chain.program, state: chain.instance.state };
      },
      set: (workflowId, entry: PopulationChain<P, S>, commandId) => {
        const chain = this.#chains.get(workflowId) ?? {
          program: entry.program, config, population: { population: name, deploymentId: entry.deploymentId }, memo: null,
          instance: null, log: openLog(initialCursor),
        };
        this.#chains.set(workflowId, chain);
        this.#commit(chain, commandId, entry.state);
      },
    };
  }

  async #submit(workflowId: string, stimulus: JsonValue, route: Route): Promise<CommandResult> {
    const chain = this.#chains.get(workflowId);
    if (chain === undefined || !this.#running(chain)) return { outcome: "rejected", code: workflowClosed, revision: null };
    return this.#apply(workflowId, chain, stimulus, route);
  }

  #commit(chain: Chain<P, S>, commandId: string, state: S): void {
    const view = this.port.hostView(chain.program, state);
    chain.instance = { state, view };
    chain.log = appendJournal(chain.log, commandId, view.journal);
  }

  /** One of the chain's own inputs; under a population, its registration and thrown Signals go to the population. */
  #apply(workflowId: string, chain: Chain<P, S>, stimulus: JsonValue, route: Route): CommandResult {
    const clocked = chain.config.scheduling === Scheduling.Durable ? clockStimulus(stimulus, this.now()) : stimulus;
    if (clocked === null) return { outcome: "rejected", code: hostOwnsLogicalTime, revision: null };
    const { commandId, input } = this.port.decodeStimulus(clocked);
    if (this.port.route(input) !== route) return { outcome: "rejected", code: "wrong-update", revision: null };
    const applied = applyInput(this.port, chain.program, chain.instance?.state ?? null, input);
    if (!applied.committed) {
      return { outcome: applied.outcome, code: applied.code, revision: applied.rejected ? null : chain.log.cursor.revision };
    }
    this.#commit(chain, commandId, applied.state);
    const revision = chain.log.cursor.revision;
    const scope = chain.population;
    if (scope !== null) {
      const population = this.#population(scope.population, chain.config).driver;
      population.committed(workflowId, scope.deploymentId, chain.program, applied.state, commandId);
      population.run(this.now());
    }
    return { outcome: "committed", code: null, revision };
  }
}

/** A `ProcessHost` bound to the TypeScript kernel. */
export function createMemoryProcessHost(options: MemoryProcessHostOptions): MemoryProcessHost {
  return new MemoryHost(kernelPort, populationPort, options.taskQueue, options.now ?? Date.now);
}
