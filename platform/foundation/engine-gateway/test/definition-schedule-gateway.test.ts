/** The gateway is Product 2's only Schedule host and returns only closed host results. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnDefinitionScheduleGateway,
  DefinitionScheduleHostPhase,
} from "@bpmn-lean/platform-engine-gateway";
import type {
  BpmnDefinitionScheduleGatewayOptions,
  DefinitionScheduleHost,
  DefinitionScheduleHostRequest,
} from "@bpmn-lean/platform-engine-gateway";

const sourceUrl = new URL(
  "../../../../scenarios/timer-start-event/process.bpmn",
  import.meta.url,
);
const activationAtEpochMs = Date.UTC(2030, 0, 2, 3, 4, 5);

test("validates the exact stored definition and maps its Timer Start capability", async () => {
  const bytes = await readFile(sourceUrl);
  const host: DefinitionScheduleHost = gateway(new GatewayScheduleClient());
  const result = await host.validateDefinition({
    bytes,
    sourceId: "stored-timer-definition",
    expectedSha256: createHash("sha256").update(bytes).digest("hex"),
    semanticProfile: "bpmn-2.0.2-timer-start-event-draft",
    expectedProcessId: "Process_TimerStart",
  });

  assert.equal(result.status, "accepted");
  assert.deepEqual(result.startCapabilities, {
    messageStarts: [],
    timerStarts: [{ startEventId: "TimerStart_PT1S", durationMs: 1_000 }],
  });
});

test("adapts create, pause confirmation, inspect, and delete without raw Schedule state", async () => {
  const bytes = await readFile(sourceUrl);
  const fake = new GatewayScheduleClient();
  const host: DefinitionScheduleHost = gateway(fake);
  const binding = bindingFor(bytes);

  assert.deepEqual(await host.createOrCompare(binding), {
    phase: DefinitionScheduleHostPhase.Pending,
    paused: false,
  });
  assert.deepEqual(await host.pause(binding), {
    phase: DefinitionScheduleHostPhase.Pending,
    paused: true,
  });
  const ordinaryInspect = await host.inspect(binding);
  assert.equal(
    ordinaryInspect.phase,
    DefinitionScheduleHostPhase.IntegrityFailure,
  );
  await host.delete(binding);

  assert.equal(fake.creates, 1);
  assert.equal(fake.pauses, 1);
  assert.equal(fake.deletes, 1);
  assert.equal("description" in ordinaryInspect, false);
  assert.equal("semanticProcess" in ordinaryInspect, false);
  assert.equal("action" in ordinaryInspect, false);
});

test("wrong gateway start capability reaches no host create operation", async () => {
  const bytes = await readFile(sourceUrl);
  const fake = new GatewayScheduleClient();
  const result = await gateway(fake).createOrCompare({
    ...bindingFor(bytes),
    timerStart: {
      startEventId: "Wrong_Start",
      durationMs: 1_000,
    },
  });

  assert.equal(result.phase, DefinitionScheduleHostPhase.IntegrityFailure);
  assert.equal(fake.creates, 0);
  assert.equal(fake.describes, 0);
});

class GatewayScheduleClient {
  creates = 0;
  describes = 0;
  pauses = 0;
  deletes = 0;
  paused = false;
  options: unknown;

  readonly client = {
    schedule: {
      create: async (options: unknown) => {
        this.creates += 1;
        this.options = options;
        return {};
      },
      getHandle: () => ({
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
  } as unknown as BpmnDefinitionScheduleGatewayOptions["temporalClient"];

  private description(): unknown {
    const options = requireRecord(this.options);
    const spec = requireRecord(options.spec);
    const dueAt = spec.startAt as Date;
    const action = requireRecord(options.action);
    const exact = <Value>(value: Value) => [{ start: value, end: value, step: 1 }];
    return {
      scheduleId: options.scheduleId,
      spec: {
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
      },
      action: {
        ...action,
        workflowExecutionTimeout: undefined,
        workflowRunTimeout: undefined,
        workflowTaskTimeout: undefined,
      },
      policies: options.policies,
      state: { paused: this.paused, remainingActions: 1 },
      info: {
        recentActions: [],
        nextActionTimes: [dueAt],
        numActionsTaken: 0,
        numActionsMissedCatchupWindow: 0,
        numActionsSkippedOverlap: 0,
        createdAt: new Date(dueAt.getTime() - 1_000),
        lastUpdatedAt: undefined,
        runningActions: [],
      },
      searchAttributes: {},
      typedSearchAttributes: {},
      raw: {},
    };
  }
}

function gateway(fake: GatewayScheduleClient): BpmnDefinitionScheduleGateway {
  return new BpmnDefinitionScheduleGateway({
    maxSourceBytes: 1_048_576,
    parserDeadlineMs: 1_000,
    temporalClient: fake.client,
    temporalTaskQueue: "definition-schedule-queue",
  });
}

function bindingFor(bytes: Uint8Array): DefinitionScheduleHostRequest {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return {
    bytes,
    definition: {
      processId: "Process_TimerStart",
      source: {
        id: "stored-timer-definition",
        sha256,
        byteLength: bytes.byteLength,
      },
      semanticProfile: "bpmn-2.0.2-timer-start-event-draft",
      startCapabilities: {
        messageStarts: [],
        timerStarts: [{
          startEventId: "TimerStart_PT1S",
          durationMs: 1_000,
        }],
      },
    },
    timerStart: {
      startEventId: "TimerStart_PT1S",
      durationMs: 1_000,
    },
    processInstanceId: "semantic-instance-42",
    hostScheduleId: "host-schedule-42",
    configuredWorkflowIdBase: "configured-workflow-base-42",
    activationAt: new Date(activationAtEpochMs).toISOString(),
    dueAt: new Date(activationAtEpochMs + 1_000).toISOString(),
  };
}

function requireRecord(value: unknown): Record<string, unknown> {
  assert.ok(typeof value === "object" && value !== null && !Array.isArray(value));
  return value as Record<string, unknown>;
}
