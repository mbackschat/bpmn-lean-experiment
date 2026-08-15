/** Test-owned defective occurrence publication candidates for the Workflow relation. */
import {
  FlowNodeOccurrenceTerminalKind,
  ScenarioStepKind,
} from "@bpmn-lean/semantic-core";
import type {
  ScenarioStep,
  UnnumberedFlowNodeOccurrenceDelta,
} from "@bpmn-lean/semantic-core";

import type {
  CommandPublicationState,
} from "../dist/command-publication-integration.js";

type TemporalHistoryFact = Readonly<{ eventId: number }>;

/** Replaces the occurrence head and visible count with host Event History facts. */
export function historyDerivedPublicationCandidate(
  exact: CommandPublicationState,
  history: readonly TemporalHistoryFact[],
): CommandPublicationState {
  const seed = exact.flowNodeOccurrences.currentOpen[0];
  const currentOpen = seed === undefined
    ? []
    : history.map((_, index) => ({
        ...seed,
        id: {
          ...seed.id,
          startRevision: index + 1,
          startIndex: 0,
        },
      }));
  return {
    ...exact,
    flowNodeOccurrences: {
      ...exact.flowNodeOccurrences,
      headRevision: history.length,
      currentOpen,
    },
  };
}

/** Replaces exact transition lifecycles with a before/after open-state difference. */
export function stateDifferencePublicationStep(
  before: CommandPublicationState,
  exactAfter: CommandPublicationState,
  exactStep: ScenarioStep,
): ScenarioStep {
  if (
    exactStep.kind !== ScenarioStepKind.Committed ||
    exactStep.flowNodeOccurrenceLifecycles === null
  ) {
    throw new TypeError("state-difference mutation requires a committed lifecycle");
  }
  const beforeOpen = before.flowNodeOccurrences.currentOpen;
  const afterOpen = exactAfter.flowNodeOccurrences.currentOpen;
  const started = afterOpen.filter((candidate) =>
    !beforeOpen.some(({ id }) => samePublicId(id, candidate.id))
  ).map((candidate) => {
    const retained = exactAfter.flowNodeOccurrences.retainedOpen.find(({ occurrence }) =>
      samePublicId(occurrence.id, candidate.id));
    if (retained === undefined) {
      throw new TypeError("state-difference mutation lost a started anchor");
    }
    return {
      anchor: retained.anchor,
      processId: candidate.processId,
      elementId: candidate.elementId,
      owner: candidate.owner,
    };
  });
  const ended = beforeOpen.filter((candidate) =>
    !afterOpen.some(({ id }) => samePublicId(id, candidate.id))
  ).map((candidate) => {
    const retained = before.flowNodeOccurrences.retainedOpen.find(({ occurrence }) =>
      samePublicId(occurrence.id, candidate.id));
    if (retained === undefined) {
      throw new TypeError("state-difference mutation lost a terminal anchor");
    }
    return {
      anchor: retained.anchor,
      terminal: FlowNodeOccurrenceTerminalKind.Completed,
    };
  });
  const empty = exactStep.flowNodeOccurrenceLifecycles.map(
    (): UnnumberedFlowNodeOccurrenceDelta => ({ started: [], ended: [] }),
  );
  empty[0] = { started, ended };
  return {
    ...exactStep,
    flowNodeOccurrenceLifecycles: [empty[0]!, ...empty.slice(1)],
  };
}

function samePublicId(
  left: CommandPublicationState["flowNodeOccurrences"]["currentOpen"][number]["id"],
  right: CommandPublicationState["flowNodeOccurrences"]["currentOpen"][number]["id"],
): boolean {
  return left.processInstanceId === right.processInstanceId &&
    left.startRevision === right.startRevision &&
    left.startIndex === right.startIndex;
}
