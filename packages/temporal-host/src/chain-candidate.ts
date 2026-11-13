/**
 * A process chain's capacity check, shared by the Workflow and the memory host: the candidate the kernel's step
 * produced, measured as the host would hand it to Temporal (its encoded state, its publication batches, the Activities
 * and Timers its open waits need, and the Continue-As-New argument that would carry it), before anything is committed,
 * published or started. A candidate over a bound is refused whole (`capacity.ts`).
 */
import { CapacityBound, canonicalBytes, capacityCode, chainRefusal, objectBytes } from "./capacity.js";
import { RunKind, Scheduling, type HostConfig } from "./host-contract.js";
import { planHost } from "./host-machine.js";
import type { PopulationCarry, PopulationScope } from "./population-contract.js";
import type { HostView, KernelPort } from "./port.js";
import { appendJournal, lastBatchBytes, type PublicationCursor, type PublicationLog } from "./publication.js";

/** What every candidate of one Run shares; `programBytes` is the wire program's, measured once. */
export interface ChainFrame<P, S, I> {
  readonly port: KernelPort<P, S, I>;
  readonly program: P;
  readonly programBytes: number;
  readonly config: HostConfig;
  readonly population: PopulationScope | null;
  /** The Run's ordinal in its chain, from 1. */
  readonly run: number;
}

/** A candidate the host may commit with its view and appended log, or why not; `capacity` marks a host refusal. */
export type Judged<S> =
  | { readonly committed: true; readonly state: S; readonly view: HostView; readonly log: PublicationLog }
  | { readonly committed: false; readonly rejected: boolean; readonly outcome: string; readonly code: string; readonly capacity: boolean };

/** A capacity refusal: no kernel verdict, so `unsupported`; a caller's Update is refused with it in its validator. */
export function capacityRefusal(bound: CapacityBound): Judged<never> {
  return { committed: false, rejected: false, outcome: "unsupported", code: capacityCode(bound), capacity: true };
}

/** The bytes of the Continue-As-New argument that would carry a state of `stateBytes` with `cursor` and `carry`. */
export function continuationBytes<P, S, I>(frame: ChainFrame<P, S, I>, stateBytes: number, cursor: PublicationCursor,
  carry: PopulationCarry): number {
  return objectBytes({
    kind: canonicalBytes(RunKind.Continue),
    program: frame.programBytes,
    config: canonicalBytes(frame.config),
    population: canonicalBytes(frame.population),
    state: stateBytes,
    cursor: canonicalBytes(cursor),
    carry: canonicalBytes(carry),
    run: canonicalBytes(frame.run + 1),
  });
}

/**
 * The committed `state` of input `commandId` judged against every chain bound. `carryOf` is what the chain would carry
 * beside the state once the candidate committed, given its view. Activities and Timers count only under durable
 * scheduling, the only one that starts them.
 */
export function judgeCommitted<P, S, I>(frame: ChainFrame<P, S, I>, log: PublicationLog, commandId: string, state: S,
  carryOf: (view: HostView) => PopulationCarry): Judged<S> {
  const view = frame.port.hostView(frame.program, state);
  const next = appendJournal(log, commandId, view.journal);
  const stateBytes = canonicalBytes(frame.port.encodeState(state));
  const plan = frame.config.scheduling === Scheduling.Durable
    ? planHost(view, { timers: new Set(), effects: new Set() }, (wait) => frame.port.scriptOf(frame.program, wait), true)
    : null;
  const refused = chainRefusal({
    stateBytes,
    batchBytes: lastBatchBytes(log, next),
    activityRequestBytes: plan === null ? [] : [...plan.startEffects, ...plan.evaluateScripts].map(canonicalBytes),
    timers: plan?.armTimers.length ?? 0,
    continuationBytes: continuationBytes(frame, stateBytes, next.cursor, carryOf(view)),
  });
  return refused === null ? { committed: true, state, view, log: next } : capacityRefusal(refused);
}
