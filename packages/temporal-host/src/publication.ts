/**
 * Publication derived from the kernel journal, the state relation the host preserves
 * ([proposal](../../../docs/LEAN-KERNEL-REWRITE-PROPOSAL.md#temporal-hosting-and-refinement-preflight)).
 *
 * Every micro-step of a committed input is one revision, numbered across the whole Workflow chain. Each input yields
 * an execution batch, one transition per micro-step with its cause as role, and a flow-node-occurrence batch over the
 * same revisions holding the micro-steps that started or ended occurrences, empty when none did, so both publications
 * page in step. Occurrences keep the kernel's `OccurrenceKey` as their identity; revisions only position them. A Run
 * retains the batches it published; the cursor alone crosses Continue-As-New, so a reader asking for a revision before
 * the Run's first is told it is a gap.
 */
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
}

export function openLog(cursor: PublicationCursor): PublicationLog {
  return { base: cursor.revision, cursor, execution: [], occurrences: [] };
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
  return {
    base: log.base,
    cursor: { revision: throughRevision, sourceTypes: [...sourceTypes] },
    execution: [...log.execution, batch(execution)],
    occurrences: [...log.occurrences, batch(occurrences)],
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

/** The first `limit` input batches with revisions after `afterRevision`; a batch is never split. */
export function readPage(log: PublicationLog, afterRevision: number, limit: number): PublicationPage {
  if (afterRevision < log.base) return { kind: PageKind.Gap, retainedAfterRevision: log.base };
  const after = (batch: Batch<unknown>) => batch.throughRevision > afterRevision;
  return {
    kind: PageKind.Available,
    headRevision: log.cursor.revision,
    execution: log.execution.filter(after).slice(0, limit),
    occurrences: log.occurrences.filter(after).slice(0, limit),
  };
}
