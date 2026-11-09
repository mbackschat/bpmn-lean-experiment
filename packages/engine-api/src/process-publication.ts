/**
 * Committed publication of one process chain: the execution batches (one transition per kernel micro-step, its cause
 * as role) and the flow-node-occurrence batches the host derives from the kernel journal, paged by revision. An
 * execution page that reaches the head also carries the committed state at that head. A chain that no longer retains
 * a requested revision answers with a gap. The caller names the definition and instance it expects; a chain that
 * retains another is an integrity failure, never a page.
 */
import { PageKind, type Batch, type ExecutionTransition, type OccurrenceTransition } from "@bpmn-lean/temporal-host/host";

import { requireWireString, type EngineDefinitionIdentity } from "./common.js";
import type { EngineHost } from "./host.js";
import type { EngineStateObservation } from "./process-observation.js";
import { engineProcessLocatorWorkflowId, parseEngineProcessLocator, type EngineProcessLocator } from "./process-locator.js";
import { retainedIdentityMatches } from "./start-dispatch.js";

export type EngineExecutionBatch = Batch<ExecutionTransition>;
export type EngineOccurrenceBatch = Batch<OccurrenceTransition>;

export enum EnginePublicationStatus {
  Available = "available",
  Gap = "gap",
  Unknown = "unknown",
  Unavailable = "unavailable",
  IntegrityFailure = "integrityFailure",
}

/** The canonical state observation (`Kernel.Run.observationJson`) as committed at `revision`. */
export type EngineCommittedState = Readonly<{ revision: number; state: EngineStateObservation }>;

export type EnginePublicationResult<B, Head = Readonly<Record<never, never>>> =
  | (Readonly<{ status: EnginePublicationStatus.Available; headRevision: number; batches: readonly B[] }> & Head)
  | Readonly<{ status: EnginePublicationStatus.Gap; retainedAfterRevision: number }>
  | Readonly<{ status: EnginePublicationStatus.Unknown | EnginePublicationStatus.Unavailable }>
  | Readonly<{ status: EnginePublicationStatus.IntegrityFailure; evidence: string }>;

export type EnginePublicationRequest = Readonly<{
  host: EngineHost;
  locator: EngineProcessLocator;
  definition: EngineDefinitionIdentity;
  processInstanceId: string;
  afterRevision: number;
  limit?: number;
}>;

/** `current` is non-null exactly when the page reaches the head and the state read there is still the head's. */
export type EngineExecutionPublicationResult =
  EnginePublicationResult<EngineExecutionBatch, Readonly<{ current: EngineCommittedState | null }>>;

export async function observeEngineProcessExecution(
  request: EnginePublicationRequest,
): Promise<EngineExecutionPublicationResult> {
  const observed = await observe(request, (page) => page.execution);
  if (observed.status !== EnginePublicationStatus.Available) return observed;
  const through = observed.batches.at(-1)?.throughRevision ?? request.afterRevision;
  try {
    const current = through === observed.headRevision && observed.headRevision > 0
      ? await headState(request.host, engineProcessLocatorWorkflowId(request.locator), observed.headRevision)
      : null;
    return { ...observed, current };
  } catch {
    return { status: EnginePublicationStatus.Unavailable };
  }
}

export function observeEngineProcessFlowNodeOccurrences(
  request: EnginePublicationRequest,
): Promise<EnginePublicationResult<EngineOccurrenceBatch>> {
  return observe(request, (page) => page.occurrences);
}

/**
 * The state at `headRevision`. The host answers the state and the publication as separate reads, so the state counts
 * as the head's only when the head has not moved after it was read.
 */
async function headState(host: EngineHost, workflowId: string, headRevision: number): Promise<EngineCommittedState | null> {
  const state = await host.processes.observation(workflowId);
  const confirmed = await host.processes.publication(workflowId, headRevision, 1);
  if (state === null || confirmed.kind !== PageKind.Available || confirmed.headRevision !== headRevision) return null;
  return { revision: headRevision, state: state as unknown as EngineStateObservation };
}

async function observe<B>(
  request: EnginePublicationRequest,
  select: (page: Readonly<{ execution: readonly EngineExecutionBatch[]; occurrences: readonly EngineOccurrenceBatch[] }>) =>
    readonly B[],
): Promise<EnginePublicationResult<B>> {
  const workflowId = engineProcessLocatorWorkflowId(parseEngineProcessLocator(request.locator));
  const processInstanceId = requireWireString(request.processInstanceId, "processInstanceId");
  if (!Number.isSafeInteger(request.afterRevision) || request.afterRevision < 0) {
    throw new RangeError("afterRevision must be a non-negative safe integer");
  }
  const limit = request.limit ?? 100;
  if (!Number.isSafeInteger(limit) || limit <= 0) throw new RangeError("limit must be a positive safe integer");
  try {
    const described = await request.host.processes.describe(workflowId);
    if (described === null) return { status: EnginePublicationStatus.Unknown };
    if (retainedIdentityMatches(described.memo, request.definition, processInstanceId) !== true) {
      return {
        status: EnginePublicationStatus.IntegrityFailure,
        evidence: "The chain behind the locator does not run the expected definition and instance.",
      };
    }
    const page = await request.host.processes.publication(workflowId, request.afterRevision, limit);
    switch (page.kind) {
      case PageKind.Available:
        return { status: EnginePublicationStatus.Available, headRevision: page.headRevision, batches: select(page) };
      case PageKind.Gap:
        return { status: EnginePublicationStatus.Gap, retainedAfterRevision: page.retainedAfterRevision };
    }
  } catch {
    return { status: EnginePublicationStatus.Unavailable };
  }
}
