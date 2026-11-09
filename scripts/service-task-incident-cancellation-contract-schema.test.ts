import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

type MutableEvidence = {
  producerObservations: {
    historicProcessStates: Array<Record<string, unknown>>;
    effectExecutions: Array<Record<string, unknown>>;
  };
};

test("keeps the retained cancellation evidence's historic states and effect schedule closed", async () => {
  const [evidenceSchema, resultSchema, scenarioSchema, evidence] = await Promise.all([
    readJson("contracts/schemas/cibseven-evidence.schema.json"),
    readJson("contracts/schemas/canonical-result.schema.json"),
    readJson("contracts/schemas/scenario.schema.json"),
    readJson("scenarios/service-task-incident-cancellation/cibseven-evidence.json"),
  ]);
  const ajv = new Ajv2020({ strict: true, strictTuples: false });
  ajv.addSchema(resultSchema);
  ajv.addSchema(scenarioSchema);
  const validate = ajv.compile(evidenceSchema);
  assert.equal(validate(evidence), true, JSON.stringify(validate.errors));

  const states = (evidence as unknown as MutableEvidence).producerObservations.historicProcessStates;
  assert.ok(states.some(({ state }) => state === "EXTERNALLY_TERMINATED"), "the retained run ends externally terminated");

  const mutate = (change: (value: MutableEvidence) => void): boolean => {
    const changed = structuredClone(evidence) as unknown as MutableEvidence;
    change(changed);
    return validate(changed);
  };
  assert.equal(mutate((value) => {
    value.producerObservations.historicProcessStates[0]!.state = "TERMINATED";
  }), false);
  assert.equal(mutate((value) => {
    value.producerObservations.historicProcessStates[0]!.hostCause = "private";
  }), false);
  assert.equal(mutate((value) => {
    value.producerObservations.effectExecutions[0]!.schedule = "incidentReportCancel-substituted";
  }), false);
});

async function readJson(relativePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(
    await readFile(`${projectRoot}/${relativePath}`, "utf8"),
  ) as Record<string, unknown>;
}
