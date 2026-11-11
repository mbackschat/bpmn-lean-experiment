import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeDefinitionSchedule,
  decodeDefinitionScheduleConflictErrorResponse,
  decodeDefinitionScheduleListResponse,
  decodeDefinitionScheduleOccurrenceListResponse,
  decodePutDefinitionScheduleRequest,
  decodePublicDefinitionStartCapabilities,
  decodePublicTimerStartCapability,
  definitionScheduleOccurrencesPath,
  definitionSchedulePath,
  definitionSchedulesPath,
  DefinitionScheduleStatus,
  matchDefinitionScheduleOccurrencesPath,
  matchDefinitionSchedulePath,
  matchDefinitionSchedulesPath,
  PublicApiErrorCode,
} from "@bpmn-lean/platform-contracts";
import type {
  DefinitionSchedule,
  DefinitionScheduleListResponse,
  DefinitionScheduleOccurrenceListResponse,
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
  sourceOverlay: null,
} as const satisfies DeployedDefinitionVersion;

const scheduled = {
  scheduleId: "schedule/alpha",
  definition,
  timerStart: { startEventId: "TimerStart_1", durationMs: 1000 },
  dueAt: "2026-08-11T12:00:01.250Z",
  status: DefinitionScheduleStatus.Scheduled,
  instance: null,
} as const satisfies DefinitionSchedule;

test("decodes the exact closed Timer Start capability and occurrence request", () => {
  const capability = { startEventId: "TimerStart_1", durationMs: 1000 };
  const request = {
    dueAt: "2026-08-11T12:00:01.250Z",
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
  for (const durationMs of [-1, 1.5, "1000", Number.MAX_SAFE_INTEGER + 1, undefined]) {
    assert.throws(
      () => decodePublicTimerStartCapability({ ...capability, durationMs }),
      /durationMs must be a positive safe integer/u,
      String(durationMs),
    );
  }
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

test("decodes a Timer Start whose duration the engine resolves to none, and schedules it by occurrence", () => {
  const unresolved = { startEventId: "TimerStart_1", durationMs: null };
  assert.deepEqual(decodePublicTimerStartCapability(unresolved), unresolved);
  assert.deepEqual(
    decodePublicDefinitionStartCapabilities({ messageStarts: [], timerStarts: [unresolved] }),
    { messageStarts: [], timerStarts: [unresolved] },
  );
  const unresolvedDefinition = {
    ...definition,
    startCapabilities: { messageStarts: [], timerStarts: [unresolved] },
  };
  const unresolvedSchedule = { ...scheduled, definition: unresolvedDefinition, timerStart: unresolved };
  assert.deepEqual(decodeDefinitionSchedule(unresolvedSchedule), unresolvedSchedule);
  assert.throws(
    () => decodeDefinitionSchedule({ ...scheduled, definition: unresolvedDefinition }),
    /timerStart must be published by definition.startCapabilities/u,
  );
  assert.throws(
    () => decodeDefinitionSchedule({ ...scheduled, timerStart: unresolved }),
    /timerStart must be published by definition.startCapabilities/u,
  );
});

test("rejects noncanonical due instants", () => {
  const malformed = [
    "2026-08-11T12:00:00.1Z",
    "2026-08-11T12:00:00Z",
    "2026-08-11T14:00:00.000+02:00",
    "2026-02-30T12:00:00.000Z",
    "not-an-instant",
  ];

  for (const dueAt of malformed) {
    assert.throws(
      () => decodePutDefinitionScheduleRequest({ dueAt }),
      /dueAt must be a canonical UTC instant/u,
    );
  }
});

test("rejects missing, extra, empty, and malformed occurrence request fields", () => {
  const malformed = [
    {},
    { activationAt: "2026-08-11T12:00:00.000Z" },
    { dueAt: "2026-08-11T12:00:00.000Z", processInstanceId: "private" },
  ];
  for (const request of malformed) {
    assert.throws(
      () => decodePutDefinitionScheduleRequest(request),
      /schedule request must contain exactly its public fields/u,
    );
  }
  assert.throws(
    () => decodePutDefinitionScheduleRequest({ dueAt: 42 }),
    /dueAt must be a string/u,
  );
});

test("decodes every closed public schedule status and reconstructs nested values", () => {
  const schedules = [
    scheduled,
    { ...scheduled, status: DefinitionScheduleStatus.Missed },
    { ...scheduled, status: DefinitionScheduleStatus.Cancelled },
    { ...scheduled, status: DefinitionScheduleStatus.Refused, refusal: "timer-start-superseded" },
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
      value: { ...scheduled, dueAt: "2026-08-11T12:00:02Z" },
      message: /dueAt must be a canonical UTC instant/u,
    },
    {
      value: { ...scheduled, activationAt: "2026-08-11T12:00:00.000Z" },
      message: /definition schedule must contain exactly its public fields/u,
    },
    {
      value: { ...scheduled, status: DefinitionScheduleStatus.Refused },
      message: /definition schedule must contain exactly its public fields/u,
    },
    {
      value: { ...scheduled, refusal: "timer-start-superseded" },
      message: /definition schedule must contain exactly its public fields/u,
    },
    {
      value: { ...scheduled, status: DefinitionScheduleStatus.Refused, refusal: "" },
      message: /refusal must not be empty/u,
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

test("decodes a closed occurrence list in strictly ascending due order", () => {
  const listed = {
    definition,
    timerStart: { startEventId: "TimerStart_1", durationMs: 1000 },
    occurrences: [{ dueAt: "2026-08-11T12:00:01.250Z" }, { dueAt: "2026-08-11T13:00:01.250Z" }],
  } as const satisfies DefinitionScheduleOccurrenceListResponse;
  assert.deepEqual(decodeDefinitionScheduleOccurrenceListResponse(listed), listed);
  assert.deepEqual(decodeDefinitionScheduleOccurrenceListResponse({ ...listed, occurrences: [] }), { ...listed, occurrences: [] });
  for (const occurrences of [
    [listed.occurrences[1], listed.occurrences[0]],
    [listed.occurrences[0], listed.occurrences[0]],
  ]) {
    assert.throws(() => decodeDefinitionScheduleOccurrenceListResponse({ ...listed, occurrences }),
      /occurrences must be in strictly ascending due order/u);
  }
  assert.throws(
    () => decodeDefinitionScheduleOccurrenceListResponse({ ...listed, occurrences: [{ dueAt: listed.occurrences[0].dueAt, processInstanceId: "x" }] }),
    /occurrences\[0\] must contain exactly its public fields/u,
  );
  assert.throws(
    () => decodeDefinitionScheduleOccurrenceListResponse({ ...listed, timerStart: { startEventId: "Other", durationMs: 1000 } }),
    /timerStart must be published by definition.startCapabilities/u,
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

test("builds and matches the exact occurrence-listing path, beside the schedule collection", () => {
  const path = definitionScheduleOccurrencesPath("order/process alpha", 2);
  assert.equal(path, "/api/v1/definitions/order%2Fprocess%20alpha/versions/2/schedule-occurrences");
  assert.deepEqual(matchDefinitionScheduleOccurrencesPath(path), { processId: "order/process alpha", version: 2 });
  assert.equal(matchDefinitionScheduleOccurrencesPath(`${path}/x`), null);
  assert.equal(matchDefinitionSchedulePath(path), null);
  assert.equal(matchDefinitionScheduleOccurrencesPath(definitionSchedulesPath("order/process alpha", 2)), null);
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
