import {
  CanonicalObservationKind,
  ScenarioStepKind,
  stimulusCommandId,
} from "@bpmn-lean/semantic-core";
import type {
  CanonicalObservation,
  CommandOutcome,
  DeepReadonly,
  ScenarioStep,
  SemanticProcessProgram,
  Stimulus,
} from "@bpmn-lean/semantic-core";

import {
  accumulateExecutionPublication,
  createExecutionPublicationState,
} from "./execution-publication-state.js";
import type {
  ExecutionPublicationState,
} from "./execution-publication-state.js";
import {
  accumulateFlowNodeOccurrencePublication,
  createFlowNodeOccurrencePublicationState,
} from "./flow-node-occurrence-publication-state.js";
import type {
  FlowNodeOccurrencePublicationState,
} from "./flow-node-occurrence-publication-state.js";

type CommandResultLedgerEntry = DeepReadonly<{
  commandId: string;
  outcome: CommandOutcome;
}>;

export type CommandPublicationState = DeepReadonly<{
  execution: ExecutionPublicationState;
  flowNodeOccurrences: FlowNodeOccurrencePublicationState;
  commandResults: CommandResultLedgerEntry[];
}>;

export function createCommandPublicationState(
  program: SemanticProcessProgram,
  processInstanceId: string,
): CommandPublicationState {
  return {
    execution: createExecutionPublicationState(program, processInstanceId),
    flowNodeOccurrences: createFlowNodeOccurrencePublicationState(
      program,
      processInstanceId,
    ),
    commandResults: [],
  };
}

/**
 * Derives both immutable publication successors before recording the command result.
 * The supplied deterministic Workflow clock is invoked once only for a publishable commit.
 */
export function integrateCommandPublication(
  program: SemanticProcessProgram,
  state: CommandPublicationState,
  stimulus: Stimulus,
  step: ScenarioStep,
  committedClock: () => number,
): CommandPublicationState {
  const commandId = stimulusCommandId(stimulus);
  const retainedOutcome = commandOutcome(state, commandId);
  if (retainedOutcome !== undefined) {
    const observedOutcome = commandOutcomeInObservations(
      step.observations,
      commandId,
    );
    if (
      observedOutcome !== undefined &&
      retainedOutcome !== observedOutcome
    ) {
      throw new TypeError(`Command ${commandId} produced conflicting outcomes`);
    }
    return state;
  }
  if (step.kind !== ScenarioStepKind.Committed) {
    return state;
  }
  if (
    step.publication === null ||
    step.flowNodeOccurrenceLifecycles === null
  ) {
    throw new TypeError(
      "committed semantic step has no complete command publication",
    );
  }
  preflightPublicationSuccessors(
    program,
    state,
    stimulus,
    step,
    state.flowNodeOccurrences.lastCommittedAtEpochMs ?? 0,
  );
  const committedAtEpochMs = committedClock();
  const executionCandidate = accumulateExecutionPublication(
    program,
    state.execution,
    stimulus,
    step,
  );
  const occurrenceCandidate = accumulateFlowNodeOccurrencePublication(
    program,
    state.flowNodeOccurrences,
    state.execution,
    executionCandidate,
    stimulus,
    step,
    committedAtEpochMs,
  );
  return {
    execution: executionCandidate,
    flowNodeOccurrences: occurrenceCandidate,
    commandResults: state.commandResults,
  };
}

function preflightPublicationSuccessors(
  program: SemanticProcessProgram,
  state: CommandPublicationState,
  stimulus: Stimulus,
  step: Extract<ScenarioStep, { kind: ScenarioStepKind.Committed }>,
  committedAtEpochMs: number,
): void {
  const execution = accumulateExecutionPublication(
    program,
    state.execution,
    stimulus,
    step,
  );
  accumulateFlowNodeOccurrencePublication(
    program,
    state.flowNodeOccurrences,
    state.execution,
    execution,
    stimulus,
    step,
    committedAtEpochMs,
  );
}

/** Records the semantic command result only after both publication candidates exist. */
export function recordCommandPublicationOutcome(
  state: CommandPublicationState,
  stimulus: Stimulus,
  observations: ReadonlyArray<CanonicalObservation>,
): CommandPublicationState {
  const commandId = stimulusCommandId(stimulus);
  const observedOutcome = commandOutcomeInObservations(observations, commandId);
  if (observedOutcome === undefined) {
    return state;
  }
  const retainedOutcome = commandOutcome(state, commandId);
  if (retainedOutcome !== undefined) {
    if (retainedOutcome !== observedOutcome) {
      throw new TypeError(`Command ${commandId} produced conflicting outcomes`);
    }
    return state;
  }
  return {
    execution: state.execution,
    flowNodeOccurrences: state.flowNodeOccurrences,
    commandResults: [
      ...state.commandResults,
      { commandId, outcome: observedOutcome },
    ],
  };
}

export function commandOutcome(
  state: CommandPublicationState,
  commandId: string,
): CommandOutcome | undefined {
  return state.commandResults.find((entry) =>
    entry.commandId === commandId)?.outcome;
}

function commandOutcomeInObservations(
  observations: ReadonlyArray<CanonicalObservation>,
  commandId: string,
): CommandOutcome | undefined {
  const observation = observations.find(
    (candidate) =>
      candidate.kind === CanonicalObservationKind.Command &&
      candidate.commandId === commandId,
  );
  return observation?.kind === CanonicalObservationKind.Command
    ? observation.outcome
    : undefined;
}
