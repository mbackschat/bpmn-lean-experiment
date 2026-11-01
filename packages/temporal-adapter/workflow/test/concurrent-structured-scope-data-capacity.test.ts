/**
 * Measures the two retained concurrent structured scope data models against every hosted budget, the capacity account of
 * the concurrent structured scope data proposal (`CSSD-CAPACITY-01`). A concurrent Program claims no Start capacity
 * envelope, so the oracle is each budget's production limit; this is a component measurement of these two models, not a
 * claim about other Programs.
 *
 * Each journey replays a registered schedule's stimuli under a 256-byte hosting identity, with the profile's identity
 * bound, reserved-length command ids and every structured slot (Start business object, submitted value, effect result)
 * replaced by an ASCII Map of the chosen canonical size. Strings stay as registered, since the proposal's account
 * concerns the structured slots. Three sizes are measured: the registered realistic values, which must fit every budget;
 * the full allowance, which the Workflow must refuse before commit with a typed committed-state failure; and the largest
 * size whose every successor stays within the committed-state budget, where every budget not refused before commit must
 * fit, above all the untyped Query response and retained Run trace paths.
 *
 * Measured on 2026-11-01: the largest committed slot is 8,197 bytes for order fulfilment and 9,132 to 10,232 bytes for
 * loan assessment; there the Query response, at most 161,964 of 196,608 bytes, is the closest budget not refused before
 * commit.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  ScenarioStepKind, SemanticProfileId, StimulusKind, VariableValueKind, advanceScenario, canonicalNamedValueArrayUtf8ByteLength,
  canonicalValueUtf8ByteLength, deriveCalledProcessInstanceId, initialState, maximumCanonicalValueBytes, nestedScopePatchByteLimit,
} from "@bpmn-lean/semantic-core";
import type {
  BusinessValue, RuntimeState, SemanticProcessProgram, StartProcessStimulus, Stimulus, VariableBinding,
} from "@bpmn-lean/semantic-core";
import {
  WorkflowChainBudgetKind, completeEffectStimulus, productionStartCapacityEnvelopeLimits, reservedFutureCommandIdBytes,
  startCapacityEnvelopeBudgets, workflowChainProductionLimit,
} from "@bpmn-lean/temporal-protocol";

import {
  WorkflowSemanticCandidatePreflightKind, createCommandPublicationState, integrateCommandPublication, preflightWorkflowSemanticCandidate,
  recordCommandPublicationOutcome,
} from "../dist/index.js";
import type { WorkflowSemanticCandidatePreflight } from "../dist/index.js";
import { measureWithWorkflowEncoders } from "./start-capacity-encoder-measurement.ts";

const directory = new URL("../../../../scenarios/concurrent-structured-scope-data/", import.meta.url);
const production = productionStartCapacityEnvelopeLimits();
const committedBound = workflowChainProductionLimit(WorkflowChainBudgetKind.CommittedRuntimeStateBytes);
// The profile refuses a hosting instance identity above 256 UTF-8 bytes before Workflow creation.
const instanceId = "I".repeat(256);
const registeredInstanceId = "Instance_1";
const reserved = (ordinal: number) => `${"c".repeat(reservedFutureCommandIdBytes - 1)}${ordinal}`;

type Model = "order-fulfilment" | "loan-assessment";
const schedules = [
  ["order-fulfilment", "order-review-first"], ["order-fulfilment", "order-pick-first"],
  ["loan-assessment", "loan-valuation-first"], ["loan-assessment", "loan-credit-first"],
] as const satisfies ReadonlyArray<readonly [Model, string]>;

const compiled = new Map<Model, Promise<SemanticProcessProgram>>();
const program = (model: Model): Promise<SemanticProcessProgram> => {
  if (!compiled.has(model)) compiled.set(model, compile(model));
  return compiled.get(model)!;
};

async function compile(model: Model): Promise<SemanticProcessProgram> {
  const overlay = await readFile(new URL(`${model}-overlay.json`, directory));
  const result = await compileBpmnToSemanticProcess({
    bytes: await readFile(new URL(`${model}.bpmn`, directory)), sourceId: `${model}-capacity`, expectedSha256: undefined,
    sourceOverlay: { id: `${model}-handlers`, sha256: createHash("sha256").update(overlay).digest("hex"), bytes: overlay },
    semanticProfile: SemanticProfileId.NestedEmbeddedScopeData, limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  if (result.status !== BpmnCompilationStatus.Accepted) throw new Error(`${model} was refused: ${JSON.stringify(result)}`);
  return result.semanticProcess;
}

/** An ASCII Map of `characters` text characters in 1,024-character Strings, the text bound of one String. */
function asciiMap(characters: number): BusinessValue {
  const lengths = Array.from({ length: Math.ceil(characters / 1_024) }, (_, index) => Math.min(1_024, characters - index * 1_024));
  return { kind: VariableValueKind.Map, value: lengths.map((length, index) => ({
    name: `k${String(index).padStart(2, "0")}`, value: { kind: VariableValueKind.String, value: "a".repeat(length) } })) };
}

/** The largest ASCII Map whose canonical bytes stay within `limit` and whose `fits` holds; canonical size grows with length. */
function largestFilling(limit: number, fits: (value: BusinessValue) => boolean): BusinessValue {
  let [low, high] = [0, limit];
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const value = asciiMap(middle);
    if (canonicalValueUtf8ByteLength(value) <= limit && fits(value)) low = middle; else high = middle - 1;
  }
  return asciiMap(low);
}

const structured = ({ kind }: BusinessValue) => kind === VariableValueKind.Map || kind === VariableValueKind.List;

/** Replaces every structured binding by the largest filling within `slot` bytes, the value allowance and the patch bound. */
function fill(bindings: readonly VariableBinding[], slot: number | null, patch: boolean): VariableBinding[] {
  if (slot === null) return [...bindings];
  return bindings.map(({ name, value }, position) => !structured(value) ? { name, value } : {
    name, value: largestFilling(Math.min(slot, maximumCanonicalValueBytes), candidate => !patch ||
      canonicalNamedValueArrayUtf8ByteLength(bindings.map((binding, index) =>
        index === position ? { name, value: candidate } : binding)) <= nestedScopePatchByteLimit),
  });
}

/** Moves a registered instance identity, the root's or a called instance's, under the 256-byte hosting identity. */
function rehost(processInstanceId: string): string {
  if (processInstanceId === registeredInstanceId) return instanceId;
  const called = /^call:\d+:Instance_1:\d+:(\w+):(\d+)$/u.exec(processInstanceId);
  assert.ok(called !== null, processInstanceId);
  return deriveCalledProcessInstanceId(instanceId, called[1]!, Number(called[2]));
}

type Journey = Readonly<{ program: SemanticProcessProgram; start: StartProcessStimulus; completions: readonly Stimulus[] }>;

/** The registered schedule's committed stimuli; the order review-first refusal moves nothing and is left out. */
async function journey(model: Model, schedule: string, slot: number | null): Promise<Journey> {
  const scenario = JSON.parse(await readFile(new URL(`${schedule}.scenario.json`, directory), "utf8")) as
    { stimuli: Stimulus[] };
  const [registeredStart, ...rest] = scenario.stimuli;
  assert.ok(registeredStart?.kind === StimulusKind.StartProcess);
  const start: StartProcessStimulus = { ...registeredStart, commandId: reserved(0), instanceId,
    initialVariables: fill(registeredStart.initialVariables, slot, false) };
  const completions = rest.filter(({ commandId }) => !commandId.startsWith("refuse-")).map((stimulus, index): Stimulus => {
    switch (stimulus.kind) {
      case StimulusKind.CompleteEffect: {
        assert.ok("localPatch" in stimulus.result, stimulus.commandId);
        return completeEffectStimulus({ ...stimulus.effectId, processInstanceId: rehost(stimulus.effectId.processInstanceId) },
          { ...stimulus.result, localPatch: fill(stimulus.result.localPatch, slot, true) });
      }
      case StimulusKind.CompleteUserTaskInstance:
        return { ...stimulus, commandId: reserved(index + 1),
          taskId: { ...stimulus.taskId, processInstanceId: rehost(stimulus.taskId.processInstanceId) },
          submittedValues: fill(stimulus.submittedValues, slot, true) };
      default:
        assert.fail(`unexpected ${stimulus.kind}`);
    }
  });
  return { program: await program(model), start, completions };
}

/** Every committed successor's real candidate preflight, stopping at the first refusal. */
function candidates({ program, start, completions }: Journey): WorkflowSemanticCandidatePreflight[] {
  let state: RuntimeState = initialState;
  let publication = createCommandPublicationState(program, instanceId);
  const preflights: WorkflowSemanticCandidatePreflight[] = [];
  for (const stimulus of [start, ...completions]) {
    const step = advanceScenario(program, state, stimulus);
    assert.ok(step.kind === ScenarioStepKind.Committed, stimulus.commandId.slice(0, 24));
    const before = publication;
    publication = recordCommandPublicationOutcome(
      integrateCommandPublication(program, before, stimulus, step, () => 1_700_000_000_000), stimulus, step.observations);
    const candidate = preflightWorkflowSemanticCandidate({ state: step.state, publicationBefore: before, publication });
    preflights.push(candidate);
    if (candidate.kind !== WorkflowSemanticCandidatePreflightKind.Ready) break;
    state = step.state;
  }
  return preflights;
}

const allReady = (journey: Journey) =>
  candidates(journey).every(({ kind }) => kind === WorkflowSemanticCandidatePreflightKind.Ready);

function assertFitsEveryBudget(input: Journey, diagnostic: (message: string) => void): void {
  const actual = measureWithWorkflowEncoders(input.program, input.start, input.completions);
  for (const budget of startCapacityEnvelopeBudgets) {
    diagnostic(`${budget}: actual ${actual[budget]}, production ${production[budget]}`);
    assert.ok(actual[budget] <= production[budget], `${budget}: actual ${actual[budget]} exceeds production ${production[budget]}`);
  }
}

for (const [model, schedule] of schedules) {
  test(`${schedule}: realistic values fit every hosted budget under a 256-byte hosting identity`, async (context) => {
    assertFitsEveryBudget(await journey(model, schedule, null), message => context.diagnostic(message));
  });

  test(`${schedule}: full-allowance structured slots are refused before commit with a typed committed-state failure`, async () => {
    const preflights = candidates(await journey(model, schedule, maximumCanonicalValueBytes));
    const refused = preflights.at(-1)!;
    assert.ok(refused.kind === WorkflowSemanticCandidatePreflightKind.CapacityExceeded, `${schedule} reaches a refusal`);
    assert.equal(refused.failure.budget, WorkflowChainBudgetKind.CommittedRuntimeStateBytes);
    assert.equal(refused.failure.configuredBound, committedBound);
    assert.ok(refused.failure.observedValue > committedBound);
  });

  test(`${schedule}: just below the committed-state budget, every budget not refused before commit fits`, async (context) => {
    let [low, high] = [0, maximumCanonicalValueBytes];
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (allReady(await journey(model, schedule, middle))) low = middle; else high = middle - 1;
    }
    context.diagnostic(`largest committed slot: ${low} bytes`);
    const input = await journey(model, schedule, low);
    const states = candidates(input);
    const largest = Math.max(...states.map(candidate =>
      candidate.kind === WorkflowSemanticCandidatePreflightKind.Ready ? candidate.observedStateBytes : Infinity));
    // One byte more in every slot crosses the bound, so the largest successor sits within a few copies of a byte below it.
    assert.ok(largest > committedBound - 1_024, `largest successor ${largest} sits just below ${committedBound}`);
    assert.equal(allReady(await journey(model, schedule, low + 1)), false, "one more byte per slot is refused");
    assertFitsEveryBudget(input, message => context.diagnostic(message));
  });
}
