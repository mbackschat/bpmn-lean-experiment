/** Projects a kernel result to the observation boundary a CIB case's relation declares. */
import { CanonicalObservationKind, ProcessStatus } from "@bpmn-lean/semantic-core";
import type { ScenarioResult } from "@bpmn-lean/semantic-core";

import { CibCaseRelation } from "./pipeline-types.ts";

function projectSynchronousHostResult(semanticResult: ScenarioResult): ScenarioResult {
  const deployment = semanticResult.trace[0];
  const start = semanticResult.trace[1];
  const finalState = [...semanticResult.trace].reverse().find(
    (observation) =>
      observation.kind === CanonicalObservationKind.State &&
      observation.status === ProcessStatus.Completed,
  );
  if (
    deployment?.kind !== CanonicalObservationKind.Deployment ||
    start?.kind !== CanonicalObservationKind.Command ||
    finalState === undefined
  ) {
    throw new Error(
      "Synchronous CIB host relation requires deployment, start, and final semantic state",
    );
  }
  return {
    outcome: semanticResult.outcome,
    trace: [deployment, start, finalState],
  };
}

function projectSynchronousBoundaryErrorHostResult(semanticResult: ScenarioResult): ScenarioResult {
  const deployment = semanticResult.trace[0];
  const start = semanticResult.trace[1];
  const boundaryStateIndex = semanticResult.trace.findIndex(
    (observation) =>
      observation.kind === CanonicalObservationKind.State &&
      observation.openUserTasks.some(
        ({ id }) =>
          id.elementId === "ReviewMappedError",
      ),
  );
  const boundaryState = semanticResult.trace[boundaryStateIndex];
  const completion = semanticResult.trace[boundaryStateIndex + 1];
  const finalState = semanticResult.trace[boundaryStateIndex + 2];
  if (
    deployment?.kind !== CanonicalObservationKind.Deployment ||
    start?.kind !== CanonicalObservationKind.Command ||
    boundaryState?.kind !== CanonicalObservationKind.State ||
    completion?.kind !== CanonicalObservationKind.Command ||
    finalState?.kind !== CanonicalObservationKind.State ||
    finalState.status !== ProcessStatus.Completed
  ) {
    throw new Error(
      "Synchronous boundary-error relation requires start, routed User Task, completion, and final state",
    );
  }
  return {
    outcome: semanticResult.outcome,
    trace: [deployment, start, boundaryState, completion, finalState],
  };
}

export function projectToCibRelation(relation: CibCaseRelation, result: ScenarioResult): ScenarioResult {
  switch (relation) {
    case CibCaseRelation.ExactSemantic:
      return result;
    case CibCaseRelation.SynchronousFinalState:
      return projectSynchronousHostResult(result);
    case CibCaseRelation.SynchronousBoundaryError:
      return projectSynchronousBoundaryErrorHostResult(result);
    default:
      return relation satisfies never;
  }
}
