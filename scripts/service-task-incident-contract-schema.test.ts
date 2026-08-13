/** Locks the literal-generation incident wire before CIB and Temporal adapters consume it. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

const effectId = {
  processInstanceId: "Instance_1",
  elementId: "ServiceTask_Record",
  activation: 1,
} as const;

const incidentId = { effectId, generation: 1 } as const;

test("admits only literal-generation report and retry stimuli", async () => {
  const schema = await readScenarioSchema();
  const report = compileDefinition(schema, "reportEffectFailure");
  const retry = compileDefinition(schema, "retryIncident");
  const exactReport = {
    kind: "reportEffectFailure",
    commandId: "report-effect-failure",
    effectId,
    generation: 1,
  } as const;
  const exactRetry = {
    kind: "retryIncident",
    commandId: "retry-incident",
    incidentId,
  } as const;

  assert.equal(report(exactReport), true, JSON.stringify(report.errors));
  assert.equal(retry(exactRetry), true, JSON.stringify(retry.errors));
  assert.equal(report({ ...exactReport, generation: 2 }), false);
  assert.equal(retry({ ...exactRetry, incidentId: { ...incidentId, generation: 2 } }), false);
  assert.equal(report({ ...exactReport, privateCause: "forbidden" }), false);
  assert.equal(retry({ ...exactRetry, incidentId: { ...incidentId, jobId: "private" } }), false);
});

test("requires the exact public incident and state field shapes", async () => {
  const schema = await readScenarioSchema();
  const incident = compileDefinition(schema, "openEffectIncident");
  const state = compileDefinition(schema, "stateObservation");
  const openIncident = {
    kind: "effectExecutionFailed",
    id: incidentId,
    effect: {
      id: effectId,
      descriptor: {
        protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
        operation: "urn:bpmn-lean:effect-operation:probe-v1",
      },
      arguments: [],
    },
  } as const;
  const exactState = {
    kind: "state",
    instanceId: "Instance_1",
    status: "running",
    activeWaits: [{ elementId: effectId.elementId, kind: "incident", multiplicity: 1 }],
    openUserTasks: [],
    openMessageSubscriptions: [],
    openTimers: [],
    openEffects: [],
    openIncidents: [openIncident],
    variables: [],
    enabledInteractions: [{ kind: "retryIncident", incidentId }],
    logicalTimeMs: 0,
  } as const;

  assert.equal(incident(openIncident), true, JSON.stringify(incident.errors));
  assert.equal(state(exactState), true, JSON.stringify(state.errors));
  const { openIncidents: _openIncidents, ...withoutIncidents } = exactState;
  assert.equal(state(withoutIncidents), false);
  assert.equal(state({ ...exactState, openIncidents: [{ ...openIncident, hostCause: "private" }] }), false);
});

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

async function readScenarioSchema(): Promise<Record<string, unknown>> {
  return readSchema("scenario.schema.json");
}

async function readSchema(name: string): Promise<Record<string, unknown>> {
  return JSON.parse(
    await readFile(`${projectRoot}/contracts/schemas/${name}`, "utf8"),
  ) as Record<string, unknown>;
}

function compileDefinition(schema: Record<string, unknown>, definition: string) {
  return new Ajv2020({ strict: true, strictTuples: false }).compile({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: schema.$defs,
    $ref: `#/$defs/${definition}`,
  });
}

function compileProperty(schema: Record<string, unknown>, property: string) {
  const properties = schema.properties as Record<string, unknown> | undefined;
  const propertySchema = properties?.[property];
  assert.notEqual(propertySchema, undefined, `missing property ${property}`);
  return new Ajv2020({ strict: true }).compile(propertySchema as Record<string, unknown>);
}
