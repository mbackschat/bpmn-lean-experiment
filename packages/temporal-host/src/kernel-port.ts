/**
 * Binds the host's `KernelPort` to the TypeScript kernel, the only module of this package that imports it, and the
 * package's one input mapper: the one place that matches kernel input kinds, effect outcomes, failures and work kinds.
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
  observationJson,
  step,
  stimulusFromJson,
  type EffectOutcome,
  type Input,
  type OccurrenceRef,
  type Program,
  type State,
} from "@bpmn-lean/kernel";

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
  }
  return assertNever(result);
}

/**
 * The Script Task a wait's effect belongs to, found by the public element identity the wait carries. Called
 * definitions can repeat an author's identifier, so more than one Script Task under it is a host fault rather than a
 * guess.
 */
function scriptOf(program: Program, wait: WaitView): ScriptSource | null {
  const scripts = program.elements.flatMap((element): ScriptSource[] => {
    const activity = elementActivity(element);
    if (activity === null || elementHeader(element).origin.sourceId !== wait.id.elementId) return [];
    const work = activity[1].work;
    if (work.tag !== WorkTag.Script) return [];
    return [{ format: work.payload.format, source: work.payload.source, resultVariable: work.payload.resultVariable }];
  });
  if (scripts.length > 1) throw new TypeError(`more than one Script Task is published as ${wait.id.elementId}`);
  return scripts[0] ?? null;
}

export const kernelPort: KernelPort<Program, State, Input> = {
  decodeProgram: (json) => decoded(decodeProgram(json), "program"),
  admit,
  requirements: hostRequirements,
  capabilities: (program) => capabilitiesJson(definitionCapabilities(program)),
  decodeStimulus: (json) => {
    const [commandId, input] = decoded(stimulusFromJson(json), "stimulus");
    return { commandId, input };
  },
  route,
  timerInput: (timer, deadlineMs, atMs) =>
    ({ tag: InputTag.TimerFire, payload: { occurrence: reference(timer), logicalTimeMs: deadlineMs, atMs } }),
  effectInput: (effect, result, atMs) =>
    ({ tag: InputTag.EffectResult, payload: { occurrence: reference(effect), outcome: effectOutcome(result), atMs } }),
  step: (program, before, input) => {
    const outcome = step(hooks, program, before, input);
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
