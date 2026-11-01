/**
 * Measures the two retained concurrent mapped Calls models against every hosted budget, the capacity measurement of the
 * concurrent mapped Calls specification. The profile claims no Start capacity envelope, so the oracle is each budget's production
 * limit, not an estimate; this is a component measurement of these two models, not a claim about other Programs.
 *
 * Every data slot holds a 1,024-byte String: escape-heavy U+0001, whose canonical encoding `\u0001` costs six bytes per
 * byte, or plain ASCII. Each journey patches every name its task may write, so both called-root frames and both review
 * frames are filled while both expert calls are live, and runs through the Workflow's own candidate preflight. The models
 * hold no Service Task, so no effect request or ordinary-effect History reservation arises.
 *
 * Measured on 2026-11-01: both models fit every budget escape-heavy. The tightest are the supplier's committed state,
 * 52,852 of 65,536 bytes, and its Query response, 161,132 of 196,608, both while both expert calls are live.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  ScenarioStepKind, SemanticProfileId, StimulusKind, VariableValueKind, advanceScenario, deriveCalledProcessInstanceId,
  initialState,
} from "@bpmn-lean/semantic-core";
import type { SemanticProcessProgram, StartProcessStimulus, Stimulus, VariableBinding } from "@bpmn-lean/semantic-core";
import { productionStartCapacityEnvelopeLimits, reservedFutureCommandIdBytes, startCapacityEnvelopeBudgets }
  from "@bpmn-lean/temporal-protocol";

import {
  WorkflowSemanticCandidatePreflightKind, createCommandPublicationState, integrateCommandPublication, preflightWorkflowSemanticCandidate,
  recordCommandPublicationOutcome,
} from "../dist/index.js";
import { measureWithWorkflowEncoders } from "./start-capacity-encoder-measurement.ts";

const directory = new URL("../../../../scenarios/concurrent-mapped-calls/", import.meta.url);
const production = productionStartCapacityEnvelopeLimits();
const heavy = { kind: VariableValueKind.String, value: "\u0001".repeat(1_024) } as const;
const ascii = { kind: VariableValueKind.String, value: "a".repeat(1_024) } as const;
type Slot = typeof heavy | typeof ascii;
// The profile refuses a hosting instance identity above 256 UTF-8 bytes before Workflow creation.
const instanceId = "I".repeat(256);
const reserved = (ordinal: number) => `${"c".repeat(reservedFutureCommandIdBytes - 1)}${ordinal}`;

async function program(model: "supplier-onboarding" | "travel-request"): Promise<SemanticProcessProgram> {
  const compiled = await compileBpmnToSemanticProcess({
    bytes: await readFile(new URL(`${model}.bpmn`, directory)), sourceId: `${model}-capacity`, expectedSha256: undefined,
    sourceOverlay: null, semanticProfile: SemanticProfileId.EmbeddedSubProcessCompletion,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  if (compiled.status !== BpmnCompilationStatus.Accepted) throw new Error(`${model} was refused: ${JSON.stringify(compiled)}`);
  return compiled.semanticProcess;
}

type Journey = Readonly<{ program: SemanticProcessProgram; start: StartProcessStimulus; completions: readonly Stimulus[] }>;

function slots(value: Slot) {
  const bind = (name: string): VariableBinding => ({ name, value });
  const userTask = (ordinal: number, processInstanceId: string, elementId: string, activation: number,
    names: readonly string[]): Stimulus => ({
    kind: StimulusKind.CompleteUserTaskInstance, commandId: reserved(ordinal),
    taskId: { processInstanceId, elementId, activation }, submittedValues: names.map(bind) });
  return { bind, userTask };
}

/** Both reviews fill their locals, then both experts revise their input and answer while the other call is live. */
async function supplierJourney(value: Slot): Promise<Journey> {
  const { bind, userTask } = slots(value);
  const financial = deriveCalledProcessInstanceId(instanceId, "FinancialExpertOpinion", 1);
  const compliance = deriveCalledProcessInstanceId(instanceId, "ComplianceExpertOpinion", 1);
  return {
    program: await program("supplier-onboarding"),
    start: { kind: StimulusKind.StartProcess, commandId: reserved(0), processId: "Process_SupplierOnboarding", instanceId,
      initialVariables: [bind("supplierName")] },
    completions: [
      userTask(1, instanceId, "PrepareFinancialFile", 1, ["file", "verdict"]),
      userTask(2, instanceId, "PrepareComplianceFile", 1, ["file", "verdict"]),
      userTask(3, compliance, "GiveExpertOpinion", 2, ["finding", "screeningFile"]),
      userTask(4, financial, "GiveExpertOpinion", 1, ["dossier", "opinion"]),
      userTask(5, instanceId, "ApproveSupplier", 1, []),
    ],
  };
}

/** One Start batch opens both checks and Booking; every check and the booking fill the names they may write. */
async function travelJourney(value: Slot): Promise<Journey> {
  const { bind, userTask } = slots(value);
  return {
    program: await program("travel-request"),
    start: { kind: StimulusKind.StartProcess, commandId: reserved(0), processId: "Process_TravelRequest", instanceId,
      initialVariables: [bind("approvedBudget"), bind("traveller"), bind("visaStatus")] },
    completions: [
      userTask(1, instanceId, "BookTravel", 1, ["budget"]),
      userTask(2, deriveCalledProcessInstanceId(instanceId, "BudgetCheck", 1), "CheckBudget", 1, ["confirmedBudget", "traveller"]),
      userTask(3, deriveCalledProcessInstanceId(instanceId, "VisaCheck", 1), "CheckVisa", 1, ["traveller", "visaDecision"]),
    ],
  };
}

/** Each committed successor through the Workflow's candidate preflight; returns the preflight kinds in order. */
function candidateKinds({ program, start, completions }: Journey): WorkflowSemanticCandidatePreflightKind[] {
  let state = initialState;
  let publication = createCommandPublicationState(program, instanceId);
  return [start, ...completions].map(stimulus => {
    const step = advanceScenario(program, state, stimulus);
    assert.ok(step.kind === ScenarioStepKind.Committed, stimulus.commandId.slice(-2));
    const before = publication;
    publication = recordCommandPublicationOutcome(
      integrateCommandPublication(program, before, stimulus, step, () => 1_700_000_000_000), stimulus, step.observations);
    state = step.state;
    return preflightWorkflowSemanticCandidate({ state: step.state, publicationBefore: before, publication }).kind;
  });
}

for (const [label, journey] of [
  ["supplier onboarding, escape-heavy", () => supplierJourney(heavy)],
  ["supplier onboarding, ASCII", () => supplierJourney(ascii)],
  ["travel request, escape-heavy", () => travelJourney(heavy)],
  ["travel request, ASCII", () => travelJourney(ascii)],
] as const) {
  test(`the ${label}, fits every hosted budget with a 1,024-byte value in every data slot`, async (context) => {
    const input = await journey();
    const actual = measureWithWorkflowEncoders(input.program, input.start, input.completions);
    for (const budget of startCapacityEnvelopeBudgets) {
      context.diagnostic(`${budget}: actual ${actual[budget]}, production ${production[budget]}`);
      assert.ok(actual[budget] <= production[budget], `${budget}: actual ${actual[budget]} exceeds production ${production[budget]}`);
    }
    assert.deepEqual(candidateKinds(input),
      Array(1 + input.completions.length).fill(WorkflowSemanticCandidatePreflightKind.Ready));
  });
}
