import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PostgresqlDefinitionsRecoveryFailureCode,
  PostgresqlDefinitionsRecoveryFailureEvidence,
  PostgresqlDefinitionsRecoveryStepKind,
} from "@bpmn-lean/platform-definitions";
import {
  PostgresqlDirectStartRecoveryStep,
} from "@bpmn-lean/platform-definitions";

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
            direct_start_command: new TextEncoder().encode('{"initialVariables":[]}'),
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

test("PostgreSQL direct recovery rejects missing, empty, and noncanonical command bytes", async () => {
  for (const commandBytes of [
    null,
    new Uint8Array(),
    new TextEncoder().encode('{ "initialVariables": [] }'),
    '{"initialVariables":[]}',
  ]) {
    let hostCalls = 0;
    const recovery = new PostgresqlDirectStartRecoveryStep({
      runtime: {
        query: async () => ({
          rowCount: 1,
          rows: [{
            process_instance_id: new TextEncoder().encode("corrupt-command-instance"),
            public_instance_json: JSON.stringify({
              processInstanceId: "corrupt-command-instance",
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
            work_locator: new TextEncoder().encode("locator"),
            direct_intent_json: JSON.stringify({
              protocol: "bpmn-direct-start-v1",
              intentSha256: "b".repeat(64),
            }),
            direct_start_command: commandBytes,
            state: "reserved",
            operate_pending: false,
            work_pending: false,
          }],
        }),
      } as never,
      host: {
        start: async () => {
          hostCalls += 1;
          return { status: "started" };
        },
        describe: async () => {
          hostCalls += 1;
          return { status: "matching" };
        },
      },
    });

    assert.deepEqual(
      await recovery.prepare(
        new TextEncoder().encode(JSON.stringify(["corrupt-command-instance"])),
      ),
      {
        kind: PostgresqlDefinitionsRecoveryStepKind.Fail,
        code: PostgresqlDefinitionsRecoveryFailureCode.StoredCorruption,
        evidence: PostgresqlDefinitionsRecoveryFailureEvidence.StoredRow,
      },
    );
    assert.equal(hostCalls, 0);
  }
});

test("PostgreSQL recovery clones the driver bytea before deferred host dispatch", async () => {
  const exactText = '{"initialVariables":[{"name":"item","value":{"kind":"string","value":"captured"}}]}';
  const driverBytes = Buffer.from(exactText, "utf8");
  let dispatchedBytes: Uint8Array | null = null;
  const recovery = new PostgresqlDirectStartRecoveryStep({
    runtime: {
      query: async () => ({
        rowCount: 1,
        rows: [{
          process_instance_id: Buffer.from("cloned-driver-bytea", "utf8"),
          public_instance_json: JSON.stringify({
            processInstanceId: "cloned-driver-bytea",
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
          work_locator: Buffer.from("locator", "utf8"),
          direct_intent_json: JSON.stringify({
            protocol: "bpmn-direct-start-v1",
            intentSha256: "b".repeat(64),
          }),
          direct_start_command: driverBytes,
          state: "reserved",
          operate_pending: false,
          work_pending: false,
        }],
      }),
    } as never,
    host: {
      start: async (reservation) => {
        dispatchedBytes = Uint8Array.from(reservation.startCommandBytes);
        return { status: "started" };
      },
      describe: async () => ({ status: "matching" }),
    },
  });

  const prepared = await recovery.prepare(
    new TextEncoder().encode(JSON.stringify(["cloned-driver-bytea"])),
  );
  assert.equal(prepared.kind, PostgresqlDefinitionsRecoveryStepKind.Intermediate);
  driverBytes.fill(0);
  if (prepared.kind !== PostgresqlDefinitionsRecoveryStepKind.Intermediate) {
    assert.fail("reserved direct recovery must prepare an intermediate dispatch");
  }
  await prepared.continue();

  assert.equal(new TextDecoder().decode(dispatchedBytes!), exactText);
});
