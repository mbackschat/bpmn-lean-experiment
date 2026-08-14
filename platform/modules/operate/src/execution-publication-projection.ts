import type {
  CommittedTransitionRecord,
  CurrentCommittedExecution,
  ExecutionPublicationIdentity,
  ExecutionPublicationPage,
} from "@bpmn-lean/platform-contracts";
import { serializeCanonicalExecutionPublicationValue } from "@bpmn-lean/platform-contracts";
import { executionPublicationIdentityForPublicProcessInstance } from "@bpmn-lean/platform-contracts";

import {
  ExecutionPublicationIntegrityError,
  ExecutionPublicationProjectionStatus,
} from "./execution-publication-contracts.js";
import type {
  ExecutionPublicationProjectionImage,
} from "./execution-publication-contracts.js";
import type { OperateProcessRegistration } from "./incident-contracts.js";

type PublicControlPositionDelta = CommittedTransitionRecord["positionDelta"];
type PublicControlTokenPosition = CurrentCommittedExecution["controlTokens"][number];
type PublicScopePosition = CurrentCommittedExecution["scopes"][number];
type ScopeOccurrenceId = PublicScopePosition["id"];

export function createEmptyExecutionPublicationProjection(
  identity: ExecutionPublicationIdentity,
): ExecutionPublicationProjectionImage {
  return {
    identity: structuredClone(identity),
    status: ExecutionPublicationProjectionStatus.Healthy,
    headRevision: 0,
    producerHeadRevision: null,
    lastLogicalTimeMs: null,
    controlTokens: [],
    scopes: [],
    batches: [],
    current: null,
  };
}

/** Validates one complete authoritative page against the retained prefix before advancing. */
export function applyExecutionPublicationPage(
  priorValue: ExecutionPublicationProjectionImage,
  pageValue: ExecutionPublicationPage,
): ExecutionPublicationProjectionImage {
  const prior = structuredClone(priorValue);
  const page = structuredClone(pageValue);
  requireSameIdentity(prior.identity, page);
  if (
    page.requestedAfterRevision > prior.headRevision ||
    page.pageThroughRevision < prior.headRevision ||
    (prior.producerHeadRevision !== null &&
      page.headRevision < prior.producerHeadRevision)
  ) {
    throw integrity("publication cursor or producer head is not monotonic");
  }

  const batches = [...prior.batches];
  let headRevision = prior.headRevision;
  let lastLogicalTimeMs = prior.lastLogicalTimeMs;
  const controlTokens = [...prior.controlTokens];
  const scopes = [...prior.scopes];
  for (const batch of page.batches) {
    if (batch.throughRevision <= prior.headRevision) {
      const retained = batches.find(({ fromRevision }) =>
        fromRevision === batch.fromRevision
      );
      if (retained === undefined || !sameJson(retained, batch)) {
        throw integrity("overlapping publication batch changed");
      }
      continue;
    }
    if (batch.fromRevision !== headRevision) {
      throw integrity("publication suffix skipped or split a committed batch");
    }
    for (const record of batch.transitions) {
      if (
        record.revision !== headRevision + 1 ||
        (lastLogicalTimeMs !== null && record.logicalTimeMs < lastLogicalTimeMs)
      ) {
        throw integrity("publication record revision or logical time is not contiguous");
      }
      applyPositionDelta(controlTokens, scopes, record.positionDelta);
      headRevision = record.revision;
      lastLogicalTimeMs = record.logicalTimeMs;
    }
    if (headRevision !== batch.throughRevision) {
      throw integrity("publication batch range disagrees with its records");
    }
    batches.push(batch);
  }
  if (headRevision !== page.pageThroughRevision) {
    throw integrity("publication page does not end at the projected head");
  }
  if (page.headRevision > headRevision && page.batches.length === 0) {
    throw integrity("publication producer omitted an available suffix");
  }

  const current = page.current === null ? null : structuredClone(page.current);
  if (current !== null) {
    requireCurrentMatches(
      current,
      headRevision,
      lastLogicalTimeMs,
      controlTokens,
      scopes,
    );
  }
  return {
    identity: prior.identity,
    status: ExecutionPublicationProjectionStatus.Healthy,
    headRevision,
    producerHeadRevision: page.headRevision,
    lastLogicalTimeMs,
    controlTokens,
    scopes,
    batches,
    current,
  };
}

export function projectionIdentityFromRegistration(
  registration: Pick<OperateProcessRegistration, "instance">,
): ExecutionPublicationIdentity {
  return executionPublicationIdentityForPublicProcessInstance(registration.instance);
}

function requireSameIdentity(
  expected: ExecutionPublicationIdentity,
  page: ExecutionPublicationPage,
): void {
  const actual = {
    definition: page.definition,
    processId: page.processId,
    processInstanceId: page.processInstanceId,
  };
  if (!sameJson(expected, actual)) {
    throw integrity("publication public identity changed");
  }
}

function applyPositionDelta(
  controlTokens: PublicControlTokenPosition[],
  scopes: PublicScopePosition[],
  delta: PublicControlPositionDelta,
): void {
  for (const entered of delta.enteredScopes) {
    if (scopes.some(({ id }) => sameScope(id, entered.id))) {
      throw integrity("publication entered an already-live scope");
    }
    scopes.push(entered);
  }
  for (const consumed of delta.consumedTokens) {
    const index = controlTokens.findIndex((token) => sameToken(token, consumed));
    const existing = controlTokens[index];
    if (existing === undefined || existing.multiplicity < consumed.multiplicity) {
      throw integrity("publication consumed an unavailable token");
    }
    const remaining = existing.multiplicity - consumed.multiplicity;
    controlTokens.splice(index, 1);
    if (remaining > 0) controlTokens.push({ ...existing, multiplicity: remaining });
  }
  for (const produced of delta.producedTokens) {
    if (!scopes.some(({ id }) => sameScope(id, produced.owner))) {
      throw integrity("publication produced a token outside a live scope");
    }
    const index = controlTokens.findIndex((token) => sameToken(token, produced));
    const existing = controlTokens[index];
    if (existing === undefined) {
      controlTokens.push(produced);
      continue;
    }
    const multiplicity = existing.multiplicity + produced.multiplicity;
    if (!Number.isSafeInteger(multiplicity)) {
      throw integrity("publication token multiplicity is exhausted");
    }
    controlTokens.splice(index, 1, { ...existing, multiplicity });
  }
  for (const exited of delta.exitedScopes) {
    const index = scopes.findIndex(({ id }) => sameScope(id, exited.id));
    const existing = scopes[index];
    if (
      existing === undefined ||
      !sameScopePosition(existing, exited) ||
      controlTokens.some(({ owner }) => sameScope(owner, exited.id))
    ) {
      throw integrity("publication exited a nonempty or different scope");
    }
    scopes.splice(index, 1);
  }
}

function requireCurrentMatches(
  current: CurrentCommittedExecution,
  headRevision: number,
  lastLogicalTimeMs: number | null,
  controlTokens: readonly PublicControlTokenPosition[],
  scopes: readonly PublicScopePosition[],
): void {
  if (
    current.revision !== headRevision ||
    lastLogicalTimeMs === null ||
    current.state.logicalTimeMs !== lastLogicalTimeMs ||
    !sameSet(controlTokens, current.controlTokens, sameTokenWithMultiplicity) ||
    !sameSet(scopes, current.scopes, sameScopePosition)
  ) {
    throw integrity("publication current head disagrees with the folded suffix");
  }
}

function sameToken(
  left: PublicControlTokenPosition,
  right: PublicControlTokenPosition,
): boolean {
  return left.sequenceFlowId === right.sequenceFlowId &&
    sameScope(left.owner, right.owner);
}

function sameTokenWithMultiplicity(
  left: PublicControlTokenPosition,
  right: PublicControlTokenPosition,
): boolean {
  return sameToken(left, right) && left.multiplicity === right.multiplicity;
}

function sameScopePosition(
  left: PublicScopePosition,
  right: PublicScopePosition,
): boolean {
  return sameScope(left.id, right.id) &&
    left.bpmnElementId === right.bpmnElementId &&
    ((left.parent === null && right.parent === null) ||
      (left.parent !== null && right.parent !== null &&
        sameScope(left.parent, right.parent)));
}

function sameScope(left: ScopeOccurrenceId, right: ScopeOccurrenceId): boolean {
  return left.processInstanceId === right.processInstanceId &&
    left.definitionScopeId === right.definitionScopeId &&
    left.activation === right.activation;
}

function sameSet<T>(
  left: readonly T[],
  right: readonly T[],
  same: (left: T, right: T) => boolean,
): boolean {
  if (left.length !== right.length) return false;
  const unmatched = [...right];
  for (const item of left) {
    const index = unmatched.findIndex((candidate) => same(item, candidate));
    if (index < 0) return false;
    unmatched.splice(index, 1);
  }
  return unmatched.length === 0;
}

function sameJson(left: unknown, right: unknown): boolean {
  const leftBytes = serializeCanonicalExecutionPublicationValue(left);
  const rightBytes = serializeCanonicalExecutionPublicationValue(right);
  return leftBytes.length === rightBytes.length &&
    leftBytes.every((byte, index) => byte === rightBytes[index]);
}

function integrity(message: string): ExecutionPublicationIntegrityError {
  return new ExecutionPublicationIntegrityError(message);
}
