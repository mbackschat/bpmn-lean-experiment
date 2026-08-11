import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DefinitionScheduleConflictError,
  DefinitionScheduleHostPhase,
  DefinitionScheduleIntegrityError,
  DefinitionScheduleNotFoundError,
  DefinitionScheduleService,
  DefinitionScheduleState,
  DefinitionScheduleValidationError,
} from "@bpmn-lean/platform-definitions";
import type {
  DefinitionMetadata,
  DefinitionReference,
  DefinitionRepository,
  DefinitionScheduleHost,
  DefinitionScheduleHostRequest,
  DefinitionScheduleHostResult,
  DefinitionScheduleRecord,
  DefinitionScheduleReference,
  DefinitionScheduleRepository,
  DefinitionScheduleReservation,
  DefinitionScheduleTransition,
  DefinitionScheduleValidationRequest,
  ExactArtifactStore,
  NewDefinitionMetadata,
  NewDefinitionScheduleRecord,
} from "@bpmn-lean/platform-definitions";

const encoder = new TextEncoder();
const bytes = encoder.encode("exact timer definition");
const activationAt = "2026-08-11T12:00:00.000Z";
const dueAt = "2026-08-11T12:00:01.000Z";

test("DELETE winning before creatingHost causes zero Schedule host calls", async () => {
  const fixture = createFixture();
  fixture.schedules.beforeFirstCreatingHost = () => {
    void fixture.service.delete(reference());
  };

  const result = await fixture.service.put({ ...reference(), activationAt });

  assert.equal(result.created, false);
  assert.equal(result.schedule.status, DefinitionScheduleState.Cancelled);
  assert.deepEqual(fixture.host.scheduleCalls, []);
});

test("restart resumes durable cancelling after a crash following pause", async () => {
  const fixture = createFixture();
  await fixture.service.put({ ...reference(), activationAt });
  fixture.host.failNextPause = true;

  await assert.rejects(fixture.service.delete(reference()), /pause crash/u);
  assert.equal(
    fixture.schedules.get(reference())?.state,
    DefinitionScheduleState.Cancelling,
  );

  const restarted = fixture.restartedService();
  await restarted.reconcileAll();
  const recovered = await restarted.get(reference());
  assert.equal(recovered?.status, DefinitionScheduleState.Cancelled);
  assert.equal(fixture.host.pauseCalls.length, 2);
});

test("accepted response lost after action exhaustion persists one started instance", async () => {
  const fixture = createFixture();
  fixture.host.createResults.push({
    phase: DefinitionScheduleHostPhase.Started,
    executionWorkflowId: "opaque-workflow",
    firstRunId: "opaque-first-run",
  });

  const first = await fixture.service.put({ ...reference(), activationAt });
  fixture.setNow("2026-08-11T12:00:02.000Z");
  const retry = await fixture.service.put({ ...reference(), activationAt });

  assert.equal(first.schedule.status, DefinitionScheduleState.Started);
  assert.deepEqual(first.schedule, retry.schedule);
  assert.equal(first.schedule.instance?.processInstanceId, "process-instance-1");
  assert.equal(fixture.host.createCalls.length, 1);
  assert.equal(fixture.schedules.records.size, 1);
});

test("changed activation under one public key conflicts without a Schedule host call", async () => {
  const fixture = createFixture();
  await fixture.service.put({ ...reference(), activationAt });
  fixture.host.scheduleCalls.length = 0;

  await assert.rejects(
    fixture.service.put({
      ...reference(),
      activationAt: "2026-08-11T12:01:00.000Z",
    }),
    (error: unknown) => error instanceof DefinitionScheduleConflictError,
  );
  assert.deepEqual(fixture.host.scheduleCalls, []);
});

test("derives dueAt from the exact capability and forwards immutable binding", async () => {
  const fixture = createFixture();

  const result = await fixture.service.put({ ...reference(), activationAt });

  assert.equal(result.schedule.dueAt, dueAt);
  assert.equal(fixture.host.createCalls[0]?.dueAt, dueAt);
  assert.equal(fixture.host.createCalls[0]?.activationAt, activationAt);
  assert.deepEqual(fixture.host.createCalls[0]?.timerStart, {
    startEventId: "TimerStart",
    durationMs: 1_000,
  });
  assert.equal(fixture.host.createCalls[0]?.definition.version, 1);
});

test("rejects malformed, non-whole-second, noncanonical, and past activation before host entry", async () => {
  for (const candidate of [
    "not-an-instant",
    "2026-08-11T12:00:00.123Z",
    "2026-08-11T12:00:00.000+00:00",
    "2026-08-11T11:58:00.000Z",
  ]) {
    const fixture = createFixture();
    await assert.rejects(
      fixture.service.put({ ...reference(), activationAt: candidate }),
      (error: unknown) => error instanceof DefinitionScheduleValidationError,
    );
    assert.equal(fixture.host.validationCalls.length, 0, candidate);
    assert.deepEqual(fixture.host.scheduleCalls, [], candidate);
  }
});

test("started host action wins a cancellation race and remains privately addressed", async () => {
  const fixture = createFixture();
  await fixture.service.put({ ...reference(), activationAt });
  fixture.host.pauseResults.push({
    phase: DefinitionScheduleHostPhase.Started,
    executionWorkflowId: "opaque-race-workflow",
    firstRunId: "opaque-race-run",
  });

  await assert.rejects(
    fixture.service.delete(reference()),
    (error: unknown) => error instanceof DefinitionScheduleConflictError,
  );
  const stored = fixture.schedules.get(reference());
  assert.equal(stored?.state, DefinitionScheduleState.Started);
  assert.equal(stored?.executionWorkflowId, "opaque-race-workflow");
  const visible = await fixture.service.get(reference());
  assert.equal(visible?.status, DefinitionScheduleState.Started);
  assert.doesNotMatch(JSON.stringify(visible), /opaque-race/u);
});

test("requires pause-confirmed pending before cancellation can become cancelled", async () => {
  const fixture = createFixture();
  await fixture.service.put({ ...reference(), activationAt });
  fixture.host.pauseResults.push({
    phase: DefinitionScheduleHostPhase.Pending,
    paused: false,
  });

  await assert.rejects(
    fixture.service.delete(reference()),
    (error: unknown) => error instanceof DefinitionScheduleIntegrityError,
  );
  assert.equal(
    fixture.schedules.get(reference())?.state,
    DefinitionScheduleState.Cancelling,
  );
});

test("divergent scheduled host is integrity failure and is never recreated", async () => {
  const fixture = createFixture();
  await fixture.service.put({ ...reference(), activationAt });
  fixture.host.createCalls.length = 0;
  fixture.host.inspectResults.push({
    phase: DefinitionScheduleHostPhase.IntegrityFailure,
    evidence: "host Schedule is missing or divergent",
  });

  await assert.rejects(
    fixture.service.get(reference()),
    (error: unknown) => error instanceof DefinitionScheduleIntegrityError,
  );
  assert.deepEqual(fixture.host.createCalls, []);
  assert.equal(
    fixture.schedules.get(reference())?.state,
    DefinitionScheduleState.Scheduled,
  );
});

test("rejection while recompiling stored admitted bytes is integrity failure", async () => {
  const fixture = createFixture();
  fixture.host.validationResults.push({
    status: "rejected",
    evidence: "stored admitted bytes no longer compile",
  });

  await assert.rejects(
    fixture.service.put({ ...reference(), activationAt }),
    (error: unknown) => error instanceof DefinitionScheduleIntegrityError,
  );
  assert.deepEqual(fixture.host.scheduleCalls, []);
  assert.equal(fixture.schedules.get(reference()), null);
});

test("reconciliation uses the snapshotted definition and never resolves latest", async () => {
  const fixture = createFixture();
  await fixture.service.put({ ...reference(), activationAt });
  assert.equal(fixture.definitions.gets, 1);

  await fixture.service.get(reference());

  assert.equal(fixture.definitions.gets, 1);
  assert.equal(fixture.host.inspectCalls[0]?.definition.version, 1);
});

test("missing exact definition remains distinct from validation failure", async () => {
  const fixture = createFixture();
  fixture.definitions.missing = true;

  await assert.rejects(
    fixture.service.put({ ...reference(), activationAt }),
    (error: unknown) => error instanceof DefinitionScheduleNotFoundError,
  );
  assert.equal(fixture.host.validationCalls.length, 0);
  assert.deepEqual(fixture.host.scheduleCalls, []);
});

function createFixture() {
  const definition = timerDefinition();
  const definitions = new MemoryDefinitionRepository(definition);
  const schedules = new MemoryScheduleRepository();
  const host = new MemoryHost(definition);
  const artifacts: ExactArtifactStore = {
    put: async () => ({ status: "stored" }),
    get: async () => Uint8Array.from(bytes),
  };
  let now = Date.parse("2026-08-11T11:59:00.000Z");
  const dependencies = {
    artifacts,
    definitions,
    schedules,
    host,
    identities: {
      processInstanceId: () => "process-instance-1",
      hostScheduleId: () => "host-schedule-1",
      configuredWorkflowIdBase: () => "configured-base-1",
    },
    now: () => now,
  } as const;
  const service = new DefinitionScheduleService(dependencies);
  return {
    service,
    definitions,
    schedules,
    host,
    setNow: (value: string) => {
      now = Date.parse(value);
    },
    restartedService: () => new DefinitionScheduleService(dependencies),
  };
}

function timerDefinition(): DefinitionMetadata {
  return {
    processId: "Process_Timer",
    version: 1,
    source: {
      kind: "bpmnSource",
      id: "timer-source",
      sha256: "1".repeat(64),
      byteLength: bytes.byteLength,
      declaredEncoding: null,
      decodedAs: "UTF-8",
    },
    semanticProfile: "timer-profile",
    startCapabilities: {
      timerStarts: [{ startEventId: "TimerStart", durationMs: 1_000 }],
    },
  };
}

function reference(): DefinitionScheduleReference {
  return { processId: "Process_Timer", version: 1, scheduleId: "schedule-1" };
}

class MemoryDefinitionRepository implements DefinitionRepository {
  readonly value: DefinitionMetadata;
  gets = 0;
  missing = false;

  constructor(value: DefinitionMetadata) {
    this.value = value;
  }
  allocateNext(_metadata: NewDefinitionMetadata): DefinitionMetadata {
    throw new Error("not used");
  }
  listLatest(): ReadonlyArray<DefinitionMetadata> {
    return [this.value];
  }
  listVersions(_processId: string): ReadonlyArray<DefinitionMetadata> {
    return [this.value];
  }
  get(selected: DefinitionReference): DefinitionMetadata | null {
    this.gets += 1;
    if (this.missing) {
      return null;
    }
    return selected.processId === this.value.processId &&
      selected.version === this.value.version
      ? this.value
      : null;
  }
}

class MemoryScheduleRepository implements DefinitionScheduleRepository {
  readonly records = new Map<string, DefinitionScheduleRecord>();
  beforeFirstCreatingHost: (() => void) | null = null;

  reserve(value: NewDefinitionScheduleRecord): DefinitionScheduleReservation {
    const key = scheduleKey(value.reference);
    const found = this.records.get(key);
    if (found !== undefined) {
      return { inserted: false, record: found };
    }
    const record: DefinitionScheduleRecord = {
      ...structuredClone(value),
      state: DefinitionScheduleState.Creating,
      cleanupComplete: false,
      cancellationOrigin: null,
      executionWorkflowId: null,
      firstRunId: null,
    };
    this.records.set(key, record);
    return { inserted: true, record: structuredClone(record) };
  }

  get(selected: DefinitionScheduleReference): DefinitionScheduleRecord | null {
    return structuredClone(this.records.get(scheduleKey(selected)) ?? null);
  }

  listForDefinition(selected: DefinitionReference): ReadonlyArray<DefinitionScheduleRecord> {
    return [...this.records.values()]
      .filter(({ reference: item }) =>
        item.processId === selected.processId && item.version === selected.version)
      .sort((left, right) => compareStrings(
        left.reference.scheduleId,
        right.reference.scheduleId,
      ))
      .map((record) => structuredClone(record));
  }

  listForReconciliation(): ReadonlyArray<DefinitionScheduleRecord> {
    return [...this.records.values()].map((record) => structuredClone(record));
  }

  compareAndSet(
    selected: DefinitionScheduleReference,
    expected: DefinitionScheduleRecord["state"],
    transition: DefinitionScheduleTransition,
  ): DefinitionScheduleRecord | null {
    if (
      expected === DefinitionScheduleState.Creating &&
      transition.state === DefinitionScheduleState.CreatingHost &&
      this.beforeFirstCreatingHost !== null
    ) {
      const hook = this.beforeFirstCreatingHost;
      this.beforeFirstCreatingHost = null;
      hook();
    }
    const key = scheduleKey(selected);
    const current = this.records.get(key);
    if (current === undefined || current.state !== expected) {
      return null;
    }
    const next = { ...current, ...transition };
    this.records.set(key, next);
    return structuredClone(next);
  }

  requestCancellation(selected: DefinitionScheduleReference): DefinitionScheduleRecord | null {
    const current = this.records.get(scheduleKey(selected));
    if (current === undefined) {
      return null;
    }
    switch (current.state) {
      case DefinitionScheduleState.Creating:
        return this.replace(current, {
          state: DefinitionScheduleState.Cancelled,
          cleanupComplete: true,
        });
      case DefinitionScheduleState.CreatingHost:
      case DefinitionScheduleState.Scheduled:
        return this.replace(current, {
          state: DefinitionScheduleState.Cancelling,
          cancellationOrigin: current.state,
        });
      default:
        return structuredClone(current);
    }
  }

  markCleanupComplete(
    selected: DefinitionScheduleReference,
    expected: DefinitionScheduleRecord["state"],
  ): DefinitionScheduleRecord | null {
    return this.compareAndSet(selected, expected, {
      state: expected,
      cleanupComplete: true,
    });
  }

  private replace(
    current: DefinitionScheduleRecord,
    transition: DefinitionScheduleTransition,
  ): DefinitionScheduleRecord {
    const next = { ...current, ...transition };
    this.records.set(scheduleKey(current.reference), next);
    return structuredClone(next);
  }
}

class MemoryHost implements DefinitionScheduleHost {
  readonly createResults: DefinitionScheduleHostResult[] = [];
  readonly createCalls: DefinitionScheduleHostRequest[] = [];
  readonly inspectCalls: DefinitionScheduleHostRequest[] = [];
  readonly pauseCalls: DefinitionScheduleHostRequest[] = [];
  readonly deleteCalls: DefinitionScheduleHostRequest[] = [];
  readonly scheduleCalls: string[] = [];
  readonly validationCalls: DefinitionScheduleValidationRequest[] = [];
  readonly validationResults: Awaited<ReturnType<
    DefinitionScheduleHost["validateDefinition"]
  >>[] = [];
  readonly inspectResults: DefinitionScheduleHostResult[] = [];
  readonly pauseResults: DefinitionScheduleHostResult[] = [];
  failNextPause = false;
  paused = false;

  readonly definition: DefinitionMetadata;

  constructor(definition: DefinitionMetadata) {
    this.definition = definition;
  }

  async validateDefinition(request: DefinitionScheduleValidationRequest) {
    this.validationCalls.push({
      ...request,
      bytes: Uint8Array.from(request.bytes),
    });
    return this.validationResults.shift() ?? {
      status: "accepted" as const,
      source: structuredClone(this.definition.source),
      processId: this.definition.processId,
      semanticProfile: this.definition.semanticProfile,
      startCapabilities: structuredClone(this.definition.startCapabilities),
    };
  }

  async createOrCompare(request: DefinitionScheduleHostRequest) {
    this.scheduleCalls.push("createOrCompare");
    this.createCalls.push(structuredClone(request));
    return this.createResults.shift() ?? {
      phase: DefinitionScheduleHostPhase.Pending,
      paused: false,
    };
  }

  async inspect(request: DefinitionScheduleHostRequest) {
    this.scheduleCalls.push("inspect");
    this.inspectCalls.push(structuredClone(request));
    return this.inspectResults.shift() ?? {
      phase: DefinitionScheduleHostPhase.Pending,
      paused: this.paused,
    } as const;
  }

  async pause(request: DefinitionScheduleHostRequest): Promise<DefinitionScheduleHostResult> {
    this.scheduleCalls.push("pause");
    this.pauseCalls.push(structuredClone(request));
    this.paused = true;
    if (this.failNextPause) {
      this.failNextPause = false;
      throw new Error("pause crash");
    }
    return this.pauseResults.shift() ?? {
      phase: DefinitionScheduleHostPhase.Pending,
      paused: true,
    };
  }

  async delete(request: DefinitionScheduleHostRequest): Promise<void> {
    this.scheduleCalls.push("delete");
    this.deleteCalls.push(structuredClone(request));
  }
}

function scheduleKey(value: DefinitionScheduleReference): string {
  return `${value.processId}\u0000${value.version}\u0000${value.scheduleId}`;
}

function compareStrings(left: string, right: string): number {
  const leftScalars = Array.from(left, (value) => value.codePointAt(0)!);
  const rightScalars = Array.from(right, (value) => value.codePointAt(0)!);
  for (let index = 0; index < Math.min(leftScalars.length, rightScalars.length); index += 1) {
    const leftScalar = leftScalars[index]!;
    const rightScalar = rightScalars[index]!;
    if (leftScalar !== rightScalar) {
      return leftScalar < rightScalar ? -1 : 1;
    }
  }
  return leftScalars.length - rightScalars.length;
}
