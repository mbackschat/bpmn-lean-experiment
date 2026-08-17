import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PostgresqlDefinitionsRecoveryFailureEvidence,
  PostgresqlDefinitionsRecoveryStepKind,
} from "../dist/postgresql-definitions-recovery-step.js";
import {
  PostgresqlDirectStartRecoveryStep,
} from "../dist/postgresql-direct-start-recovery-step.js";

test("Definitions recovery exposes one erasable closed step result", () => {
  assert.deepEqual(Object.values(PostgresqlDefinitionsRecoveryStepKind), [
    "complete",
    "intermediate",
    "retry",
    "fail",
  ]);
  assert.deepEqual(Object.values(PostgresqlDefinitionsRecoveryFailureEvidence), [
    "storedRow",
    "retainedIntent",
    "artifact",
    "hostResult",
    "lifecycle",
  ]);
});

test("database driver failures remain infrastructure failures", async () => {
  const recovery = new PostgresqlDirectStartRecoveryStep({
    runtime: {
      query: async () => {
        throw new TypeError("driver decode failed before a row was returned");
      },
    } as never,
    host: {
      start: async () => ({ status: "started" }),
      describe: async () => ({ status: "matching" }),
    },
  });

  await assert.rejects(
    recovery.prepare(new TextEncoder().encode(JSON.stringify(["instance"]))),
    /driver decode failed before a row was returned/u,
  );
});

test("a prepared direct dispatch transition changes nothing until its fence applies", async () => {
  let hostCalls = 0;
  let queryCount = 0;
  const recovery = new PostgresqlDirectStartRecoveryStep({
    runtime: {
      query: async () => {
        queryCount += 1;
        return {
          rowCount: 1,
          rows: [{
            process_instance_id: Uint8Array.from(Buffer.from("instance\u0000😀")),
            public_instance_json: JSON.stringify({
              processInstanceId: "instance\u0000😀",
              definition: {
                processId: "process",
                version: 1,
                source: {
                  kind: "bpmnSource",
                  id: "process.bpmn",
                  sha256: "a".repeat(64),
                  byteLength: 42,
                  declaredEncoding: null,
                  decodedAs: "UTF-8",
                },
                semanticProfile: "profile-1",
                startCapabilities: { messageStarts: [], timerStarts: [] },
              },
            }),
            work_locator: Uint8Array.from(Buffer.from("locator")),
            direct_intent_json: JSON.stringify({
              protocol: "protocol",
              intentSha256: "b".repeat(64),
            }),
            state: "reserved",
            operate_pending: false,
            work_pending: false,
          }],
        };
      },
    } as never,
    host: {
      start: async () => {
        hostCalls += 1;
        return { status: "started" as const };
      },
      describe: async () => {
        hostCalls += 1;
        return { status: "matching" as const };
      },
    },
  });

  const step = await recovery.prepare(
    new TextEncoder().encode(JSON.stringify(["instance\u0000😀"])),
  );
  assert.equal(step.kind, PostgresqlDefinitionsRecoveryStepKind.Intermediate);
  assert.equal(hostCalls, 0);
  assert.equal(queryCount, 1);
  // Simulated lease loss: the returned apply callback is deliberately discarded.
});
