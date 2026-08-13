import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  serviceTaskIncidentCancellationDefinitionArtifacts,
} from "./contract-incident-cancellation-artifact-test-fixtures.ts";
import {
  serviceTaskIncidentDefinitionArtifacts,
} from "./contract-incident-artifact-test-fixtures.ts";
import {
  verifyServiceTaskIncidentCancellationArtifactBinding,
  verifyServiceTaskIncidentCancellationSuccessor,
} from "./service-task-incident-cancellation-profile-consistency.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

type MutableCancellationProfile = {
  id: string;
  environment: Record<string, unknown> & {
    createIncidentOnFailedJobEnabled: boolean;
  };
  bpmn: { relationships: string[] };
  effectBindings?: unknown;
};

type MutableCancellationScenario = {
  id: string;
  profile: string;
  bpmn: {
    id: string;
    relativePath: string;
    sha256: string;
    sourceOverlay: unknown;
  };
  stimuli: Array<Record<string, unknown>>;
};

test("preserves the exact Stage 1 profile, scenario, evidence, and source bytes", async () => {
  const pathsAndDigests = [
    [
      "profiles/cibseven-2.2.0-service-task-incident-draft/profile.json",
      "0585357cae98d13a295dbb504d900c80423742ed1bbc73f20350ed7f37f59f3b",
    ],
    [
      "scenarios/service-task-incident/scenario.json",
      "94d1b8afc5c84973430ce55b4cd6ee6bc4cc7ba6c8de09acff6ce8edb55b12e6",
    ],
    [
      "scenarios/service-task-incident/cibseven-evidence.json",
      "424d15e7a98519805892cd2212eab429e9e6b4ae98b64d1fd630a9bd60de4d19",
    ],
    [
      "scenarios/service-task-effect/process.bpmn",
      "669083696c1706836fcaa487f7f5623408f658fb721145a8111a8b00b7fd7c7d",
    ],
  ] as const;
  for (const [relativePath, digest] of pathsAndDigests) {
    assert.equal(
      createHash("sha256")
        .update(await readFile(`${projectRoot}/${relativePath}`))
        .digest("hex"),
      digest,
      relativePath,
    );
  }
});

test("binds the exact successor profile and answer-free cancellation schedule", async () => {
  const [profile, scenario] = await Promise.all([
    readJson<MutableCancellationProfile>(
      "profiles/cibseven-2.2.0-service-task-incident-cancellation-draft/profile.json",
    ),
    readJson<MutableCancellationScenario>(
      "scenarios/service-task-incident-cancellation/scenario.json",
    ),
  ]);
  assert.doesNotThrow(() =>
    verifyServiceTaskIncidentCancellationArtifactBinding(profile, scenario)
  );

  const wrongRelationship = structuredClone(profile);
  wrongRelationship.bpmn.relationships[3] = "CIB-EXT-0013";
  assert.throws(
    () => verifyServiceTaskIncidentCancellationArtifactBinding(wrongRelationship, scenario),
    /exact configured binding/u,
  );

  const wrongProfile = structuredClone(scenario);
  wrongProfile.profile = "cibseven-2.2.0-service-task-incident-draft";
  assert.throws(
    () => verifyServiceTaskIncidentCancellationArtifactBinding(profile, wrongProfile),
    /selected together/u,
  );
});

test("rejects missing or changed Process data and incident addressing", async () => {
  const [profile, scenario] = await Promise.all([
    readJson<MutableCancellationProfile>(
      "profiles/cibseven-2.2.0-service-task-incident-cancellation-draft/profile.json",
    ),
    readJson<MutableCancellationScenario>(
      "scenarios/service-task-incident-cancellation/scenario.json",
    ),
  ]);
  for (const mutate of [
    (value: MutableCancellationScenario) => {
      value.bpmn.sha256 = "0".repeat(64);
    },
    (value: MutableCancellationScenario) => {
      value.stimuli[0]!.initialVariables = [];
    },
    (value: MutableCancellationScenario) => {
      const start = value.stimuli[0]!.initialVariables as Array<Record<string, unknown>>;
      start[0]!.value = { kind: "string", value: "changed" };
    },
    (value: MutableCancellationScenario) => {
      value.stimuli[2]!.processInstanceId = "Nested_1";
    },
    (value: MutableCancellationScenario) => {
      const incidentId = value.stimuli[2]!.incidentId as Record<string, unknown>;
      incidentId.generation = 2;
    },
    (value: MutableCancellationScenario) => {
      value.stimuli[2]!.scopeOccurrenceId = "Nested_1";
    },
  ]) {
    const changed = structuredClone(scenario);
    mutate(changed);
    assert.throws(
      () => verifyServiceTaskIncidentCancellationArtifactBinding(profile, changed),
      /exact answer-free schedule/u,
    );
  }
});

test("rejects every successor definition drift outside profile identity", () => {
  const checkedDrift = serviceTaskIncidentCancellationDefinitionArtifacts();
  checkedDrift.checkedProcess.processId = "Process_Substituted";
  assert.throws(
    () => verifyServiceTaskIncidentCancellationSuccessor(
      serviceTaskIncidentDefinitionArtifacts(),
      checkedDrift,
    ),
    /checked process differs outside semantic profile identity/u,
  );

  const programDrift = serviceTaskIncidentCancellationDefinitionArtifacts();
  programDrift.semanticProcess.processId = "Process_Substituted";
  assert.throws(
    () => verifyServiceTaskIncidentCancellationSuccessor(
      serviceTaskIncidentDefinitionArtifacts(),
      programDrift,
    ),
    /Semantic Process differs outside semantic profile identity/u,
  );
});

async function readJson<Value>(relativePath: string): Promise<Value> {
  return JSON.parse(
    await readFile(`${projectRoot}/${relativePath}`, "utf8"),
  ) as Value;
}
