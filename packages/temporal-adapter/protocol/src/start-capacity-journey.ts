/**
 * The successful serial business journey of a capacity-enveloped profile, run through the real semantic core with
 * every permitted future output at its full per-value allowance.
 *
 * It exists only to hand the capacity envelope genuine semantic-core artifacts (committed states, stimuli,
 * publications, observations) instead of a second model of their shape. The portable handoff completes User Tasks;
 * the effect-data profile completes Service Task effects whose handler result is external but reserved here; the
 * structured Message-payload profile answers its one payload-bearing Message wait with the reserved payload; the
 * nested scope-data profile completes each User Task with a patch at the `NSD-TASK-01` cap. See the
 * [capacity admission](../../../../docs/capsules/PORTABLE-BUSINESS-VALUES-PROPOSAL.md#capacity-admission) rule, its
 * counterparts `PBV-EFF-05` and `PBV-MSG-03`, and the nested
 * [hosting preflight](../../../../docs/capsules/NESTED-EMBEDDED-SCOPE-DATA-SPEC.md#temporal-hosting-and-refinement-preflight).
 */
import {
  EffectExecutionResultKind,
  MappingExpressionKind,
  ScenarioStepKind,
  StimulusKind,
  VariableValueKind,
  advanceScenario,
  canonicalValueUtf8ByteLength,
  canonicalNamedValueArrayUtf8ByteLength,
  compareCanonicalStrings,
  initialState,
  isSingletonBusinessItem,
  maximumCanonicalValueBytes,
  nestedScopeDataProgram,
  nestedScopeDeclaredNames,
  nestedScopePatchAdmitted,
  nestedScopePatchByteLimit,
  projectEffectTransportMaterial,
  projectOpenEffects,
  SemanticOperationKind,
} from "@bpmn-lean/semantic-core";
import type {
  BusinessValue,
  CompleteUserTaskInstanceStimulus,
  DeepReadonly,
  DeliverPayloadMessageStimulus,
  EffectExecutionResult,
  ProcessStartStimulus,
  RuntimeState,
  ScenarioStep,
  SemanticProcessProgram,
  SemanticUserTaskWait,
  Stimulus,
  VariableBinding,
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

/**
 * Start, then one completion per serial wait, each committed to its stable state; the last step is terminal.
 * `reservedTargets` counts, per nested scope-data User Task in journey order, the reserved patches it can submit.
 */
export type StartCapacityJourney = DeepReadonly<{
  steps: [StartCapacityJourneyStep, ...StartCapacityJourneyStep[]];
  reservedTargets: number[];
}>;

/** The most journeys `startCapacityJourneys` runs before it refuses to reserve a Program's User Task patches. */
export const maximumReservedCompletionJourneys = 1_024;

/**
 * Runs Start and then completes the single open wait until the Process leaves the running state. A User Task
 * completion submits the sentinel under the output the Program declares for it; an effect completion returns the
 * sentinel for every local its output parameters read, as the handler of PBV-EFF-02 must. The `index`-th nested
 * scope-data User Task submits its `choices[index]`-th reserved patch, the first by default.
 *
 * Throws when the Program does not offer that journey. The caller has already admitted `start` against `program`,
 * and both profiles admit only serial chains, so an unreachable step, a parallel wait or a cycle is a broken
 * profile invariant, not a business refusal. The step bound is that invariant's guard, not a business limit.
 */
export function runStartCapacityJourney(
  start: ProcessStartStimulus,
  program: SemanticProcessProgram,
  choices: ReadonlyArray<number> = [],
): StartCapacityJourney {
  const sentinel = fullAllowanceValue();
  const first = commit(program, initialState, start, null);
  const steps: [StartCapacityJourneyStep, ...StartCapacityJourneyStep[]] = [first];
  const reservedTargets: number[] = [];
  const choose = (targets: number): number => {
    const choice = choices[reservedTargets.length] ?? 0;
    reservedTargets.push(targets);
    return choice;
  };
  for (let state = first.committed.state; state.control.kind === "running"; state = steps[steps.length - 1]!.committed.state) {
    requireSerialChain(program, steps.length);
    const next = nextStep(program, state, steps.length, sentinel, choose);
    steps.push(commit(program, state, next.stimulus, next.effect));
  }
  return { steps, reservedTargets };
}

/**
 * Every journey whose nested User Tasks each submit one of their reserved patches, or `null` above
 * `maximumReservedCompletionJourneys`.
 *
 * A completion's contribution to every measured artifact is linear in the bytes it binds to each name, so over the
 * patches `NSD-TASK-01` admits it is largest at a single name holding the whole allowance or at the empty patch.
 * Enumerating those choices for every task therefore reaches each budget's maximum over admitted completions, where
 * one fixed target would not: a value copied onward by an effect input or a scope output costs once per copy, so the
 * worst name depends on the Program, not only on the prior value it replaces. Which names a task may write follows
 * from the scope structure, never from values, so every choice vector replays the same waits.
 */
export function startCapacityJourneys(
  start: ProcessStartStimulus,
  program: SemanticProcessProgram,
): StartCapacityJourney[] | null {
  const first = runStartCapacityJourney(start, program);
  const total = first.reservedTargets.reduce((product, targets) => product * targets, 1);
  if (total > maximumReservedCompletionJourneys) return null;
  const byOrdinal = new Map<number, StartCapacityJourney>();
  branchJourneys(program, fullAllowanceValue(), [first.steps[0]], [], 0, byOrdinal);
  return Array.from({ length: total }, (_, ordinal) => {
    const journey = byOrdinal.get(ordinal);
    if (byOrdinal.size !== total || journey === undefined ||
        journey.reservedTargets.some((targets, index) => targets !== first.reservedTargets[index]) ||
        journey.reservedTargets.length !== first.reservedTargets.length) {
      throw new TypeError("A reserved completion choice changed the waits of the capacity journey");
    }
    return journey;
  });
}

/**
 * Extends `steps` to every terminal journey, branching at each reserved completion, and files each under the
 * ordinal of its choices, the first choice varying fastest. Journeys share the steps before their first differing
 * choice instead of replaying them: the guarantor loan's 288 journeys of seven steps commit 2,016 steps one by one
 * but share all but about 500 (counted 2026-10-26).
 */
function branchJourneys(
  program: SemanticProcessProgram,
  sentinel: BusinessValue,
  steps: [StartCapacityJourneyStep, ...StartCapacityJourneyStep[]],
  reservedTargets: number[],
  ordinal: number,
  byOrdinal: Map<number, StartCapacityJourney>,
): void {
  for (let state = steps[steps.length - 1]!.committed.state; state.control.kind === "running"; state = steps[steps.length - 1]!.committed.state) {
    requireSerialChain(program, steps.length);
    let offered = null as number | null;
    const next = nextStep(program, state, steps.length, sentinel, (targets) => {
      offered = targets;
      return 0;
    });
    if (offered === null) {
      steps.push(commit(program, state, next.stimulus, next.effect));
      continue;
    }
    const targets = offered;
    const weight = reservedTargets.reduce((product, count) => product * count, 1);
    for (let choice = 0; choice < targets; choice += 1) {
      const chosen = choice === 0 ? next : nextStep(program, state, steps.length, sentinel, () => choice);
      branchJourneys(program, sentinel, [...steps, commit(program, state, chosen.stimulus, chosen.effect)],
        [...reservedTargets, targets], ordinal + choice * weight, byOrdinal);
    }
    return;
  }
  byOrdinal.set(ordinal, { steps, reservedTargets });
}

/** The stimulus completing the single open wait, and the Activity exchange behind it for an effect. */
function nextStep(
  program: SemanticProcessProgram,
  state: RuntimeState,
  ordinal: number,
  sentinel: BusinessValue,
  choose: (targets: number) => number,
): { stimulus: Stimulus; effect: StartCapacityEffectExchange | null } {
  const effect = projectOpenEffects(state);
  return state.messageWaits.length > 0
    ? { stimulus: payloadDeliveryFor(program, state, ordinal, sentinel), effect: null }
    : state.userTaskWaits.length === 1 && effect.length === 0
    ? { stimulus: completionFor(program, state, ordinal, sentinel, choose), effect: null }
    : effectCompletionFor(program, state, effect, sentinel);
}

function requireSerialChain(program: SemanticProcessProgram, steps: number): void {
  if (steps > program.operations.length) {
    throw new TypeError("The capacity journey did not terminate within its serial chain");
  }
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

/**
 * A data-output User Task submits the sentinel under its declared output; a nested scope-data User Task submits its
 * reserved patch; any other plain User Task, whose profile admits no completion data, submits nothing.
 */
function completionFor(
  program: SemanticProcessProgram,
  state: RuntimeState,
  ordinal: number,
  value: BusinessValue,
  choose: (targets: number) => number,
): CompleteUserTaskInstanceStimulus {
  const [wait, ...others] = state.userTaskWaits;
  const operation = wait === undefined
    ? undefined
    : program.operations.find((candidate) =>
      (candidate.kind === SemanticOperationKind.AwaitDataInputOutputUserTask ||
        candidate.kind === SemanticOperationKind.AwaitUserTask) &&
      candidate.task.elementId === wait.id.elementId
    );
  if (wait === undefined || others.length > 0 || operation === undefined) {
    throw new TypeError("The capacity journey lost its single open User Task");
  }
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: reservedCommandId(ordinal),
    taskId: wait.id,
    submittedValues: operation.kind === SemanticOperationKind.AwaitDataInputOutputUserTask
      ? [{ name: operation.directOutput.sourceDataOutputId, value }]
      : nestedScopeDataProgram(program) ? reservedNestedPatch(program, state, wait, choose) : [],
  };
}

/**
 * One `NSD-TASK-01` reserved patch: a declared name holding the whole patch allowance, in canonical name order,
 * then the empty patch. A task outside every declaring frame has only the empty patch.
 */
function reservedNestedPatch(
  program: SemanticProcessProgram,
  state: RuntimeState,
  wait: SemanticUserTaskWait,
  choose: (targets: number) => number,
): VariableBinding[] {
  const names = [...nestedScopeDeclaredNames(program, state, wait.owner)].sort(compareCanonicalStrings);
  const name = names[choose(names.length + 1)];
  if (name === undefined) return [];
  const framing = canonicalNamedValueArrayUtf8ByteLength([{ name, value: allowanceValue(0) }]) -
    canonicalValueUtf8ByteLength(allowanceValue(0));
  const patch = [{ name, value: allowanceValue(nestedScopePatchByteLimit - framing) }];
  if (canonicalNamedValueArrayUtf8ByteLength(patch) !== nestedScopePatchByteLimit ||
      !nestedScopePatchAdmitted(program, state, wait.owner, patch)) {
    throw new TypeError("The reserved nested completion does not fill the admitted patch allowance");
  }
  return patch;
}

/** The single open payload-bearing Message wait answered with the sentinel payload (`PBV-MSG-03`). */
function payloadDeliveryFor(
  program: SemanticProcessProgram,
  state: RuntimeState,
  ordinal: number,
  value: BusinessValue,
): DeliverPayloadMessageStimulus {
  const [wait, ...others] = state.messageWaits;
  const declared = wait !== undefined && program.operations.some((candidate) =>
    candidate.kind === SemanticOperationKind.AwaitPayloadMessage && candidate.message.elementId === wait.id.elementId);
  if (wait === undefined || others.length > 0 || !declared || state.userTaskWaits.length > 0 || state.effectWaits.length > 0) {
    throw new TypeError("The capacity journey lost its single open payload-bearing Message wait");
  }
  return {
    kind: StimulusKind.DeliverPayloadMessage,
    commandId: reservedCommandId(ordinal),
    subscriptionId: wait.id,
    channel: wait.channel,
    payload: value,
  };
}

function reservedCommandId(ordinal: number): string {
  return `${"c".repeat(reservedFutureCommandIdBytes - 1)}${ordinal}`;
}

/** The per-value allowance filled by `allowanceValue`. */
export function fullAllowanceValue(): BusinessValue {
  return allowanceValue(maximumCanonicalValueBytes);
}

/**
 * A Map of ASCII Strings whose canonical JSON is exactly `bytes`, or the smallest such Map when `bytes` is below
 * it. Fewest entries wins, each String at most its own byte bound, so every portable limit holds together; the
 * final admission check is the single oracle for that, not a restated list of limits.
 */
function allowanceValue(bytes: number): BusinessValue {
  const entryText = (lengths: ReadonlyArray<number>): BusinessValue => ({
    kind: VariableValueKind.Map,
    value: lengths.map((length, index) => ({
      name: `k${String(index).padStart(2, "0")}`,
      value: { kind: VariableValueKind.String, value: "a".repeat(length) },
    })),
  });
  const smallest = entryText([0]);
  if (bytes <= canonicalValueUtf8ByteLength(smallest)) return smallest;
  for (let entries = 1; entries <= 99; entries += 1) {
    const room = bytes - canonicalValueUtf8ByteLength(entryText(Array.from({ length: entries }, () => 0)));
    if (room < 0) break;
    if (room > entries * textBound) continue;
    const lengths = Array.from({ length: entries }, (_, index) =>
      Math.min(textBound, Math.max(0, room - index * textBound)));
    const value = entryText(lengths);
    if (canonicalValueUtf8ByteLength(value) === bytes && isSingletonBusinessItem(value)) {
      return value;
    }
  }
  throw new TypeError("No admitted value fills the requested canonical-byte allowance");
}
