import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

test("configures technical failure and the exact published cancellation action", async () => {
  const config = JSON.parse(await readFile(
    `${projectRoot}/examples/temporal-mvp/service-task-incident-cancellation.json`,
    "utf8",
  )) as Record<string, unknown>;
  assert.deepEqual(config, {
    kind: "runnableTemporalMvp",
    bpmn: {
      file: "../../scenarios/service-task-effect/process.bpmn",
      sourceId: "service-task-effect-phase-zero-probe",
      semanticProfile:
        "cibseven-2.2.0-service-task-incident-cancellation-draft",
      limits: { maxBytes: 1_048_576, parserDeadlineMs: 1_000 },
    },
    process: {
      instanceId: "MvpExample_service_task_incident_cancellation_1",
      initialVariables: [{
        name: "preserved",
        value: { kind: "string", value: "before-cancel" },
      }],
    },
    temporal: {
      address: "localhost:7233",
      namespace: "default",
      taskQueue: "bpmn-mvp",
      identity: "bpmn-mvp-command",
    },
    interactions: [{ kind: "cancelIncidentProcess", delayMs: 250 }],
    effectHandlers: [{
      protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
      operation: "urn:bpmn-lean:effect-operation:probe-v1",
      result: { kind: "technicalFailure" },
    }],
  });
  assert.equal(JSON.stringify(config).includes("incidentId"), false);
  assert.equal(JSON.stringify(config).includes("processInstanceId"), false);
});
