/**
 * The bytes a population fan-out's answer takes as it grows ([capacity table](../../../docs/TEMPORAL-PROCESS-LIFECYCLE-SPEC.md#workflow-chain-capacity)):
 * each entry measured once as the driver (`population.ts`) records it, and the room a receiver needs before it is
 * reached, so a fan-out stops by its answer's bytes as it stops at the receiver cap and every answer fits the Query
 * bound within the ingress's answer reserve (`answerReserve`).
 */
import { canonicalBytes } from "./capacity.js";
import type { Finish, InFlight, IngressState, Phase } from "./population.js";
import type { JsonValue, PopulationPort, ResolutionParts, Wire } from "./port.js";

/**
 * What a fan-out's entries make of its item's settled ledger entry, kept as each is recorded so none is measured twice:
 * `growth` is that entry's bytes were it to settle now, less the identifiers its queue entry carried (`answerReserve`),
 * `listBytes` what the entry list adds with its first entry (a committed delivery leaves out an empty `cascade`), and
 * `instanceIdBytes` the longest identity of an instance the fan-out started, which a later receiver may name.
 */
export interface AnswerBytes {
  readonly growth: number;
  readonly entries: number;
  readonly listBytes: number;
  readonly instanceIdBytes: number;
}

/** The bytes a committed delivery's resolution adds with a first cascade entry: `,"cascade":[]` around it. */
const cascadeListBytes = canonicalBytes({ kind: "", cascade: [] }) - canonicalBytes({ kind: "" });

/** The fan-out of `machine` as its item's answer begins: measured once, with the entries `finish` already holds. */
export function fanningOut<P, S, M>(port: PopulationPort<P, S, M>, current: InFlight<M>, machine: M, budget: number, finish: Finish,
  instanceIdBytes = 0): Phase<M> {
  const item = current.item;
  if (finish.kind === "emit") {
    if (item.kind !== "emit") throw new TypeError("only an emit cascades its hand-off");
    const { workflowId, commandId } = item.reference;
    const growth = canonicalBytes({ kind: "emit", workflowId, commandId, entries: [] }) - canonicalBytes(workflowId) - canonicalBytes(commandId);
    return { kind: "fanOut", machine, budget, finish, spent: false, answer: { growth, entries: 0, listBytes: 0, instanceIdBytes } };
  }
  if (item.kind !== "command" || current.view === null) throw new TypeError("only a command resolves");
  const parts: ResolutionParts = finish.kind === "fanOut"
    ? { kind: "fanOut", entries: finish.prefix } : { kind: "committed", target: finish.target, cascade: [] };
  const answer = {
    commandId: current.view.commandId, ordinal: current.ordinal, atMs: current.atMs, resolution: port.renderResolution(parts),
    chain: finish.kind === "committed" ? finish.chain : null,
  };
  const growth = canonicalBytes({ kind: "command", commandId: answer.commandId, digest: item.digest, answer }) -
    canonicalBytes(item.commandId) - canonicalBytes(item.digest);
  const entries = finish.kind === "fanOut" ? finish.prefix.length : 0;
  return { kind: "fanOut", machine, budget, finish, spent: false,
    answer: { growth, entries, listBytes: finish.kind === "committed" ? cascadeListBytes : 0, instanceIdBytes } };
}

/** `bytes` with one more entry of `entryBytes`. */
export function withEntry(bytes: AnswerBytes, entryBytes: number): AnswerBytes {
  return { ...bytes, growth: bytes.growth + entryBytes + (bytes.entries === 0 ? bytes.listBytes : 1), entries: bytes.entries + 1 };
}

export function entryBytes<P, S, M>(port: PopulationPort<P, S, M>, entry: Wire): number {
  return canonicalBytes((port.renderEntries([entry]) as readonly JsonValue[])[0]);
}

/**
 * The largest stop entry a later receiver may need: its instance is a registered chain's or one this fan-out started,
 * and its element or start event one of a registered program's (`RegistryEntry.identifierBytes`).
 */
export function stopRoom<P, S, M>(port: PopulationPort<P, S, M>, state: IngressState<M>, instanceIdBytes: number): number {
  const instances = state.registrations.reduce((longest, entry) => Math.max(longest, canonicalBytes(entry.processInstanceId)), instanceIdBytes);
  const identifiers = state.registry.reduce((longest, entry) => Math.max(longest, entry.identifierBytes), 0);
  return port.stopEntryBytes(instances, identifiers);
}

/**
 * Whether the fan-out may record an entry of `bytes` and still stop at any later receiver within `limit`, the most an
 * answer may grow the ingress (`answerReserve`), which keeps a command's `populationResult` within the Query bound.
 * `instanceIdBytes` is the identity the entry's receiver starts, if any.
 */
export function roomFor<P, S, M>(port: PopulationPort<P, S, M>, state: IngressState<M>, phase: Extract<Phase<M>, { kind: "fanOut" }>,
  bytes: number, instanceIdBytes: number, limit: number): boolean {
  const started = Math.max(phase.answer.instanceIdBytes, instanceIdBytes);
  return withEntry(withEntry(phase.answer, bytes), stopRoom(port, state, started)).growth <= limit;
}

/** Whether a fan-out just begun could stop at its first receiver within `limit`; one that could not is refused before any. */
export function stoppable<P, S, M>(port: PopulationPort<P, S, M>, state: IngressState<M>, phase: Phase<M>, limit: number): boolean {
  if (phase.kind !== "fanOut") return true;
  return withEntry(phase.answer, stopRoom(port, state, phase.answer.instanceIdBytes)).growth <= limit;
}

/** The fan-out with no receiver left to spend, so it stops at the receiver it was about to reach, by the answer's bytes. */
export function spent<P, S, M>(port: PopulationPort<P, S, M>, phase: Extract<Phase<M>, { kind: "fanOut" }>): Phase<M> {
  return { ...phase, machine: port.fanOutSpent(phase.machine), spent: true };
}

/** The phase with the entry `entry` recorded for the receiver it reached, measured once. */
export function recorded<P, S, M>(port: PopulationPort<P, S, M>, phase: Extract<Phase<M>, { kind: "fanOut" }>, entry: Wire,
  intents: readonly Wire[], emitter: string, instanceIdBytes = 0): Phase<M> {
  const answer = withEntry(phase.answer, entryBytes(port, entry));
  return { ...phase, machine: port.fanOutRecord(phase.machine, entry, intents, emitter),
    answer: { ...answer, instanceIdBytes: Math.max(answer.instanceIdBytes, instanceIdBytes) } };
}
