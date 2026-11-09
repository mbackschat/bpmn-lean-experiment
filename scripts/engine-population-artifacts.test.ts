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

function steps(document: Record<string, unknown>): Array<Record<string, unknown>> {
  return document.steps as Array<Record<string, unknown>>;
}

function instanceSteps(document: Record<string, unknown>): Array<Record<string, unknown>> {
  return steps(document).filter((step) => step.kind === "instance");
}

function stimulus(step: Record<string, unknown> | undefined): Record<string, unknown> {
  return (step as { stimulus: Record<string, unknown> }).stimulus;
}

test("registers the four answer-free Message-correlation population schedules", async () => {
  const artifacts = await readEnginePopulationArtifacts(projectRoot);

  assert.deepEqual(
    artifacts.scenarios.map(({ relativePath }) => relativePath),
    enginePopulationScenarioRelativePaths,
  );
  assert.equal(artifacts.profile.id, "bpmn-2.0.2");
  for (const { document } of artifacts.scenarios) {
    assert.equal(document.kind, "populationScenario");
  }
});

test("constructs zero, unique, ambiguous, and definition-isolated populations without answers", async () => {
  const { scenarios } = await readEnginePopulationArtifacts(projectRoot);
  const matchingCandidateCounts = Object.fromEntries(scenarios.map(({ document }) => {
    const publication = document.steps.find((step) => step.kind === "publish");
    assert.ok(publication?.kind === "publish");
    const count = document.steps.filter((step) =>
      step.kind === "instance" &&
        step.stimulus.kind === "deliver" &&
        step.definitionRef === publication.address.definitionRef &&
        step.stimulus.payload?.value === publication.payload.value
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
      steps(document).at(-1)!.target = { processInstanceId: "lexical-first" };
    },
    (document: Record<string, unknown>) => {
      steps(document).at(-1)!.workflowId = "caller-selected";
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

  const undeclared = clone(crossDefinition);
  ((steps(undeclared).at(-1) as { address: Record<string, unknown> }).address)
    .definitionRef = "message-key-correlation-undeclared";
  await assert.rejects(
    () => verifyEnginePopulationScenario(projectRoot, undeclared),
    /publication definition identity/u,
  );

  const sameSource = clone(crossDefinition);
  const definitions = sameSource.definitions as Array<{ bpmn: Record<string, unknown> }>;
  Object.assign(definitions[1]!.bpmn, {
    relativePath: (definitions[0]!.bpmn).relativePath,
    sha256: (definitions[0]!.bpmn).sha256,
  });
  await assert.rejects(
    () => verifyEnginePopulationScenario(projectRoot, sameSource),
    /definition (paths|source digests) contains duplicates/u,
  );
});

test("requires canonical unique command, definition, and Process-instance identities", async () => {
  const { scenarios } = await readEnginePopulationArtifacts(projectRoot);
  const exact = scenarios[0]?.document;
  assert.ok(exact !== undefined);

  const duplicateCommand = clone(exact);
  const starts = instanceSteps(duplicateCommand).filter((step) => stimulus(step).kind === "start");
  stimulus(starts[1]).commandId = stimulus(starts[0]).commandId;
  await assert.rejects(
    () => verifyEnginePopulationScenario(projectRoot, duplicateCommand),
    /command ids contains duplicates/u,
  );

  const duplicateRef = clone(exact);
  const definitions = duplicateRef.definitions as Array<Record<string, unknown>>;
  definitions.push({ ...definitions[0]! });
  await assert.rejects(
    () => verifyEnginePopulationScenario(projectRoot, duplicateRef),
    /definition refs contains duplicates/u,
  );

  const crossesInstance = clone(exact);
  const delivery = instanceSteps(crossesInstance).find((step) => stimulus(step).kind === "deliver");
  ((stimulus(delivery).occurrence) as Record<string, unknown>).processInstanceId = "OtherInstance";
  await assert.rejects(
    () => verifyEnginePopulationScenario(projectRoot, crossesInstance),
    /crosses Process-instance identity/u,
  );
});
