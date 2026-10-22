import { CanonicalObservationKind, CommandOutcome, VariableValueKind } from "@bpmn-lean/semantic-core";
import { DisagreementKind } from "@bpmn-lean/differential";
import { TemporalCompletionDelivery, TemporalExecutionSchedule } from "@bpmn-lean/temporal-testkit";
import { PipelineReplaySelection, TemporalCaseRelation } from "./pipeline-types.ts";
import type { MutableScenarioResult, MutableStateObservation, PipelineCase } from "./pipeline-types.ts";

type CallVariableMappingName = "loan-approved" | "loan-null-applicant" | "loan-unset-verdict";

/** A seeded mutation and the one compared observation it must move; `scenario` names the journey that exposes it. */
type NamedMutation = Readonly<{
  rule: string;
  scenario: CallVariableMappingName;
  inject: PipelineCase["injectMutation"];
  expected: PipelineCase["expectedInjectedDisagreement"];
}>;

function stateAt(result: MutableScenarioResult, index: number, elementId: string | null): MutableStateObservation {
  const state = result.trace[index];
  if (state?.kind !== CanonicalObservationKind.State) {
    throw new Error(`Call variable mapping calibration requires a state at trace[${index}]`);
  }
  if (elementId !== null && state.openUserTasks[0]?.id.elementId !== elementId) {
    throw new Error(`Call variable mapping calibration requires the ${elementId} wait at trace[${index}]`);
  }
  return state;
}

type Binding = MutableStateObservation["variables"][number];

function binding(state: MutableStateObservation, name: string): Binding | undefined {
  return state.variables.find((candidate) => candidate.name === name);
}

/**
 * The Process bindings of consecutive states share their value objects, so a seeded mutation replaces the binding in this
 * state's own array instead of editing a shared value, which would move every later state as well.
 */
function replaceBinding(state: MutableStateObservation, name: string, replacement: Binding | null): void {
  state.variables = state.variables.flatMap((candidate) => candidate.name !== name ? [candidate] : replacement === null ? [] : [replacement]);
}

function requireCommand(result: MutableScenarioResult, index: number, commandId: string) {
  const command = result.trace[index];
  if (command?.kind !== CanonicalObservationKind.Command || command.commandId !== commandId ||
      command.outcome !== CommandOutcome.Rejected) {
    throw new Error(`Call variable mapping calibration requires ${commandId} to be rejected at trace[${index}]`);
  }
  return command;
}

/**
 * CVM-ISOLATE-01: the first called task writes its namesake `amount = "1"` into the called frame, so at the next called
 * wait the Process `amount` is still "25000". A write that reached the caller hierarchy would show "1" there.
 */
function writeCalledPatchThroughCaller(result: MutableScenarioResult): void {
  const state = stateAt(result, 10, "RecordVerdict");
  const amount = binding(state, "amount");
  if (amount?.value.kind !== VariableValueKind.String || amount.value.value !== "25000") {
    throw new Error("Call variable mapping calibration requires the untouched Process amount at the second called wait");
  }
  replaceBinding(state, "amount", { name: "amount", value: { kind: VariableValueKind.String, value: "1" } });
}

/**
 * CVM-REFUSE-01: the called task is addressed with the caller instance id, which owns no such wait. A gate that resolved
 * the occurrence through the caller would commit it.
 */
function acceptCallerAddressedCompletion(result: MutableScenarioResult): void {
  requireCommand(result, 5, "refuse-caller-addressed-completion").outcome = CommandOutcome.Committed;
}

/**
 * CVM-TASK-01: `applicant` is a caller-only name; the called frame holds it only as the copy `customer`. A patch gate that
 * admitted caller names would commit it.
 */
function letCalledPatchAddCallerName(result: MutableScenarioResult): void {
  requireCommand(result, 7, "refuse-caller-only-name").outcome = CommandOutcome.Committed;
}

/**
 * CVM-IN-01: an absent `applicant` and a present null one are both copied as a present null `customer`, which the output
 * returns as the present null `echoedCustomer`. A mutant that skipped absent sources, or dropped a present null, on the
 * way in and out would leave `echoedCustomer` out of the Process at the review wait. The called frame itself is
 * runtime-only, so the Lean laws and the core journey own the input half of the rule.
 */
function leaveEchoedCustomerUnwritten(result: MutableScenarioResult): void {
  const state = stateAt(result, 8, "ConfirmDecision");
  if (binding(state, "echoedCustomer")?.value.kind !== VariableValueKind.Null) {
    throw new Error("Call variable mapping calibration requires the present null echoedCustomer at the review wait");
  }
  replaceBinding(state, "echoedCustomer", null);
}

/**
 * CVM-OUT-01: the callee never sets `verdict`, so the output overwrites the Start `decision = "old"` with a present null.
 * A mutant that skipped missing outputs would leave "old" there.
 */
function skipMissingOutput(result: MutableScenarioResult): void {
  const state = stateAt(result, 8, "ConfirmDecision");
  if (binding(state, "decision")?.value.kind !== VariableValueKind.Null) {
    throw new Error("Call variable mapping calibration requires the present null decision at the review wait");
  }
  replaceBinding(state, "decision", { name: "decision", value: { kind: VariableValueKind.String, value: "old" } });
}

/** Every named mutation, keyed by the mutant it models; `registered` picks the one that each pipeline case carries. */
export const callVariableMappingMutations = {
  "write called patches through the caller hierarchy": {
    rule: "CVM-ISOLATE-01", scenario: "loan-approved", inject: writeCalledPatchThroughCaller,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[10].variables[0].value.value", expected: "25000", actual: "1" },
  },
  "accept a caller-addressed called completion": {
    rule: "CVM-REFUSE-01", scenario: "loan-approved", inject: acceptCallerAddressedCompletion,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[5].outcome", expected: CommandOutcome.Rejected, actual: CommandOutcome.Committed },
  },
  "let called patches add caller names": {
    rule: "CVM-TASK-01", scenario: "loan-approved", inject: letCalledPatchAddCallerName,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[7].outcome", expected: CommandOutcome.Rejected, actual: CommandOutcome.Committed },
  },
  "skip an absent source": {
    rule: "CVM-IN-01", scenario: "loan-unset-verdict", inject: leaveEchoedCustomerUnwritten,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[8].variables.length", expected: 3, actual: 2 },
  },
  "skip missing outputs": {
    rule: "CVM-OUT-01", scenario: "loan-unset-verdict", inject: skipMissingOutput,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[8].variables[1].value.kind", expected: VariableValueKind.Null, actual: VariableValueKind.String },
  },
  "drop a present null": {
    rule: "CVM-IN-01", scenario: "loan-null-applicant", inject: leaveEchoedCustomerUnwritten,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[8].variables.length", expected: 4, actual: 3 },
  },
} as const satisfies Record<string, NamedMutation>;

/** A pipeline case carries one mutation; the registration test runs every other named mutation against its own journey. */
const registered = {
  "loan-approved": "write called patches through the caller hierarchy",
  "loan-null-applicant": "drop a present null",
  "loan-unset-verdict": "skip an absent source",
} as const satisfies Record<CallVariableMappingName, keyof typeof callVariableMappingMutations>;

/**
 * Standards-only schedules over the one retained loan application: no CIB target and no retained answer, so the seeded
 * mutation is the only calibration. Every journey interleaves the caller effect, called tasks and caller task in stimulus
 * order, as the nested scope-data cases do.
 */
export const callVariableMappingPipelineCases = Object.freeze((Object.keys(registered) as CallVariableMappingName[]).map((name): PipelineCase => ({
  id: `call-variable-mapping-${name}`,
  scenarioRelativePath: `scenarios/call-variable-mapping/${name}.scenario.json`,
  bpmnRelativePath: "scenarios/call-variable-mapping/loan-application.bpmn",
  sourceOverlayRelativePath: "scenarios/call-variable-mapping/loan-application-overlay.json",
  workflowIdPrefix: `call-variable-mapping-${name}`,
  cib: null,
  expectedWaitTraceLength: 3,
  completionDelivery: TemporalCompletionDelivery.Ordered,
  temporalRelation: TemporalCaseRelation.ExactSemantic,
  executionSchedule: TemporalExecutionSchedule.StimulusOrder,
  effectSchedules: null,
  replaySelection: PipelineReplaySelection.Primary,
  injectMutation: callVariableMappingMutations[registered[name]].inject,
  expectedInjectedDisagreement: callVariableMappingMutations[registered[name]].expected,
})));
