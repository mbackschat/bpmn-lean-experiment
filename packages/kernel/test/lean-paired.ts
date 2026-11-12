/**
 * The kernel unit tests' only access to the TypeScript kernel: each function here runs the kernel as the test asks and
 * records the `kernelRun --batch` case that replays the same documents against the Lean kernel, with the TypeScript
 * answer (`runBatchCase`) beside it. `packages/differential/test/kernel-unit-pairing.integration-test.ts` runs the unit
 * suite with `KERNEL_LEAN_PAIRS` naming a directory, replays every recorded case through Lean and requires the same
 * answer; without the variable nothing is recorded.
 *
 * A case is built from wire documents only, so the helper remembers the wire form behind every value it hands out: the
 * program JSON a `Program` was decoded from, the stimulus JSON and Timer firing behind an `Input`, and the stimuli whose
 * steps committed a `State`. A value the helper did not hand out has no wire form, so passing one throws: a test that
 * builds a `State` or an `Input` by hand reaches no Lean answer and must state its documents instead. A step of a program
 * admission refuses records an `ungated` case, which runs without the admission gate and reports the refusal beside it.
 *
 * Kernel enums are re-exported for building and reading values; they carry no behavior.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { beforeEach } from "node:test";

import * as kernel from "@bpmn-lean/kernel";
import * as kernelTesting from "@bpmn-lean/kernel/testing";
import type {
  Decoded, Input, JsonValue, Outcome, Program, State, TimerFiring,
} from "@bpmn-lean/kernel";

export {
  CodecRefusalCode, CommandTag, DefinitionSelectorTag, DeliveryTriggerTag, DeploymentOutcomeTag, EffectOutcomeTag,
  FailureTag, FanOutEntryTag, FanOutNextTag, InputTag, MessageAddressTag, PendingTag, PublishMode, ReceiverTag,
  ResolutionTag, ScopeKindTag, SignalAddressTag, SignalReach, StartTriggerTag, StimulusTag, VisitTag, WorkTag,
} from "@bpmn-lean/kernel";

type Json = Record<string, unknown>;

const sink = process.env["KERNEL_LEAN_PAIRS"];
const recorded = new Set<string>();
let currentTest = "<module>";
if (sink !== undefined) {
  mkdirSync(sink, { recursive: true });
  beforeEach((context) => { currentTest = context.fullName; });
}

/** The TypeScript answer to a batch case, in the form `kernelRun --batch` prints it. */
function batchAnswer(batchCase: Json): Json {
  try {
    return { answer: JSON.parse(JSON.stringify(kernelTesting.runBatchCase(batchCase))) as unknown };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/** Record `batchCase` once per process when recording is on. */
function record(batchCase: Json): void {
  if (sink === undefined) return;
  const text = JSON.stringify(batchCase);
  if (recorded.has(text)) return;
  recorded.add(text);
  const line = { file: path.basename(process.argv[1] ?? "unknown"), test: currentTest, case: batchCase, expected: batchAnswer(batchCase) };
  appendFileSync(path.join(sink, `${String(process.pid)}.jsonl`), `${JSON.stringify(line)}\n`, "utf8");
}

const programJson = new WeakMap<Program, unknown>();
const stimulusJson = new WeakMap<Input, readonly [unknown, TimerFiring | null]>();
const pathOf = new WeakMap<State, readonly unknown[]>();

function wireOf<K extends object, V>(map: WeakMap<K, V>, key: K, what: string): V {
  const value = map.get(key);
  if (value === undefined) throw new Error(`lean-paired: the ${what} was not handed out by this helper, so it has no wire form`);
  return value;
}

/** The run of `stimuli` over `program`; `ungated` steps it past an admission refusal, as `step` does. */
const run = (program: Program, stimuli: readonly unknown[], ungated = false): Json =>
  ({ entry: ungated && kernel.admit(program) !== null ? "ungated" : "hostView", program: wireOf(programJson, program, "program"), scenario: { stimuli } });

/** The strict program codec over `json`; the decode is replayed from the JSON's text. */
export function decodeProgram(json: unknown): Decoded<Program> {
  record({ entry: "decode", text: JSON.stringify(json) });
  const decoded = kernel.decodeProgram(json);
  if (decoded.ok) programJson.set(decoded.value, json);
  return decoded;
}

/** The strict codecs over a program text. */
export function parseStrict(text: string): Decoded<unknown> {
  record({ entry: "decode", text });
  return kernel.parseStrict(text);
}

/** The program's canonical encoding, which the decode case replays. */
export function encodeProgram(program: Program): JsonValue {
  wireOf(programJson, program, "program");
  return kernel.encodeProgram(program);
}

/** The admission registry's verdict; the replay is a run of no input, which also reads the host requirements. */
export function admit(program: Program): string | null {
  record(run(program, []));
  return kernel.admit(program);
}

/** The stimulus codec over `json`, remembering the stimulus and the Timer firing it states. */
export function stimulusFromJson(json: unknown): Decoded<readonly [string, Input]> {
  record({ entry: "stimulus", stimulus: json });
  const decoded = kernel.firingStimulusFromJson(json);
  if (!decoded.ok) return decoded;
  const [commandId, input, firing] = decoded.value;
  stimulusJson.set(input, [json, firing]);
  return { ok: true, value: [commandId, input] };
}

/**
 * One input through the runner's step (`runStep`, which refuses a Timer firing that is not on time) from `state`, or from
 * no instance; the replay runs every stimulus that committed `state`, then this one.
 */
export function step(program: Program, state: State | null, input: Input): Outcome {
  const [json, firing] = wireOf(stimulusJson, input, "input");
  const stimuli = [...(state === null ? [] : wireOf(pathOf, state, "state")), json];
  record(run(program, stimuli, true));
  const outcome = kernel.runStep(program, state, input, firing);
  if (outcome.ok) pathOf.set(outcome.value, stimuli);
  return outcome;
}

/** The host view of a committed state, which the run that committed it replays. */
export function hostView(program: Program, state: State): ReturnType<typeof kernel.hostView> {
  wireOf(pathOf, state, "state");
  return kernel.hostView(program, state);
}

/** The host view of a committed state in its published form (`kernelRun --host-view`). */
export function hostViewJson(program: Program, state: State): unknown {
  return kernel.hostViewJson(hostView(program, state));
}

/**
 * The open waits of an admitted program's committed state that a delivery on `channel` with `correlation` (both in
 * their wire form) matches, as the `matching` fixture answers it.
 */
export function matching(program: Program, state: State, channel: unknown, correlation: readonly unknown[]): unknown {
  return runFixture({
    entry: "matching", programs: [wireOf(programJson, program, "program")],
    input: { stimuli: wireOf(pathOf, state, "state"), channel, correlation },
  });
}

/** The canonical result of a scenario run, replayed as a host-view run. */
export function runScenario(program: unknown, scenario: unknown): unknown {
  record({ entry: "hostView", program, scenario });
  return kernel.runScenario(program, scenario);
}

/** A host-view run. */
export function runHostView(program: unknown, scenario: unknown): unknown {
  record({ entry: "hostView", program, scenario });
  return kernel.runHostView(program, scenario);
}

/** A population run over its deployment sources and the steps' digests. */
export function runPopulation(sources: readonly unknown[], scenario: unknown, digests: readonly string[]): unknown {
  record({ entry: "population", sources, scenario, digests });
  return kernel.runPopulation(sources, scenario, digests);
}

/** A kernel fixture's answer (`kernelRun --fixture`). */
export function runFixture(fixture: unknown): unknown {
  record({ entry: "fixture", fixture });
  return kernel.runFixture(fixture);
}

/** The answer of the kernel fixture `entry` over the admitted wire `programs` and `input` (`kernelRun --fixture`). */
export function fixture(entry: string, programs: readonly unknown[], input: unknown): unknown {
  return runFixture({ entry, programs, input });
}

/** The program's host requirements, which a run of no input replays. */
export function hostRequirements(program: Program): ReturnType<typeof kernel.hostRequirements> {
  record(run(program, []));
  return kernel.hostRequirements(program);
}

/** The program's definition capabilities in their published form, which a run of no input replays. */
export function definitionCapabilities(program: Program): unknown {
  record(run(program, []));
  return kernel.capabilitiesJson(kernel.definitionCapabilities(program));
}

/** The root starts of an admitted program, replayed as the `rootStarts` fixture. */
export function rootStarts(program: Program): ReturnType<typeof kernel.rootStarts> {
  record({ entry: "fixture", fixture: { entry: "rootStarts", programs: [wireOf(programJson, program, "program")], input: {} } });
  return kernel.rootStarts(program);
}

/** Whether an admitted program refuses Signal variables, replayed as the `refusesSignalVariables` fixture. */
export function refusesSignalVariables(program: Program): boolean {
  record({ entry: "fixture", fixture: { entry: "refusesSignalVariables", programs: [wireOf(programJson, program, "program")], input: {} } });
  return kernel.refusesSignalVariables(program);
}

/** The registry's evaluator over an IL expression and wire bindings, as `kernelRun --batch` answers `evaluate`. */
export function evaluate(expression: unknown, variables: readonly unknown[], nowMs = 0): unknown {
  const batchCase = { entry: "evaluate", expression, variables, nowMs };
  record(batchCase);
  return kernelTesting.runBatchCase(batchCase);
}

export type { Json as PairedJson };
