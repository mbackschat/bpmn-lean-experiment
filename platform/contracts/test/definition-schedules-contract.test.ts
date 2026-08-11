import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeDefinitionSchedule,
  decodeDefinitionScheduleConflictErrorResponse,
  decodeDefinitionScheduleListResponse,
  decodePutDefinitionScheduleRequest,
  decodePublicDefinitionStartCapabilities,
  decodePublicTimerStartCapability,
  definitionSchedulePath,
  definitionSchedulesPath,
  DefinitionScheduleStatus,
  matchDefinitionSchedulePath,
  matchDefinitionSchedulesPath,
  PublicApiErrorCode,
} from "@bpmn-lean/platform-contracts";
import type {
  DefinitionSchedule,
  DefinitionScheduleListResponse,
  DeployedDefinitionVersion,
  PutDefinitionScheduleRequest,
} from "@bpmn-lean/platform-contracts";

const definition = {
  processId: "order/process alpha",
  version: 2,
  source: {
    kind: "bpmnSource",
    id: "timer-start.bpmn",
    sha256: "d".repeat(64),
    byteLength: 2048,
    declaredEncoding: "UTF-8",
    decodedAs: "UTF-8",
  },
  semanticProfile: "cib-seven-2.2.0:timer-start",
  startCapabilities: {
    messageStarts: [],
    timerStarts: [{ startEventId: "TimerStart_1", durationMs: 1000 }],
  },
} as const satisfies DeployedDefinitionVersion;

const scheduled = {
  scheduleId: "schedule/alpha",
  definition,
  timerStart: { startEventId: "TimerStart_1", durationMs: 1000 },
  activationAt: "2026-08-11T12:00:00.000Z",
  dueAt: "2026-08-11T12:00:01.000Z",
  status: DefinitionScheduleStatus.Scheduled,
  instance: null,
} as const satisfies DefinitionSchedule;

test("decodes the exact closed Timer Start capability and activation request", () => {
  const capability = { startEventId: "TimerStart_1", durationMs: 1000 };
  const request = {
    activationAt: "2026-08-11T12:00:00.000Z",
  } as const satisfies PutDefinitionScheduleRequest;

  assert.deepEqual(decodePublicTimerStartCapability(capability), capability);
  assert.deepEqual(decodePutDefinitionScheduleRequest(request), request);
  assert.throws(
    () => decodePublicTimerStartCapability({ ...capability, workflowId: "private" }),
    /Timer Start capability must contain exactly its public fields/u,
  );
  assert.throws(
    () => decodePublicTimerStartCapability({ ...capability, startEventId: "" }),
    /startEventId must not be empty/u,
  );
  assert.throws(
    () => decodePublicTimerStartCapability({ ...capability, durationMs: -1 }),
    /durationMs must be a nonnegative safe integer/u,
  );
  assert.throws(
    () => decodePublicDefinitionStartCapabilities({
      messageStarts: [],
      timerStarts: new Array<unknown>(1),
    }),
    /timerStarts\[0\] must be an object/u,
  );
  assert.throws(
    () => decodePublicDefinitionStartCapabilities({
      messageStarts: [],
      timerStarts: [capability],
      taskQueue: "private",
    }),
    /start capabilities must contain exactly its public fields/u,
  );
});

test("rejects nonzero-millisecond and noncanonical activation instants", () => {
  const malformed = [
    "2026-08-11T12:00:00.001Z",
    "2026-08-11T12:00:00Z",
    "2026-08-11T14:00:00.000+02:00",
    "2026-02-30T12:00:00.000Z",
    "not-an-instant",
  ];

  for (const activationAt of malformed) {
    assert.throws(
      () => decodePutDefinitionScheduleRequest({ activationAt }),
      /activationAt must be a canonical whole-second UTC instant/u,
    );
  }
});

test("rejects missing, extra, empty, and malformed activation request fields", () => {
  const malformed = [
    {},
    { activationAt: "2026-08-11T12:00:00.000Z", dueAt: "private" },
  ];
  for (const request of malformed) {
    assert.throws(
      () => decodePutDefinitionScheduleRequest(request),
      /schedule request must contain exactly its public fields/u,
    );
  }
  assert.throws(
    () => decodePutDefinitionScheduleRequest({ activationAt: 42 }),
    /activationAt must be a string/u,
  );
});

test("decodes every closed public schedule status and reconstructs nested values", () => {
  const schedules = [
    scheduled,
    { ...scheduled, status: DefinitionScheduleStatus.Missed },
    { ...scheduled, status: DefinitionScheduleStatus.Cancelled },
    {
      ...scheduled,
      status: DefinitionScheduleStatus.Started,
      instance: { processInstanceId: "process-instance-42", definition },
    },
  ] as const satisfies readonly DefinitionSchedule[];

  for (const schedule of schedules) {
    const decoded = decodeDefinitionSchedule(schedule);
    assert.deepEqual(decoded, schedule);
    assert.notStrictEqual(decoded, schedule);
    assert.notStrictEqual(decoded.definition, schedule.definition);
    assert.notStrictEqual(decoded.timerStart, schedule.timerStart);
  }
});

test("rejects private Temporal execution identities instead of stripping them", () => {
  assert.throws(
    () => decodeDefinitionSchedule({ ...scheduled, workflowId: "private-workflow" }),
    /definition schedule must contain exactly its public fields/u,
  );
  assert.throws(
    () => decodeDefinitionSchedule({
      ...scheduled,
      status: DefinitionScheduleStatus.Started,
      instance: {
        processInstanceId: "process-instance-42",
        definition,
        firstExecutionRunId: "private-run",
      },
    }),
    /instance must contain exactly its public fields/u,
  );
});

test("rejects a repeated definition whose Message Start capabilities drift", () => {
  assert.throws(
    () => decodeDefinitionSchedule({
      ...scheduled,
      status: DefinitionScheduleStatus.Started,
      instance: {
        processInstanceId: "process-instance-42",
        definition: {
          ...definition,
          startCapabilities: {
            ...definition.startCapabilities,
            messageStarts: [{
              startEventId: "MessageStart_1",
              channel: {
                kind: "operationMessage",
                interfaceId: "Interface_1",
                interfaceOperationId: "Operation_1",
                messageId: "Message_1",
              },
            }],
          },
        },
      },
    }),
    /instance\.definition must equal definition/u,
  );
});

test("rejects malformed schedule identities, capabilities, instants, and status payloads", () => {
  const malformed = [
    {
      value: { ...scheduled, scheduleId: "" },
      message: /scheduleId must not be empty/u,
    },
    {
      value: {
        ...scheduled,
        timerStart: { startEventId: "TimerStart_1", durationMs: 2000 },
      },
      message: /timerStart must be published by definition.startCapabilities/u,
    },
    {
      value: { ...scheduled, dueAt: "2026-08-11T12:00:02.000Z" },
      message: /dueAt must equal activationAt plus timerStart.durationMs/u,
    },
    {
      value: { ...scheduled, status: DefinitionScheduleStatus.Started },
      message: /started schedule.instance must be a public Process-instance identity/u,
    },
    {
      value: {
        ...scheduled,
        status: DefinitionScheduleStatus.Cancelled,
        instance: { processInstanceId: "process-instance-42", definition },
      },
      message: /cancelled schedule.instance must be null/u,
    },
    {
      value: { ...scheduled, status: "creating" },
      message: /definition schedule.status is not a public schedule status/u,
    },
  ];

  for (const { value, message } of malformed) {
    assert.throws(() => decodeDefinitionSchedule(value), message);
  }
});

test("decodes a closed exact-definition schedule list", () => {
  const input = {
    definition,
    schedules: [
      scheduled,
      { ...scheduled, scheduleId: "schedule/beta" },
    ],
  } as const satisfies DefinitionScheduleListResponse;

  const decoded = decodeDefinitionScheduleListResponse(input);
  assert.deepEqual(decoded, input);
  assert.notStrictEqual(decoded, input);
  assert.notStrictEqual(decoded.schedules, input.schedules);
  assert.throws(
    () => decodeDefinitionScheduleListResponse({ ...input, nextCursor: "private" }),
    /definition schedule list must contain exactly its public fields/u,
  );
  assert.throws(
    () => decodeDefinitionScheduleListResponse({
      definition,
      schedules: [{
        ...scheduled,
        definition: { ...definition, version: 3 },
      }],
    }),
    /schedules\[0\]\.definition must equal definition/u,
  );
  assert.throws(
    () => decodeDefinitionScheduleListResponse({
      definition,
      schedules: new Array<unknown>(1),
    }),
    /schedules\[0\] must be an object/u,
  );
});

test("decodes only the selected closed conflict response", () => {
  const input = {
    error: {
      code: PublicApiErrorCode.Conflict,
      message: "The schedule identity is already bound to another request.",
    },
  } as const;

  assert.deepEqual(decodeDefinitionScheduleConflictErrorResponse(input), input);
  assert.throws(
    () => decodeDefinitionScheduleConflictErrorResponse({
      error: { code: PublicApiErrorCode.NotFound, message: "Missing." },
    }),
    /schedule conflict error.code must be conflict/u,
  );
  assert.throws(
    () => decodeDefinitionScheduleConflictErrorResponse({
      error: { ...input.error, workflowId: "private" },
    }),
    /schedule conflict error must contain exactly its public fields/u,
  );
});

test("builds and matches exact collection and item paths", () => {
  const collectionPath = definitionSchedulesPath("order/process alpha", 2);
  const itemPath = definitionSchedulePath("order/process alpha", 2, "schedule/alpha");

  assert.equal(
    collectionPath,
    "/api/v1/definitions/order%2Fprocess%20alpha/versions/2/schedules",
  );
  assert.equal(
    itemPath,
    "/api/v1/definitions/order%2Fprocess%20alpha/versions/2/schedules/schedule%2Falpha",
  );
  assert.deepEqual(matchDefinitionSchedulesPath(collectionPath), {
    processId: "order/process alpha",
    version: 2,
  });
  assert.deepEqual(matchDefinitionSchedulePath(itemPath), {
    processId: "order/process alpha",
    version: 2,
    scheduleId: "schedule/alpha",
  });
  assert.equal(matchDefinitionSchedulesPath(`${collectionPath}/`), null);
  assert.equal(matchDefinitionSchedulePath(collectionPath), null);
});

test("rejects malformed route-builder and matched identities", () => {
  assert.throws(
    () => definitionSchedulePath("process", 1, ""),
    /scheduleId must not be empty/u,
  );
  assert.throws(
    () => definitionSchedulePath("process", 1, "\uD800"),
    /scheduleId must contain well-formed Unicode/u,
  );
  assert.throws(
    () => definitionSchedulesPath("process", 0),
    /version must be a positive safe integer/u,
  );
  assert.throws(
    () => matchDefinitionSchedulesPath(
      "/api/v1/definitions/%E0%A4%A/versions/2/schedules",
    ),
    /processId segment must be valid URI encoding/u,
  );
  assert.throws(
    () => matchDefinitionSchedulePath(
      "/api/v1/definitions/process/versions/02/schedules/id",
    ),
    /version segment must be a canonical positive safe integer/u,
  );
});
