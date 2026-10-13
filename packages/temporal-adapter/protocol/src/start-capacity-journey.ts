/**
 * The successful serial business journey of the portable handoff, run through the real semantic core with every
 * permitted future output at its full per-value allowance.
 *
 * It exists only to hand the capacity envelope genuine semantic-core artifacts (committed states, stimuli,
 * publications, observations) instead of a second model of their shape. See the
 * [capacity admission](../../../../docs/capsules/PORTABLE-BUSINESS-VALUES-PROPOSAL.md#capacity-admission) rule.
 */
import {
  ScenarioStepKind,
  SemanticOperationKind,
  StimulusKind,
  VariableValueKind,
  advanceScenario,
  canonicalValueUtf8ByteLength,
  initialState,
  isSingletonBusinessItem,
  maximumCanonicalValueBytes,
} from "@bpmn-lean/semantic-core";
import type {
  BusinessValue,
  CompleteUserTaskInstanceStimulus,
  DeepReadonly,
  ProcessStartStimulus,
  RuntimeState,
  ScenarioStep,
  SemanticProcessProgram,
  Stimulus,
} from "@bpmn-lean/semantic-core";

/**
 * Length reserved for each future command ID. Command IDs are caller-chosen and unbounded by the wire contract, so
 * the envelope can reserve a realistic identifier but cannot bound a longer one; that later case keeps the existing
 * typed host capacity failure.
 */
export const reservedFutureCommandIdBytes = 256;

/** The String bound of every portable text; an inexact guess is rejected by the admission check that follows it. */
const textBound = 1024;

export type StartCapacityJourneyStep = DeepReadonly<{
  stimulus: Stimulus;
  committed: Extract<ScenarioStep, { kind: ScenarioStepKind.Committed }>;
}>;

/** Start, then the two User Task completions, each committed to its stable state. */
export type StartCapacityJourney = DeepReadonly<{
  steps: [StartCapacityJourneyStep, StartCapacityJourneyStep, StartCapacityJourneyStep];
}>;

/**
 * Runs Start and both completions, each completion submitting a sentinel of exactly the per-value canonical-byte
 * allowance under the output name the Program declares for the task the committed state is waiting on.
 *
 * Throws when the Program does not offer that journey. The caller has already admitted `start` against `program`,
 * so an unreachable step is a broken profile invariant, not a business refusal.
 */
export function runStartCapacityJourney(
  start: ProcessStartStimulus,
  program: SemanticProcessProgram,
): StartCapacityJourney {
  const sentinel = fullAllowanceValue();
  const first = commit(program, initialState, start);
  const second = commit(program, first.committed.state, completionFor(program, first.committed.state, 1, sentinel));
  const third = commit(program, second.committed.state, completionFor(program, second.committed.state, 2, sentinel));
  return { steps: [first, second, third] };
}

function commit(
  program: SemanticProcessProgram,
  state: RuntimeState,
  stimulus: Stimulus,
): StartCapacityJourneyStep {
  const step = advanceScenario(program, state, stimulus);
  if (step.kind !== ScenarioStepKind.Committed) {
    throw new TypeError("The portable handoff capacity journey did not commit");
  }
  return { stimulus, committed: step };
}

function completionFor(
  program: SemanticProcessProgram,
  state: RuntimeState,
  ordinal: number,
  value: BusinessValue,
): CompleteUserTaskInstanceStimulus {
  const [wait, ...others] = state.userTaskWaits;
  const operation = wait === undefined
    ? undefined
    : program.operations.find((candidate) =>
      candidate.kind === SemanticOperationKind.AwaitDataInputOutputUserTask &&
      candidate.task.elementId === wait.id.elementId
    );
  if (
    wait === undefined || others.length > 0 ||
    operation?.kind !== SemanticOperationKind.AwaitDataInputOutputUserTask
  ) {
    throw new TypeError("The portable handoff capacity journey lost its single open User Task");
  }
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: `${"c".repeat(reservedFutureCommandIdBytes - 1)}${ordinal}`,
    taskId: wait.id,
    submittedValues: [{ name: operation.directOutput.sourceDataOutputId, value }],
  };
}

/**
 * A Map of ASCII Strings whose canonical JSON is exactly the per-value allowance. Fewest entries wins, each String
 * at most its own byte bound, so every portable limit holds together; the final admission check is the single
 * oracle for that, not a restated list of limits.
 */
export function fullAllowanceValue(): BusinessValue {
  const entryText = (lengths: ReadonlyArray<number>): BusinessValue => ({
    kind: VariableValueKind.Map,
    value: lengths.map((length, index) => ({
      name: `k${String(index).padStart(2, "0")}`,
      value: { kind: VariableValueKind.String, value: "a".repeat(length) },
    })),
  });
  for (let entries = 1; entries <= 99; entries += 1) {
    const room = maximumCanonicalValueBytes -
      canonicalValueUtf8ByteLength(entryText(Array.from({ length: entries }, () => 0)));
    if (room < 0) break;
    if (room > entries * textBound) continue;
    const lengths = Array.from({ length: entries }, (_, index) =>
      Math.min(textBound, Math.max(0, room - index * textBound)));
    const value = entryText(lengths);
    if (canonicalValueUtf8ByteLength(value) === maximumCanonicalValueBytes && isSingletonBusinessItem(value)) {
      return value;
    }
  }
  throw new TypeError("No admitted value fills the per-value canonical-byte allowance");
}
