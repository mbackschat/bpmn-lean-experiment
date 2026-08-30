/** Staged Lean/core Message payload cases and their public-observation mutations. */
import {
  CanonicalObservationKind,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import { DisagreementKind } from "@bpmn-lean/differential";

import type {
  MutableScenarioResult,
  MutableStateObservation,
  ObservationValueDisagreement,
  SemanticDifferentialCase,
} from "./pipeline-types.ts";

const scenarioRoot = "scenarios/message-payload-catch";
const finalStateIndex = 4;

type MessagePayloadCatchLeanCoreCase =
  SemanticDifferentialCase & Readonly<{ cib: null }>;

function finalState(result: MutableScenarioResult): MutableStateObservation {
  const observation = result.trace[finalStateIndex];
  if (observation?.kind !== CanonicalObservationKind.State) {
    throw new Error(
      "Message payload catch calibration requires the final state at trace[4]",
    );
  }
  return observation;
}

function writtenProperty(
  result: MutableScenarioResult,
): MutableStateObservation["variables"][number] {
  const binding = finalState(result).variables[0];
  if (
    binding === undefined ||
    binding.name !== "Property_SettlementReference"
  ) {
    throw new Error(
      "Message payload catch calibration requires the associated Process Property",
    );
  }
  return binding;
}

/** Publishes the Event DataOutput identity where the associated Property belongs. */
function nameBindingAfterDataOutput(result: MutableScenarioResult): void {
  writtenProperty(result).name = "DataOutput_ConfirmedReference";
}

/** Collapses an explicit null payload into an empty String. */
function writeNullAsEmptyString(result: MutableScenarioResult): void {
  const binding = writtenProperty(result);
  if (binding.value.kind !== VariableValueKind.Null) {
    throw new Error(
      "Message payload null calibration requires an explicit null binding",
    );
  }
  binding.value = { kind: VariableValueKind.String, value: "" };
}

/** Withdraws the subscription that an absent payload must leave live. */
function removeRetainedSubscription(result: MutableScenarioResult): void {
  const state = finalState(result);
  if (state.openMessageSubscriptions.length !== 1) {
    throw new Error(
      "Message payload absence calibration requires one retained subscription",
    );
  }
  state.openMessageSubscriptions.splice(0, 1);
}

function messagePayloadCatchCase(
  id: string,
  scenarioFile: string,
  injectMutation: SemanticDifferentialCase["injectMutation"],
  expectedInjectedDisagreement: ObservationValueDisagreement,
): MessagePayloadCatchLeanCoreCase {
  return Object.freeze({
    id,
    scenarioRelativePath: `${scenarioRoot}/${scenarioFile}`,
    bpmnRelativePath: `${scenarioRoot}/process.bpmn`,
    cib: null,
    injectMutation,
    expectedInjectedDisagreement,
  });
}

export const messagePayloadCatchLeanCoreCases = Object.freeze([
  messagePayloadCatchCase(
    "message-payload-catch-supplied-scalar",
    "supplied-scalar.scenario.json",
    nameBindingAfterDataOutput,
    {
      kind: DisagreementKind.ObservationValue,
      path: "trace[4].variables[0].name",
      expected: "Property_SettlementReference",
      actual: "DataOutput_ConfirmedReference",
    },
  ),
  messagePayloadCatchCase(
    "message-payload-catch-supplied-null",
    "supplied-null.scenario.json",
    writeNullAsEmptyString,
    {
      kind: DisagreementKind.ObservationValue,
      path: "trace[4].variables[0].value.kind",
      expected: VariableValueKind.Null,
      actual: VariableValueKind.String,
    },
  ),
  messagePayloadCatchCase(
    "message-payload-catch-absent-payload",
    "absent-payload.scenario.json",
    removeRetainedSubscription,
    {
      kind: DisagreementKind.ObservationValue,
      path: "trace[4].openMessageSubscriptions.length",
      expected: 1,
      actual: 0,
    },
  ),
]);
