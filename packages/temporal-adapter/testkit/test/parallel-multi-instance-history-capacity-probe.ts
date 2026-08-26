/** Private pre-registration probe over production semantic and publication serializers. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome,
  ScenarioStepKind,
  SemanticOperationKind,
  StimulusKind,
  VariableValueKind,
  advanceScenario,
  applyStimulus,
  initialState,
  utf8ByteLength,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  FireTimerStimulus,
  RuntimeState,
  ScenarioStep,
  SemanticProcessProgram,
  StartProcessStimulus,
  Stimulus,
} from "@bpmn-lean/semantic-core";
import { defaultPayloadConverter } from "@temporalio/workflow";

import {
  ParallelMultiInstanceCapacityTopology,
  accumulateExecutionPublication,
  accumulateFlowNodeOccurrencePublication,
  createExecutionPublicationState,
  createFlowNodeOccurrencePublicationState,
  requireParallelMultiInstanceHistoryCapacity,
  workflowChainHistoryEventEnvelopeBytes,
  type ExecutionPublicationState,
  type FlowNodeOccurrencePublicationState,
  type ParallelMultiInstanceHistoryMeasurement,
  type ParallelMultiInstanceTopologyMeasurement,
} from "@bpmn-lean/temporal-workflow";

const selectedMaximumItems = 16;
const maximumItemUtf8Bytes = 512;
const maximumCanonicalCollectionUtf8Bytes = 8_192;
const instanceId = "ParallelMultiInstance_Capacity";

type ProbeState = Readonly<{
  runtime: RuntimeState;
  execution: ExecutionPublicationState;
  occurrences: FlowNodeOccurrencePublicationState;
  maximumCommittedTransitions: number;
  maximumActivationEvents: number;
  maximumActivationPayloadBytes: number;
  maximumHistoryEnvelopeBytes: number;
  commandOrdinal: number;
}>;

export async function measureParallelMultiInstanceHistoryCapacity(): Promise<ParallelMultiInstanceHistoryMeasurement> {
  const program = await compileProgram();
  const collection = maximumCollection();
  const natural = measureTopology(
    program,
    ParallelMultiInstanceCapacityTopology.Natural,
    "all",
    (state) => completionStimuli(program, state.runtime, collection).reverse(),
  );
  const timer = measureTopology(
    program,
    ParallelMultiInstanceCapacityTopology.TimerInterruption,
    "all",
    (state) => [timerStimulus(state.runtime)],
  );
  const early = measureTopology(
    program,
    ParallelMultiInstanceCapacityTopology.EarlyCompletion,
    "first",
    (state) => [completionStimuli(program, state.runtime, collection).at(-1)!],
  );
  const base = emptyRuntime();
  const refused = applyStimulus(program, base, startStimulus(
    program,
    Array.from({ length: selectedMaximumItems + 1 }, () => "x"),
    "all",
    "start-over-capacity",
  ));
  const measurement: ParallelMultiInstanceHistoryMeasurement = {
    selectedMaximumItems,
    maximumItemUtf8Bytes,
    maximumCanonicalCollectionUtf8Bytes,
    canonicalMaximumCollectionBytes: utf8ByteLength(JSON.stringify(collection)),
    exactLimitAdmitted: natural.itemCount === selectedMaximumItems,
    limitPlusOneRefusedWithoutMutation:
      refused.outcome === CommandOutcome.Rejected && sameJson(refused.state, base),
    topologies: [natural, timer, early],
  };
  requireParallelMultiInstanceHistoryCapacity(measurement);
  return measurement;
}

function measureTopology(
  program: SemanticProcessProgram,
  topology: ParallelMultiInstanceCapacityTopology,
  policy: "all" | "first",
  remainingStimuli: (state: ProbeState) => readonly Stimulus[],
): ParallelMultiInstanceTopologyMeasurement {
  const collection = maximumCollection();
  let state = applyMeasured(
    program,
    initialProbeState(program),
    startStimulus(program, collection, policy, `start-${topology}`),
  );
  for (const stimulus of remainingStimuli(state)) {
    state = applyMeasured(program, state, stimulus);
  }
  return {
    topology,
    itemCount: collection.length,
    maximumCommittedTransitions: state.maximumCommittedTransitions,
    maximumActivationEvents: state.maximumActivationEvents,
    maximumActivationPayloadBytes: state.maximumActivationPayloadBytes,
    maximumHistoryEnvelopeBytes: state.maximumHistoryEnvelopeBytes,
  };
}

function applyMeasured(
  program: SemanticProcessProgram,
  before: ProbeState,
  stimulus: Stimulus,
): ProbeState {
  const step = advanceScenario(program, before.runtime, stimulus);
  assert.equal(step.kind, ScenarioStepKind.Committed, stimulus.commandId);
  if (step.kind !== ScenarioStepKind.Committed) {
    throw new TypeError("parallel capacity topology did not commit");
  }
  const execution = accumulateExecutionPublication(
    program,
    before.execution,
    stimulus,
    step,
  );
  const occurrences = accumulateFlowNodeOccurrencePublication(
    program,
    before.occurrences,
    before.execution,
    execution,
    stimulus,
    step,
    before.commandOrdinal + 1,
  );
  const transitionCount = step.publication?.transitions.length ?? 0;
  const activationEvents = transitionCount + 8;
  const activationPayloadBytes = serializedPayloadBytes({
    stimulus,
    state: step.state,
    execution: execution.batches.at(-1),
    occurrences: occurrences.batches.at(-1),
    currentExecution: execution.current,
    currentOpen: occurrences.currentOpen,
  });
  const historyEnvelopeBytes = activationPayloadBytes +
    activationEvents * workflowChainHistoryEventEnvelopeBytes;
  return {
    runtime: step.state,
    execution,
    occurrences,
    maximumCommittedTransitions: Math.max(
      before.maximumCommittedTransitions,
      transitionCount,
    ),
    maximumActivationEvents: Math.max(
      before.maximumActivationEvents,
      activationEvents,
    ),
    maximumActivationPayloadBytes: Math.max(
      before.maximumActivationPayloadBytes,
      activationPayloadBytes,
    ),
    maximumHistoryEnvelopeBytes: Math.max(
      before.maximumHistoryEnvelopeBytes,
      historyEnvelopeBytes,
    ),
    commandOrdinal: before.commandOrdinal + 1,
  };
}

function initialProbeState(program: SemanticProcessProgram): ProbeState {
  return {
    runtime: emptyRuntime(),
    execution: createExecutionPublicationState(program, instanceId),
    occurrences: createFlowNodeOccurrencePublicationState(program, instanceId),
    maximumCommittedTransitions: 0,
    maximumActivationEvents: 0,
    maximumActivationPayloadBytes: 0,
    maximumHistoryEnvelopeBytes: 0,
    commandOrdinal: 0,
  };
}

function emptyRuntime(): RuntimeState {
  return { ...initialState, parallelMultiInstanceControllers: [] };
}

function startStimulus(
  program: SemanticProcessProgram,
  collection: readonly string[],
  policy: "all" | "first",
  commandId: string,
): StartProcessStimulus {
  const operation = requireParallelOperation(program);
  return {
    kind: StimulusKind.StartProcess,
    commandId,
    processId: program.processId,
    instanceId,
    initialVariables: [{
      name: operation.data.input.dataObjectReferenceId,
      value: { kind: VariableValueKind.StringList, value: [...collection] },
    }, {
      name: "completionPolicy",
      value: { kind: VariableValueKind.String, value: policy },
    }],
  };
}

function completionStimuli(
  program: SemanticProcessProgram,
  state: RuntimeState,
  results: readonly string[],
): CompleteUserTaskInstanceStimulus[] {
  const operation = requireParallelOperation(program);
  assert.equal(state.userTaskWaits.length, results.length);
  return state.userTaskWaits.map((wait, index) => ({
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: `complete-capacity-${String(index)}`,
    taskId: wait.id,
    submittedValues: [{
      name: operation.data.output.taskDataOutputId,
      value: { kind: VariableValueKind.String, value: results[index]! },
    }],
  }));
}

function timerStimulus(state: RuntimeState): FireTimerStimulus {
  const timer = state.timerWaits[0];
  assert.equal(state.timerWaits.length, 1);
  assert.ok(timer !== undefined);
  return {
    kind: StimulusKind.FireTimer,
    commandId: "fire-capacity-boundary",
    timerId: timer.id,
    logicalTimeMs: timer.deadlineMs,
  };
}

function requireParallelOperation(program: SemanticProcessProgram) {
  const operation = program.operations.find(({ kind }) =>
    kind === SemanticOperationKind.AwaitParallelMultiInstanceUserTask
  );
  assert.ok(operation?.kind === SemanticOperationKind.AwaitParallelMultiInstanceUserTask);
  return operation;
}

function maximumCollection(): string[] {
  return [
    "x".repeat(512),
    ...Array.from({ length: 14 }, () => "x".repeat(509)),
    "x".repeat(505),
  ];
}

function serializedPayloadBytes(value: unknown): number {
  const payload = defaultPayloadConverter.toPayload(value);
  return payload.data?.byteLength ?? 0;
}

async function compileProgram(): Promise<SemanticProcessProgram> {
  const sequential = await readFile(new URL(
    "../../../bpmn-source/test/fixtures/sequential-multi-instance-user-task.bpmn",
    import.meta.url,
  ), "utf8");
  const parallel = sequential
    .replace("Definitions_SequentialMultiInstanceReview", "Definitions_ParallelMultiInstanceReview")
    .replace(
      "https://bpmn-lean.org/scenarios/sequential-multi-instance-review",
      "https://bpmn-lean.org/scenarios/parallel-multi-instance-review",
    )
    .replace(
      'targetNamespace="https://bpmn-lean.org/scenarios/parallel-multi-instance-review">',
      [
        'targetNamespace="https://bpmn-lean.org/scenarios/parallel-multi-instance-review"',
        '  expressionLanguage="urn:bpmn-lean:expression:simple-boolean:v1">',
      ].join("\n"),
    )
    .replace("Process_SequentialMultiInstanceReview", "Process_ParallelMultiInstanceReview")
    .replace('isSequential="true"', 'isSequential="false"')
    .replace(
      "      </bpmn:multiInstanceLoopCharacteristics>",
      [
        '        <bpmn:completionCondition xsi:type="bpmn:tFormalExpression">stringEquals(completionPolicy,"first")</bpmn:completionCondition>',
        "      </bpmn:multiInstanceLoopCharacteristics>",
      ].join("\n"),
    );
  const compilation = await compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(parallel),
    sourceId: "parallel-multi-instance-capacity-probe",
    expectedSha256: undefined,
    sourceOverlay: null,
    semanticProfile: "bpmn-2.0.2-parallel-multi-instance-user-task-draft",
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  assert.equal(compilation.status, BpmnCompilationStatus.Accepted);
  if (compilation.status !== BpmnCompilationStatus.Accepted) {
    throw new TypeError("parallel Multi-Instance capacity source was rejected");
  }
  return compilation.semanticProcess;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
