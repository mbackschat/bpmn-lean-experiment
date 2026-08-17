import type {
  ExecutionPublicationPage,
} from "@bpmn-lean/platform-contracts";
import type {
  PostgresqlSession,
} from "@bpmn-lean/platform-postgresql-runtime";

import {
  ExecutionPublicationProjectionStatus,
} from "./execution-publication-contracts.js";
import type {
  ExecutionPublicationProjectionImage,
} from "./execution-publication-contracts.js";
import {
  applyExecutionPublicationPage,
  createEmptyExecutionPublicationProjection,
  projectionIdentityFromRegistration,
} from "./execution-publication-projection.js";
import {
  insertExecutionPublicationBatches,
  readStoredExecutionPublication,
  sameCanonicalValue,
  writeExecutionPublicationHeader,
} from "./execution-publication-storage.js";
import type { OperateProcessRegistration } from "./incident-contracts.js";
import { PostgresqlOperateRecoveryFenceError } from "./postgresql-operate-recovery-step.js";

/** Applies one prepared suffix inside the caller's existing lease-fenced transaction. */
export async function applyPreparedExecutionPublicationPage(
  session: PostgresqlSession,
  expectedRegistration: OperateProcessRegistration,
  expectedImage: ExecutionPublicationProjectionImage | null,
  page: ExecutionPublicationPage,
): Promise<void> {
  const stored = await readStoredExecutionPublication(
    session,
    expectedRegistration.instance.processInstanceId,
    true,
  );
  if (
    stored === null ||
    !sameCanonicalValue(stored.registration, expectedRegistration) ||
    !sameCanonicalValue(stored.image, expectedImage)
  ) {
    throw new PostgresqlOperateRecoveryFenceError();
  }
  const prior = stored.image ?? createEmptyExecutionPublicationProjection(
    projectionIdentityFromRegistration(expectedRegistration),
  );
  const next = applyExecutionPublicationPage(prior, page);
  const completeObservation = next.status === ExecutionPublicationProjectionStatus.Healthy &&
    next.current !== null &&
    next.headRevision === next.producerHeadRevision;
  if (sameCanonicalValue(prior, next) && !completeObservation) return;
  await writeExecutionPublicationHeader(session, next, completeObservation);
  await insertExecutionPublicationBatches(
    session,
    next.identity.processInstanceId,
    next.batches.slice(prior.batches.length),
  );
}
