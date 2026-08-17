/** Test-owned Workflow that stringifies Boolean completion data before core application. */
import {
  CanonicalObservationKind,
  CommandOutcome,
  ProcessStatus,
  ScenarioStepKind,
  StimulusKind,
  VariableValueKind,
  advanceScenario,
  deployProcess,
  initialState,
  isWellFormedStimulus,
  projectOpenUserTasks,
} from "@bpmn-lean/semantic-core";
import type {
  CanonicalObservation,
  CompleteUserTaskInstanceStimulus,
  SemanticProcessProgram,
  StartProcessStimulus,
  StateObservation,
} from "@bpmn-lean/semantic-core";
import {
  allHandlersFinished,
  condition,
  setHandler,
} from "@temporalio/workflow";

import type {
  CompletedProcessReceipt,
} from "@bpmn-lean/temporal-protocol";
import {
  processTerminalReceiptFormatV1,
} from "@bpmn-lean/temporal-protocol";
import {
  bpmnCompleteUserTaskUpdate,
  bpmnOpenUserTasksQuery,
  bpmnTraceQuery,
} from "@bpmn-lean/temporal-workflow";

/**
 * Retained defect: the durable Update accepts the original tagged Boolean, but the Workflow
 * converts that value to a tagged string immediately before the semantic core sees it.
 */
export async function runBpmnProcessBooleanStringificationMutation(
  start: StartProcessStimulus,
  semanticProcess: SemanticProcessProgram,
): Promise<CompletedProcessReceipt> {
  const deployment = deployProcess(start, semanticProcess);
  if (deployment.outcome !== CommandOutcome.Committed) {
    throw new TypeError("Boolean stringification requires an admitted Process");
  }
  const started = advanceScenario(semanticProcess, initialState, start);
  if (started.kind !== ScenarioStepKind.Committed) {
    throw new TypeError("Boolean stringification requires a committed start");
  }

  let state = started.state;
  const trace: CanonicalObservation[] = [
    deployment.observation,
    ...started.observations,
  ];
  let receipt: CompletedProcessReceipt | undefined;

  setHandler(bpmnTraceQuery, () => [...trace]);
  setHandler(bpmnOpenUserTasksQuery, () => projectOpenUserTasks(state));
  setHandler(
    bpmnCompleteUserTaskUpdate,
    async (stimulus) => {
      requireBooleanCompletion(stimulus);
      const coreStep = advanceScenario(
        semanticProcess,
        state,
        stringifyBooleanValues(stimulus),
      );
      if (coreStep.kind !== ScenarioStepKind.Committed) {
        throw new TypeError(
          "Boolean stringification requires one committed completion",
        );
      }
      state = coreStep.state;
      trace.push(...coreStep.observations);
      const finalState = requireFinalState(coreStep.observations);
      receipt = {
        format: processTerminalReceiptFormatV1,
        definition: semanticProcess.identity,
        processId: semanticProcess.processId,
        processInstanceId: start.instanceId,
        finalState,
      };
      return CommandOutcome.Committed;
    },
    { validator: requireBooleanCompletion },
  );

  await condition(() => receipt !== undefined);
  await condition(allHandlersFinished);
  if (receipt === undefined) {
    throw new TypeError("Boolean stringification lost its terminal receipt");
  }
  return receipt;
}

function requireBooleanCompletion(
  stimulus: CompleteUserTaskInstanceStimulus,
): void {
  const value = stimulus as unknown;
  if (
    !isWellFormedStimulus(value) ||
    value.kind !== StimulusKind.CompleteUserTaskInstance ||
    !value.submittedValues.some(
      (binding) => binding.value.kind === VariableValueKind.Boolean,
    )
  ) {
    throw new TypeError(
      "Boolean stringification requires one well-formed Boolean completion",
    );
  }
}

function stringifyBooleanValues(
  stimulus: CompleteUserTaskInstanceStimulus,
): CompleteUserTaskInstanceStimulus {
  return {
    ...stimulus,
    submittedValues: stimulus.submittedValues.map((binding) => {
      switch (binding.value.kind) {
        case VariableValueKind.Boolean:
          return {
            name: binding.name,
            value: {
              kind: VariableValueKind.String,
              value: String(binding.value.value),
            },
          };
        case VariableValueKind.String:
        case VariableValueKind.Integer:
        case VariableValueKind.StringList:
        case VariableValueKind.Null:
          return binding;
        default:
          return assertNever(binding.value);
      }
    }),
  };
}

function requireFinalState(
  observations: ReadonlyArray<CanonicalObservation>,
): StateObservation & { status: ProcessStatus.Completed } {
  const finalState = observations.find(
    (
      observation,
    ): observation is StateObservation & { status: ProcessStatus.Completed } =>
      observation.kind === CanonicalObservationKind.State &&
      observation.status === ProcessStatus.Completed,
  );
  if (finalState === undefined) {
    throw new TypeError("Boolean stringification has no completed core state");
  }
  return finalState;
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported Boolean value: ${JSON.stringify(value)}`);
}
