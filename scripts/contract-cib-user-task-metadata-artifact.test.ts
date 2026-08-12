import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  readAndVerifyArtifactSets,
  verifyArtifactSet,
} from "./contract-artifacts.ts";
import {
  cloneArtifactSet,
  required,
} from "./contract-artifact-test-fixtures.ts";
import { userTaskMetadataProfileId } from "./contract-cib-user-task-metadata-projection.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

test("binds canonical candidate and field facts to raw CIB public-service evidence", async () => {
  const retained = required(
    (await readAndVerifyArtifactSets(projectRoot)).find(
      ({ profile }) => profile.id === userTaskMetadataProfileId,
    ),
    "User Task metadata artifact set",
  );
  for (const mutation of ["candidate", "key", "type"] as const) {
    const mutated = cloneArtifactSet(retained);
    const task = required(
      mutated.evidence.producerObservations.taskQueries[0]?.tasks[0],
      "mutable raw User Task metadata",
    );
    switch (mutation) {
      case "candidate":
        required(task.identityLinks?.[0], "raw identity link").groupId =
          "source-derived-group";
        break;
      case "key":
        required(task.formFields?.[0], "raw form field").id =
          "source-derived-key";
        break;
      case "type":
        required(task.formFields?.[0], "raw form field").typeName = "string";
        break;
    }
    assert.throws(
      () => verifyArtifactSet(mutated),
      /producer observation projection does not match canonical openUserTasks/,
    );
  }
});

test("schema rejects incomplete metadata pairs and old-profile leakage", async () => {
  const artifacts = await readAndVerifyArtifactSets(projectRoot);
  const retained = required(
    artifacts.find(({ profile }) => profile.id === userTaskMetadataProfileId),
    "User Task metadata artifact set",
  );
  const missingPartner = cloneArtifactSet(retained);
  const selectedTask = required(
    missingPartner.evidence.producerObservations.taskQueries[0]?.tasks[0],
    "selected raw task",
  );
  delete selectedTask.formFields;
  assert.throws(
    () => verifyArtifactSet(missingPartner),
    /evidence schema validation failed/,
  );

  const old = cloneArtifactSet(required(
    artifacts.find(
      ({ scenario }) => scenario.id === "user-task-discovery-completion",
    ),
    "old User Task artifact set",
  ));
  const oldTask = required(
    old.evidence.producerObservations.taskQueries[0]?.tasks[0],
    "old raw task",
  );
  oldTask.identityLinks = [];
  oldTask.formFields = [];
  assert.throws(
    () => verifyArtifactSet(old),
    /evidence schema validation failed/,
  );
});
