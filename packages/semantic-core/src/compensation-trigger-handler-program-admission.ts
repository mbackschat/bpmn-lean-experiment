import type {
  CompensationDependency,
  CompensationExecutionDeclaration,
  CompensationSubjectDefinition,
  SingleEffectCompensationHandlerBody,
} from "./compensation-trigger-handler-contract.js";
import {
  SemanticOperationKind,
  type SemanticProcessProgram,
} from "./semantic-process-contract.js";
import { EffectOperation, EffectProtocol } from "./semantic-value-contract.js";
import {
  compareCanonicalStrings,
  isWellFormedWireString,
} from "./wire.js";

/** Establishes the closed declaration bytes before Program-level references are resolved. */
export function isCompensationExecutionDeclaration(
  value: unknown,
): value is CompensationExecutionDeclaration {
  return isRecord(value) &&
    hasOnlyKeys(value, [
      "definitionScopeId",
      "triggerOperationId",
      "subjects",
      "dependencies",
      "limits",
    ]) &&
    isNonEmptyWireString(value.definitionScopeId) &&
    isNonEmptyWireString(value.triggerOperationId) &&
    isDenseArray(value.subjects) &&
    value.subjects.every(isCompensationSubjectDefinition) &&
    isDenseArray(value.dependencies) &&
    value.dependencies.every(isCompensationDependency) &&
    isRecord(value.limits) &&
    hasOnlyKeys(value.limits, [
      "maxTriggers",
      "maxHandlers",
      "maxCanonicalBytes",
    ]) &&
    isPositiveSafeInteger(value.limits.maxTriggers) &&
    isPositiveSafeInteger(value.limits.maxHandlers) &&
    isCanonicalByteLimit(value.limits.maxCanonicalBytes);
}

/** Validates the trigger arm before its declaration-level ownership is available. */
export function isWellFormedTriggerCompensationOperation(
  value: Record<string, unknown>,
  placeIds: ReadonlySet<string>,
  scopeOrigins: ReadonlyMap<string, string>,
): boolean {
  return hasOnlyKeys(value, [
    "id",
    "kind",
    "origin",
    "definitionScopeId",
    "input",
    "output",
  ]) &&
    isNonEmptyWireString(value.definitionScopeId) &&
    scopeOrigins.has(value.definitionScopeId) &&
    isNonEmptyWireString(value.input) &&
    placeIds.has(value.input) &&
    isNonEmptyWireString(value.output) &&
    placeIds.has(value.output) &&
    value.input !== value.output;
}

/** Resolves the declaration against the exact Program-owned roots, operations, and source records. */
export function compensationExecutionMatchesProgram(
  program: SemanticProcessProgram,
): boolean {
  const declaration = program.compensationExecution;
  if (declaration === undefined) {
    return !program.operations.some(
      ({ kind }) => kind === SemanticOperationKind.TriggerCompensation,
    );
  }

  const roots = program.definitionScopes.filter(
    ({ parentScopeId }) => parentScopeId === null,
  );
  const root = roots[0];
  const triggers = program.operations.filter(
    ({ kind }) => kind === SemanticOperationKind.TriggerCompensation,
  );
  const trigger = triggers[0];
  if (
    roots.length !== 1 ||
    root === undefined ||
    root.id !== declaration.definitionScopeId ||
    root.originElementId !== program.processId ||
    triggers.length !== 1 ||
    trigger?.kind !== SemanticOperationKind.TriggerCompensation ||
    trigger.id !== declaration.triggerOperationId ||
    trigger.definitionScopeId !== root.id ||
    program.operationScopes.filter(
      ({ operationId, scopeId }) =>
        operationId === trigger.id && scopeId === root.id,
    ).length !== 1
  ) {
    return false;
  }

  const derived = declaration.subjects.map((subject) => ({
    subject,
    elementId: subjectElementId(program, subject),
  }));
  if (
    derived.some(({ elementId }) => elementId === undefined) ||
    !strictlySorted(
      derived as ReadonlyArray<{
        subject: CompensationSubjectDefinition;
        elementId: string;
      }>,
      (left, right) => compareCanonicalStrings(left.elementId, right.elementId),
    )
  ) {
    return false;
  }
  const subjectElementIds = derived.map(({ elementId }) => elementId as string);
  if (new Set(subjectElementIds).size !== subjectElementIds.length) return false;

  const boundarySubjects = declaration.subjects.filter(
    (subject): subject is Extract<
      CompensationSubjectDefinition,
      { kind: "boundaryActivity" }
    > => subject.kind === "boundaryActivity",
  );
  const eventSubProcessSubjects = declaration.subjects.filter(
    (subject): subject is Extract<
      CompensationSubjectDefinition,
      { kind: "eventSubProcess" }
    > => subject.kind === "eventSubProcess",
  );
  const retentionTargets = program.compensationActivityRetention?.targets ?? [];
  const snapshotTargets = program.compensationEventSubProcessSnapshots?.targets ?? [];
  if (
    retentionTargets.length !== boundarySubjects.length ||
    !retentionTargets.every((target) =>
      boundarySubjects.filter(
        ({ subjectElementId }) => subjectElementId === target.activityElementId,
      ).length === 1
    ) ||
    snapshotTargets.length !== eventSubProcessSubjects.length ||
    !snapshotTargets.every((target) =>
      eventSubProcessSubjects.filter(
        ({ parentScopeId, handlerScopeId }) =>
          parentScopeId === target.parentScopeId &&
          handlerScopeId === target.handlerScopeId,
      ).length === 1
    )
  ) {
    return false;
  }

  const ownedElementIds = new Set<string>();
  for (const subject of declaration.subjects) {
    if (!subjectMatchesProgram(program, subject)) return false;
    const group = new Set([
      subject.body.handlerElementId,
      subject.body.effectElementId,
    ]);
    if (
      [...group].some(
        (elementId) =>
          subjectElementIds.includes(elementId) || ownedElementIds.has(elementId),
      )
    ) {
      return false;
    }
    for (const elementId of group) ownedElementIds.add(elementId);
  }
  if (
    subjectElementIds.includes(trigger.id) ||
    subjectElementIds.includes(trigger.origin.elementId) ||
    ownedElementIds.has(trigger.id) ||
    ownedElementIds.has(trigger.origin.elementId) ||
    program.operations.some(
      (operation) =>
        operation.kind !== SemanticOperationKind.TriggerCompensation &&
        ownedElementIds.has(operation.origin.elementId),
    )
  ) {
    return false;
  }

  return strictlySorted(declaration.dependencies, compareDependencies) &&
    declaration.dependencies.every(
      ({ predecessorElementId, successorElementId }) =>
        predecessorElementId !== successorElementId &&
        subjectElementIds.includes(predecessorElementId) &&
        subjectElementIds.includes(successorElementId),
    ) &&
    dependenciesAreAcyclic(subjectElementIds, declaration.dependencies);
}

function isCompensationSubjectDefinition(
  value: unknown,
): value is CompensationSubjectDefinition {
  if (!isRecord(value) || !isSingleEffectBody(value.body)) return false;
  switch (value.kind) {
    case "boundaryActivity":
      return hasOnlyKeys(value, ["kind", "subjectElementId", "body"]) &&
        isNonEmptyWireString(value.subjectElementId);
    case "eventSubProcess":
      return hasOnlyKeys(value, [
        "kind",
        "parentScopeId",
        "handlerScopeId",
        "body",
      ]) &&
        isNonEmptyWireString(value.parentScopeId) &&
        isNonEmptyWireString(value.handlerScopeId) &&
        value.parentScopeId !== value.handlerScopeId;
    default:
      return false;
  }
}

function isSingleEffectBody(
  value: unknown,
): value is SingleEffectCompensationHandlerBody {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "kind",
      "handlerElementId",
      "effectElementId",
      "descriptor",
      "input",
    ]) ||
    value.kind !== "singleEffect" ||
    !isNonEmptyWireString(value.handlerElementId) ||
    !isNonEmptyWireString(value.effectElementId) ||
    !isRecord(value.descriptor) ||
    !hasOnlyKeys(value.descriptor, ["protocol", "operation"]) ||
    value.descriptor.protocol !== EffectProtocol.Activity ||
    value.descriptor.operation !== EffectOperation.CompensationSingleEffect ||
    !isRecord(value.input)
  ) {
    return false;
  }
  switch (value.input.kind) {
    case "empty":
      return hasOnlyKeys(value.input, ["kind"]);
    case "restoredProcessBinding":
      return hasOnlyKeys(value.input, [
        "kind",
        "sourceName",
        "argumentName",
      ]) &&
        isNonEmptyWireString(value.input.sourceName) &&
        isNonEmptyWireString(value.input.argumentName) &&
        value.input.sourceName !== value.input.argumentName;
    default:
      return false;
  }
}

function isCompensationDependency(
  value: unknown,
): value is CompensationDependency {
  return isRecord(value) &&
    hasOnlyKeys(value, [
      "predecessorElementId",
      "successorElementId",
      "reason",
    ]) &&
    isNonEmptyWireString(value.predecessorElementId) &&
    isNonEmptyWireString(value.successorElementId) &&
    value.reason === "sequenceFlow";
}

function subjectElementId(
  program: SemanticProcessProgram,
  subject: CompensationSubjectDefinition,
): string | undefined {
  return subject.kind === "boundaryActivity"
    ? subject.subjectElementId
    : program.definitionScopes.find(({ id }) => id === subject.parentScopeId)
      ?.originElementId;
}

function subjectMatchesProgram(
  program: SemanticProcessProgram,
  subject: CompensationSubjectDefinition,
): boolean {
  if (subject.kind === "boundaryActivity") {
    const targets = program.compensationActivityRetention?.targets.filter(
      ({ activityElementId }) => activityElementId === subject.subjectElementId,
    ) ?? [];
    const target = targets[0];
    return targets.length === 1 && target !== undefined &&
      subject.body.handlerElementId === target.compensationActivityElementId &&
      subject.body.effectElementId === target.compensationActivityElementId &&
      subject.body.input.kind === "empty";
  }

  const handler = program.definitionScopes.filter(
    ({ id }) => id === subject.handlerScopeId,
  );
  return handler.length === 1 &&
    handler[0]?.originElementId === subject.body.handlerElementId &&
    subject.body.effectElementId !== subject.body.handlerElementId &&
    subject.body.input.kind === "restoredProcessBinding";
}

function compareDependencies(
  left: CompensationDependency,
  right: CompensationDependency,
): number {
  return compareCanonicalStrings(
    left.predecessorElementId,
    right.predecessorElementId,
  ) || compareCanonicalStrings(
    left.successorElementId,
    right.successorElementId,
  );
}

function dependenciesAreAcyclic(
  subjectElementIds: ReadonlyArray<string>,
  dependencies: ReadonlyArray<CompensationDependency>,
): boolean {
  const incoming = new Map(
    subjectElementIds.map((elementId) => [
      elementId,
      dependencies.filter(
        ({ successorElementId }) => successorElementId === elementId,
      ).length,
    ]),
  );
  const ready = subjectElementIds.filter(
    (elementId) => incoming.get(elementId) === 0,
  );
  let visited = 0;
  while (ready.length > 0) {
    const current = ready.shift();
    if (current === undefined) continue;
    visited += 1;
    for (const dependency of dependencies) {
      if (dependency.predecessorElementId !== current) continue;
      const remaining = (incoming.get(dependency.successorElementId) ?? 0) - 1;
      incoming.set(dependency.successorElementId, remaining);
      if (remaining === 0) ready.push(dependency.successorElementId);
    }
  }
  return visited === subjectElementIds.length;
}

function strictlySorted<T>(
  values: ReadonlyArray<T>,
  compare: (left: T, right: T) => number,
): boolean {
  return values.every(
    (value, index) =>
      index === 0 || compare(values[index - 1] as T, value) < 0,
  );
}

function isDenseArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && Object.keys(value).length === value.length;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isCanonicalByteLimit(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 2 &&
    Number(value) <= 65_536;
}

function isNonEmptyWireString(value: unknown): value is string {
  return isWellFormedWireString(value) && value.length > 0;
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
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
