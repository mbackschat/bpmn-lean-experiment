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
  EffectOperation,
  EffectProtocol,
  MappingExpressionKind,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
} from "./semantic-process-contract.js";
import type {
  SemanticOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import {
  isWellFormedChooseOperation,
} from "./simple-boolean-choice-admission.js";
import {
  isWellFormedSemanticProcessGraph,
} from "./semantic-process-graph-admission.js";
import {
  profileAllowsOperationKinds,
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
    profileAllowsOperationKinds(
      program.identity.semanticProfile,
      program.operations.map(({ kind }) => kind),
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
    profileAllowsOperationKinds(
      program.identity.semanticProfile,
      program.operations.map(({ kind }) => kind),
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
  const controlPlaces = Array.isArray(value.controlPlaces)
    ? value.controlPlaces
    : undefined;
  const operations = Array.isArray(value.operations)
    ? value.operations
    : undefined;
  if (
    value.kind !== SemanticProcessKind.SemanticProcess ||
    identity === undefined ||
    identity.compiler !==
      SemanticProcessCompilerId.BpmnSourceSemanticProcess ||
    !isNonEmptyString(identity.semanticProfile) ||
    !isNonEmptyString(identity.sourceId) ||
    !isSha256(identity.sourceSha256) ||
    !isNonEmptyString(value.processId) ||
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
    if (!isWellFormedOperation(operation, placeIds, placeOrigins)) {
      return false;
    }
    checkedOperations.push(operation);
  }
  return isWellFormedSemanticProcessGraph({
    controlPlaceIds: [...placeIds],
    operations: checkedOperations,
  });
}

function isWellFormedOperation(
  value: unknown,
  placeIds: ReadonlySet<string>,
  placeOrigins: ReadonlyMap<string, string>,
): value is SemanticOperation {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.id) ||
    !isRecord(value.origin) ||
    !hasOnlyKeys(value.origin, ["kind", "elementId"]) ||
    value.origin.kind !== SemanticOriginKind.BpmnElement ||
    !isNonEmptyString(value.origin.elementId)
  ) {
    return false;
  }
  switch (value.kind) {
    case SemanticOperationKind.Initiate:
      return (
        hasOnlyKeys(value, ["id", "kind", "origin", "output"]) &&
        isPlaceReference(value.output, placeIds)
      );
    case SemanticOperationKind.AwaitUserTask:
      return (
        hasOnlyKeys(value, [
          "id",
          "kind",
          "origin",
          "input",
          "output",
          "task",
        ]) &&
        isPlaceReference(value.input, placeIds) &&
        isPlaceReference(value.output, placeIds) &&
        isRecord(value.task) &&
        hasOnlyKeys(value.task, ["elementId", "name"]) &&
        value.task.elementId === value.origin.elementId &&
        (value.task.name === null || typeof value.task.name === "string")
      );
    case SemanticOperationKind.AwaitTimer:
      return (
        hasOnlyKeys(value, [
          "id",
          "kind",
          "origin",
          "input",
          "output",
          "timer",
        ]) &&
        isPlaceReference(value.input, placeIds) &&
        isPlaceReference(value.output, placeIds) &&
        isRecord(value.timer) &&
        hasOnlyKeys(value.timer, ["elementId", "durationMs"]) &&
        value.timer.elementId === value.origin.elementId &&
        value.timer.durationMs === 1000
      );
    case SemanticOperationKind.AwaitMessage:
      return (
        hasOnlyKeys(value, [
          "id",
          "kind",
          "origin",
          "input",
          "output",
          "message",
        ]) &&
        isPlaceReference(value.input, placeIds) &&
        isPlaceReference(value.output, placeIds) &&
        value.input !== value.output &&
        isRecord(value.message) &&
        hasOnlyKeys(value.message, ["elementId", "channel"]) &&
        value.message.elementId === value.origin.elementId &&
        isMessageChannel(value.message.channel)
      );
    case SemanticOperationKind.AwaitEffect:
      return (
        hasOnlyKeys(value, [
          "id",
          "kind",
          "origin",
          "input",
          "output",
          "effect",
          "bpmnErrorRoute",
        ]) &&
        isPlaceReference(value.input, placeIds) &&
        isPlaceReference(value.output, placeIds) &&
        isRecord(value.effect) &&
        hasOnlyKeys(value.effect, [
          "elementId",
          "descriptor",
          "inputMappings",
          "outputMappings",
        ]) &&
        value.effect.elementId === value.origin.elementId &&
        isSupportedEffectContract(
          value.effect,
          value.bpmnErrorRoute,
          placeIds,
        )
      );
    case SemanticOperationKind.Duplicate:
      return (
        hasOnlyKeys(value, [
          "id",
          "kind",
          "origin",
          "input",
          "outputs",
        ]) &&
        isPlaceReference(value.input, placeIds) &&
        isManyPlaceReferences(value.outputs, placeIds)
      );
    case SemanticOperationKind.Synchronize:
      return (
        hasOnlyKeys(value, [
          "id",
          "kind",
          "origin",
          "inputs",
          "output",
        ]) &&
        isManyPlaceReferences(value.inputs, placeIds) &&
        isPlaceReference(value.output, placeIds)
      );
    case SemanticOperationKind.Choose:
      return isWellFormedChooseOperation(
        value,
        placeIds,
        placeOrigins,
      );
    case SemanticOperationKind.Terminate:
      return (
        hasOnlyKeys(value, ["id", "kind", "origin", "input"]) &&
        isPlaceReference(value.input, placeIds)
      );
    default:
      return false;
  }
}

function isMessageChannel(value: unknown): boolean {
  return isRecord(value) &&
    hasOnlyKeys(value, [
      "interfaceId",
      "interfaceOperationId",
      "messageId",
    ]) &&
    isNonEmptyString(value.interfaceId) &&
    isNonEmptyString(value.interfaceOperationId) &&
    isNonEmptyString(value.messageId);
}

function isSupportedEffectContract(
  effect: Record<string, unknown>,
  bpmnErrorRoute: unknown,
  placeIds: ReadonlySet<string>,
): boolean {
  if (
    !isRecord(effect.descriptor) ||
    !hasOnlyKeys(effect.descriptor, ["protocol", "operation"]) ||
    effect.descriptor.protocol !== EffectProtocol.Activity ||
    !isNonEmptyString(effect.descriptor.operation) ||
    !Array.isArray(effect.inputMappings) ||
    !Array.isArray(effect.outputMappings)
  ) {
    return false;
  }
  switch (effect.descriptor.operation) {
    case EffectOperation.Probe:
      return effect.inputMappings.length === 0 &&
        effect.outputMappings.length === 0 &&
        bpmnErrorRoute === null;
    case EffectOperation.MappedSuccess:
      return isSingleMapping(
          effect.inputMappings,
          MappingExpressionKind.StringLiteral,
          "value",
        ) &&
        isSingleMapping(
          effect.outputMappings,
          MappingExpressionKind.LocalVariable,
          "name",
        ) &&
        bpmnErrorRoute === null;
    case EffectOperation.MappedBoundaryError:
      return isSingleMapping(
          effect.inputMappings,
          MappingExpressionKind.StringLiteral,
          "value",
        ) &&
        isSingleMapping(
          effect.outputMappings,
          MappingExpressionKind.LocalVariable,
          "name",
        ) &&
        isWellFormedBpmnErrorRoute(bpmnErrorRoute, placeIds);
    default:
      return false;
  }
}

function isWellFormedBpmnErrorRoute(
  value: unknown,
  placeIds: ReadonlySet<string>,
): boolean {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["code", "output", "origin"]) ||
    !isPlaceReference(value.output, placeIds) ||
    !isRecord(value.origin) ||
    !hasOnlyKeys(value.origin, [
      "kind",
      "boundaryEventId",
      "errorDefinitionId",
      "errorElementId",
      "sequenceFlowId",
    ])
  ) {
    return false;
  }
  return value.origin.kind === SemanticOriginKind.BpmnElement &&
    isNonEmptyString(value.code) &&
    isNonEmptyString(value.origin.boundaryEventId) &&
    isNonEmptyString(value.origin.errorDefinitionId) &&
    isNonEmptyString(value.origin.errorElementId) &&
    isNonEmptyString(value.origin.sequenceFlowId);
}

function isSingleMapping(
  mappings: ReadonlyArray<unknown>,
  kind: MappingExpressionKind,
  valueField: "name" | "value",
): boolean {
  const mapping = mappings[0];
  return mappings.length === 1 &&
    isRecord(mapping) &&
    hasOnlyKeys(mapping, ["target", "expression"]) &&
    isNonEmptyString(mapping.target) &&
    isRecord(mapping.expression) &&
    hasOnlyKeys(mapping.expression, ["kind", valueField]) &&
    mapping.expression.kind === kind &&
    isNonEmptyString(mapping.expression[valueField]);
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

function isManyPlaceReferences(
  value: unknown,
  placeIds: ReadonlySet<string>,
): boolean {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    new Set(value).size === value.length &&
    isSortedStrings(value) &&
    value.every((item) => isPlaceReference(item, placeIds))
  );
}

function isPlaceReference(
  value: unknown,
  placeIds: ReadonlySet<string>,
): value is string {
  return isNonEmptyString(value) && placeIds.has(value);
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

function isSortedStrings(values: ReadonlyArray<unknown>): boolean {
  return values.every(
    (value, index) =>
      typeof value === "string" &&
      (index === 0 ||
        compareCanonicalStrings(String(values[index - 1]), value) < 0),
  );
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
