import { CanonicalObservationKind, CommandOutcome, VariableValueKind } from "@bpmn-lean/semantic-core";
import { DisagreementKind } from "@bpmn-lean/differential";
import { TemporalCompletionDelivery, TemporalExecutionSchedule } from "@bpmn-lean/temporal-testkit";
import { PipelineReplaySelection, TemporalCaseRelation } from "./pipeline-types.ts";
import type { MutableScenarioResult, MutableStateObservation, PipelineCase } from "./pipeline-types.ts";

type EmbeddedMappedCallsName = "guarantor-verified" | "guarantor-absent";

/** A seeded mutation and the one compared observation it must move; `scenario` names the journey that exposes it. */
type NamedMutation = Readonly<{
  rule: string;
  scenario: EmbeddedMappedCallsName;
  inject: PipelineCase["injectMutation"];
  expected: PipelineCase["expectedInjectedDisagreement"];
}>;

function stateAt(result: MutableScenarioResult, index: number, elementId: string): MutableStateObservation {
  const state = result.trace[index];
  if (state?.kind !== CanonicalObservationKind.State || state.openUserTasks[0]?.id.elementId !== elementId) {
    throw new Error(`Embedded mapped Calls calibration requires the ${elementId} wait at trace[${index}]`);
  }
  return state;
}

type Binding = MutableStateObservation["variables"][number];

function stringBinding(state: MutableStateObservation, name: string): string | undefined {
  const value = state.variables.find((candidate) => candidate.name === name)?.value;
  return value?.kind === VariableValueKind.String ? value.value : undefined;
}

/**
 * Consecutive states share their binding objects, so a mutation builds this state's own array instead of editing a shared
 * value, which would move every later state as well.
 */
function withBinding(state: MutableStateObservation, replacement: Binding): void {
  state.variables = [...state.variables.filter(({ name }) => name !== replacement.name), replacement]
    .toSorted((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
}

function requireRejected(result: MutableScenarioResult, index: number, commandId: string) {
  const command = result.trace[index];
  if (command?.kind !== CanonicalObservationKind.Command || command.commandId !== commandId ||
      command.outcome !== CommandOutcome.Rejected) {
    throw new Error(`Embedded mapped Calls calibration requires ${commandId} to be rejected at trace[${index}]`);
  }
  return command;
}

/**
 * CALLN-FRAME-01: the guarantor Call returns `verdict` into `guarantorVerdict`, which the Guarantor review frame declares,
 * so at the Confirm guarantor wait the Process holds no `guarantorVerdict`. A return that wrote from the hosting root would
 * show it there before the Sub-Process publishes it.
 */
function writeOutputFromHostingRoot(result: MutableScenarioResult): void {
  const state = stateAt(result, 20, "ConfirmGuarantor");
  if (stringBinding(state, "guarantorVerdict") !== undefined) {
    throw new Error("Embedded mapped Calls calibration requires no Process guarantorVerdict at the Confirm guarantor wait");
  }
  withBinding(state, { name: "guarantorVerdict", value: { kind: VariableValueKind.String, value: "rejected" } });
}

/**
 * CALLN-FRAME-01: the second Call's return is lowered with its own outputs, so `verdict` goes to `guarantorVerdict`. A
 * return lowered with the first Call's outputs instead overwrites the applicant's "rejected" with the guarantor's
 * "approved".
 */
function returnWithFirstCallOutputs(result: MutableScenarioResult): void {
  const state = stateAt(result, 12, "ConfirmGuarantor");
  if (stringBinding(state, "applicantVerdict") !== "rejected") {
    throw new Error("Embedded mapped Calls calibration requires the applicant's rejected verdict at the Confirm guarantor wait");
  }
  withBinding(state, { name: "applicantVerdict", value: { kind: VariableValueKind.String, value: "approved" } });
}

/**
 * CALLN-FRAME-01, the proposal's wrong algorithm 5: the guarantor instance's patchable names come from the live record's
 * own Call, which copies no `amount`. Selecting the called root's mappings by called definition would take the first
 * Call's, which copies `amount`, and accept the patch.
 */
function acceptFirstCallNamePatch(result: MutableScenarioResult): void {
  requireRejected(result, 15, "refuse-guarantor-patch-of-an-applicant-only-name").outcome = CommandOutcome.Committed;
}

/**
 * CALLN-REFUSE-01: the applicant instance has returned, so its Record verdict is stale. Accepting it would let the first
 * call's completion write while the second call is live.
 */
function acceptStaleFirstCallCompletion(result: MutableScenarioResult): void {
  requireRejected(result, 9, "refuse-stale-applicant-record-verdict").outcome = CommandOutcome.Committed;
}

/**
 * CALLN-REFUSE-01: the live Collect identity document activation 2 belongs to the guarantor instance, so addressing it with
 * the returned applicant instance's identity is refused although element and activation match.
 */
function acceptCrossAddressedCompletion(result: MutableScenarioResult): void {
  requireRejected(result, 11, "refuse-applicant-addressed-completion").outcome = CommandOutcome.Committed;
}

/** Every named mutation, keyed by the mutant it models; `registered` picks the one that each pipeline case carries. */
export const embeddedMappedCallsMutations = {
  "write the output from the hosting root": {
    rule: "CALLN-FRAME-01", scenario: "guarantor-verified", inject: writeOutputFromHostingRoot,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[20].variables.length", expected: 4, actual: 5 },
  },
  "lower the second return with the first Call's outputs": {
    rule: "CALLN-FRAME-01", scenario: "guarantor-absent", inject: returnWithFirstCallOutputs,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[12].variables[2].value.value", expected: "rejected", actual: "approved" },
  },
  "select the called root's mappings by called definition": {
    rule: "CALLN-FRAME-01", scenario: "guarantor-verified", inject: acceptFirstCallNamePatch,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[15].outcome", expected: CommandOutcome.Rejected, actual: CommandOutcome.Committed },
  },
  "accept a stale first-call completion": {
    rule: "CALLN-REFUSE-01", scenario: "guarantor-verified", inject: acceptStaleFirstCallCompletion,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[9].outcome", expected: CommandOutcome.Rejected, actual: CommandOutcome.Committed },
  },
  "accept a completion addressed to the returned instance": {
    rule: "CALLN-REFUSE-01", scenario: "guarantor-verified", inject: acceptCrossAddressedCompletion,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[11].outcome", expected: CommandOutcome.Rejected, actual: CommandOutcome.Committed },
  },
} as const satisfies Record<string, NamedMutation>;

/** A pipeline case carries one mutation; the registration test runs every other named mutation against its own journey. */
const registered = {
  "guarantor-verified": "write the output from the hosting root",
  "guarantor-absent": "lower the second return with the first Call's outputs",
} as const satisfies Record<EmbeddedMappedCallsName, keyof typeof embeddedMappedCallsMutations>;

/**
 * Standards-only schedules over the retained guarantor loan: no CIB target and no retained answer, so the seeded mutation
 * is the only calibration. Each journey interleaves the caller effect, called tasks and caller task in stimulus order.
 */
export const embeddedMappedCallsPipelineCases = Object.freeze((Object.keys(registered) as EmbeddedMappedCallsName[]).map((name): PipelineCase => ({
  id: `repeated-nested-calls-${name}`,
  scenarioRelativePath: `scenarios/repeated-nested-concurrent-calls/${name}.scenario.json`,
  bpmnRelativePath: "scenarios/repeated-nested-concurrent-calls/guarantor-loan.bpmn",
  sourceOverlayRelativePath: "scenarios/repeated-nested-concurrent-calls/guarantor-loan-overlay.json",
  workflowIdPrefix: `repeated-nested-calls-${name}`,
  cib: null,
  expectedWaitTraceLength: 3,
  completionDelivery: TemporalCompletionDelivery.Ordered,
  temporalRelation: TemporalCaseRelation.ExactSemantic,
  executionSchedule: TemporalExecutionSchedule.StimulusOrder,
  effectSchedules: null,
  replaySelection: PipelineReplaySelection.Primary,
  injectMutation: embeddedMappedCallsMutations[registered[name]].inject,
  expectedInjectedDisagreement: embeddedMappedCallsMutations[registered[name]].expected,
})));
