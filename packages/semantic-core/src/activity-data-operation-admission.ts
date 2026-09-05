import { isWellFormedWireString } from "./wire.js";

/**
 * The direct Data Input Association arm of one data-bearing User Task entry operation.
 *
 * The four identities are the exact source identities the runtime copy resolves by, so they must be
 * present and mutually distinct: a shared identifier would let the association read the DataInput it
 * is meant to fill, or let the task be disposed by another element's completion.
 */
export function isWellFormedAwaitDataInputUserTaskOperation(
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
 * Admits both direct associations only when they describe one unambiguous Activity lifetime.
 *
 * The predecessor validators remain the owners of each directional contract. The composition adds
 * the cross-half identity rule from the approved Activity data input/output proposal: all seven
 * BPMN element identities must differ, especially the two association ids that a hand-built Program
 * can alias even though an XML document cannot repeat an `xsd:ID`.
 */
export function isWellFormedAwaitDataInputOutputUserTaskOperation(
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
      "directOutput",
    ]) ||
    !isRecord(value.task) ||
    !isRecord(value.directInput) ||
    !isRecord(value.directOutput) ||
    !isWellFormedAwaitDataInputUserTaskOperation({
      id: value.id,
      kind: value.kind,
      origin: value.origin,
      input: value.input,
      output: value.output,
      task: value.task,
      directInput: value.directInput,
    }, placeIds) ||
    !isWellFormedAwaitDataOutputUserTaskOperation({
      id: value.id,
      kind: value.kind,
      origin: value.origin,
      input: value.input,
      output: value.output,
      task: value.task,
      directOutput: value.directOutput,
    }, placeIds)
  ) {
    return false;
  }
  const identities = [
    value.task.elementId,
    value.directInput.associationId,
    value.directInput.sourcePropertyId,
    value.directInput.targetDataInputId,
    value.directOutput.associationId,
    value.directOutput.sourceDataOutputId,
    value.directOutput.targetPropertyId,
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
export function isWellFormedAwaitDataOutputUserTaskOperation(
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

function isOptionalName(value: unknown): boolean {
  return value === null || isNonEmptyString(value);
}

function isPlaceReference(
  value: unknown,
  placeIds: ReadonlySet<string>,
): value is string {
  return isNonEmptyString(value) && placeIds.has(value);
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
