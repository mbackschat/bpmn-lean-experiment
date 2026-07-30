import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  compareCanonicalStrings,
  readAndVerifyArtifactSets,
  verifyArtifactSet,
  verifyDefinitionArtifacts,
} from "./contract-artifacts.ts";
import {
  bindScenarioBytes,
  checkedNodeKind,
  cloneArtifactSet,
  collectIntegerSchemas,
  collectPropertyNames,
  parallelDefinitionArtifacts,
  required,
  requiredAt,
  requireAwaitEffect,
  requireAwaitUserTask,
  requireCheckedUserTask,
  requireMutableState,
  requireState,
  requireServiceTask,
  requireUserTaskCompletion,
  semanticOperationKind,
  serviceTaskDefinitionArtifacts,
} from "./contract-artifact-test-fixtures.ts";
import type {
  MutableDefinitionArtifacts,
} from "./contract-artifact-test-fixtures.ts";
const projectRoot = fileURLToPath(new URL("../", import.meta.url));

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

test("reconstructs mixed waits in semantic kind-then-element order", async () => {
  const artifactSets = await readAndVerifyArtifactSets(projectRoot);
  const parallel = required(
    artifactSets.find(
      ({ scenario }) =>
        scenario.id === "parallel-fork-join-a-then-b",
    ),
    "parallel artifact set",
  );
  const mixed = cloneArtifactSet(parallel);
  const state = requireMutableState(mixed.evidence.result.trace[2]);
  const timerKind = requiredAt(
    requireState(
      required(
        artifactSets.find(
          ({ scenario }) => scenario.id === "intermediate-catch-timer-pt1s",
        ),
        "timer artifact set",
      ).evidence.result.trace[2],
    ).activeWaits,
    0,
    "timer active waits",
  ).kind;
  const effectKind = requiredAt(
    requireState(
      required(
        artifactSets.find(
          ({ scenario }) => scenario.id === "service-task-effect-success",
        ),
        "effect artifact set",
      ).evidence.result.trace[2],
    ).activeWaits,
    0,
    "effect active waits",
  ).kind;
  mixed.evidence.producerObservations.effectJobs =
    mixed.evidence.producerObservations.timerJobs.map(
      ({ afterCommandId }) => ({ afterCommandId, jobs: [] }),
    );
  const timerSnapshot = requiredAt(
    mixed.evidence.producerObservations.timerJobs,
    0,
    "timer snapshots",
  );
  const effectSnapshot = requiredAt(
    mixed.evidence.producerObservations.effectJobs,
    0,
    "effect snapshots",
  );
  timerSnapshot.jobs.push({
    elementId: "A_Timer",
    dueDateDeltaMs: 1000,
    executable: false,
  });
  effectSnapshot.jobs.push({
    elementId: "M_Effect",
    activation: 1,
    protocol: "urn:bpmn-lean:effect:probe-v1",
    handler: "bpmnLeanEffectHandler",
    retries: 3,
    executable: true,
    dueDatePresent: false,
  });
  state.activeWaits.push(
    {
      elementId: "A_Timer",
      kind: timerKind,
      multiplicity: 1,
    },
    {
      elementId: "M_Effect",
      kind: effectKind,
      multiplicity: 1,
    },
  );
  state.openTimers.push({
    id: {
      processInstanceId: state.instanceId,
      elementId: "A_Timer",
      activation: 1,
    },
    deadlineMs: 1000,
  });
  state.openEffects.push({
    id: {
      processInstanceId: state.instanceId,
      elementId: "M_Effect",
      activation: 1,
    },
    descriptor: {
      protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
      operation: "urn:bpmn-lean:effect-operation:probe-v1",
    },
    arguments: [],
  });

  assert.doesNotThrow(() => verifyArtifactSet(mixed));
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
    /unsupported retained CIB effect binding|producer observation projection does not match canonical openEffects/,
  );
});

test("binds the synchronous CreateDocument mapping facts to final Process data", async () => {
  const artifactSets = await readAndVerifyArtifactSets(projectRoot);
  const createDocument = required(
    artifactSets.find(
      ({ scenario }) => scenario.id === "a12-create-document-data",
    ),
    "CreateDocument artifact set",
  );
  const mutated = cloneArtifactSet(createDocument);
  const mapping = requiredAt(
    required(
      mutated.evidence.producerObservations.mappingExecutions,
      "mapping executions",
    ),
    0,
    "mapping execution",
  );
  const localPatch = requiredAt(
    mapping.localPatch,
    0,
    "mapping local patch",
  );
  if (localPatch.value.kind !== "string") {
    throw new Error("CreateDocument local patch must be a string");
  }
  localPatch.value.value = "Document:wrong";

  assert.throws(
    () => verifyArtifactSet(mutated),
    /does not establish the exact CreateDocument contract/,
  );
});

test("binds the caught boundary Error local null to mapped Process data", async () => {
  const artifactSets = await readAndVerifyArtifactSets(projectRoot);
  const createDocument = required(
    artifactSets.find(
      ({ scenario }) => scenario.id === "a12-create-document-data",
    ),
    "CreateDocument artifact set",
  );
  const boundaryError = required(
    artifactSets.find(
      ({ scenario }) => scenario.id === "a12-boundary-error-caught",
    ),
    "boundary-error artifact set",
  );
  const mutated = cloneArtifactSet(boundaryError);
  const mapping = requiredAt(
    required(
      mutated.evidence.producerObservations.mappingExecutions,
      "mapping executions",
    ),
    0,
    "mapping execution",
  );
  const stringValue = requiredAt(
    required(
      createDocument.evidence.producerObservations.mappingExecutions,
      "CreateDocument mapping executions",
    ),
    0,
    "CreateDocument mapping execution",
  ).localPatch[0]?.value;
  if (stringValue?.kind !== "string") {
    throw new Error("CreateDocument local patch must be a string");
  }
  mapping.localPatch[0] = {
    name: "newLinkId",
    value: structuredClone(stringValue),
  };

  assert.throws(
    () => verifyArtifactSet(mutated),
    /does not establish the exact boundary-error contract/,
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
