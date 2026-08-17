import assert from "node:assert/strict";
import { test } from "node:test";

import {
  platformPostgresqlSuites,
  platformPostgresqlSuiteTimeoutMs,
} from "./run-platform-postgresql-suites.ts";

test("isolates all ten reuse-only PostgreSQL package suites behind one bounded driver", () => {
  assert.equal(platformPostgresqlSuiteTimeoutMs, 60_000);
  assert.deepEqual(
    platformPostgresqlSuites.map(({ packageName }) => packageName),
    [
      "@bpmn-lean/platform-postgresql-runtime",
      "@bpmn-lean/platform-artifact-store",
      "@bpmn-lean/platform-definitions",
      "@bpmn-lean/platform-operate",
      "@bpmn-lean/platform-work",
      "@bpmn-lean/platform-audit",
      "@bpmn-lean/platform-recovery-runtime",
      "@bpmn-lean/platform-postgresql-migrate",
      "@bpmn-lean/platform-recovery-worker",
      "@bpmn-lean/platform-server",
    ],
  );
  assert.equal(new Set(platformPostgresqlSuites.map(({ label }) => label)).size, 10);
});
