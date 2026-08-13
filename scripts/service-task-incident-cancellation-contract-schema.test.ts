import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const cancellationProfile =
  "cibseven-2.2.0-service-task-incident-cancellation-draft";

test("gates historic Process states to the cancellation profile only", async () => {
  const [evidenceSchema, resultSchema, scenarioSchema, oldEvidence] = await Promise.all([
    readJson("contracts/schemas/cibseven-evidence.schema.json"),
    readJson("contracts/schemas/canonical-result.schema.json"),
    readJson("contracts/schemas/scenario.schema.json"),
    readJson("scenarios/service-task-incident/cibseven-evidence.json"),
  ]);
  const ajv = new Ajv2020({ strict: true, strictTuples: false });
  ajv.addSchema(resultSchema);
  ajv.addSchema(scenarioSchema);
  const validate = ajv.compile(evidenceSchema);
  assert.equal(validate(oldEvidence), true, JSON.stringify(validate.errors));

  const historicProcessStates = [
    { afterCommandId: "start-process", state: "ACTIVE" },
    {
      afterCommandId:
        "report-effect-failure-sha256:b6b5077e469b9421ed4a598e4c08fae7c3ce3e31c941fae9733b4c7206a2b345",
      state: "ACTIVE",
    },
    {
      afterCommandId: "cancel-incident-process",
      state: "EXTERNALLY_TERMINATED",
    },
  ];
  const oldWithHistory = structuredClone(oldEvidence) as MutableEvidence;
  oldWithHistory.producerObservations.historicProcessStates =
    historicProcessStates;
  assert.equal(validate(oldWithHistory), false);

  const successorWithoutHistory = structuredClone(oldEvidence) as MutableEvidence;
  successorWithoutHistory.profile.id = cancellationProfile;
  assert.equal(validate(successorWithoutHistory), false);

  successorWithoutHistory.producerObservations.historicProcessStates =
    historicProcessStates;
  assert.equal(
    validate(successorWithoutHistory),
    true,
    JSON.stringify(validate.errors),
  );
  const wrongSchedule = structuredClone(successorWithoutHistory) as MutableEvidence;
  wrongSchedule.producerObservations.effectExecutions![0]!.schedule =
    "incidentReportCancel-substituted";
  assert.equal(validate(wrongSchedule), false);
});

type MutableEvidence = {
  profile: { id: string };
  producerObservations: {
    historicProcessStates?: Array<{
      afterCommandId: string;
      state: string;
    }>;
    effectExecutions?: Array<{ schedule: string }>;
  };
};

async function readJson(relativePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(
    await readFile(`${projectRoot}/${relativePath}`, "utf8"),
  ) as Record<string, unknown>;
}
