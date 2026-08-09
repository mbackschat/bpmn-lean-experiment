/**
 * Shared fixture construction and semantic projections for one Temporal
 * integration suite.
 *
 * Durable Event History assertions live in
 * [temporal-history-facts.ts](./temporal-history-facts.ts) so host observations
 * stay separate from admitted definitions and canonical semantic results.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import type { SourceOverlaySelection } from "@bpmn-lean/bpmn-source";
import {
  CanonicalObservationKind,
  CommandOutcome,
  ObservationRequestKind,
  ProcessStatus,
  ScenarioDocumentKind,
  ScenarioOutcomeKind,
  SemanticOperationKind,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type {
  CanonicalObservation,
  CompleteEffectStimulus,
  CompleteUserTaskInstanceStimulus,
  EffectDefinitionKey,
  Scenario,
  ScenarioResult,
  SemanticOperation,
  SemanticProcessProgram,
  StateObservation,
} from "@bpmn-lean/semantic-core";
import type {
  CompletedProcessReceipt,
} from "@bpmn-lean/temporal-adapter";

export const capsuleUrl = new URL(
  "../../../scenarios/user-task-discovery-completion/",
  import.meta.url,
);
export const scenarioUrls = [
  "scenario.json",
  "wrong-activation.scenario.json",
  "stale-completion.scenario.json",
].map((relativePath) => new URL(relativePath, capsuleUrl));
export const bpmnUrl = new URL("process.bpmn", capsuleUrl);
export const parallelBpmnUrl = new URL(
  "../../../scenarios/parallel-fork-join/process.bpmn",
  import.meta.url,
);
export const timerScenarioUrl = new URL(
  "../../../scenarios/intermediate-catch-timer/scenario.json",
  import.meta.url,
);
export const timerBpmnUrl = new URL(
  "../../../scenarios/intermediate-catch-timer/process.bpmn",
  import.meta.url,
);
export const boundaryDeadlineScenarioUrl = new URL(
  "../../../scenarios/activity-boundary-timer/deadline-wins.scenario.json",
  import.meta.url,
);
export const boundaryDeadlineBpmnUrl = new URL(
  "../../../scenarios/activity-boundary-timer/process.bpmn",
  import.meta.url,
);
export const scopeDeadlineScenarioUrl = new URL(
  "../../../scenarios/subprocess-boundary-timer/deadline-wins.scenario.json",
  import.meta.url,
);
export const scopeQuiescenceScenarioUrl = new URL(
  "../../../scenarios/subprocess-boundary-timer/scope-completes.scenario.json",
  import.meta.url,
);
export const scopeDeadlineBpmnUrl = new URL(
  "../../../scenarios/subprocess-boundary-timer/process.bpmn",
  import.meta.url,
);
export const monitoredDeadlineScenarioUrl = new URL(
  "../../../scenarios/non-interrupting-boundary-timer/deadline-then-both-branches.scenario.json",
  import.meta.url,
);
export const monitoredDeadlineBpmnUrl = new URL(
  "../../../scenarios/non-interrupting-boundary-timer/process.bpmn",
  import.meta.url,
);
export const timerUserTaskCompositionScenarioUrl = new URL(
  "../../../scenarios/timer-user-task-composition/scenario.json",
  import.meta.url,
);
export const timerUserTaskCompositionBpmnUrl = new URL(
  "../../../scenarios/timer-user-task-composition/process.bpmn",
  import.meta.url,
);
export const parallelSourceSha256 =
  "e68382dfa9125fbecd6f717578e5ec8bc59a4b33b62671d9794919ec8b52bcc6";
export const temporalCacheDirectory = fileURLToPath(
  new URL("../../../.cache/temporal-cli/", import.meta.url),
);

/** A positional read that fails as a harness error instead of `undefined`. */
export function requiredAt<Value>(
  values: ReadonlyArray<Value>,
  index: number,
  label: string,
): Value {
  const value = values[index];
  assert.ok(value !== undefined, `${label} has no entry at index ${index}`);
  return value;
}

/** One retained capsule scenario URL, addressed by its declared position. */
export function requiredScenarioUrl(index: number): URL {
  return requiredAt(scenarioUrls, index, "capsule scenarios");
}

/** One admitted definition and the answer-free scenario that drives it. */
export type TemporalExecutionInput = Readonly<{
  scenario: Scenario;
  semanticProcess: SemanticProcessProgram;
}>;

type SourceOverlayCompileInput = Readonly<{
  sourceBytes: Uint8Array;
  sourceOverlay: SourceOverlaySelection;
}>;

export function withDeadline<Value>(
  promise: Promise<Value>,
  timeoutMs: number,
  operation: string,
): Promise<Value> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${operation} exceeded ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

/**
 * Reads one retained capsule document.
 *
 * Scenario documents are tracked answer-free artifacts locked by the contract
 * gate, so the declared type is the current wire contract.
 */
export async function loadJson<Value>(url: URL): Promise<Value> {
  return JSON.parse(await readFile(url, "utf8")) as Value;
}

export async function loadExecutionInput(
  selectedScenarioUrl: URL,
): Promise<TemporalExecutionInput> {
  const scenario = await loadJson<Scenario>(selectedScenarioUrl);
  return compileExecutionInput(scenario, bpmnUrl);
}

export async function compileExecutionInput(
  scenario: Scenario,
  selectedBpmnUrl: URL,
  sourceOverlayInput?: SourceOverlayCompileInput,
): Promise<TemporalExecutionInput> {
  const sourceBytes = sourceOverlayInput === undefined
    ? await readFile(selectedBpmnUrl)
    : Uint8Array.from(sourceOverlayInput.sourceBytes);
  const compilation = await compileBpmnToSemanticProcess({
    bytes: sourceBytes,
    sourceId: scenario.bpmn.id,
    expectedSha256: scenario.bpmn.sha256,
    sourceOverlay: sourceOverlayInput?.sourceOverlay ?? null,
    semanticProfile: scenario.profile,
    limits: {
      maxBytes: 1024 * 1024,
      parserDeadlineMs: 1_000,
    },
  });
  assert.ok(
    compilation.status === BpmnCompilationStatus.Accepted,
    `${scenario.bpmn.id} was rejected: ${JSON.stringify(compilation.diagnostics)}`,
  );
  const selectedOverlayIdentity = sourceOverlayInput === undefined
    ? null
    : {
        id: sourceOverlayInput.sourceOverlay.id,
        sha256: sourceOverlayInput.sourceOverlay.sha256,
      };
  assert.deepEqual(
    compilation.checkedProcess.identity.sourceOverlay,
    selectedOverlayIdentity,
  );
  assert.deepEqual(
    compilation.semanticProcess.identity.sourceOverlay,
    selectedOverlayIdentity,
  );
  const compiledScenario = sourceOverlayInput === undefined
    ? scenario
    : {
        ...scenario,
        bpmn: {
          ...scenario.bpmn,
          sourceOverlay: compilation.semanticProcess.identity.sourceOverlay,
        },
      };
  return {
    scenario: compiledScenario,
    semanticProcess: compilation.semanticProcess,
  };
}

export function parallelScenario(
  firstElementId: string,
  secondElementId: string,
): Scenario {
  return {
    kind: ScenarioDocumentKind.Scenario,
    id: `parallel-fork-join-${firstElementId}-then-${secondElementId}`,
    profile: "parallel-fork-join-draft",
    bpmn: {
      id: "parallel-two-user-tasks-process",
      relativePath: "scenarios/parallel-fork-join/process.bpmn",
      sha256: parallelSourceSha256,
      sourceOverlay: null,
    },
    stimuli: [
      {
        kind: StimulusKind.StartProcess,
        commandId: "start-process",
        processId: "Process_ParallelForkJoin",
        instanceId: "Instance_1",
        initialVariables: [],
      },
      completionStimulus(firstElementId),
      completionStimulus(secondElementId),
    ],
    observations: [
      ObservationRequestKind.Deployment,
      ObservationRequestKind.CommandResults,
      ObservationRequestKind.ProcessStatus,
      ObservationRequestKind.ActiveWaits,
      ObservationRequestKind.OpenUserTasks,
      ObservationRequestKind.OpenTimers,
      ObservationRequestKind.OpenEffects,
      ObservationRequestKind.Variables,
      ObservationRequestKind.EnabledInteractions,
      ObservationRequestKind.LogicalTime,
    ],
    provenance: {
      normativeRefs: [
        "BPMN 2.0.2 §10.6.4",
        "BPMN 2.0.2 §13.4.1",
      ],
      cibRevision: "834a9874760de8a0107f7c1b32806e37f17fb017",
      cibRefs: [
        "engine/src/main/java/org/cibseven/bpm/engine/impl/bpmn/behavior/ParallelGatewayActivityBehavior.java",
      ],
    },
  };
}

export function completionStimulus(
  elementId: string,
): CompleteUserTaskInstanceStimulus {
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: `complete-${elementId}`,
    taskId: {
      processInstanceId: "Instance_1",
      elementId,
      activation: 1,
    },
    submittedValues: [],
  };
}

/**
 * The completed receipt an execution must have produced.
 *
 * A `null` receipt means the adapter terminated a still-running Workflow, which
 * is a harness failure for every case that reads final state.
 */
export function requireCompletedReceipt(
  receipt: CompletedProcessReceipt | null,
): CompletedProcessReceipt {
  assert.ok(receipt !== null, "the execution produced no completed receipt");
  return receipt;
}

/** The effect completion a fixture scenario carries at the given position. */
export function completeEffectStimulusAt(
  scenario: Scenario,
  index: number,
): CompleteEffectStimulus {
  const stimulus = scenario.stimuli[index];
  assert.ok(
    stimulus?.kind === StimulusKind.CompleteEffect,
    `stimulus ${index} does not complete an effect`,
  );
  return stimulus;
}

/** The single effect occurrence a bounded fixture program declares. */
export function effectOperation(
  semanticProcess: SemanticProcessProgram,
): Extract<
  SemanticOperation,
  { kind: SemanticOperationKind.AwaitEffect }
> {
  const operation = semanticProcess.operations.find(
    (candidate) => candidate.kind === SemanticOperationKind.AwaitEffect,
  );
  assert.ok(
    operation?.kind === SemanticOperationKind.AwaitEffect,
    "the program declares no effect occurrence",
  );
  return operation;
}

/** The definition key the adapter binds transport material to. */
export function effectDefinitionKey(
  semanticProcess: SemanticProcessProgram,
): EffectDefinitionKey {
  return {
    semanticProfile: semanticProcess.identity.semanticProfile,
    sourceId: semanticProcess.identity.sourceId,
    sourceSha256: semanticProcess.identity.sourceSha256,
    sourceOverlay: semanticProcess.identity.sourceOverlay,
    processId: semanticProcess.processId,
  };
}

export function stateObservations(
  result: ScenarioResult,
): ReadonlyArray<StateObservation> {
  return result.trace.filter(
    (observation): observation is StateObservation =>
      observation.kind === CanonicalObservationKind.State,
  );
}

/** The state observation a canonical trace must expose at one position. */
export function stateObservationAt(
  trace: ReadonlyArray<CanonicalObservation>,
  index: number,
): StateObservation {
  const observation = requiredAt(trace, index, "canonical trace");
  assert.ok(
    observation.kind === CanonicalObservationKind.State,
    `trace[${index}] is ${observation.kind}, not a state observation`,
  );
  return observation;
}

export function semanticPrefixThroughCompletion(
  result: ScenarioResult,
): ScenarioResult {
  const completedStateIndex = result.trace.findIndex(
    (observation) =>
      observation.kind === CanonicalObservationKind.State &&
      observation.status === ProcessStatus.Completed,
  );
  assert.notEqual(completedStateIndex, -1);
  return {
    outcome: {
      kind: ScenarioOutcomeKind.Semantic,
      outcome: CommandOutcome.Committed,
    },
    trace: result.trace.slice(0, completedStateIndex + 1),
  };
}

/** Command observations after the required first Process-start command. */
export function commandOrderAfterStart(
  result: ScenarioResult,
): ReadonlyArray<string> {
  const commandIds = result.trace.flatMap((observation) =>
    observation.kind === CanonicalObservationKind.Command
      ? [observation.commandId]
      : [],
  );
  assert.ok(commandIds.length > 0, "canonical trace has no start command");
  return commandIds.slice(1);
}
