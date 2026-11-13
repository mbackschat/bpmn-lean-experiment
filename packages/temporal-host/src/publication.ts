/**
 * Publication derived from the kernel journal, the state relation the host preserves
 * ([architecture](../../../docs/kernel/ARCHITECTURE-SPEC.md#temporal-hosting-and-refinement-preflight)).
 *
 * Every micro-step of a committed input is one revision, numbered across the whole Workflow chain. Each input yields
 * an execution batch, one transition per micro-step with its cause as role, and a flow-node-occurrence batch over the
 * same revisions holding the micro-steps that started or ended occurrences, empty when none did, so both publications
 * page in step. Occurrences keep the kernel's `OccurrenceKey` as their identity; revisions only position them. A Run
 * retains the batches it published; the cursor alone crosses Continue-As-New, so a reader asking for a revision before
 * the Run's first is told it is a gap.
 */
import { canonicalBytes, chainCapacity } from "./capacity.js";
import type { CauseView, EndedView, StartedView, TransitionView } from "./port.js";

/**
 * Where numbering stands, and the source type each published element began with: a micro-step can act on an element
 * that began in an earlier input (a join's later arrival, an idle Scope's completion).
 */
export interface PublicationCursor {
  readonly revision: number;
  readonly sourceTypes: readonly (readonly [string, string])[];
}

export const initialCursor: PublicationCursor = { revision: 0, sourceTypes: [] };

export interface ExecutionTransition {
  readonly revision: number;
  readonly role: CauseView;
  readonly element: string | null;
  readonly sourceType: string | null;
  readonly owner: number;
}

export interface OccurrenceTransition {
  readonly revision: number;
  readonly started: readonly StartedView[];
  readonly ended: readonly EndedView[];
}

export interface Batch<T> {
  readonly commandId: string;
  readonly fromRevision: number;
  readonly throughRevision: number;
  readonly transitions: readonly T[];
}

export interface PublicationLog {
  /** The revision the Run began after; earlier revisions belong to previous Runs. */
  readonly base: number;
  readonly cursor: PublicationCursor;
  readonly execution: readonly Batch<ExecutionTransition>[];
  readonly occurrences: readonly Batch<OccurrenceTransition>[];
  /** The canonical bytes of each input's two batches together, in step with `execution`. */
  readonly batchBytes: readonly number[];
  /** Their sum: what the Run retains, which its rollover trigger bounds. */
  readonly retainedBytes: number;
}

export function openLog(cursor: PublicationCursor): PublicationLog {
  return { base: cursor.revision, cursor, execution: [], occurrences: [], batchBytes: [], retainedBytes: 0 };
}

/** The bytes the last input's batches took, 0 when its journal was empty and it appended none. */
export function lastBatchBytes(before: PublicationLog, after: PublicationLog): number {
  return after.batchBytes.length > before.batchBytes.length ? after.batchBytes.at(-1) ?? 0 : 0;
}

export function appendJournal(log: PublicationLog, commandId: string, journal: readonly TransitionView[]): PublicationLog {
  if (journal.length === 0) return log;
  const sourceTypes = new Map(log.cursor.sourceTypes);
  const fromRevision = log.cursor.revision;
  const execution: ExecutionTransition[] = [];
  const occurrences: OccurrenceTransition[] = [];
  journal.forEach((transition, index) => {
    const revision = fromRevision + index + 1;
    for (const fact of transition.started) sourceTypes.set(fact.occurrence.elementId, fact.sourceType);
    execution.push({
      revision,
      role: transition.cause,
      element: transition.element,
      sourceType: transition.element === null ? null : sourceTypes.get(transition.element) ?? null,
      owner: transition.owner,
    });
    if (transition.started.length > 0 || transition.ended.length > 0) {
      occurrences.push({ revision, started: transition.started, ended: transition.ended });
    }
  });
  const throughRevision = fromRevision + journal.length;
  const batch = <T>(transitions: readonly T[]): Batch<T> => ({ commandId, fromRevision, throughRevision, transitions });
  const appended = [batch(execution), batch(occurrences)] as const;
  const bytes = canonicalBytes(appended[0]) + canonicalBytes(appended[1]);
  return {
    base: log.base,
    cursor: { revision: throughRevision, sourceTypes: [...sourceTypes] },
    execution: [...log.execution, appended[0]],
    occurrences: [...log.occurrences, appended[1]],
    batchBytes: [...log.batchBytes, bytes],
    retainedBytes: log.retainedBytes + bytes,
  };
}

export enum PageKind {
  Available = "available",
  Gap = "gap",
}

export type PublicationPage =
  | {
      readonly kind: PageKind.Available;
      readonly headRevision: number;
      readonly execution: readonly Batch<ExecutionTransition>[];
      readonly occurrences: readonly Batch<OccurrenceTransition>[];
    }
  | { readonly kind: PageKind.Gap; readonly retainedAfterRevision: number };

/**
 * The first `limit` inputs' batches with revisions after `afterRevision`, cut to the largest complete prefix whose page
 * stays within the Query bound; a batch is never split. The batch bound keeps one input's batches far below the Query
 * bound, so a page always holds at least one.
 */
export function readPage(log: PublicationLog, afterRevision: number, limit: number): PublicationPage {
  if (afterRevision < log.base) return { kind: PageKind.Gap, retainedAfterRevision: log.base };
  const first = log.execution.findIndex((batch) => batch.throughRevision > afterRevision);
  const empty = { kind: PageKind.Available, headRevision: log.cursor.revision, execution: [], occurrences: [] } as const;
  if (first < 0) return empty;
  let bytes = canonicalBytes(empty);
  let end = first;
  while (end < log.execution.length && end - first < limit) {
    // Each further input adds its two batches and, past the first, a comma in each list.
    const added = (log.batchBytes[end] ?? 0) + (end > first ? 2 : 0);
    if (end > first && bytes + added > chainCapacity.queryBytes) break;
    bytes += added;
    end += 1;
  }
  return { ...empty, execution: log.execution.slice(first, end), occurrences: log.occurrences.slice(first, end) };
}
