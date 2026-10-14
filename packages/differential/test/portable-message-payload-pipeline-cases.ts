import { CanonicalObservationKind, VariableValueKind } from "@bpmn-lean/semantic-core";
import { DisagreementKind } from "@bpmn-lean/differential";
import { TemporalCompletionDelivery, TemporalExecutionSchedule } from "@bpmn-lean/temporal-testkit";
import { PipelineReplaySelection, TemporalCaseRelation } from "./pipeline-types.ts";
import type { MutableScenarioResult, MutableStateObservation, PipelineCase } from "./pipeline-types.ts";

type PortableMessagePayloadName = "manifest-delivered" | "manifest-payload-free-refused";

function stateAt(result: MutableScenarioResult, index: number): MutableStateObservation {
  const state = result.trace[index];
  if (state?.kind !== CanonicalObservationKind.State) {
    throw new Error(`Portable Message payload calibration requires state at trace[${index}]`);
  }
  return state;
}

/** Drops the second of two equal parcels from the received manifest: the deduplication a set-shaped copy would introduce. */
function dedupeParcels(result: MutableScenarioResult): void {
  const manifest = stateAt(result, 4).variables[0]?.value;
  const parcels = manifest?.kind === VariableValueKind.Map ? manifest.value[3]?.value : undefined;
  if (parcels?.kind !== VariableValueKind.List || parcels.value.length !== 3) {
    throw new Error("Portable Message payload calibration requires the received manifest with three parcels");
  }
  parcels.value.splice(1, 1);
}

/** Withdraws the subscription that a refused payload-free delivery must leave live. */
function removeRetainedSubscription(result: MutableScenarioResult): void {
  const state = stateAt(result, 4);
  if (state.openMessageSubscriptions.length !== 1) {
    throw new Error("Portable Message payload calibration requires one subscription retained after the refusal");
  }
  state.openMessageSubscriptions.splice(0, 1);
}

const mutations = {
  "manifest-delivered": {
    inject: dedupeParcels,
    expected: {
      kind: DisagreementKind.ObservationValue,
      path: "trace[4].variables[0].value.value[3].value.value.length",
      expected: 3,
      actual: 2,
    },
  },
  "manifest-payload-free-refused": {
    inject: removeRetainedSubscription,
    expected: {
      kind: DisagreementKind.ObservationValue,
      path: "trace[4].openMessageSubscriptions.length",
      expected: 1,
      actual: 0,
    },
  },
} as const;

/** Standards-only schedules: no CIB target and no retained answer, so the mutation is the only calibration. */
export const portableMessagePayloadPipelineCases = Object.freeze((Object.keys(mutations) as PortableMessagePayloadName[]).map((name): PipelineCase => ({
  id: `portable-message-payload-${name}`,
  scenarioRelativePath: `scenarios/portable-business-message-payload/${name}.scenario.json`,
  bpmnRelativePath: "scenarios/portable-business-message-payload/process.bpmn",
  workflowIdPrefix: `portable-message-payload-${name}`,
  cib: null,
  expectedWaitTraceLength: 3,
  completionDelivery: TemporalCompletionDelivery.Ordered,
  temporalRelation: TemporalCaseRelation.ExactSemantic,
  executionSchedule: TemporalExecutionSchedule.Normal,
  effectSchedules: null,
  replaySelection: PipelineReplaySelection.Primary,
  injectMutation: mutations[name].inject,
  expectedInjectedDisagreement: mutations[name].expected,
})));
