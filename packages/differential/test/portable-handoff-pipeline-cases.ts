import { CanonicalObservationKind, VariableValueKind } from "@bpmn-lean/semantic-core";
import { DisagreementKind } from "@bpmn-lean/differential";
import { TemporalCompletionDelivery, TemporalExecutionSchedule } from "@bpmn-lean/temporal-testkit";
import { PipelineReplaySelection, TemporalCaseRelation } from "./pipeline-types.ts";
import type { MutableScenarioResult, MutableStateObservation, PipelineCase } from "./pipeline-types.ts";

type PortableHandoffName = "order-nested" | "order-revised" | "order-null";
type SelectedTask = MutableStateObservation["openUserTasks"][number];

/** The state observation at `traceIndex` and its single open task, which must be the named wait of this journey. */
function openTask(result: MutableScenarioResult, traceIndex: number, elementId: string): [MutableStateObservation, SelectedTask] {
  const observation = result.trace[traceIndex];
  const task = observation?.kind === CanonicalObservationKind.State ? observation.openUserTasks[0] : undefined;
  if (observation?.kind !== CanonicalObservationKind.State || task?.id.elementId !== elementId) {
    throw new Error(`Portable handoff calibration requires the ${elementId} wait at trace[${traceIndex}]`);
  }
  return [observation, task];
}

/** Drops the second of two equal order items: the deduplication a set-shaped or sorted copy would introduce. */
function dedupeItems(result: MutableScenarioResult): void {
  const [observation, task] = openTask(result, 2, "ReviewOrder");
  const order = task.inputs?.[0]?.value;
  const items = order?.kind === VariableValueKind.Map ? order.value[1]?.value : undefined;
  if (items?.kind !== VariableValueKind.List || items.value.length !== 2) {
    throw new Error("Portable handoff calibration requires the received order with two items");
  }
  items.value.splice(1, 1);
  observation.openUserTasks[0] = task;
}

/** Rounds the signed amount -1.25 to -1.3, the loss a binary-floating or display-scale copy would cause. */
function roundCoefficient(result: MutableScenarioResult): void {
  const [, task] = openTask(result, 12, "ArchiveOrder");
  const revision = task.inputs?.[0]?.value;
  const total = revision?.kind === VariableValueKind.Map ? revision.value[2]?.value : undefined;
  if (total?.kind !== VariableValueKind.Decimal || total.coefficient !== "-125" || total.scale !== 2) {
    throw new Error("Portable handoff calibration requires the revised amount -125 at scale 2");
  }
  total.coefficient = "-13";
  total.scale = 1;
}

/** Removes the published input of a present Null: a missing-data default would make absence and Null indistinguishable. */
function absentNull(result: MutableScenarioResult): void {
  const [, task] = openTask(result, 6, "ArchiveOrder");
  const input = task.inputs?.[0];
  if (input?.name !== "ArchiveOrder_in" || input.value.kind !== VariableValueKind.Null) {
    throw new Error("Portable handoff calibration requires the present Null input");
  }
  delete task.inputs;
}

const mutations = {
  "order-nested": {
    inject: dedupeItems,
    expected: {
      kind: DisagreementKind.ObservationValue,
      path: "trace[2].openUserTasks[0].inputs[0].value.value[1].value.value.length",
      expected: 2,
      actual: 1,
    },
  },
  "order-revised": {
    inject: roundCoefficient,
    expected: {
      kind: DisagreementKind.ObservationValue,
      path: "trace[12].openUserTasks[0].inputs[0].value.value[2].value.coefficient",
      expected: "-125",
      actual: "-13",
    },
  },
  "order-null": {
    inject: absentNull,
    expected: {
      kind: DisagreementKind.ObservationValue,
      path: "trace[6].openUserTasks[0].inputs",
      expected: [{ name: "ArchiveOrder_in", value: { kind: VariableValueKind.Null } }],
      actual: undefined,
    },
  },
} as const;

/** Standards-only schedules: no CIB target and no retained answer, so the mutation is the only calibration. */
export const portableHandoffPipelineCases = Object.freeze((Object.keys(mutations) as PortableHandoffName[]).map((name): PipelineCase => ({
  id: `portable-handoff-${name}`,
  scenarioRelativePath: `scenarios/portable-business-values-handoff/${name}.scenario.json`,
  bpmnRelativePath: "scenarios/portable-business-values-handoff/order-handoff.bpmn",
  workflowIdPrefix: `portable-handoff-${name}`,
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
