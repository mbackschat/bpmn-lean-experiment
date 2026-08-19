/** First executable checkpoint for the reviewed Process-data plus standard-notation composition. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome,
  ScenarioOutcomeKind,
  SemanticProfileId,
  runScenario,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedProcess,
  Scenario,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";

const composedProfile =
  "cibseven-2.2.0-user-task-process-data-preserved-notation-draft";
const notationSource = new URL(
  "../../../scenarios/user-task-preserved-notation/process.bpmn",
  import.meta.url,
);
const executedOnlyTwin = new URL(
  "../../../scenarios/user-task-discovery-completion/process.bpmn",
  import.meta.url,
);
const scenario = JSON.parse(await readFile(new URL(
  "../../../scenarios/user-task-process-data-preserved-notation/scenario.json",
  import.meta.url,
), "utf8")) as Scenario;

async function compile(
  source: URL,
  sourceId: string,
  profile: string,
) {
  return compileBpmnToSemanticProcess({
    bytes: await readFile(source),
    sourceId,
    expectedSha256: undefined,
    semanticProfile: profile,
    sourceOverlay: null,
    limits: semanticProcessTestLimits,
  });
}

function normalizedCheckedSourceIdentity(checked: CheckedProcess): CheckedProcess {
  return {
    ...checked,
    identity: {
      ...checked.identity,
      sourceId: "normalized-source",
      sourceSha256: "0".repeat(64),
    },
  };
}

function normalizedProgramSourceIdentity(
  program: SemanticProcessProgram,
): SemanticProcessProgram {
  return {
    ...program,
    identity: {
      ...program.identity,
      sourceId: "normalized-source",
      sourceSha256: "0".repeat(64),
    },
  };
}

function bindScenarioToProgram(
  sourceScenario: Scenario,
  program: SemanticProcessProgram,
  relativePath: string,
): Scenario {
  return {
    ...sourceScenario,
    profile: program.identity.semanticProfile,
    bpmn: {
      ...sourceScenario.bpmn,
      id: program.identity.sourceId,
      relativePath,
      sha256: program.identity.sourceSha256,
      sourceOverlay: program.identity.sourceOverlay,
    },
  };
}

test("composes Process data with standard notation under one named profile", async () => {
  assert.equal(scenario.profile, composedProfile);
  const [notation, twin] = await Promise.all([
    compile(notationSource, scenario.bpmn.id, composedProfile),
    compile(executedOnlyTwin, "process-data-preserved-notation-twin", composedProfile),
  ]);
  assert.equal(
    notation.status,
    BpmnCompilationStatus.Accepted,
    JSON.stringify(notation.diagnostics),
  );
  assert.equal(twin.status, BpmnCompilationStatus.Accepted);
  assert.ok(notation.checkedProcess !== undefined);
  assert.ok(twin.checkedProcess !== undefined);
  assert.ok(notation.semanticProcess !== undefined);
  assert.ok(twin.semanticProcess !== undefined);

  assert.deepEqual(
    normalizedCheckedSourceIdentity(notation.checkedProcess),
    normalizedCheckedSourceIdentity(twin.checkedProcess),
  );
  assert.deepEqual(
    normalizedProgramSourceIdentity(notation.semanticProcess),
    normalizedProgramSourceIdentity(twin.semanticProcess),
  );

  const notationResult = runScenario(scenario, notation.semanticProcess);
  const twinResult = runScenario(
    bindScenarioToProgram(
      scenario,
      twin.semanticProcess,
      "scenarios/user-task-discovery-completion/process.bpmn",
    ),
    twin.semanticProcess,
  );
  assert.deepEqual(notationResult, twinResult);
  assert.deepEqual(notationResult.outcome, {
    kind: ScenarioOutcomeKind.Semantic,
    outcome: CommandOutcome.Committed,
  });
});

test("keeps both predecessor boundaries narrow", async () => {
  const [processDataWithNotation, preservedNotation] = await Promise.all([
    compile(
      notationSource,
      "process-data-with-notation-under-old-profile",
      SemanticProfileId.UserTask,
    ),
    compile(
      notationSource,
      "preserved-notation-with-process-data",
      SemanticProfileId.UserTaskPreservedNotation,
    ),
  ]);
  assert.equal(processDataWithNotation.status, BpmnCompilationStatus.Rejected);
  assert.ok(preservedNotation.semanticProcess !== undefined);

  const refused = runScenario(
    bindScenarioToProgram(
      scenario,
      preservedNotation.semanticProcess,
      "scenarios/user-task-preserved-notation/process.bpmn",
    ),
    preservedNotation.semanticProcess,
  );
  assert.deepEqual(refused.outcome, {
    kind: ScenarioOutcomeKind.Semantic,
    outcome: CommandOutcome.Unsupported,
  });
});
