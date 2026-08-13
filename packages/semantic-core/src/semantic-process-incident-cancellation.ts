/** Exact incident-gated cancellation of one hosting root Process. */
import type {
  CancelIncidentProcessStimulus,
} from "./contract.js";
import type { SemanticProcessProgram } from "./semantic-process-contract.js";
import {
  calledProcessAssociationsAreValid,
} from "./semantic-process-call-runtime.js";
import {
  effectIncidentAssociationsAreValid,
} from "./semantic-process-incident-validation.js";
import {
  isWellFormedSemanticProcessProgram,
} from "./semantic-process-admission.js";
import {
  profileAllowsProgramShape,
} from "./semantic-process-profile.js";
import {
  removeScopeOccurrenceSubtree,
  scopeOccurrenceSubtree,
} from "./semantic-process-scope-cancellation.js";
import {
  SemanticProfileId,
} from "./semantic-profile-catalog.js";
import {
  ControlStateKind,
  sameOccurrence,
  sameScopeOccurrence,
} from "./semantic-process-state.js";
import type {
  RuntimeScopeOccurrence,
  RuntimeState,
  SemanticEffectIncident,
} from "./semantic-process-state.js";

type IncidentCancellationTarget = Readonly<{
  root: RuntimeScopeOccurrence;
  incident: SemanticEffectIncident;
}>;

/** Requires the exact cancellation profile and predecessor-equivalent Service Task program. */
export function programAllowsIncidentCancellation(
  program: SemanticProcessProgram,
): boolean {
  return isWellFormedSemanticProcessProgram(program) &&
    program.identity.semanticProfile ===
      SemanticProfileId.ServiceTaskIncidentCancellation &&
    profileAllowsProgramShape(
      program.identity.semanticProfile,
      program.operations,
      program.definitionScopes.length,
    );
}

/** Derives the sole publishable root/incident pair without accepting caller-owned scope data. */
export function incidentCancellationTarget(
  program: SemanticProcessProgram,
  state: RuntimeState,
): IncidentCancellationTarget | null {
  if (
    !programAllowsIncidentCancellation(program) ||
    state.control.kind !== ControlStateKind.Running ||
    state.initiationPending ||
    state.effectIncidents.length !== 1 ||
    !effectIncidentAssociationsAreValid(state) ||
    !calledProcessAssociationsAreValid(state)
  ) {
    return null;
  }
  const processInstanceId = state.control.instanceId;
  const roots = state.scopeOccurrences.filter(
    ({ id, parent }) =>
      parent === null &&
      id.processInstanceId === processInstanceId,
  );
  const root = roots[0];
  const incident = state.effectIncidents[0];
  if (
    roots.length !== 1 ||
    root === undefined ||
    incident === undefined ||
    incident.id.effectId.processInstanceId !== processInstanceId ||
    !scopeOccurrenceSubtree(state.scopeOccurrences, root).some(({ id }) =>
      sameScopeOccurrence(id, incident.wait.owner)
    )
  ) {
    return null;
  }
  return { root, incident };
}

/** Removes the selected root region once and enters the distinct terminal cancelled state. */
export function cancelIncidentProcess(
  program: SemanticProcessProgram,
  state: RuntimeState,
  stimulus: CancelIncidentProcessStimulus,
): RuntimeState | null {
  if (state.control.kind !== ControlStateKind.Running) {
    return null;
  }
  const processInstanceId = state.control.instanceId;
  const target = incidentCancellationTarget(program, state);
  if (
    target === null ||
    stimulus.processInstanceId !== processInstanceId ||
    stimulus.incidentId.effectId.processInstanceId !== processInstanceId ||
    stimulus.incidentId.generation !== target.incident.id.generation ||
    !sameOccurrence(
      stimulus.incidentId.effectId,
      target.incident.id.effectId,
    )
  ) {
    return null;
  }

  const cleaned = removeScopeOccurrenceSubtree(state, target.root);
  if (hasLiveExecutionRegion(cleaned)) {
    return null;
  }
  return {
    ...cleaned,
    control: {
      kind: ControlStateKind.Cancelled,
      instanceId: processInstanceId,
    },
    initiationPending: false,
  };
}

function hasLiveExecutionRegion(state: RuntimeState): boolean {
  return state.scopeOccurrences.length > 0 ||
    state.controlTokens.length > 0 ||
    state.userTaskWaits.length > 0 ||
    state.messageWaits.length > 0 ||
    state.timerWaits.length > 0 ||
    state.effectWaits.length > 0 ||
    state.effectIncidents.length > 0 ||
    state.selectedBranchSets.length > 0 ||
    state.eventRaces.length > 0 ||
    state.calledProcessOccurrences.length > 0 ||
    state.variables.activities.length > 0;
}
