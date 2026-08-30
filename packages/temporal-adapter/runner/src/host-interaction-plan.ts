/**
 * Declared product configuration for answering published interactions and executing host effects.
 *
 * This module owns the configuration contract and its validation only; the runtime loop that
 * consumes it lives in the host interaction driver. Every shape is delegated to the semantic core's
 * own well-formedness where one exists — canonical completion patch, real Message channel, accepted
 * effect result — so configuration can never introduce a product-local shape that later reaches a
 * semantic command.
 */
import {
  StimulusKind,
  compareCanonicalStrings,
  isMessageChannel,
  isWellFormedStimulus,
  isWellFormedWireString,
} from "@bpmn-lean/semantic-core";
import type {
  DeepReadonly,
  MessageChannel,
  UserTaskCompletionBinding,
  VariableValue,
} from "@bpmn-lean/semantic-core";
import type {
  EffectActivityImplementationResult,
} from "@bpmn-lean/temporal-protocol";
import {
  isWellFormedEffectActivityImplementationResult,
} from "@bpmn-lean/temporal-protocol";

/**
 * One declared answer to a published interaction.
 *
 * The discriminator is the canonical stimulus kind, never a product-local alias, so matching a
 * response against a published interaction needs no translation table. A response names *which*
 * interaction it answers; the occurrence identity is always taken from the publication.
 */
export type HostInteractionResponse = DeepReadonly<
  | {
      kind: StimulusKind.CompleteUserTaskInstance;
      elementId: string;
      delayMs: number;
      inputVariableNames: string[];
      submittedValues: UserTaskCompletionBinding[];
    }
  | {
      kind: StimulusKind.DeliverMessage;
      channel: MessageChannel;
      delayMs: number;
    }
  | {
      kind: StimulusKind.DeliverPayloadMessage;
      channel: MessageChannel;
      payload: VariableValue;
      delayMs: number;
    }
  | {
      kind: StimulusKind.CancelIncidentProcess;
      delayMs: number;
    }
>;

/**
 * One deterministic host simulation of an external effect, keyed by neutral descriptor.
 *
 * This is a configured stand-in with the same status as the simulated form actor: it is not a real
 * integration and is not evidence about any external service. `result` uses the host-only Activity
 * result union, which preserves the semantic success and business-error arms and adds the bounded
 * technical-failure arm selected by the incident profile.
 */
export type HostEffectHandler = DeepReadonly<{
  protocol: string;
  operation: string;
  result: EffectActivityImplementationResult;
}>;

export function validateHostInteractionPlan(
  value: unknown,
): asserts value is ReadonlyArray<HostInteractionResponse> {
  if (!Array.isArray(value)) {
    throw new TypeError("Interaction plan must be an array");
  }
  for (const response of value) {
    validateHostInteractionResponse(response);
  }
}

export function validateHostEffectHandlers(
  value: unknown,
): asserts value is ReadonlyArray<HostEffectHandler> {
  if (!Array.isArray(value)) {
    throw new TypeError("Effect handler list must be an array");
  }
  // Keys are JSON-encoded exact pairs because any delimiter may occur inside a wire string.
  const descriptors = new Set<string>();
  for (const handler of value) {
    const record = requireExactObject(
      handler,
      ["protocol", "operation", "result"],
      "Effect handler",
    );
    requireNonemptyWireString(record.protocol, "Effect handler protocol");
    requireNonemptyWireString(record.operation, "Effect handler operation");
    if (!isWellFormedEffectActivityImplementationResult(record.result)) {
      throw new TypeError(
        "Effect handler result must be one canonical effect execution result or technical failure",
      );
    }
    const descriptor = JSON.stringify([record.protocol, record.operation]);
    if (descriptors.has(descriptor)) {
      throw new TypeError(
        `Effect handlers must declare exactly one handler per neutral descriptor; ${String(record.protocol)}/${String(record.operation)} repeats`,
      );
    }
    descriptors.add(descriptor);
  }
}

function validateHostInteractionResponse(
  value: unknown,
): asserts value is HostInteractionResponse {
  if (!isRecord(value)) {
    throw new TypeError("Interaction response must be an object");
  }
  switch (value.kind) {
    case StimulusKind.CompleteUserTaskInstance:
      validateCompletionResponse(value);
      return;
    case StimulusKind.DeliverMessage:
    case StimulusKind.DeliverPayloadMessage:
      validateDeliveryResponse(value, value.kind);
      return;
    case StimulusKind.CancelIncidentProcess:
      validateCancellationResponse(value);
      return;
    default:
      throw new TypeError(
        `Interaction response kind must be a canonical stimulus kind: ${String(value.kind)}`,
      );
  }
}

function validateCancellationResponse(value: Record<string, unknown>): void {
  const record = requireExactObject(
    value,
    ["kind", "delayMs"],
    "Incident cancellation response",
  );
  requirePositiveSafeInteger(
    record.delayMs,
    "Incident cancellation response delayMs",
  );
}

function validateCompletionResponse(value: Record<string, unknown>): void {
  const record = requireExactObject(
    value,
    ["kind", "elementId", "delayMs", "inputVariableNames", "submittedValues"],
    "User Task completion response",
  );
  requireNonemptyWireString(record.elementId, "Completion response elementId");
  requirePositiveSafeInteger(record.delayMs, "Completion response delayMs");
  if (!Array.isArray(record.inputVariableNames)) {
    throw new TypeError("Completion response inputVariableNames must be an array");
  }
  requireCanonicalNameOrder(record.inputVariableNames);
  const probe = {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: "interaction-plan-validation",
    taskId: {
      processInstanceId: "interaction-plan-validation",
      elementId: record.elementId,
      activation: 1,
    },
    submittedValues: record.submittedValues,
  };
  if (!isWellFormedStimulus(probe)) {
    throw new TypeError(
      "Completion response submittedValues must be a canonical typed patch",
    );
  }
}

function validateDeliveryResponse(
  value: Record<string, unknown>,
  kind:
    | StimulusKind.DeliverMessage
    | StimulusKind.DeliverPayloadMessage,
): void {
  const record = requireExactObject(
    value,
    kind === StimulusKind.DeliverPayloadMessage
      ? ["kind", "channel", "payload", "delayMs"]
      : ["kind", "channel", "delayMs"],
    "Message delivery response",
  );
  requirePositiveSafeInteger(record.delayMs, "Delivery response delayMs");
  if (!isMessageChannel(record.channel)) {
    throw new TypeError(
      "Delivery response channel must be a canonical Message channel",
    );
  }
  if (
    kind === StimulusKind.DeliverPayloadMessage &&
    !isWellFormedStimulus({
      kind,
      commandId: "interaction-plan-validation",
      subscriptionId: {
        processInstanceId: "interaction-plan-validation",
        elementId: "interaction-plan-validation",
        activation: 1,
      },
      channel: record.channel,
      payload: record.payload,
    })
  ) {
    throw new TypeError(
      "Payload delivery response payload must be one canonical variable value",
    );
  }
}

function requireExactObject(
  value: unknown,
  expectedKeys: ReadonlyArray<string>,
  label: string,
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const expected = new Set(expectedKeys);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) {
      throw new TypeError(`${label} has unknown field ${key}`);
    }
  }
  for (const key of expectedKeys) {
    if (!Object.hasOwn(value, key)) {
      throw new TypeError(`${label} is missing field ${key}`);
    }
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireNonemptyWireString(value: unknown, label: string): void {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    !isWellFormedWireString(value)
  ) {
    throw new TypeError(`${label} must be a nonempty Unicode scalar string`);
  }
}

function requirePositiveSafeInteger(value: unknown, label: string): void {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new RangeError(`${label} must be a positive safe integer`);
  }
}

function requireCanonicalNameOrder(names: ReadonlyArray<unknown>): void {
  let previous: string | undefined;
  for (const name of names) {
    requireNonemptyWireString(name, "Completion response inputVariableNames entry");
    if (
      previous !== undefined &&
      compareCanonicalStrings(previous, name as string) >= 0
    ) {
      throw new TypeError(
        "Completion response inputVariableNames must be unique and canonically ordered",
      );
    }
    previous = name as string;
  }
}
