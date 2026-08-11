/** Exact definition scheduling binds compilation, one immutable Schedule action, and safe phases. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  EngineDefinitionScheduleIntegrityCode,
  EngineDefinitionScheduleStatus,
  createBpmnDefinitionSchedule,
  deleteBpmnDefinitionSchedule,
  inspectBpmnDefinitionSchedule,
  pauseBpmnDefinitionSchedule,
} from "@bpmn-lean/engine-api";
import type {
  EngineDefinitionScheduleBindingRequest,
} from "@bpmn-lean/engine-api";

const sourceUrl = new URL(
  "../../../scenarios/timer-start-event/process.bpmn",
  import.meta.url,
);
const profile = "bpmn-2.0.2-timer-start-event-draft";
const activationAtEpochMs = Date.UTC(2030, 0, 2, 3, 4, 5);
const dueAtEpochMs = activationAtEpochMs + 1_000;

test("creates the exact one-action policy for arbitrary admitted identities", async () => {
  const original = await readFile(sourceUrl, "utf8");
  const processId = "Process_Arbitrary_42";
  const startEventId = "Start_Arbitrary_99";
  const bytes = new TextEncoder().encode(
    original
      .replaceAll("Process_TimerStart", processId)
      .replaceAll("TimerStart_PT1S", startEventId),
  );
  const fake = new FakeScheduleClient();

  const result = await createBpmnDefinitionSchedule(
    requestFor(bytes, fake.client, processId, startEventId),
  );

  assert.deepEqual(result, {
    status: EngineDefinitionScheduleStatus.Pending,
    paused: false,
  });
  assert.equal(fake.scheduleCreates, 1);
  assert.equal(fake.workflowStarts, 0);
  const created = requireRecord(fake.createdOptions);
  assert.equal(created.scheduleId, "host-schedule-42");
  assert.deepEqual(created.spec, {
    calendars: [{
      second: 6,
      minute: 4,
      hour: 3,
      dayOfMonth: 2,
      month: "JANUARY",
      year: 2030,
    }],
    startAt: new Date(dueAtEpochMs),
    endAt: new Date(dueAtEpochMs),
    timezone: "UTC",
  });
  assert.deepEqual(created.policies, {
    overlap: "SKIP",
    catchupWindow: 60_000,
    pauseOnFailure: true,
  });
  assert.deepEqual(created.state, { remainingActions: 1 });
  assert.equal("initialRemainingActions" in created.state, false);
  const action = requireRecord(created.action);
  assert.equal(action.workflowType, "runBpmnProcess");
  assert.equal(action.taskQueue, "definition-schedule-queue");
  assert.equal(action.workflowId, "configured-workflow-base-42");
  assert.deepEqual(action.retry, {
    maximumAttempts: 1,
    initialInterval: 1_000,
    maximumInterval: 100_000,
    backoffCoefficient: 2,
    nonRetryableErrorTypes: [],
  });
  const [start, program] = action.args as readonly [
    Readonly<Record<string, unknown>>,
    Readonly<Record<string, unknown>>,
  ];
  assert.deepEqual(start, {
    kind: "triggerTimerStart",
    commandId: "timer-start:semantic-instance-42",
    processId,
    instanceId: "semantic-instance-42",
    startEventId,
  });
  assert.equal(program.processId, processId);
});

test("wrong stored Timer Start identity creates neither Schedule nor Workflow", async () => {
  const bytes = await readFile(sourceUrl);
  const fake = new FakeScheduleClient();
  const result = await createBpmnDefinitionSchedule({
    ...requestFor(bytes, fake.client),
    expectedTimerStart: {
      startEventId: "Different_Start",
      durationMs: 1_000,
    },
  });

  assert.equal(result.status, EngineDefinitionScheduleStatus.IntegrityFailure);
  assert.equal(
    result.failure.code,
    EngineDefinitionScheduleIntegrityCode.CapabilityDrift,
  );
  assert.equal(fake.scheduleCreates, 0);
  assert.equal(fake.workflowStarts, 0);
  assert.equal(fake.describes, 0);
});

test("stored capability collection drift creates no host resource", async () => {
  const bytes = await readFile(sourceUrl);
  const fake = new FakeScheduleClient();
  const result = await createBpmnDefinitionSchedule({
    ...requestFor(bytes, fake.client),
    expectedStartCapabilities: {
      timerStarts: [
        { startEventId: "TimerStart_PT1S", durationMs: 1_000 },
        { startEventId: "Unexpected_Start", durationMs: 1_000 },
      ],
    },
  });

  assert.equal(result.status, EngineDefinitionScheduleStatus.IntegrityFailure);
  assert.equal(
    result.failure.code,
    EngineDefinitionScheduleIntegrityCode.CapabilityDrift,
  );
  assert.equal(fake.scheduleCreates, 0);
  assert.equal(fake.describes, 0);
});

test("response-lost inspection classifies the same running and exhausted action as started", async () => {
  const bytes = await readFile(sourceUrl);
  const fake = new FakeScheduleClient();
  const request = requestFor(bytes, fake.client);
  assert.equal(
    (await createBpmnDefinitionSchedule(request)).status,
    EngineDefinitionScheduleStatus.Pending,
  );

  fake.phase = "running";
  assert.deepEqual(await inspectBpmnDefinitionSchedule(request), {
    status: EngineDefinitionScheduleStatus.Started,
    paused: false,
    workflowId: "execution-workflow-opaque",
    firstExecutionRunId: "first-run-opaque",
  });

  fake.phase = "recent";
  assert.deepEqual(await inspectBpmnDefinitionSchedule(request), {
    status: EngineDefinitionScheduleStatus.Started,
    paused: false,
    workflowId: "execution-workflow-opaque",
    firstExecutionRunId: "first-run-opaque",
  });
  assert.notEqual("execution-workflow-opaque", "configured-workflow-base-42");
  assert.equal(fake.scheduleCreates, 1);
});

test("rejects every independently mutable Schedule policy", async () => {
  const bytes = await readFile(sourceUrl);
  const fake = new FakeScheduleClient();
  const request = requestFor(bytes, fake.client);
  await createBpmnDefinitionSchedule(request);

  for (const mutation of [
    "overlap",
    "catchupWindow",
    "pauseOnFailure",
    "workflowRetry",
    "workflowTimeout",
  ] as const) {
    fake.policyMutation = mutation;
    const result = await inspectBpmnDefinitionSchedule(request);
    assert.equal(result.status, EngineDefinitionScheduleStatus.IntegrityFailure);
    assert.equal(
      result.failure.code,
      EngineDefinitionScheduleIntegrityCode.ScheduleDrift,
      mutation,
    );
  }
});

test("locks pause confirmation before handle-free deletion", async () => {
  const bytes = await readFile(sourceUrl);
  const fake = new FakeScheduleClient();
  const request = requestFor(bytes, fake.client);
  await createBpmnDefinitionSchedule(request);

  assert.deepEqual(await pauseBpmnDefinitionSchedule(request), {
    status: EngineDefinitionScheduleStatus.Pending,
    paused: true,
  });
  assert.equal(fake.pauses, 1);
  const unexpected = await inspectBpmnDefinitionSchedule(request);
  assert.equal(
    unexpected.status,
    EngineDefinitionScheduleStatus.IntegrityFailure,
  );
  assert.equal(
    unexpected.failure.code,
    EngineDefinitionScheduleIntegrityCode.InvalidSchedulePhase,
  );

  await deleteBpmnDefinitionSchedule({
    scheduleId: request.scheduleId,
    temporalClient: fake.client,
  });
  assert.equal(fake.deletes, 1);
});

test("classifies exact missed counters and rejects disagreeing running identities", async () => {
  const bytes = await readFile(sourceUrl);
  const fake = new FakeScheduleClient();
  const request = requestFor(bytes, fake.client);
  await createBpmnDefinitionSchedule(request);

  fake.phase = "missed";
  assert.deepEqual(await inspectBpmnDefinitionSchedule(request), {
    status: EngineDefinitionScheduleStatus.Missed,
    paused: false,
  });

  fake.phase = "identityMismatch";
  const result = await inspectBpmnDefinitionSchedule(request);
  assert.equal(result.status, EngineDefinitionScheduleStatus.IntegrityFailure);
  assert.equal(
    result.failure.code,
    EngineDefinitionScheduleIntegrityCode.InvalidSchedulePhase,
  );
});

type FakePhase =
  | "pending"
  | "running"
  | "recent"
  | "missed"
  | "identityMismatch";

type PolicyMutation =
  | "overlap"
  | "catchupWindow"
  | "pauseOnFailure"
  | "workflowRetry"
  | "workflowTimeout";

class FakeScheduleClient {
  scheduleCreates = 0;
  workflowStarts = 0;
  describes = 0;
  pauses = 0;
  deletes = 0;
  createdOptions: unknown;
  phase: FakePhase = "pending";
  policyMutation: PolicyMutation | undefined;
  paused = false;

  readonly client = {
    workflow: {
      start: async () => {
        this.workflowStarts += 1;
        return {};
      },
    },
    schedule: {
      create: async (options: unknown) => {
        this.scheduleCreates += 1;
        this.createdOptions = options;
        this.phase = "pending";
        this.paused = false;
        return {};
      },
      getHandle: (scheduleId: string) => ({
        scheduleId,
        describe: async () => {
          this.describes += 1;
          return this.description();
        },
        pause: async () => {
          this.pauses += 1;
          this.paused = true;
        },
        delete: async () => {
          this.deletes += 1;
        },
      }),
    },
  } as unknown as EngineDefinitionScheduleBindingRequest["temporalClient"];

  private description(): unknown {
    const created = requireRecord(this.createdOptions);
    const spec = requireRecord(created.spec);
    const dueAt = spec.startAt as Date;
    const action = requireRecord(created.action);
    const retry = {
      ...requireRecord(action.retry),
      ...(this.policyMutation === "workflowRetry"
        ? { maximumAttempts: 2 }
        : {}),
    };
    const execution = (runId = "first-run-opaque") => ({
      type: "startWorkflow",
      workflow: {
        workflowId: "execution-workflow-opaque",
        firstExecutionRunId: runId,
      },
    });
    const running = this.phase === "running" || this.phase === "identityMismatch";
    const recent = this.phase === "recent" || this.phase === "identityMismatch";
    const started = running || recent;
    const missed = this.phase === "missed";
    return {
      scheduleId: created.scheduleId,
      spec: normalizedSpec(dueAt),
      action: {
        type: action.type,
        workflowType: action.workflowType,
        taskQueue: action.taskQueue,
        workflowId: action.workflowId,
        args: action.args,
        retry,
        workflowExecutionTimeout: this.policyMutation === "workflowTimeout"
          ? 1_000
          : undefined,
        workflowRunTimeout: undefined,
        workflowTaskTimeout: undefined,
      },
      policies: {
        overlap: this.policyMutation === "overlap" ? "ALLOW_ALL" : "SKIP",
        catchupWindow: this.policyMutation === "catchupWindow"
          ? 61_000
          : 60_000,
        pauseOnFailure: this.policyMutation === "pauseOnFailure"
          ? false
          : true,
      },
      state: {
        paused: this.paused,
        remainingActions: started ? 0 : 1,
      },
      info: {
        recentActions: recent
          ? [{
              scheduledAt: dueAt,
              takenAt: new Date(dueAt.getTime() + 1),
              action: execution(),
            }]
          : [],
        nextActionTimes: started || missed ? [] : [dueAt],
        numActionsTaken: started ? 1 : 0,
        numActionsMissedCatchupWindow: missed ? 1 : 0,
        numActionsSkippedOverlap: 0,
        createdAt: new Date(dueAt.getTime() - 1_000),
        lastUpdatedAt: undefined,
        runningActions: running
          ? [execution(this.phase === "identityMismatch"
            ? "different-first-run"
            : "first-run-opaque")]
          : [],
      },
      searchAttributes: {},
      typedSearchAttributes: {},
      raw: {},
    };
  }
}

function requestFor(
  bytes: Uint8Array,
  temporalClient: EngineDefinitionScheduleBindingRequest["temporalClient"],
  expectedProcessId = "Process_TimerStart",
  startEventId = "TimerStart_PT1S",
): EngineDefinitionScheduleBindingRequest {
  return {
    bytes,
    sourceId: "stored-timer-definition",
    expectedSha256: sha256(bytes),
    expectedByteLength: bytes.byteLength,
    semanticProfile: profile,
    expectedProcessId,
    expectedStartCapabilities: {
      timerStarts: [{ startEventId, durationMs: 1_000 }],
    },
    expectedTimerStart: { startEventId, durationMs: 1_000 },
    processInstanceId: "semantic-instance-42",
    scheduleId: "host-schedule-42",
    configuredWorkflowId: "configured-workflow-base-42",
    activationAtEpochMs,
    dueAtEpochMs,
    limits: { maxBytes: 1_048_576, parserDeadlineMs: 1_000 },
    temporalClient,
    taskQueue: "definition-schedule-queue",
  };
}

function normalizedSpec(dueAt: Date): unknown {
  const exact = <Value>(value: Value) => [{ start: value, end: value, step: 1 }];
  return {
    calendars: [{
      second: exact(dueAt.getUTCSeconds()),
      minute: exact(dueAt.getUTCMinutes()),
      hour: exact(dueAt.getUTCHours()),
      dayOfMonth: exact(dueAt.getUTCDate()),
      month: exact("JANUARY"),
      year: exact(dueAt.getUTCFullYear()),
      dayOfWeek: [{ start: "SUNDAY", end: "SATURDAY", step: 1 }],
      comment: undefined,
    }],
    intervals: [],
    skip: [],
    startAt: dueAt,
    endAt: dueAt,
    jitter: undefined,
    timezone: "UTC",
  };
}

function requireRecord(value: unknown): Record<string, unknown> {
  assert.ok(typeof value === "object" && value !== null && !Array.isArray(value));
  return value as Record<string, unknown>;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
