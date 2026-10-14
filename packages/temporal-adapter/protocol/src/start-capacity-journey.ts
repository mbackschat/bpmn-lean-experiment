/**
 * The successful serial business journey of a capacity-enveloped profile, run through the real semantic core with
 * every permitted future output at its full per-value allowance.
 *
 * It exists only to hand the capacity envelope genuine semantic-core artifacts (committed states, stimuli,
 * publications, observations) instead of a second model of their shape. The portable handoff completes User Tasks;
 * the effect-data profile completes Service Task effects whose handler result is external but reserved here. See
 * the [capacity admission](../../../../docs/capsules/PORTABLE-BUSINESS-VALUES-PROPOSAL.md#capacity-admission) rule
 * and its effect-data counterpart `PBV-EFF-05`.
 */
import {
  EffectExecutionResultKind,
  MappingExpressionKind,
  ScenarioStepKind,
  StimulusKind,
  VariableValueKind,
  advanceScenario,
  canonicalValueUtf8ByteLength,
  compareCanonicalStrings,
  initialState,
  isSingletonBusinessItem,
  maximumCanonicalValueBytes,
  projectEffectTransportMaterial,
  projectOpenEffects,
  SemanticOperationKind,
} from "@bpmn-lean/semantic-core";
import type {
  BusinessValue,
  CompleteUserTaskInstanceStimulus,
  DeepReadonly,
  EffectExecutionResult,
  ProcessStartStimulus,
  RuntimeState,
  ScenarioStep,
  SemanticProcessProgram,
  Stimulus,
  VariableMapping,
} from "@bpmn-lean/semantic-core";

import type { EffectRequest } from "./effect-contract.js";
import { completeEffectStimulus, effectTransportKey } from "./effect-transport.js";

/**
 * Length reserved for each future command ID. Command IDs are caller-chosen and unbounded by the wire contract, so
 * the envelope can reserve a realistic identifier but cannot bound a longer one; that later case keeps the existing
 * typed host capacity failure. A `CompleteEffect` command ID is content-bound by the host, so it needs no reservation.
 */
export const reservedFutureCommandIdBytes = 256;

/** The String bound of every portable text; an inexact guess is rejected by the admission check that follows it. */
const textBound = 1024;

/** The exact Activity exchange the Workflow host performs before it submits a `CompleteEffect`. */
export type StartCapacityEffectExchange = DeepReadonly<{
  elementId: string;
  request: EffectRequest;
  result: EffectExecutionResult;
}>;

export type StartCapacityJourneyStep = DeepReadonly<{
  stimulus: Stimulus;
  committed: Extract<ScenarioStep, { kind: ScenarioStepKind.Committed }>;
  /** The Activity exchange whose result this step's `CompleteEffect` carries; `null` for Start and User Tasks. */
  effect: StartCapacityEffectExchange | null;
}>;

/** Start, then one completion per serial wait, each committed to its stable state; the last step is terminal. */
export type StartCapacityJourney = DeepReadonly<{
  steps: [StartCapacityJourneyStep, ...StartCapacityJourneyStep[]];
}>;

/**
 * Runs Start and then completes the single open wait until the Process leaves the running state. A User Task
 * completion submits the sentinel under the output the Program declares for it; an effect completion returns the
 * sentinel for every local its output parameters read, as the handler of PBV-EFF-02 must.
 *
 * Throws when the Program does not offer that journey. The caller has already admitted `start` against `program`,
 * and both profiles admit only serial chains, so an unreachable step, a parallel wait or a cycle is a broken
 * profile invariant, not a business refusal. The step bound is that invariant's guard, not a business limit.
 */
export function runStartCapacityJourney(
  start: ProcessStartStimulus,
  program: SemanticProcessProgram,
): StartCapacityJourney {
  const sentinel = fullAllowanceValue();
  const first = commit(program, initialState, start, null);
  const steps: [StartCapacityJourneyStep, ...StartCapacityJourneyStep[]] = [first];
  for (let state = first.committed.state; state.control.kind === "running"; state = steps[steps.length - 1]!.committed.state) {
    if (steps.length > program.operations.length) {
      throw new TypeError("The capacity journey did not terminate within its serial chain");
    }
    const effect = projectOpenEffects(state);
    const next = state.userTaskWaits.length === 1 && effect.length === 0
      ? { stimulus: completionFor(program, state, steps.length, sentinel), effect: null }
      : effectCompletionFor(program, state, effect, sentinel);
    steps.push(commit(program, state, next.stimulus, next.effect));
  }
  return { steps };
}

/**
 * The success result a conforming handler returns at full allowance: every local the task's output parameters read,
 * once, in canonical name order, bound to `value`. A task with no output parameters reserves the empty patch.
 */
export function reservedEffectResult(
  outputMappings: ReadonlyArray<DeepReadonly<VariableMapping>>,
  value: BusinessValue,
): EffectExecutionResult {
  const locals = [...new Set(outputMappings.flatMap(({ expression }) =>
    expression.kind === MappingExpressionKind.LocalVariable ? [expression.name] : []))].sort(compareCanonicalStrings);
  return {
    kind: EffectExecutionResultKind.Success,
    localPatch: locals.map((name) => ({ name, value })),
  };
}

/** The output parameters of every Service Task effect the Program can arm, for checks that need no journey. */
export function effectOutputMappings(
  program: SemanticProcessProgram,
): ReadonlyArray<DeepReadonly<{ elementId: string; outputMappings: VariableMapping[] }>> {
  return program.operations.flatMap((operation) =>
    operation.kind === SemanticOperationKind.AwaitEffect
      ? [{ elementId: operation.effect.elementId, outputMappings: operation.effect.outputMappings }]
      : []);
}

function commit(
  program: SemanticProcessProgram,
  state: RuntimeState,
  stimulus: Stimulus,
  effect: StartCapacityEffectExchange | null,
): StartCapacityJourneyStep {
  const step = advanceScenario(program, state, stimulus);
  if (step.kind !== ScenarioStepKind.Committed) {
    throw new TypeError("The capacity journey did not commit");
  }
  return { stimulus, committed: step, effect };
}

function effectCompletionFor(
  program: SemanticProcessProgram,
  state: RuntimeState,
  open: ReturnType<typeof projectOpenEffects>,
  value: BusinessValue,
): { stimulus: Stimulus; effect: StartCapacityEffectExchange } {
  const [effect, ...others] = open;
  const wait = state.effectWaits.find(({ id }) => id.elementId === effect?.id.elementId);
  if (effect === undefined || others.length > 0 || state.userTaskWaits.length > 0 || wait === undefined) {
    throw new TypeError("The capacity journey lost its single open wait");
  }
  const material = projectEffectTransportMaterial(program, effect);
  const result = reservedEffectResult(wait.outputMappings, value);
  return {
    stimulus: completeEffectStimulus(effect.id, result),
    effect: {
      elementId: effect.id.elementId,
      request: { ...material.descriptor, idempotencyKey: effectTransportKey(material), arguments: material.arguments },
      result,
    },
  };
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
    throw new TypeError("The capacity journey lost its single open User Task");
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
