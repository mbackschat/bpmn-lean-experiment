import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  DefinitionScheduleConflictError,
  DefinitionScheduleIntegrityError,
  DefinitionScheduleState,
  SqliteDefinitionScheduleRepository,
} from "@bpmn-lean/platform-definitions";
import type {
  DefinitionScheduleReference,
  NewDefinitionScheduleRecord,
} from "@bpmn-lean/platform-definitions";

test("round-trips immutable snapshots and orders schedule IDs by Unicode scalar", async () => {
  await withRepository(async (repository) => {
    const ids = ["😀", "a", "\ue000", "A"];
    for (const [index, scheduleId] of ids.entries()) {
      const candidate = record(scheduleId, index + 1);
      const reserved = await repository.reserve(candidate);
      assert.equal(reserved.inserted, true);
      Object.assign(candidate.definition.source, { id: "mutated-after-reserve" });
      Object.assign(candidate.timerStart, { durationMs: 99_000 });
    }

    assert.deepEqual(
      (await repository.listForDefinition({ processId: "Process_Timer", version: 1 }))
        .map(({ reference }) => reference.scheduleId),
      ["A", "a", "\ue000", "😀"],
    );
    const stored = await repository.get(reference("A"));
    assert.equal(stored?.definition.source.id, "timer-source");
    assert.deepEqual(stored?.definition.startCapabilities, {
      messageStarts: [],
      timerStarts: [{ startEventId: "TimerStart", durationMs: 1_000 }],
    });
    assert.deepEqual(stored?.timerStart, {
      startEventId: "TimerStart",
      durationMs: 1_000,
    });
  });
});

test("refuses a taken occurrence as a conflict and a taken host schedule as an integrity failure", async () => {
  await withRepository(async (repository) => {
    await repository.reserve(record("first", 1));

    const taken = record("second", 2);
    Object.assign(taken.identity, { processInstanceId: "instance-1" });
    await assert.rejects(
      repository.reserve(taken),
      (error: unknown) => error instanceof DefinitionScheduleConflictError,
    );
    const sharedHost = record("second", 2);
    Object.assign(sharedHost.identity, { hostScheduleId: "host-1" });
    await assert.rejects(
      repository.reserve(sharedHost),
      (error: unknown) => error instanceof DefinitionScheduleIntegrityError,
    );
    assert.equal(
      (await repository.listForDefinition({ processId: "Process_Timer", version: 1 })).length,
      1,
    );
  });
});

test("reopen preserves private identities, lifecycle state, and stale CAS refusal", async () => {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-schedule-reopen-"));
  const databaseFile = join(root, "definitions.sqlite");
  try {
    const first = new SqliteDefinitionScheduleRepository(databaseFile);
    await first.reserve(record("durable", 7));
    await first.compareAndSet(
      reference("durable"),
      DefinitionScheduleState.Creating,
      { state: DefinitionScheduleState.CreatingHost },
    );
    first.close();

    const reopened = new SqliteDefinitionScheduleRepository(databaseFile);
    try {
      const durable = await reopened.get(reference("durable"));
      assert.equal(durable?.state, DefinitionScheduleState.CreatingHost);
      assert.deepEqual(durable?.identity, {
        processInstanceId: "instance-7",
        hostScheduleId: "host-7",
      });
      assert.equal(
        await reopened.compareAndSet(
          reference("durable"),
          DefinitionScheduleState.Creating,
          { state: DefinitionScheduleState.Cancelled },
        ),
        null,
      );
      assert.equal(
        (await reopened.get(reference("durable")))?.state,
        DefinitionScheduleState.CreatingHost,
      );
    } finally {
      reopened.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("compare-and-set admits only the closed lifecycle and cleanup progression", async () => {
  await withRepository(async (repository) => {
    await repository.reserve(record("lifecycle", 1));
    assert.equal(
      await repository.compareAndSet(
        reference("lifecycle"),
        DefinitionScheduleState.Scheduled,
        { state: DefinitionScheduleState.Started },
      ),
      null,
    );
    const creatingHost = await repository.compareAndSet(
      reference("lifecycle"),
      DefinitionScheduleState.Creating,
      { state: DefinitionScheduleState.CreatingHost },
    );
    assert.equal(creatingHost?.state, DefinitionScheduleState.CreatingHost);
    const scheduled = await repository.compareAndSet(
      reference("lifecycle"),
      DefinitionScheduleState.CreatingHost,
      { state: DefinitionScheduleState.Scheduled },
    );
    assert.equal(scheduled?.state, DefinitionScheduleState.Scheduled);
    const cancelling = await repository.requestCancellation(reference("lifecycle"));
    assert.equal(cancelling?.state, DefinitionScheduleState.Cancelling);
    assert.equal(
      cancelling?.cancellationOrigin,
      DefinitionScheduleState.Scheduled,
    );
    const started = await repository.compareAndSet(
      reference("lifecycle"),
      DefinitionScheduleState.Cancelling,
      {
        state: DefinitionScheduleState.Started,
        processLocator: "bpmn-process-work-v1:opaque-workflow",
      },
    );
    assert.equal(started?.state, DefinitionScheduleState.Started);
    assert.equal(started?.cleanupComplete, false);
    assert.equal(
      (await repository.markCleanupComplete(
        reference("lifecycle"),
        DefinitionScheduleState.Started,
      ))?.cleanupComplete,
      true,
    );
    await assert.rejects(
      repository.compareAndSet(
        reference("lifecycle"),
        DefinitionScheduleState.Started,
        { state: DefinitionScheduleState.Cancelled },
      ),
      /illegal schedule transition/u,
    );
  });
});

test("creating cancellation is terminal locally and needs no cleanup", async () => {
  await withRepository(async (repository) => {
    await repository.reserve(record("local-cancel", 1));
    const cancelled = await repository.requestCancellation(reference("local-cancel"));
    assert.equal(cancelled?.state, DefinitionScheduleState.Cancelled);
    assert.equal(cancelled?.cleanupComplete, true);
    assert.deepEqual(await repository.listForReconciliation(), []);
  });
});

async function withRepository(
  run: (repository: SqliteDefinitionScheduleRepository) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-schedules-"));
  const repository = new SqliteDefinitionScheduleRepository(
    join(root, "definitions.sqlite"),
  );
  try {
    await run(repository);
  } finally {
    if (repository.isOpen) {
      repository.close();
    }
    await rm(root, { recursive: true, force: true });
  }
}

function reference(scheduleId: string): DefinitionScheduleReference {
  return { processId: "Process_Timer", version: 1, scheduleId };
}

function record(scheduleId: string, identity: number): NewDefinitionScheduleRecord {
  return {
    reference: reference(scheduleId),
    definition: {
      processId: "Process_Timer",
      version: 1,
      source: {
        kind: "bpmnSource",
        id: "timer-source",
        sha256: "1".repeat(64),
        byteLength: 22,
        declaredEncoding: null,
        decodedAs: "UTF-8",
      },
      semanticProfile: "timer-profile",
      startCapabilities: {
        messageStarts: [],
        timerStarts: [{ startEventId: "TimerStart", durationMs: 1_000 }],
      },
      sourceOverlay: null,
    },
    timerStart: { startEventId: "TimerStart", durationMs: 1_000 },
    dueAt: "2026-08-11T12:00:01.000Z",
    identity: {
      processInstanceId: `instance-${identity}`,
      hostScheduleId: `host-${identity}`,
    },
  };
}
