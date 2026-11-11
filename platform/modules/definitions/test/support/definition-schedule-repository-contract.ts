import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DefinitionScheduleConflictError,
  DefinitionScheduleIntegrityError,
  DefinitionScheduleState,
} from "@bpmn-lean/platform-definitions";

import {
  schedule,
  scheduleReference,
  timerMetadata,
  usingFixture,
  type DefinitionsRepositoryContractFactory,
} from "./definitions-repository-contract.ts";

/** The Definition Schedule repository contract every storage adapter satisfies. */
export function registerDefinitionScheduleRepositoryContract(
  label: string,
  createFixture: DefinitionsRepositoryContractFactory,
): void {
  test(`${label}: schedules preserve identities, deterministic order, and cancellation`, async () => {
    await usingFixture(createFixture, async ({ definitions, schedules }) => {
      const definition = await definitions.allocateNext(timerMetadata());
      await schedules.reserve(schedule(definition, "😀", 1));
      const exactA = schedule(definition, "A", 2);
      await schedules.reserve(exactA);
      const changedA = schedule(definition, "A", 9);
      assert.deepEqual(
        await schedules.reserve(changedA),
        { inserted: false, record: { ...exactA, state: DefinitionScheduleState.Creating,
          cleanupComplete: false, cancellationOrigin: null,
          processLocator: null, refusalCode: null } },
      );
      assert.deepEqual(
        (await schedules.listForDefinition(definition)).map(
          ({ reference }) => reference.scheduleId,
        ),
        ["A", "😀"],
      );
      const hostCollision = schedule(definition, "other-host", 3);
      Object.assign(hostCollision.identity, { hostScheduleId: "host-schedule-1" });
      await assert.rejects(
        schedules.reserve(hostCollision),
        DefinitionScheduleIntegrityError,
      );
      await schedules.reserve(schedule(definition, "race", 4));
      const scheduleRace = await Promise.all([
        schedules.compareAndSet(
          scheduleReference(definition, "race"),
          DefinitionScheduleState.Creating,
          { state: DefinitionScheduleState.CreatingHost },
        ),
        schedules.compareAndSet(
          scheduleReference(definition, "race"),
          DefinitionScheduleState.Creating,
          { state: DefinitionScheduleState.CreatingHost },
        ),
      ]);
      assert.equal(scheduleRace.filter((value) => value !== null).length, 1);
      await schedules.reserve(schedule(definition, "illegal", 5));
      await assert.rejects(
        schedules.compareAndSet(
          scheduleReference(definition, "illegal"),
          DefinitionScheduleState.Creating,
          {
            state: DefinitionScheduleState.Started,
            processLocator: "bpmn-process-work-v1:execution",
          },
        ),
        /illegal schedule transition/u,
      );
      assert.equal(
        (await schedules.get(scheduleReference(definition, "illegal")))?.state,
        DefinitionScheduleState.Creating,
      );
      const creatingHost = await schedules.compareAndSet(
        { processId: definition.processId, version: definition.version, scheduleId: "A" },
        DefinitionScheduleState.Creating,
        { state: DefinitionScheduleState.CreatingHost },
      );
      assert.equal(creatingHost?.state, DefinitionScheduleState.CreatingHost);
      const cancelling = await schedules.requestCancellation(
        { processId: definition.processId, version: definition.version, scheduleId: "A" },
      );
      assert.equal(cancelling?.state, DefinitionScheduleState.Cancelling);
      assert.equal(cancelling?.cancellationOrigin, DefinitionScheduleState.CreatingHost);
      assert.equal(
        await schedules.compareAndSet(
          { processId: definition.processId, version: definition.version, scheduleId: "A" },
          DefinitionScheduleState.CreatingHost,
          { state: DefinitionScheduleState.Scheduled },
        ),
        null,
      );
      const cancelled = await schedules.compareAndSet(
        scheduleReference(definition, "A"),
        DefinitionScheduleState.Cancelling,
        { state: DefinitionScheduleState.Cancelled },
      );
      assert.equal(cancelled?.cleanupComplete, false);
      const cleaned = await schedules.markCleanupComplete(
        scheduleReference(definition, "A"),
        DefinitionScheduleState.Cancelled,
      );
      assert.equal(cleaned?.cleanupComplete, true);
      assert.deepEqual(
        await schedules.markCleanupComplete(
          scheduleReference(definition, "A"),
          DefinitionScheduleState.Cancelled,
        ),
        cleaned,
      );
    });
  });

  test(`${label}: a refused schedule keeps the engine's code and finishes like any terminal outcome`, async () => {
    await usingFixture(createFixture, async ({ definitions, schedules }) => {
      const definition = await definitions.allocateNext(timerMetadata());
      const record = schedule(definition, "refused", 1);
      await schedules.reserve(record);
      await assert.rejects(
        schedules.compareAndSet(record.reference, DefinitionScheduleState.Creating, {
          state: DefinitionScheduleState.Refused,
          refusalCode: "occurrence-refused",
        }),
        /illegal schedule transition/u,
      );
      await schedules.compareAndSet(record.reference, DefinitionScheduleState.Creating, {
        state: DefinitionScheduleState.CreatingHost,
      });
      await schedules.compareAndSet(record.reference, DefinitionScheduleState.CreatingHost, {
        state: DefinitionScheduleState.Scheduled,
      });
      await assert.rejects(
        schedules.compareAndSet(record.reference, DefinitionScheduleState.Scheduled, {
          state: DefinitionScheduleState.Refused,
        }),
        TypeError,
      );
      await assert.rejects(
        schedules.compareAndSet(record.reference, DefinitionScheduleState.Scheduled, {
          state: DefinitionScheduleState.Missed,
          refusalCode: "occurrence-refused",
        }),
        TypeError,
      );
      const refused = await schedules.compareAndSet(record.reference, DefinitionScheduleState.Scheduled, {
        state: DefinitionScheduleState.Refused,
        refusalCode: "occurrence-refused",
      });
      assert.deepEqual(refused, {
        ...record,
        state: DefinitionScheduleState.Refused,
        cleanupComplete: false,
        cancellationOrigin: null,
        processLocator: null,
        refusalCode: "occurrence-refused",
      });
      assert.deepEqual(
        (await schedules.listForReconciliation()).map(({ reference }) => reference.scheduleId),
        ["refused"],
      );
      await assert.rejects(
        schedules.compareAndSet(record.reference, DefinitionScheduleState.Refused, {
          state: DefinitionScheduleState.Cancelled,
        }),
        /illegal schedule transition/u,
      );
      const unchanged = await schedules.requestCancellation(record.reference);
      assert.equal(unchanged?.state, DefinitionScheduleState.Refused);
      const cleaned = await schedules.markCleanupComplete(record.reference, DefinitionScheduleState.Refused);
      assert.deepEqual(cleaned, { ...refused, cleanupComplete: true });
      assert.deepEqual(await schedules.listForReconciliation(), []);
      assert.deepEqual(await schedules.get(record.reference), cleaned);
    });
  });

  test(`${label}: one engine occurrence belongs to at most one public schedule identity`, async () => {
    await usingFixture(createFixture, async ({ definitions, schedules }) => {
      const definition = await definitions.allocateNext(timerMetadata());
      const first = schedule(definition, "first", 1);
      await schedules.reserve(first);
      const taken = schedule(definition, "second", 2);
      Object.assign(taken.identity, { processInstanceId: first.identity.processInstanceId });
      await assert.rejects(schedules.reserve(taken), DefinitionScheduleConflictError);
      assert.equal(await schedules.get(taken.reference), null);
      assert.deepEqual(
        (await schedules.listForDefinition(definition)).map(({ reference }) => reference.scheduleId),
        ["first"],
      );
      assert.equal((await schedules.get(first.reference))?.identity.hostScheduleId, "host-schedule-1");
      assert.deepEqual(await schedules.reserve(first), {
        inserted: false,
        record: {
          ...first,
          state: DefinitionScheduleState.Creating,
          cleanupComplete: false,
          cancellationOrigin: null,
          processLocator: null,
          refusalCode: null,
        },
      });
    });
  });

  test(`${label}: a due instant with milliseconds and an unresolved Timer start duration round-trip exactly`, async () => {
    await usingFixture(createFixture, async ({ definitions, schedules }) => {
      const fixed = await definitions.allocateNext(timerMetadata());
      const fractional = schedule(fixed, "fractional", 1, "2026-11-09T12:00:01.250Z");
      await schedules.reserve(fractional);
      assert.equal((await schedules.get(fractional.reference))?.dueAt, "2026-11-09T12:00:01.250Z");
      const unresolved = await definitions.allocateNext(timerMetadata(null));
      const dated = schedule(unresolved, "unresolved", 2, "2026-11-09T12:00:00.001Z");
      assert.equal(dated.timerStart.durationMs, null);
      await schedules.reserve(dated);
      const stored = await schedules.get(dated.reference);
      assert.equal(stored?.timerStart.durationMs, null);
      assert.deepEqual(stored?.definition.startCapabilities.timerStarts, [
        { startEventId: "TimerStart", durationMs: null },
      ]);
      assert.equal(stored?.dueAt, "2026-11-09T12:00:00.001Z");
      assert.deepEqual(
        (await schedules.listForDefinition(unresolved)).map(({ timerStart }) => timerStart.durationMs),
        [null],
      );
    });
  });
}
