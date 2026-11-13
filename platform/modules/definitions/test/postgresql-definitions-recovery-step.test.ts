import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PostgresqlDefinitionsRecoveryFailureCode,
  PostgresqlDefinitionsRecoveryFailureEvidence,
  PostgresqlDefinitionsRecoveryStepKind,
} from "@bpmn-lean/platform-definitions";
import {
  PostgresqlDirectStartRecoveryStep,
  PostgresqlMessageStartRecoveryStep,
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
                sourceOverlay: null,
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
                sourceOverlay: null,
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
              sourceOverlay: null,
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

// A chain that retains the start's intent is not yet a committed start: recovery leaves an undecided start to its
// dispatcher and records a start the kernel refused, confirming only the kernel's committed verdict.
for (const [description, kind, written] of [
  ["pending", PostgresqlDefinitionsRecoveryStepKind.Retry, []],
  ["notCommitted", PostgresqlDefinitionsRecoveryStepKind.Complete, ["integrityFailure"]],
] as const) {
  test(`direct recovery of a starting row described ${description} writes ${JSON.stringify(written)}`, async () => {
    const rows = recoveryRows({ ...directRow(), state: "starting" });
    const recovery = new PostgresqlDirectStartRecoveryStep({
      runtime: rows.runtime,
      host: {
        start: async () => assert.fail("a dispatched start is described, never dispatched again"),
        describe: async () => ({ status: description }),
      },
    });

    const step = await recovery.prepare(new TextEncoder().encode(JSON.stringify(["described-instance"])));
    assert.equal(step.kind, kind);
    if (step.kind === PostgresqlDefinitionsRecoveryStepKind.Complete) await step.apply(rows.runtime);
    assert.deepEqual(rows.written(), written);
  });

  test(`Message Start recovery of a starting row described ${description} writes ${JSON.stringify(written)}`, async () => {
    const rows = recoveryRows({ ...messageRow(), state: "starting" });
    const recovery = new PostgresqlMessageStartRecoveryStep({
      runtime: rows.runtime,
      artifacts: {} as never,
      host: {
        start: async () => assert.fail("a dispatched start is described, never dispatched again"),
        describe: async () => ({ status: description }),
      },
      locators: { canonicalLocator: (id) => `message:${id}` },
    });

    const step = await recovery.prepare(new TextEncoder().encode(JSON.stringify(["described-publication"])));
    assert.equal(step.kind, kind);
    if (step.kind === PostgresqlDefinitionsRecoveryStepKind.Complete) await step.apply(rows.runtime);
    assert.deepEqual(rows.written(), written);
  });
}

/** One stored row the recovery step reads, and the states its fenced UPDATEs write to it. */
function recoveryRows(row: Record<string, unknown>) {
  const written: unknown[] = [];
  const runtime = {
    query: async ({ text, values }: { text: string; values: readonly unknown[] }) => {
      if (/^\s*SELECT \*/u.test(text)) return { rowCount: 1, rows: [{ ...row }] };
      if (/^\s*UPDATE/u.test(text)) {
        written.push(values[0]);
        row.state = values[0];
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`the witness runtime does not answer ${text}`);
    },
  } as never;
  return { runtime, written: () => [...written] };
}

const text = (value: string) => Buffer.from(value, "utf8");

const definitionColumns = {
  process_id: text("process"),
  version: 1,
  source_kind: "bpmnSource",
  source_id: text("process.bpmn"),
  source_sha256: "a".repeat(64),
  source_byte_length: 42,
  source_declared_encoding: null,
  source_decoded_as: "UTF-8",
  source_overlay_id: null,
  source_overlay_sha256: null,
  semantic_profile: text("profile-1"),
  start_capabilities_json: JSON.stringify({ messageStarts: [], timerStarts: [] }),
};

function directRow() {
  return {
    process_instance_id: text("described-instance"),
    public_instance_json: JSON.stringify({
      processInstanceId: "described-instance",
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
        sourceOverlay: null,
      },
    }),
    work_locator: text("locator"),
    direct_intent_json: JSON.stringify({ protocol: "bpmn-direct-start-v1", intentSha256: "b".repeat(64) }),
    direct_start_command: new TextEncoder().encode('{"initialVariables":[]}'),
    operate_pending: false,
    work_pending: false,
  };
}

function messageRow() {
  return {
    publication_id: text("described-publication"),
    ...definitionColumns,
    message_start_event_id: text("MessageStart"),
    message_interface_id: text("Interface"),
    message_interface_operation_id: text("Operation"),
    message_id: text("Message"),
    process_instance_id: text("message-instance"),
    command_id: text("command:described-publication"),
    workflow_id: text("workflow:described-publication"),
    intent_protocol: text("message-start-v1"),
    intent_sha256: "c".repeat(64),
  };
}
