import type {
  FlowNodeOccurrencePage,
} from "@bpmn-lean/platform-contracts";
import type {
  PostgresqlSession,
} from "@bpmn-lean/platform-postgresql-runtime";

import {
  applyFlowNodeOccurrencePage,
  createEmptyFlowNodeOccurrenceProjection,
  FlowNodeOccurrenceProjectionStatus,
  occurrenceIdentityFromRegistration,
} from "./flow-node-occurrence-projection.js";
import type {
  FlowNodeOccurrenceProjectionImage,
} from "./flow-node-occurrence-projection.js";
import {
  encodePostgresqlText,
  readPostgresqlOccurrenceSnapshot,
} from "./flow-node-occurrence-storage.js";
import type { OperateProcessRegistration } from "./incident-contracts.js";
import {
  appendPostgresqlOccurrenceSuffix,
  writePostgresqlOccurrenceHeader,
} from "./postgresql-flow-node-occurrence-repository.js";
import { sameCanonicalValue } from "./execution-publication-storage.js";
import { PostgresqlOperateRecoveryFenceError } from "./postgresql-operate-recovery-step.js";

/** Applies one prepared occurrence suffix under the caller's lease transaction. */
export async function applyPreparedFlowNodeOccurrencePage(
  session: PostgresqlSession,
  expectedRegistration: OperateProcessRegistration,
  expectedImage: FlowNodeOccurrenceProjectionImage | null,
  page: FlowNodeOccurrencePage,
): Promise<void> {
  const locked = await session.query({
    text: `
      SELECT process_instance_id
      FROM bpmn_platform.operate_process_instances
      WHERE process_instance_id = $1
      FOR UPDATE
    `,
    values: [encodePostgresqlText(expectedRegistration.instance.processInstanceId)],
  });
  if (locked.rowCount !== 1) throw new PostgresqlOperateRecoveryFenceError();
  const snapshot = await readPostgresqlOccurrenceSnapshot(
    session,
    expectedRegistration.instance.processInstanceId,
  );
  if (
    snapshot === null ||
    !sameCanonicalValue(snapshot.registration, expectedRegistration) ||
    !sameCanonicalValue(snapshot.occurrence, expectedImage) ||
    snapshot.execution === null
  ) {
    throw new PostgresqlOperateRecoveryFenceError();
  }
  const prior = snapshot.occurrence ?? createEmptyFlowNodeOccurrenceProjection(
    occurrenceIdentityFromRegistration(expectedRegistration),
  );
  const next = applyFlowNodeOccurrencePage(
    prior,
    page,
    snapshot.execution,
    "mayBeAhead",
  );
  const completeObservation = next.status === FlowNodeOccurrenceProjectionStatus.Healthy &&
    page.currentOpen !== null &&
    next.headRevision === next.producerHeadRevision;
  if (sameCanonicalValue(prior, next) && !completeObservation) return;
  await writePostgresqlOccurrenceHeader(session, next, completeObservation);
  await appendPostgresqlOccurrenceSuffix(session, prior, next);
}
