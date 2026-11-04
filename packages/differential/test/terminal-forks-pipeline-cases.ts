import { CanonicalObservationKind, ProcessStatus } from "@bpmn-lean/semantic-core";
import { DisagreementKind } from "@bpmn-lean/differential";
import { TemporalCompletionDelivery, TemporalExecutionSchedule } from "@bpmn-lean/temporal-testkit";
import { openWork } from "./concurrent-scope-service-tasks-pipeline-cases.ts";
import { PipelineReplaySelection, TemporalCaseRelation } from "./pipeline-types.ts";
import type { MutableScenarioResult, PipelineCase } from "./pipeline-types.ts";

type TerminalForksName = "offboarding-equipment-first" | "offboarding-access-first" | "office-move";

/**
 * Completing a scope at an End while a sibling branch is live: the root at `index` with `open` still open, the wrong
 * algorithm `TFK-QUIESCE-01` excludes.
 */
function rootCompletesAt(index: number, open: readonly string[]): PipelineCase["injectMutation"] {
  return (result: MutableScenarioResult) => {
    const state = result.trace[index];
    if (state?.kind !== CanonicalObservationKind.State || state.status !== ProcessStatus.Running ||
      openWork(state).join() !== open.join()) {
      throw new Error(`Terminal fork calibration requires a running Process with ${open.join(", ")} open at trace[${index}]`);
    }
    result.trace[index] = { ...state, status: ProcessStatus.Completed };
  };
}

/**
 * TFK-QUIESCE-01 in a body: *Clear old office* completing at the first wait-free End of its entry closure would arm
 * *Confirm new office* in place of *Pack desk* after the booking result at `trace[4]`.
 */
function subProcessCompletesAtFirstEnd(result: MutableScenarioResult): void {
  const state = result.trace[4];
  const open = state?.kind === CanonicalObservationKind.State ? state.openUserTasks : [];
  if (state?.kind !== CanonicalObservationKind.State || open.length !== 1 || open[0]!.id.elementId !== "PackDesk") {
    throw new Error("Terminal fork calibration requires PackDesk alone open at trace[4]");
  }
  result.trace[4] = { ...state, openUserTasks: [{ ...open[0]!, id: { ...open[0]!.id, elementId: "ConfirmNewOffice" } }] };
}

const cases = {
  // The lookup closure's *Departure recorded* End is the root's first End.
  "offboarding-equipment-first": {
    model: "employee-offboarding",
    inject: rootCompletesAt(4, ["CollectEquipment#1", "RevokeSystemAccess#1"]),
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[4].status",
      expected: ProcessStatus.Running, actual: ProcessStatus.Completed },
  },
  // *Access revoked*, the first End of a waiting branch, while *Collect equipment* is open.
  "offboarding-access-first": {
    model: "employee-offboarding",
    inject: rootCompletesAt(6, ["CollectEquipment#1"]),
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[6].status",
      expected: ProcessStatus.Running, actual: ProcessStatus.Completed },
  },
  "office-move": {
    model: "office-move",
    inject: subProcessCompletesAtFirstEnd,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[4].openUserTasks[0].id.elementId",
      expected: "PackDesk", actual: "ConfirmNewOffice" },
  },
} as const satisfies Record<TerminalForksName, Readonly<{
  model: string;
  inject: PipelineCase["injectMutation"];
  expected: PipelineCase["expectedInjectedDisagreement"];
}>>;

/**
 * Standards-only schedules over the terminal forks witness models, with no CIB target and no retained answer, so each
 * seeded mutation is the only calibration. Stimulus order realizes each schedule through the testkit's ordered Activity
 * release and ordered completion delivery.
 */
export const terminalForksPipelineCases = Object.freeze(
  (Object.keys(cases) as TerminalForksName[]).map((name): PipelineCase => ({
    id: `terminal-forks-${name}`,
    scenarioRelativePath: `scenarios/terminal-forks/${name}.scenario.json`,
    bpmnRelativePath: `scenarios/terminal-forks/${cases[name].model}.bpmn`,
    sourceOverlayRelativePath: `scenarios/terminal-forks/${cases[name].model}-overlay.json`,
    workflowIdPrefix: `terminal-forks-${name}`,
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
