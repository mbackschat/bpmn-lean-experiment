import {
  EffectOperation,
  EffectProtocol,
  MappingExpressionKind,
  SemanticOperationKind,
  SemanticOriginKind,
} from "./semantic-process-contract.js";
import type {
  SemanticOperation,
} from "./semantic-process-contract.js";
import {
  isWellFormedChooseOperation,
} from "./simple-boolean-choice-admission.js";
import {
  compareCanonicalStrings,
  isWellFormedWireString,
} from "./wire.js";

/** Validates one operation independently of profile topology and graph reachability. */
export function isWellFormedSemanticOperation(
  value: unknown,
  placeIds: ReadonlySet<string>,
  placeOrigins: ReadonlyMap<string, string>,
  scopeIds: ReadonlySet<string>,
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
    case SemanticOperationKind.EnterScope:
      return (
        hasOnlyKeys(value, [
          "id",
          "kind",
          "origin",
          "input",
          "childEntry",
          "childScopeId",
        ]) &&
        isPlaceReference(value.input, placeIds) &&
        isPlaceReference(value.childEntry, placeIds) &&
        isNonEmptyString(value.childScopeId) &&
        scopeIds.has(value.childScopeId)
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
    case SemanticOperationKind.ThrowError:
      return isWellFormedThrowError(
        value,
        placeIds,
        placeOrigins,
        scopeIds,
      );
    case SemanticOperationKind.ReachNoneEnd:
      return (
        hasOnlyKeys(value, ["id", "kind", "origin", "input"]) &&
        isPlaceReference(value.input, placeIds)
      );
    case SemanticOperationKind.CompleteScope:
      return (
        hasOnlyKeys(value, [
          "id",
          "kind",
          "origin",
          "scopeId",
          "parentOutput",
        ]) &&
        isNonEmptyString(value.scopeId) &&
        scopeIds.has(value.scopeId) &&
        (value.parentOutput === null ||
          isPlaceReference(value.parentOutput, placeIds))
      );
    default:
      return false;
  }
}

function isWellFormedThrowError(
  value: Record<string, unknown>,
  placeIds: ReadonlySet<string>,
  placeOrigins: ReadonlyMap<string, string>,
  scopeIds: ReadonlySet<string>,
): boolean {
  if (
    !hasOnlyKeys(value, [
      "id",
      "kind",
      "origin",
      "input",
      "error",
      "handler",
    ]) ||
    !isPlaceReference(value.input, placeIds) ||
    !isErrorReference(value.error) ||
    !isRecord(value.handler) ||
    !hasOnlyKeys(value.handler, [
      "attachedScopeId",
      "code",
      "output",
      "origin",
    ]) ||
    !isNonEmptyString(value.handler.attachedScopeId) ||
    !scopeIds.has(value.handler.attachedScopeId) ||
    value.handler.code !== value.error.code ||
    !isPlaceReference(value.handler.output, placeIds) ||
    !isRecord(value.handler.origin) ||
    !hasOnlyKeys(value.handler.origin, [
      "kind",
      "boundaryEventId",
      "errorDefinitionId",
      "errorElementId",
      "sequenceFlowId",
    ])
  ) {
    return false;
  }
  return value.handler.origin.kind === SemanticOriginKind.BpmnElement &&
    isNonEmptyString(value.handler.origin.boundaryEventId) &&
    isNonEmptyString(value.handler.origin.errorDefinitionId) &&
    value.handler.origin.errorElementId === value.error.errorElementId &&
    isNonEmptyString(value.handler.origin.sequenceFlowId) &&
    placeOrigins.get(value.handler.output) ===
      value.handler.origin.sequenceFlowId;
}

function isErrorReference(value: unknown): value is Readonly<{
  errorDefinitionId: string;
  errorElementId: string;
  code: string;
}> {
  return isRecord(value) &&
    hasOnlyKeys(value, ["errorDefinitionId", "errorElementId", "code"]) &&
    isNonEmptyString(value.errorDefinitionId) &&
    isNonEmptyString(value.errorElementId) &&
    isNonEmptyString(value.code);
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

function isManyPlaceReferences(
  value: unknown,
  placeIds: ReadonlySet<string>,
): boolean {
  return Array.isArray(value) &&
    value.length >= 2 &&
    new Set(value).size === value.length &&
    isSortedStrings(value) &&
    value.every((item) => isPlaceReference(item, placeIds));
}

function isPlaceReference(
  value: unknown,
  placeIds: ReadonlySet<string>,
): value is string {
  return isNonEmptyString(value) && placeIds.has(value);
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
  return Object.keys(value).length === allowed.size &&
    Object.keys(value).every((key) => allowed.has(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return isWellFormedWireString(value) && value.length > 0;
}
