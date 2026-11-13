/**
 * The Workflow-chain capacity table ([lifecycle specification](../../../docs/TEMPORAL-PROCESS-LIFECYCLE-SPEC.md#workflow-chain-capacity))
 * and its one measure, the UTF-8 bytes of a value's canonical JSON: the bytes Temporal's JSON converter writes for it,
 * since key order does not change a length. Every module that checks a bound reads it here, and no value is raised
 * without reopening the owner-approved table (2026-08-17; the two raises of 2026-11-13, which the owner ratified, are stated there).
 *
 * A bound is checked on the candidate the kernel's step produced, before the host commits it, publishes its journal or
 * starts its work, so an overflow commits nothing; it is refused with `host.capacity.<bound>`, a host restriction,
 * never a meaning of the construct. Rollover triggers are no refusals: they make the Run continue as new.
 */
import { canonicalJson } from "./canonical-json.js";

const KiB = 1_024;
const MiB = 1_024 * KiB;

export const chainCapacity = {
  /** Event History length at which a Run continues as new, unless the program's own budget is lower. */
  historyEvents: 8_000,
  historyBytes: 8 * MiB,
  /** Canonical bytes of the publication batches one Run retains. */
  retainedPublicationBytes: 2 * MiB,
  updatesPerRun: 1_500,
  updatesInFlight: 8,
  pendingActivities: 32,
  pendingTimers: 64,
  programBytes: 192 * KiB,
  startBytes: 64 * KiB,
  /** A caller's input, a population command, or a delivery or start the population derived. */
  stimulusBytes: 64 * KiB,
  /** The encoded kernel state without the last input's journal and outbox (`kernel-port.ts`, `encodeState`). */
  stateBytes: 256 * KiB,
  /** One input's execution and occurrence batches together. */
  publicationBatchBytes: 64 * KiB,
  queryBytes: 192 * KiB,
  effectRequestBytes: 64 * KiB,
  effectResultBytes: 64 * KiB,
  effectFailureBytes: 16 * KiB,
  /** The whole Continue-As-New argument of a process chain or of the population ingress. */
  continuationBytes: 448 * KiB,
  runs: 128,
} as const;

/** The refused bounds; each value is its refusal code's last segment. */
export enum CapacityBound {
  Program = "program",
  Start = "start",
  Stimulus = "stimulus",
  State = "state",
  PublicationBatch = "publicationBatch",
  PendingActivities = "pendingActivities",
  EffectRequest = "effectRequest",
  PendingTimers = "pendingTimers",
  EffectResult = "effectResult",
  EffectFailure = "effectFailure",
  Continuation = "continuation",
  Runs = "runs",
  Updates = "updates",
  UpdatesInFlight = "updatesInFlight",
}

export const capacityCodePrefix = "host.capacity.";

export function capacityCode(bound: CapacityBound): string {
  return `${capacityCodePrefix}${bound}`;
}

/** The UTF-8 length of `text`, counted without encoding it; a lone surrogate counts as the three bytes of U+FFFD. */
export function utf8Bytes(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const unit = text.charCodeAt(i);
    if (unit < 0x80) bytes += 1;
    else if (unit < 0x800) bytes += 2;
    else if (unit >= 0xd800 && unit <= 0xdbff && i + 1 < text.length &&
        text.charCodeAt(i + 1) >= 0xdc00 && text.charCodeAt(i + 1) <= 0xdfff) {
      bytes += 4;
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

export function canonicalBytes(value: unknown): number {
  return utf8Bytes(canonicalJson(value));
}

/**
 * The canonical bytes of an object whose members' values measure `members`, without encoding it again: braces, each
 * quoted key and colon, and the commas between members. A member measured `undefined` is absent, as JSON omits it.
 */
export function objectBytes(members: Readonly<Record<string, number | undefined>>): number {
  const present = Object.entries(members).filter((entry): entry is [string, number] => entry[1] !== undefined);
  const content = present.reduce((sum, [key, value]) => sum + utf8Bytes(JSON.stringify(key)) + 1 + value, 0);
  return 2 + content + Math.max(0, present.length - 1);
}

/** What a process chain's committed candidate would hand Temporal, each measured. */
export interface ChainMeasures {
  readonly stateBytes: number;
  /** The candidate's execution and occurrence batches together; 0 when its journal is empty. */
  readonly batchBytes: number;
  /** The Activities the candidate's open waits need, under durable scheduling; empty otherwise. */
  readonly activityRequestBytes: readonly number[];
  /** The durable Timers its open waits need, under durable scheduling; 0 otherwise. */
  readonly timers: number;
  readonly continuationBytes: number;
}

/** The first bound the candidate exceeds, in this order, or `null` when it fits every one. */
export function chainRefusal(measures: ChainMeasures): CapacityBound | null {
  if (measures.stateBytes > chainCapacity.stateBytes) return CapacityBound.State;
  if (measures.batchBytes > chainCapacity.publicationBatchBytes) return CapacityBound.PublicationBatch;
  if (measures.activityRequestBytes.length > chainCapacity.pendingActivities) return CapacityBound.PendingActivities;
  if (measures.activityRequestBytes.some((bytes) => bytes > chainCapacity.effectRequestBytes)) return CapacityBound.EffectRequest;
  if (measures.timers > chainCapacity.pendingTimers) return CapacityBound.PendingTimers;
  if (measures.continuationBytes > chainCapacity.continuationBytes) return CapacityBound.Continuation;
  return null;
}

/** What a Run has used of Event History, Updates and retained publication. */
export interface RunUsage {
  readonly historyEvents: number;
  readonly historyBytes: number;
  readonly continueAsNewSuggested: boolean;
  readonly updates: number;
  readonly retainedPublicationBytes: number;
}

/**
 * Whether the Run should continue as new: the SDK suggests it, or Event History reaches `eventBudget` (the program's
 * budget, never above `historyEvents` unless a test overrides it) or `historyBytes`, or the Run accepted `updatesPerRun`
 * Updates, or a further batch of up to `publicationBatchBytes` could take the retained publication past its bound.
 * Detection follows an activation, so a Run may overshoot a trigger by the work it drains before it rolls over.
 */
export function rolloverDue(usage: RunUsage, eventBudget: number): boolean {
  return usage.continueAsNewSuggested ||
    usage.historyEvents >= eventBudget ||
    usage.historyBytes >= chainCapacity.historyBytes ||
    usage.updates >= chainCapacity.updatesPerRun ||
    usage.retainedPublicationBytes + chainCapacity.publicationBatchBytes > chainCapacity.retainedPublicationBytes;
}

/**
 * Whether a chain's Run continues as new: a trigger fired (`rolloverDue`) after the Run committed an input, so a budget
 * below a fresh Run's own history cannot chain Runs that make no progress; or it accepted `updatesPerRun` Updates, which
 * a fresh Run never has, so the settlements and wakes a Run receives without committing never take it to Temporal's
 * per-execution Update limit.
 */
export function chainRolloverDue(commits: number, usage: RunUsage, eventBudget: number): boolean {
  return (commits > 0 || usage.updates >= chainCapacity.updatesPerRun) && rolloverDue(usage, eventBudget);
}

/** The event budget of a program whose own budget is `derived`: the table's trigger caps it unless a test overrides it. */
export function eventBudget(derived: number, override: number | null): number {
  return override ?? Math.min(derived, chainCapacity.historyEvents);
}

/**
 * The refusal of a caller's Update before Temporal accepts it: a Run that accepted `updatesPerRun` Updates takes no more
 * until it rolls over, and at most `updatesInFlight` caller Updates, a `settle` included, run at once.
 */
export function updateFence(accepted: number, inFlight: number): CapacityBound | null {
  if (accepted >= chainCapacity.updatesPerRun) return CapacityBound.Updates;
  if (inFlight >= chainCapacity.updatesInFlight) return CapacityBound.UpdatesInFlight;
  return null;
}

/** The ordinal of the Run after `run`, or `null` when the chain would need a Run beyond its bound. */
export function successorRun(run: number): number | null {
  return run + 1 > chainCapacity.runs ? null : run + 1;
}

/**
 * The code a non-retryable Activity failure halts the chain with: its message, or `effectFailure` when the message
 * exceeds the failure projection's bound, so no unbounded cause reaches the result.
 */
export function failureProjection(message: string): string {
  return utf8Bytes(message) > chainCapacity.effectFailureBytes ? capacityCode(CapacityBound.EffectFailure) : message;
}

/** One page of a Query answer's canonical JSON text. */
export interface TextPage {
  /** The whole text's length in UTF-16 code units and a digest of it, so a reader joins pages of one answer only. */
  readonly length: number;
  readonly digest: string;
  readonly from: number;
  readonly text: string;
}

/** The bytes one code point of `text` at `at` takes inside a JSON string, and the code units it spans. */
function escaped(text: string, at: number): readonly [number, number] {
  const unit = text.charCodeAt(at);
  if (unit >= 0xd800 && unit <= 0xdbff && at + 1 < text.length) {
    const low = text.charCodeAt(at + 1);
    if (low >= 0xdc00 && low <= 0xdfff) return [4, 2];
  }
  if (unit === 0x22 || unit === 0x5c) return [2, 1];
  if (unit < 0x20 || (unit >= 0xd800 && unit <= 0xdfff)) return [utf8Bytes(JSON.stringify(text[at]).slice(1, -1)), 1];
  return [utf8Bytes(text[at] ?? ""), 1];
}

/** A 32-bit FNV-1a digest of `text`'s code units: it tells two answers apart for a reader, never for security. */
function digestOf(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * The page of `value`'s canonical JSON text from code unit `from`: the largest prefix of whole code points whose page
 * stays within `queryBytes`. A Query answer that could exceed the bound travels as these pages; `readPages` joins them.
 */
export function textPage(value: unknown, from: number): TextPage {
  const whole = canonicalJson(value) ?? "null";
  const page = { length: whole.length, digest: digestOf(whole), from, text: "" };
  let budget = chainCapacity.queryBytes - canonicalBytes(page);
  let end = Math.max(0, Math.min(from, whole.length));
  while (end < whole.length) {
    const [bytes, units] = escaped(whole, end);
    if (bytes > budget) break;
    budget -= bytes;
    end += units;
  }
  return { ...page, text: whole.slice(from, end) };
}

/**
 * The value `read` pages out, joined from its pages; an answer that changed between two pages is read again from the
 * start, at most `attempts` times, after which the change is an infrastructure fault.
 */
export async function readPages(read: (from: number) => Promise<TextPage>, attempts = 3): Promise<unknown> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const first = await read(0);
    let text = first.text;
    let consistent = true;
    while (text.length < first.length) {
      const next = await read(text.length);
      if (next.digest !== first.digest || next.length !== first.length || next.text.length === 0) {
        consistent = false;
        break;
      }
      text += next.text;
    }
    if (consistent) return JSON.parse(text) as unknown;
  }
  throw new Error(`the paged answer changed in each of ${String(attempts)} reads`);
}
