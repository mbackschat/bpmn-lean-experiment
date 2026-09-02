import {
  ScenarioDocumentKind,
  StimulusKind,
} from "./contract.js";
import type {
  ProcessStartStimulus,
  Scenario,
  Stimulus,
} from "./contract.js";
import {
  InternalSchedulingMode,
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
  isWellFormedSemanticProcessProgramGraph,
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
  profileAllowsStimulusValueDomain,
} from "./semantic-profile-value-domain.js";
import {
  processStartMatchesProgram,
} from "./semantic-process-triggered-start.js";
import {
  compareCanonicalStrings,
  isWellFormedWireString,
} from "./wire.js";
import {
  isSourceOverlayIdentityOrNull,
  sameSourceOverlayIdentity,
} from "./source-overlay-identity.js";
import { scenarioObservationsForProfile } from "./semantic-profile-observations.js";
import {
  sequentialMultiInstanceStimulusDataAdmitted,
} from "./sequential-multi-instance-command-data-admission.js";
import { programWaitDeclarersAreUnique } from "./internal-transition-wait-census.js";
import {
  compensationRetentionProgramDefects,
  isCompensationActivityRetentionDeclaration,
} from "./compensation-activity-retention-state-validation.js";
import {
  compensationEventSubProcessSnapshotProgramDefects,
  isCompensationEventSubProcessSnapshotDeclaration,
} from "./compensation-event-sub-process-snapshot-state-validation.js";
import {
  compensationExecutionMatchesProgram,
  isCompensationExecutionDeclaration,
} from "./compensation-trigger-handler-program-admission.js";

export function supportsSemanticProcessScenario(
  scenario: Scenario,
  program: SemanticProcessProgram,
): boolean {
  const start = scenario.stimuli[0];
  return (
    isSupportedScenario(scenario) &&
    start !== undefined &&
    isProcessStartStimulus(start) &&
    isWellFormedSemanticProcessProgram(program) &&
    profileAllowsProgramShape(
      program.identity.semanticProfile,
      program.operations,
      program.definitionScopes.length,
    ) &&
    program.identity.semanticProfile === scenario.profile &&
    scenario.stimuli.every((stimulus) =>
      profileAllowsStimulusValueDomain(scenario.profile, stimulus)
    ) &&
    program.identity.sourceId === scenario.bpmn.id &&
    program.identity.sourceSha256 === scenario.bpmn.sha256 &&
    sameSourceOverlayIdentity(
      program.identity.sourceOverlay,
      scenario.bpmn.sourceOverlay,
    ) &&
    processStartMatchesProgram(start, program)
  );
}

export function supportsSemanticProcessExecution(
  start: ProcessStartStimulus,
  program: SemanticProcessProgram,
): boolean {
  return (
    isWellFormedStimulus(start) &&
    isProcessStartStimulus(start) &&
    isWellFormedSemanticProcessProgram(program) &&
    profileAllowsProgramShape(
      program.identity.semanticProfile,
      program.operations,
      program.definitionScopes.length,
    ) &&
    profileAllowsStimulusValueDomain(program.identity.semanticProfile, start) &&
    sequentialMultiInstanceStimulusDataAdmitted(program, start) &&
    processStartMatchesProgram(start, program)
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
  const hasCompensationActivityRetention = Object.prototype.hasOwnProperty.call(
    value,
    "compensationActivityRetention",
  );
  const hasCompensationEventSubProcessSnapshots = Object.prototype.hasOwnProperty.call(
    value,
    "compensationEventSubProcessSnapshots",
  );
  const hasCompensationExecution = Object.prototype.hasOwnProperty.call(
    value,
    "compensationExecution",
  );
  if (
    !hasOnlyKeys(value, [
      "kind",
      "identity",
      "internalSchedulingMode",
      "processId",
      "definitionScopes",
      "operationScopes",
      "controlPlaceScopes",
      "controlPlaces",
      "operations",
      ...(hasCompensationActivityRetention
        ? ["compensationActivityRetention"]
        : []),
      ...(hasCompensationEventSubProcessSnapshots
        ? ["compensationEventSubProcessSnapshots"]
        : []),
      ...(hasCompensationExecution ? ["compensationExecution"] : []),
    ]) ||
    value.kind !== SemanticProcessKind.SemanticProcess ||
    identity === undefined ||
    !hasOnlyKeys(identity, [
      "compiler",
      "semanticProfile",
      "sourceId",
      "sourceSha256",
      "sourceOverlay",
    ]) ||
    identity.compiler !==
      SemanticProcessCompilerId.BpmnSourceSemanticProcess ||
    !isInternalSchedulingMode(value.internalSchedulingMode) ||
    !isNonEmptyString(identity.semanticProfile) ||
    !isNonEmptyString(identity.sourceId) ||
    !isSha256(identity.sourceSha256) ||
    !isSourceOverlayIdentityOrNull(identity.sourceOverlay) ||
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
    (hasCompensationActivityRetention &&
      !isCompensationActivityRetentionDeclaration(
        value.compensationActivityRetention,
      )) ||
    (hasCompensationEventSubProcessSnapshots &&
      !isCompensationEventSubProcessSnapshotDeclaration(
        value.compensationEventSubProcessSnapshots,
      )) ||
    (hasCompensationExecution &&
      !isCompensationExecutionDeclaration(value.compensationExecution)) ||
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
  const program = value as unknown as SemanticProcessProgram;
  const snapshotTargets = program.compensationEventSubProcessSnapshots?.targets;
  return inclusiveOperationsArePaired(checkedOperations) &&
    programWaitDeclarersAreUnique(checkedOperations) &&
    compensationRetentionProgramDefects(program).length === 0 &&
    compensationEventSubProcessSnapshotProgramDefects(program).length === 0 &&
    compensationExecutionMatchesProgram(program) &&
    (snapshotTargets === undefined
      ? isWellFormedSemanticProcessGraph({
        semanticProfile: identity.semanticProfile,
        processId: value.processId,
        definitionScopes,
        operationScopes,
        controlPlaceScopes,
        controlPlaceIds: [...placeIds],
        operations: checkedOperations,
      })
      : isWellFormedSemanticProcessProgramGraph({
      semanticProfile: identity.semanticProfile,
      processId: value.processId,
      definitionScopes,
      operationScopes,
      controlPlaceScopes,
      controlPlaceIds: [...placeIds],
      operations: checkedOperations,
    }, snapshotTargets));
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

function isInternalSchedulingMode(
  value: unknown,
): value is InternalSchedulingMode {
  switch (value) {
    case InternalSchedulingMode.RejectObservableChoice:
    case InternalSchedulingMode.RequireChoiceSchedule:
      return true;
    default:
      return false;
  }
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
  if (!isNonEmptyString(value.profile)) {
    return false;
  }
  const expectedObservations = scenarioObservationsForProfile(value.profile);
  return (
    isNonEmptyString(value.id) &&
    bpmn !== undefined &&
    hasOnlyKeys(bpmn, ["id", "relativePath", "sha256", "sourceOverlay"]) &&
    isNonEmptyString(bpmn.id) &&
    isNonEmptyString(bpmn.relativePath) &&
    isSha256(bpmn.sha256) &&
    isSourceOverlayIdentityOrNull(bpmn.sourceOverlay) &&
    stimuli !== undefined &&
    stimuli.length >= 1 &&
    stimuli.every(isWellFormedStimulus) &&
    stimuli[0] !== undefined &&
    isProcessStartStimulus(stimuli[0]) &&
    stimuli
      .slice(1)
      .every(
        (stimulus) =>
          stimulus.kind === StimulusKind.CompleteUserTaskInstance ||
          stimulus.kind === StimulusKind.DeliverMessage ||
          stimulus.kind === StimulusKind.DeliverPayloadMessage ||
          stimulus.kind === StimulusKind.DeliverCorrelatedPayloadMessage ||
          stimulus.kind === StimulusKind.FireTimer ||
          stimulus.kind === StimulusKind.CompleteEffect ||
          stimulus.kind === StimulusKind.ReportEffectFailure ||
          stimulus.kind === StimulusKind.RetryIncident ||
          stimulus.kind === StimulusKind.CancelIncidentProcess,
      ) &&
    observations !== undefined &&
    observations.length === expectedObservations.length &&
    observations.every(
      (observation, index) => observation === expectedObservations[index],
    )
  );
}

function isProcessStartStimulus(
  stimulus: Stimulus,
): stimulus is ProcessStartStimulus {
  switch (stimulus.kind) {
    case StimulusKind.StartProcess:
    case StimulusKind.TriggerMessageStart:
    case StimulusKind.TriggerTimerStart:
      return true;
    case StimulusKind.CompleteUserTaskInstance:
    case StimulusKind.DeliverMessage:
    case StimulusKind.DeliverPayloadMessage:
    case StimulusKind.DeliverCorrelatedPayloadMessage:
    case StimulusKind.FireTimer:
    case StimulusKind.CompleteEffect:
    case StimulusKind.ReportEffectFailure:
    case StimulusKind.RetryIncident:
    case StimulusKind.CancelIncidentProcess:
      return false;
    default:
      return assertNever(stimulus);
  }
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported stimulus variant: ${JSON.stringify(value)}`);
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
