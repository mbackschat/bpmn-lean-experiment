import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeIncidentActionRequest,
  decodeIncidentActionResult,
  decodeIncidentActionApiResponse,
  decodeIncidentAuditApiResponse,
  decodeIncidentAuditPage,
  decodeIncidentAuditRequest,
  decodeIncidentDetailApiResponse,
  decodeIncidentListApiResponse,
  decodePublicIncident,
  decodePublicIncidentSnapshot,
  IncidentActionApiErrorCodes,
  IncidentAuditApiErrorCodes,
  IncidentDetailApiErrorCodes,
  IncidentListApiErrorCodes,
  IncidentSnapshotUnavailableMessage,
  PublicApiErrorCode,
} from "@bpmn-lean/platform-contracts";

const source = {
  kind: "bpmnSource",
  id: "incident.bpmn",
  sha256: "a".repeat(64),
  byteLength: 512,
  declaredEncoding: "UTF-8",
  decodedAs: "UTF-8",
} as const;

const hostingInstance = {
  processInstanceId: "process-1",
  definition: {
    processId: "IncidentProcess",
    version: 1,
    source,
    semanticProfile: "cib-seven-2.2.0:service-task-incident-cancellation",
    startCapabilities: { messageStarts: [], timerStarts: [] },
  },
} as const;

const occurrence = {
  processInstanceId: "process-1",
  elementId: "ServiceTask_Fail",
  activation: 1,
} as const;
const incidentId = { effectId: occurrence, generation: 1 } as const;
const retry = { kind: "retryIncident", incidentId } as const;
const cancel = {
  kind: "cancelIncidentProcess",
  processInstanceId: "process-1",
  incidentId,
} as const;
const incident = {
  hostingInstance,
  incident: {
    kind: "effectExecutionFailed",
    id: incidentId,
    effect: {
      id: occurrence,
      descriptor: { protocol: "cibDelegate", operation: "fail" },
      arguments: [],
    },
  },
  availableInteractions: [retry, cancel],
} as const;

test("decodes the exact generation-1 incident and canonical snapshot", () => {
  assert.deepEqual(decodePublicIncident(incident), incident);
  assert.deepEqual(decodePublicIncidentSnapshot({ incidents: [incident] }), {
    incidents: [incident],
  });
});

test("rejects nested identity drift and private locator fields", () => {
  assert.throws(
    () => decodePublicIncident({
      ...incident,
      incident: {
        ...incident.incident,
        effect: {
          ...incident.incident.effect,
          id: { ...occurrence, elementId: "ServiceTask_Other" },
        },
      },
    }),
    /effect identity must equal incident identity/u,
  );
  assert.throws(
    () => decodePublicIncident({ ...incident, locator: "private-host-address" }),
    /public fields/u,
  );
});

test("rejects Cancel Process identity drift and nonempty effect arguments", () => {
  assert.throws(
    () => decodePublicIncident({
      ...incident,
      availableInteractions: [
        retry,
        { ...cancel, processInstanceId: "another-process" },
      ],
    }),
    /Cancel Process identity must equal the incident Process identity/u,
  );
  assert.throws(
    () => decodePublicIncident({
      ...incident,
      incident: {
        ...incident.incident,
        effect: {
          ...incident.incident.effect,
          arguments: [{ name: "private", value: "payload" }],
        },
      },
    }),
    /arguments must be empty/u,
  );
});

test("requires strict scalar-order incident snapshots", () => {
  const later = {
    ...incident,
    hostingInstance: {
      ...hostingInstance,
      processInstanceId: "process-🚀",
    },
    incident: {
      ...incident.incident,
      id: {
        effectId: { ...occurrence, processInstanceId: "process-🚀" },
        generation: 1,
      },
      effect: {
        ...incident.incident.effect,
        id: { ...occurrence, processInstanceId: "process-🚀" },
      },
    },
    availableInteractions: [{
      kind: "retryIncident",
      incidentId: {
        effectId: { ...occurrence, processInstanceId: "process-🚀" },
        generation: 1,
      },
    }],
  } as const;
  assert.deepEqual(
    decodePublicIncidentSnapshot({ incidents: [incident, later] }).incidents,
    [incident, later],
  );
  assert.throws(
    () => decodePublicIncidentSnapshot({ incidents: [later, incident] }),
    /canonical strict ascending order/u,
  );
});

test("decodes only exact published action requests and closed results", () => {
  assert.deepEqual(decodeIncidentActionRequest(retry), retry);
  assert.deepEqual(decodeIncidentActionRequest(cancel), cancel);
  assert.throws(
    () => decodeIncidentActionRequest({
      ...cancel,
      processInstanceId: "another-process",
    }),
    /Cancel Process identity must equal the incident Process identity/u,
  );

  const results = [
    { state: "committed", actionId: "action-1", interaction: retry },
    {
      state: "rejected",
      actionId: "action-2",
      interaction: cancel,
      engineResult: { kind: "semantic", outcome: "rolledBack" },
    },
    {
      state: "rejected",
      actionId: "action-3",
      interaction: cancel,
      engineResult: { kind: "processClosed", status: "cancelled" },
    },
    { state: "indeterminate", actionId: "action-4", interaction: retry },
  ] as const;
  for (const result of results) {
    assert.deepEqual(decodeIncidentActionResult(result), result);
  }
  assert.throws(
    () => decodeIncidentActionResult({
      ...results[0],
      engineResult: { kind: "processClosed", status: "cancelled" },
    }),
    /public fields/u,
  );
});

test("decodes canonical incident audit and rejects partial exact identity filters", () => {
  const auditEvent = {
    eventId: "event-1",
    actorId: "operator-1",
    recordedAt: "2026-08-14T09:30:00.000Z",
    hostingProcessInstanceId: "process-1",
    incidentId,
    actionId: "action-1",
    actionKind: "retryIncident",
    outcome: "reserved",
  } as const;
  const page = { events: [auditEvent], nextCursor: "v1.MQ" } as const;
  assert.deepEqual(decodeIncidentAuditPage(page), page);
  assert.deepEqual(decodeIncidentAuditRequest({
    actorId: "operator-1",
    hostingProcessInstanceId: "process-1",
    incidentProcessInstanceId: "process-1",
    incidentElementId: "ServiceTask_Fail",
    incidentActivation: 1,
    incidentGeneration: 1,
    actionKind: "retryIncident",
    cursor: "v1.MQ",
    limit: 100,
  }), {
    actorId: "operator-1",
    hostingProcessInstanceId: "process-1",
    incidentProcessInstanceId: "process-1",
    incidentElementId: "ServiceTask_Fail",
    incidentActivation: 1,
    incidentGeneration: 1,
    actionKind: "retryIncident",
    cursor: "v1.MQ",
    limit: 100,
  });
  assert.throws(
    () => decodeIncidentAuditRequest({ incidentElementId: "ServiceTask_Fail" }),
    /all be present or all be absent/u,
  );
  assert.throws(
    () => decodeIncidentAuditPage({
      events: [{ ...auditEvent, recordedAt: "2026-08-14T09:30:00Z" }],
      nextCursor: null,
    }),
    /canonical millisecond UTC instant/u,
  );
});

test("keeps exact route error subsets and the unavailable canonical message", () => {
  assert.deepEqual(IncidentListApiErrorCodes, [
    "invalidRequest",
    "methodNotAllowed",
    "forbidden",
    "incidentSnapshotUnavailable",
    "internalFailure",
  ]);
  assert.deepEqual(IncidentDetailApiErrorCodes, [
    ...IncidentListApiErrorCodes,
    "notFound",
  ]);
  assert.deepEqual(IncidentActionApiErrorCodes, [
    "invalidRequest",
    "methodNotAllowed",
    "unsupportedMediaType",
    "payloadTooLarge",
    "conflict",
    "forbidden",
    "incidentSnapshotUnavailable",
    "internalFailure",
  ]);
  assert.deepEqual(IncidentAuditApiErrorCodes, [
    "invalidRequest",
    "methodNotAllowed",
    "forbidden",
    "internalFailure",
  ]);

  const unavailable = {
    error: {
      code: PublicApiErrorCode.IncidentSnapshotUnavailable,
      message: IncidentSnapshotUnavailableMessage,
    },
  } as const;
  assert.deepEqual(decodeIncidentListApiResponse(unavailable), unavailable);
  assert.throws(
    () => decodeIncidentListApiResponse({
      error: {
        code: PublicApiErrorCode.IncidentSnapshotUnavailable,
        message: "drifted",
      },
    }),
    /canonical message/u,
  );
  assert.throws(
    () => decodeIncidentDetailApiResponse({
      error: { code: "payloadTooLarge", message: "not a detail error" },
    }),
    /not allowed by this route/u,
  );
  assert.deepEqual(decodeIncidentActionApiResponse({
    error: { code: "conflict", message: "Conflict." },
  }), {
    error: { code: "conflict", message: "Conflict." },
  });
  assert.throws(
    () => decodeIncidentActionApiResponse({
      error: { code: "notFound", message: "Action routes do not publish 404." },
    }),
    /not allowed by this route/u,
  );
  assert.deepEqual(decodeIncidentAuditApiResponse({
    error: { code: "forbidden", message: "Forbidden." },
  }), {
    error: { code: "forbidden", message: "Forbidden." },
  });
  assert.throws(
    () => decodeIncidentAuditApiResponse({
      error: {
        code: "incidentSnapshotUnavailable",
        message: IncidentSnapshotUnavailableMessage,
      },
    }),
    /not allowed by this route/u,
  );
});
