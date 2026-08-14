import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { Worker } from "node:worker_threads";

import {
  ProcessInstanceIdentityIntegrityError,
  ProcessInstanceStoredValueError,
  SqliteProcessInstanceRepository,
} from "@bpmn-lean/platform-operate";
import type { PublicProcessInstanceIdentity } from "@bpmn-lean/platform-contracts";

test("round-trips a defensive exact public snapshot without private facts", async () => {
  await withRepository(async (repository, databaseFile) => {
    const candidate = instance("instance-1", 1);
    const ordinal = repository.recordConfirmed(publication(candidate));
    Object.assign(candidate.definition.source, { id: "mutated-source" });
    Object.assign(candidate.definition.startCapabilities, {
      timerStarts: [{ startEventId: "mutated", durationMs: 99_000 }],
    });

    const row = repository.search({ limit: 1 })[0];
    assert.equal(ordinal, 1);
    assert.equal(row?.ordinal, 1);
    assert.equal(row?.instance.definition.source.id, "source-1");
    assert.deepEqual(row?.instance.definition.startCapabilities, {
      messageStarts: [{
        startEventId: "MessageStart",
        channel: {
          kind: "operationMessage",
          interfaceId: "Orders",
          interfaceOperationId: "receive",
          messageId: "OrderReceived",
        },
      }],
      timerStarts: [{ startEventId: "TimerStart", durationMs: 1_000 }],
    });
    Object.assign(row?.instance.definition.source ?? {}, { id: "mutated-read" });
    assert.equal(
      repository.search({ limit: 1 })[0]?.instance.definition.source.id,
      "source-1",
    );

    const database = new DatabaseSync(databaseFile, { readOnly: true });
    try {
      const stored = database.prepare(`
        SELECT public_identity_json FROM process_instances
      `).get()?.public_identity_json;
      assert.equal(typeof stored, "string");
      assert.doesNotMatch(String(stored), /workflow|runId|taskQueue|ordinal/u);
    } finally {
      database.close();
    }
  });
});

test("reopen preserves one ordinal and refuses a changed same-ID identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-operate-reopen-"));
  const databaseFile = join(root, "process-instances.sqlite");
  try {
    const first = new SqliteProcessInstanceRepository(databaseFile);
    assert.equal(first.recordConfirmed(publication(instance("durable", 1))), 1);
    first.close();

    const reopened = new SqliteProcessInstanceRepository(databaseFile);
    try {
      assert.equal(reopened.recordConfirmed(publication(instance("durable", 1))), 1);
      assert.throws(
        () => reopened.recordConfirmed(publication(instance("durable", 2))),
        (error: unknown) =>
          error instanceof ProcessInstanceIdentityIntegrityError,
      );
      assert.throws(
        () => reopened.recordConfirmed({
          ...publication(instance("durable", 1)),
          locator: "bpmn-process-work-v1:changed-locator",
        }),
        (error: unknown) =>
          error instanceof ProcessInstanceIdentityIntegrityError,
      );
      assert.deepEqual(
        reopened.search({ limit: 10 }).map(({ ordinal, instance: value }) => ({
          ordinal,
          id: value.processInstanceId,
          version: value.definition.version,
        })),
        [{ ordinal: 1, id: "durable", version: 1 }],
      );
    } finally {
      reopened.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("persists private classification across independent connections without a current-incident table", async () => {
  await withDatabaseFile(async (databaseFile) => {
    const first = new SqliteProcessInstanceRepository(databaseFile);
    first.recordConfirmed(publication(instance("classified", 1)));
    first.recordObservation("classified", "indeterminate");

    const second = new SqliteProcessInstanceRepository(databaseFile);
    try {
      assert.equal(second.getRegistration("classified")?.observation, "indeterminate");
      second.recordObservation("classified", "active");
      assert.equal(first.getRegistration("classified")?.observation, "active");
      const database = new DatabaseSync(databaseFile, { readOnly: true });
      try {
        const tables = database.prepare(`
          SELECT name FROM sqlite_schema
          WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
          ORDER BY name
        `).all().map(({ name }) => name);
        assert.deepEqual(tables, [
          "incident_action_audit_outbox",
          "incident_actions",
          "process_instances",
        ]);
        assert.equal(tables.some((name) => String(name).includes("current")), false);
      } finally {
        database.close();
      }
    } finally {
      second.close();
      first.close();
    }
  });
});

test("independent concurrent equivalent records converge to one row and ordinal", async () => {
  await withDatabaseFile(async (databaseFile) => {
    const results = await race(databaseFile, [
      instance("equivalent", 1),
      instance("equivalent", 1),
    ]);
    assert.deepEqual(results, [
      { outcome: "recorded", ordinal: 1 },
      { outcome: "recorded", ordinal: 1 },
    ]);
    const repository = new SqliteProcessInstanceRepository(databaseFile);
    try {
      assert.equal(repository.search({ limit: 10 }).length, 1);
    } finally {
      repository.close();
    }
  });
});

test("independent concurrent conflicting records classify one loser and preserve winner", async () => {
  await withDatabaseFile(async (databaseFile) => {
    const candidates = [instance("conflict", 1), instance("conflict", 2)];
    const results = await race(databaseFile, candidates);
    assert.equal(results.filter(({ outcome }) => outcome === "recorded").length, 1);
    assert.equal(results.filter(({ outcome }) => outcome === "integrity").length, 1);

    const winnerIndex = results.findIndex(({ outcome }) => outcome === "recorded");
    const repository = new SqliteProcessInstanceRepository(databaseFile);
    try {
      const rows = repository.search({ limit: 10 });
      assert.equal(rows.length, 1);
      assert.deepEqual(rows[0]?.instance, candidates[winnerIndex]);
      assert.equal(rows[0]?.ordinal, 1);
    } finally {
      repository.close();
    }
  });
});

test("uses exact filters and stable keyset boundaries", async () => {
  await withRepository(async (repository) => {
    repository.recordConfirmed(publication(instance("first", 1, "Alpha", "a".repeat(64))));
    repository.recordConfirmed(publication(instance("second", 2, "Beta", "b".repeat(64))));
    repository.recordConfirmed(publication(instance("third", 2, "Alpha", "b".repeat(64))));

    const firstPage = repository.search({ processId: "Alpha", limit: 1 });
    assert.equal(firstPage[0]?.instance.processInstanceId, "third");
    repository.recordConfirmed(publication(instance("newer", 3, "Alpha", "c".repeat(64))));
    assert.deepEqual(
      repository.search({
        processId: "Alpha",
        beforeOrdinal: firstPage[0]?.ordinal,
        limit: 10,
      }).map(({ instance: value }) => value.processInstanceId),
      ["first"],
    );
    assert.equal(
      repository.search({
        processInstanceId: "second",
        processId: "Beta",
        version: 2,
        sourceSha256: "b".repeat(64),
        limit: 10,
      })[0]?.instance.processInstanceId,
      "second",
    );
  });
});

test("rejects private input and fails closed on corrupt stored identity or index copies", async () => {
  await withRepository(async (repository, databaseFile) => {
    const privateCandidate = {
      ...instance("private", 1),
      workflowId: "forbidden-host-id",
    };
    assert.throws(() => repository.recordConfirmed(publication(privateCandidate)));
    repository.recordConfirmed(publication(instance("corrupt", 1)));

    const database = new DatabaseSync(databaseFile);
    database.prepare(`
      UPDATE process_instances SET process_id = 'not-the-decoded-process'
    `).run();
    database.close();
    assert.throws(
      () => repository.search({ limit: 10 }),
      (error: unknown) => error instanceof ProcessInstanceStoredValueError,
    );
  });

  await withRepository(async (repository, databaseFile) => {
    repository.recordConfirmed(publication(instance("invalid-json", 1)));
    const database = new DatabaseSync(databaseFile);
    database.prepare(`
      UPDATE process_instances SET public_identity_json = '{"broken":true}'
    `).run();
    database.close();
    assert.throws(
      () => repository.search({ limit: 10 }),
      (error: unknown) => error instanceof ProcessInstanceStoredValueError,
    );
  });
});

type RaceResult =
  | Readonly<{ outcome: "recorded"; ordinal: number }>
  | Readonly<{ outcome: "integrity" }>;

async function race(
  databaseFile: string,
  candidates: ReadonlyArray<PublicProcessInstanceIdentity>,
): Promise<ReadonlyArray<RaceResult>> {
  const gateBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2);
  const gate = new Int32Array(gateBuffer);
  const workers = candidates.map((candidate) => new Worker(
    new URL("./sqlite-process-instance-race-worker.ts", import.meta.url),
    { workerData: { databaseFile, gate: gateBuffer, instance: candidate } },
  ));
  await waitUntil(() => Atomics.load(gate, 1) === workers.length);
  Atomics.store(gate, 0, 1);
  Atomics.notify(gate, 0, workers.length);
  return Promise.all(workers.map(workerResult));
}

function workerResult(worker: Worker): Promise<RaceResult> {
  return new Promise((resolve, reject) => {
    worker.once("message", (message: RaceResult) => resolve(message));
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`race worker exited with code ${code}`));
      }
    });
  });
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  while (!predicate()) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

async function withRepository(
  run: (
    repository: SqliteProcessInstanceRepository,
    databaseFile: string,
  ) => Promise<void>,
): Promise<void> {
  await withDatabaseFile(async (databaseFile) => {
    const repository = new SqliteProcessInstanceRepository(databaseFile);
    try {
      await run(repository, databaseFile);
    } finally {
      if (repository.isOpen) {
        repository.close();
      }
    }
  });
}

async function withDatabaseFile(
  run: (databaseFile: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-operate-index-"));
  try {
    await run(join(root, "process-instances.sqlite"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function instance(
  processInstanceId: string,
  version: number,
  processId = "Process_Search",
  sha256 = "a".repeat(64),
): PublicProcessInstanceIdentity {
  return {
    processInstanceId,
    definition: {
      processId,
      version,
      source: {
        kind: "bpmnSource",
        id: `source-${version}`,
        sha256,
        byteLength: 21,
        declaredEncoding: null,
        decodedAs: "UTF-8",
      },
      semanticProfile: "search-profile",
      startCapabilities: {
        messageStarts: [{
          startEventId: "MessageStart",
          channel: {
            kind: "operationMessage",
            interfaceId: "Orders",
            interfaceOperationId: "receive",
            messageId: "OrderReceived",
          },
        }],
        timerStarts: [{ startEventId: "TimerStart", durationMs: 1_000 }],
      },
    },
  };
}

function publication(instanceValue: PublicProcessInstanceIdentity) {
  return {
    instance: instanceValue,
    locator: `bpmn-process-work-v1:${instanceValue.processInstanceId}`,
  };
}
