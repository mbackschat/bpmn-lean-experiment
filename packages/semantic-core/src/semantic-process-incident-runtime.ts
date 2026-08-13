/** Pure report and retry transitions for the literal-generation-1 Service Task incident. */
import type {
  ReportEffectFailureStimulus,
  RetryIncidentStimulus,
} from "./contract.js";
import type { SemanticProcessProgram } from "./semantic-process-contract.js";
import {
  effectIncidentAssociationsAreValid,
  effectWaitCanBecomeIncident,
  programAllowsEffectIncidents,
} from "./semantic-process-incident-validation.js";
import {
  compareEffectIncidents,
  compareEffectWaits,
  ControlStateKind,
  sameOccurrence,
} from "./semantic-process-state.js";
import type { RuntimeState } from "./semantic-process-state.js";

export function reportEffectFailure(
  program: SemanticProcessProgram,
  state: RuntimeState,
  stimulus: ReportEffectFailureStimulus,
): RuntimeState | null {
  const matchingWaits = state.effectWaits.filter(({ id }) =>
    sameOccurrence(id, stimulus.effectId)
  );
  const wait = matchingWaits[0];
  if (
    !programAllowsEffectIncidents(program) ||
    state.control.kind !== ControlStateKind.Running ||
    stimulus.generation !== 1 ||
    state.effectIncidents.length !== 0 ||
    state.effectWaits.length !== 1 ||
    matchingWaits.length !== 1 ||
    wait === undefined ||
    wait.incidentAlreadyRetried ||
    !effectWaitCanBecomeIncident(state, wait)
  ) {
    return null;
  }
  return {
    ...state,
    effectWaits: state.effectWaits.filter((candidate) => candidate !== wait),
    effectIncidents: [{
      id: { effectId: wait.id, generation: 1 as const },
      wait,
    }].sort(compareEffectIncidents),
  };
}

export function retryEffectIncident(
  program: SemanticProcessProgram,
  state: RuntimeState,
  stimulus: RetryIncidentStimulus,
): RuntimeState | null {
  const matchingIncidents = state.effectIncidents.filter(({ id }) =>
    id.generation === stimulus.incidentId.generation &&
    sameOccurrence(id.effectId, stimulus.incidentId.effectId)
  );
  const incident = matchingIncidents[0];
  if (
    !programAllowsEffectIncidents(program) ||
    state.control.kind !== ControlStateKind.Running ||
    stimulus.incidentId.generation !== 1 ||
    matchingIncidents.length !== 1 ||
    incident === undefined ||
    !effectIncidentAssociationsAreValid(state)
  ) {
    return null;
  }
  return {
    ...state,
    effectWaits: [
      ...state.effectWaits,
      { ...incident.wait, incidentAlreadyRetried: true },
    ].sort(compareEffectWaits),
    effectIncidents: state.effectIncidents.filter(
      (candidate) => candidate !== incident,
    ),
  };
}
