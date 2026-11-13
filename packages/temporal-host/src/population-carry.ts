/**
 * What the population ingress carries across Continue-As-New, and its measure against the continuation bound
 * ([capacity table](../../../docs/TEMPORAL-PROCESS-LIFECYCLE-SPEC.md#workflow-chain-capacity)): the carried state with
 * its in-flight fan-out machine in wire form, its waiting handlers released, and the ledger eviction that keeps it
 * within the bound. The driver (`population.ts`) measures the state at rest; only a Continue-As-New encodes the machine.
 */
import { CapacityBound, canonicalBytes, capacityCode, objectBytes } from "./capacity.js";
import type { HostConfig } from "./host-contract.js";
import type { IngressState, Phase, Queued } from "./population.js";
import type { PopulationPort, Wire } from "./port.js";

/** The code of a registration, deployment, command or Timer start the ingress could no longer carry across Continue-As-New. */
export const ingressContinuationCode = capacityCode(CapacityBound.Continuation);

/** `state` with its in-flight fan-out machine in wire form, as the ingress carries it across Continue-As-New. */
export function carriedState<P, S, M>(port: PopulationPort<P, S, M>, state: IngressState<M>): IngressState<Wire> {
  return { ...state, current: state.current === null ? null
    : { ...state.current, phase: machinePhase(state.current.phase, (machine) => port.machineWire(machine)) } };
}

/** A carried state with its in-flight fan-out machine as the binding's value again. */
export function resumedState<P, S, M>(port: PopulationPort<P, S, M>, state: IngressState<Wire>): IngressState<M> {
  return { ...state, current: state.current === null ? null : { ...state.current, phase: machinePhase(state.current.phase, port.machineOf) } };
}

function machinePhase<A, B>(phase: Phase<A>, convert: (machine: A) => B): Phase<B> {
  return phase.kind === "fanOut" ? { ...phase, machine: convert(phase.machine) } : phase;
}

/**
 * `state` once no Update waits for its items any more, when the ingress continues as new: their answers stay readable
 * in the ledger only.
 */
export function releaseHandlers<M>(state: IngressState<M>): IngressState<M> {
  const released = (item: Queued): Queued => item.kind === "command" ? { ...item, ticket: null } : item;
  return {
    ...state,
    answers: [],
    queue: state.queue.map(released),
    current: state.current === null ? null : { ...state.current, item: released(state.current.item) },
  };
}

/**
 * What the driver measures the ingress against: its Continue-As-New argument beside the carried state
 * (`PopulationIngressArgs`), and the bound that argument must stay within, `chainCapacity.continuationBytes` on Temporal.
 */
export interface IngressFrame {
  readonly population: string;
  readonly config: HostConfig;
  readonly rolloverEvents: number | null;
  readonly continuationBytes: number;
  /** The Query bound an answer must fit, `populationResult` being unpaged: `chainCapacity.queryBytes` on Temporal. */
  readonly queryBytes: number;
}

/**
 * The most an item settling can grow the resting ingress: its ledger entry less the identifiers its queue entry already
 * carried (a command's identifier and digest, an emit's chain and input). A command's entry is its `populationResult`
 * answer, which the Query bound holds, inside `{"kind":"command","commandId":…,"digest":…,"answer":…}` instead of
 * `{"kind":"settled","answer":…}`; the fan-out stops an emit's entries within the same growth (`population.ts`).
 */
export function answerReserve(frame: IngressFrame): number {
  const ledgerShell = canonicalBytes({ kind: "command", commandId: "", digest: "", answer: null }) - 2 * canonicalBytes("") - canonicalBytes(null);
  const settledShell = canonicalBytes({ kind: "settled", answer: null }) - canonicalBytes(null);
  return frame.queryBytes + ledgerShell - settledShell;
}

/**
 * The ingress could not carry its state across Continue-As-New even with an empty ledger once an item settled: nothing
 * left could shrink it, so the ingress fails closed rather than run on over the bound (`ingressContinuationCode`).
 * Admission makes it unreachable from admitted inputs (`settledFit` in `population.ts`); it guards that invariant.
 */
export class IngressCapacityExceeded extends Error {
  constructor() {
    super(ingressContinuationCode);
    this.name = "IngressCapacityExceeded";
  }
}

function argumentBytes(frame: IngressFrame, carriedBytes: number): number {
  return objectBytes({
    population: canonicalBytes(frame.population),
    config: canonicalBytes(frame.config),
    rolloverEvents: canonicalBytes(frame.rolloverEvents),
    carried: carriedBytes,
  });
}

/**
 * The canonical bytes of the Continue-As-New argument that would carry `state`, its waiting handlers released. It
 * encodes the in-flight fan-out machine, so only a Continue-As-New measures it, never a driver step (`IngressState`).
 */
export function ingressContinuationBytes<P, S, M>(port: PopulationPort<P, S, M>, frame: IngressFrame, state: IngressState<M>): number {
  return argumentBytes(frame, canonicalBytes(carriedState(port, releaseHandlers(state))));
}

/**
 * The bytes of that argument for `state` at rest: what every admission and every settled item must keep within the
 * bound. The item in flight counts as the queue entry it was admitted as, never its fan-out machine: its settled entry
 * replaces that queue entry and grows the ingress by at most the answer reserve, which leaves out the identifiers the
 * entry carried (`answerReserve`), so an admission made while it is in flight must still see them. Its machine is
 * measured only when the ingress would continue as new during it, and holds that rollover until it settles when it
 * does not fit. Two growths happen while the item is in flight and are absorbed by that entry's bytes beyond its
 * identifiers, which `answerReserve` leaves free: a Timer start's consumed occurrence, added when the start answers, and
 * the ordinal's digit growth when the item is taken (a `timerStart` command carries the occurrence's fields in its entry),
 * and likewise the digit growth of a deployment ordinal a refused started deployment consumes (`startedDeployment`).
 */
export function restingIngressBytes<M>(frame: IngressFrame, state: IngressState<M>): number {
  const released = releaseHandlers(state);
  const queue = released.current === null ? released.queue : [released.current.item, ...released.queue];
  return argumentBytes(frame, canonicalBytes({ ...released, queue, current: null }));
}

/** `state` carried whole, its item in flight included, with the ledger yielding as in `fittedAtRest`; `null` if impossible. */
export function fittedIngress<P, S, M>(port: PopulationPort<P, S, M>, frame: IngressFrame, state: IngressState<M>): IngressState<M> | null {
  return evicted(state, ingressContinuationBytes(port, frame, state) - frame.continuationBytes, 0);
}

/**
 * Whether an ingress that is continuing as new may take `candidate`: the at-rest measure counts the item in flight as its
 * queue entry, never its machine, so once the rollover measured the whole carry, an admission it takes must keep that
 * whole carry within the bound, or the Run could no longer end.
 */
export function rollingAdmits<P, S, M>(port: PopulationPort<P, S, M>, frame: IngressFrame, candidate: IngressState<M>): boolean {
  return fittedIngress(port, frame, candidate) !== null;
}

/**
 * `state` at rest with the oldest ledger entries evicted until the ingress could carry it across Continue-As-New, or
 * `null` when it could not without evicting one of its `kept` newest entries. The ledger only remembers settled answers,
 * so it yields first, as it does to its count; an answer just settled is kept, since a released command reads it there.
 */
export function fittedAtRest<M>(frame: IngressFrame, state: IngressState<M>, kept = 0): IngressState<M> | null {
  return evicted(state, restingIngressBytes(frame, state) - frame.continuationBytes, kept);
}

/**
 * `state` admitted at rest: as `fittedAtRest`, with room kept for the answer of the item in flight (`answerReserve`), so
 * a settling answer never takes the ingress past the bound. Every admission measures this way.
 */
export function admittedAtRest<M>(frame: IngressFrame, state: IngressState<M>): IngressState<M> | null {
  return evicted(state, restingIngressBytes(frame, state) + answerReserve(frame) - frame.continuationBytes, 0);
}

/** `state` without its oldest ledger entries worth `excess` bytes; a removed entry takes its comma, the last one none. */
function evicted<M>(state: IngressState<M>, excess: number, kept: number): IngressState<M> | null {
  if (excess <= 0) return state;
  let freed = 0;
  let evicted = 0;
  while (freed < excess && evicted < state.ledger.length - kept) {
    freed += canonicalBytes(state.ledger[evicted]) + (evicted + 1 < state.ledger.length ? 1 : 0);
    evicted += 1;
  }
  if (freed < excess) return null;
  return { ...state, ledger: state.ledger.slice(evicted) };
}
