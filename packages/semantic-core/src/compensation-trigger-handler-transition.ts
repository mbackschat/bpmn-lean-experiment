import type { OccurrenceId, VariableBinding } from "./contract.js";
import {
  CompensationParentContextRetentionKind,
  type CompensationParentContextRetention,
  type CompensationParentContextSnapshot,
} from "./compensation-event-sub-process-snapshot-contract.js";
import { compensationEventSubProcessSnapshotStateDefects } from "./compensation-event-sub-process-snapshot-state-validation.js";
import { compensationRetentionStateDefects } from "./compensation-activity-retention-state-validation.js";
import type {
  CompensationSubjectDefinition,
  SingleEffectCompensationHandlerBody,
} from "./compensation-trigger-handler-contract.js";
import { compensationExecutionMatchesProgram } from "./compensation-trigger-handler-program-admission.js";
import type {
  CompensationHandlerEffectWait,
  CompensationHandlerExecution,
  CompensationSubjectOccurrence,
  CompensationTriggerExecution,
} from "./compensation-trigger-handler-runtime-contract.js";
import {
  canonicalCompensationExecutionStateUtf8Bytes,
  compensationExecutionStateDefects,
} from "./compensation-trigger-handler-runtime-state-validation.js";
import type {
  SemanticProcessProgram,
  TriggerCompensationOperation,
} from "./semantic-process-contract.js";
import {
  ControlStateKind,
  addToken,
  nextActivation,
  removeToken,
  sameScopeOccurrence,
  setActivationCount,
  type RuntimeState,
  type ScopeOccurrenceId,
} from "./semantic-process-state.js";
import { cloneVariableBinding } from "./variable-value.js";
import { compareCanonicalStrings } from "./wire.js";

export enum CompensationTriggerAttemptKind {
  Disabled = "disabled",
  Applied = "applied",
  Refused = "refused",
}

export enum CompensationTriggerRefusalReason {
  InvalidProgram = "invalidProgram",
  InvalidState = "invalidState",
  ActiveTriggerExists = "activeTriggerExists",
  InvalidSources = "invalidSources",
  CapacityExceeded = "capacityExceeded",
}

export type CompensationTriggerAttempt = Readonly<
  | { kind: CompensationTriggerAttemptKind.Disabled; state: RuntimeState }
  | { kind: CompensationTriggerAttemptKind.Applied; state: RuntimeState }
  | {
      kind: CompensationTriggerAttemptKind.Refused;
      state: RuntimeState;
      reason: CompensationTriggerRefusalReason;
    }
>;

type FrontierActivation = Readonly<{
  trigger: CompensationTriggerExecution;
  waits: CompensationHandlerEffectWait[];
  effectActivations: RuntimeState["effectActivations"];
}>;

type SelectedSubject = Readonly<{
  definition: CompensationSubjectDefinition;
  occurrence: CompensationSubjectOccurrence;
  restoredContext: CompensationParentContextSnapshot | null;
}>;

/** Constructs, validates, and consumes one complete root-scoped global compensation trigger. */
export function attemptCompensationTrigger(
  program: SemanticProcessProgram,
  operation: TriggerCompensationOperation,
  state: RuntimeState,
  owner: ScopeOccurrenceId | undefined,
): CompensationTriggerAttempt {
  if (
    program.compensationExecution?.triggerOperationId !== operation.id ||
    !compensationExecutionMatchesProgram(program)
  ) {
    return refused(state, CompensationTriggerRefusalReason.InvalidProgram);
  }
  const activityRetentions = state.compensationActivityRetentions;
  const contextRetentions = state.compensationParentContextRetentions;
  const triggers = state.compensationTriggers;
  const waits = state.compensationHandlerEffectWaits;
  if (
    state.control.kind !== ControlStateKind.Running ||
    owner === undefined ||
    owner.definitionScopeId !== operation.definitionScopeId ||
    !state.scopeOccurrences.some(({ id, parent }) =>
      parent === null && sameScopeOccurrence(id, owner)
    ) ||
    triggers === undefined ||
    waits === undefined
  ) {
    return { kind: CompensationTriggerAttemptKind.Disabled, state };
  }
  if (
    compensationRetentionStateDefects(program, state).length > 0 ||
    compensationEventSubProcessSnapshotStateDefects(program, state).length > 0 ||
    compensationExecutionStateDefects(program, state).length > 0
  ) {
    return refused(state, CompensationTriggerRefusalReason.InvalidState);
  }
  if (triggers.some((trigger) =>
    trigger.lifecycle === "active" && sameScopeOccurrence(trigger.owner, owner)
  )) {
    return refused(state, CompensationTriggerRefusalReason.ActiveTriggerExists);
  }

  const selected = selectedSubjects(program, owner, state);
  if (selected === null) {
    return refused(state, CompensationTriggerRefusalReason.InvalidSources);
  }
  if (selected.length === 0) {
    return {
      kind: CompensationTriggerAttemptKind.Applied,
      state: {
        ...state,
        controlTokens: addToken(
          removeToken(state.controlTokens, operation.input, owner),
          operation.output,
          owner,
        ),
      },
    };
  }

  const triggerId = nextExecutionOccurrence(
    owner.processInstanceId,
    operation.id,
    triggers.map(({ id }) => id),
  );
  const handlers = selected.map(({ definition, occurrence, restoredContext }) => ({
    id: nextExecutionOccurrence(
      owner.processInstanceId,
      definition.body.handlerElementId,
      triggers.flatMap((trigger) => trigger.handlers.map(({ id }) => id)),
    ),
    subject: occurrence,
    handlerElementId: definition.body.handlerElementId,
    lifecycle: "pending",
    restoredContext,
  } as const)).sort(compareHandlers);
  const dependencies = program.compensationExecution.dependencies.flatMap((dependency) => {
    const predecessor = handlerByDefinitionId(program, handlers, dependency.predecessorElementId);
    const successor = handlerByDefinitionId(program, handlers, dependency.successorElementId);
    return predecessor === undefined || successor === undefined
      ? []
      : [{
          predecessor: predecessor.subject,
          successor: successor.subject,
          reason: dependency.reason,
        } as const];
  });
  const pending = {
    id: triggerId,
    owner,
    output: operation.output,
    lifecycle: "active",
    handlers,
    dependencies,
  } as const satisfies CompensationTriggerExecution;
  const activated = activateCompensationFrontier(program, state, pending);
  if (activated === null) {
    return refused(state, CompensationTriggerRefusalReason.InvalidSources);
  }
  const prospectiveTriggers = [...triggers, activated.trigger].sort(compareTriggers);
  const prospectiveWaits = [...waits, ...activated.waits].sort(compareWaits);
  if (!executionFits(program, prospectiveTriggers, prospectiveWaits)) {
    return refused(state, CompensationTriggerRefusalReason.CapacityExceeded);
  }

  const prospective = {
    ...state,
    controlTokens: removeToken(state.controlTokens, operation.input, owner),
    ...(activityRetentions === undefined
      ? {}
      : {
          compensationActivityRetentions: activityRetentions.map((retention) =>
            sameScopeOccurrence(retention.owner, owner)
              ? { ...retention, records: [] }
              : retention
          ),
        }),
    ...(contextRetentions === undefined
      ? {}
      : {
          compensationParentContextRetentions: contextRetentions.filter((retention) =>
            !retentionOwnedByRoot(retention, owner)
          ),
        }),
    compensationTriggers: prospectiveTriggers,
    compensationHandlerEffectWaits: prospectiveWaits,
    effectActivations: activated.effectActivations,
  };
  return compensationExecutionStateDefects(program, prospective).length === 0
    ? { kind: CompensationTriggerAttemptKind.Applied, state: prospective }
    : refused(state, CompensationTriggerRefusalReason.InvalidState);
}

/** Starts every currently maximal pending subject together from its retained handler context. */
export function activateCompensationFrontier(
  program: SemanticProcessProgram,
  state: RuntimeState,
  trigger: CompensationTriggerExecution,
): FrontierActivation | null {
  const declaration = program.compensationExecution;
  if (declaration === undefined || trigger.lifecycle !== "active") return null;
  const frontier = trigger.handlers.filter((handler) =>
    handler.lifecycle === "pending" && !trigger.dependencies.some((dependency) =>
      sameSubject(dependency.predecessor, handler.subject) &&
      trigger.handlers.some((candidate) =>
        sameSubject(candidate.subject, dependency.successor) &&
        (candidate.lifecycle === "pending" || candidate.lifecycle === "compensating")
      )
    )
  );
  if (frontier.length === 0) {
    return { trigger, waits: [], effectActivations: state.effectActivations };
  }

  let effectActivations = state.effectActivations;
  const waits: CompensationHandlerEffectWait[] = [];
  const handlers = trigger.handlers.map((handler): CompensationHandlerExecution => {
    if (!frontier.includes(handler)) return handler;
    const definition = definitionForOccurrence(declaration.subjects, handler.subject);
    if (definition === undefined || handler.lifecycle !== "pending") return handler;
    const effectActivation = nextActivation(
      effectActivations,
      definition.body.effectElementId,
    );
    effectActivations = setActivationCount(
      effectActivations,
      definition.body.effectElementId,
      effectActivation,
    );
    const effectId = {
      processInstanceId: trigger.id.processInstanceId,
      elementId: definition.body.effectElementId,
      activation: effectActivation,
    };
    const arguments_ = handlerArguments(definition.body, handler.restoredContext);
    if (arguments_ === null) return handler;
    waits.push({
      id: effectId,
      triggerId: trigger.id,
      handlerId: handler.id,
      descriptor: definition.body.descriptor,
      arguments: arguments_,
    });
    return {
      ...handler,
      lifecycle: "compensating",
      effectId,
    };
  });
  return waits.length === frontier.length
    ? {
        trigger: { ...trigger, handlers },
        waits: waits.sort(compareWaits),
        effectActivations,
      }
    : null;
}

export function executionFits(
  program: SemanticProcessProgram,
  triggers: ReadonlyArray<CompensationTriggerExecution>,
  waits: ReadonlyArray<CompensationHandlerEffectWait>,
): boolean {
  const limits = program.compensationExecution?.limits;
  return limits !== undefined &&
    triggers.length <= limits.maxTriggers &&
    triggers.every(({ handlers }) => handlers.length <= limits.maxHandlers) &&
    canonicalCompensationExecutionStateUtf8Bytes(triggers, waits) <=
      limits.maxCanonicalBytes;
}

function selectedSubjects(
  program: SemanticProcessProgram,
  owner: ScopeOccurrenceId,
  state: RuntimeState,
): ReadonlyArray<SelectedSubject> | null {
  const declaration = program.compensationExecution;
  if (declaration === undefined) return null;
  const activityRetentions = state.compensationActivityRetentions ?? [];
  const contextRetentions = state.compensationParentContextRetentions ?? [];
  const activityRegister = activityRetentions.filter(({ owner: candidate }) =>
    sameScopeOccurrence(candidate, owner)
  );
  if (
    activityRegister.length !==
      (program.compensationActivityRetention === undefined ? 0 : 1)
  ) return null;
  const activityRecords = activityRegister[0]?.records ?? [];
  const selected: SelectedSubject[] = activityRecords.flatMap((record) => {
    const definitions = declaration.subjects.filter((definition) =>
      definition.kind === "boundaryActivity" &&
      definition.subjectElementId === record.id.activityElementId
    );
    return definitions.length === 1
      ? [{
          definition: definitions[0]!,
          occurrence: { kind: "boundaryActivity", activity: record.id } as const,
          restoredContext: null,
        }]
      : [];
  });
  if (selected.length !== activityRecords.length) return null;

  const ownedContexts = contextRetentions.filter((retention) =>
    retentionOwnedByRoot(retention, owner)
  );
  if (ownedContexts.some(({ kind }) => kind === CompensationParentContextRetentionKind.Provisional)) {
    return null;
  }
  for (const retention of ownedContexts) {
    if (retention.kind !== CompensationParentContextRetentionKind.Promoted) return null;
    const definitions = declaration.subjects.filter((definition) =>
      definition.kind === "eventSubProcess" &&
      definition.parentScopeId === retention.parent.id.definitionScopeId &&
      definition.handlerScopeId === retention.handlerScopeId
    );
    if (definitions.length !== 1) return null;
    selected.push({
      definition: definitions[0]!,
      occurrence: { kind: "eventSubProcess", parent: retention.parent.id },
      restoredContext: cloneSnapshot(retention.snapshot),
    });
  }
  return selected;
}

function handlerArguments(
  body: SingleEffectCompensationHandlerBody,
  restoredContext: CompensationParentContextSnapshot | null,
): [] | [VariableBinding] | null {
  if (body.input.kind === "empty") return restoredContext === null ? [] : null;
  const input = body.input;
  const processFrame = restoredContext?.frames[0];
  const sources = processFrame?.bindings.filter(({ name }) => name === input.sourceName) ?? [];
  return sources.length === 1
    ? [{ name: input.argumentName, value: sources[0]!.value }]
    : null;
}

function handlerByDefinitionId(
  program: SemanticProcessProgram,
  handlers: ReadonlyArray<CompensationHandlerExecution>,
  definitionId: string,
): CompensationHandlerExecution | undefined {
  return handlers.find((handler) =>
    occurrenceDefinitionId(program, handler.subject) === definitionId
  );
}

function occurrenceDefinitionId(
  program: SemanticProcessProgram,
  occurrence: CompensationSubjectOccurrence,
): string | undefined {
  return occurrence.kind === "boundaryActivity"
    ? occurrence.activity.activityElementId
    : program.definitionScopes.find(({ id }) =>
      id === occurrence.parent.definitionScopeId
    )?.originElementId;
}

function definitionForOccurrence(
  definitions: ReadonlyArray<CompensationSubjectDefinition>,
  occurrence: CompensationSubjectOccurrence,
): CompensationSubjectDefinition | undefined {
  return definitions.find((definition) =>
    definition.kind === occurrence.kind &&
    (definition.kind === "boundaryActivity"
      ? occurrence.kind === "boundaryActivity" &&
        definition.subjectElementId === occurrence.activity.activityElementId
      : occurrence.kind === "eventSubProcess" &&
        definition.parentScopeId === occurrence.parent.definitionScopeId)
  );
}

function retentionOwnedByRoot(
  retention: CompensationParentContextRetention,
  owner: ScopeOccurrenceId,
): boolean {
  return sameScopeOccurrence(retention.parent.id, owner) ||
    (retention.parent.parent !== null &&
      sameScopeOccurrence(retention.parent.parent, owner));
}

function cloneSnapshot(
  snapshot: CompensationParentContextSnapshot,
): CompensationParentContextSnapshot {
  return {
    frames: snapshot.frames.map(({ owner, bindings }) => ({
      owner: { ...owner },
      bindings: bindings.map(cloneVariableBinding),
    })),
  };
}

function nextExecutionOccurrence(
  processInstanceId: string,
  elementId: string,
  existing: ReadonlyArray<OccurrenceId>,
): OccurrenceId {
  return {
    processInstanceId,
    elementId,
    activation: Math.max(
      0,
      ...existing.filter((id) => id.elementId === elementId).map(({ activation }) => activation),
    ) + 1,
  };
}

function sameSubject(
  left: CompensationSubjectOccurrence,
  right: CompensationSubjectOccurrence,
): boolean {
  return left.kind === right.kind &&
    (left.kind === "boundaryActivity"
      ? right.kind === "boundaryActivity" &&
        left.activity.processInstanceId === right.activity.processInstanceId &&
        left.activity.activityElementId === right.activity.activityElementId &&
        left.activity.activation === right.activity.activation
      : right.kind === "eventSubProcess" && sameScopeOccurrence(left.parent, right.parent));
}

function compareHandlers(
  left: CompensationHandlerExecution,
  right: CompensationHandlerExecution,
): number {
  return compareOccurrences(left.id, right.id);
}

function compareTriggers(
  left: CompensationTriggerExecution,
  right: CompensationTriggerExecution,
): number {
  return compareOccurrences(left.id, right.id);
}

function compareWaits(
  left: CompensationHandlerEffectWait,
  right: CompensationHandlerEffectWait,
): number {
  return compareOccurrences(left.id, right.id);
}

function compareOccurrences(left: OccurrenceId, right: OccurrenceId): number {
  return compareCanonicalStrings(left.processInstanceId, right.processInstanceId) ||
    compareCanonicalStrings(left.elementId, right.elementId) ||
    left.activation - right.activation;
}

function refused(
  state: RuntimeState,
  reason: CompensationTriggerRefusalReason,
): CompensationTriggerAttempt {
  return { kind: CompensationTriggerAttemptKind.Refused, state, reason };
}
