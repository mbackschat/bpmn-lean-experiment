import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PostgresqlOperateRecoveryStepKind,
} from "../dist/postgresql-operate-recovery-step.js";
import {
  decodeOperateRecoveryCandidateKey,
} from "../dist/postgresql-operate-recovery-candidates.js";
import {
  PostgresqlExecutionRecoveryStep,
} from "../dist/postgresql-execution-recovery-step.js";
import {
  PostgresqlFlowNodeOccurrenceRecoveryStep,
} from "../dist/postgresql-flow-node-occurrence-recovery-step.js";

test("PostgreSQL Operate recovery exposes one erasable closed step result", () => {
  assert.deepEqual(Object.values(PostgresqlOperateRecoveryStepKind), [
    "complete",
    "retry",
    "fail",
  ]);
});

test("candidate keys preserve U+0000 and reject malformed UTF-8 before I/O", async () => {
  const exact = "instance\u0000é😀";
  assert.equal(
    decodeOperateRecoveryCandidateKey(new TextEncoder().encode(exact)),
    exact,
  );

  let queryCount = 0;
  let gatewayCount = 0;
  const runtime = {
    query: async () => {
      queryCount += 1;
      throw new Error("unexpected SQL");
    },
  };
  const execution = new PostgresqlExecutionRecoveryStep({
    runtime: runtime as never,
    gateway: {
      observe: async () => {
        gatewayCount += 1;
        throw new Error("unexpected gateway");
      },
    },
  });
  const occurrence = new PostgresqlFlowNodeOccurrenceRecoveryStep({
    runtime: runtime as never,
    gateway: {
      observe: async () => {
        gatewayCount += 1;
        throw new Error("unexpected gateway");
      },
    },
  });
  for (const step of [execution, occurrence]) {
    await assert.rejects(step.prepare(Uint8Array.of(0xc3, 0x28)), /UTF-8/u);
  }
  assert.equal(queryCount, 0);
  assert.equal(gatewayCount, 0);
});

test("database Error and TypeError failures stay outside recovery outcomes", async () => {
  let gatewayCount = 0;
  const gateway = {
    observe: async () => {
      gatewayCount += 1;
      return { kind: "notReady" };
    },
  };
  for (const infrastructureError of [
    new Error("database unavailable"),
    new TypeError("driver rejected query"),
  ]) {
    const runtime = {
      query: async () => {
        throw infrastructureError;
      },
    };
    for (const step of [
      new PostgresqlExecutionRecoveryStep({ runtime: runtime as never, gateway }),
      new PostgresqlFlowNodeOccurrenceRecoveryStep({ runtime: runtime as never, gateway }),
    ]) {
      await assert.rejects(
        step.prepare(new TextEncoder().encode("instance")),
        infrastructureError,
      );
    }
  }
  assert.equal(gatewayCount, 0);
});
