import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PostgresqlConfirmedRegistrationRecoveryStep,
  PostgresqlDefinitionScheduleRecoveryStep,
  PostgresqlDefinitionsRecoveryStepKind,
  PostgresqlDirectStartRecoveryStep,
  PostgresqlMessageStartRecoveryStep,
} from "@bpmn-lean/platform-definitions";

test("exports every Definitions PostgreSQL recovery step from the package root", () => {
  assert.equal(typeof PostgresqlConfirmedRegistrationRecoveryStep, "function");
  assert.equal(typeof PostgresqlDefinitionScheduleRecoveryStep, "function");
  assert.equal(typeof PostgresqlDirectStartRecoveryStep, "function");
  assert.equal(typeof PostgresqlMessageStartRecoveryStep, "function");
  assert.equal(PostgresqlDefinitionsRecoveryStepKind.Complete, "complete");
});
