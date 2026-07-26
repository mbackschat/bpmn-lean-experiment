import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  readAndVerifyArtifactSets,
  verifyArtifactSet,
  verifyDefinitionArtifacts,
} from "./contract-artifacts.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

function cloneArtifactSet(artifactSet) {
  return {
    ...artifactSet,
    profile: structuredClone(artifactSet.profile),
    profileBytes: Buffer.from(artifactSet.profileBytes),
    scenario: structuredClone(artifactSet.scenario),
    scenarioBytes: Buffer.from(artifactSet.scenarioBytes),
    evidence: structuredClone(artifactSet.evidence),
    bpmnBytes: Buffer.from(artifactSet.bpmnBytes),
  };
}

function collectPropertyNames(value, names = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectPropertyNames(item, names);
    }
    return names;
  }
  if (value !== null && typeof value === "object") {
    for (const [name, item] of Object.entries(value)) {
      names.add(name);
      collectPropertyNames(item, names);
    }
  }
  return names;
}

function parallelDefinitionArtifacts() {
  const identity = {
    semanticProfile: "parallel-fork-join-draft",
    sourceId: "parallel-two-user-tasks.bpmn",
    sourceSha256:
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  };
  return {
    checkedProcess: {
      kind: "checkedProcess",
      identity,
      processId: "Process_ParallelUserTasks",
      nodes: [
        { kind: "noneEndEvent", id: "End_None" },
        {
          kind: "parallelGateway",
          id: "Gateway_Fork",
          direction: "diverging",
        },
        {
          kind: "parallelGateway",
          id: "Gateway_Join",
          direction: "converging",
        },
        { kind: "noneStartEvent", id: "Start_None" },
        { kind: "userTask", id: "UserTask_A", name: "A" },
        { kind: "userTask", id: "UserTask_B", name: "B" },
      ],
      sequenceFlows: [
        {
          id: "Flow_Fork_A",
          sourceId: "Gateway_Fork",
          targetId: "UserTask_A",
        },
        {
          id: "Flow_Fork_B",
          sourceId: "Gateway_Fork",
          targetId: "UserTask_B",
        },
        {
          id: "Flow_Join_End",
          sourceId: "Gateway_Join",
          targetId: "End_None",
        },
        {
          id: "Flow_Start_Fork",
          sourceId: "Start_None",
          targetId: "Gateway_Fork",
        },
        {
          id: "Flow_Task_A_Join",
          sourceId: "UserTask_A",
          targetId: "Gateway_Join",
        },
        {
          id: "Flow_Task_B_Join",
          sourceId: "UserTask_B",
          targetId: "Gateway_Join",
        },
      ],
    },
    semanticProcess: {
      kind: "semanticProcess",
      identity: {
        compiler: "bpmn-source-semantic-process",
        ...identity,
      },
      processId: "Process_ParallelUserTasks",
      controlPlaces: [
        controlPlace("Flow_Fork_A"),
        controlPlace("Flow_Fork_B"),
        controlPlace("Flow_Join_End"),
        controlPlace("Flow_Start_Fork"),
        controlPlace("Flow_Task_A_Join"),
        controlPlace("Flow_Task_B_Join"),
      ],
      operations: [
        operation("End_None", "terminate", {
          input: "place:Flow_Join_End",
        }),
        operation("Gateway_Fork", "duplicate", {
          input: "place:Flow_Start_Fork",
          outputs: ["place:Flow_Fork_A", "place:Flow_Fork_B"],
        }),
        operation("Gateway_Join", "synchronize", {
          inputs: ["place:Flow_Task_A_Join", "place:Flow_Task_B_Join"],
          output: "place:Flow_Join_End",
        }),
        operation("Start_None", "initiate", {
          output: "place:Flow_Start_Fork",
        }),
        operation("UserTask_A", "awaitUserTask", {
          input: "place:Flow_Fork_A",
          output: "place:Flow_Task_A_Join",
          task: { elementId: "UserTask_A", name: "A" },
        }),
        operation("UserTask_B", "awaitUserTask", {
          input: "place:Flow_Fork_B",
          output: "place:Flow_Task_B_Join",
          task: { elementId: "UserTask_B", name: "B" },
        }),
      ],
    },
  };
}

function controlPlace(flowId) {
  return {
    id: `place:${flowId}`,
    origin: { kind: "bpmnSequenceFlow", elementId: flowId },
  };
}

function operation(elementId, kind, fields) {
  return {
    id: `operation:${elementId}`,
    kind,
    origin: { kind: "bpmnElement", elementId },
    ...fields,
  };
}

test("uses structural document kinds without embedded schema counters", async () => {
  const artifactSets = await readAndVerifyArtifactSets(projectRoot);

  for (const artifactSet of artifactSets) {
    assert.equal(artifactSet.profile.kind, "semanticProfile");
    assert.equal(artifactSet.scenario.kind, "scenario");
    assert.equal(artifactSet.evidence.kind, "cibSevenScenarioEvidence");
    for (const document of [
      artifactSet.profile,
      artifactSet.scenario,
      artifactSet.evidence,
    ]) {
      const propertyNames = collectPropertyNames(document);
      assert.equal(propertyNames.has("schemaVersion"), false);
      assert.equal(propertyNames.has("traceSchemaVersion"), false);
    }
  }
});

test("keeps every target scenario answer-free and binds retained CIB evidence by content", async () => {
  const artifactSets = await readAndVerifyArtifactSets(projectRoot);

  assert.equal(artifactSets.length, 6);
  for (const artifactSet of artifactSets) {
    assert.equal("calibration" in artifactSet.scenario, false);
    assert.equal(
      artifactSet.evidence.scenario.id,
      artifactSet.scenario.id,
    );
    assert.match(artifactSet.evidence.scenario.sha256, /^[0-9a-f]{64}$/);
    assert.equal(artifactSet.evidence.profile.id, artifactSet.profile.id);
    assert.match(artifactSet.evidence.profile.sha256, /^[0-9a-f]{64}$/);
  }
});

test("rejects a semantic answer smuggled into target input", async () => {
  const [artifactSet] = await readAndVerifyArtifactSets(projectRoot);
  const mutated = cloneArtifactSet(artifactSet);
  mutated.scenario.calibration = {
    status: "calibrated",
    expectedOutcome: mutated.evidence.result.outcome,
    expectedTrace: mutated.evidence.result.trace,
  };

  assert.throws(
    () => verifyArtifactSet(mutated),
    /scenario schema validation failed/,
  );
});

test("rejects retained evidence after its neutral scenario changes", async () => {
  const [artifactSet] = await readAndVerifyArtifactSets(projectRoot);
  const mutated = cloneArtifactSet(artifactSet);
  mutated.scenario.stimuli[0].commandId = "changed-start-command";
  mutated.scenarioBytes = Buffer.from(
    `${JSON.stringify(mutated.scenario, null, 2)}\n`,
  );

  assert.throws(
    () => verifyArtifactSet(mutated),
    /evidence scenario digest does not match/,
  );
});

test("rejects a meaningful invalid task-projection mutation", async () => {
  const artifactSets = await readAndVerifyArtifactSets(projectRoot);
  const interaction = artifactSets.find(
    ({ scenario }) =>
      scenario.id === "user-task-discovery-completion",
  );
  assert.notEqual(interaction, undefined);
  const mutated = cloneArtifactSet(interaction);
  mutated.evidence.result.trace[2].openUserTasks[0].id.activation = 0;

  assert.throws(
    () => verifyArtifactSet(mutated),
    /evidence schema validation failed/,
  );
});

test("derives canonical parallel tasks independently of producer query order", async () => {
  const artifactSets = await readAndVerifyArtifactSets(projectRoot);
  const parallel = artifactSets.find(
    ({ scenario }) =>
      scenario.id === "parallel-fork-join-a-then-b",
  );
  assert.notEqual(parallel, undefined);
  const reordered = cloneArtifactSet(parallel);
  reordered.evidence.producerObservations.taskQueries[0].tasks.reverse();

  assert.doesNotThrow(() => verifyArtifactSet(reordered));

  const dropped = cloneArtifactSet(parallel);
  dropped.evidence.producerObservations.taskQueries[0].tasks.pop();
  assert.throws(
    () => verifyArtifactSet(dropped),
    /producer task query projection does not match canonical/,
  );
});

test("detects a missing live sibling after stale parallel completion", async () => {
  const artifactSets = await readAndVerifyArtifactSets(projectRoot);
  const stale = artifactSets.find(
    ({ scenario }) =>
      scenario.id === "parallel-fork-join-stale-a-while-b-active",
  );
  assert.notEqual(stale, undefined);
  const mutated = cloneArtifactSet(stale);
  const afterStale = mutated.evidence.producerObservations.taskQueries.find(
    ({ afterCommandId }) =>
      afterCommandId === "complete-stale-user-task-a",
  );
  assert.notEqual(afterStale, undefined);
  afterStale.tasks.pop();

  assert.throws(
    () => verifyArtifactSet(mutated),
    /producer task query projection does not match canonical/,
  );
});

test("requires every semantic profile to identify its reviewed CIB-BPMN relationships", async () => {
  const artifactSets = await readAndVerifyArtifactSets(projectRoot);

  for (const artifactSet of artifactSets) {
    assert.ok(artifactSet.profile.bpmn.relationships.length > 0);
    for (const relationship of artifactSet.profile.bpmn.relationships) {
      assert.match(relationship, /^CIB-(AGR|OP|INT|EXT|CFG|LIM|DEV)-[0-9]{4}$/);
    }
  }

  const mutated = cloneArtifactSet(artifactSets[0]);
  delete mutated.profile.bpmn.relationships;

  assert.throws(
    () => verifyArtifactSet(mutated),
    /profile schema validation failed/,
  );

  const unknownRelationship = cloneArtifactSet(artifactSets[0]);
  unknownRelationship.profile.bpmn.relationships[0] = "CIB-AGR-9999";

  assert.throws(
    () => verifyArtifactSet(unknownRelationship),
    /profile references unknown CIB-BPMN relationship/,
  );
});

test("accepts the canonical checked-process and Semantic Process contract shapes", async () => {
  const artifacts = parallelDefinitionArtifacts();

  assert.equal(
    await verifyDefinitionArtifacts(projectRoot, artifacts),
    artifacts,
  );
});

test("rejects checked and Semantic Process references outside their definition domains", async () => {
  const checkedMutation = parallelDefinitionArtifacts();
  checkedMutation.checkedProcess.sequenceFlows[0].targetId = "Missing_Task";

  await assert.rejects(
    verifyDefinitionArtifacts(projectRoot, checkedMutation),
    /checked process flow Flow_Fork_A references unknown target node Missing_Task/,
  );

  const programMutation = parallelDefinitionArtifacts();
  programMutation.semanticProcess.operations[1].outputs[0] =
    "place:Flow_Fork_A0";

  await assert.rejects(
    verifyDefinitionArtifacts(projectRoot, programMutation),
    /operation operation:Gateway_Fork references unknown control place place:Flow_Fork_A0/,
  );
});

test("rejects duplicate and synchronize operations below their semantic arity", async () => {
  for (const operationId of [
    "operation:Gateway_Fork",
    "operation:Gateway_Join",
  ]) {
    const artifacts = parallelDefinitionArtifacts();
    const operation = artifacts.semanticProcess.operations.find(
      ({ id }) => id === operationId,
    );
    assert.notEqual(operation, undefined);
    if (operation.kind === "duplicate") {
      operation.outputs = [operation.outputs[0]];
    } else {
      operation.inputs = [operation.inputs[0]];
    }

    await assert.rejects(
      verifyDefinitionArtifacts(projectRoot, artifacts),
      /semantic process schema validation failed/,
    );
  }
});

test("rejects source identity drift between checked and Semantic Process artifacts", async () => {
  const artifacts = parallelDefinitionArtifacts();
  artifacts.semanticProcess.identity.sourceSha256 =
    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

  await assert.rejects(
    verifyDefinitionArtifacts(projectRoot, artifacts),
    /checked process and semantic process identities differ/,
  );
});

test("rejects non-canonical definition and unordered-reference order", async () => {
  const definitionOrderMutation = parallelDefinitionArtifacts();
  definitionOrderMutation.semanticProcess.operations.reverse();

  await assert.rejects(
    verifyDefinitionArtifacts(projectRoot, definitionOrderMutation),
    /semantic process operations must be sorted by id/,
  );

  const referenceOrderMutation = parallelDefinitionArtifacts();
  referenceOrderMutation.semanticProcess.operations[1].outputs.reverse();

  await assert.rejects(
    verifyDefinitionArtifacts(projectRoot, referenceOrderMutation),
    /operation operation:Gateway_Fork outputs must be sorted/,
  );
});
