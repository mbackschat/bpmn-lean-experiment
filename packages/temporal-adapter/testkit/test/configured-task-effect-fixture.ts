/** Exact source-to-effect fixture for the configured Task Temporal witness. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  BpmnCompilationStatus,
  CheckedNodeKind,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome,
  EffectOperation,
  EffectProtocol,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProfileId,
  StimulusKind,
  applyStimulus,
  initialState,
  projectEffectTransportMaterial,
  projectOpenEffects,
  projectOpenUserTasks,
  runScenario,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteEffectStimulus,
  CompleteUserTaskInstanceStimulus,
  RuntimeState,
  Scenario,
  ScenarioResult,
  SemanticProcessProgram,
  StartProcessStimulus,
} from "@bpmn-lean/semantic-core";
import {
  completeEffectStimulus,
  effectTransportKey,
} from "@bpmn-lean/temporal-testkit";
import type { EffectRequest } from "@bpmn-lean/temporal-testkit";

import { loadJson } from "./temporal-test-support.ts";

const scenarioUrl = new URL(
  "../../../../scenarios/configured-task/scenario.json",
  import.meta.url,
);
const bpmnUrl = new URL(
  "../../../../scenarios/configured-task/process.bpmn",
  import.meta.url,
);
const descriptor = Object.freeze({
  protocol: EffectProtocol.Activity,
  operation: EffectOperation.Probe,
});

export type ConfiguredTaskEffectFixture = Readonly<{
  scenario: Scenario;
  semanticProcess: SemanticProcessProgram;
  expected: ScenarioResult;
  start: StartProcessStimulus;
  effectCompletion: CompleteEffectStimulus;
  userCompletion: CompleteUserTaskInstanceStimulus;
  waitingState: RuntimeState;
  effectRequest: EffectRequest;
}>;

export async function loadConfiguredTaskEffectFixture(): Promise<
  ConfiguredTaskEffectFixture
> {
  const scenario = await loadJson<Scenario>(scenarioUrl);
  assert.equal(scenario.profile, SemanticProfileId.ConfiguredTask);
  const bytes = await readFile(bpmnUrl);
  const compilation = await compileBpmnToSemanticProcess({
    bytes,
    sourceId: scenario.bpmn.id,
    expectedSha256: scenario.bpmn.sha256,
    sourceOverlay: null,
    semanticProfile: scenario.profile,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  assert.equal(
    compilation.status,
    BpmnCompilationStatus.Accepted,
    compilation.status === BpmnCompilationStatus.Rejected
      ? JSON.stringify(compilation.diagnostics)
      : undefined,
  );
  if (compilation.status !== BpmnCompilationStatus.Accepted) {
    throw new TypeError("configured Task source was not admitted");
  }

  assert.deepEqual(
    compilation.checkedProcess.nodes.find(
      ({ kind }) => kind === CheckedNodeKind.ConfiguredTask,
    ),
    {
      kind: CheckedNodeKind.ConfiguredTask,
      id: "ConfiguredTask_Probe",
      descriptor,
    },
  );
  assert.deepEqual(
    compilation.semanticProcess.operations.find(
      ({ origin }) => origin.elementId === "ConfiguredTask_Probe",
    ),
    {
      id: "operation:ConfiguredTask_Probe",
      kind: SemanticOperationKind.AwaitEffect,
      origin: {
        kind: SemanticOriginKind.BpmnElement,
        elementId: "ConfiguredTask_Probe",
      },
      input: "place:Flow_StartToConfigured",
      output: "place:Flow_ConfiguredToUser",
      effect: {
        elementId: "ConfiguredTask_Probe",
        descriptor,
        inputMappings: [],
        outputMappings: [],
      },
      bpmnErrorRoute: null,
    },
  );

  const semanticProcess = compilation.semanticProcess;
  const start = requireStart(scenario);
  const effectCompletion = requireEffectCompletion(scenario);
  const userCompletion = requireUserCompletion(scenario);
  const started = applyStimulus(semanticProcess, initialState, start);
  assert.equal(started.outcome, CommandOutcome.Committed);
  assert.deepEqual(projectOpenUserTasks(started.state), []);
  const openEffects = projectOpenEffects(started.state);
  assert.equal(openEffects.length, 1);
  const openEffect = openEffects[0];
  assert.ok(openEffect !== undefined);
  assert.deepEqual(openEffect.id, effectCompletion.effectId);
  assert.deepEqual(openEffect.descriptor, descriptor);
  const material = projectEffectTransportMaterial(
    semanticProcess,
    openEffect,
  );

  return {
    scenario,
    semanticProcess,
    expected: runScenario(scenario, semanticProcess),
    start,
    effectCompletion,
    userCompletion,
    waitingState: started.state,
    effectRequest: {
      ...material.descriptor,
      idempotencyKey: effectTransportKey(material),
      arguments: material.arguments,
    },
  };
}

export function assertConfiguredEffectOccurrenceRefusal(
  fixture: ConfiguredTaskEffectFixture,
): void {
  for (const effectId of [
    { ...fixture.effectCompletion.effectId, activation: 2 },
    {
      ...fixture.effectCompletion.effectId,
      processInstanceId: `${fixture.start.instanceId}-wrong`,
    },
  ]) {
    const refused = applyStimulus(
      fixture.semanticProcess,
      fixture.waitingState,
      completeEffectStimulus(effectId, fixture.effectCompletion.result),
    );
    assert.equal(refused.outcome, CommandOutcome.Rejected);
    assert.deepEqual(refused.state, fixture.waitingState);
  }
}

function requireStart(scenario: Scenario): StartProcessStimulus {
  const start = scenario.stimuli[0];
  assert.equal(start?.kind, StimulusKind.StartProcess);
  if (start?.kind !== StimulusKind.StartProcess) {
    throw new TypeError("configured Task scenario has no manual start");
  }
  return start;
}

function requireEffectCompletion(scenario: Scenario): CompleteEffectStimulus {
  const completion = scenario.stimuli.find(
    (stimulus) => stimulus.kind === StimulusKind.CompleteEffect,
  );
  if (completion?.kind !== StimulusKind.CompleteEffect) {
    throw new TypeError("configured Task scenario has no effect completion");
  }
  return completion;
}

function requireUserCompletion(
  scenario: Scenario,
): CompleteUserTaskInstanceStimulus {
  const completion = scenario.stimuli.find(
    (stimulus) => stimulus.kind === StimulusKind.CompleteUserTaskInstance,
  );
  if (completion?.kind !== StimulusKind.CompleteUserTaskInstance) {
    throw new TypeError("configured Task scenario has no User Task completion");
  }
  return completion;
}
