/**
 * Scenario stimulus codecs, transcribed from `Kernel/IL/Codec/Stimulus.lean`: the scenario contract's input side
 * (`contracts/schemas/scenario.schema.json`), Message channels, occurrence identities and the five stimulus forms,
 * each decoded into the kernel input of the same name, and the name of each failure outcome. A stimulus outside these
 * forms refuses the scenario. Every object is read strictly: a key outside its form, a missing required key or a `null`
 * member refuses it with a strict-decoding code (`CodecRefusalCode`).
 */
import {
  CodecRefusalCode,
  accept,
  bindingsFromJson,
  bindingsToJson,
  coded,
  isObject,
  mapDecoded,
  nat,
  objVal,
  objValD,
  refuseDecoding,
  strictly,
  string,
  valueCodec,
  type Decoded,
  type JsonValue,
} from "../codec.js";
import {
  CommandActionTag,
  CriterionTargetTag,
  DeliveryTriggerTag,
  EffectOutcomeTag,
  FailureTag,
  InputTag,
  SignalAddressTag,
  SignalReach,
  StartTriggerTag,
  noStartTrigger,
  type Binding,
  type CommandAction,
  type ConditionChoice,
  type CorrelationMatch,
  type CriterionTarget,
  type DeliveryTrigger,
  type EffectOutcome,
  type Failure,
  type Input,
  type MessageChannel,
  type OccurrenceRef,
  type SignalAddress,
  type StartTrigger,
} from "../../state.js";
import { assertNever, compareStrings, type ElementId, type Value } from "../types.js";

/** A string field read through `getObjValAs?`, which reads an absent key as `null`. */
function stringField(json: unknown, key: string): Decoded<string> {
  return string.decode(objValD(json, key));
}

/** Refuse `json` unless it is an object whose keys are all of `required` and some of `optional`. */
function fieldsRefusal(json: unknown, required: readonly string[], optional: readonly string[] = []): string | null {
  if (!isObject(json)) return `${CodecRefusalCode.Malformed}: object expected`;
  const unknown = Object.keys(json).sort(compareStrings).find((key) => !required.includes(key) && !optional.includes(key));
  if (unknown !== undefined) return `${CodecRefusalCode.UnknownField}: ${unknown}`;
  const missing = required.find((key) => !Object.hasOwn(json, key));
  return missing === undefined ? null : `${CodecRefusalCode.MissingField}: ${missing}`;
}

/** The `kind` of a tagged object, after checking it has its form's keys. */
function kindOf(json: unknown): Decoded<string> {
  if (!isObject(json)) return refuseDecoding(`${CodecRefusalCode.Malformed}: object expected`);
  return Object.hasOwn(json, "kind") ? string.decode(json["kind"]) : refuseDecoding(`${CodecRefusalCode.MissingField}: kind`);
}

/** The scenario contract's `messageChannel`: an operation, a direct or an unspecified Message. */
export function channelFromJson(json: unknown): Decoded<MessageChannel> {
  const kind = kindOf(json);
  if (!kind.ok) {
    return kind;
  }
  const form: Readonly<Record<string, readonly string[]>> = {
    operationMessage: ["kind", "messageId", "interfaceId", "interfaceOperationId"],
    directMessage: ["kind", "messageId"],
    unspecifiedMessage: ["kind"],
  };
  const required = Object.hasOwn(form, kind.value) ? form[kind.value] : undefined;
  const refusal = required === undefined ? null : fieldsRefusal(json, required);
  if (refusal !== null) {
    return refuseDecoding(refusal);
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
  return refuseDecoding(`unknown message channel kind ${kind.value}`);
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
  const refusal = fieldsRefusal(json, ["processInstanceId", "elementId", "activation"]);
  if (refusal !== null) {
    return refuseDecoding(refusal);
  }
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

/** A refusal raised inside a decoder and returned by `decoding`: Lean's `Except` early exit. */
class Refusal {
  constructor(readonly refusal: string) {}
}

function get<T>(decoded: Decoded<T>): T {
  if (!decoded.ok) throw new Refusal(decoded.refusal);
  return decoded.value;
}

function decoding<T>(decode: () => T): Decoded<T> {
  try {
    return accept(decode());
  } catch (error) {
    if (error instanceof Refusal) return refuseDecoding(error.refusal);
    throw error;
  }
}

/** `field`, which must be present (`getObjVal?`). */
function present(json: unknown, field: string): unknown {
  return get(objVal(json, field));
}

/** `field` when present, else `undefined`; the contract's optional members, which are never `null`. */
function optionalField(json: unknown, field: string): unknown {
  const raw = objVal(json, field);
  return raw.ok ? raw.value : undefined;
}

function optionalString(json: unknown, field: string): string | null {
  const raw = optionalField(json, field);
  return raw === undefined ? null : get(string.decode(raw));
}

function fields(json: unknown, required: readonly string[], optional: readonly string[] = []): void {
  const refusal = fieldsRefusal(json, required, optional);
  if (refusal !== null) throw new Refusal(refusal);
}

function valueAt(json: unknown): Value {
  return get(strictly(valueCodec.decode, valueCodec.encode, json));
}

function bindingsAt(json: unknown, field: string): readonly Binding[] {
  return get(strictly(bindingsFromJson, bindingsToJson, present(json, field)));
}

function stringList(json: unknown): readonly string[] {
  if (!Array.isArray(json)) throw new Refusal("expected JSON array");
  return json.map((item: unknown) => get(string.decode(item)));
}

/** A Signal address: `name` for a named one, `signalRef` (`{id, namespace?}`) for a QName; a stimulus gives exactly one. */
function signalAddressFromJson(json: unknown): SignalAddress {
  const name = optionalField(json, "name");
  const ref = optionalField(json, "signalRef");
  if (name !== undefined && ref === undefined) return { tag: SignalAddressTag.Named, name: get(string.decode(name)) };
  if (name === undefined && ref !== undefined) {
    fields(ref, ["id"], ["namespace"]);
    return { tag: SignalAddressTag.Qualified, ref: { namespace: optionalString(ref, "namespace"), localName: get(stringField(ref, "id")) } };
  }
  if (name !== undefined) throw new Refusal(`${CodecRefusalCode.Malformed}: a Signal address is a name or a signalRef, not both`);
  throw new Refusal(`${CodecRefusalCode.MissingField}: name`);
}

/** The members `signalAddressFromJson` reads back. */
export function signalAddressToJson(address: SignalAddress): Readonly<Record<string, JsonValue>> {
  switch (address.tag) {
    case SignalAddressTag.Named:
      return { name: address.name };
    case SignalAddressTag.Qualified:
      return { signalRef: { ...(address.ref.namespace === null ? {} : { namespace: address.ref.namespace }), id: address.ref.localName } };
  }
  return assertNever(address);
}

function startTriggerFromJson(json: unknown): StartTrigger {
  const kind = get(kindOf(json));
  switch (kind) {
    case "none":
      fields(json, ["kind"]);
      return noStartTrigger;
    case "timer":
      fields(json, ["kind", "logicalTimeMs"]);
      return { tag: StartTriggerTag.Timer, logicalTimeMs: get(nat.decode(objValD(json, "logicalTimeMs"))) };
    case "message": {
      fields(json, ["kind", "channel"], ["payload"]);
      const channel = get(channelFromJson(present(json, "channel")));
      const payload = optionalField(json, "payload");
      return { tag: StartTriggerTag.Message, channel, payload: payload === undefined ? null : valueAt(payload) };
    }
    case "signal":
      fields(json, ["kind", "variables"], ["name", "signalRef"]);
      return { tag: StartTriggerTag.Signal, address: signalAddressFromJson(json), variables: bindingsAt(json, "variables") };
    case "condition":
      fields(json, ["kind"]);
      return { tag: StartTriggerTag.Condition };
  }
  throw new Refusal(`unknown start trigger kind ${kind}`);
}

function commandActionFromJson(json: unknown): CommandAction {
  const kind = get(kindOf(json));
  switch (kind) {
    case "completeUserTask":
      fields(json, ["kind", "values"]);
      return { tag: CommandActionTag.CompleteUserTask, values: bindingsAt(json, "values") };
    case "retryIncident":
      fields(json, ["kind", "generation"]);
      return { tag: CommandActionTag.RetryIncident, generation: get(nat.decode(objValD(json, "generation"))) };
    case "cancelIncidentProcess":
      fields(json, ["kind", "generation"]);
      return { tag: CommandActionTag.CancelIncidentProcess, generation: get(nat.decode(objValD(json, "generation"))) };
    case "setVariables":
      fields(json, ["kind", "values"]);
      return { tag: CommandActionTag.SetVariables, values: bindingsAt(json, "values") };
    case "removeVariables":
      fields(json, ["kind", "names"]);
      return { tag: CommandActionTag.RemoveVariables, names: stringList(objValD(json, "names")) };
  }
  throw new Refusal(`unknown command action kind ${kind}`);
}

function deliveryTriggerFromJson(json: unknown): DeliveryTrigger {
  const kind = get(kindOf(json));
  switch (kind) {
    case "message":
      fields(json, ["kind", "channel"]);
      return { tag: DeliveryTriggerTag.Message, channel: get(channelFromJson(present(json, "channel"))) };
    case "signal":
      fields(json, ["kind"], ["name", "signalRef"]);
      return { tag: DeliveryTriggerTag.Signal, address: signalAddressFromJson(json), reach: SignalReach.Targeted };
  }
  throw new Refusal(`unknown delivery trigger kind ${kind}`);
}

function criterionTargetFromJson(json: unknown): CriterionTarget {
  const kind = get(kindOf(json));
  switch (kind) {
    case "processVariable":
      fields(json, ["kind", "name"]);
      return { tag: CriterionTargetTag.ProcessVariable, name: get(stringField(json, "name")) };
    case "localVariable":
      fields(json, ["kind", "name"]);
      return { tag: CriterionTargetTag.LocalVariable, name: get(stringField(json, "name")) };
    case "businessKey":
      fields(json, ["kind"]);
      return { tag: CriterionTargetTag.BusinessKey };
    case "processInstance":
      fields(json, ["kind"]);
      return { tag: CriterionTargetTag.ProcessInstance };
  }
  throw new Refusal(`unknown correlation target kind ${kind}`);
}

function correlationFromJson(json: unknown): CorrelationMatch {
  fields(json, ["target", "expected"]);
  const target = criterionTargetFromJson(present(json, "target"));
  return { target, expected: valueAt(present(json, "expected")) };
}

/** The stimulus forms a population command shares with an instance input, for the population runner. */
export const decodeCorrelation = (json: unknown): Decoded<CorrelationMatch> => decoding(() => correlationFromJson(json));
export const decodeSignalAddress = (json: unknown): Decoded<SignalAddress> => decoding(() => signalAddressFromJson(json));
export const decodeStrictValue = (json: unknown): Decoded<Value> => decoding(() => valueAt(json));
export const decodeBindings = (json: unknown, field: string): Decoded<readonly Binding[]> => decoding(() => bindingsAt(json, field));

function effectOutcomeFromJson(json: unknown): EffectOutcome {
  const kind = get(kindOf(json));
  switch (kind) {
    case "success":
      fields(json, ["kind", "outputs"]);
      return { tag: EffectOutcomeTag.Success, outputs: bindingsAt(json, "outputs") };
    case "businessFailure": {
      fields(json, ["kind", "code", "outputs"], ["message"]);
      const code = get(stringField(json, "code"));
      const message = optionalString(json, "message");
      return { tag: EffectOutcomeTag.BusinessFailure, code, message, outputs: bindingsAt(json, "outputs") };
    }
    case "technicalFailure":
      fields(json, ["kind"]);
      return { tag: EffectOutcomeTag.TechnicalFailure };
    case "unsupported":
      fields(json, ["kind", "code"]);
      return { tag: EffectOutcomeTag.Unsupported, code: get(stringField(json, "code")) };
  }
  throw new Refusal(`unknown effect outcome kind ${kind}`);
}

/**
 * An input's ranking of competing Conditional items, `conditionChoices`: absent is `[]`; each entry is an object naming
 * one public element, so a later refinement adds a member without reinterpreting an entry.
 */
function conditionChoicesFromJson(json: unknown): readonly ConditionChoice[] {
  const entries = optionalField(json, "conditionChoices");
  if (entries === undefined) return [];
  if (!Array.isArray(entries)) throw new Refusal("expected JSON array");
  return entries.map((entry: unknown) => {
    fields(entry, ["elementId"]);
    return { element: get(stringField(entry, "elementId")) };
  });
}

/** The members `conditionChoicesFromJson` reads back. */
export function conditionChoicesToJson(choices: readonly ConditionChoice[]): JsonValue {
  return choices.map((choice) => ({ elementId: choice.element }));
}

/**
 * The firing a start stimulus states when its trigger is a Timer: the start it names, if any, and the due instant its
 * trigger's logical time gives. A single-instance run checks it before the step (`runStep`).
 */
export type TimerFiring = Readonly<{ startEvent: ElementId | null; dueMs: number }>;

function inputFromJson(
  json: unknown, kind: string, atMs: number | null, conditionChoices: readonly ConditionChoice[],
): readonly [Input, TimerFiring | null] {
  const occurrence = (): OccurrenceRef => get(occurrenceFromJson(present(json, "occurrence")));
  switch (kind) {
    case "start": {
      const rawTrigger = optionalField(json, "trigger");
      const trigger = rawTrigger === undefined ? null : startTriggerFromJson(rawTrigger);
      const startEvent = optionalString(json, "startEvent");
      const firing = trigger?.tag === StartTriggerTag.Timer ? { startEvent, dueMs: trigger.logicalTimeMs } : null;
      const instanceId = get(stringField(json, "instanceId"));
      const variables = bindingsAt(json, "variables");
      const payload = {
        instanceId, startEvent, variables, trigger: trigger ?? noStartTrigger, businessKey: optionalString(json, "businessKey"), atMs,
        conditionChoices,
      };
      return [{ tag: InputTag.Start, payload }, firing];
    }
    case "command": {
      const ref = occurrence();
      return [{ tag: InputTag.Command, payload: { occurrence: ref, action: commandActionFromJson(present(json, "action")), atMs, conditionChoices } }, null];
    }
    case "deliver": {
      const rawCorrelation = optionalField(json, "correlation");
      if (rawCorrelation !== undefined && !Array.isArray(rawCorrelation)) throw new Refusal("expected JSON array");
      const entries: readonly unknown[] = rawCorrelation ?? [];
      const ref = occurrence();
      const trigger = deliveryTriggerFromJson(present(json, "trigger"));
      const correlation = entries.map(correlationFromJson);
      const payload = optionalField(json, "payload");
      const variables = optionalField(json, "variables") === undefined ? [] : bindingsAt(json, "variables");
      const delivery = {
        occurrence: ref, trigger, correlation, payload: payload === undefined ? null : valueAt(payload), variables, atMs, conditionChoices,
      };
      return [{ tag: InputTag.Deliver, payload: delivery }, null];
    }
    case "timerFire": {
      const ref = occurrence();
      const logicalTimeMs = get(nat.decode(objValD(json, "logicalTimeMs")));
      return [{ tag: InputTag.TimerFire, payload: { occurrence: ref, logicalTimeMs, atMs, conditionChoices } }, null];
    }
    case "effectResult": {
      const ref = occurrence();
      const outcome = effectOutcomeFromJson(present(json, "outcome"));
      return [{ tag: InputTag.EffectResult, payload: { occurrence: ref, outcome, atMs, conditionChoices } }, null];
    }
  }
  throw new Refusal(`unknown stimulus kind ${kind}`);
}

const stimulusForms: Readonly<Record<string, readonly [readonly string[], readonly string[]]>> = {
  start: [["instanceId", "variables"], ["startEvent", "trigger", "businessKey", "at", "conditionChoices"]],
  command: [["occurrence", "action"], ["at", "conditionChoices"]],
  deliver: [["occurrence", "trigger"], ["correlation", "payload", "variables", "at", "conditionChoices"]],
  timerFire: [["occurrence", "logicalTimeMs"], ["at", "conditionChoices"]],
  effectResult: [["occurrence", "outcome"], ["at", "conditionChoices"]],
};

/** One scenario stimulus with the Timer firing it states, every refusal carrying its strict-decoding code. */
export function firingStimulusFromJson(json: unknown): Decoded<readonly [string, Input, TimerFiring | null]> {
  const decoded = decoding(() => {
    const kind = get(kindOf(json));
    const form = Object.hasOwn(stimulusForms, kind) ? stimulusForms[kind] : undefined;
    if (form !== undefined) fields(json, ["kind", "commandId", ...form[0]], form[1]);
    const commandId = get(stringField(json, "commandId"));
    // `at`, the input's logical time in milliseconds, is optional; absent leaves the clock unchanged.
    const at = optionalField(json, "at");
    const atMs = at === undefined ? null : get(nat.decode(at));
    const [input, firing] = inputFromJson(json, kind, atMs, conditionChoicesFromJson(json));
    return [commandId, input, firing] as const;
  });
  return decoded.ok ? decoded : refuseDecoding(coded(decoded.refusal));
}

/** One scenario stimulus: its command identifier and the kernel input, every refusal carrying its strict-decoding
 * code. */
export function stimulusFromJson(json: unknown): Decoded<readonly [string, Input]> {
  return mapDecoded(firingStimulusFromJson(json), ([commandId, input]) => [commandId, input] as const);
}

/** The refusal or failure code a failure carries. */
export function failureCode(failure: Failure): string {
  return failure.code;
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
