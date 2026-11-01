import { CanonicalObservationKind, CommandOutcome, VariableValueKind } from "@bpmn-lean/semantic-core";
import { DisagreementKind } from "@bpmn-lean/differential";
import { TemporalCompletionDelivery, TemporalExecutionSchedule } from "@bpmn-lean/temporal-testkit";
import { PipelineReplaySelection, TemporalCaseRelation } from "./pipeline-types.ts";
import type { MutableScenarioResult, PipelineCase } from "./pipeline-types.ts";

type ConcurrentMappedCallsName = "supplier-compliance-first" | "supplier-financial-first" | "travel-request";

/** A seeded mutation and the one compared observation it must move; `scenario` names the journey that exposes it. */
type NamedMutation = Readonly<{
  rule: string;
  scenario: ConcurrentMappedCallsName;
  inject: PipelineCase["injectMutation"];
  expected: PipelineCase["expectedInjectedDisagreement"];
}>;

/** Replaces the outcome of the command at `trace[index]`, which must be `commandId` with `outcome`. */
function flipOutcome(result: MutableScenarioResult, index: number, commandId: string, outcome: CommandOutcome,
  replacement: CommandOutcome): void {
  const command = result.trace[index];
  if (command?.kind !== CanonicalObservationKind.Command || command.commandId !== commandId || command.outcome !== outcome) {
    throw new Error(`Concurrent mapped Calls calibration requires ${commandId} to be ${outcome} at trace[${index}]`);
  }
  command.outcome = replacement;
}

/**
 * CMCALL-OWN-01, CMCALL-OUT-01: the compliance call is invoked second, so selecting called-root mappings by called
 * definition would give it the financial Call's mappings; its first public divergence is that the compliance expert's
 * patch of the financial output source `opinion` commits, returning the compliance call with the financial mappings.
 */
function selectMappingsByDefinition(result: MutableScenarioResult): void {
  flipOutcome(result, 9, "refuse-compliance-patch-of-the-financial-output", CommandOutcome.Rejected, CommandOutcome.Committed);
}

/** CMCALL-TASK-01: allowing a called task the patch names of every Call of its definition accepts `finding` from the financial expert. */
function allowPatchNamesByDefinition(result: MutableScenarioResult): void {
  flipOutcome(result, 7, "refuse-financial-patch-of-the-compliance-output", CommandOutcome.Rejected, CommandOutcome.Committed);
}

/** CMCALL-REFUSE-01: routing a called completion by definition accepts the financial task under the compliance identity. */
function routeCompletionByDefinition(result: MutableScenarioResult): void {
  flipOutcome(result, 11, "refuse-compliance-addressed-financial-task", CommandOutcome.Rejected, CommandOutcome.Committed);
}

/**
 * CMCALL-OUT-01: writing the financial return from the hosting root puts `verdict` in the Process and leaves the
 * review's `verdict` at its initial "pending", which the Financial review's output then publishes.
 */
function writeOutputFromHostingRoot(result: MutableScenarioResult): void {
  const state = result.trace[8];
  const verdict = state?.kind === CanonicalObservationKind.State ? state.variables[0] : undefined;
  if (state?.kind !== CanonicalObservationKind.State || verdict?.name !== "financialVerdict" ||
      verdict.value.kind !== VariableValueKind.String || verdict.value.value !== "solvent") {
    throw new Error("Concurrent mapped Calls calibration requires the solvent financialVerdict at trace[8]");
  }
  // Consecutive states share their binding objects, so the mutation replaces this state's array; bindings stay sorted.
  state.variables = [...state.variables.with(0, { name: "financialVerdict", value: { kind: VariableValueKind.String, value: "pending" } }),
    { name: "verdict", value: { kind: VariableValueKind.String, value: "solvent" } }];
}

/** CMCALL-PREPARE-01: leaving mapped invocations on the singleton path makes the Start's internal choice ambiguous. */
function leaveInvocationsSingleton(result: MutableScenarioResult): void {
  flipOutcome(result, 1, "start-process", CommandOutcome.Committed, CommandOutcome.RolledBack);
}

const outcome = (index: number, expected: CommandOutcome, actual: CommandOutcome) =>
  ({ kind: DisagreementKind.ObservationValue, path: `trace[${index}].outcome`, expected, actual }) as const;

/** Every named mutation, keyed by the mutant it models; `registered` picks the one that each pipeline case carries. */
export const concurrentMappedCallsMutations = {
  "select the called-root mappings by called definition": {
    rule: "CMCALL-OWN-01", scenario: "supplier-compliance-first", inject: selectMappingsByDefinition,
    expected: outcome(9, CommandOutcome.Rejected, CommandOutcome.Committed),
  },
  "allow the patch names of every Call of the definition": {
    rule: "CMCALL-TASK-01", scenario: "supplier-compliance-first", inject: allowPatchNamesByDefinition,
    expected: outcome(7, CommandOutcome.Rejected, CommandOutcome.Committed),
  },
  "route a called completion by definition": {
    rule: "CMCALL-REFUSE-01", scenario: "supplier-compliance-first", inject: routeCompletionByDefinition,
    expected: outcome(11, CommandOutcome.Rejected, CommandOutcome.Committed),
  },
  "write the output from the hosting root": {
    rule: "CMCALL-OUT-01", scenario: "supplier-financial-first", inject: writeOutputFromHostingRoot,
    // The comparator reports the binding count before any value, so the extra Process `verdict` comes first.
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[8].variables.length", expected: 2, actual: 3 },
  },
  "leave mapped invocations on the singleton path": {
    rule: "CMCALL-PREPARE-01", scenario: "travel-request", inject: leaveInvocationsSingleton,
    expected: outcome(1, CommandOutcome.Committed, CommandOutcome.RolledBack),
  },
} as const satisfies Record<string, NamedMutation>;

/** A pipeline case carries one mutation; the registration test runs every other named mutation against its own journey. */
const registered = {
  "supplier-compliance-first": "select the called-root mappings by called definition",
  "supplier-financial-first": "write the output from the hosting root",
  "travel-request": "leave mapped invocations on the singleton path",
} as const satisfies Record<ConcurrentMappedCallsName, keyof typeof concurrentMappedCallsMutations>;

const models = {
  "supplier-compliance-first": "supplier-onboarding",
  "supplier-financial-first": "supplier-onboarding",
  "travel-request": "travel-request",
} as const satisfies Record<ConcurrentMappedCallsName, string>;

/**
 * Standards-only schedules over the two retained models, with no CIB target and no retained answer, so the seeded
 * mutation is the only calibration. Stimulus order realizes each expert completion order.
 */
export const concurrentMappedCallsPipelineCases = Object.freeze(
  (Object.keys(registered) as ConcurrentMappedCallsName[]).map((name): PipelineCase => ({
    id: `concurrent-mapped-calls-${name}`,
    scenarioRelativePath: `scenarios/concurrent-mapped-calls/${name}.scenario.json`,
    bpmnRelativePath: `scenarios/concurrent-mapped-calls/${models[name]}.bpmn`,
    workflowIdPrefix: `concurrent-mapped-calls-${name}`,
    cib: null,
    expectedWaitTraceLength: 3,
    completionDelivery: TemporalCompletionDelivery.Ordered,
    temporalRelation: TemporalCaseRelation.ExactSemantic,
    executionSchedule: TemporalExecutionSchedule.StimulusOrder,
    effectSchedules: null,
    replaySelection: PipelineReplaySelection.Primary,
    injectMutation: concurrentMappedCallsMutations[registered[name]].inject,
    expectedInjectedDisagreement: concurrentMappedCallsMutations[registered[name]].expected,
  })),
);
