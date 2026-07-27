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
