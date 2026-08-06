import {
  ObservationRequestKind,
  ScenarioDocumentKind,
  StimulusKind,
} from "./contract.js";
import type {
  Scenario,
  StartProcessStimulus,
} from "./contract.js";
import {
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
} from "./semantic-process-contract.js";
import type { DefinitionScope } from "./semantic-value-contract.js";
import type {
  ControlPlaceScopeOwnership,
  OperationScopeOwnership,
  SemanticOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import {
  isWellFormedSemanticProcessGraph,
} from "./semantic-process-graph-admission.js";
import {
  isWellFormedSemanticOperation,
} from "./semantic-process-operation-admission.js";
import { inclusiveOperationsArePaired } from "./inclusive-gateway-admission.js";
import {
  profileAllowsProgramShape,
} from "./semantic-process-profile.js";
import {
  isWellFormedStimulus,
} from "./stimulus.js";
import {
  compareCanonicalStrings,
  isWellFormedWireString,
} from "./wire.js";

const supportedObservations = Object.freeze([
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

export function supportsSemanticProcessScenario(
  scenario: Scenario,
  program: SemanticProcessProgram,
): boolean {
  return (
    isSupportedScenario(scenario) &&
    isWellFormedSemanticProcessProgram(program) &&
    profileAllowsProgramShape(
      program.identity.semanticProfile,
      program.operations.map(({ kind }) => kind),
      program.definitionScopes.length,
    ) &&
    program.identity.semanticProfile === scenario.profile &&
    program.identity.sourceId === scenario.bpmn.id &&
    program.identity.sourceSha256 === scenario.bpmn.sha256
  );
}

export function supportsSemanticProcessExecution(
  start: StartProcessStimulus,
  program: SemanticProcessProgram,
): boolean {
  return (
    isWellFormedStimulus(start) &&
    start.kind === StimulusKind.StartProcess &&
    isWellFormedSemanticProcessProgram(program) &&
    profileAllowsProgramShape(
      program.identity.semanticProfile,
      program.operations.map(({ kind }) => kind),
      program.definitionScopes.length,
    ) &&
    start.processId === program.processId
  );
}

export function isWellFormedSemanticProcessProgram(
  value: unknown,
): value is SemanticProcessProgram {
  if (!isRecord(value)) {
    return false;
  }
  const identity = isRecord(value.identity) ? value.identity : undefined;
  const definitionScopes = Array.isArray(value.definitionScopes)
    ? value.definitionScopes
    : undefined;
  const operationScopes = Array.isArray(value.operationScopes)
    ? value.operationScopes
    : undefined;
  const controlPlaceScopes = Array.isArray(value.controlPlaceScopes)
    ? value.controlPlaceScopes
    : undefined;
  const controlPlaces = Array.isArray(value.controlPlaces)
    ? value.controlPlaces
    : undefined;
  const operations = Array.isArray(value.operations)
    ? value.operations
    : undefined;
  if (
    !hasOnlyKeys(value, [
      "kind",
      "identity",
      "processId",
      "definitionScopes",
      "operationScopes",
      "controlPlaceScopes",
      "controlPlaces",
      "operations",
    ]) ||
    value.kind !== SemanticProcessKind.SemanticProcess ||
    identity === undefined ||
    !hasOnlyKeys(identity, [
      "compiler",
      "semanticProfile",
      "sourceId",
      "sourceSha256",
    ]) ||
    identity.compiler !==
      SemanticProcessCompilerId.BpmnSourceSemanticProcess ||
    !isNonEmptyString(identity.semanticProfile) ||
    !isNonEmptyString(identity.sourceId) ||
    !isSha256(identity.sourceSha256) ||
    !isNonEmptyString(value.processId) ||
    definitionScopes === undefined ||
    definitionScopes.length === 0 ||
    !definitionScopes.every(isWellFormedDefinitionScope) ||
    !isSortedById(definitionScopes) ||
    definitionScopes.filter(
      ({ parentScopeId, originElementId }) =>
        parentScopeId === null && originElementId === value.processId,
    ).length !== 1 ||
    operationScopes === undefined ||
    !operationScopes.every(isWellFormedOperationScopeOwnership) ||
    !isSortedByField(operationScopes, "operationId") ||
    controlPlaceScopes === undefined ||
    !controlPlaceScopes.every(isWellFormedControlPlaceScopeOwnership) ||
    !isSortedByField(controlPlaceScopes, "controlPlaceId") ||
    controlPlaces === undefined ||
    controlPlaces.length === 0 ||
    operations === undefined ||
    operations.length === 0 ||
    !isSortedById(controlPlaces) ||
    !isSortedById(operations)
  ) {
    return false;
  }

  const placeIds = new Set<string>();
  const scopeOrigins = new Map(
    definitionScopes.map(({ id, originElementId }) => [id, originElementId]),
  );
  const placeOrigins = new Map<string, string>();
  for (const place of controlPlaces) {
    if (
      !isRecord(place) ||
      !hasOnlyKeys(place, ["id", "origin"]) ||
      !isNonEmptyString(place.id) ||
      !isRecord(place.origin) ||
      !hasOnlyKeys(place.origin, ["kind", "elementId"]) ||
      place.origin.kind !== SemanticOriginKind.BpmnSequenceFlow ||
      !isNonEmptyString(place.origin.elementId)
    ) {
      return false;
    }
    placeIds.add(place.id);
    placeOrigins.set(place.id, place.origin.elementId);
  }

  const checkedOperations: SemanticOperation[] = [];
  for (const operation of operations) {
    if (!isWellFormedSemanticOperation(
      operation,
      placeIds,
      placeOrigins,
      scopeOrigins,
    )) {
      return false;
    }
    checkedOperations.push(operation);
  }
  return inclusiveOperationsArePaired(checkedOperations) &&
    isWellFormedSemanticProcessGraph({
      processId: value.processId,
      definitionScopes,
      operationScopes,
      controlPlaceScopes,
      controlPlaceIds: [...placeIds],
      operations: checkedOperations,
    });
}

function isWellFormedDefinitionScope(
  value: unknown,
): value is DefinitionScope {
  return isRecord(value) &&
    hasOnlyKeys(value, ["id", "parentScopeId", "originElementId"]) &&
    isNonEmptyString(value.id) &&
    (value.parentScopeId === null || isNonEmptyString(value.parentScopeId)) &&
    isNonEmptyString(value.originElementId);
}

function isWellFormedOperationScopeOwnership(
  value: unknown,
): value is OperationScopeOwnership {
  return isRecord(value) &&
    hasOnlyKeys(value, ["operationId", "scopeId"]) &&
    isNonEmptyString(value.operationId) &&
    isNonEmptyString(value.scopeId);
}

function isWellFormedControlPlaceScopeOwnership(
  value: unknown,
): value is ControlPlaceScopeOwnership {
  return isRecord(value) &&
    hasOnlyKeys(value, ["controlPlaceId", "scopeId"]) &&
    isNonEmptyString(value.controlPlaceId) &&
    isNonEmptyString(value.scopeId);
}

function isSupportedScenario(value: unknown): value is Scenario {
  if (!isRecord(value) || value.kind !== ScenarioDocumentKind.Scenario) {
    return false;
  }
  const bpmn = isRecord(value.bpmn) ? value.bpmn : undefined;
  const stimuli = Array.isArray(value.stimuli) ? value.stimuli : undefined;
  const observations = Array.isArray(value.observations)
    ? value.observations
    : undefined;
  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.profile) &&
    bpmn !== undefined &&
    isNonEmptyString(bpmn.id) &&
    isNonEmptyString(bpmn.relativePath) &&
    isSha256(bpmn.sha256) &&
    stimuli !== undefined &&
    stimuli.length >= 1 &&
    stimuli.every(isWellFormedStimulus) &&
    stimuli[0]?.kind === StimulusKind.StartProcess &&
    stimuli
      .slice(1)
      .every(
        (stimulus) =>
          stimulus.kind === StimulusKind.CompleteUserTaskInstance ||
          stimulus.kind === StimulusKind.DeliverMessage ||
          stimulus.kind === StimulusKind.FireTimer ||
          stimulus.kind === StimulusKind.CompleteEffect,
      ) &&
    observations !== undefined &&
    observations.length === supportedObservations.length &&
    observations.every(
      (observation, index) => observation === supportedObservations[index],
    )
  );
}

function isSortedById(values: ReadonlyArray<unknown>): boolean {
  return values.every((value, index) => {
    const previous = values[index - 1];
    return (
      isRecord(value) &&
      isNonEmptyString(value.id) &&
      (previous === undefined ||
        (isRecord(previous) &&
          isNonEmptyString(previous.id) &&
          compareCanonicalStrings(previous.id, value.id) < 0))
    );
  });
}

function isSortedByField(
  values: ReadonlyArray<unknown>,
  field: string,
): boolean {
  return values.every((value, index) => {
    const previous = values[index - 1];
    return isRecord(value) &&
      isNonEmptyString(value[field]) &&
      (previous === undefined ||
        (isRecord(previous) &&
          isNonEmptyString(previous[field]) &&
          compareCanonicalStrings(previous[field], value[field]) < 0));
  });
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: ReadonlyArray<string>,
): boolean {
  const allowed = new Set(keys);
  return (
    Object.keys(value).length === allowed.size &&
    Object.keys(value).every((key) => allowed.has(key))
  );
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return isWellFormedWireString(value) && value.length > 0;
}
