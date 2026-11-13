/**
 * An in-process `ProcessHost` for tests of the host's clients: each chain is one kernel state applied through the same
 * pure core the Workflow uses (`applyInput`, the publication log, the host clock rule), with no Temporal server.
 *
 * It realizes only what a client observes: start verdicts under a Workflow ID used once, Update verdicts (a rejection
 * carries no revision, as a refused Update never enters history), queries, populations run by the same driver as the
 * population ingress Workflow (`population-memory.ts`) over the host's own chains, and the retained description. It
 * judges every candidate against the same capacity bounds (`chain-candidate.ts`) and halts a chain as the Workflow does
 * when a host arrival or a registration is refused; it keeps no delivery ledger, so it measures no ledger entry. A
 * population runs its driver at the host clock as soon as a command or a chain's committed input gives it work, so a
 * thrown Signal reaches its receivers before the input's caller resumes, unless the ingress deferred its hand-off: the
 * chain then carries it, as the Workflow does, and it is delivered once a later input frees room. The caller resumes
 * without waiting for that acceptance, where the Workflow's Update waits. It drives no timers or Activities; a test that
 * needs them uses the hosted witnesses.
 */
import { canonicalJson } from "./canonical-json.js";
import { CapacityBound, canonicalBytes, capacityCode, chainCapacity } from "./capacity.js";
import { judgeCommitted, type ChainFrame, type Judged } from "./chain-candidate.js";
import {
  Scheduling,
  workflowType,
  type CommandResult,
  type Halt,
  type HostConfig,
  type HostSnapshot,
  snapshotView,
  workflowClosed,
  workflowUnknown,
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
  type RegisteredDeployment,
} from "./population-contract.js";
import { MemoryPopulation, type PopulationChain, type PopulationChains } from "./population-memory.js";
import { populationPort } from "./population-port.js";
import {
  configurationConflict,
  deploymentOf,
  populationCapacity,
  populationResult,
  registeredDeploymentIds,
} from "./population.js";

export { MemoryPopulation, heldChains, type PopulationChain, type PopulationChains } from "./population-memory.js";
export { populationPort } from "./population-port.js";
import { Route, type HostView, type JsonValue, type KernelPort, type PopulationPort } from "./port.js";
import { initialCursor, openLog, readPage, type PublicationLog, type PublicationPage } from "./publication.js";
import type { PopulationHost, ProcessDescription, ProcessHost, StartRequest } from "./process-port.js";

/** The kernel's status name for an instance that has not ended (`Kernel.Publish.statusName`). */
const running = "running";

interface Chain<P, S> {
  readonly program: P;
  readonly programBytes: number;
  readonly config: HostConfig;
  readonly population: PopulationScope | null;
  readonly memo: Readonly<Record<string, JsonValue>> | null;
  instance: { readonly state: S; readonly view: HostView } | null;
  log: PublicationLog;
  halt: Halt | null;
}

/** One population of the memory host: its chain configuration, its driver and each registered deployment's wire program. */
interface HeldPopulation<P, S, M> {
  readonly config: HostConfig;
  readonly driver: MemoryPopulation<P, S, M>;
  readonly programs: Map<number, JsonValue>;
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
  readonly #populations = new Map<string, HeldPopulation<P, S, M>>();

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
      programBytes: canonicalBytes(request.program),
      config: request.config,
      population: request.population ?? null,
      memo: request.memo ?? null,
      instance: null,
      log: openLog(initialCursor),
      halt: null,
    };
    this.#chains.set(request.workflowId, chain);
    const refusal = this.port.admit(program);
    if (refusal !== null) return { outcome: "unsupported", code: refusal, revision: null };
    const oversized = chain.programBytes > chainCapacity.programBytes ? CapacityBound.Program
      : canonicalBytes(request.start) > chainCapacity.startBytes ? CapacityBound.Start : null;
    if (oversized !== null) return { outcome: "rejected", code: capacityCode(oversized), revision: null };
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
    if (chain === undefined) return { outcome: "rejected", code: workflowUnknown, revision: null };
    if (!this.#running(chain)) return { outcome: "rejected", code: workflowClosed, revision: null };
    if (this.#halt(workflowId, chain) !== null) return { outcome: "rejected", code: "host-halted", revision: null };
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
    const checked = (): HeldPopulation<P, S, M> => {
      const held = this.#population(name, config);
      const conflict = configurationConflict(held.config, config);
      if (conflict !== null) throw new PopulationRefused(conflict);
      return held;
    };
    const driver = (): MemoryPopulation<P, S, M> => checked().driver;
    return {
      population: name,
      registerDeployment: async (request) => {
        const held = checked();
        if (canonicalBytes(request.program) > chainCapacity.programBytes) return { refused: capacityCode(CapacityBound.Program) };
        const program = this.port.decodeProgram(request.program);
        const refusal = this.port.admit(program);
        const answer = held.driver.deploy(request.deploymentRequestId, request.digest,
          refusal === null ? program : { refused: refusal }, this.now());
        if ("deploymentId" in answer) held.programs.set(answer.deploymentId, request.program);
        return answer;
      },
      deployment: async (deploymentRequestId): Promise<DeploymentAnswer | null> =>
        deploymentOf(driver().ingress, deploymentRequestId),
      deployments: async (): Promise<readonly RegisteredDeployment[]> => {
        const held = checked();
        return registeredDeploymentIds(held.driver.ingress).map((deploymentId) =>
          ({ deploymentId, program: held.programs.get(deploymentId) as JsonValue }));
      },
      command: async (kind, command): Promise<CommandAnswer> => {
        const population = driver();
        try {
          this.populationPort.decodeCommand(kind, command);
        } catch (error) {
          // The ingress's validator: a command the kernel's codec cannot read is refused before acceptance.
          throw new PopulationRefused(`malformed-command: ${error instanceof Error ? error.message : String(error)}`);
        }
        const answered = population.command(command.commandId, kind, command, populationCommandDigest(kind, command), this.now());
        if ("refused" in answered) throw new PopulationRefused(answered.refused);
        return answered.answer as unknown as CommandAnswer;
      },
      result: async (commandId) => populationResult(driver().ingress, commandId) as unknown as PopulationResult,
    };
  }

  async observation(workflowId: string): Promise<JsonValue> {
    const chain = this.#chain(workflowId);
    return pagedAnswer(chain.instance === null ? null : this.port.observation(chain.program, chain.instance.state));
  }

  async state(workflowId: string): Promise<JsonValue> {
    const chain = this.#chain(workflowId);
    return pagedAnswer(chain.instance === null ? null : this.port.encodeState(chain.instance.state));
  }

  async hostView(workflowId: string): Promise<HostSnapshot> {
    const chain = this.#chain(workflowId);
    const code = this.#halt(workflowId, chain);
    const halt = chain.halt ?? (code === null ? null : { commandId: "host:population", outcome: "unsupported", code });
    return pagedAnswer({ revision: chain.log.cursor.revision, view: chain.instance === null ? null : snapshotView(chain.instance.view), halt });
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

  /** The code the chain halted with: a refused host arrival, or a registration its population refused. */
  #halt(workflowId: string, chain: Chain<P, S>): string | null {
    if (chain.halt !== null) return chain.halt.code;
    const scope = chain.population;
    return scope === null ? null : this.#populations.get(scope.population)?.driver.halts.get(workflowId) ?? null;
  }

  #frame(chain: Chain<P, S>): ChainFrame<P, S, I> {
    return { port: this.port, program: chain.program, programBytes: chain.programBytes, config: chain.config, population: chain.population, run: 1 };
  }

  /**
   * `state` judged against the chain's bounds, carrying beside it the emits its population still holds for it, which the
   * ingress deferred, and a Signal it threw, which would wait in the chain's carry until handed off.
   */
  #judge(workflowId: string, chain: Chain<P, S>, commandId: string, state: S): Judged<S> {
    const scope = chain.population;
    const held = scope === null ? [] : this.#populations.get(scope.population)?.driver.held(workflowId) ?? [];
    return judgeCommitted(this.#frame(chain), chain.log, commandId, state, (view) => {
      const intents = scope === null ? [] : this.populationPort.intentsOf(chain.program, state);
      return {
        registeredAddresses: scope === null || view.status !== running ? [] : (view.addresses ?? []) as unknown as JsonValue,
        deliveries: [],
        emits: intents.length === 0 ? held
          : [...held, { commandId, held: { instanceId: this.populationPort.instanceIdOf(state), intents }, accepted: false }],
        startOutcome: null,
      };
    });
  }

  /** The population `name`, made on first use with `config`, the configuration of the chains it starts. */
  #population(name: string, config: HostConfig): HeldPopulation<P, S, M> {
    const held = this.#populations.get(name);
    if (held !== undefined) return held;
    const made = {
      config: JSON.parse(canonicalJson(config)) as HostConfig,
      driver: new MemoryPopulation(this.populationPort, this.port.hostView, populationCapacity.receivers, this.#store(name, config),
        { population: name, config, rolloverEvents: null, continuationBytes: chainCapacity.continuationBytes, queryBytes: chainCapacity.queryBytes },
        (instanceId) => processInstanceWorkflowId(name, instanceId)),
      programs: new Map<number, JsonValue>(),
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
          program: entry.program, programBytes: canonicalBytes(this.#population(name, config).programs.get(entry.deploymentId) ?? null),
          config, population: { population: name, deploymentId: entry.deploymentId }, memo: null,
          instance: null, log: openLog(initialCursor), halt: null,
        };
        const judged = this.#judge(workflowId, chain, commandId, entry.state);
        if (!judged.committed) return judged.code;
        this.#chains.set(workflowId, chain);
        this.#commit(chain, judged);
        return null;
      },
    };
  }

  async #submit(workflowId: string, stimulus: JsonValue, route: Route): Promise<CommandResult> {
    const chain = this.#chains.get(workflowId);
    if (chain === undefined) return { outcome: "rejected", code: workflowUnknown, revision: null };
    if (!this.#running(chain)) return { outcome: "rejected", code: workflowClosed, revision: null };
    if (this.#halt(workflowId, chain) !== null) return { outcome: "rejected", code: "host-halted", revision: null };
    if (canonicalBytes(stimulus) > chainCapacity.stimulusBytes) {
      return { outcome: "rejected", code: capacityCode(CapacityBound.Stimulus), revision: null };
    }
    return this.#apply(workflowId, chain, stimulus, route);
  }

  #commit(chain: Chain<P, S>, judged: Extract<Judged<S>, { committed: true }>): void {
    chain.instance = { state: judged.state, view: judged.view };
    chain.log = judged.log;
  }

  /**
   * One of the chain's own inputs; under a population, its registration and thrown Signals go to the population. A
   * candidate over a bound is a caller's rejection, as the Workflow's validator refuses it; a host arrival's halts the
   * chain.
   */
  #apply(workflowId: string, chain: Chain<P, S>, stimulus: JsonValue, route: Route): CommandResult {
    const clocked = chain.config.scheduling === Scheduling.Durable ? clockStimulus(stimulus, this.now()) : stimulus;
    if (clocked === null) return { outcome: "rejected", code: hostOwnsLogicalTime, revision: null };
    const { commandId, input } = this.port.decodeStimulus(clocked);
    if (this.port.route(input) !== route) return { outcome: "rejected", code: "wrong-update", revision: null };
    const arrival = route === Route.TimerFire || route === Route.EffectResult;
    const halted = (code: string): CommandResult => {
      chain.halt = { commandId, outcome: "unsupported", code };
      return { outcome: "unsupported", code, revision: chain.log.cursor.revision };
    };
    if (route === Route.EffectResult && effectResultBytes(clocked) > chainCapacity.effectResultBytes) {
      return halted(capacityCode(CapacityBound.EffectResult));
    }
    const applied = applyInput(this.port, chain.program, chain.instance?.state ?? null, input);
    if (!applied.committed) {
      return { outcome: applied.outcome, code: applied.code, revision: applied.rejected ? null : chain.log.cursor.revision };
    }
    const judged = this.#judge(workflowId, chain, commandId, applied.state);
    if (!judged.committed) {
      if (arrival) return halted(judged.code);
      return { outcome: "rejected", code: judged.code, revision: null };
    }
    this.#commit(chain, judged);
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
/**
 * The bytes of an effect-result stimulus's result as the Activity returns it: the scenario form's outcome is the
 * Activity's result, so its own member measures it.
 */
function effectResultBytes(stimulus: JsonValue): number {
  const outcome = stimulus !== null && typeof stimulus === "object" && !Array.isArray(stimulus) ? (stimulus as Readonly<Record<string, JsonValue>>)["outcome"] : undefined;
  return outcome === undefined ? 0 : canonicalBytes(outcome);
}

export function createMemoryProcessHost(options: MemoryProcessHostOptions): MemoryProcessHost {
  return new MemoryHost(kernelPort, populationPort, options.taskQueue, options.now ?? Date.now);
}

/**
 * A paged Query answer as the Temporal client reads it back: `textPage` sends canonical JSON, so every object arrives
 * with its keys in code-unit order. Answering in the same form keeps consumers from depending on construction order.
 */
function pagedAnswer<Value>(value: Value): Value {
  return JSON.parse(canonicalJson(value)) as Value;
}
