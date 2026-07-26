import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  compareCanonicalStrings,
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

function bindScenarioBytes(artifactSet, scenarioBytes) {
  artifactSet.scenarioBytes = Buffer.from(scenarioBytes);
  artifactSet.evidence.scenario.sha256 = createHash("sha256")
    .update(artifactSet.scenarioBytes)
    .digest("hex");
}

function collectIntegerSchemas(value, locations = [], path = "$") {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectIntegerSchemas(item, locations, `${path}[${index}]`));
    return locations;
  }
  if (value !== null && typeof value === "object") {
    if (value.type === "integer") {
      locations.push({ path, schema: value });
    }
    for (const [name, item] of Object.entries(value)) {
      collectIntegerSchemas(item, locations, `${path}.${name}`);
    }
  }
  return locations;
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

  assert.equal(artifactSets.length, 7);
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

test("pins every JSON integer to the JavaScript-safe domain", async () => {
  for (const schemaName of [
    "scenario.schema.json",
    "canonical-result.schema.json",
    "semantic-profile.schema.json",
    "cibseven-evidence.schema.json",
    "checked-process.schema.json",
    "semantic-process.schema.json",
  ]) {
    const schema = JSON.parse(
      await readFile(
        new URL(`../contracts/schemas/${schemaName}`, import.meta.url),
        "utf8",
      ),
    );
    for (const integer of collectIntegerSchemas(schema)) {
      assert.equal(
        integer.schema.maximum,
        Number.MAX_SAFE_INTEGER,
        `${schemaName} ${integer.path}`,
      );
    }
  }

  const [artifactSet] = await readAndVerifyArtifactSets(projectRoot);
  const unsafe = cloneArtifactSet(artifactSet);
  unsafe.scenario.stimuli[1].taskId.activation =
    Number.MAX_SAFE_INTEGER + 1;
  bindScenarioBytes(
    unsafe,
    `${JSON.stringify(unsafe.scenario, null, 2)}\n`,
  );
  assert.throws(
    () => verifyArtifactSet(unsafe),
    /scenario schema validation failed/,
  );

  const fractional = cloneArtifactSet(artifactSet);
  fractional.scenario.stimuli[1].taskId.activation = 1.5;
  bindScenarioBytes(
    fractional,
    `${JSON.stringify(fractional.scenario, null, 2)}\n`,
  );
  assert.throws(
    () => verifyArtifactSet(fractional),
    /scenario schema validation failed/,
  );
});

test("uses Unicode scalar-value order without normalization", () => {
  assert.ok(compareCanonicalStrings("\u{E000}", "\u{10000}") < 0);
  assert.ok(compareCanonicalStrings("e\u{301}", "\u{E9}") < 0);
  assert.notEqual("e\u{301}", "\u{E9}");
  assert.throws(
    () => compareCanonicalStrings("\uD800", "valid"),
    /unpaired Unicode surrogate/,
  );
});

test("rejects duplicate keys and unpaired surrogates in exact JSON bytes", async () => {
  const [artifactSet] = await readAndVerifyArtifactSets(projectRoot);

  const duplicate = cloneArtifactSet(artifactSet);
  const duplicateBytes = JSON.stringify(duplicate.scenario, null, 2).replace(
    '"kind": "scenario"',
    '"kind": "scenario",\n  "kind": "scenario"',
  );
  bindScenarioBytes(duplicate, `${duplicateBytes}\n`);
  assert.throws(
    () => verifyArtifactSet(duplicate),
    /duplicate JSON object key: kind/,
  );

  const surrogate = cloneArtifactSet(artifactSet);
  surrogate.scenario.id = "scenario-\uD800";
  surrogate.evidence.scenario.id = surrogate.scenario.id;
  bindScenarioBytes(
    surrogate,
    `${JSON.stringify(surrogate.scenario, null, 2)}\n`,
  );
  assert.throws(
    () => verifyArtifactSet(surrogate),
    /unpaired Unicode surrogate/,
  );
});

test("distinguishes unknown, missing, closed-enum, null, and absent fields", async () => {
  const [artifactSet] = await readAndVerifyArtifactSets(projectRoot);

  const missing = cloneArtifactSet(artifactSet);
  delete missing.scenario.provenance;
  bindScenarioBytes(missing, `${JSON.stringify(missing.scenario)}\n`);
  assert.throws(
    () => verifyArtifactSet(missing),
    /scenario schema validation failed/,
  );

  const closedEnum = cloneArtifactSet(artifactSet);
  closedEnum.scenario.stimuli[1].kind = "completeAnyTask";
  bindScenarioBytes(closedEnum, `${JSON.stringify(closedEnum.scenario)}\n`);
  assert.throws(
    () => verifyArtifactSet(closedEnum),
    /scenario schema validation failed/,
  );

  const nullName = parallelDefinitionArtifacts();
  const checkedTask = nullName.checkedProcess.nodes.find(
    ({ kind }) => kind === "userTask",
  );
  const programTask = nullName.semanticProcess.operations.find(
    ({ kind }) => kind === "awaitUserTask",
  );
  checkedTask.name = null;
  programTask.task.name = null;
  await assert.doesNotReject(
    verifyDefinitionArtifacts(projectRoot, nullName),
  );

  const absentName = parallelDefinitionArtifacts();
  delete absentName.checkedProcess.nodes.find(
    ({ kind }) => kind === "userTask",
  ).name;
  await assert.rejects(
    verifyDefinitionArtifacts(projectRoot, absentName),
    /checked process schema validation failed/,
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
    /producer observation projection does not match canonical/,
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
    /producer observation projection does not match canonical/,
  );
});

test("detects a timer deadline projection mutation", async () => {
  const artifactSets = await readAndVerifyArtifactSets(projectRoot);
  const timer = artifactSets.find(
    ({ scenario }) =>
      scenario.id === "intermediate-catch-timer-pt1s",
  );
  assert.notEqual(timer, undefined);
  const mutated = cloneArtifactSet(timer);
  mutated.evidence.producerObservations.timerJobs[0].jobs[0]
    .dueDateDeltaMs = 999;

  assert.throws(
    () => verifyArtifactSet(mutated),
    /producer observation projection does not match canonical openTimers/,
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
