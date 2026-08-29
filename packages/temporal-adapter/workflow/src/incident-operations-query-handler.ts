/** Current committed incident projection and its deterministic Workflow Query registration. */
import {
  CanonicalObservationKind,
  ControlStateKind,
  ProcessStatus,
  StimulusKind,
  isStableStateSound,
  observeStableState,
} from "@bpmn-lean/semantic-core";
import type {
  CancelIncidentProcessInteraction,
  EnabledInteraction,
  OpenEffectIncident,
  RetryIncidentInteraction,
  RuntimeState,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import {
  defineQuery,
  setHandler,
} from "@temporalio/workflow";
import {
  bpmnIncidentOperationsQueryName,
} from "@bpmn-lean/temporal-protocol";
import type {
  TemporalIncidentOperationsIncident,
  TemporalIncidentOperationsSnapshot,
} from "@bpmn-lean/temporal-protocol";

export const bpmnIncidentOperationsQuery =
  defineQuery<TemporalIncidentOperationsSnapshot>(
    bpmnIncidentOperationsQueryName,
  );

/** Registers one read-only Query over the supplied current committed-state owner. */
export function registerIncidentOperationsQueryHandler(
  semanticProcess: SemanticProcessProgram,
  currentState: () => RuntimeState,
): void {
  setHandler(
    bpmnIncidentOperationsQuery,
    () => projectIncidentOperationsSnapshot(semanticProcess, currentState()),
  );
}

/** Projects only the current state and fails closed on malformed private associations. */
export function projectIncidentOperationsSnapshot(
  semanticProcess: SemanticProcessProgram,
  state: RuntimeState,
): TemporalIncidentOperationsSnapshot {
  const observation = observeStableState(semanticProcess, state);
  switch (state.control.kind) {
    case ControlStateKind.NotStarted:
      if (observation !== null) {
        throw invalidIncidentProjection("not-started state was published");
      }
      return null;
    case ControlStateKind.Completed:
      requireTerminalState(
        state,
        observation,
        state.control.instanceId,
        "completed",
      );
      return terminalSnapshot(state.control.instanceId, ProcessStatus.Completed);
    case ControlStateKind.Cancelled:
      requireTerminalState(
        state,
        observation,
        state.control.instanceId,
        "cancelled",
      );
      return terminalSnapshot(state.control.instanceId, ProcessStatus.Cancelled);
    case ControlStateKind.Running:
      if (
        observation?.kind !== CanonicalObservationKind.State ||
        observation.status !== ProcessStatus.Running ||
        !isStableStateSound(state) ||
        observation.instanceId !== state.control.instanceId
      ) {
        throw invalidIncidentProjection("malformed committed running state");
      }
      const incidentInteractions = observation.enabledInteractions.filter(
        isIncidentInteraction,
      );
      if (
        observation.openIncidents.length !== 0 &&
        incidentInteractions.length !== observation.enabledInteractions.length
      ) {
        throw invalidIncidentProjection("unsupported current interaction");
      }
      return {
        instanceId: state.control.instanceId,
        status: ProcessStatus.Running,
        incidents: pairIncidentOperations(
          observation.openIncidents,
          incidentInteractions,
        ),
      };
    default:
      return assertNever(state.control);
  }
}

/** Consumes the complete published interaction sequence without repairing order or identity. */
export function pairIncidentOperations(
  incidents: ReadonlyArray<OpenEffectIncident>,
  interactions: ReadonlyArray<EnabledInteraction>,
): ReadonlyArray<TemporalIncidentOperationsIncident> {
  let cursor = 0;
  const paired = incidents.map((incident) => {
    const retry = requireRetry(interactions[cursor], incident);
    cursor += 1;
    const candidate = interactions[cursor];
    const cancel = candidate?.kind === StimulusKind.CancelIncidentProcess
      ? requireCancellation(candidate, incident)
      : undefined;
    if (cancel !== undefined) {
      cursor += 1;
    }
    return {
      incident,
      interactions: cancel === undefined ? [retry] : [retry, cancel],
    } satisfies TemporalIncidentOperationsIncident;
  });
  if (cursor !== interactions.length) {
    throw invalidIncidentProjection("unsupported, duplicate, or misplaced interaction");
  }
  return paired;
}

function terminalSnapshot(
  instanceId: string,
  status: ProcessStatus.Completed | ProcessStatus.Cancelled,
): Exclude<TemporalIncidentOperationsSnapshot, null> {
  return { instanceId, status, incidents: [] };
}

function requireNoIncidents(
  incidents: ReadonlyArray<OpenEffectIncident>,
  status: string,
): void {
  if (incidents.length !== 0) {
    throw invalidIncidentProjection(`${status} state retains an incident`);
  }
}

function requireTerminalState(
  state: RuntimeState,
  observation: ReturnType<typeof observeStableState>,
  expectedInstanceId: string,
  status: string,
): void {
  if (
    observation?.kind !== CanonicalObservationKind.State ||
    observation.instanceId !== expectedInstanceId
  ) {
    throw invalidIncidentProjection(`${status} state has no exact observation`);
  }
  requireNoIncidents(observation.openIncidents, status);
  if (
    state.initiationPending ||
    state.scopeOccurrences.length !== 0 ||
    state.controlTokens.length !== 0 ||
    state.userTaskWaits.length !== 0 ||
    state.messageWaits.length !== 0 ||
    state.timerWaits.length !== 0 ||
    state.effectWaits.length !== 0 ||
    state.selectedBranchSets.length !== 0 ||
    state.eventRaces.length !== 0 ||
    state.calledProcessOccurrences.length !== 0 ||
    state.variables.activities.length !== 0
  ) {
    throw invalidIncidentProjection(`${status} state retains live private material`);
  }
}

function isIncidentInteraction(
  interaction: EnabledInteraction,
): interaction is RetryIncidentInteraction | CancelIncidentProcessInteraction {
  switch (interaction.kind) {
    case StimulusKind.RetryIncident:
    case StimulusKind.CancelIncidentProcess:
      return true;
    default:
      return false;
  }
}

function requireRetry(
  interaction: EnabledInteraction | undefined,
  incident: OpenEffectIncident,
): RetryIncidentInteraction {
  if (
    interaction?.kind !== StimulusKind.RetryIncident ||
    !sameIncidentId(interaction.incidentId, incident.id)
  ) {
    throw invalidIncidentProjection("missing, reordered, or cross-incident Retry interaction");
  }
  return interaction;
}

function requireCancellation(
  interaction: CancelIncidentProcessInteraction,
  incident: OpenEffectIncident,
): CancelIncidentProcessInteraction {
  if (
    interaction.processInstanceId !== incident.id.effectId.processInstanceId ||
    !sameIncidentId(interaction.incidentId, incident.id)
  ) {
    throw invalidIncidentProjection("cross-incident Cancel interaction");
  }
  return interaction;
}

function sameIncidentId(
  left: OpenEffectIncident["id"],
  right: OpenEffectIncident["id"],
): boolean {
  return left.generation === right.generation &&
    left.effectId.processInstanceId === right.effectId.processInstanceId &&
    left.effectId.elementId === right.effectId.elementId &&
    left.effectId.activation === right.effectId.activation;
}

function invalidIncidentProjection(detail: string): TypeError {
  return new TypeError(`Cannot project incident operations: ${detail}`);
}

function assertNever(value: never): never {
  throw invalidIncidentProjection(`unsupported control state ${String(value)}`);
}
