/**
 * The registered parallel Multi-Instance scenario, read and re-derived per schedule.
 *
 * One registered model backs several production schedules, so each schedule needs its own instance
 * identity, collection, completion policy, and content-bound command identities while keeping the
 * retained scenario's exact stimulus shapes. Deriving them here keeps the witness about Temporal
 * behaviour and keeps every derivation checked against the retained scenario rather than restated.
 */
import assert from "node:assert/strict";

import {
  SemanticOperationKind,
  StimulusKind,
  VariableValueKind,
  runScenario,
} from "@bpmn-lean/semantic-core";
import type {
  CanonicalObservation,
  CompleteUserTaskInstanceStimulus,
  FireTimerStimulus,
  Scenario,
  SemanticProcessProgram,
  StartProcessStimulus,
} from "@bpmn-lean/semantic-core";
import { timerFiringCommandId } from "@bpmn-lean/temporal-testkit";

/** The one parallel Multi-Instance entry operation this witness drives. */
export type ParallelOperation = ReturnType<typeof requireParallelOperation>;

export function expectedInterruptedTrace(
  source: Scenario, program: SemanticProcessProgram,
  escalation: CompleteUserTaskInstanceStimulus,
): ReadonlyArray<CanonicalObservation> {
  const rejected = runScenario(source, program);
  const completed = runScenario({
    ...source, stimuli: [...source.stimuli.slice(0, -1), escalation],
  }, program);
  assert.deepEqual(rejected.trace.slice(0, -2), completed.trace.slice(0, -2));
  assert.deepEqual(rejected.trace.at(-1), completed.trace.at(-3));
  return [...rejected.trace, ...completed.trace.slice(-2)];
}

export function derivedStart(
  source: StartProcessStimulus, operation: ParallelOperation,
  instanceId: string, commandId: string, items: readonly string[],
  policy: "all" | "first",
): StartProcessStimulus {
  return {
    ...source, commandId, instanceId,
    initialVariables: [{
      name: operation.data.input.dataObjectReferenceId,
      value: { kind: VariableValueKind.StringList, value: [...items] },
    }, {
      name: "completionPolicy",
      value: { kind: VariableValueKind.String, value: policy },
    }],
  };
}

export function derivedCompletion(
  source: CompleteUserTaskInstanceStimulus, processInstanceId: string,
  commandId: string, activation: number, result: string,
): CompleteUserTaskInstanceStimulus {
  return {
    ...source, commandId,
    taskId: { ...source.taskId, processInstanceId, activation },
    submittedValues: [{
      name: source.submittedValues[0]?.name ?? "DataOutput_CurrentResult",
      value: { kind: VariableValueKind.String, value: result },
    }],
  };
}

export function derivedTimer(
  source: FireTimerStimulus, processInstanceId: string,
): FireTimerStimulus {
  const timerId = { ...source.timerId, processInstanceId };
  return {
    ...source,
    commandId: timerFiringCommandId(timerId, source.logicalTimeMs),
    timerId,
  };
}

export function escalationCompletion(
  processInstanceId: string, commandId: string,
): CompleteUserTaskInstanceStimulus {
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId,
    taskId: { processInstanceId, elementId: "UserTask_Escalation", activation: 1 },
    submittedValues: [],
  };
}

export function requireStart(scenario: Scenario): StartProcessStimulus {
  const stimulus = scenario.stimuli[0];
  if (stimulus?.kind !== StimulusKind.StartProcess) {
    throw new TypeError("PMI scenario has no Process start");
  }
  return stimulus;
}

export function requireCompletion(
  scenario: Scenario, index: number,
): CompleteUserTaskInstanceStimulus {
  const stimulus = scenario.stimuli[index];
  if (stimulus?.kind !== StimulusKind.CompleteUserTaskInstance) {
    throw new TypeError(`PMI scenario has no completion ${String(index)}`);
  }
  return stimulus;
}

export function requireTimer(scenario: Scenario): FireTimerStimulus {
  const stimulus = scenario.stimuli[2];
  if (stimulus?.kind !== StimulusKind.FireTimer) {
    throw new TypeError("PMI interrupted scenario has no Timer firing");
  }
  return stimulus;
}

export function requireParallelOperation(program: SemanticProcessProgram) {
  const operation = program.operations.find(({ kind }) =>
    kind === SemanticOperationKind.AwaitParallelMultiInstanceUserTask
  );
  if (operation?.kind !== SemanticOperationKind.AwaitParallelMultiInstanceUserTask) {
    throw new TypeError("PMI program has no parallel Multi-Instance operation");
  }
  return operation;
}
