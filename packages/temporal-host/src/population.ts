/**
 * The population ingress's pure decisions ([population ingress](../../../docs/kernel/ARCHITECTURE-SPEC.md#population-ingress)):
 * its deployment registry, chain registrations, command ledger and queue, consumed Timer start occurrences, and the
 * driver that runs one command or emitted hand-off at a time as a serialized fan-out.
 *
 * The driver is a state machine over plain JSON: `advance` takes the next queued item and runs every step that needs no
 * answer from outside, until it names the one `Action` it needs answered or has nothing to do; `answer` records what the
 * action returned. A Workflow performs each action through Activities, an in-process host directly, and both carry the
 * same state across Continue-As-New. Every match, order, budget, identity and verdict is a call of the kernel's
 * population layer through `PopulationPort`; the driver only routes the receivers it is given to the chains and
 * deployments that hold them.
 */
import { canonicalJson } from "./correlation.js";
import type { HostConfig } from "./host-contract.js";
import type { CommandView, JsonValue, OccurrenceId, PopulationPort, WaitAddressView, ReachOutcome, ResolutionParts, SelectorView, Wire } from "./port.js";

/** Host restrictions of the ingress, each refused with a stable code, never a meaning of the construct. */
export const populationCapacity = {
  receivers: 1_000,
  registrations: 8_192,
  deployments: 4_096,
  ledger: 1_024,
  queue: 256,
  timerOccurrences: 4_096,
} as const;

export const queueFullCode = "host.population.queueFull";
export const registrationCapacityCode = "host.population.registrationCapacity";
export const deploymentCapacityCode = "host.population.deploymentCapacity";
export const fanOutCapacityCode = "host.population.fanOutCapacity";
export const timerLedgerCapacityCode = "host.population.timerLedgerCapacity";
/** A deployment request identifier registered again with another definition digest. */
export const deploymentRequestConflictCode = "host.population.deploymentRequestConflict";
/** The code a delivery to a chain that no longer exists fails with. */
export const chainGoneCode = "workflow-closed";
/**
 * A population start's instance identity is already hosted by a chain no population start made (a direct start of that
 * identity): the start is refused, never attached to the other chain or waited on.
 */
export const instanceIdentityInUseCode = "host.population.instanceIdentityInUse";
/** A caller's chain configuration differs from the one its population's ingress runs with. */
export const configurationConflictCode = "host.population.configurationConflict";

/** A registered deployment, or a refused one (`summary` null), which still took its deploy ordinal. */
export interface RegistryEntry {
  readonly deploymentRequestId: string;
  readonly digest: string;
  readonly deploymentId: number;
  readonly answer: DeploymentAnswer;
  readonly key: string | null;
  readonly summary: Wire | null;
}

/** A registered deployment's ordinal, each key's version and its deploy time, the origin of its Timer starts. */
export type DeploymentAnswer =
  | { readonly deploymentId: number; readonly versions: readonly (readonly [string, number])[]; readonly deployedAtMs: number }
  | { readonly refused: string };

/** What one process chain registered: the addresses of its open waits at its publication `revision`. */
export interface ChainRegistration {
  readonly workflowId: string;
  readonly processInstanceId: string;
  readonly deploymentId: number;
  readonly revision: number;
  readonly addresses: readonly WaitAddressView[];
}

/** The Signals one committed input of a chain left, which the ingress reads from the chain when it reaches them. */
export interface EmitReference {
  readonly workflowId: string;
  readonly commandId: string;
  readonly count: number;
  readonly digest: string;
}

/**
 * `ticket` numbers accepted items, so each Update waits for its own answer; it is `null` once no Update waits, for an
 * emit always and for a command whose Update the ingress released when it continued as new.
 */
export type Queued =
  | { readonly kind: "command"; readonly ticket: number | null; readonly commandId: string; readonly commandKind: string; readonly command: JsonValue;
      readonly digest: string }
  | { readonly kind: "emit"; readonly ticket: null; readonly reference: EmitReference };

/**
 * A command's answer: its arrival ordinal, the ingress time it was taken at and its rendered resolution; `chain` is the
 * Workflow ID of the chain a Message delivery reached, which the resolution names only by occurrence.
 */
export interface CommandAnswer {
  readonly commandId: string;
  readonly ordinal: number;
  readonly atMs: number;
  readonly resolution: JsonValue;
  readonly chain: string | null;
}

export type Settled =
  | { readonly kind: "command"; readonly commandId: string; readonly digest: string; readonly answer: CommandAnswer }
  | { readonly kind: "emit"; readonly workflowId: string; readonly commandId: string; readonly entries: JsonValue };

export interface ConsumedTimer {
  readonly deploymentId: number;
  readonly startEvent: string;
  readonly dueMs: number;
}

/** How a finished fan-out answers: a delivery's cascade, a fan-out after its `prefix`, or an emitted hand-off. */
type Finish =
  | { readonly kind: "committed"; readonly target: Wire; readonly chain: string }
  | { readonly kind: "fanOut"; readonly prefix: readonly Wire[] }
  | { readonly kind: "emit" };

type Phase =
  | { readonly kind: "intents" }
  | { readonly kind: "settleEmit"; readonly entries: JsonValue }
  | { readonly kind: "messageScan" }
  | { readonly kind: "messageStarts" }
  | { readonly kind: "messageDeliver"; readonly workflowId: string; readonly target: Wire; readonly channel: Wire }
  | { readonly kind: "broadcastScan" }
  | { readonly kind: "conditionsScan"; readonly deployments: readonly number[] }
  | { readonly kind: "rootStart"; readonly deploymentId: number; readonly startEvent: string; readonly instanceId: string;
      readonly request: Wire; readonly consumes: ConsumedTimer | null }
  | { readonly kind: "fanOut"; readonly machine: Wire; readonly budget: number; readonly finish: Finish };

/** The item being run: its command decoded, its ordinal, the receivers' chains learned so far and its reach count. */
interface InFlight {
  readonly item: Queued;
  readonly ordinal: number;
  readonly atMs: number;
  readonly command: Wire | null;
  readonly view: CommandView | null;
  readonly phase: Phase;
  readonly routes: readonly (readonly [string, string])[];
  readonly reached: number;
}

export interface IngressState {
  /** The ordinal of the last command taken, numbering commands in arrival order from 1. */
  readonly ordinal: number;
  /** The ordinal of the last deployment, refused ones included. */
  readonly deployments: number;
  readonly registry: readonly RegistryEntry[];
  readonly registrations: readonly ChainRegistration[];
  readonly ledger: readonly Settled[];
  readonly queue: readonly Queued[];
  readonly timers: readonly ConsumedTimer[];
  readonly tickets: number;
  /**
   * Answers not yet read by the Update that waits for them, by ticket. Only a waiting Update's item has a ticket, so
   * there are never more than the queue's capacity and the item in flight.
   */
  readonly answers: readonly (readonly [number, JsonValue])[];
  readonly current: InFlight | null;
}

export const emptyIngress: IngressState = {
  ordinal: 0, deployments: 0, registry: [], registrations: [], ledger: [], queue: [], timers: [], tickets: 0, answers: [], current: null,
};

/** What the driver needs answered: a read from or an input to one chain, a scan, or a start. */
export type Action =
  | { readonly kind: "readIntents"; readonly workflowId: string; readonly commandId: string }
  | { readonly kind: "settleEmit"; readonly workflowId: string; readonly commandId: string }
  | { readonly kind: "scanSignal"; readonly chains: readonly string[]; readonly deployments: readonly number[];
      readonly address: Wire; readonly variables: Wire; readonly emitter: string | null }
  | { readonly kind: "scanMessage"; readonly chains: readonly string[]; readonly publication: Wire }
  | { readonly kind: "scanMessageStarts"; readonly deployments: readonly number[]; readonly message: Wire }
  | { readonly kind: "scanConditionalStarts"; readonly deployments: readonly number[] }
  | { readonly kind: "deliver"; readonly workflowId: string; readonly deliveryId: string; readonly delivery: Wire }
  | { readonly kind: "start"; readonly deploymentId: number; readonly instanceId: string; readonly request: Wire };

/** One chain's answer to a Signal scan; `instanceId` null when the chain no longer exists. */
export interface ChainSignals {
  readonly workflowId: string;
  readonly instanceId: string | null;
  readonly receivers: readonly Wire[];
  readonly refusesVariables: boolean;
}

export interface DeploymentSignals {
  readonly deploymentId: number;
  readonly receivers: readonly Wire[];
  readonly refusesVariables: boolean;
}

/**
 * What reaching one receiver answered: its outcome, or that its chain no longer exists (`gone`), or, for a start, that
 * another chain hosts its instance identity (`identityInUse`).
 */
export type ReachAnswer = ReachOutcome | { readonly kind: "gone" } | { readonly kind: "identityInUse" };

export type Answer =
  | { readonly kind: "intents"; readonly instanceId: string | null; readonly intents: readonly Wire[] }
  | { readonly kind: "settled" }
  | { readonly kind: "signalScan"; readonly chains: readonly ChainSignals[]; readonly starts: readonly DeploymentSignals[] }
  | { readonly kind: "messageScan"; readonly chains: readonly { readonly workflowId: string; readonly receivers: readonly (readonly [Wire, Wire])[] }[] }
  | { readonly kind: "messageStarts"; readonly starts: readonly { readonly deploymentId: number; readonly candidates: readonly (readonly [string, Wire])[] }[] }
  /** Each deployment's root Conditional starts by public identifier, in the order the action named the deployments. */
  | { readonly kind: "conditionalStarts"; readonly starts: readonly { readonly deploymentId: number; readonly startEvents: readonly string[] }[] }
  | { readonly kind: "reached"; readonly outcome: ReachAnswer };

// Registry and registrations.

function summaries(state: IngressState): Wire[] {
  return state.registry.flatMap((entry) => entry.summary === null ? [] : [entry.summary]);
}

function registered(state: IngressState, deploymentId: number): RegistryEntry | undefined {
  return state.registry.find((entry) => entry.deploymentId === deploymentId && entry.summary !== null);
}

/**
 * Register a deployment `candidate` (its kernel summary) under the caller's request identifier at `atMs`: the next deploy
 * ordinal and each key's version, or the kernel's refusal, which also takes its ordinal, as does a candidate admission
 * already refused (population contract §2.3). The same request again answers
 * as before. A registered deployment supersedes its key's earlier deployments, so their consumed Timer start
 * occurrences can never decide a verdict again and leave the ledger.
 */
export function registerDeployment<P, S>(port: PopulationPort<P, S>, state: IngressState, deploymentRequestId: string,
  digest: string, candidate: { readonly summary: Wire } | { readonly refused: string }, atMs: number): readonly [IngressState, DeploymentAnswer] {
  const known = state.registry.find((entry) => entry.deploymentRequestId === deploymentRequestId);
  if (known !== undefined) return [state, known.digest === digest ? known.answer : { refused: deploymentRequestConflictCode }];
  if (state.registry.length >= populationCapacity.deployments) return [state, { refused: deploymentCapacityCode }];
  const deploymentId = state.deployments + 1;
  const outcome = "refused" in candidate ? candidate : port.registerSummary(summaries(state), deploymentId, candidate.summary, atMs);
  const base = { deploymentRequestId, digest, deploymentId };
  if ("refused" in outcome) {
    const answer = { refused: outcome.refused };
    return [{ ...state, deployments: deploymentId, registry: [...state.registry, { ...base, answer, key: null, summary: null }] }, answer];
  }
  const answer = { deploymentId, versions: outcome.versions, deployedAtMs: atMs };
  const superseded = new Set(state.registry.filter((entry) => entry.key === outcome.key).map((entry) => entry.deploymentId));
  return [{
    ...state,
    deployments: deploymentId,
    registry: [...state.registry, { ...base, answer, key: outcome.key, summary: outcome.summary }],
    timers: state.timers.filter((timer) => !superseded.has(timer.deploymentId)),
  }, answer];
}

/**
 * `state` with a chain's registration: a later or equal revision replaces the chain's, no addresses removes it, and a
 * chain beyond the capacity is refused with `registrationCapacity`.
 */
export function register(state: IngressState, registration: ChainRegistration): readonly [IngressState, string | null] {
  const held = state.registrations.find((entry) => entry.workflowId === registration.workflowId);
  if (held !== undefined && held.revision > registration.revision) return [state, null];
  const others = state.registrations.filter((entry) => entry.workflowId !== registration.workflowId);
  if (registration.addresses.length === 0) return [{ ...state, registrations: others }, null];
  if (held === undefined && others.length >= populationCapacity.registrations) return [state, registrationCapacityCode];
  return [{ ...state, registrations: [...others, registration] }, null];
}

// Queue and ledger.

/** Accept a command for the queue, or refuse it before acceptance when the queue is full. */
export function enqueueCommand(state: IngressState, commandId: string, commandKind: string, command: JsonValue, digest: string):
  readonly [IngressState, number | null] {
  if (state.queue.filter((item) => item.kind === "command").length >= populationCapacity.queue) return [state, null];
  const ticket = state.tickets + 1;
  return [{ ...state, tickets: ticket, queue: [...state.queue, { kind: "command", ticket, commandId, commandKind, command, digest }] }, ticket];
}

/** Accept an emit; one already queued, in flight or settled is accepted again without a second hand-off. */
export function enqueueEmit(state: IngressState, reference: EmitReference): IngressState {
  const same = (other: EmitReference): boolean => other.workflowId === reference.workflowId && other.commandId === reference.commandId;
  const current = state.current?.item;
  if (state.queue.some((item) => item.kind === "emit" && same(item.reference)) ||
      (current !== undefined && current.kind === "emit" && same(current.reference)) ||
      state.ledger.some((entry) => entry.kind === "emit" && entry.workflowId === reference.workflowId && entry.commandId === reference.commandId)) {
    return state;
  }
  const ticket = state.tickets + 1;
  return { ...state, tickets: ticket, queue: [...state.queue, { kind: "emit", ticket: null, reference }] };
}

/**
 * `state` once no Update waits for its items any more, when the ingress continues as new: their answers stay readable
 * in the ledger only.
 */
export function releaseHandlers(state: IngressState): IngressState {
  const released = (item: Queued): Queued => item.kind === "command" ? { ...item, ticket: null } : item;
  return {
    ...state,
    answers: [],
    queue: state.queue.map(released),
    current: state.current === null ? null : { ...state.current, item: released(state.current.item) },
  };
}

/** The answer a registered or refused deployment request received, `null` for a request never registered. */
export function deploymentOf(state: IngressState, deploymentRequestId: string): DeploymentAnswer | null {
  return state.registry.find((entry) => entry.deploymentRequestId === deploymentRequestId)?.answer ?? null;
}

/**
 * The refusal of a caller whose chain configuration differs from the one the ingress was started with: the chains the
 * ingress starts never run under a configuration their caller did not give.
 */
export function configurationConflict(held: HostConfig, requested: HostConfig): string | null {
  return canonicalJson(held) === canonicalJson(requested) ? null : configurationConflictCode;
}

/** The answer of `ticket` once settled, and the state without it. */
export function takeAnswer(state: IngressState, ticket: number): readonly [IngressState, JsonValue] | null {
  const found = state.answers.find(([held]) => held === ticket);
  if (found === undefined) return null;
  return [{ ...state, answers: state.answers.filter(([held]) => held !== ticket) }, found[1]];
}

/** The recorded answer of a command, `pending` while it is queued or in flight, `unknown` otherwise. */
export function populationResult(state: IngressState, commandId: string): JsonValue {
  const settled = state.ledger.find((entry) => entry.kind === "command" && entry.commandId === commandId);
  if (settled !== undefined && settled.kind === "command") return { kind: "settled", answer: settled.answer as unknown as JsonValue };
  const waiting = [...state.queue, ...(state.current === null ? [] : [state.current.item])];
  return waiting.some((item) => item.kind === "command" && item.commandId === commandId) ? { kind: "pending" } : { kind: "unknown" };
}

/** Settle the item in flight; a command's Update waits for `answer` under its ticket, an emit's never does. */
function settle(state: IngressState, entry: Settled, ticket: number | null, answer: JsonValue): IngressState {
  const answers = ticket === null ? state.answers : [...state.answers, [ticket, answer] as const];
  return { ...state, current: null, ledger: [...state.ledger, entry].slice(-populationCapacity.ledger), answers };
}

// The driver.

/** The failure a start receiver records when its start did not commit: the kernel's, or the host's refusal. */
function startFailure<P, S>(port: PopulationPort<P, S>, outcome: Exclude<ReachAnswer, { readonly kind: "committed" | "passed" }>): Wire {
  switch (outcome.kind) {
    case "failed": return outcome.failure;
    case "gone":
    case "skipped": return port.hostRefusal(chainGoneCode);
    case "identityInUse": return port.hostRefusal(instanceIdentityInUseCode);
  }
}

function inFlight(state: IngressState): InFlight {
  if (state.current === null) throw new TypeError("no population item is in flight");
  return state.current;
}

function withPhase(state: IngressState, phase: Phase, extra: Partial<Pick<InFlight, "routes" | "reached">> = {}): IngressState {
  return { ...state, current: { ...inFlight(state), ...extra, phase } };
}

function occurrenceKey(occurrence: OccurrenceId): string {
  return canonicalJson([occurrence.processInstanceId, occurrence.elementId, occurrence.activation]);
}

/** Settle the command in flight with `parts`; `chain` is the chain a Message delivery reached. */
function resolve<P, S>(port: PopulationPort<P, S>, state: IngressState, parts: ResolutionParts, chain: string | null = null): IngressState {
  const current = inFlight(state);
  if (current.item.kind !== "command" || current.view === null) throw new TypeError("only a command resolves");
  const answer: CommandAnswer = {
    commandId: current.view.commandId, ordinal: current.ordinal, atMs: current.atMs, resolution: port.renderResolution(parts), chain,
  };
  return settle(state, { kind: "command", commandId: answer.commandId, digest: current.item.digest, answer }, current.item.ticket,
    answer as unknown as JsonValue);
}

function rejected<P, S>(port: PopulationPort<P, S>, state: IngressState, code: string): IngressState {
  return resolve(port, state, { kind: "rejected", code });
}

/** The deployments a selector names: one, none (`definition-not-deployed`) or, without one, every current deployment. */
function scope<P, S>(port: PopulationPort<P, S>, state: IngressState, selector: SelectorView | null): readonly number[] | null {
  const current = port.currentDeployments(summaries(state));
  if (selector === null) return current;
  if ("deploymentId" in selector) return registered(state, selector.deploymentId) === undefined ? null : [selector.deploymentId];
  const named = current.filter((deploymentId) => registered(state, deploymentId)?.key === selector.processKey);
  return named.length === 0 ? null : named;
}

/** Take the next queued item at `atMs`: a command takes the next ordinal, and a repeated one answers from the ledger. */
function take<P, S>(port: PopulationPort<P, S>, state: IngressState, atMs: number): IngressState {
  const [item, ...queue] = state.queue;
  if (item === undefined) return state;
  const base = { ...state, queue };
  if (item.kind === "emit") {
    return { ...base, current: { item, ordinal: 0, atMs, command: null, view: null, phase: { kind: "intents" }, routes: [], reached: 0 } };
  }
  const { view, command } = port.decodeCommand(item.commandKind, item.command);
  const ordinal = state.ordinal + 1;
  const started = { ...base, ordinal, current: { item, ordinal, atMs, command, view, phase: { kind: "messageScan" } as Phase, routes: [], reached: 0 } };
  const recorded = state.ledger.find((entry) => entry.kind === "command" && entry.commandId === view.commandId);
  if (recorded !== undefined && recorded.kind === "command") {
    // A repeated command answers its recorded resolution and changes nothing (population contract §7).
    if (recorded.digest !== item.digest) return rejected(port, started, "command-content-mismatch");
    const answer = { ...recorded.answer, ordinal, atMs };
    return settle(started, { kind: "command", commandId: view.commandId, digest: item.digest, answer }, item.ticket, answer as unknown as JsonValue);
  }
  switch (view.kind) {
    case "publish": {
      if (view.criteriaRepeat) return rejected(port, started, "criteria-duplicate");
      if (scope(port, state, view.definition) === null) return rejected(port, started, "definition-not-deployed");
      return withPhase(started, view.executions ? { kind: "messageScan" } : { kind: "messageStarts" });
    }
    case "broadcast":
      return withPhase(started, { kind: "broadcastScan" });
    case "evaluateConditions": {
      const deployments = scope(port, state, view.definition);
      if (deployments === null) return rejected(port, started, "definition-not-deployed");
      return withPhase(started, { kind: "conditionsScan", deployments });
    }
    case "timerStart": {
      const consumed = state.timers.some((timer) => timer.deploymentId === view.deploymentId && timer.startEvent === view.startEvent &&
        timer.dueMs === view.dueMs);
      const refusal = port.timerStartCheck(summaries(state), view.deploymentId, view.startEvent, view.dueMs, atMs, consumed);
      if (refusal !== null) return rejected(port, started, refusal);
      if (state.timers.length >= populationCapacity.timerOccurrences) return rejected(port, started, timerLedgerCapacityCode);
      const instanceId = port.timerInstanceId(view.deploymentId, view.startEvent, view.dueMs);
      return withPhase(started, {
        kind: "rootStart", deploymentId: view.deploymentId, startEvent: view.startEvent, instanceId,
        request: port.timerStartRequest(instanceId, view.startEvent),
        consumes: { deploymentId: view.deploymentId, startEvent: view.startEvent, dueMs: view.dueMs },
      });
    }
  }
}

function signalChains(state: IngressState, address: JsonValue): string[] {
  const key = canonicalJson(address);
  return state.registrations.filter((entry) => entry.addresses.some((held) => held.signal !== undefined && canonicalJson(held.signal) === key))
    .map((entry) => entry.workflowId);
}

function messageChains(state: IngressState, view: Extract<CommandView, { kind: "publish" }>, deployments: readonly number[] | null): string[] {
  const channel = view.channel === null ? null : canonicalJson(view.channel);
  return state.registrations.filter((entry) => (deployments === null || deployments.includes(entry.deploymentId)) &&
    entry.addresses.some((held) => held.message !== undefined &&
      (channel === null ? held.message.name === view.name : canonicalJson(held.message.channel) === channel)))
    .map((entry) => entry.workflowId);
}

function deliveryId(current: InFlight): string {
  const item = current.item;
  const owner = item.kind === "command" ? ["command", current.view?.commandId ?? ""] : ["emit", item.reference.workflowId, item.reference.commandId];
  return canonicalJson(["populationDelivery", ...owner, current.reached]);
}

function commandIdOfFlight(current: InFlight): string {
  return current.item.kind === "emit" ? current.item.reference.commandId : current.view?.commandId ?? "";
}

/** The action a fan-out needs next, or the finished item. */
function fanOutAction<P, S>(port: PopulationPort<P, S>, state: IngressState): readonly [IngressState, Action | null] {
  const current = inFlight(state);
  const phase = current.phase;
  if (phase.kind !== "fanOut") throw new TypeError("not fanning out");
  const next = port.fanOutNext(phase.machine);
  switch (next.kind) {
    case "done": {
      const entries = port.hostCapacityEntries(next.entries, next.stopped, phase.budget);
      const finish = phase.finish;
      switch (finish.kind) {
        case "committed": return [resolve(port, state, { kind: "committed", target: finish.target, cascade: entries }, finish.chain), null];
        case "fanOut": return [resolve(port, state, { kind: "fanOut", entries: [...finish.prefix, ...entries] }), null];
        case "emit": {
          const rendered = port.renderEntries(entries);
          return [withPhase(state, { kind: "settleEmit", entries: rendered }), null];
        }
      }
      throw new TypeError("unknown fan-out finish");
    }
    case "snapshot":
      return [state, {
        kind: "scanSignal", chains: signalChains(state, next.address), deployments: port.currentDeployments(summaries(state)),
        address: port.emissionAddress(next.emission), variables: port.emissionVariables(next.emission), emitter: next.emitter,
      }];
    case "reach": {
      const view = next.view;
      if (view.kind === "occurrence") {
        const workflowId = current.routes.find(([key]) => key === occurrenceKey(view.occurrence))?.[1];
        if (workflowId === undefined) {
          const target = port.skippedEntry(port.receiverTarget(next.receiver));
          return [withPhase(state, { ...phase, machine: port.fanOutRecord(phase.machine, target, [], "") }), null];
        }
        if (next.emission === null) throw new TypeError("an occurrence is reached only by a Signal");
        return [state, { kind: "deliver", workflowId, deliveryId: deliveryId(current),
          delivery: port.signalDelivery(next.emission, port.receiverTarget(next.receiver)) }];
      }
      if (next.emission === null) {
        if (current.command === null) throw new TypeError("a start the command names needs its command");
        const instanceId = port.startedInstanceId(commandIdOfFlight(current), view.deploymentId, view.startEvent);
        return [state, { kind: "start", deploymentId: view.deploymentId, instanceId, request: port.conditionStart(current.command, instanceId, view.startEvent) }];
      }
      const instanceId = port.emissionStartedId(next.emission, commandIdOfFlight(current), view.deploymentId, view.startEvent);
      return [state, { kind: "start", deploymentId: view.deploymentId, instanceId, request: port.signalStart(next.emission, instanceId, view.startEvent) }];
    }
  }
}

/** Run every step that needs no answer, taking queued items at `atMs`; the action the item in flight needs next, if any. */
export function advance<P, S>(port: PopulationPort<P, S>, initial: IngressState, atMs: number): readonly [IngressState, Action | null] {
  let state = initial;
  for (;;) {
    if (state.current === null) {
      if (state.queue.length === 0) return [state, null];
      state = take(port, state, atMs);
      continue;
    }
    const current = state.current;
    const phase = current.phase;
    const view = current.view;
    switch (phase.kind) {
      case "intents": {
        if (current.item.kind !== "emit") throw new TypeError("only an emit reads intents");
        return [state, { kind: "readIntents", workflowId: current.item.reference.workflowId, commandId: current.item.reference.commandId }];
      }
      case "settleEmit": {
        if (current.item.kind !== "emit") throw new TypeError("only an emit settles");
        return [state, { kind: "settleEmit", workflowId: current.item.reference.workflowId, commandId: current.item.reference.commandId }];
      }
      case "messageScan": {
        if (view?.kind !== "publish" || current.command === null) throw new TypeError("not a publication");
        return [state, { kind: "scanMessage", chains: messageChains(state, view, scopeOf(port, state, view)), publication: port.publication(current.command) }];
      }
      case "messageStarts": {
        if (view?.kind !== "publish" || current.command === null) throw new TypeError("not a publication");
        return [state, { kind: "scanMessageStarts", deployments: scope(port, state, view.definition) ?? [], message: port.messageAddress(current.command) }];
      }
      case "messageDeliver":
        if (current.command === null) throw new TypeError("not a publication");
        return [state, { kind: "deliver", workflowId: phase.workflowId, deliveryId: deliveryId(current),
          delivery: port.messageDelivery(current.command, phase.target, phase.channel) }];
      case "broadcastScan": {
        if (view?.kind !== "broadcast" || current.command === null) throw new TypeError("not a broadcast");
        return [state, { kind: "scanSignal", chains: signalChains(state, view.address), deployments: port.currentDeployments(summaries(state)),
          address: port.emissionAddress(port.broadcastEmission(current.command)),
          variables: port.emissionVariables(port.broadcastEmission(current.command)), emitter: null }];
      }
      case "conditionsScan":
        return [state, { kind: "scanConditionalStarts", deployments: phase.deployments }];
      case "rootStart":
        return [state, { kind: "start", deploymentId: phase.deploymentId, instanceId: phase.instanceId, request: phase.request }];
      case "fanOut": {
        const [next, action] = fanOutAction(port, state);
        if (action !== null) return [next, action];
        state = next;
        continue;
      }
    }
  }
}

function scopeOf<P, S>(port: PopulationPort<P, S>, state: IngressState, view: Extract<CommandView, { kind: "publish" }>): readonly number[] | null {
  return view.definition === null ? null : scope(port, state, view.definition);
}

/** The receivers a Signal scan found, each chain's own routed to it, linearized by the kernel. */
function signalSnapshot<P, S>(port: PopulationPort<P, S>, current: InFlight, answer: Extract<Answer, { kind: "signalScan" }>):
  readonly [readonly Wire[], readonly (readonly [string, string])[]] {
  const live = answer.chains.flatMap((chain) => chain.instanceId === null ? [] : [{ ...chain, instanceId: chain.instanceId }]);
  const routes = live.flatMap((chain) => chain.receivers.map((ref) => {
    const view = port.receiverView(port.occurrenceReceiver(ref));
    if (view.kind !== "occurrence") throw new TypeError("a chain answered a start");
    return [occurrenceKey(view.occurrence), chain.workflowId] as const;
  }));
  const snapshot = port.linearize(live.map((chain) => [chain.instanceId, chain.receivers] as const),
    answer.starts.map((start) => [start.deploymentId, start.receivers] as const));
  return [snapshot, [...current.routes, ...routes]];
}

/** Record `answer` to the action the item in flight needed. */
export function answer<P, S>(port: PopulationPort<P, S>, state: IngressState, given: Answer): IngressState {
  const current = inFlight(state);
  const phase = current.phase;
  const view = current.view;
  const capacity = populationCapacity.receivers;
  switch (phase.kind) {
    case "intents": {
      if (given.kind !== "intents" || current.item.kind !== "emit") break;
      const machine = port.cascadeBegin(current.item.reference.commandId, given.instanceId ?? "", given.instanceId === null ? [] : given.intents, capacity);
      return withPhase(state, { kind: "fanOut", machine, budget: capacity, finish: { kind: "emit" } });
    }
    case "settleEmit": {
      if (given.kind !== "settled" || current.item.kind !== "emit") break;
      const { workflowId, commandId } = current.item.reference;
      return settle(state, { kind: "emit", workflowId, commandId, entries: phase.entries }, null, phase.entries);
    }
    case "messageScan": {
      if (given.kind !== "messageScan" || view?.kind !== "publish") break;
      const matches = given.chains.flatMap((chain) => chain.receivers.map(([target, channel]) => ({ workflowId: chain.workflowId, target, channel })));
      if (matches.length > 1) return resolve(port, state, { kind: "ambiguous" });
      const [only] = matches;
      if (only !== undefined) return withPhase(state, { kind: "messageDeliver", ...only });
      return view.starts ? withPhase(state, { kind: "messageStarts" }) : resolve(port, state, { kind: "noMatch" });
    }
    case "messageStarts": {
      if (given.kind !== "messageStarts" || current.command === null) break;
      const candidates = given.starts.flatMap((start) => start.candidates.map(([startEvent, channel]) => ({ deploymentId: start.deploymentId, startEvent, channel })));
      if (candidates.length > 1) return resolve(port, state, { kind: "ambiguous" });
      const [only] = candidates;
      if (only === undefined) return resolve(port, state, { kind: "noMatch" });
      const instanceId = port.startedInstanceId(commandIdOfFlight(current), only.deploymentId, only.startEvent);
      return withPhase(state, { kind: "rootStart", deploymentId: only.deploymentId, startEvent: only.startEvent, instanceId,
        request: port.messageStart(current.command, instanceId, only.startEvent, only.channel), consumes: null });
    }
    case "messageDeliver": {
      if (given.kind !== "reached") break;
      const outcome = given.outcome;
      const reached = current.reached + 1;
      switch (outcome.kind) {
        case "committed":
          return withPhase(state, { kind: "fanOut", machine: port.cascadeBegin(commandIdOfFlight(current), outcome.instanceId, outcome.intents, capacity),
            budget: capacity, finish: { kind: "committed", target: phase.target, chain: phase.workflowId } }, { reached });
        case "failed":
          return resolve(port, state, { kind: "failed", target: phase.target, failure: outcome.failure }, phase.workflowId);
        case "skipped":
        case "gone":
          return resolve(port, state, { kind: "failed", target: phase.target, failure: port.hostRefusal(chainGoneCode) }, phase.workflowId);
        case "passed":
        case "identityInUse":
          break;
      }
      break;
    }
    case "broadcastScan": {
      if (given.kind !== "signalScan" || view?.kind !== "broadcast" || current.command === null) break;
      const reachedRefusing = [...given.chains.filter((chain) => chain.instanceId !== null), ...given.starts]
        .some((reached) => reached.receivers.length > 0 && reached.refusesVariables);
      if (view.hasVariables && reachedRefusing) return rejected(port, state, "broadcast-variables-not-admitted");
      const [snapshot, routes] = signalSnapshot(port, current, given);
      const machine = port.broadcastBegin(current.command, snapshot, capacity);
      if (machine === null) return rejected(port, state, "discovery-order-mismatch");
      if (snapshot.length > capacity) return rejected(port, state, fanOutCapacityCode);
      return withPhase(state, { kind: "fanOut", machine, budget: capacity, finish: { kind: "fanOut", prefix: [] } }, { routes });
    }
    case "conditionsScan": {
      if (given.kind !== "conditionalStarts" || current.command === null) break;
      const starts = given.starts.flatMap((deployment) =>
        deployment.startEvents.map((startEvent) => port.startReceiver(deployment.deploymentId, startEvent)));
      if (starts.length === 0) return rejected(port, state, "no-conditional-start");
      const machine = port.conditionsBegin(current.command, starts, capacity);
      if (machine === null) return rejected(port, state, "discovery-order-mismatch");
      if (starts.length > capacity) return rejected(port, state, fanOutCapacityCode);
      return withPhase(state, { kind: "fanOut", machine, budget: capacity, finish: { kind: "fanOut", prefix: [] } });
    }
    case "rootStart": {
      if (given.kind !== "reached") break;
      const summary = registered(state, phase.deploymentId)?.summary;
      if (summary === undefined || summary === null) throw new TypeError(`deployment ${String(phase.deploymentId)} is not registered`);
      const receiver = port.startReceiver(phase.deploymentId, phase.startEvent);
      const outcome = given.outcome;
      if (outcome.kind !== "committed") {
        if (outcome.kind === "passed") throw new TypeError("only a Conditional start passes");
        const failure = startFailure(port, outcome);
        return resolve(port, state, { kind: "fanOut", entries: [port.failedEntry(receiver, failure)] });
      }
      const entry = port.startedEntry(summary, phase.instanceId, phase.startEvent);
      const timers = phase.consumes === null ? state.timers : [...state.timers, phase.consumes];
      // The started entry is a receiver the bound counts (`Kernel.Population.Signals.cascadeCommitted`).
      const budget = capacity - 1;
      return withPhase({ ...state, timers }, { kind: "fanOut", machine: port.cascadeBegin(commandIdOfFlight(current), outcome.instanceId,
        outcome.intents, budget), budget, finish: { kind: "fanOut", prefix: [entry] } }, { reached: current.reached + 1 });
    }
    case "fanOut": {
      const next = port.fanOutNext(phase.machine);
      if (next.kind === "snapshot" && given.kind === "signalScan") {
        const [snapshot, routes] = signalSnapshot(port, current, given);
        return withPhase(state, { ...phase, machine: port.fanOutSnapshot(phase.machine, snapshot) }, { routes });
      }
      if (next.kind !== "reach" || given.kind !== "reached") break;
      const outcome = given.outcome;
      const reached = current.reached + 1;
      const record = (entry: Wire, intents: readonly Wire[], emitter: string): IngressState =>
        withPhase(state, { ...phase, machine: port.fanOutRecord(phase.machine, entry, intents, emitter) }, { reached });
      if (next.view.kind === "occurrence") {
        const target = port.receiverTarget(next.receiver);
        switch (outcome.kind) {
          case "committed": return record(port.deliveredEntry(target), outcome.intents, outcome.instanceId);
          case "failed": return record(port.failedEntry(next.receiver, outcome.failure), [], "");
          case "skipped":
          case "gone": return record(port.skippedEntry(target), [], "");
          case "passed":
          case "identityInUse": break;
        }
        break;
      }
      if (outcome.kind === "passed") return withPhase(state, { ...phase, machine: port.fanOutPass(phase.machine) }, { reached });
      const summary = registered(state, next.view.deploymentId)?.summary;
      if (summary === undefined || summary === null) throw new TypeError(`deployment ${String(next.view.deploymentId)} is not registered`);
      const instanceId = next.emission === null
        ? port.startedInstanceId(commandIdOfFlight(current), next.view.deploymentId, next.view.startEvent)
        : port.emissionStartedId(next.emission, commandIdOfFlight(current), next.view.deploymentId, next.view.startEvent);
      if (outcome.kind === "committed") return record(port.startedEntry(summary, instanceId, next.view.startEvent), outcome.intents, outcome.instanceId);
      return record(port.failedEntry(next.receiver, startFailure(port, outcome)), [], "");
    }
  }
  throw new TypeError(`answer ${given.kind} does not fit the ${phase.kind} step`);
}
