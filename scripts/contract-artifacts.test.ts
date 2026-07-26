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
} from "./contract-artifacts.ts";
import type {
  ArtifactSet,
  DefinitionArtifacts,
} from "./contract-artifacts.ts";
import type {
  CanonicalObservation,
  CheckedNode,
  CompleteUserTaskInstanceStimulus,
  ControlPlace,
  SemanticOperation,
  SemanticOperationKind,
  StateObservation,
  Stimulus,
  CheckedNodeKind,
} from "../packages/semantic-core/src/index.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

type DeepMutable<Value> =
  Value extends (...args: never[]) => unknown
    ? Value
    : Value extends ReadonlyArray<infer Item>
      ? Array<DeepMutable<Item>>
      : Value extends object
        ? { -readonly [Key in keyof Value]: DeepMutable<Value[Key]> }
        : Value;

type MutableArtifactSet =
  Pick<ArtifactSet, "validator" | "registeredRelationshipIds"> &
  DeepMutable<
    Omit<ArtifactSet, "validator" | "registeredRelationshipIds">
  >;

type MutableDefinitionArtifacts = DeepMutable<DefinitionArtifacts>;

type IntegerSchemaLocation = Readonly<{
  path: string;
  schema: Readonly<{
    maximum?: unknown;
  }>;
}>;

const checkedNodeKind = Object.freeze({
  UserTask: "userTask" as CheckedNodeKind.UserTask,
  ServiceTask: "serviceTask" as CheckedNodeKind.ServiceTask,
});

const semanticOperationKind = Object.freeze({
  AwaitUserTask:
    "awaitUserTask" as SemanticOperationKind.AwaitUserTask,
  AwaitEffect: "awaitEffect" as SemanticOperationKind.AwaitEffect,
  Duplicate: "duplicate" as SemanticOperationKind.Duplicate,
  Synchronize:
    "synchronize" as SemanticOperationKind.Synchronize,
});

function cloneArtifactSet(
  artifactSet: ArtifactSet,
): MutableArtifactSet {
  return {
    ...artifactSet,
    profile: structuredClone(artifactSet.profile),
    profileBytes: Buffer.from(artifactSet.profileBytes),
    scenario: structuredClone(artifactSet.scenario),
    scenarioBytes: Buffer.from(artifactSet.scenarioBytes),
    evidence: structuredClone(artifactSet.evidence),
    bpmnBytes: Buffer.from(artifactSet.bpmnBytes),
  } as MutableArtifactSet;
}

function bindScenarioBytes(
  artifactSet: MutableArtifactSet,
  scenarioBytes: string | Uint8Array,
): void {
  artifactSet.scenarioBytes = Buffer.from(scenarioBytes);
  artifactSet.evidence.scenario.sha256 = createHash("sha256")
    .update(artifactSet.scenarioBytes)
    .digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function collectIntegerSchemas(
  value: unknown,
  locations: Array<IntegerSchemaLocation> = [],
  path = "$",
): Array<IntegerSchemaLocation> {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectIntegerSchemas(item, locations, `${path}[${index}]`));
    return locations;
  }
  if (isRecord(value)) {
    if (value.type === "integer") {
      locations.push({ path, schema: value });
    }
    for (const [name, item] of Object.entries(value)) {
      collectIntegerSchemas(item, locations, `${path}.${name}`);
    }
  }
  return locations;
}

function collectPropertyNames(
  value: unknown,
  names = new Set<string>(),
): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectPropertyNames(item, names);
    }
    return names;
  }
  if (isRecord(value)) {
    for (const [name, item] of Object.entries(value)) {
      names.add(name);
      collectPropertyNames(item, names);
    }
  }
  return names;
}

function parallelDefinitionArtifacts(): MutableDefinitionArtifacts {
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
  } as unknown as MutableDefinitionArtifacts;
}

function serviceTaskDefinitionArtifacts(): MutableDefinitionArtifacts {
  const identity = {
    semanticProfile: "cibseven-2.2.0-service-task-effect-draft",
    sourceId: "service-task-effect-phase-zero-probe",
    sourceSha256:
      "669083696c1706836fcaa487f7f5623408f658fb721145a8111a8b00b7fd7c7d",
  };
  const descriptor = {
    protocol: "urn:bpmn-lean:effect:probe-v1",
    handler: "bpmnLeanEffectHandler",
  };
  return {
    checkedProcess: {
      kind: "checkedProcess",
      identity,
      processId: "Process_ServiceTaskEffectProbe",
      nodes: [
        { kind: "noneEndEvent", id: "EndEvent_1" },
        {
          kind: "serviceTask",
          id: "ServiceTask_Record",
          implementation: descriptor.protocol,
          sourceBinding: {
            delegateExpressionAttribute: {
              namespace: "http://camunda.org/schema/1.0/bpmn",
              value: "${bpmnLeanEffectHandler}",
            },
            asyncBeforeAttribute: {
              namespace: "http://camunda.org/schema/1.0/bpmn",
              value: "true",
            },
          },
        },
        { kind: "noneStartEvent", id: "StartEvent_1" },
      ],
      sequenceFlows: [
        {
          id: "Flow_ServiceToEnd",
          sourceId: "ServiceTask_Record",
          targetId: "EndEvent_1",
        },
        {
          id: "Flow_StartToService",
          sourceId: "StartEvent_1",
          targetId: "ServiceTask_Record",
        },
      ],
    },
    semanticProcess: {
      kind: "semanticProcess",
      identity: {
        compiler: "bpmn-source-semantic-process",
        ...identity,
      },
      processId: "Process_ServiceTaskEffectProbe",
      controlPlaces: [
        controlPlace("Flow_ServiceToEnd"),
        controlPlace("Flow_StartToService"),
      ],
      operations: [
        operation("EndEvent_1", "terminate", {
          input: "place:Flow_ServiceToEnd",
        }),
        operation("ServiceTask_Record", "awaitEffect", {
          input: "place:Flow_StartToService",
          output: "place:Flow_ServiceToEnd",
          effect: {
            elementId: "ServiceTask_Record",
            descriptor,
          },
        }),
        operation("StartEvent_1", "initiate", {
          output: "place:Flow_StartToService",
        }),
      ],
    },
  } as unknown as MutableDefinitionArtifacts;
}

function controlPlace(flowId: string): ControlPlace {
  return {
    id: `place:${flowId}`,
    origin: { kind: "bpmnSequenceFlow", elementId: flowId },
  } as unknown as ControlPlace;
}

function operation(
  elementId: string,
  kind: string,
  fields: Readonly<Record<string, unknown>>,
): SemanticOperation {
  return {
    id: `operation:${elementId}`,
    kind,
    origin: { kind: "bpmnElement", elementId },
    ...fields,
  } as unknown as SemanticOperation;
}

function required<Value>(
  value: Value | undefined,
  label: string,
): Value {
  if (value === undefined) {
    throw new Error(`${label} is required`);
  }
  return value;
}

function requiredAt<Value>(
  values: ReadonlyArray<Value>,
  index: number,
  label: string,
): Value {
  return required(values[index], `${label}[${index}]`);
}

function requireUserTaskCompletion(
  stimulus: DeepMutable<Stimulus> | undefined,
): DeepMutable<CompleteUserTaskInstanceStimulus> {
  if (stimulus?.kind !== "completeUserTaskInstance") {
    throw new Error("expected a User Task completion stimulus");
  }
  return stimulus;
}

function requireState(
  observation: CanonicalObservation | undefined,
): StateObservation {
  if (observation?.kind !== "state") {
    throw new Error("expected a canonical state observation");
  }
  return observation;
}

function requireMutableState(
  observation: DeepMutable<CanonicalObservation> | undefined,
): DeepMutable<StateObservation> {
  if (observation?.kind !== "state") {
    throw new Error("expected a mutable canonical state observation");
  }
  return observation;
}

type MutableCheckedUserTask = DeepMutable<
  Extract<CheckedNode, { kind: CheckedNodeKind.UserTask }>
>;
type MutableAwaitUserTask = DeepMutable<
  Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.AwaitUserTask }
  >
>;
type MutableServiceTask = DeepMutable<
  Extract<CheckedNode, { kind: CheckedNodeKind.ServiceTask }>
>;
type MutableAwaitEffect = DeepMutable<
  Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.AwaitEffect }
  >
>;

function requireCheckedUserTask(
  node: DeepMutable<CheckedNode> | undefined,
): MutableCheckedUserTask {
  if (node?.kind !== checkedNodeKind.UserTask) {
    throw new Error("expected a checked User Task");
  }
  return node;
}

function requireAwaitUserTask(
  operationValue: DeepMutable<SemanticOperation> | undefined,
): MutableAwaitUserTask {
  if (
    operationValue?.kind !== semanticOperationKind.AwaitUserTask
  ) {
    throw new Error("expected an awaitUserTask operation");
  }
  return operationValue;
}

function requireServiceTask(
  node: DeepMutable<CheckedNode> | undefined,
): MutableServiceTask {
  if (node?.kind !== checkedNodeKind.ServiceTask) {
    throw new Error("expected a checked Service Task");
  }
  return node;
}

function requireAwaitEffect(
  operationValue: DeepMutable<SemanticOperation> | undefined,
): MutableAwaitEffect {
  if (operationValue?.kind !== semanticOperationKind.AwaitEffect) {
    throw new Error("expected an awaitEffect operation");
  }
  return operationValue;
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

  assert.equal(artifactSets.length, 8);
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
  const artifactSet = requiredAt(
    await readAndVerifyArtifactSets(projectRoot),
    0,
    "artifact sets",
  );
  const mutated = cloneArtifactSet(artifactSet);
  (
    mutated.scenario as unknown as Record<string, unknown>
  ).calibration = {
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

  const artifactSet = requiredAt(
    await readAndVerifyArtifactSets(projectRoot),
    0,
    "artifact sets",
  );
  const unsafe = cloneArtifactSet(artifactSet);
  requireUserTaskCompletion(unsafe.scenario.stimuli[1]).taskId.activation =
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
  requireUserTaskCompletion(
    fractional.scenario.stimuli[1],
  ).taskId.activation = 1.5;
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
  const artifactSet = requiredAt(
    await readAndVerifyArtifactSets(projectRoot),
    0,
    "artifact sets",
  );

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
  const artifactSet = requiredAt(
    await readAndVerifyArtifactSets(projectRoot),
    0,
    "artifact sets",
  );

  const missing = cloneArtifactSet(artifactSet);
  delete (
    missing.scenario as unknown as Partial<{ provenance: unknown }>
  ).provenance;
  bindScenarioBytes(missing, `${JSON.stringify(missing.scenario)}\n`);
  assert.throws(
    () => verifyArtifactSet(missing),
    /scenario schema validation failed/,
  );

  const closedEnum = cloneArtifactSet(artifactSet);
  (
    requiredAt(
      closedEnum.scenario.stimuli,
      1,
      "closed-enum stimuli",
    ) as unknown as { kind: string }
  ).kind = "completeAnyTask";
  bindScenarioBytes(closedEnum, `${JSON.stringify(closedEnum.scenario)}\n`);
  assert.throws(
    () => verifyArtifactSet(closedEnum),
    /scenario schema validation failed/,
  );

  const nullName = parallelDefinitionArtifacts();
  const checkedTask = requireCheckedUserTask(
    nullName.checkedProcess.nodes.find(
      ({ kind }) => kind === checkedNodeKind.UserTask,
    ),
  );
  const programTask = requireAwaitUserTask(
    nullName.semanticProcess.operations.find(
      ({ kind }) => kind === semanticOperationKind.AwaitUserTask,
    ),
  );
  checkedTask.name = null;
  programTask.task.name = null;
  await assert.doesNotReject(
    verifyDefinitionArtifacts(projectRoot, nullName),
  );

  const absentName = parallelDefinitionArtifacts();
  const absentCheckedTask = requireCheckedUserTask(
    absentName.checkedProcess.nodes.find(
      ({ kind }) => kind === checkedNodeKind.UserTask,
    ),
  );
  delete (
    absentCheckedTask as Partial<{ name: string | null }>
  ).name;
  await assert.rejects(
    verifyDefinitionArtifacts(projectRoot, absentName),
    /checked process schema validation failed/,
  );
});

test("rejects retained evidence after its neutral scenario changes", async () => {
  const artifactSet = requiredAt(
    await readAndVerifyArtifactSets(projectRoot),
    0,
    "artifact sets",
  );
  const mutated = cloneArtifactSet(artifactSet);
  requiredAt(
    mutated.scenario.stimuli,
    0,
    "scenario stimuli",
  ).commandId = "changed-start-command";
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
  const interaction = required(
    artifactSets.find(
      ({ scenario }) =>
        scenario.id === "user-task-discovery-completion",
    ),
    "User Task artifact set",
  );
  const mutated = cloneArtifactSet(interaction);
  const state = requireMutableState(mutated.evidence.result.trace[2]);
  requiredAt(
    state.openUserTasks,
    0,
    "open User Tasks",
  ).id.activation = 0;

  assert.throws(
    () => verifyArtifactSet(mutated),
    /evidence schema validation failed/,
  );
});

test("derives canonical parallel tasks independently of producer query order", async () => {
  const artifactSets = await readAndVerifyArtifactSets(projectRoot);
  const parallel = required(
    artifactSets.find(
      ({ scenario }) =>
        scenario.id === "parallel-fork-join-a-then-b",
    ),
    "parallel artifact set",
  );
  const reordered = cloneArtifactSet(parallel);
  requiredAt(
    reordered.evidence.producerObservations.taskQueries,
    0,
    "task query snapshots",
  ).tasks.reverse();

  assert.doesNotThrow(() => verifyArtifactSet(reordered));

  const dropped = cloneArtifactSet(parallel);
  requiredAt(
    dropped.evidence.producerObservations.taskQueries,
    0,
    "task query snapshots",
  ).tasks.pop();
  assert.throws(
    () => verifyArtifactSet(dropped),
    /producer observation projection does not match canonical/,
  );
});

test("detects a missing live sibling after stale parallel completion", async () => {
  const artifactSets = await readAndVerifyArtifactSets(projectRoot);
  const stale = required(
    artifactSets.find(
      ({ scenario }) =>
        scenario.id === "parallel-fork-join-stale-a-while-b-active",
    ),
    "stale parallel artifact set",
  );
  const mutated = cloneArtifactSet(stale);
  const afterStale = mutated.evidence.producerObservations.taskQueries.find(
    ({ afterCommandId }) =>
      afterCommandId === "complete-stale-user-task-a",
  );
  required(afterStale, "post-stale task snapshot").tasks.pop();

  assert.throws(
    () => verifyArtifactSet(mutated),
    /producer observation projection does not match canonical/,
  );
});

test("detects a timer deadline projection mutation", async () => {
  const artifactSets = await readAndVerifyArtifactSets(projectRoot);
  const timer = required(
    artifactSets.find(
      ({ scenario }) =>
        scenario.id === "intermediate-catch-timer-pt1s",
    ),
    "timer artifact set",
  );
  const mutated = cloneArtifactSet(timer);
  requiredAt(
    requiredAt(
      mutated.evidence.producerObservations.timerJobs,
      0,
      "timer snapshots",
    ).jobs,
    0,
    "timer jobs",
  ).dueDateDeltaMs = 999;

  assert.throws(
    () => verifyArtifactSet(mutated),
    /producer observation projection does not match canonical openTimers/,
  );
});

test("detects a Service Task effect-binding projection mutation", async () => {
  const artifactSets = await readAndVerifyArtifactSets(projectRoot);
  const effect = required(
    artifactSets.find(
      ({ scenario }) => scenario.id === "service-task-effect-success",
    ),
    "Service Task artifact set",
  );
  const mutated = cloneArtifactSet(effect);
  const effectJobs = required(
    mutated.evidence.producerObservations.effectJobs,
    "effect job snapshots",
  );
  const effectJob = requiredAt(
    requiredAt(effectJobs, 0, "effect snapshots").jobs,
    0,
    "effect jobs",
  );
  (effectJob as unknown as { handler: string }).handler =
    "unexpectedEffectHandler";

  assert.throws(
    () => verifyArtifactSet(mutated),
    /producer observation projection does not match canonical openEffects/,
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

  const firstArtifactSet = requiredAt(
    artifactSets,
    0,
    "artifact sets",
  );
  const mutated = cloneArtifactSet(firstArtifactSet);
  delete (
    mutated.profile.bpmn as Partial<{
      relationships: Array<string>;
    }>
  ).relationships;

  assert.throws(
    () => verifyArtifactSet(mutated),
    /profile schema validation failed/,
  );

  const unknownRelationship = cloneArtifactSet(firstArtifactSet);
  unknownRelationship.profile.bpmn.relationships[0] =
    "CIB-AGR-9999";

  assert.throws(
    () => verifyArtifactSet(unknownRelationship),
    /profile references unknown CIB-BPMN relationship/,
  );
});

test("accepts the canonical checked-process and Semantic Process contract shapes", async () => {
  for (const artifacts of [
    parallelDefinitionArtifacts(),
    serviceTaskDefinitionArtifacts(),
  ]) {
    assert.equal(
      await verifyDefinitionArtifacts(projectRoot, artifacts),
      artifacts,
    );
  }
});

test("rejects drift in either exact Service Task binding identity", async () => {
  const mutations: ReadonlyArray<
    (artifacts: MutableDefinitionArtifacts) => void
  > = [
    (artifacts) => {
      const serviceTask = requireServiceTask(
        artifacts.checkedProcess.nodes[1],
      );
      (
        serviceTask as unknown as { implementation: string }
      ).implementation =
        "urn:bpmn-lean:effect:other";
    },
    (artifacts) => {
      const serviceTask = requireServiceTask(
        artifacts.checkedProcess.nodes[1],
      );
      (
        serviceTask.sourceBinding.delegateExpressionAttribute as unknown as {
          value: string;
        }
      ).value = "${otherHandler}";
    },
    (artifacts) => {
      const effectOperation = requireAwaitEffect(
        artifacts.semanticProcess.operations[1],
      );
      effectOperation.effect.elementId =
        "Other_ServiceTask";
    },
  ];
  for (const mutate of mutations) {
    const artifacts = serviceTaskDefinitionArtifacts();
    mutate(artifacts);
    await assert.rejects(
      verifyDefinitionArtifacts(projectRoot, artifacts),
      /schema validation failed|effect identity differs/,
    );
  }
});

test("rejects checked and Semantic Process references outside their definition domains", async () => {
  const checkedMutation = parallelDefinitionArtifacts();
  requiredAt(
    checkedMutation.checkedProcess.sequenceFlows,
    0,
    "checked Sequence Flows",
  ).targetId = "Missing_Task";

  await assert.rejects(
    verifyDefinitionArtifacts(projectRoot, checkedMutation),
    /checked process flow Flow_Fork_A references unknown target node Missing_Task/,
  );

  const programMutation = parallelDefinitionArtifacts();
  const duplicate = required(
    programMutation.semanticProcess.operations.find(
      ({ kind }) => kind === semanticOperationKind.Duplicate,
    ),
    "duplicate operation",
  );
  if (duplicate.kind !== semanticOperationKind.Duplicate) {
    throw new Error("expected a duplicate operation");
  }
  duplicate.outputs[0] = "place:Flow_Fork_A0";

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
    const operationValue = required(
      artifacts.semanticProcess.operations.find(
        ({ id }) => id === operationId,
      ),
      `operation ${operationId}`,
    );
    if (operationValue.kind === semanticOperationKind.Duplicate) {
      operationValue.outputs = [
        requiredAt(operationValue.outputs, 0, "duplicate outputs"),
      ];
    } else if (
      operationValue.kind === semanticOperationKind.Synchronize
    ) {
      operationValue.inputs = [
        requiredAt(operationValue.inputs, 0, "synchronize inputs"),
      ];
    } else {
      throw new Error(
        `${operationId} is not a duplicate or synchronize operation`,
      );
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
  const duplicateOperation = required(
    referenceOrderMutation.semanticProcess.operations.find(
      ({ kind }) => kind === semanticOperationKind.Duplicate,
    ),
    "duplicate operation",
  );
  if (duplicateOperation.kind !== semanticOperationKind.Duplicate) {
    throw new Error("expected duplicate operation");
  }
  duplicateOperation.outputs.reverse();

  await assert.rejects(
    verifyDefinitionArtifacts(projectRoot, referenceOrderMutation),
    /operation operation:Gateway_Fork outputs must be sorted/,
  );
});
