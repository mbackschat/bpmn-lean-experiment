/** Shared identity pairing and root-state mechanics for closed Process-start families. */
import { StimulusKind } from "./contract.js";
import type {
  ProcessStartStimulus,
  StartProcessStimulus,
} from "./contract.js";
import { sameMessageChannel } from "./message-channel.js";
import { applyInternalInitiationPatch } from "./internal-transition-initiation-patch.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticProcessProgram } from "./semantic-process-contract.js";
import { SemanticProfileId } from "./semantic-process-profile.js";
import {
  ControlStateKind,
  setActivationCount,
} from "./semantic-process-state.js";
import type { RuntimeState } from "./semantic-process-state.js";
import { initializeCompensationActivityRetention } from "./compensation-activity-retention.js";
import {
  CompensationParentContextAttemptKind,
} from "./compensation-event-sub-process-snapshot-contract.js";
import {
  reserveCompensationParentContext,
} from "./compensation-event-sub-process-snapshot.js";
import {
  initializeCompensationExecutionState,
} from "./compensation-trigger-handler-runtime-state-validation.js";

/** Pairs each public start-command kind with exactly one corresponding IL initiation kind. */
export function processStartMatchesProgram(
  stimulus: ProcessStartStimulus,
  program: SemanticProcessProgram,
): boolean {
  const initiations = program.operations.filter(
    ({ kind }) =>
      kind === SemanticOperationKind.Initiate ||
      kind === SemanticOperationKind.InitiateMessage ||
      kind === SemanticOperationKind.InitiateTimer,
  );
  const initiation = initiations[0];
  if (
    stimulus.processId !== program.processId ||
    initiations.length !== 1 ||
    initiation === undefined
  ) {
    return false;
  }
  switch (stimulus.kind) {
    case StimulusKind.StartProcess:
      return initiation.kind === SemanticOperationKind.Initiate;
    case StimulusKind.TriggerMessageStart:
      return initiation.kind === SemanticOperationKind.InitiateMessage &&
        stimulus.startEventId === initiation.origin.elementId &&
        sameMessageChannel(stimulus.channel, initiation.channel);
    case StimulusKind.TriggerTimerStart:
      return initiation.kind === SemanticOperationKind.InitiateTimer &&
        stimulus.startEventId === initiation.origin.elementId;
    default:
      return assertNever(stimulus);
  }
}

/** Creates the exact successor for an ordinary None Start command. */
export function admitProcessStart(
  program: SemanticProcessProgram,
  state: RuntimeState,
  stimulus: StartProcessStimulus,
): RuntimeState | null {
  const entryScopes = program.definitionScopes.filter(
    ({ parentScopeId, originElementId }) =>
      parentScopeId === null && originElementId === program.processId,
  );
  const rootScope = entryScopes[0];
  if (
    state.control.kind !== ControlStateKind.NotStarted ||
    !processStartMatchesProgram(stimulus, program) ||
    entryScopes.length !== 1 ||
    rootScope === undefined ||
    (program.identity.semanticProfile === SemanticProfileId.CalledProcessCallActivity &&
      stimulus.initialVariables.length !== 0)
  ) {
    return null;
  }
  const rootOccurrence = {
    processInstanceId: stimulus.instanceId,
    definitionScopeId: rootScope.id,
    activation: 1,
  };
  const prepared = initializeCompensationExecutionState(program, state);
  const reserved = reserveRootCompensationParentContext(
    program,
    prepared,
    rootOccurrence,
  );
  if (reserved === null) {
    return null;
  }
  return initializeCompensationActivityRetention(program, {
    ...reserved,
    ...(program.identity.semanticProfile ===
        SemanticProfileId.SequentialMultiInstanceUserTask
      ? { sequentialMultiInstanceControllers: [] }
      : program.identity.semanticProfile ===
          SemanticProfileId.ParallelMultiInstanceUserTask
      ? { parallelMultiInstanceControllers: [] }
      : {}),
    control: {
      kind: ControlStateKind.Running,
      instanceId: stimulus.instanceId,
    },
    initiationPending: true,
    scopeOccurrences: [{ id: rootOccurrence, parent: null }],
    scopeActivations: setActivationCount(
      state.scopeActivations,
      rootScope.id,
      1,
    ),
    variables: {
      ...state.variables,
      process: { bindings: stimulus.initialVariables },
    },
  }, rootOccurrence);
}

/** Creates the empty root occurrence shared by payload-free resolved Process starts. */
export function admitTriggeredStartRoot(
  program: SemanticProcessProgram,
  state: RuntimeState,
  instanceId: string,
  initiationOperationId: string,
): RuntimeState | null {
  const entryScopes = program.definitionScopes.filter(
    ({ parentScopeId, originElementId }) =>
      parentScopeId === null && originElementId === program.processId,
  );
  const rootScope = entryScopes[0];
  const initiationScopes = program.operationScopes.filter(
    ({ operationId }) => operationId === initiationOperationId,
  );
  if (
    state.control.kind !== ControlStateKind.NotStarted ||
    entryScopes.length !== 1 ||
    rootScope === undefined ||
    initiationScopes.length !== 1 ||
    initiationScopes[0]?.scopeId !== rootScope.id
  ) {
    return null;
  }
  const rootOccurrence = {
    processInstanceId: instanceId,
    definitionScopeId: rootScope.id,
    activation: 1,
  };
  const prepared = initializeCompensationExecutionState(program, state);
  const reserved = reserveRootCompensationParentContext(
    program,
    prepared,
    rootOccurrence,
  );
  if (reserved === null) {
    return null;
  }
  return initializeCompensationActivityRetention(program, {
    ...reserved,
    control: {
      kind: ControlStateKind.Running,
      instanceId,
    },
    initiationPending: true,
    scopeOccurrences: [{ id: rootOccurrence, parent: null }],
    scopeActivations: setActivationCount(
      state.scopeActivations,
      rootScope.id,
      1,
    ),
    variables: {
      process: { bindings: [] },
      activities: [],
    },
  }, rootOccurrence);
}

function reserveRootCompensationParentContext(
  program: SemanticProcessProgram,
  state: RuntimeState,
  rootId: RuntimeState["scopeOccurrences"][number]["id"],
): RuntimeState | null {
  const prepared = program.compensationEventSubProcessSnapshots === undefined ||
      state.compensationParentContextRetentions !== undefined
    ? state
    : { ...state, compensationParentContextRetentions: [] };
  const attempt = reserveCompensationParentContext(program, prepared, {
    id: rootId,
    parent: null,
  });
  switch (attempt.kind) {
    case CompensationParentContextAttemptKind.Disabled:
    case CompensationParentContextAttemptKind.Applied:
      return attempt.state;
    case CompensationParentContextAttemptKind.Refused:
      return null;
  }
}

/** Clears one admitted triggered start and emits its root-owned outgoing tokens. */
export function applyTriggeredStartOutputs(
  outputs: ReadonlyArray<string>,
  state: RuntimeState,
): RuntimeState | null {
  const rootOwner = state.scopeOccurrences.find(
    ({ parent }) => parent === null,
  )?.id;
  if (!state.initiationPending || rootOwner === undefined) {
    return null;
  }
  return applyInternalInitiationPatch(state, {
    owner: rootOwner,
    outputs,
  });
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported start variant: ${JSON.stringify(value)}`);
}
