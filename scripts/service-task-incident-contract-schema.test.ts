/** Locks the literal-generation incident wire before CIB and Temporal adapters consume it. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

const scenarioId = "https://bpmn-lean.local/schemas/scenario.schema.json";
const resultId = "https://bpmn-lean.local/schemas/canonical-result.schema.json";

const occurrence = {
  processInstanceId: "Instance_1",
  elementId: "ServiceTask_Record",
  activation: 1,
} as const;

test("admits only the literal-free incident report and retry stimuli", async () => {
  const report = await compileDefinition(scenarioId, "effectResult");
  const command = await compileDefinition(scenarioId, "command");
  const exactReport = {
    kind: "effectResult",
    commandId: "report-effect-failure",
    occurrence,
    outcome: { kind: "technicalFailure" },
  } as const;
  const exactRetry = {
    kind: "command",
    commandId: "retry-incident",
    occurrence,
    action: { kind: "retryIncident", generation: 1 },
  } as const;

  assert.equal(report(exactReport), true, JSON.stringify(report.errors));
  assert.equal(command(exactRetry), true, JSON.stringify(command.errors));
  // An incident command names the generation it resolves so the kernel rejects a stale one in the same step; an
  // effect report never names one, because the failure it reports is what opens the next generation.
  assert.equal(report({ ...exactReport, generation: 1 }), false);
  assert.equal(report({ ...exactReport, outcome: { kind: "technicalFailure", privateCause: "forbidden" } }), false);
  assert.equal(command({ ...exactRetry, action: { kind: "retryIncident" } }), false);
  assert.equal(command({ ...exactRetry, action: { kind: "retryIncident", generation: 0 } }), false);
  assert.equal(command({ ...exactRetry, occurrence: { ...occurrence, jobId: "private" } }), false);
});

test("admits only the exact incident-root cancellation command and its open-wait flag", async () => {
  const command = await compileDefinition(scenarioId, "command");
  const incident = await compileDefinition(resultId, "incidentDetail");
  const exactCancel = {
    kind: "command",
    commandId: "cancel-incident-process",
    occurrence,
    action: { kind: "cancelIncidentProcess", generation: 1 },
  } as const;

  assert.equal(command(exactCancel), true, JSON.stringify(command.errors));
  assert.equal(command({ ...exactCancel, action: { kind: "cancelIncidentProcess" } }), false);
  assert.equal(command({ ...exactCancel, processInstanceId: "caller-selected" }), false);
  for (const extra of [{ owner: "caller-selected" }, { reason: "private" }, { force: true }]) {
    assert.equal(command({ ...exactCancel, action: { kind: "cancelIncidentProcess", generation: 1, ...extra } }), false);
  }
  assert.equal(command({ ...exactCancel, action: { kind: "cancelAnyProcess" } }), false);

  const detail = incidentDetail(false);
  assert.equal(incident(detail), true, JSON.stringify(incident.errors));
  assert.equal(incident(incidentDetail(true)), true, JSON.stringify(incident.errors));
  assert.equal(incident({ ...detail, cancellable: "true" }), false);
  assert.equal(incident({ ...detail, scopeOccurrenceId: "nested" }), false);
});

test("requires the exact public incident and state field shapes", async () => {
  const wait = await compileDefinition(resultId, "openWait");
  const state = await compileDefinition(resultId, "state");
  const openIncident = {
    id: occurrence,
    definition: null,
    input: "command",
    detail: incidentDetail(false),
  } as const;
  const exactState = {
    kind: "state",
    instanceId: "Instance_1",
    status: "running",
    logicalTimeMs: 0,
    variables: [],
    openWaits: [openIncident],
  } as const;

  assert.equal(wait(openIncident), true, JSON.stringify(wait.errors));
  assert.equal(state(exactState), true, JSON.stringify(state.errors));
  const { openWaits: _openWaits, ...withoutWaits } = exactState;
  assert.equal(state(withoutWaits), false);
  assert.equal(
    state({ ...exactState, openWaits: [{ ...openIncident, detail: { ...incidentDetail(false), hostCause: "private" } }] }),
    false,
  );
  // An incident is closed by a command, so another input channel names a different wait.
  assert.equal(wait({ ...openIncident, input: "effectResult" }), false);
  assert.equal(wait({ ...openIncident, detail: { ...incidentDetail(false), generation: 0 } }), false);
  assert.equal(state({ ...exactState, status: "cancelled" }), true);
  assert.equal(state({ ...exactState, openWaits: [{ ...openIncident, detail: incidentDetail(true) }] }), true);
});

function incidentDetail(cancellable: boolean) {
  return {
    kind: "incident",
    effect: {
      protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
      operation: "urn:bpmn-lean:effect-operation:probe-v1",
      arguments: [],
      failures: 1,
      send: null,
    },
    generation: 1,
    cancellable,
  } as const;
}

test("permits only a Boolean incident-creation environment setting", async () => {
  const schema = await readSchema("semantic-profile.schema.json");
  const environment = compileProperty(schema, "environment");
  const base = {
    java: "21",
    database: "H2 2.3.232",
    automaticJobExecutor: "disabled",
    clock: "explicit",
    historyLevel: "audit",
    defaultHistoryTimeToLive: "P180D",
    enforceHistoryTimeToLive: true,
  } as const;

  assert.equal(environment(base), true, JSON.stringify(environment.errors));
  assert.equal(environment({ ...base, createIncidentOnFailedJobEnabled: true }), true);
  assert.equal(environment({ ...base, createIncidentOnFailedJobEnabled: "true" }), false);
});

async function readSchema(name: string): Promise<Record<string, unknown>> {
  return JSON.parse(
    await readFile(`${projectRoot}/contracts/schemas/${name}`, "utf8"),
  ) as Record<string, unknown>;
}

/** Both wire schemas are registered together, because a result definition references the scenario's value arms. */
async function compileDefinition(schemaId: string, definition: string) {
  const ajv = new Ajv2020({ strict: true, strictTuples: false });
  ajv.addSchema(await readSchema("scenario.schema.json") as never);
  ajv.addSchema(await readSchema("canonical-result.schema.json") as never);
  const validate = ajv.getSchema(`${schemaId}#/$defs/${definition}`);
  assert.ok(validate !== undefined, `${schemaId} has no definition ${definition}`);
  return validate;
}

function compileProperty(schema: Record<string, unknown>, property: string) {
  const properties = schema.properties as Record<string, unknown> | undefined;
  const propertySchema = properties?.[property];
  assert.notEqual(propertySchema, undefined, `missing property ${property}`);
  return new Ajv2020({ strict: true }).compile(propertySchema as Record<string, unknown>);
}
