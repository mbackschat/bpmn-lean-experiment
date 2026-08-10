/**
 * Operation-addressed Message Start admission and initiation.
 *
 * A start command must identify the admitted Process, Start Event, Interface Operation, and Message
 * exactly. Runtime initiation creates only the ordinary root scope occurrence and root-owned control
 * tokens. Message routing, subscriptions, and payload handling remain outside the semantic core.
 */
import type {
  TriggerMessageStartStimulus,
} from "./contract.js";
import { isMessageChannel } from "./message-channel.js";
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
  admitTriggeredStartRoot,
  applyTriggeredStartOutputs,
  processStartMatchesProgram,
} from "./semantic-process-triggered-start.js";
import type { RuntimeState } from "./semantic-process-state.js";
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

/** Admits a fresh Message-start instance without installing a subscription or payload. */
export function admitMessageStart(
  program: SemanticProcessProgram,
  state: RuntimeState,
  stimulus: TriggerMessageStartStimulus,
): RuntimeState | null {
  const initiation = program.operations.find(
    ({ kind }) => kind === SemanticOperationKind.InitiateMessage,
  );
  if (
    program.identity.semanticProfile !==
      SemanticProfileId.MessageStart ||
    !profileAllowsProgramShape(
      program.identity.semanticProfile,
      program.operations,
      program.definitionScopes.length,
    ) ||
    initiation === undefined ||
    !processStartMatchesProgram(stimulus, program)
  ) {
    return null;
  }
  return admitTriggeredStartRoot(
    program,
    state,
    stimulus.instanceId,
    initiation.id,
  );
}

/** Produces every canonical outgoing token under the already-created root owner exactly once. */
export function applyMessageInitiation(
  operation: InitiateMessageOperation,
  state: RuntimeState,
): RuntimeState | null {
  return applyTriggeredStartOutputs(operation.outputs, state);
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
