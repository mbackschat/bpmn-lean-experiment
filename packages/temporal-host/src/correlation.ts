/**
 * Correlated Message routing, the host's pure decisions: which open waits a process registers with the ingress of a
 * correlation address, how the ingress keeps those registrations and its publication ledger, and how one publication
 * resolves from the waits that match it.
 *
 * A correlation address is the caller's correlation scope (the deployed definition an instance runs, opaque to the
 * host) and a Message channel; one ingress serializes the publications to it. Registrations only say which process
 * chains may hold a matching wait: a publication asks each registered chain which of its open waits the kernel
 * matches against the instance's current values (`Kernel.Population.matching`), so a stale registration costs a query
 * and never selects a target. Exactly one matching wait is delivered to; zero or several reject the publication and
 * change no instance, as the kernel's own population layer does, and the target rechecks the delivery.
 *
 * Nothing here touches Temporal or hashing, so the Workflow, the in-memory host and their tests share it.
 */
import type { CommandResult, CorrelatedPublication, CorrelationTarget, PublicationResult } from "./host-contract.js";
import { PublicationOutcome, correlationAmbiguousCode, notCorrelatedCode } from "./host-contract.js";
import type { HostView, JsonValue, OccurrenceId } from "./port.js";

/** JSON with every object's keys sorted, so equal values compare equal as text. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, member: unknown) =>
    member !== null && typeof member === "object" && !Array.isArray(member)
      ? Object.fromEntries(Object.keys(member).sort().map((key) => [key, (member as Record<string, unknown>)[key]]))
      : member);
}

/** The identity of one correlation address; the Temporal realization hashes it into the ingress Workflow ID. */
export function ingressKey(correlationScope: string, channel: JsonValue): string {
  return canonicalJson(["correlationIngress", correlationScope, channel]);
}

/** The correlated waits a process holds on one channel. */
export interface ChannelWaits {
  readonly channel: JsonValue;
  readonly waits: readonly OccurrenceId[];
}

/**
 * The open correlated waits of a view by channel key: a wait whose view publishes correlation criteria is a correlated
 * Message subscription. A view of an ended instance, or none, holds none.
 */
export function correlatedWaits(view: HostView | null): ReadonlyMap<string, ChannelWaits> {
  const byChannel = new Map<string, ChannelWaits>();
  if (view === null || view.status !== "running") return byChannel;
  for (const wait of view.openWaits) {
    if (wait.channel === undefined || wait.criteria === undefined || wait.criteria.length === 0) continue;
    const key = canonicalJson(wait.channel);
    const entry = byChannel.get(key);
    byChannel.set(key, { channel: wait.channel, waits: [...(entry?.waits ?? []), wait.id] });
  }
  return byChannel;
}

/** What a process last registered with the ingress of one channel, carried across Continue-As-New. */
export interface Registered {
  readonly key: string;
  readonly channel: JsonValue;
  readonly waits: readonly OccurrenceId[];
}

/**
 * The registrations `desired` needs beyond `registered`: each channel whose waits changed, an emptied channel with no
 * waits, so its ingress forgets the process.
 */
export function registrationsDue(desired: ReadonlyMap<string, ChannelWaits>, registered: readonly Registered[]): Registered[] {
  const due: Registered[] = [];
  for (const [key, entry] of desired) {
    const held = registered.find((candidate) => candidate.key === key);
    if (held === undefined || canonicalJson(held.waits) !== canonicalJson(entry.waits)) {
      due.push({ key, channel: entry.channel, waits: entry.waits });
    }
  }
  for (const held of registered) {
    if (!desired.has(held.key) && held.waits.length > 0) due.push({ key: held.key, channel: held.channel, waits: [] });
  }
  return due;
}

/** `registered` after the ingress acknowledged `done`; an emptied channel is dropped. */
export function afterRegistration(registered: readonly Registered[], done: Registered): Registered[] {
  const others = registered.filter((entry) => entry.key !== done.key);
  return done.waits.length === 0 ? others : [...others, done];
}

/**
 * One process's registration with an ingress. `revision` is the process's publication revision when it computed the
 * waits, monotonic across its chain, so a delayed attempt never overwrites a later registration.
 */
export interface Registration {
  readonly workflowId: string;
  readonly revision: number;
  readonly waits: readonly OccurrenceId[];
}

/** The registration Activity's request: the correlation address and the registration to apply there. */
export interface RegistrationRequest {
  readonly correlationScope: string;
  readonly channel: JsonValue;
  readonly registration: Registration;
}

/** What one candidate chain answered: its matching waits, or `null` when the chain no longer exists. */
export interface CandidateMatches {
  readonly workflowId: string;
  readonly occurrences: readonly OccurrenceId[] | null;
}

/** What a process is asked: the channel and the correlation a delivery would carry, in the scenario contract's form. */
export interface CorrelationQuestion {
  readonly channel: JsonValue;
  readonly correlation: JsonValue;
}

export interface ScanRequest {
  readonly candidates: readonly string[];
  readonly question: CorrelationQuestion;
}

export interface TargetDelivery {
  readonly workflowId: string;
  readonly stimulus: JsonValue;
}

/** A settled publication, kept so a repeated command is answered rather than delivered twice. */
export interface LedgerEntry {
  readonly commandId: string;
  readonly content: string;
  readonly result: PublicationResult;
}

export interface IngressState {
  /** The ordinal of the last publication taken, numbering them in arrival order from 1. */
  readonly ordinal: number;
  readonly registrations: readonly Registration[];
  readonly ledger: readonly LedgerEntry[];
}

export const emptyIngress: IngressState = { ordinal: 0, registrations: [], ledger: [] };

/**
 * How many settled publications an ingress remembers for deduplication; a command repeated after its entry left the
 * ledger is routed afresh.
 */
export const ledgerCapacity = 1_024;

/** `state` with `registration` applied: a later or equal revision replaces the chain's, and no waits removes it. */
export function register(state: IngressState, registration: Registration): IngressState {
  const held = state.registrations.find((entry) => entry.workflowId === registration.workflowId);
  if (held !== undefined && held.revision > registration.revision) return state;
  const others = state.registrations.filter((entry) => entry.workflowId !== registration.workflowId);
  return { ...state, registrations: registration.waits.length === 0 ? others : [...others, registration] };
}

/** The chains a publication asks, in registration order. */
export function candidates(state: IngressState): string[] {
  return state.registrations.map((entry) => entry.workflowId);
}

/** `state` without the chains a scan found gone. */
export function forget(state: IngressState, scanned: readonly CandidateMatches[]): IngressState {
  const gone = new Set(scanned.filter((entry) => entry.occurrences === null).map((entry) => entry.workflowId));
  return gone.size === 0 ? state : { ...state, registrations: state.registrations.filter((entry) => !gone.has(entry.workflowId)) };
}

/** What identifies a publication's content: a repeated command must repeat it exactly. */
export function publicationContent(publication: CorrelatedPublication): string {
  return canonicalJson([publication.correlationScope, publication.channel, publication.correlation, publication.payload]);
}

/** The settled result of `commandId`, an identity conflict when it settled with other content, `null` when unseen. */
export function recorded(state: IngressState, commandId: string, content: string): PublicationResult | null {
  const entry = state.ledger.find((candidate) => candidate.commandId === commandId);
  if (entry === undefined) return null;
  return entry.content === content ? entry.result : { kind: PublicationOutcome.IdentityConflict };
}

export function settle(state: IngressState, entry: LedgerEntry): IngressState {
  return { ...state, ledger: [...state.ledger, entry].slice(-ledgerCapacity) };
}

export enum Routing {
  None = "none",
  One = "one",
  Many = "many",
}

export type Routed =
  | { readonly kind: Routing.None }
  | { readonly kind: Routing.One; readonly target: CorrelationTarget }
  | { readonly kind: Routing.Many; readonly matches: number };

/** Exactly one matching wait across every candidate is a target; order never picks a winner among several. */
export function route(scanned: readonly CandidateMatches[]): Routed {
  const matches = scanned.flatMap((entry) =>
    (entry.occurrences ?? []).map((occurrence) => ({ workflowId: entry.workflowId, occurrence })));
  const [only] = matches;
  if (matches.length === 0) return { kind: Routing.None };
  return matches.length === 1 && only !== undefined ? { kind: Routing.One, target: only } : { kind: Routing.Many, matches: matches.length };
}

/** The result of a publication no single wait matched. */
export function unrouted(ordinal: number, routed: Exclude<Routed, { readonly kind: Routing.One }>): PublicationResult {
  switch (routed.kind) {
    case Routing.None: return { kind: PublicationOutcome.NotCorrelated, ordinal, code: notCorrelatedCode };
    case Routing.Many: return { kind: PublicationOutcome.Ambiguous, ordinal, code: correlationAmbiguousCode, matches: routed.matches };
  }
}

/** The result of delivering to the sole matching wait: the target's own verdict on the delivery. */
export function delivered(ordinal: number, target: CorrelationTarget, result: CommandResult): PublicationResult {
  return result.outcome === "committed"
    ? { kind: PublicationOutcome.Delivered, ordinal, target }
    : { kind: PublicationOutcome.TargetRefused, ordinal, target, outcome: result.outcome, code: result.code ?? result.outcome };
}

/** The delivery stimulus that carries `publication` to the wait `occurrence`. */
export function deliveryStimulus(publication: CorrelatedPublication, occurrence: OccurrenceId): JsonValue {
  return {
    kind: "deliver",
    commandId: publication.commandId,
    occurrence: { processInstanceId: occurrence.processInstanceId, elementId: occurrence.elementId, activation: occurrence.activation },
    trigger: { kind: "message", channel: publication.channel },
    correlation: publication.correlation,
    ...(publication.payload === null ? {} : { payload: publication.payload }),
  };
}

export function question(publication: CorrelatedPublication): CorrelationQuestion {
  return { channel: publication.channel, correlation: publication.correlation };
}
