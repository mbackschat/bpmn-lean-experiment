/**
 * Kernel scenario runner, transcribed from `Kernel/Run.lean`.
 *
 * `runScenario` returns the canonical scenario result. Trace rules, as the frozen evaluator applies them: a
 * committed input, or a rejected one that is not last, adds its command and state observation and the run
 * continues; any other outcome adds them and ends the run with that outcome. A program the admission registry
 * refuses yields only an unsupported deployment. Undecodable input throws, as the Lean runner exits with an IO
 * error and prints no result; the runner's stderr diagnostic for an admission refusal is the CLI's, not this
 * function's.
 */
import { assertNever, type Program } from "./il/types.js";
import {
  bindingsToJson,
  decodeProgram,
  failureName,
  stimulusFromJson,
  type JsonValue,
} from "./il/codec.js";
import { FailureTag, failed, type Input, type Outcome, type State } from "./state.js";
import { step } from "./step.js";
import { observe, type OpenUserTask, type TaskRef } from "./publish.js";
import { hooks } from "./registry.js";
import { admit } from "./admission-registry.js";

type Stimulus = readonly [string, Input | null];

function taskRefJson(ref: TaskRef): JsonValue {
  return { processInstanceId: ref.processInstanceId, elementId: ref.elementId, activation: ref.activation };
}

/** `metadata` appears only for a task with candidate groups, and `form` within it only with form fields. */
function openUserTaskJson(task: OpenUserTask): JsonValue {
  const base = { id: taskRefJson(task.id), name: task.name, state: "active" };
  if (task.candidateGroups.length === 0) {
    return base;
  }
  const assignment = { candidates: task.candidateGroups.map((group) => ({ id: group, kind: "group" })) };
  const form = task.formFields.length === 0
    ? {}
    : { form: { fields: task.formFields.map(([key, type]) => ({ key, type })) } };
  return { ...base, metadata: { assignment, ...form } };
}

function observationJson(state: State): JsonValue {
  const o = observe(state);
  return {
    kind: "state",
    instanceId: o.instanceId,
    status: o.status,
    activeWaits: o.activeWaits.map((wait) => ({
      elementId: wait.elementId,
      kind: wait.kind,
      multiplicity: wait.multiplicity,
    })),
    openUserTasks: o.openUserTasks.map(openUserTaskJson),
    openMessageSubscriptions: [],
    openTimers: [],
    openEffects: [],
    openIncidents: [],
    variables: bindingsToJson(o.variables),
    enabledInteractions: o.enabledInteractions.map((interaction) => ({
      kind: interaction.kind,
      taskId: taskRefJson(interaction.taskId),
    })),
    logicalTimeMs: o.logicalTimeMs,
  };
}

function commandJson(commandId: string, outcome: string): JsonValue {
  return { kind: "command", commandId, outcome };
}

function snapshot(state: State | null): JsonValue[] {
  return state === null ? [] : [observationJson(state)];
}

/** Whether a failure lets the run continue when more stimuli follow. */
function continues(tag: FailureTag): boolean {
  switch (tag) {
    case FailureTag.Rejected:
      return true;
    case FailureTag.SemanticFailure:
    case FailureTag.Unsupported:
      return false;
  }
  return assertNever(tag);
}

/** The trace after deployment and the scenario outcome. */
function execute(program: Program, stimuli: readonly Stimulus[]): readonly [JsonValue[], string] {
  const trace: JsonValue[] = [];
  let state: State | null = null;
  for (const [index, [commandId, input]] of stimuli.entries()) {
    const result: Outcome = input === null
      ? failed(FailureTag.Unsupported, "stimulus")
      : step(hooks, program, state, input);
    if (result.ok) {
      trace.push(commandJson(commandId, "committed"), ...snapshot(result.value));
      state = result.value;
      continue;
    }
    const name = failureName(result.failure);
    trace.push(commandJson(commandId, name), ...snapshot(state));
    if (!(continues(result.failure.tag) && index < stimuli.length - 1)) {
      return [trace, name];
    }
  }
  return [trace, "committed"];
}

function result(program: Program, stimuli: readonly Stimulus[]): JsonValue {
  const deployment = (outcome: string): JsonValue => ({ kind: "deployment", outcome });
  const semantic = (outcome: string): JsonValue => ({ kind: "semantic", outcome });
  if (admit(program) !== null) {
    return { outcome: semantic("unsupported"), trace: [deployment("unsupported")] };
  }
  const [trace, outcome] = execute(program, stimuli);
  return { outcome: semantic(outcome), trace: [deployment("committed"), ...trace] };
}

function decodeStimuli(scenarioJson: unknown): readonly Stimulus[] {
  const items =
    typeof scenarioJson === "object" && scenarioJson !== null && !Array.isArray(scenarioJson) &&
      Object.hasOwn(scenarioJson, "stimuli")
      ? (scenarioJson as Readonly<Record<string, unknown>>)["stimuli"]
      : null;
  if (!Array.isArray(items)) {
    throw new Error("scenario: expected JSON array");
  }
  return items.map((item: unknown) => {
    const decoded = stimulusFromJson(item);
    if (!decoded.ok) {
      throw new Error(`scenario: ${decoded.refusal}`);
    }
    return decoded.value;
  });
}

export function runScenario(programJson: unknown, scenarioJson: unknown): unknown {
  const program = decodeProgram(programJson);
  if (!program.ok) {
    throw new Error(`program: ${program.refusal}`);
  }
  return result(program.value, decodeStimuli(scenarioJson));
}
