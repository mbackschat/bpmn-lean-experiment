/**
 * Scenario stimulus codecs, transcribed from `Kernel/IL/Codec/Stimulus.lean`: Message channels, occurrence
 * identities, effect outcomes and stimuli, decoded into kernel inputs, and the name of each failure outcome.
 */
import {
  accept,
  bindingsFromJson,
  mapDecoded,
  nat,
  objVal,
  objValD,
  refuse,
  string,
  valueCodec,
  type Decoded,
  type JsonValue,
} from "../codec.js";
import { assertNever, type Value } from "../types.js";
import {
  CommandActionTag,
  EffectOutcomeTag,
  FailureTag,
  InputTag,
  type Binding,
  type CommandAction,
  type EffectOutcome,
  type Failure,
  type Input,
  type MessageChannel,
  type OccurrenceRef,
} from "../../state.js";

/** `json[key]` when present, else an empty binding list: `(json.getObjVal? key).toOption.getD (Json.arr #[])`. */
function bindingsField(json: unknown, key: string): Decoded<readonly Binding[]> {
  const raw = objVal(json, key);
  return bindingsFromJson(raw.ok ? raw.value : []);
}

/** A string field read through `getObjValAs?`, which reads an absent key as `null`. */
function stringField(json: unknown, key: string): Decoded<string> {
  return string.decode(objValD(json, key));
}

/** The scenario contract's `messageChannel`: an operation, a direct or an unspecified Message. */
export function channelFromJson(json: unknown): Decoded<MessageChannel> {
  const kind = stringField(json, "kind");
  if (!kind.ok) {
    return kind;
  }
  if (kind.value === "operationMessage") {
    const messageId = stringField(json, "messageId");
    if (!messageId.ok) {
      return messageId;
    }
    const interfaceRef = stringField(json, "interfaceId");
    if (!interfaceRef.ok) {
      return interfaceRef;
    }
    return mapDecoded(stringField(json, "interfaceOperationId"), (operationRef) => ({
      messageId: messageId.value,
      interfaceRef: interfaceRef.value,
      operationRef,
    }));
  }
  if (kind.value === "directMessage") {
    return mapDecoded(stringField(json, "messageId"), (messageId) => ({
      messageId,
      interfaceRef: null,
      operationRef: null,
    }));
  }
  if (kind.value === "unspecifiedMessage") {
    return accept({ messageId: null, interfaceRef: null, operationRef: null });
  }
  return refuse(`unknown message channel kind ${kind.value}`);
}

/** An operation channel needs all three identifiers; otherwise a Message identifier makes a direct channel. */
export function channelToJson(channel: MessageChannel): JsonValue {
  if (channel.messageId === null) {
    return { kind: "unspecifiedMessage" };
  }
  if (channel.interfaceRef !== null && channel.operationRef !== null) {
    return {
      kind: "operationMessage",
      interfaceId: channel.interfaceRef,
      interfaceOperationId: channel.operationRef,
      messageId: channel.messageId,
    };
  }
  return { kind: "directMessage", messageId: channel.messageId };
}

/** An `occurrenceId` object, by process instance, element and activation. */
export function occurrenceFromJson(json: unknown): Decoded<OccurrenceRef> {
  const processInstanceId = stringField(json, "processInstanceId");
  if (!processInstanceId.ok) {
    return processInstanceId;
  }
  const element = stringField(json, "elementId");
  if (!element.ok) {
    return element;
  }
  return mapDecoded(nat.decode(objValD(json, "activation")), (activation) => ({
    processInstanceId: processInstanceId.value,
    element: element.value,
    activation,
  }));
}

/** `field`, which must be present, read as an occurrence. */
function occurrenceField(json: unknown, field: string): Decoded<OccurrenceRef> {
  const raw = objVal(json, field);
  return raw.ok ? occurrenceFromJson(raw.value) : raw;
}

export function effectOutcomeFromJson(json: unknown): Decoded<EffectOutcome> {
  const patch = bindingsField(json, "localPatch");
  if (!patch.ok) {
    return patch;
  }
  const kind = stringField(json, "kind");
  if (!kind.ok) {
    return kind;
  }
  if (kind.value === "success") {
    return accept({ tag: EffectOutcomeTag.Success, outputs: patch.value });
  }
  if (kind.value === "bpmnError") {
    const message = stringField(json, "message");
    return mapDecoded(stringField(json, "code"), (code) => ({
      tag: EffectOutcomeTag.BusinessFailure,
      code,
      message: message.ok ? message.value : null,
      outputs: patch.value,
    }));
  }
  return refuse(`unknown effect result kind ${kind.value}`);
}

function startStimulus(json: unknown): Decoded<Input> {
  const instanceId = stringField(json, "instanceId");
  if (!instanceId.ok) {
    return instanceId;
  }
  return mapDecoded(bindingsField(json, "initialVariables"), (variables) => ({
    tag: InputTag.Start,
    payload: { instanceId: instanceId.value, startEvent: null, variables },
  }));
}

function triggeredStartStimulus(json: unknown): Decoded<Input> {
  const instanceId = stringField(json, "instanceId");
  if (!instanceId.ok) {
    return instanceId;
  }
  return mapDecoded(stringField(json, "startEventId"), (startEvent) => ({
    tag: InputTag.Start,
    payload: { instanceId: instanceId.value, startEvent, variables: [] },
  }));
}

function deliveryStimulus(json: unknown, withPayload: boolean): Decoded<Input> {
  const occurrence = occurrenceField(json, "subscriptionId");
  if (!occurrence.ok) {
    return occurrence;
  }
  const rawChannel = objVal(json, "channel");
  const channel = rawChannel.ok ? channelFromJson(rawChannel.value) : rawChannel;
  if (!channel.ok) {
    return channel;
  }
  let payload: Value | null = null;
  if (withPayload) {
    const raw = objVal(json, "payload");
    const decoded = raw.ok ? valueCodec.decode(raw.value) : raw;
    if (!decoded.ok) {
      return decoded;
    }
    payload = decoded.value;
  }
  return accept({
    tag: InputTag.Deliver,
    payload: { occurrence: occurrence.value, channel: channel.value, correlation: [], payload },
  });
}

function incidentStimulus(json: unknown, action: CommandAction): Decoded<Input> {
  const incident = objVal(json, "incidentId");
  if (!incident.ok) {
    return incident;
  }
  return mapDecoded(occurrenceField(incident.value, "effectId"), (occurrence) => ({
    tag: InputTag.Command,
    payload: { occurrence, action },
  }));
}

const stimulusKinds: ReadonlyMap<string, (json: unknown) => Decoded<Input>> = new Map([
  ["startProcess", startStimulus],
  ["triggerTimerStart", triggeredStartStimulus],
  ["triggerMessageStart", triggeredStartStimulus],
  [
    "completeUserTaskInstance",
    (json: unknown): Decoded<Input> => {
      const occurrence = occurrenceField(json, "taskId");
      if (!occurrence.ok) {
        return occurrence;
      }
      return mapDecoded(bindingsField(json, "submittedValues"), (values) => ({
        tag: InputTag.Command,
        payload: { occurrence: occurrence.value, action: { tag: CommandActionTag.CompleteUserTask, values } },
      }));
    },
  ],
  ["deliverMessage", (json: unknown) => deliveryStimulus(json, false)],
  ["deliverPayloadMessage", (json: unknown) => deliveryStimulus(json, true)],
  [
    "fireTimer",
    (json: unknown): Decoded<Input> => {
      const occurrence = occurrenceField(json, "timerId");
      if (!occurrence.ok) {
        return occurrence;
      }
      return mapDecoded(nat.decode(objValD(json, "logicalTimeMs")), (logicalTimeMs) => ({
        tag: InputTag.TimerFire,
        payload: { occurrence: occurrence.value, logicalTimeMs },
      }));
    },
  ],
  [
    "completeEffect",
    (json: unknown): Decoded<Input> => {
      const occurrence = occurrenceField(json, "effectId");
      if (!occurrence.ok) {
        return occurrence;
      }
      const raw = objVal(json, "result");
      const outcome = raw.ok ? effectOutcomeFromJson(raw.value) : raw;
      return mapDecoded(outcome, (decoded) => ({
        tag: InputTag.EffectResult,
        payload: { occurrence: occurrence.value, outcome: decoded },
      }));
    },
  ],
  [
    "reportEffectFailure",
    (json: unknown): Decoded<Input> =>
      mapDecoded(occurrenceField(json, "effectId"), (occurrence) => ({
        tag: InputTag.EffectResult,
        payload: { occurrence, outcome: { tag: EffectOutcomeTag.TechnicalFailure } },
      })),
  ],
  ["retryIncident", (json: unknown) => incidentStimulus(json, { tag: CommandActionTag.RetryIncident })],
  [
    "cancelIncidentProcess",
    (json: unknown) => incidentStimulus(json, { tag: CommandActionTag.CancelIncidentProcess }),
  ],
]);

/**
 * One scenario stimulus: its command identifier and the kernel input, or `null` for a stimulus kind the kernel
 * does not accept yet.
 */
export function stimulusFromJson(json: unknown): Decoded<readonly [string, Input | null]> {
  const commandId = stringField(json, "commandId");
  if (!commandId.ok) {
    return commandId;
  }
  const kind = stringField(json, "kind");
  if (!kind.ok) {
    return kind;
  }
  const decoder = stimulusKinds.get(kind.value);
  if (decoder === undefined) {
    return accept([commandId.value, null] as const);
  }
  return mapDecoded(decoder(json), (input) => [commandId.value, input] as const);
}

export function failureName(failure: Failure): string {
  switch (failure.tag) {
    case FailureTag.Rejected:
      return "rejected";
    case FailureTag.RolledBack:
      return "rolledBack";
    case FailureTag.SemanticFailure:
      return "semanticFailure";
    case FailureTag.Unsupported:
      return "unsupported";
  }
  return assertNever(failure.tag);
}
