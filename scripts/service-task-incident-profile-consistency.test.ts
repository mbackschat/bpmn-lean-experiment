import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  serviceTaskDefinitionArtifacts,
} from "./contract-artifact-test-fixtures.ts";
import {
  serviceTaskIncidentDefinitionArtifacts,
} from "./contract-incident-artifact-test-fixtures.ts";
import {
  verifyServiceTaskIncidentArtifactBinding,
  verifyServiceTaskIncidentSuccessor,
} from "./service-task-incident-profile-consistency.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceSha256 =
  "669083696c1706836fcaa487f7f5623408f658fb721145a8111a8b00b7fd7c7d";

type MutableIncidentProfile = {
  id: string;
  environment: Record<string, unknown> & {
    createIncidentOnFailedJobEnabled: boolean;
  };
  bpmn: { relationships: string[] };
  effectBindings?: unknown;
};

type MutableIncidentScenario = {
  id: string;
  profile: string;
  bpmn: {
    id: string;
    relativePath: string;
    sha256: string;
    sourceOverlay: unknown;
  };
  stimuli: Array<Record<string, unknown>>;
  options: { incidents: { cancellable: boolean } };
};

test("preserves the exact predecessor profile, scenario, and BPMN bytes", async () => {
  const pathsAndDigests = [
    [
      "profiles/cibseven-2.2.0-service-task-effect-draft/profile.json",
      "0d6e2bad3cd98e49bf8c283fdf8aceb38b8d3bf24c5f5f04a13d671c511fb698",
    ],
    [
      "scenarios/service-task-effect/scenario.json",
      "4fcb189b3dbbe1d11a8545fadd61cb7d08d8e6d8f09c7e761eb3404debf66487",
    ],
    [
      "scenarios/service-task-effect/process.bpmn",
      sourceSha256,
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

test("binds the exact configured profile to the answer-free incident schedule", async () => {
  const [profile, scenario] = await Promise.all([
    readJson<MutableIncidentProfile>(
      "profiles/cibseven-2.2.0-service-task-incident-draft/profile.json",
    ),
    readJson<MutableIncidentScenario>(
      "scenarios/service-task-incident/scenario.json",
    ),
  ]);
  assert.doesNotThrow(() =>
    verifyServiceTaskIncidentArtifactBinding(profile, scenario)
  );

  const disabled = structuredClone(profile);
  disabled.environment.createIncidentOnFailedJobEnabled = false;
  assert.throws(
    () => verifyServiceTaskIncidentArtifactBinding(disabled, scenario),
    /exact configured binding/u,
  );

  const wrongOccurrence = structuredClone(scenario);
  const report = wrongOccurrence.stimuli[1]?.occurrence as Record<string, unknown> | undefined;
  assert.ok(report !== undefined);
  report.activation = 2;
  assert.throws(
    () => verifyServiceTaskIncidentArtifactBinding(profile, wrongOccurrence),
    /exact answer-free schedule/u,
  );

  const cancellable = structuredClone(scenario);
  cancellable.options.incidents.cancellable = true;
  assert.throws(
    () => verifyServiceTaskIncidentArtifactBinding(profile, cancellable),
    /exact answer-free schedule/u,
  );
});

test("rejects every successor definition drift outside profile identity", () => {
  const checkedDrift = serviceTaskIncidentDefinitionArtifacts();
  checkedDrift.checkedProcess.processId = "Process_Substituted";
  assert.throws(
    () =>
      verifyServiceTaskIncidentSuccessor(
        serviceTaskDefinitionArtifacts(),
        checkedDrift,
      ),
    /checked process differs outside semantic profile identity/u,
  );

  const programDrift = serviceTaskIncidentDefinitionArtifacts();
  programDrift.semanticProcess.processId = "Process_Substituted";
  assert.throws(
    () =>
      verifyServiceTaskIncidentSuccessor(
        serviceTaskDefinitionArtifacts(),
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
