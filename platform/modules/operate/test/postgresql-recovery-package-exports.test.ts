import assert from "node:assert/strict";
import { test } from "node:test";

import {
  decodeOperateRecoveryCandidateKey,
  PostgresqlExecutionRecoveryStep,
  PostgresqlFlowNodeOccurrenceRecoveryStep,
  PostgresqlIncidentAuditRecoveryStep,
  PostgresqlIncidentMutationAggregation,
  PostgresqlIncidentSnapshotGeneration,
  PostgresqlIncidentSnapshotReader,
  PostgresqlIncidentSnapshotRecoveryStep,
  PostgresqlIncidentSnapshotService,
  PostgresqlOperateRecoveryStepKind,
} from "@bpmn-lean/platform-operate";

test("exports every standalone Operate PostgreSQL recovery step from the package root", () => {
  assert.equal(typeof PostgresqlExecutionRecoveryStep, "function");
  assert.equal(typeof PostgresqlFlowNodeOccurrenceRecoveryStep, "function");
  assert.equal(typeof PostgresqlIncidentAuditRecoveryStep, "function");
  assert.equal(typeof PostgresqlIncidentMutationAggregation, "function");
  assert.equal(typeof PostgresqlIncidentSnapshotGeneration, "function");
  assert.equal(typeof PostgresqlIncidentSnapshotReader, "function");
  assert.equal(typeof PostgresqlIncidentSnapshotRecoveryStep, "function");
  assert.equal(typeof PostgresqlIncidentSnapshotService, "function");
  assert.equal(decodeOperateRecoveryCandidateKey(new TextEncoder().encode("id\u0000")), "id\u0000");
  assert.equal(PostgresqlOperateRecoveryStepKind.Complete, "complete");
});
