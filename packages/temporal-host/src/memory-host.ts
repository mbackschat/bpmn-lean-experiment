/**
 * An in-process `ProcessHost` for tests of the host's clients: each chain is one kernel state applied through the same
 * pure core the Workflow uses (`applyInput`, the publication log, the host clock rule), with no Temporal server.
 *
 * It realizes only what a client observes: start verdicts under a Workflow ID used once, Update verdicts (a rejection
 * carries no revision, as a refused Update never enters history), queries, correlated publications routed by the same
 * decisions as the ingress Workflow (`correlation.ts`), and the retained description. Every chain's state is at hand,
 * so a publication asks the running chains of its scope directly and no registration is needed. It drives no timers or
 * Activities; a test that needs them uses the hosted witnesses.
 */
import {
  deliveryStimulus,
  delivered,
  emptyIngress,
  ingressKey,
  publicationContent,
  recorded,
  route,
  settle,
  unrouted,
  Routing,
  type IngressState,
} from "./correlation.js";
import {
  Scheduling,
  workflowType,
  type CommandResult,
  type CorrelatedPublication,
  type HostConfig,
  type HostSnapshot,
  type PublicationResult,
  workflowClosed,
} from "./host-contract.js";
import { applyInput, assertNever, clockStimulus, hostOwnsLogicalTime } from "./host-machine.js";
import { kernelPort } from "./kernel-port.js";
import { Route, type HostView, type JsonValue, type KernelPort } from "./port.js";
import { appendJournal, initialCursor, openLog, readPage, type PublicationLog, type PublicationPage } from "./publication.js";
import type { ProcessDescription, ProcessHost, StartRequest } from "./process-port.js";

/** The kernel's status name for an instance that has not ended (`Kernel.Publish.statusName`). */
const running = "running";

interface Chain<P, S> {
  readonly program: P;
  readonly config: HostConfig;
  readonly correlationScope: string | null;
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
}

export class UnknownWorkflow extends Error {
  override readonly name = "UnknownWorkflow";
}

class MemoryHost<P, S, I> implements MemoryProcessHost {
  readonly #chains = new Map<string, Chain<P, S>>();
  readonly #ingresses = new Map<string, IngressState>();

  constructor(
    private readonly port: KernelPort<P, S, I>,
    private readonly taskQueue: string,
    private readonly now: () => number,
  ) {}

  async start(request: StartRequest): Promise<CommandResult> {
    if (this.#chains.has(request.workflowId)) return { outcome: "rejected", code: "workflow-already-started", revision: null };
    const program = this.port.decodeProgram(request.program);
    const chain: Chain<P, S> = {
      program,
      config: request.config,
      correlationScope: request.correlationScope ?? null,
      memo: request.memo ?? null,
      instance: null,
      log: openLog(initialCursor),
    };
    this.#chains.set(request.workflowId, chain);
    const refusal = this.port.admit(program);
    if (refusal !== null) return { outcome: "unsupported", code: refusal, revision: null };
    const started = this.#apply(chain, request.start, Route.Start);
    return started.outcome === "committed" ? started : { ...started, revision: null };
  }

  command(workflowId: string, stimulus: JsonValue): Promise<CommandResult> {
    return this.#submit(workflowId, stimulus, Route.Command);
  }

  deliver(workflowId: string, stimulus: JsonValue): Promise<CommandResult> {
    return this.#submit(workflowId, stimulus, Route.Deliver);
  }

  async publish(publication: CorrelatedPublication): Promise<PublicationResult> {
    const key = ingressKey(publication.correlationScope, publication.channel);
    const ingress = this.#ingresses.get(key) ?? emptyIngress;
    const content = publicationContent(publication);
    const known = recorded(ingress, publication.commandId, content);
    if (known !== null) return known;
    // The ingress Workflow's validator: a publication the kernel's codec cannot carry is the caller's fault.
    this.port.decodeStimulus(deliveryStimulus(publication, { processInstanceId: "", elementId: "", activation: 0 }));
    const ordinal = ingress.ordinal + 1;
    const scanned = [...this.#chains].filter(([, chain]) => chain.correlationScope === publication.correlationScope)
      .map(([workflowId, chain]) => ({
        workflowId,
        occurrences: chain.instance === null || !this.#running(chain) ? []
          : this.port.matching(chain.program, chain.instance.state, publication.channel, publication.correlation),
      }));
    const routed = route(scanned);
    let result: PublicationResult;
    if (routed.kind === Routing.One) {
      const chain = this.#chain(routed.target.workflowId);
      result = delivered(ordinal, routed.target,
        this.#apply(chain, deliveryStimulus(publication, routed.target.occurrence), Route.Deliver));
    } else {
      result = unrouted(ordinal, routed);
    }
    this.#ingresses.set(key, settle({ ...ingress, ordinal }, { commandId: publication.commandId, content, result }));
    return result;
  }

  async arrive(workflowId: string, stimulus: JsonValue): Promise<CommandResult> {
    const chain = this.#chains.get(workflowId);
    if (chain === undefined || !this.#running(chain)) return { outcome: "rejected", code: workflowClosed, revision: null };
    const route = this.port.route(this.port.decodeStimulus(stimulus).input);
    switch (route) {
      case Route.TimerFire:
      case Route.EffectResult:
        return this.#apply(chain, stimulus, route);
      case Route.Start:
      case Route.Command:
      case Route.Deliver:
        throw new TypeError(`a ${route} stimulus is a client's input, not a host arrival`);
    }
    return assertNever(route);
  }

  async observation(workflowId: string): Promise<JsonValue> {
    const chain = this.#chain(workflowId);
    return chain.instance === null ? null : this.port.observation(chain.program, chain.instance.state);
  }

  async hostView(workflowId: string): Promise<HostSnapshot> {
    const chain = this.#chain(workflowId);
    return { revision: chain.log.cursor.revision, view: chain.instance?.view ?? null, halt: null, registering: false };
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

  async #submit(workflowId: string, stimulus: JsonValue, route: Route): Promise<CommandResult> {
    const chain = this.#chains.get(workflowId);
    if (chain === undefined || !this.#running(chain)) return { outcome: "rejected", code: workflowClosed, revision: null };
    return this.#apply(chain, stimulus, route);
  }

  #apply(chain: Chain<P, S>, stimulus: JsonValue, route: Route): CommandResult {
    const clocked = chain.config.scheduling === Scheduling.Durable ? clockStimulus(stimulus, this.now()) : stimulus;
    if (clocked === null) return { outcome: "rejected", code: hostOwnsLogicalTime, revision: null };
    const { commandId, input } = this.port.decodeStimulus(clocked);
    if (this.port.route(input) !== route) return { outcome: "rejected", code: "wrong-update", revision: null };
    const applied = applyInput(this.port, chain.program, chain.instance?.state ?? null, input);
    if (!applied.committed) {
      return { outcome: applied.outcome, code: applied.code, revision: applied.rejected ? null : chain.log.cursor.revision };
    }
    chain.instance = { state: applied.state, view: applied.view };
    chain.log = appendJournal(chain.log, commandId, applied.view.journal);
    return { outcome: "committed", code: null, revision: chain.log.cursor.revision };
  }
}

/** A `ProcessHost` bound to the TypeScript kernel. */
export function createMemoryProcessHost(options: MemoryProcessHostOptions): MemoryProcessHost {
  return new MemoryHost(kernelPort, options.taskQueue, options.now ?? Date.now);
}
