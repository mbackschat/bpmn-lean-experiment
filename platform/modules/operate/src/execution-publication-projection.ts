import type {
  ExecutionPublicationPage,
  PublicationIdentity,
} from "@bpmn-lean/platform-contracts";
import {
  publicationIdentityForPublicProcessInstance,
  serializeCanonicalExecutionPublicationValue,
} from "@bpmn-lean/platform-contracts";

import {
  ExecutionPublicationIntegrityError,
  ExecutionPublicationProjectionStatus,
} from "./execution-publication-contracts.js";
import type {
  ExecutionPublicationProjectionImage,
} from "./execution-publication-contracts.js";
import type { OperateProcessRegistration } from "./incident-contracts.js";

export function createEmptyExecutionPublicationProjection(
  identity: PublicationIdentity,
): ExecutionPublicationProjectionImage {
  return {
    identity: structuredClone(identity),
    status: ExecutionPublicationProjectionStatus.Healthy,
    headRevision: 0,
    producerHeadRevision: null,
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
      if (record.revision !== headRevision + 1) {
        throw integrity("publication record revision is not contiguous");
      }
      headRevision = record.revision;
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

  // A head page may carry no `current` when the engine's head moved while it read the state; the state already
  // retained at this same revision is still the state committed there, so it is kept rather than discarded.
  const retainedCurrent = prior.current !== null && prior.current.revision === headRevision
    ? prior.current
    : null;
  const current = page.current === null ? retainedCurrent : structuredClone(page.current);
  if (current !== null) {
    if (current.revision !== headRevision) {
      throw integrity("publication current is not the projected head");
    }
    if (retainedCurrent !== null && !sameJson(retainedCurrent, current)) {
      throw integrity("publication current state changed at an accepted revision");
    }
  }
  return {
    identity: prior.identity,
    status: ExecutionPublicationProjectionStatus.Healthy,
    headRevision,
    producerHeadRevision: page.headRevision,
    batches,
    current,
  };
}

export function projectionIdentityFromRegistration(
  registration: Pick<OperateProcessRegistration, "instance">,
): PublicationIdentity {
  return publicationIdentityForPublicProcessInstance(registration.instance);
}

function requireSameIdentity(
  expected: PublicationIdentity,
  page: ExecutionPublicationPage,
): void {
  const actual = {
    definition: page.definition,
    processInstanceId: page.processInstanceId,
  };
  if (!sameJson(expected, actual)) {
    throw integrity("publication public identity changed");
  }
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
