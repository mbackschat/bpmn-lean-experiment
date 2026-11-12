/**
 * Binds the host's `KernelPort` to the TypeScript kernel, one of the two modules of this package that import it (with
 * `population-port.ts`), and the package's one input mapper: the one place that matches kernel input kinds, effect outcomes, failures and work kinds.
 *
 * Every name is the Lean name in TypeScript casing (`Kernel.Step.step` → `step`, `Kernel.Run.hostViewJson` →
 * `hostViewJson`), so a kernel rename is a change here alone. Views are taken in the runner's JSON rendering, which
 * the Lean runner's `--host-view` mode prints identically.
 */
import {
  InputTag,
  EffectOutcomeTag,
  FailureTag,
  WorkTag,
  admit,
  bindingsFromJson,
  capabilitiesJson,
  decodeProgram,
  definitionCapabilities,
  elementActivity,
  elementHeader,
  failureCode,
  failureName,
  hooks,
  hostRequirements,
  hostView,
  hostViewJson,
  firingStimulusFromJson,
  observationJson,
  runStep,
  stimulusFromJson,
  type EffectOutcome,
  type Input,
  type TimerFiring,
  type OccurrenceRef,
  type Program,
  type State,
} from "@bpmn-lean/kernel";

import { canonicalJson } from "./canonical-json.js";
import { assertNever } from "./host-machine.js";
import {
  EffectResultKind,
  Route,
  type Binding,
  type EffectResult,
  type HostView,
  type JsonValue,
  type KernelPort,
  type OccurrenceId,
  type ScriptSource,
  type WaitView,
} from "./port.js";
import { fromWire, toWire } from "./wire-codec.js";

function decoded<T>(result: { readonly ok: true; readonly value: T } | { readonly ok: false; readonly refusal: string }, what: string): T {
  if (!result.ok) throw new TypeError(`${what}: ${result.refusal}`);
  return result.value;
}

function reference(id: OccurrenceId): OccurrenceRef {
  return { processInstanceId: id.processInstanceId, element: id.elementId, activation: id.activation };
}

function bindings(values: readonly Binding[]) {
  return decoded(bindingsFromJson(values), "effect outputs");
}

function route(input: Input): Route {
  switch (input.tag) {
    case InputTag.Start: return Route.Start;
    case InputTag.Command: return Route.Command;
    case InputTag.Deliver: return Route.Deliver;
    case InputTag.TimerFire: return Route.TimerFire;
    case InputTag.EffectResult: return Route.EffectResult;
  }
  return assertNever(input);
}

function effectOutcome(result: EffectResult): EffectOutcome {
  switch (result.kind) {
    case EffectResultKind.Success:
      return { tag: EffectOutcomeTag.Success, outputs: bindings(result.outputs) };
    case EffectResultKind.BusinessFailure:
      return { tag: EffectOutcomeTag.BusinessFailure, code: result.code, message: result.message, outputs: bindings(result.outputs) };
    case EffectResultKind.TechnicalFailure:
      return { tag: EffectOutcomeTag.TechnicalFailure };
    case EffectResultKind.Unsupported:
      return { tag: EffectOutcomeTag.Unsupported, code: result.code };
  }
  return assertNever(result);
}

/**
 * The Script Task a wait's effect belongs to, found by the element's published identity: its author's identifier and
 * the called definition it runs in, which tells apart two versions of one called definition that a program carries.
 * More than one Script Task under that identity is a host fault rather than a guess.
 */
function scriptOf(program: Program, wait: WaitView): ScriptSource | null {
  const definition = canonicalJson(wait.definition ?? null);
  const scripts = program.elements.flatMap((element): ScriptSource[] => {
    const activity = elementActivity(element);
    const { origin } = elementHeader(element);
    if (activity === null || origin.sourceId !== wait.id.elementId || canonicalJson(origin.definition) !== definition) return [];
    const work = activity[1].work;
    if (work.tag !== WorkTag.Script) return [];
    const { format, source, resultVariable } = work.payload;
    // Admission refuses a Script Task without an inline source (`work.script.source`, `work.script.resource`).
    if (source === null) throw new TypeError(`the Script Task published as ${wait.id.elementId} has no inline source`);
    return [{ format, source, resultVariable }];
  });
  if (scripts.length > 1) throw new TypeError(`more than one Script Task is published as ${wait.id.elementId}`);
  return scripts[0] ?? null;
}

/**
 * A chain input as the host carries it: the kernel input and the Timer firing its stimulus stated, which the
 * single-instance run's step checks before the step (`Kernel.Run.runStep`); a host-made input states none.
 */
export type HostInput = Readonly<{ input: Input; firing: TimerFiring | null }>;

export const kernelPort: KernelPort<Program, State, HostInput> = {
  decodeProgram: (json) => decoded(decodeProgram(json), "program"),
  admit,
  requirements: hostRequirements,
  capabilities: (program) => capabilitiesJson(definitionCapabilities(program)),
  decodeStimulus: (json) => {
    const [commandId, input, firing] = decoded(firingStimulusFromJson(json), "stimulus");
    return { commandId, input: { input, firing } };
  },
  route: (held) => route(held.input),
  timerInput: (timer, deadlineMs, atMs) => ({
    input: { tag: InputTag.TimerFire, payload: { occurrence: reference(timer), logicalTimeMs: deadlineMs, atMs } }, firing: null,
  }),
  effectInput: (effect, result, atMs) => ({
    input: { tag: InputTag.EffectResult, payload: { occurrence: reference(effect), outcome: effectOutcome(result), atMs } }, firing: null,
  }),
  // The single-instance run's step, not the bare step: a chain is the degenerate population, so a Timer start that is
  // not on time is refused before the step exactly as the kernel runner refuses it (`Kernel.Run.runStep`).
  step: (program, before, held) => {
    const outcome = runStep(program, before, held.input, held.firing);
    if (outcome.ok) return { committed: true, state: outcome.value };
    return {
      committed: false,
      rejected: outcome.failure.tag === FailureTag.Rejected,
      outcome: failureName(outcome.failure),
      code: failureCode(outcome.failure),
    };
  },
  // The rendering is `Kernel.Run.hostViewJson`'s, which `HostView` types field by field.
  hostView: (program, state) => hostViewJson(hostView(program, state)) as unknown as HostView,
  observation: (program, state) => observationJson(program, state) as JsonValue,
  encodeState: toWire,
  // The host decodes only what `encodeState` produced for this program.
  decodeState: (json) => fromWire(json) as State,
  scriptOf,
};
