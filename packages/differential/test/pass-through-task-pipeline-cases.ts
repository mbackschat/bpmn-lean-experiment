import { CanonicalObservationKind, ProcessStatus } from "@bpmn-lean/semantic-core";
import { DisagreementKind } from "@bpmn-lean/differential";
import { TemporalCompletionDelivery, TemporalExecutionSchedule } from "@bpmn-lean/temporal-testkit";
import { PipelineReplaySelection, TemporalCaseRelation } from "./pipeline-types.ts";
import type { MutableScenarioResult, PipelineCase } from "./pipeline-types.ts";

type PassThroughTaskName = "equipment-return" | "intake-illegible-twice-then-paper" | "intake-digital";

/**
 * PTT-PASS-01: a pass-through Task lowered as a User Task wait would stand open where the next real wait stands, so the
 * state at `trace[index]` shows `task` in place of `expected`; only the element moves, so the comparison names it.
 */
function waitAt(index: number, expected: string, task: string) {
  return (result: MutableScenarioResult): void => {
    const state = result.trace[index];
    const open = state?.kind === CanonicalObservationKind.State ? state.openUserTasks : [];
    if (state?.kind !== CanonicalObservationKind.State || open.length !== 1 || open[0]!.id.elementId !== expected) {
      throw new Error(`Pass-through Task calibration requires ${expected} alone open at trace[${index}]`);
    }
    result.trace[index] = { ...state, openUserTasks: [{ ...open[0]!, id: { ...open[0]!.id, elementId: task } }] };
  };
}

/** PTT-PASS-01: a plain Task that waited on the default branch would leave the Process running after the classification. */
function registrationWaits(result: MutableScenarioResult): void {
  const state = result.trace[4];
  if (state?.kind !== CanonicalObservationKind.State || state.status !== ProcessStatus.Completed) {
    throw new Error("Pass-through Task calibration requires the intake completed at trace[4]");
  }
  result.trace[4] = { ...state, status: ProcessStatus.Running };
}

const cases = {
  "equipment-return": {
    model: "equipment-return", inject: waitAt(4, "RecordCondition", "UnpackEquipment"),
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[4].openUserTasks[0].id.elementId",
      expected: "RecordCondition", actual: "UnpackEquipment" },
  },
  "intake-illegible-twice-then-paper": {
    model: "document-intake", inject: waitAt(4, "RecordDocumentFormat", "PhoneSender"),
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[4].openUserTasks[0].id.elementId",
      expected: "RecordDocumentFormat", actual: "PhoneSender" },
  },
  "intake-digital": {
    model: "document-intake", inject: registrationWaits,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[4].status", expected: "completed", actual: "running" },
  },
} as const satisfies Record<PassThroughTaskName, Readonly<{
  model: string;
  inject: PipelineCase["injectMutation"];
  expected: PipelineCase["expectedInjectedDisagreement"];
}>>;

/**
 * Standards-only schedules over the two retained pass-through Task models, with no CIB target and no retained answer, so
 * each seeded mutation is the only calibration. A pass-through Task never waits, so its occurrences appear only in the
 * command publications, which the publication agreement test compares between Lean and the core.
 */
export const passThroughTaskPipelineCases = Object.freeze(
  (Object.keys(cases) as PassThroughTaskName[]).map((name): PipelineCase => ({
    id: `pass-through-task-${name}`,
    scenarioRelativePath: `scenarios/pass-through-task/${name}.scenario.json`,
    bpmnRelativePath: `scenarios/pass-through-task/${cases[name].model}.bpmn`,
    sourceOverlayRelativePath: `scenarios/pass-through-task/${cases[name].model}-overlay.json`,
    workflowIdPrefix: `pass-through-task-${name}`,
    cib: null,
    expectedWaitTraceLength: 3,
    completionDelivery: TemporalCompletionDelivery.Ordered,
    temporalRelation: TemporalCaseRelation.ExactSemantic,
    executionSchedule: TemporalExecutionSchedule.StimulusOrder,
    effectSchedules: null,
    replaySelection: PipelineReplaySelection.Primary,
    injectMutation: cases[name].inject,
    expectedInjectedDisagreement: cases[name].expected,
  })),
);
