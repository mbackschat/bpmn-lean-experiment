import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PostgresqlWorkAuditRecoveryStep,
  PostgresqlWorkSnapshotGeneration,
  PostgresqlWorkSnapshotReader,
  PostgresqlWorkSnapshotRecoveryStep,
  PostgresqlWorkSnapshotService,
  PostgresqlWorkSnapshotStepKind,
} from "@bpmn-lean/platform-work";

test("exports the shared Work recovery composition boundary", () => {
  assert.equal(typeof PostgresqlWorkAuditRecoveryStep, "function");
  assert.equal(typeof PostgresqlWorkSnapshotGeneration, "function");
  assert.equal(typeof PostgresqlWorkSnapshotReader, "function");
  assert.equal(typeof PostgresqlWorkSnapshotRecoveryStep, "function");
  assert.equal(typeof PostgresqlWorkSnapshotService, "function");
  assert.equal(PostgresqlWorkSnapshotStepKind.Complete, "complete");
});
