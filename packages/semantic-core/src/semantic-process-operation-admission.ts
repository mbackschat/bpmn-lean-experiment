import {
  EffectOperation,
  EffectProtocol,
  MappingExpressionKind,
  MessageChannelKind,
} from "./semantic-value-contract.js";
import { SemanticOperationKind, SemanticOriginKind } from "./semantic-process-contract.js";
import type { SemanticOperation } from "./semantic-process-contract.js";
import {
  isWellFormedChooseOperation,
} from "./simple-boolean-choice-admission.js";
import {
  isWellFormedSelectManyOperation,
  isWellFormedSynchronizeSelectedOperation,
} from "./inclusive-gateway-admission.js";
import { isMessageChannel } from "./message-channel.js";
import {
  compareCanonicalStrings,
  isWellFormedWireString,
} from "./wire.js";
import {
  isWellFormedAwaitEventRaceOperation,
} from "./event-race-admission.js";
import {
  isWellFormedAwaitBoundedUserTaskOperation,
  isWellFormedAwaitMonitoredUserTaskOperation,
  isWellFormedEnterBoundedScopeOperation,
} from "./bounded-wait-admission.js";
import {
  isWellFormedInvokeProcessOperation,
  isWellFormedReturnProcessOperation,
} from "./call-activity-admission.js";
import {
  isWellFormedInitiateMessageOperation,
} from "./semantic-process-message-start.js";
import {
  isWellFormedInitiateTimerOperation,
} from "./semantic-process-timer-start.js";
import {
  hasExactOptionalUserTaskMetadata,
} from "./user-task-metadata.js";
import {
  isWellFormedAwaitSequentialMultiInstanceUserTaskOperation,
} from "./sequential-multi-instance-admission.js";
import {
  isWellFormedCompleteParallelMultiInstanceUserTaskOperation,
  isWellFormedAwaitParallelMultiInstanceUserTaskOperation,
} from "./parallel-multi-instance-admission.js";

/**
 * The direct Data Input Association arm of one data-bearing User Task entry operation.
 *
 * The four identities are the exact source identities the runtime copy resolves by, so they must be
 * present and mutually distinct: a shared identifier would let the association read the DataInput it
 * is meant to fill, or let the task be disposed by another element's completion.
 */
function isWellFormedAwaitDataInputUserTaskOperation(
  value: Record<string, unknown>,
  placeIds: ReadonlySet<string>,
): boolean {
  if (
    !hasOnlyKeys(value, [
      "id",
      "kind",
      "origin",
      "input",
      "output",
      "task",
      "directInput",
    ]) ||
    !isPlaceReference(value.input, placeIds) ||
    !isPlaceReference(value.output, placeIds) ||
    value.input === value.output ||
    !isRecord(value.task) ||
    !hasOnlyKeys(value.task, ["elementId", "name"]) ||
    !isRecord(value.origin) ||
    !isNonEmptyString(value.task.elementId) ||
    value.task.elementId !== value.origin.elementId ||
    !isOptionalName(value.task.name) ||
    !isRecord(value.directInput) ||
    !hasOnlyKeys(value.directInput, [
      "associationId",
      "sourcePropertyId",
      "targetDataInputId",
      "targetDataInputName",
    ]) ||
    !isNonEmptyString(value.directInput.associationId) ||
    !isNonEmptyString(value.directInput.sourcePropertyId) ||
    !isNonEmptyString(value.directInput.targetDataInputId) ||
    !isOptionalName(value.directInput.targetDataInputName)
  ) {
    return false;
  }
  const identities = [
    value.task.elementId,
    value.directInput.associationId,
    value.directInput.sourcePropertyId,
    value.directInput.targetDataInputId,
  ];
  return new Set(identities).size === identities.length;
}

/**
 * The direct Data Output Association arm of one output-bearing User Task entry operation.
 *
 * The four identities are the exact source identities the completion resolves by, so they must be
 * present and mutually distinct. `sourceDataOutputId` and `targetPropertyId` differing is the
 * load-bearing one: equal ids would make a routed write and a name-merged write indistinguishable,
 * which is precisely the confusion this family exists to rule out.
 */
function isWellFormedAwaitDataOutputUserTaskOperation(
  value: Record<string, unknown>,
  placeIds: ReadonlySet<string>,
): boolean {
  if (
    !hasOnlyKeys(value, [
      "id",
      "kind",
      "origin",
      "input",
      "output",
      "task",
      "directOutput",
    ]) ||
    !isPlaceReference(value.input, placeIds) ||
    !isPlaceReference(value.output, placeIds) ||
    value.input === value.output ||
    !isRecord(value.task) ||
    !hasOnlyKeys(value.task, ["elementId", "name"]) ||
    !isRecord(value.origin) ||
    !isNonEmptyString(value.task.elementId) ||
    value.task.elementId !== value.origin.elementId ||
    !isOptionalName(value.task.name) ||
    !isRecord(value.directOutput) ||
    !hasOnlyKeys(value.directOutput, [
      "associationId",
      "sourceDataOutputId",
      "sourceDataOutputName",
      "targetPropertyId",
    ]) ||
    !isNonEmptyString(value.directOutput.associationId) ||
    !isNonEmptyString(value.directOutput.sourceDataOutputId) ||
    !isOptionalName(value.directOutput.sourceDataOutputName) ||
    !isNonEmptyString(value.directOutput.targetPropertyId)
  ) {
    return false;
  }
  const identities = [
    value.task.elementId,
    value.directOutput.associationId,
    value.directOutput.sourceDataOutputId,
    value.directOutput.targetPropertyId,
  ];
  return new Set(identities).size === identities.length;
}

function isWellFormedAwaitPayloadMessageOperation(
  value: Record<string, unknown>,
  placeIds: ReadonlySet<string>,
): boolean {
  if (
    !hasOnlyKeys(value, [
      "id",
      "kind",
      "origin",
      "input",
      "output",
      "message",
      "directOutput",
    ]) ||
    !isPlaceReference(value.input, placeIds) ||
    !isPlaceReference(value.output, placeIds) ||
    value.input === value.output ||
    !isRecord(value.origin) ||
    !isRecord(value.message) ||
    !hasOnlyKeys(value.message, ["elementId", "channel"]) ||
    !isNonEmptyString(value.message.elementId) ||
    value.message.elementId !== value.origin.elementId ||
    !isMessageChannel(value.message.channel) ||
    value.message.channel.kind !== MessageChannelKind.OperationMessage ||
    !isRecord(value.directOutput) ||
    !hasOnlyKeys(value.directOutput, [
      "associationId",
      "sourceDataOutputId",
      "sourceDataOutputName",
      "targetPropertyId",
    ]) ||
    !isNonEmptyString(value.directOutput.associationId) ||
    !isNonEmptyString(value.directOutput.sourceDataOutputId) ||
    !isOptionalName(value.directOutput.sourceDataOutputName) ||
    !isNonEmptyString(value.directOutput.targetPropertyId)
  ) {
    return false;
  }
  const identities = [
    value.message.elementId,
    value.message.channel.messageId,
    value.directOutput.associationId,
    value.directOutput.sourceDataOutputId,
    value.directOutput.targetPropertyId,
  ];
  return new Set(identities).size === identities.length;
}

/** A BPMN `name` this profile admits: physically absent as `null`, or a nonempty string. */
function isOptionalName(value: unknown): boolean {
  return value === null || isNonEmptyString(value);
}

/** Validates one operation independently of profile topology and graph reachability. */
export function isWellFormedSemanticOperation(
  value: unknown,
  placeIds: ReadonlySet<string>,
  placeOrigins: ReadonlyMap<string, string>,
  scopeOrigins: ReadonlyMap<string, string>,
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
    case SemanticOperationKind.InitiateMessage:
      return isWellFormedInitiateMessageOperation(value, placeIds);
    case SemanticOperationKind.InitiateTimer:
      return isWellFormedInitiateTimerOperation(value, placeIds);
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
        scopeOrigins.has(value.childScopeId)
      );
    case SemanticOperationKind.EnterBoundedScope:
      return isWellFormedEnterBoundedScopeOperation(
        value,
        placeIds,
        placeOrigins,
        scopeOrigins,
      );
    case SemanticOperationKind.InvokeProcess:
      return isWellFormedInvokeProcessOperation(value, placeIds, scopeOrigins);
    case SemanticOperationKind.ReturnProcess:
      return isWellFormedReturnProcessOperation(value, placeIds, scopeOrigins);
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
        hasOnlyKeys(
          value.task,
          Object.hasOwn(value.task, "metadata")
            ? ["elementId", "name", "metadata"]
            : ["elementId", "name"],
        ) &&
        hasExactOptionalUserTaskMetadata(value.task) &&
        value.task.elementId === value.origin.elementId &&
        (value.task.name === null || typeof value.task.name === "string")
      );
    case SemanticOperationKind.AwaitDataInputUserTask:
      return isWellFormedAwaitDataInputUserTaskOperation(value, placeIds);
    case SemanticOperationKind.AwaitDataOutputUserTask:
      return isWellFormedAwaitDataOutputUserTaskOperation(value, placeIds);
    case SemanticOperationKind.AwaitSequentialMultiInstanceUserTask:
      return isWellFormedAwaitSequentialMultiInstanceUserTaskOperation(
        value,
        placeIds,
        placeOrigins,
      );
    case SemanticOperationKind.AwaitParallelMultiInstanceUserTask:
      return isWellFormedAwaitParallelMultiInstanceUserTaskOperation(
        value,
        placeIds,
        placeOrigins,
      );
    case SemanticOperationKind.CompleteParallelMultiInstanceUserTask:
      return isWellFormedCompleteParallelMultiInstanceUserTaskOperation(
        value,
        placeIds,
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
    case SemanticOperationKind.AwaitPayloadMessage:
      return isWellFormedAwaitPayloadMessageOperation(value, placeIds);
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
    case SemanticOperationKind.MergeExclusive:
      return (
        hasOnlyKeys(value, [
          "id",
          "kind",
          "origin",
          "inputs",
          "output",
        ]) &&
        isNonEmptyPlaceReferences(value.inputs, placeIds) &&
        isPlaceReference(value.output, placeIds) &&
        value.inputs.every((input) => input !== value.output)
      );
    case SemanticOperationKind.Choose:
      return isWellFormedChooseOperation(
        value,
        placeIds,
        placeOrigins,
      );
    case SemanticOperationKind.SelectMany:
      return isWellFormedSelectManyOperation(value, placeIds, placeOrigins);
    case SemanticOperationKind.SynchronizeSelected:
      return isWellFormedSynchronizeSelectedOperation(value, placeIds);
    case SemanticOperationKind.AwaitEventRace:
      return isWellFormedAwaitEventRaceOperation(value, placeIds, placeOrigins);
    case SemanticOperationKind.AwaitBoundedUserTask:
      return isWellFormedAwaitBoundedUserTaskOperation(
        value,
        placeIds,
        placeOrigins,
      );
    case SemanticOperationKind.AwaitMonitoredUserTask:
      return isWellFormedAwaitMonitoredUserTaskOperation(
        value,
        placeIds,
        placeOrigins,
      );
    case SemanticOperationKind.ThrowError:
      return isWellFormedThrowError(
        value,
        placeIds,
        placeOrigins,
        scopeOrigins,
      );
    case SemanticOperationKind.TerminateScope:
      return (
        hasOnlyKeys(value, ["id", "kind", "origin", "input", "scopeId"]) &&
        isPlaceReference(value.input, placeIds) &&
        isNonEmptyString(value.scopeId) &&
        scopeOrigins.has(value.scopeId)
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
        scopeOrigins.has(value.scopeId) &&
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
  scopeOrigins: ReadonlyMap<string, string>,
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
    !scopeOrigins.has(value.handler.attachedScopeId) ||
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
): value is string[] {
  return isCanonicalPlaceReferences(value, placeIds, 2);
}

function isNonEmptyPlaceReferences(
  value: unknown,
  placeIds: ReadonlySet<string>,
): value is string[] {
  return isCanonicalPlaceReferences(value, placeIds, 1);
}

function isCanonicalPlaceReferences(
  value: unknown,
  placeIds: ReadonlySet<string>,
  minimumLength: number,
): value is string[] {
  return Array.isArray(value) &&
    value.length >= minimumLength &&
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
