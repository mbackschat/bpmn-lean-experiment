import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PostgresqlExecutionRecoveryStep,
  PostgresqlFlowNodeOccurrenceRecoveryStep,
  PostgresqlIncidentAuditRecoveryStep,
  PostgresqlOperateRecoveryStepKind,
} from "@bpmn-lean/platform-operate";

test("exports every standalone Operate PostgreSQL recovery step from the package root", () => {
  assert.equal(typeof PostgresqlExecutionRecoveryStep, "function");
  assert.equal(typeof PostgresqlFlowNodeOccurrenceRecoveryStep, "function");
  assert.equal(typeof PostgresqlIncidentAuditRecoveryStep, "function");
  assert.equal(PostgresqlOperateRecoveryStepKind.Complete, "complete");
});
