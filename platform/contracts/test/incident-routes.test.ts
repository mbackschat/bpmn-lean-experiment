import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeIncidentAuditRequest,
  IncidentAuditDefaultLimit,
  incidentActionPath,
  incidentAuditPath,
  incidentDetailPath,
  incidentsPath,
  matchIncidentActionPath,
  matchIncidentAuditPath,
  matchIncidentDetailPath,
  matchIncidentsPath,
  requireIncidentRequestBodyLength,
} from "@bpmn-lean/platform-contracts";

const incidentId = {
  effectId: {
    processInstanceId: "process/root 🚀",
    elementId: "Service Task/?",
    activation: 7,
  },
  generation: 1,
} as const;

test("builds and matches the closed incident list, detail, and action routes", () => {
  assert.equal(incidentsPath(), "/api/v1/incidents");
  assert.equal(matchIncidentsPath(incidentsPath()), true);
  const detail = incidentDetailPath(incidentId);
  assert.equal(
    detail,
    "/api/v1/incidents/process%2Froot%20%F0%9F%9A%80/Service%20Task%2F%3F/7/generations/1",
  );
  assert.deepEqual(matchIncidentDetailPath(detail), incidentId);
  assert.equal(
    incidentActionPath("action/id ?"),
    "/api/v1/incident-actions/action%2Fid%20%3F",
  );
  assert.equal(
    matchIncidentActionPath(incidentActionPath("action/id ?")),
    "action/id ?",
  );
});

test("builds audit filters in canonical order and defaults the limit", () => {
  const request = {
    actorId: "operator/one",
    hostingProcessInstanceId: "root ?",
    incidentProcessInstanceId: "root ?",
    incidentElementId: "Service Task",
    incidentActivation: 7,
    incidentGeneration: 1,
    actionKind: "cancelIncidentProcess",
    cursor: "v1.MQ",
    limit: 100,
  } as const;
  const path = incidentAuditPath(request);
  assert.equal(
    path,
    "/api/v1/incident-audit?actorId=operator%2Fone&hostingProcessInstanceId=root%20%3F&incidentProcessInstanceId=root%20%3F&incidentElementId=Service%20Task&incidentActivation=7&incidentGeneration=1&actionKind=cancelIncidentProcess&cursor=v1.MQ&limit=100",
  );
  assert.deepEqual(matchIncidentAuditPath(path), request);
  assert.deepEqual(matchIncidentAuditPath("/api/v1/incident-audit"), {
    limit: IncidentAuditDefaultLimit,
  });
  assert.deepEqual(decodeIncidentAuditRequest({ cursor: "v1.MQ" }), {
    cursor: "v1.MQ",
  });
});

test("rejects wrong generation, partial identity, duplicate fields, and noncanonical integers", () => {
  for (const path of [
    "/api/v1/incidents/process/Task/1/generations/2",
    "/api/v1/incidents/process/Task/01/generations/1",
    "/api/v1/incident-audit?incidentElementId=Task",
    "/api/v1/incident-audit?actorId=one&actorId=two",
    "/api/v1/incident-audit?incidentProcessInstanceId=p&incidentElementId=t&incidentActivation=01&incidentGeneration=1",
    "/api/v1/incident-audit?private=value",
  ]) {
    assert.throws(() => {
      if (path.startsWith("/api/v1/incidents/")) matchIncidentDetailPath(path);
      else matchIncidentAuditPath(path);
    });
  }
});

test("enforces bodyless reads and the 4096-byte action ceiling", () => {
  requireIncidentRequestBodyLength("GET", 0);
  requireIncidentRequestBodyLength("PUT", 1);
  requireIncidentRequestBodyLength("PUT", 4_096);
  assert.throws(
    () => requireIncidentRequestBodyLength("GET", 1),
    /must not contain a body/u,
  );
  assert.throws(
    () => requireIncidentRequestBodyLength("PUT", 0),
    /must contain one JSON body/u,
  );
  assert.throws(
    () => requireIncidentRequestBodyLength("PUT", 4_097),
    /exceeds 4096/u,
  );
});
