/**
 * Measures the two retained concurrent scope data models against every hosted budget, the capacity measurement of the
 * concurrent scope data proposal. The profile claims no Start capacity envelope, so the oracle is each budget's production
 * limit, not an estimate; this is a component measurement of these two models, not a claim about other Programs.
 *
 * Every data slot holds a 1,024-byte String: escape-heavy U+0001, whose canonical encoding `\u0001` costs six bytes per
 * byte, or plain ASCII. Each journey runs through the Workflow's own candidate preflight, publication, successor, Query,
 * terminal, recovery and retention owners, and every committed effect frontier through the effect request byte preflight
 * and the ordinary-effect History reservation of a fresh Run. The stimuli are built here from the models' element IDs.
 *
 * Measured on 2026-10-31: the facility inspection fits every budget escape-heavy, and the claim damage assessment fits
 * with ASCII values. Escape-heavy in every slot, the claim's two armed Fetch rates hold about fifteen escaped copies (the
 * Process, both frames, and each effect's arguments in its wait and its Activity scope), so the Workflow refuses that
 * successor before commit with a typed committed-state capacity failure: the disclosed runtime limit of the profile.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  EffectExecutionResultKind, ScenarioStepKind, SemanticProfileId, StimulusKind, VariableValueKind, advanceScenario, initialState,
  projectEffectTransportMaterial, projectOpenEffects,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticProcessProgram, StartProcessStimulus, Stimulus, VariableBinding } from "@bpmn-lean/semantic-core";
import {
  EffectActivityCapacityPreflightKind, WorkflowChainBudgetKind, completeEffectStimulus, effectTransportKey,
  preflightEffectActivityRequest, productionStartCapacityEnvelopeLimits, reservedFutureCommandIdBytes, startCapacityEnvelopeBudgets,
  workflowChainCanonicalUtf8ByteLength as bytes, workflowChainProductionLimit,
} from "@bpmn-lean/temporal-protocol";

import {
  WorkflowSemanticCandidatePreflightKind, createCommandPublicationState, integrateCommandPublication, preflightWorkflowSemanticCandidate,
  recordCommandPublicationOutcome,
} from "../dist/index.js";
import { assessOrdinaryEffectHistoryReservation, OrdinaryEffectHistoryReservationKind }
  from "../dist/ordinary-effect-history-reservation.js";
import { measureWithWorkflowEncoders } from "./start-capacity-encoder-measurement.ts";

const directory = new URL("../../../../scenarios/concurrent-scope-data/", import.meta.url);
const production = productionStartCapacityEnvelopeLimits();
const heavyText = "\u0001".repeat(1_024);
const heavy = { kind: VariableValueKind.String, value: heavyText } as const;
const ascii = { kind: VariableValueKind.String, value: "a".repeat(1_024) } as const;
type Slot = typeof heavy | typeof ascii;
// The profile refuses a hosting instance identity above 256 UTF-8 bytes before Workflow creation.
const instanceId = "I".repeat(256);
const reserved = (ordinal: number) => `${"c".repeat(reservedFutureCommandIdBytes - 1)}${ordinal}`;

async function program(model: "claim-damage-assessment" | "facility-inspection"): Promise<SemanticProcessProgram> {
  const overlay = await readFile(new URL(`${model}-handlers.json`, directory));
  const compiled = await compileBpmnToSemanticProcess({
    bytes: await readFile(new URL(`${model}.bpmn`, directory)), sourceId: `${model}-capacity`, expectedSha256: undefined,
    sourceOverlay: { id: `${model}-handlers`, sha256: createHash("sha256").update(overlay).digest("hex"), bytes: overlay },
    semanticProfile: SemanticProfileId.EmbeddedSubProcessCompletion, limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  if (compiled.status !== BpmnCompilationStatus.Accepted) throw new Error(`${model} was refused: ${JSON.stringify(compiled)}`);
  return compiled.semanticProcess;
}

const occurrence = (elementId: string, activation = 1) => ({ processInstanceId: instanceId, elementId, activation });
const effect = (elementId: string, activation = 1): Stimulus =>
  completeEffectStimulus(occurrence(elementId, activation), { kind: EffectExecutionResultKind.Success, localPatch: [] });
function slots(value: Slot) {
  const bind = (name: string): VariableBinding => ({ name, value });
  const userTask = (ordinal: number, elementId: string, activation: number, names: readonly string[]): Stimulus => ({
    kind: StimulusKind.CompleteUserTaskInstance, commandId: reserved(ordinal), taskId: occurrence(elementId, activation),
    submittedValues: names.map(bind) });
  return { bind, userTask };
}

type Journey = Readonly<{ program: SemanticProcessProgram; start: StartProcessStimulus; completions: readonly Stimulus[] }>;

/** Both Price damage occurrences hold filled frames, so two Fetch rates frontiers each carry two filled arguments. */
async function claimJourney(value: Slot): Promise<Journey> {
  const { bind, userTask } = slots(value);
  return {
    program: await program("claim-damage-assessment"),
    start: { kind: StimulusKind.StartProcess, commandId: reserved(0), processId: "Process_ClaimDamageAssessment", instanceId,
      initialVariables: [bind("adjuster"), bind("noAdjuster")] },
    completions: [
      userTask(1, "InspectVehicle", 1, []), userTask(2, "InspectProperty", 1, []),
      userTask(3, "AssessDamage", 1, ["estimate"]), userTask(4, "AssessDamage", 2, ["estimate"]),
      effect("FetchRates", 1), effect("FetchRates", 2), userTask(5, "ReviewClaim", 1, []),
    ],
  };
}

/** Both checks write every slot they may name, so Summarize carries three filled arguments. */
async function facilityJourney(value: Slot): Promise<Journey> {
  const { userTask } = slots(value);
  return {
    program: await program("facility-inspection"),
    start: { kind: StimulusKind.StartProcess, commandId: reserved(0), processId: "Process_FacilityInspection", instanceId,
      initialVariables: [] },
    completions: [
      userTask(1, "RecordElectricalFindings", 1, ["findings", "result"]),
      userTask(2, "RecordFireSafetyFindings", 1, ["findings", "result"]),
      effect("Summarize"),
    ],
  };
}

function committedStates({ program, start, completions }: Journey): RuntimeState[] {
  let state = initialState;
  return [start, ...completions].map(stimulus => {
    const step = advanceScenario(program, state, stimulus);
    assert.ok(step.kind === ScenarioStepKind.Committed, stimulus.commandId.slice(0, 16));
    state = step.state;
    return state;
  });
}

/** Issues each committed frontier as the ordinary-effect scheduler does and returns every request's measured bytes. */
function assertFrontiersFit(journey: Journey, label: string): number[] {
  const issued = new Set<string>();
  const measured: number[] = [];
  for (const state of committedStates(journey)) {
    const open = projectOpenEffects(state).map(open => {
      const material = projectEffectTransportMaterial(journey.program, open);
      return { key: effectTransportKey(material), request: { ...material.descriptor, idempotencyKey: effectTransportKey(material),
        arguments: material.arguments } };
    });
    const live = new Set(open.map(({ key }) => key));
    for (const key of issued) if (!live.has(key)) issued.delete(key);
    const fresh = open.filter(({ key }) => !issued.has(key));
    const requestBytes = fresh.map(({ request }) => {
      const preflight = preflightEffectActivityRequest(request);
      assert.equal(preflight.kind, EffectActivityCapacityPreflightKind.WithinCapacity, `${label} request`);
      return preflight.kind === EffectActivityCapacityPreflightKind.WithinCapacity ? preflight.observedValue : Infinity;
    });
    if (fresh.length === 0) continue;
    const reservation = assessOrdinaryEffectHistoryReservation({
      limits: { eventHistoryEventLimit: workflowChainProductionLimit(WorkflowChainBudgetKind.EventHistoryEvents),
        eventHistoryByteLimit: workflowChainProductionLimit(WorkflowChainBudgetKind.EventHistoryBytes) },
      history: { historyLength: 0, historySize: 0 }, issuedActivities: issued.size, requestBytes, hasRetainedWork: false,
    });
    assert.equal(reservation.kind, OrdinaryEffectHistoryReservationKind.Ready, `${label} History reservation`);
    for (const { key } of fresh) issued.add(key);
    measured.push(...requestBytes);
  }
  return measured;
}

for (const [label, journey] of [["facility inspection, escape-heavy", () => facilityJourney(heavy)],
  ["claim damage assessment, ASCII", () => claimJourney(ascii)]] as const) {
  test(`the ${label}, fits every hosted budget with a 1,024-byte value in every data slot`, async (context) => {
    const input = await journey();
    const actual = measureWithWorkflowEncoders(input.program, input.start, input.completions);
    for (const budget of startCapacityEnvelopeBudgets) {
      context.diagnostic(`${budget}: actual ${actual[budget]}, production ${production[budget]}`);
      assert.ok(actual[budget] <= production[budget], `${budget}: actual ${actual[budget]} exceeds production ${production[budget]}`);
    }
    for (const request of assertFrontiersFit(input, label)) context.diagnostic(`effect request: ${request}`);
  });
}

// The seeded mutations this locks: measuring ASCII instead of the escaped encoding, and counting one copy of a value that
// committed state holds several times. The copy count is read off the committed state itself, not off the measurement.
test("the escape-heavy claim is refused before commit at its double-armed frontier with a typed capacity failure", async () => {
  const { program, start, completions } = await claimJourney(heavy);
  let state = initialState;
  let publication = createCommandPublicationState(program, instanceId);
  const kinds = [start, ...completions].slice(0, 5).map(stimulus => {
    const step = advanceScenario(program, state, stimulus);
    assert.ok(step.kind === ScenarioStepKind.Committed, stimulus.commandId.slice(0, 16));
    const before = publication;
    publication = recordCommandPublicationOutcome(
      integrateCommandPublication(program, before, stimulus, step, () => 1_700_000_000_000), stimulus, step.observations);
    const candidate = preflightWorkflowSemanticCandidate({ state: step.state, publicationBefore: before, publication });
    state = step.state;
    return candidate;
  });
  assert.deepEqual(kinds.slice(0, 4).map(({ kind }) => kind), Array(4).fill(WorkflowSemanticCandidatePreflightKind.Ready));
  // The second Assess damage completion arms the second Fetch rates beside the first.
  const refused = kinds[4]!;
  assert.ok(refused.kind === WorkflowSemanticCandidatePreflightKind.CapacityExceeded);
  assert.equal(refused.failure.budget, WorkflowChainBudgetKind.CommittedRuntimeStateBytes);
  assert.equal(refused.failure.configuredBound, workflowChainProductionLimit(WorkflowChainBudgetKind.CommittedRuntimeStateBytes));
  assert.ok(refused.failure.observedValue > refused.failure.configuredBound);
});

test("committed state and effect requests are measured escaped and once per held copy", async () => {
  const escapedSlot = 6 * heavyText.length;
  for (const journey of [await claimJourney(heavy), await facilityJourney(heavy)]) {
    for (const state of committedStates(journey)) {
      const copies = JSON.stringify(state).split(JSON.stringify(heavyText).slice(1, -1)).length - 1;
      assert.ok(bytes(state) >= copies * escapedSlot, `${copies} held copies measure at least ${copies * escapedSlot} bytes`);
    }
  }
  const claim = await claimJourney(heavy);
  const requests = assertFrontiersFit(claim, "claim");
  assert.equal(requests.length, 2, "two Fetch rates requests");
  // Each request carries the heavy adjuster and estimate.
  for (const request of requests) assert.ok(request >= 2 * escapedSlot, `request ${request} counts both escaped arguments`);
  const held = committedStates(claim)[4]!;
  assert.ok(JSON.stringify(held).split(JSON.stringify(heavyText).slice(1, -1)).length - 1 >= 8,
    "both frames and both armed effects hold their heavy values at once");
});
