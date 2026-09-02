import type { CompensationHandlerFailure, OccurrenceId } from "./contract.js";
import type {
  CompensationHandlerEffectWait,
  CompensationHandlerExecution,
  CompensationSubjectOccurrence,
  CompensationTriggerExecution,
} from "./compensation-trigger-handler-runtime-contract.js";
import type {
  CompensationSubjectDefinition,
  SingleEffectCompensationHandlerBody,
} from "./compensation-trigger-handler-contract.js";
import { EffectOperation, EffectProtocol } from "./semantic-value-contract.js";
import type { SemanticProcessProgram } from "./semantic-process-contract.js";
import {
  ControlStateKind,
  sameOccurrence,
  sameScopeOccurrence,
  type RuntimeState,
} from "./semantic-process-state.js";
import {
  compareCanonicalStrings,
  isWellFormedWireString,
  utf8ByteLength,
} from "./wire.js";
import {
  isDenseArray,
  isVariablePatch,
  sameVariableValue,
} from "./variable-value.js";

export enum CompensationExecutionStateDefect {
  ProgramPresenceMismatch = "programPresenceMismatch",
  InvalidTrigger = "invalidTrigger",
  InvalidHandlerEffectWait = "invalidHandlerEffectWait",
  CapacityExceeded = "capacityExceeded",
  FailedLifecycleMismatch = "failedLifecycleMismatch",
}

/** Materializes both declaration-owned collections together while preserving every old Program byte. */
export function initializeCompensationExecutionState(
  program: SemanticProcessProgram,
  state: RuntimeState,
): RuntimeState {
  return state.control.kind === ControlStateKind.NotStarted &&
      program.compensationExecution !== undefined &&
      state.compensationTriggers === undefined &&
      state.compensationHandlerEffectWaits === undefined
    ? { ...state, compensationTriggers: [], compensationHandlerEffectWaits: [] }
    : state;
}

/** Decides the declaration, lifecycle, join, identity, order, and capacity contract of trigger state. */
export function compensationExecutionStateDefects(
  program: SemanticProcessProgram,
  state: RuntimeState,
): ReadonlyArray<CompensationExecutionStateDefect> {
  const declaration = program.compensationExecution;
  const triggers = state.compensationTriggers;
  const waits = state.compensationHandlerEffectWaits;
  if (declaration === undefined || triggers === undefined || waits === undefined) {
    return declaration === undefined && triggers === undefined && waits === undefined
      ? []
      : [CompensationExecutionStateDefect.ProgramPresenceMismatch];
  }

  const defects: CompensationExecutionStateDefect[] = [];
  const triggerShapeValid = triggers.every((trigger) =>
    triggerMatchesDeclaration(program, trigger) && triggerLifecycleIsValid(state, trigger)
  );
  if (
    !triggerShapeValid ||
    !isStrictlySorted(triggers, (left, right) => compareOccurrences(left.id, right.id)) ||
    hasDuplicateOccurrence(triggers) ||
    hasDuplicateActiveTriggerOwner(triggers) ||
    triggers.some(({ handlers }) =>
      !isStrictlySorted(handlers, (left, right) => compareOccurrences(left.id, right.id)) ||
      hasDuplicateOccurrence(handlers) ||
      hasDuplicateSubject(handlers)
    )
  ) {
    defects.push(CompensationExecutionStateDefect.InvalidTrigger);
  }

  const waitsValid = waits.every((wait) => handlerEffectWaitIsValid(program, triggers, wait));
  const everyCompensatingHandlerHasOneWait = triggers.every((trigger) =>
    trigger.handlers.every((handler) =>
      handler.lifecycle !== "compensating" ||
      waits.filter((wait) =>
          sameOccurrence(wait.triggerId, trigger.id) &&
          sameOccurrence(wait.handlerId, handler.id) &&
          sameOccurrence(wait.id, handler.effectId)
        ).length === 1
    )
  );
  const ordinaryEffectIds = [
    ...state.effectWaits.map(({ id }) => id),
    ...state.effectIncidents.map(({ wait }) => wait.id),
  ];
  if (
    !waitsValid ||
    !everyCompensatingHandlerHasOneWait ||
    !isStrictlySorted(waits, (left, right) => compareOccurrences(left.id, right.id)) ||
    hasDuplicateOccurrence(waits) ||
    waits.some(({ id }) => ordinaryEffectIds.some((other) => sameOccurrence(id, other)))
  ) {
    defects.push(CompensationExecutionStateDefect.InvalidHandlerEffectWait);
  }

  if (
    triggers.length > declaration.limits.maxTriggers ||
    triggers.some(({ handlers }) => handlers.length > declaration.limits.maxHandlers) ||
    canonicalCompensationExecutionStateUtf8Bytes(triggers, waits) >
      declaration.limits.maxCanonicalBytes
  ) {
    defects.push(CompensationExecutionStateDefect.CapacityExceeded);
  }

  if (!controlLifecycleIsValid(program, state, triggers, waits)) {
    defects.push(CompensationExecutionStateDefect.FailedLifecycleMismatch);
  }
  return [...new Set(defects)];
}

export function canonicalCompensationExecutionStateUtf8Bytes(
  triggers: ReadonlyArray<CompensationTriggerExecution>,
  waits: ReadonlyArray<CompensationHandlerEffectWait>,
): number {
  return utf8ByteLength(canonicalJson([triggers, waits]));
}

export function isCompensationTriggerExecution(
  value: unknown,
): value is CompensationTriggerExecution {
  return isExactRecord(value, [
    "id",
    "owner",
    "output",
    "lifecycle",
    "handlers",
    "dependencies",
  ]) && isOccurrenceId(value.id) && isScopeOccurrenceId(value.owner) &&
    isNonemptyString(value.output) &&
    ["active", "succeeded", "failed"].includes(String(value.lifecycle)) &&
    isDenseArray(value.handlers) && value.handlers.every(isCompensationHandlerExecution) &&
    isDenseArray(value.dependencies) &&
    value.dependencies.every(isCompensationOccurrenceDependency);
}

export function isCompensationHandlerEffectWait(
  value: unknown,
): value is CompensationHandlerEffectWait {
  return isExactRecord(value, [
    "id",
    "triggerId",
    "handlerId",
    "descriptor",
    "arguments",
  ]) && isOccurrenceId(value.id) && isOccurrenceId(value.triggerId) &&
    isOccurrenceId(value.handlerId) && isExactRecord(value.descriptor, [
      "protocol",
      "operation",
    ]) && value.descriptor.protocol === EffectProtocol.Activity &&
    value.descriptor.operation === EffectOperation.CompensationSingleEffect &&
    isVariablePatch(value.arguments) && value.arguments.length <= 1;
}

function isCompensationHandlerExecution(
  value: unknown,
): value is CompensationHandlerExecution {
  if (!isExactRecord(value, [
    "id",
    "subject",
    "handlerElementId",
    "lifecycle",
  ], ["restoredContext", "effectId"]) || !isOccurrenceId(value.id) ||
    !isCompensationSubjectOccurrence(value.subject) ||
    !isNonemptyString(value.handlerElementId)) {
    return false;
  }
  switch (value.lifecycle) {
    case "pending":
      return Object.hasOwn(value, "restoredContext") &&
        (value.restoredContext === null ||
          isCompensationParentContextSnapshot(value.restoredContext)) &&
        !Object.hasOwn(value, "effectId");
    case "compensated":
    case "failed":
    case "terminated":
      return !Object.hasOwn(value, "restoredContext") && !Object.hasOwn(value, "effectId");
    case "compensating":
      return Object.hasOwn(value, "restoredContext") &&
        (value.restoredContext === null || isCompensationParentContextSnapshot(value.restoredContext)) &&
        isOccurrenceId(value.effectId);
    default:
      return false;
  }
}

function isCompensationSubjectOccurrence(
  value: unknown,
): value is CompensationSubjectOccurrence {
  if (!isRecord(value)) return false;
  switch (value.kind) {
    case "boundaryActivity":
      return isExactRecord(value, ["kind", "activity"]) &&
        isActivityOccurrenceId(value.activity);
    case "eventSubProcess":
      return isExactRecord(value, ["kind", "parent"]) &&
        isScopeOccurrenceId(value.parent);
    default:
      return false;
  }
}

function isCompensationOccurrenceDependency(value: unknown): boolean {
  return isExactRecord(value, ["predecessor", "successor", "reason"]) &&
    isCompensationSubjectOccurrence(value.predecessor) &&
    isCompensationSubjectOccurrence(value.successor) &&
    value.reason === "sequenceFlow";
}

function isCompensationParentContextSnapshot(value: unknown): boolean {
  return isExactRecord(value, ["frames"]) && isDenseArray(value.frames) &&
    value.frames.every((frame) => isExactRecord(frame, ["owner", "bindings"]) &&
      isScopeOccurrenceId(frame.owner) && isVariablePatch(frame.bindings));
}

function isOccurrenceId(value: unknown): value is OccurrenceId {
  return isExactRecord(value, ["processInstanceId", "elementId", "activation"]) &&
    isNonemptyString(value.processInstanceId) && isNonemptyString(value.elementId) &&
    Number.isSafeInteger(value.activation) && Number(value.activation) >= 1;
}

function isActivityOccurrenceId(value: unknown): boolean {
  return isExactRecord(value, ["processInstanceId", "activityElementId", "activation"]) &&
    isNonemptyString(value.processInstanceId) && isNonemptyString(value.activityElementId) &&
    Number.isSafeInteger(value.activation) && Number(value.activation) >= 1;
}

function isScopeOccurrenceId(value: unknown): boolean {
  return isExactRecord(value, ["processInstanceId", "definitionScopeId", "activation"]) &&
    isNonemptyString(value.processInstanceId) && isNonemptyString(value.definitionScopeId) &&
    Number.isSafeInteger(value.activation) && Number(value.activation) >= 1;
}

function isNonemptyString(value: unknown): value is string {
  return isWellFormedWireString(value) && value.length > 0;
}

function triggerMatchesDeclaration(
  program: SemanticProcessProgram,
  trigger: CompensationTriggerExecution,
): boolean {
  const declaration = program.compensationExecution;
  const operation = program.operations.find(({ id }) => id === declaration?.triggerOperationId);
  if (
    declaration === undefined ||
    operation === undefined ||
    trigger.id.elementId !== declaration.triggerOperationId ||
    trigger.id.processInstanceId !== trigger.owner.processInstanceId ||
    trigger.owner.definitionScopeId !== declaration.definitionScopeId ||
    trigger.output !== ("output" in operation ? operation.output : undefined)
  ) {
    return false;
  }
  return trigger.handlers.every((handler) =>
    handlerMatchesDeclaration(
      declaration.subjects,
      trigger.owner,
      handler,
    )
  ) && dependenciesMatchDeclaration(program, trigger);
}

function dependenciesMatchDeclaration(
  program: SemanticProcessProgram,
  trigger: CompensationTriggerExecution,
): boolean {
  const declaration = program.compensationExecution;
  if (declaration === undefined) return false;
  const selected = trigger.handlers.map((handler) => ({
    handler,
    elementId: subjectDefinitionId(
      program,
      subjectDefinitionForOccurrence(declaration.subjects, handler.subject),
    ),
  }));
  if (selected.some(({ elementId }) => elementId === undefined)) return false;
  const expected = declaration.dependencies.flatMap((dependency) => {
    const predecessor = selected.find(({ elementId }) =>
      elementId === dependency.predecessorElementId
    )?.handler.subject;
    const successor = selected.find(({ elementId }) =>
      elementId === dependency.successorElementId
    )?.handler.subject;
    return predecessor === undefined || successor === undefined
      ? []
      : [{ predecessor, successor, reason: dependency.reason }];
  });
  return trigger.dependencies.length === expected.length &&
    trigger.dependencies.every((dependency, index) => {
      const candidate = expected[index];
      return candidate !== undefined &&
        dependency.reason === candidate.reason &&
        sameSubject(dependency.predecessor, candidate.predecessor) &&
        sameSubject(dependency.successor, candidate.successor);
    });
}

function handlerMatchesDeclaration(
  subjects: ReadonlyArray<CompensationSubjectDefinition>,
  triggerOwner: CompensationTriggerExecution["owner"],
  handler: CompensationHandlerExecution,
): boolean {
  const subject = subjectDefinitionForOccurrence(subjects, handler.subject);
  return subject !== undefined &&
    handler.id.processInstanceId === triggerOwner.processInstanceId &&
    handler.id.elementId === handler.handlerElementId &&
    handler.handlerElementId === subject.body.handlerElementId &&
    (handler.lifecycle !== "pending" ||
      restoredContextMatchesInput(
        subject.body,
        triggerOwner,
        handler.subject,
        handler.restoredContext,
      ));
}

function handlerEffectWaitIsValid(
  program: SemanticProcessProgram,
  triggers: ReadonlyArray<CompensationTriggerExecution>,
  wait: CompensationHandlerEffectWait,
): boolean {
  const trigger = triggers.find(({ id }) => sameOccurrence(id, wait.triggerId));
  const handler = trigger?.handlers.find(({ id }) => sameOccurrence(id, wait.handlerId));
  const subject = handler === undefined
    ? undefined
    : subjectDefinitionForOccurrence(program.compensationExecution?.subjects ?? [], handler.subject);
  return trigger?.lifecycle === "active" &&
    handler?.lifecycle === "compensating" &&
    subject !== undefined &&
    sameOccurrence(wait.id, handler.effectId) &&
    wait.id.elementId === subject.body.effectElementId &&
    sameDescriptor(wait.descriptor, subject.body) &&
    argumentsMatchInput(wait.arguments, subject.body, trigger, handler);
}

function triggerLifecycleIsValid(
  state: RuntimeState,
  trigger: CompensationTriggerExecution,
): boolean {
  switch (trigger.lifecycle) {
    case "active":
      return state.control.kind === ControlStateKind.Running &&
        trigger.handlers.some(({ lifecycle }) =>
          lifecycle === "pending" || lifecycle === "compensating"
        ) &&
        trigger.handlers.every(({ lifecycle }) => lifecycle !== "failed" && lifecycle !== "terminated");
    case "succeeded":
      return trigger.handlers.every(({ lifecycle }) => lifecycle === "compensated");
    case "failed":
      return state.control.kind === ControlStateKind.Failed &&
        trigger.handlers.filter(({ lifecycle }) => lifecycle === "failed").length === 1 &&
        trigger.handlers.every(({ lifecycle }) =>
          lifecycle === "compensated" || lifecycle === "failed" || lifecycle === "terminated"
        );
  }
}

function controlLifecycleIsValid(
  program: SemanticProcessProgram,
  state: RuntimeState,
  triggers: ReadonlyArray<CompensationTriggerExecution>,
  waits: ReadonlyArray<CompensationHandlerEffectWait>,
): boolean {
  switch (state.control.kind) {
    case ControlStateKind.NotStarted:
      return triggers.length === 0 && waits.length === 0;
    case ControlStateKind.Running:
      return triggers.every(({ lifecycle }) => lifecycle !== "failed");
    case ControlStateKind.Completed:
    case ControlStateKind.Cancelled:
      return waits.length === 0 && triggers.every(({ lifecycle }) => lifecycle !== "active");
    case ControlStateKind.Failed: {
      const failure = state.control.failure;
      const failedTriggers = triggers.filter(({ lifecycle }) => lifecycle === "failed");
      return failedStateIsClosed(state) && waits.length === 0 &&
        failedTriggers.length === 1 &&
        triggers.filter((trigger) => failureMatchesTrigger(program, state, failure, trigger)).length === 1 &&
        triggers.every(({ lifecycle }) => lifecycle === "succeeded" || lifecycle === "failed");
    }
  }
}

function hasDuplicateActiveTriggerOwner(
  triggers: ReadonlyArray<CompensationTriggerExecution>,
): boolean {
  const active = triggers.filter(({ lifecycle }) => lifecycle === "active");
  return active.some((trigger, index) =>
    active.some((other, otherIndex) =>
      index !== otherIndex && sameScopeOccurrence(trigger.owner, other.owner)
    )
  );
}

function failedStateIsClosed(state: RuntimeState): boolean {
  return !state.initiationPending &&
    state.scopeOccurrences.length === 0 &&
    state.controlTokens.length === 0 &&
    state.userTaskWaits.length === 0 &&
    state.messageWaits.length === 0 &&
    state.timerWaits.length === 0 &&
    state.effectWaits.length === 0 &&
    state.effectIncidents.length === 0 &&
    state.selectedBranchSets.length === 0 &&
    state.eventRaces.length === 0 &&
    state.calledProcessOccurrences.length === 0 &&
    state.activityOccurrences.length === 0 &&
    (state.sequentialMultiInstanceControllers?.length ?? 0) === 0 &&
    (state.parallelMultiInstanceControllers?.length ?? 0) === 0 &&
    (state.compensationActivityRetentions?.length ?? 0) === 0 &&
    (state.compensationParentContextRetentions?.length ?? 0) === 0 &&
    state.variables.activities.length === 0;
}

function failureMatchesTrigger(
  program: SemanticProcessProgram,
  state: RuntimeState,
  failure: CompensationHandlerFailure,
  trigger: CompensationTriggerExecution,
): boolean {
  const handler = trigger.handlers.find(({ id }) => sameOccurrence(id, failure.handlerId));
  const subject = handler === undefined
    ? undefined
    : subjectDefinitionForOccurrence(program.compensationExecution?.subjects ?? [], handler.subject);
  return trigger.lifecycle === "failed" &&
    sameOccurrence(trigger.id, failure.triggerId) &&
    handler?.lifecycle === "failed" &&
    subject !== undefined &&
    failure.effectId.processInstanceId === handler.id.processInstanceId &&
    failure.effectId.elementId === subject.body.effectElementId &&
    state.effectActivations.find(({ elementId }) =>
      elementId === failure.effectId.elementId
    )?.count === failure.effectId.activation;
}

function subjectDefinitionForOccurrence(
  subjects: ReadonlyArray<CompensationSubjectDefinition>,
  occurrence: CompensationSubjectOccurrence,
): CompensationSubjectDefinition | undefined {
  return subjects.find((subject) =>
    subject.kind === occurrence.kind &&
    (subject.kind === "boundaryActivity"
      ? occurrence.kind === "boundaryActivity" &&
        subject.subjectElementId === occurrence.activity.activityElementId
      : occurrence.kind === "eventSubProcess" &&
        subject.parentScopeId === occurrence.parent.definitionScopeId)
  );
}

function subjectDefinitionId(
  program: SemanticProcessProgram,
  subject: CompensationSubjectDefinition | undefined,
): string | undefined {
  return subject?.kind === "boundaryActivity"
    ? subject.subjectElementId
    : program.definitionScopes.find(({ id }) => id === subject?.parentScopeId)?.originElementId;
}

function sameSubject(
  left: CompensationSubjectOccurrence,
  right: CompensationSubjectOccurrence,
): boolean {
  return left.kind === right.kind &&
    (left.kind === "boundaryActivity"
      ? right.kind === "boundaryActivity" &&
        left.activity.activityElementId === right.activity.activityElementId &&
        left.activity.processInstanceId === right.activity.processInstanceId &&
        left.activity.activation === right.activity.activation
      : right.kind === "eventSubProcess" && sameScopeOccurrence(left.parent, right.parent));
}

function sameDescriptor(
  descriptor: CompensationHandlerEffectWait["descriptor"],
  body: SingleEffectCompensationHandlerBody,
): boolean {
  return descriptor.protocol === body.descriptor.protocol &&
    descriptor.operation === body.descriptor.operation;
}

function argumentsMatchInput(
  arguments_: CompensationHandlerEffectWait["arguments"],
  body: SingleEffectCompensationHandlerBody,
  trigger: CompensationTriggerExecution,
  handler: Extract<CompensationHandlerExecution, { readonly lifecycle: "compensating" }>,
): boolean {
  if (!restoredContextMatchesInput(
    body,
    trigger.owner,
    handler.subject,
    handler.restoredContext,
  )) {
    return false;
  }
  if (body.input.kind === "empty") return arguments_.length === 0;
  if (handler.restoredContext === null) return false;
  const input = body.input;
  const processFrame = handler.restoredContext.frames[0];
  if (processFrame === undefined) return false;
  const sources = processFrame.bindings.filter(({ name }) => name === input.sourceName);
  const argument = arguments_[0];
  return arguments_.length === 1 &&
    sources.length === 1 &&
    argument?.name === input.argumentName &&
    sameVariableValue(argument.value, sources[0]!.value);
}

function restoredContextMatchesInput(
  body: SingleEffectCompensationHandlerBody,
  triggerOwner: CompensationTriggerExecution["owner"],
  subject: CompensationSubjectOccurrence,
  restoredContext: Extract<
    CompensationHandlerExecution,
    { readonly lifecycle: "pending" | "compensating" }
  >["restoredContext"],
): boolean {
  const input = body.input;
  if (input.kind === "empty") return restoredContext === null;
  if (subject.kind !== "eventSubProcess" || restoredContext === null) return false;
  const [processFrame, parentFrame] = restoredContext.frames;
  return restoredContext.frames.length === 2 &&
    processFrame !== undefined &&
    parentFrame !== undefined &&
    sameScopeOccurrence(processFrame.owner, triggerOwner) &&
    sameScopeOccurrence(parentFrame.owner, subject.parent) &&
    isVariablePatch(processFrame.bindings) &&
    isVariablePatch(parentFrame.bindings) &&
    parentFrame.bindings.length === 0 &&
    processFrame.bindings.filter(({ name }) => name === input.sourceName).length === 1;
}

function hasDuplicateOccurrence(
  values: ReadonlyArray<{ readonly id: OccurrenceId }>,
): boolean {
  return values.some((value, index) =>
    values.some((other, otherIndex) => index !== otherIndex && sameOccurrence(value.id, other.id))
  );
}

function hasDuplicateSubject(
  handlers: ReadonlyArray<CompensationHandlerExecution>,
): boolean {
  return handlers.some((handler, index) =>
    handlers.some((other, otherIndex) =>
      index !== otherIndex && sameSubject(handler.subject, other.subject)
    )
  );
}

function isStrictlySorted<T>(
  values: ReadonlyArray<T>,
  compare: (left: T, right: T) => number,
): boolean {
  return values.every((value, index) =>
    index === 0 || compare(values[index - 1] as T, value) < 0
  );
}

function compareOccurrences(left: OccurrenceId, right: OccurrenceId): number {
  return compareCanonicalStrings(left.processInstanceId, right.processInstanceId) ||
    compareCanonicalStrings(left.elementId, right.elementId) ||
    left.activation - right.activation;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    if (!isWellFormedWireString(value)) {
      throw new TypeError("canonical JSON requires scalar strings");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return joinCanonicalJson("[", value.map(canonicalJson), "]");
  }
  if (typeof value === "object" && value !== null) {
    return joinCanonicalJson(
      "{",
      Object.keys(value).sort(compareCanonicalStrings).map((key) => [
        JSON.stringify(key),
        ":",
        canonicalJson((value as Record<string, unknown>)[key]),
      ].join("")),
      "}",
    );
  }
  throw new TypeError("canonical JSON does not admit this value");
}

function joinCanonicalJson(
  open: "[" | "{",
  values: ReadonlyArray<string>,
  close: "]" | "}",
): string {
  const parts: string[] = [open];
  for (const [index, value] of values.entries()) {
    if (index > 0) parts.push(",");
    parts.push(value);
  }
  parts.push(close);
  return parts.join("");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isExactRecord(
  value: unknown,
  required: ReadonlyArray<string>,
  optional: ReadonlyArray<string> = [],
): value is Record<string, unknown> {
  if (!isRecord(value) || !required.every((key) => Object.hasOwn(value, key))) {
    return false;
  }
  const allowed = new Set([...required, ...optional]);
  return Object.keys(value).every((key) => allowed.has(key));
}
