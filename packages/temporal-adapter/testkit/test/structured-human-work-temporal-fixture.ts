/** Exact retained source and command fixtures for structured Human Work hosting. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  SemanticProfileId,
  StimulusKind,
  VariableValueKind,
  runScenario,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  Scenario,
  ScenarioResult,
  SemanticProcessProgram,
  StartProcessStimulus,
} from "@bpmn-lean/semantic-core";

import { loadJson } from "./temporal-test-support.ts";

const scenarioUrl = new URL(
  "../../../../scenarios/expense-exception-review/approve.scenario.json",
  import.meta.url,
);
const bpmnUrl = new URL(
  "../../../../scenarios/expense-exception-review/process.bpmn",
  import.meta.url,
);

export type StructuredHumanWorkTemporalFixture = Readonly<{
  scenario: Scenario;
  semanticProcess: SemanticProcessProgram;
  start: StartProcessStimulus;
  completion: CompleteUserTaskInstanceStimulus;
  reorderedCompletion: CompleteUserTaskInstanceStimulus;
  expected: ScenarioResult;
}>;

export async function loadStructuredHumanWorkTemporalFixture(): Promise<
  StructuredHumanWorkTemporalFixture
> {
  const scenario = await loadJson<Scenario>(scenarioUrl);
  assert.equal(scenario.profile, SemanticProfileId.StructuredHumanWork);
  assert.equal(
    scenario.bpmn.relativePath,
    "scenarios/expense-exception-review/process.bpmn",
  );
  const compilation = await compileBpmnToSemanticProcess({
    bytes: await readFile(bpmnUrl),
    sourceId: scenario.bpmn.id,
    expectedSha256: scenario.bpmn.sha256,
    sourceOverlay: null,
    semanticProfile: scenario.profile,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  assert.equal(compilation.status, BpmnCompilationStatus.Accepted);
  if (compilation.status !== BpmnCompilationStatus.Accepted) {
    throw new TypeError("structured Human Work fixture was not admitted");
  }
  const [start, completion] = scenario.stimuli;
  assert.equal(start?.kind, StimulusKind.StartProcess);
  assert.equal(completion?.kind, StimulusKind.CompleteUserTaskInstance);
  if (
    start?.kind !== StimulusKind.StartProcess ||
    completion?.kind !== StimulusKind.CompleteUserTaskInstance
  ) {
    throw new TypeError("structured Human Work scenario has an unexpected schedule");
  }
  const riskFlags = completion.submittedValues.find(
    ({ name }) => name === "riskFlags",
  );
  assert.deepEqual(riskFlags, {
    name: "riskFlags",
    value: {
      kind: VariableValueKind.StringList,
      value: ["policy", "receipt", "policy"],
    },
  });
  const reorderedCompletion: CompleteUserTaskInstanceStimulus = {
    ...completion,
    submittedValues: completion.submittedValues.map((binding) =>
      binding.name === "riskFlags"
        ? {
            name: binding.name,
            value: {
              kind: VariableValueKind.StringList,
              value: ["receipt", "policy", "policy"],
            },
          }
        : binding
    ),
  };
  return {
    scenario,
    semanticProcess: compilation.semanticProcess,
    start,
    completion,
    reorderedCompletion,
    expected: runScenario(scenario, compilation.semanticProcess),
  };
}
