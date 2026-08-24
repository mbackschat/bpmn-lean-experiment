import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";

import {
  BASELINE_SCENARIO_OBSERVATIONS,
  ObservationRequestKind,
  ScenarioDocumentKind,
  SEQUENTIAL_MULTI_INSTANCE_SCENARIO_OBSERVATIONS,
  supportsSemanticProcessScenario,
} from "@bpmn-lean/semantic-core";
import type {
  Scenario,
} from "@bpmn-lean/semantic-core";

import {
  eventRaceProgram,
  eventRaceStart,
} from "./event-based-gateway-fixture.ts";
import {
  reviewProgram,
  start,
} from "./sequential-multi-instance-fixture.ts";

const oldScenario = {
  kind: ScenarioDocumentKind.Scenario,
  id: "old-profile-observation-contract",
  profile: eventRaceProgram.identity.semanticProfile,
  bpmn: {
    id: eventRaceProgram.identity.sourceId,
    relativePath: "test-only/event-race.bpmn",
    sha256: eventRaceProgram.identity.sourceSha256,
    sourceOverlay: null,
  },
  stimuli: [eventRaceStart],
  observations: BASELINE_SCENARIO_OBSERVATIONS,
  provenance: {
    normativeRefs: ["BPMN 2.0.2 test fixture"],
    cibRevision: "0000000000000000000000000000000000000000",
    cibRefs: ["test-only/event-race"],
  },
} as const satisfies Scenario;

const sequentialMultiInstanceScenario = {
  kind: ScenarioDocumentKind.Scenario,
  id: "sequential-multi-instance-observation-contract",
  profile: reviewProgram.identity.semanticProfile,
  bpmn: {
    id: reviewProgram.identity.sourceId,
    relativePath: "test-only/sequential-multi-instance.bpmn",
    sha256: reviewProgram.identity.sourceSha256,
    sourceOverlay: null,
  },
  stimuli: [start],
  observations: SEQUENTIAL_MULTI_INSTANCE_SCENARIO_OBSERVATIONS,
  provenance: {
    normativeRefs: ["BPMN 2.0.2 Clause 13.3.7"],
    cibRevision: "0000000000000000000000000000000000000000",
    cibRefs: ["test-only/sequential-multi-instance"],
  },
} as const satisfies Scenario;

test("selects the exact observation catalog from the scenario profile", () => {
  assert.equal(
    ObservationRequestKind.OpenMultiInstances,
    "openMultiInstances",
  );
  assert.equal(
    supportsSemanticProcessScenario(
      sequentialMultiInstanceScenario,
      reviewProgram,
    ),
    true,
  );
  assert.equal(
    supportsSemanticProcessScenario(
      {
        ...sequentialMultiInstanceScenario,
        observations: BASELINE_SCENARIO_OBSERVATIONS,
      },
      reviewProgram,
    ),
    false,
  );
  assert.equal(
    supportsSemanticProcessScenario(oldScenario, eventRaceProgram),
    true,
  );
  assert.equal(
    supportsSemanticProcessScenario(
      {
        ...oldScenario,
        observations: SEQUENTIAL_MULTI_INSTANCE_SCENARIO_OBSERVATIONS,
      },
      eventRaceProgram,
    ),
    false,
  );
});

test("the retained profile and scenarios request the Multi-Instance projection", async () => {
  for (const relativePath of [
    "../../../profiles/bpmn-2.0.2-sequential-multi-instance-user-task-draft/profile.json",
    "../../../scenarios/sequential-multi-instance/natural.scenario.json",
    "../../../scenarios/sequential-multi-instance/interrupted.scenario.json",
  ]) {
    const artifact = JSON.parse(
      await readFile(new URL(relativePath, import.meta.url), "utf8"),
    ) as { observations?: unknown };
    assert.deepEqual(
      artifact.observations,
      SEQUENTIAL_MULTI_INSTANCE_SCENARIO_OBSERVATIONS,
      relativePath,
    );
  }
});

test("the scenario schema binds observation requests to the selected profile", async () => {
  const validate = await scenarioValidator();
  assert.equal(
    validate(sequentialMultiInstanceScenario),
    true,
    JSON.stringify(validate.errors),
  );
  assert.equal(
    validate({
      ...sequentialMultiInstanceScenario,
      observations: BASELINE_SCENARIO_OBSERVATIONS,
    }),
    false,
  );
  assert.equal(validate(oldScenario), true);
  assert.equal(
    validate({
      ...oldScenario,
      observations: SEQUENTIAL_MULTI_INSTANCE_SCENARIO_OBSERVATIONS,
    }),
    false,
  );
});

test("the state schema recursively closes the Multi-Instance projection", async () => {
  const validate = await stateObservationValidator();
  const observation = validStateObservation();
  assert.equal(validate(observation), true, JSON.stringify(validate.errors));

  const fractionalLoopCounter = structuredClone(observation);
  const [fractionalController] = fractionalLoopCounter.openMultiInstances;
  assert.ok(fractionalController !== undefined);
  const [fractionalIteration] = fractionalController.activeIterations;
  assert.ok(fractionalIteration !== undefined);
  fractionalIteration.loopCounter = 0.5;
  assert.equal(validate(fractionalLoopCounter), false);

  const surplusNestedField = structuredClone(observation) as Record<
    string,
    unknown
  >;
  const activeIteration = (
    surplusNestedField.openMultiInstances as Array<{
      activeIterations: Array<Record<string, unknown>>;
    }>
  )[0]!.activeIterations[0]!;
  activeIteration.privateSnapshot = ["must-not-publish"];
  assert.equal(validate(surplusNestedField), false);
});

async function scenarioValidator() {
  const schema = await scenarioSchema();
  return new Ajv2020({ strict: true, strictTuples: false }).compile(schema);
}

async function stateObservationValidator() {
  const schema = await scenarioSchema() as {
    $defs: Record<string, unknown>;
  };
  return new Ajv2020({ strict: true, strictTuples: false }).compile({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: schema.$defs,
    $ref: "#/$defs/stateObservation",
  });
}

async function scenarioSchema(): Promise<Record<string, unknown>> {
  return JSON.parse(
    await readFile(
      new URL("../../../contracts/schemas/scenario.schema.json", import.meta.url),
      "utf8",
    ),
  ) as Record<string, unknown>;
}

function validStateObservation() {
  return {
    kind: "state",
    instanceId: "SequentialMultiInstance_1",
    status: "running",
    activeWaits: [{ elementId: "UserTask_Review", kind: "userTask", multiplicity: 1 }],
    openUserTasks: [],
    openMessageSubscriptions: [],
    openTimers: [],
    openEffects: [],
    openIncidents: [],
    openMultiInstances: [{
      id: {
        processInstanceId: "SequentialMultiInstance_1",
        activityElementId: "UserTask_Review",
        activation: 1,
      },
      mode: "sequential",
      plannedInstanceCount: 3,
      pendingItemCount: 2,
      numberOfInstances: 1,
      numberOfActiveInstances: 1,
      numberOfCompletedInstances: 0,
      numberOfTerminatedInstances: 0,
      activeIterations: [{
        loopCounter: 0,
        taskId: {
          processInstanceId: "SequentialMultiInstance_1",
          elementId: "UserTask_Review",
          activation: 1,
        },
        taskInput: {
          name: "DataInput_CurrentItem",
          value: { kind: "string", value: "contract" },
        },
        completionBindingName: "DataOutput_CurrentResult",
      }],
    }],
    variables: [],
    enabledInteractions: [],
    logicalTimeMs: 0,
  };
}
