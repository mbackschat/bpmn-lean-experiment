import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  enginePopulationScenarioRelativePaths,
  readEnginePopulationArtifacts,
  verifyEnginePopulationScenario,
} from "./engine-population-artifacts.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

function clone(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

test("registers the four answer-free Message-correlation population schedules", async () => {
  const artifacts = await readEnginePopulationArtifacts(projectRoot);

  assert.deepEqual(
    artifacts.scenarios.map(({ relativePath }) => relativePath),
    enginePopulationScenarioRelativePaths,
  );
  assert.equal(artifacts.profile.id, "bpmn-2.0.2-message-key-correlation-draft");
  assert.deepEqual(
    artifacts.scenarios.map(({ document }) => document.executionTargets),
    Array.from({ length: 4 }, () => ({
      lean: true,
      typeScriptCore: true,
      temporal: true,
      cib: null,
    })),
  );
});

test("constructs zero, unique, ambiguous, and definition-isolated populations without answers", async () => {
  const { scenarios } = await readEnginePopulationArtifacts(projectRoot);
  const matchingCandidateCounts = Object.fromEntries(scenarios.map(({ document }) => {
    const publication = document.publications[0];
    const count = document.instances.filter((instance) =>
      instance.definitionId === publication.address.definition.sourceId &&
        instance.stimuli[1].payload.value === publication.payload.value
    ).length;
    return [document.id, count];
  }));

  assert.deepEqual(matchingCandidateCounts, {
    "message-key-correlation-ambiguous": 2,
    "message-key-correlation-cross-definition": 1,
    "message-key-correlation-unique": 1,
    "message-key-correlation-zero": 0,
  });
});

test("refuses answer smuggling and caller-selected targets", async () => {
  const { scenarios } = await readEnginePopulationArtifacts(projectRoot);
  const exact = scenarios[0]?.document;
  assert.ok(exact !== undefined);

  for (const mutation of [
    (document: Record<string, unknown>) => {
      document.expected = { outcome: "committed" };
    },
    (document: Record<string, unknown>) => {
      const publications = document.publications as Array<Record<string, unknown>>;
      publications[0]!.target = { processInstanceId: "lexical-first" };
    },
    (document: Record<string, unknown>) => {
      const publications = document.publications as Array<Record<string, unknown>>;
      publications[0]!.workflowId = "caller-selected";
    },
  ]) {
    const changed = clone(exact);
    mutation(changed);
    await assert.rejects(
      () => verifyEnginePopulationScenario(projectRoot, changed),
      /engine population scenario/u,
    );
  }
});

test("binds definition scope by complete source identity instead of local ids", async () => {
  const { scenarios } = await readEnginePopulationArtifacts(projectRoot);
  const crossDefinition = scenarios.find(({ relativePath }) =>
    relativePath.endsWith("cross-definition.population-scenario.json")
  )?.document;
  assert.ok(crossDefinition !== undefined);

  const changed = clone(crossDefinition);
  const definitions = changed.definitions as Array<Record<string, unknown>>;
  const publication = (changed.publications as Array<Record<string, unknown>>)[0]!;
  const address = publication.address as Record<string, unknown>;
  const identity = address.definition as Record<string, unknown>;
  identity.sourceSha256 = definitions[1]!.sha256;

  await assert.rejects(
    () => verifyEnginePopulationScenario(projectRoot, changed),
    /publication definition identity/u,
  );
});

test("requires canonical unique command, definition, and Process-instance identities", async () => {
  const { scenarios } = await readEnginePopulationArtifacts(projectRoot);
  const exact = scenarios[0]?.document;
  assert.ok(exact !== undefined);

  const changed = clone(exact);
  const instances = changed.instances as Array<Record<string, unknown>>;
  const firstStimuli = instances[0]!.stimuli as Array<Record<string, unknown>>;
  const secondStimuli = instances[1]!.stimuli as Array<Record<string, unknown>>;
  secondStimuli[0]!.commandId = firstStimuli[0]!.commandId;

  await assert.rejects(
    () => verifyEnginePopulationScenario(projectRoot, changed),
    /command ids contains duplicates/u,
  );
});
