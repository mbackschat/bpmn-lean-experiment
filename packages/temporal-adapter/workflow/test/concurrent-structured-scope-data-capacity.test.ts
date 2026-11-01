/**
 * Measures the two retained concurrent structured scope data models against every hosted budget, the capacity account of
 * the concurrent structured scope data specification (`CSSD-CAPACITY-01`). A concurrent Program claims no Start capacity
 * envelope, so the oracle is each budget's production limit; this is a component measurement of these two models, not a
 * claim about other Programs.
 *
 * Each journey replays a registered schedule's stimuli under a 256-byte hosting identity, with the profile's identity
 * bound, reserved-length command ids and every structured slot (Start business object, submitted value, effect result)
 * replaced by an ASCII Map of the chosen canonical size. Strings stay as registered, since the proposal's account
 * concerns the structured slots. Each successor passes the Workflow's commit preflight (committed state, publication
 * batch and the publication continuation a Continue-As-New would carry) and its retained Run preflight, whose untyped
 * throw fails the test. Four kinds of journey are measured: the registered realistic values, which must fit every budget;
 * the full allowance in every slot, which the Workflow must refuse before commit with a typed committed-state failure;
 * the largest uniform size that commits; and each slot grown over the others, which are held at their largest uniform
 * size, optionally with one further slot empty. In the last two every budget not refused before commit must fit.
 *
 * The Query response is paged to its budget, so its measured size is the page, not a margin: its untyped refusal needs
 * one paired batch with the current execution and open occurrences beyond 196,608 bytes, and the commit preflight keeps
 * both within 65,536 bytes, since these models' continuation fits at Start. Measured on 2026-11-01: the largest uniform slot that commits is 5,749 bytes for order
 * review first, 7,472 for order pick first and 9,132 for both loan schedules; with one slot grown, loan assessment
 * reaches the publication continuation budget before the committed-state budget, which the commit preflight refuses,
 * and the largest budget not refused before commit is the Continue-As-New arguments at 158,556 of 458,752 bytes.
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
  WorkflowRunRetentionPreflightKind, WorkflowSemanticCandidatePreflightKind, createCommandPublicationState,
  initializeWorkflowRunRetention, integrateCommandPublication, preflightWorkflowCommitCandidate,
  preflightWorkflowRunRetentionCandidate, recordCommandPublicationOutcome,
} from "../dist/index.js";
import { emptyWorkflowPublicationSegmentDirectory } from "../dist/workflow-publication-segments.js";
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

/** The size of each structured slot by its ordinal in stimulus order, Start first; `null` keeps the registered value. */
type Slots = (ordinal: number) => number | null;
const uniform = (slot: number | null): Slots => () => slot;

/**
 * Replaces each structured binding, in order, by the largest filling within its slot size, the value allowance and the
 * patch bound left by the bindings already filled, so a patch of several structured slots stays committable.
 */
function fill(bindings: readonly VariableBinding[], slots: Slots, next: () => number, patch: boolean): VariableBinding[] {
  const filled = [...bindings];
  filled.forEach(({ name, value }, position) => {
    if (!structured(value)) return;
    const slot = slots(next());
    if (slot === null) return;
    filled[position] = { name, value: largestFilling(Math.min(slot, maximumCanonicalValueBytes), candidate => !patch ||
      canonicalNamedValueArrayUtf8ByteLength(filled.with(position, { name, value: candidate })) <= nestedScopePatchByteLimit) };
  });
  return filled;
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
async function journey(model: Model, schedule: string, slots: Slots): Promise<Journey> {
  const scenario = JSON.parse(await readFile(new URL(`${schedule}.scenario.json`, directory), "utf8")) as
    { stimuli: Stimulus[] };
  const [registeredStart, ...rest] = scenario.stimuli;
  assert.ok(registeredStart?.kind === StimulusKind.StartProcess);
  let ordinal = 0;
  const next = () => ordinal++;
  const start: StartProcessStimulus = { ...registeredStart, commandId: reserved(0), instanceId,
    initialVariables: fill(registeredStart.initialVariables, slots, next, false) };
  const completions = rest.filter(({ commandId }) => !commandId.startsWith("refuse-")).map((stimulus, index): Stimulus => {
    switch (stimulus.kind) {
      case StimulusKind.CompleteEffect: {
        assert.ok("localPatch" in stimulus.result, stimulus.commandId);
        return completeEffectStimulus({ ...stimulus.effectId, processInstanceId: rehost(stimulus.effectId.processInstanceId) },
          { ...stimulus.result, localPatch: fill(stimulus.result.localPatch, slots, next, true) });
      }
      case StimulusKind.CompleteUserTaskInstance:
        return { ...stimulus, commandId: reserved(index + 1),
          taskId: { ...stimulus.taskId, processInstanceId: rehost(stimulus.taskId.processInstanceId) },
          submittedValues: fill(stimulus.submittedValues, slots, next, true) };
      default:
        assert.fail(`unexpected ${stimulus.kind}`);
    }
  });
  return { program: await program(model), start, completions };
}

// The first Run of the chain, as the encoder measurement's Continue-As-New successor uses it.
const segments = { runId: "capacity-run-1", runOrdinal: 1, firstExecutionRunId: "capacity-run-1",
  segmentDirectory: emptyWorkflowPublicationSegmentDirectory() };

type Candidates = Readonly<{ preflights: WorkflowSemanticCandidatePreflight[]; retained: boolean }>;

/**
 * Every committed successor's real commit preflight, then its retained Run preflight, stopping at the first refusal. The
 * retained Run preflight throws, untyped, when one candidate exceeds its whole reserve, which fails the test.
 */
function candidates({ program, start, completions }: Journey): Candidates {
  let state: RuntimeState = initialState;
  let publication = createCommandPublicationState(program, instanceId);
  let retention = initializeWorkflowRunRetention([], publication);
  let traceEntries = 0;
  const preflights: WorkflowSemanticCandidatePreflight[] = [];
  for (const stimulus of [start, ...completions]) {
    const step = advanceScenario(program, state, stimulus);
    assert.ok(step.kind === ScenarioStepKind.Committed, stimulus.commandId.slice(0, 24));
    const before = publication;
    publication = recordCommandPublicationOutcome(
      integrateCommandPublication(program, before, stimulus, step, () => 1_700_000_000_000), stimulus, step.observations);
    const candidate = preflightWorkflowCommitCandidate({ state: step.state, publicationBefore: before, publication }, segments);
    preflights.push(candidate);
    if (candidate.kind !== WorkflowSemanticCandidatePreflightKind.Ready) break;
    const retained = preflightWorkflowRunRetentionCandidate(retention,
      { traceEntriesBefore: traceEntries, observations: step.observations, publicationBefore: before, publication });
    if (retained.kind !== WorkflowRunRetentionPreflightKind.Ready) return { preflights, retained: false };
    retention = retained.successor;
    traceEntries += step.observations.length;
    state = step.state;
  }
  return { preflights, retained: true };
}

const allReady = (journey: Journey) => {
  const { preflights, retained } = candidates(journey);
  return retained && preflights.every(({ kind }) => kind === WorkflowSemanticCandidatePreflightKind.Ready);
};

function assertFitsEveryBudget(input: Journey, diagnostic: (message: string) => void): void {
  const actual = measureWithWorkflowEncoders(input.program, input.start, input.completions);
  for (const budget of startCapacityEnvelopeBudgets) {
    diagnostic(`${budget}: actual ${actual[budget]}, production ${production[budget]}`);
    assert.ok(actual[budget] <= production[budget], `${budget}: actual ${actual[budget]} exceeds production ${production[budget]}`);
  }
}

for (const [model, schedule] of schedules) {
  test(`${schedule}: realistic values fit every hosted budget under a 256-byte hosting identity`, async (context) => {
    assertFitsEveryBudget(await journey(model, schedule, uniform(null)), message => context.diagnostic(message));
  });

  test(`${schedule}: full-allowance structured slots are refused before commit with a typed committed-state failure`, async () => {
    const { preflights } = candidates(await journey(model, schedule, uniform(maximumCanonicalValueBytes)));
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
      if (allReady(await journey(model, schedule, uniform(middle)))) low = middle; else high = middle - 1;
    }
    context.diagnostic(`largest committed slot: ${low} bytes`);
    const input = await journey(model, schedule, uniform(low));
    const largest = Math.max(...candidates(input).preflights.map(candidate =>
      candidate.kind === WorkflowSemanticCandidatePreflightKind.Ready ? candidate.observedStateBytes : Infinity));
    // One byte more in every slot crosses the bound, so the largest successor sits within a few copies of a byte below it.
    assert.ok(largest > committedBound - 1_024, `largest successor ${largest} sits just below ${committedBound}`);
    assert.equal(allReady(await journey(model, schedule, uniform(low + 1))), false, "one more byte per slot is refused");
    assertFitsEveryBudget(input, message => context.diagnostic(message));
  });

  test(`${schedule}: with one slot grown over the others, every budget not refused before commit fits`, async (context) => {
    let count = 0;
    await journey(model, schedule, ordinal => { count = Math.max(count, ordinal + 1); return null; });
    let measured = 0;
    // `emptied` holds one further slot at an empty Map, so the searched slot can also grow where every other slot is full.
    for (const emptied of [null, ...Array.from({ length: count }, (_, ordinal) => ordinal)]) {
      for (let searched = 0; searched < count; searched += 1) {
        if (searched === emptied) continue;
        const slots = (size: number, others: number): Slots => ordinal =>
          ordinal === emptied ? 0 : ordinal === searched ? size : others;
        const others = await largestReady(size => journey(model, schedule, slots(0, size)), 256);
        if (others === null) continue;
        const size = await largestReady(candidate => journey(model, schedule, slots(candidate, others)), 64);
        assert.ok(size !== null);
        context.diagnostic(`emptied ${emptied}, searched ${searched}: others ${others}, searched ${size} bytes`);
        assertFitsEveryBudget(await journey(model, schedule, slots(size, others)), message => context.diagnostic(message));
        measured += 1;
      }
    }
    assert.ok(measured >= count, `${schedule} measures every slot grown over the others`);
  });
}

/**
 * The largest slot size up to the allowance whose journey commits every successor, exact at the allowance and otherwise
 * within `resolution` bytes, or null when even an empty slot does not commit.
 */
async function largestReady(journeyOf: (size: number) => Promise<Journey>, resolution = 1): Promise<number | null> {
  if (!allReady(await journeyOf(0))) return null;
  // The full allowance is the boundary vector a coarse search would miss.
  if (allReady(await journeyOf(maximumCanonicalValueBytes))) return maximumCanonicalValueBytes;
  let [low, high] = [0, maximumCanonicalValueBytes];
  while (high - low >= resolution) {
    const middle = Math.ceil((low + high) / 2);
    if (allReady(await journeyOf(middle))) low = middle; else high = middle - 1;
  }
  return low;
}
