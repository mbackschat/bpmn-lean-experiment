import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import type {
  StateObservation,
} from "../packages/semantic-core/src/index.ts";
import type {
  CibSevenEvidence,
} from "./contract-cib-evidence.ts";
import {
  verifyProducerProjection,
} from "./contract-cib-evidence-projection.ts";

import type {
  EffectJobSnapshot,
  HistoricProcessStateSnapshot,
  IncidentJobSnapshot,
  StateQuerySnapshot,
} from "./contract-cib-evidence.ts";
import {
  projectCibIncidentCancellationState,
  projectCibIncidentCancellationStatus,
  verifyCibIncidentCancellationExecution,
  verifyCibIncidentCancellationHistory,
} from "./contract-cib-incident-cancellation-projection.ts";
import {
  serviceTaskIncidentCancellationProfileId,
} from "./service-task-incident-cancellation-profile-consistency.ts";

const reportCommandId =
  "report-effect-failure-sha256:b6b5077e469b9421ed4a598e4c08fae7c3ce3e31c941fae9733b4c7206a2b345";
const projectRoot = fileURLToPath(new URL("../", import.meta.url));

const stateQueries = [
  stateQuery("start-process", 1),
  stateQuery(reportCommandId, 1),
  stateQuery("cancel-incident-process", 0),
] as const satisfies ReadonlyArray<StateQuerySnapshot>;

const historicStates = [
  { afterCommandId: "start-process", state: "ACTIVE" },
  { afterCommandId: reportCommandId, state: "ACTIVE" },
  {
    afterCommandId: "cancel-incident-process",
    state: "EXTERNALLY_TERMINATED",
  },
] as const satisfies ReadonlyArray<HistoricProcessStateSnapshot>;

const effectJobs = {
  afterCommandId: reportCommandId,
  jobs: [{
    elementId: "ServiceTask_Record",
    activation: 1,
    protocol: "urn:bpmn-lean:effect:probe-v1",
    handler: "bpmnLeanEffectHandler",
    retries: 0,
    executable: false,
    dueDatePresent: false,
  }],
} as const satisfies EffectJobSnapshot;

const incidentJobs = {
  afterCommandId: reportCommandId,
  createIncidentOnFailedJobEnabled: true,
  jobs: [{
    publicJobId: "private-job",
    retries: 0,
    executable: false,
    dueDatePresent: false,
    processInstanceId: "private-root",
    elementId: "ServiceTask_Record",
    incident: {
      publicIncidentId: "private-incident",
      type: "failedJob",
      configurationJobId: "private-job",
      processInstanceId: "private-root",
      elementId: "ServiceTask_Record",
      causeIncidentId: "private-incident",
      rootCauseIncidentId: "private-incident",
    },
  }],
} as const satisfies IncidentJobSnapshot;

test("requires positive aligned external-termination history and preserved data", () => {
  assert.deepEqual(
    verifyCibIncidentCancellationHistory(
      serviceTaskIncidentCancellationProfileId,
      stateQueries,
      historicStates,
    ),
    historicStates,
  );
  assert.equal(
    projectCibIncidentCancellationStatus(
      "completed" as StateObservation["status"],
      historicStates[2],
    ),
    "cancelled",
  );

  const completed = structuredClone(historicStates) as unknown as Array<{
    afterCommandId: string;
    state: HistoricProcessStateSnapshot["state"];
  }>;
  completed[2]!.state = "COMPLETED";
  assert.throws(
    () => verifyCibIncidentCancellationHistory(
      serviceTaskIncidentCancellationProfileId,
      stateQueries,
      completed,
    ),
    /positive historic Process-state sequence/u,
  );
  assert.throws(
    () => projectCibIncidentCancellationStatus(
      "completed" as StateObservation["status"],
      completed[2],
    ),
    /cannot establish Process cancellation/u,
  );

  const wrongCommand = structuredClone(historicStates) as unknown as Array<{
    afterCommandId: string;
    state: HistoricProcessStateSnapshot["state"];
  }>;
  wrongCommand[2]!.afterCommandId = "wrong-command";
  assert.throws(
    () => verifyCibIncidentCancellationHistory(
      serviceTaskIncidentCancellationProfileId,
      stateQueries,
      wrongCommand,
    ),
    /positive historic Process-state sequence/u,
  );

  const missingVariable = structuredClone(stateQueries) as unknown as Array<{
    afterCommandId: string;
    processInstanceCount: number;
    engineClockTimeMs: number;
    variables: Array<{ name: string; value: string }>;
  }>;
  missingVariable[2]!.variables = [];
  assert.throws(
    () => verifyCibIncidentCancellationHistory(
      serviceTaskIncidentCancellationProfileId,
      missingVariable,
      historicStates,
    ),
    /positively preserve/u,
  );
  assert.throws(
    () => verifyCibIncidentCancellationHistory(
      "cibseven-2.2.0-service-task-incident-draft",
      stateQueries,
      historicStates,
    ),
    /old profiles must omit/u,
  );
});

test("projects Retry before Cancel without exporting raw host identity", () => {
  const projection = projectCibIncidentCancellationState(
    serviceTaskIncidentCancellationProfileId,
    "Instance_1",
    effectJobs,
    incidentJobs,
  );
  assert.deepEqual(
    projection.enabledInteractions.map(({ kind }) => kind),
    ["retryIncident", "cancelIncidentProcess"],
  );
  assert.equal(JSON.stringify(projection).includes("private-"), false);
  assert.deepEqual(projection.enabledInteractions[1], {
    kind: "cancelIncidentProcess",
    processInstanceId: "Instance_1",
    incidentId: {
      effectId: {
        processInstanceId: "Instance_1",
        elementId: "ServiceTask_Record",
        activation: 1,
      },
      generation: 1,
    },
  });
});

test("requires the exact report-before-cancel producer schedule", () => {
  const execution = {
    schedule: "incidentReportCancel",
    invocations: 3,
    mutations: 1,
    initialRetries: 3,
    retriesAfterFirstFailure: 2,
  } as const;
  assert.equal(
    verifyCibIncidentCancellationExecution(
      serviceTaskIncidentCancellationProfileId,
      [execution],
    ),
    true,
  );
  assert.throws(
    () => verifyCibIncidentCancellationExecution(
      serviceTaskIncidentCancellationProfileId,
      [{ ...execution, schedule: "incidentReportRetrySuccess" }],
    ),
    /bind report and cancellation/u,
  );
});

test("rejects swapped publication and completed-for-cancelled evidence", async () => {
  const evidence = JSON.parse(await readFile(
    `${projectRoot}/scenarios/service-task-incident-cancellation/cibseven-evidence.json`,
    "utf8",
  )) as CibSevenEvidence;
  assert.doesNotThrow(() => verifyProducerProjection(evidence, "Instance_1"));

  const swapped = structuredClone(evidence) as MutableEvidence;
  const incidentState = swapped.result.trace[4];
  assert.ok(incidentState?.kind === "state");
  incidentState.enabledInteractions.reverse();
  assert.throws(
    () => verifyProducerProjection(
      swapped as unknown as CibSevenEvidence,
      "Instance_1",
    ),
    /canonical enabledInteractions/u,
  );

  const completed = structuredClone(evidence) as MutableEvidence;
  const finalState = completed.result.trace[6];
  assert.ok(finalState?.kind === "state");
  finalState.status = "completed" as StateObservation["status"];
  assert.throws(
    () => verifyProducerProjection(
      completed as unknown as CibSevenEvidence,
      "Instance_1",
    ),
    /canonical status/u,
  );
});

type DeepMutable<Value> = Value extends ReadonlyArray<infer Item>
  ? Array<DeepMutable<Item>>
  : Value extends object
    ? { -readonly [Key in keyof Value]: DeepMutable<Value[Key]> }
    : Value;

type MutableEvidence = DeepMutable<CibSevenEvidence>;

function stateQuery(
  afterCommandId: string,
  processInstanceCount: number,
): StateQuerySnapshot {
  return {
    afterCommandId,
    processInstanceCount,
    engineClockTimeMs: 0,
    variables: [{ name: "preserved", value: "before-cancel" }],
  };
}
