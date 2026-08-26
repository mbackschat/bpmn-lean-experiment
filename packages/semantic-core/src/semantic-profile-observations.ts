import { ObservationRequestKind } from "./contract.js";
import { SemanticProfileId } from "./semantic-profile-catalog.js";

/** The exact observation request order retained by every profile predating Multi-Instance support. */
export const BASELINE_SCENARIO_OBSERVATIONS = Object.freeze([
  ObservationRequestKind.Deployment,
  ObservationRequestKind.CommandResults,
  ObservationRequestKind.ProcessStatus,
  ObservationRequestKind.ActiveWaits,
  ObservationRequestKind.OpenUserTasks,
  ObservationRequestKind.OpenTimers,
  ObservationRequestKind.OpenEffects,
  ObservationRequestKind.Variables,
  ObservationRequestKind.EnabledInteractions,
  ObservationRequestKind.LogicalTime,
]);

/** The exact additive observation request order for the first sequential Multi-Instance profile. */
export const SEQUENTIAL_MULTI_INSTANCE_SCENARIO_OBSERVATIONS = Object.freeze([
  ObservationRequestKind.Deployment,
  ObservationRequestKind.CommandResults,
  ObservationRequestKind.ProcessStatus,
  ObservationRequestKind.ActiveWaits,
  ObservationRequestKind.OpenUserTasks,
  ObservationRequestKind.OpenTimers,
  ObservationRequestKind.OpenEffects,
  ObservationRequestKind.OpenMultiInstances,
  ObservationRequestKind.Variables,
  ObservationRequestKind.EnabledInteractions,
  ObservationRequestKind.LogicalTime,
]);

/** Selects the exact request catalog whose bytes a scenario profile owns. */
export function scenarioObservationsForProfile(
  profile: string,
): ReadonlyArray<ObservationRequestKind> {
  switch (profile) {
    case SemanticProfileId.SequentialMultiInstanceUserTask:
    case SemanticProfileId.ParallelMultiInstanceUserTask:
      return SEQUENTIAL_MULTI_INSTANCE_SCENARIO_OBSERVATIONS;
    default:
      return BASELINE_SCENARIO_OBSERVATIONS;
  }
}
