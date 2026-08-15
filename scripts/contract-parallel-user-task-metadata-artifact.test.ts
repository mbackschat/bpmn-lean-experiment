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
import {
  parallelUserTaskMetadataProfileId,
} from "./contract-cib-user-task-metadata-projection.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

test("binds both raw metadata rows by element identity independent of query order", async () => {
  const retained = (await readAndVerifyArtifactSets(projectRoot)).filter(
    ({ profile }) => profile.id === parallelUserTaskMetadataProfileId,
  );
  assert.equal(retained.length, 2);
  for (const artifact of retained) {
    const reordered = cloneArtifactSet(artifact);
    reordered.evidence.producerObservations.taskQueries[0]?.tasks.reverse();
    assert.doesNotThrow(() => verifyArtifactSet(reordered));

    const swapped = cloneArtifactSet(artifact);
    const tasks = required(
      swapped.evidence.producerObservations.taskQueries[0],
      "parallel raw task query",
    ).tasks;
    const content = required(
      tasks.find(({ elementId }) => elementId === "UserTask_ContentReview"),
      "raw Content task",
    );
    const risk = required(
      tasks.find(({ elementId }) => elementId === "UserTask_RiskReview"),
      "raw Risk task",
    );
    const contentIdentityLinks = required(
      content.identityLinks,
      "raw Content identity links",
    );
    const riskIdentityLinks = required(
      risk.identityLinks,
      "raw Risk identity links",
    );
    const contentFormFields = required(
      content.formFields,
      "raw Content form fields",
    );
    const riskFormFields = required(
      risk.formFields,
      "raw Risk form fields",
    );
    [content.identityLinks, risk.identityLinks] = [
      riskIdentityLinks,
      contentIdentityLinks,
    ];
    [content.formFields, risk.formFields] = [
      riskFormFields,
      contentFormFields,
    ];
    assert.throws(
      () => verifyArtifactSet(swapped),
      /producer observation projection does not match canonical openUserTasks/,
    );

    const missingSibling = cloneArtifactSet(artifact);
    missingSibling.evidence.producerObservations.taskQueries[0]?.tasks.pop();
    assert.throws(
      () => verifyArtifactSet(missingSibling),
      /producer observation projection does not match canonical (activeWaits|openUserTasks)/,
    );
  }
});
