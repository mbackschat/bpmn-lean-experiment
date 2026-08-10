/**
 * Operation-addressed Message Start admission and initiation.
 *
 * A start command must identify the admitted Process, Start Event, Interface Operation, and Message
 * exactly. Runtime initiation creates only the ordinary root scope occurrence and root-owned control
 * tokens. Message routing, subscriptions, and payload handling remain outside the semantic core.
 */
import {
  StimulusKind,
} from "./contract.js";
import type {
  ProcessStartStimulus,
  TriggerMessageStartStimulus,
} from "./contract.js";
import {
  isMessageChannel,
  sameMessageChannel,
} from "./message-channel.js";
import {
  SemanticOperationKind,
  SemanticOriginKind,
} from "./semantic-process-contract.js";
import type {
  InitiateMessageOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import {
  SemanticProfileId,
  profileAllowsProgramShape,
} from "./semantic-process-profile.js";
import {
  addToken,
  ControlStateKind,
  setActivationCount,
} from "./semantic-process-state.js";
import type {
  RuntimeState,
} from "./semantic-process-state.js";
import {
  compareCanonicalStrings,
  isWellFormedWireString,
} from "./wire.js";
import { MessageChannelKind } from "./semantic-value-contract.js";

/** Validates the profile-independent IL relation for one Message initiation operation. */
export function isWellFormedInitiateMessageOperation(
  value: unknown,
  placeIds: ReadonlySet<string>,
): value is InitiateMessageOperation {
  const outputs = isRecord(value) && Array.isArray(value.outputs)
    ? value.outputs
    : undefined;
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["id", "kind", "origin", "channel", "outputs"]) ||
    value.kind !== SemanticOperationKind.InitiateMessage ||
    !isNonEmptyString(value.id) ||
    !isRecord(value.origin) ||
    !hasOnlyKeys(value.origin, ["kind", "elementId"]) ||
    value.origin.kind !== SemanticOriginKind.BpmnElement ||
    !isNonEmptyString(value.origin.elementId) ||
    !isMessageChannel(value.channel) ||
    value.channel.kind !== MessageChannelKind.OperationMessage ||
    outputs === undefined ||
    outputs.length === 0
  ) {
    return false;
  }
  return outputs.every(
    (output, index) =>
      isNonEmptyString(output) &&
      placeIds.has(output) &&
      (index === 0 ||
        compareCanonicalStrings(String(outputs[index - 1]), output) < 0),
  );
}

/** Pairs each public start-command kind with exactly one corresponding IL initiation kind. */
export function processStartMatchesProgram(
  stimulus: ProcessStartStimulus,
  program: SemanticProcessProgram,
): boolean {
  const initiations = program.operations.filter(
    ({ kind }) =>
      kind === SemanticOperationKind.Initiate ||
      kind === SemanticOperationKind.InitiateMessage,
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
    default:
      return assertNever(stimulus);
  }
}

/** Admits a fresh Message-start instance without installing a subscription or payload. */
export function admitMessageStart(
  program: SemanticProcessProgram,
  state: RuntimeState,
  stimulus: TriggerMessageStartStimulus,
): RuntimeState | null {
  const entryScopes = program.definitionScopes.filter(
    ({ parentScopeId, originElementId }) =>
      parentScopeId === null && originElementId === program.processId,
  );
  const rootScope = entryScopes[0];
  const initiation = program.operations.find(
    ({ kind }) => kind === SemanticOperationKind.InitiateMessage,
  );
  const initiationScopes = initiation === undefined
    ? []
    : program.operationScopes.filter(
      ({ operationId }) => operationId === initiation.id,
    );
  if (
    state.control.kind !== ControlStateKind.NotStarted ||
    program.identity.semanticProfile !==
      SemanticProfileId.MessageStart ||
    !profileAllowsProgramShape(
      program.identity.semanticProfile,
      program.operations,
      program.definitionScopes.length,
    ) ||
    entryScopes.length !== 1 ||
    rootScope === undefined ||
    initiationScopes.length !== 1 ||
    initiationScopes[0]?.scopeId !== rootScope.id ||
    !processStartMatchesProgram(stimulus, program)
  ) {
    return null;
  }
  const rootOccurrence = {
    processInstanceId: stimulus.instanceId,
    definitionScopeId: rootScope.id,
    activation: 1,
  };
  return {
    ...state,
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
      process: { bindings: [] },
      activities: [],
    },
  };
}

/** Produces every canonical outgoing token under the already-created root owner exactly once. */
export function applyMessageInitiation(
  operation: InitiateMessageOperation,
  state: RuntimeState,
): RuntimeState | null {
  const rootOwner = state.scopeOccurrences.find(
    ({ parent }) => parent === null,
  )?.id;
  if (!state.initiationPending || rootOwner === undefined) {
    return null;
  }
  return {
    ...state,
    initiationPending: false,
    controlTokens: operation.outputs.reduce(
      (tokens, output) => addToken(tokens, output, rootOwner),
      state.controlTokens,
    ),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: ReadonlyArray<string>,
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    isWellFormedWireString(value);
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported start variant: ${JSON.stringify(value)}`);
}
