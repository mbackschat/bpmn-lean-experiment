/** Closed association and profile admission for the bounded Service Task incident state. */
import type { OpenEffectIncident } from "./contract.js";
import type { SemanticProcessProgram } from "./semantic-process-contract.js";
import {
  isWellFormedSemanticProcessProgram,
} from "./semantic-process-admission.js";
import { profileAllowsProgramShape } from "./semantic-process-profile.js";
import {
  SemanticProfileId,
} from "./semantic-profile-catalog.js";
import {
  ControlStateKind,
  sameOccurrence,
  sameScopeOccurrence,
} from "./semantic-process-state.js";
import type {
  RuntimeState,
  SemanticEffectWait,
} from "./semantic-process-state.js";
import { matchesEffectLocalDataOwner } from "./local-data-owner.js";

/** Requires either exact incident profile and its predecessor-equivalent Service Task shape. */
export function programAllowsEffectIncidents(
  program: SemanticProcessProgram,
): boolean {
  return isWellFormedSemanticProcessProgram(program) &&
    (program.identity.semanticProfile ===
        SemanticProfileId.ServiceTaskIncident ||
      program.identity.semanticProfile ===
        SemanticProfileId.ServiceTaskIncidentCancellation) &&
    profileAllowsProgramShape(
      program.identity.semanticProfile,
      program.operations,
      program.definitionScopes.length,
    );
}

/** Checks every private identity, owner, and Activity-local association an incident retains. */
export function effectIncidentAssociationsAreValid(
  state: RuntimeState,
): boolean {
  if (state.effectIncidents.length === 0) {
    return true;
  }
  if (state.effectIncidents.length !== 1) {
    return false;
  }
  const incident = state.effectIncidents[0];
  if (
    incident === undefined ||
    state.control.kind !== ControlStateKind.Running ||
    incident.id.generation !== 1 ||
    incident.wait.incidentAlreadyRetried ||
    !sameOccurrence(incident.id.effectId, incident.wait.id) ||
    incident.wait.id.processInstanceId !== state.control.instanceId ||
    incident.wait.owner.processInstanceId !== state.control.instanceId ||
    state.effectWaits.some(({ id }) => sameOccurrence(id, incident.wait.id))
  ) {
    return false;
  }
  const owningScopes = state.scopeOccurrences.filter(({ id }) =>
    sameScopeOccurrence(id, incident.wait.owner)
  );
  const localScopes = state.variables.activities.filter(({ owner }) =>
    matchesEffectLocalDataOwner(owner, incident.wait.id)
  );
  return owningScopes.length === 1 && localScopes.length === 1;
}

/** Applies the fail-closed pre-dispatch rule to every command, not only incident commands. */
export function incidentStateAllowsDispatch(
  program: SemanticProcessProgram,
  state: RuntimeState,
): boolean {
  return state.effectIncidents.length === 0 ||
    (programAllowsEffectIncidents(program) &&
      effectIncidentAssociationsAreValid(state));
}

/** Checks that one live effect wait has the associations an incident must preserve. */
export function effectWaitCanBecomeIncident(
  state: RuntimeState,
  wait: SemanticEffectWait,
): boolean {
  const matchingWaits = state.effectWaits.filter(({ id }) =>
    sameOccurrence(id, wait.id)
  );
  const owningScopes = state.scopeOccurrences.filter(({ id }) =>
    sameScopeOccurrence(id, wait.owner)
  );
  const localScopes = state.variables.activities.filter(({ owner }) =>
    matchesEffectLocalDataOwner(owner, wait.id)
  );
  return matchingWaits.length === 1 &&
    state.control.kind === ControlStateKind.Running &&
    wait.id.processInstanceId === state.control.instanceId &&
    wait.owner.processInstanceId === state.control.instanceId &&
    owningScopes.length === 1 &&
    localScopes.length === 1;
}

/** Independently checks the duplicated public occurrence identity after projection or decoding. */
export function openEffectIncidentAssociationIsValid(
  incident: OpenEffectIncident,
): boolean {
  return incident.kind === "effectExecutionFailed" &&
    incident.id.generation === 1 &&
    sameOccurrence(incident.id.effectId, incident.effect.id);
}
