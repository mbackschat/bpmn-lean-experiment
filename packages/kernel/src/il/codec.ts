/**
 * Kernel codecs, transcribed from `Kernel/IL/Codec.lean` and the Lean derived JSON instances it relies on.
 *
 * The kernel IL's wire form is Lean's derived JSON encoding: a structure is an object, a nullary constructor a
 * string, any other constructor `{"<name>": {<arguments>}}`. Identifiers are plain strings, and a `Value` uses the
 * scenario contract's `variableValue` form. Decoding never throws: it returns a refusal string.
 *
 * The decoders reproduce Lean's acceptance, not only its encoding (toolchain v4.34.1,
 * `Lean/Elab/Deriving/FromToJson.lean` and `Lean/Data/Json/FromToJson/Basic.lean`): a structure field reads
 * through `getObjValD`, so an absent field decodes as `null` and a non-object decodes every field from `null`;
 * a constructor argument reads through `getObjVal?`, so it must be present even when it is an `Option`; a
 * constructor tag is a string or the only key of an object, and a nullary constructor ignores its payload.
 * Two limits are JavaScript's, not Lean's: a parsed number cannot distinguish `1` from `1.0`, and an integer
 * outside the safe range is refused here although Lean's arbitrary-precision `Int` and `Nat` accept it.
 */
import {
  AbnormalScopeEnd,
  CallBindingTag,
  CallBindingTime,
  CollectionRead,
  CompensationHandlerFailureTag,
  CompensationOrder,
  ConditionOrder,
  ContinuationFailure,
  CycleDialect,
  DecisionResultMapping,
  DeliveryVariables,
  ElementTag,
  ErrorPathOutputs,
  Evaluator,
  EventRoleTag,
  ExpressionTag,
  GatewayKindTag,
  InstanceCountTag,
  MappingDialect,
  MessageCorrelation,
  MultiInstanceFinalBody,
  MultiInstanceMode,
  MultiInstanceOutputs,
  Placement,
  ScopeKindTag,
  SimpleBooleanTag,
  SubmissionRule,
  TechnicalFailure,
  ThrowTag,
  TimerScheduleTag,
  TransactionMethodTag,
  TriggerTag,
  UndeclaredWrite,
  UnhandledError,
  ValueSourceTag,
  ValueTag,
  WorkTag,
  assertNever,
  compareStrings,
  type Boundary,
  type CallBinding,
  type CompensationHandlerFailure,
  type CorrelationCriterion,
  type DefinitionRef,
  type EffectBinding,
  type Element,
  type Envelope,
  type EventRole,
  type Expression,
  type Flow,
  type GatewayKind,
  type Header,
  type InstanceCount,
  type Mapping,
  type MessageTrigger,
  type MultiInstance,
  type ProfileOptions,
  type Program,
  type ScopeKind,
  type SimpleBoolean,
  type Subscription,
  type Throw,
  type TimerSchedule,
  type TransactionMethod,
  type Trigger,
  type Value,
  type ValueSource,
  type Work,
} from "./types.js";
import type { Binding } from "../state.js";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type Decoded<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly refusal: string };

interface Codec<T> {
  readonly decode: (json: unknown) => Decoded<T>;
  readonly encode: (value: T) => JsonValue;
}

/** The untyped view the generic structure and constructor tables work through. */
interface LooseCodec {
  readonly decode: (json: unknown) => Decoded<unknown>;
  readonly encode: (value: unknown) => JsonValue;
}

type Fields<T> = { readonly [K in keyof T]-?: Codec<T[K]> };

type Constructors<T extends { readonly tag: string }> = {
  readonly [K in T["tag"]]: Fields<Omit<Extract<T, { readonly tag: K }>, "tag">>;
};

export function accept<T>(value: T): Decoded<T> {
  return { ok: true, value };
}

export function refuse<T>(refusal: string): Decoded<T> {
  return { ok: false, refusal };
}

export function isObject(json: unknown): json is Readonly<Record<string, unknown>> {
  return typeof json === "object" && json !== null && !Array.isArray(json);
}

/** Lean's `Json.getObjVal?`: the key must be present. */
export function objVal(json: unknown, key: string): Decoded<unknown> {
  if (!isObject(json)) {
    return refuse("object expected");
  }
  return Object.hasOwn(json, key) ? accept(json[key]) : refuse(`property not found: ${key}`);
}

/** Lean's `Json.getObjValD`: an absent key, or a non-object, reads as `null`. */
export function objValD(json: unknown, key: string): unknown {
  return isObject(json) && Object.hasOwn(json, key) ? json[key] : null;
}

/** Lean's `Json.getTag?`: a string, or the only key of an object. */
export function tagOf(json: unknown): string | null {
  if (typeof json === "string") {
    return json;
  }
  if (isObject(json)) {
    const keys = Object.keys(json);
    return keys.length === 1 ? (keys[0] ?? null) : null;
  }
  return null;
}

function loose<T>(codec: Codec<T>): LooseCodec {
  return codec as unknown as LooseCodec;
}

export const string: Codec<string> = {
  decode: (json) => (typeof json === "string" ? accept(json) : refuse("String expected")),
  encode: (value) => value,
};

export const bool: Codec<boolean> = {
  decode: (json) => (typeof json === "boolean" ? accept(json) : refuse("Bool expected")),
  encode: (value) => value,
};

export const nat: Codec<number> = {
  decode: (json) =>
    typeof json === "number" && Number.isSafeInteger(json) && json >= 0
      ? accept(json)
      : refuse("Natural number expected"),
  encode: (value) => value,
};

export const int: Codec<number> = {
  decode: (json) =>
    typeof json === "number" && Number.isSafeInteger(json) ? accept(json) : refuse("Integer expected"),
  encode: (value) => value,
};

function list<T>(item: Codec<T>): Codec<readonly T[]> {
  return {
    decode: (json) => {
      if (!Array.isArray(json)) {
        return refuse("expected JSON array");
      }
      const items: T[] = [];
      for (const [index, entry] of json.entries()) {
        const decoded = item.decode(entry);
        if (!decoded.ok) {
          return refuse(`[${index}]: ${decoded.refusal}`);
        }
        items.push(decoded.value);
      }
      return accept(items);
    },
    encode: (values) => values.map(item.encode),
  };
}

function option<T>(inner: Codec<T>): Codec<T | null> {
  return {
    decode: (json) => (json === null ? accept(null) : inner.decode(json)),
    encode: (value) => (value === null ? null : inner.encode(value)),
  };
}

function pair<A, B>(first: Codec<A>, second: Codec<B>): Codec<readonly [A, B]> {
  return {
    decode: (json) => {
      if (!Array.isArray(json) || json.length !== 2) {
        return refuse("expected pair");
      }
      const a = first.decode(json[0]);
      if (!a.ok) {
        return a;
      }
      const b = second.decode(json[1]);
      return b.ok ? accept([a.value, b.value] as const) : b;
    },
    encode: (value) => [first.encode(value[0]), second.encode(value[1])],
  };
}

/** A Lean structure: every field in declaration order, each read through `getObjValD`. */
function struct<T>(name: string, fields: Fields<T>): Codec<T> {
  const entries = Object.entries(fields).map(([key, codec]) => [key, loose(codec as Codec<unknown>)] as const);
  return {
    decode: (json) => {
      const out: Record<string, unknown> = {};
      for (const [key, codec] of entries) {
        const decoded = codec.decode(objValD(json, key));
        if (!decoded.ok) {
          return refuse(`${name}.${key}: ${decoded.refusal}`);
        }
        out[key] = decoded.value;
      }
      return accept(out as T);
    },
    encode: (value) => {
      const record = value as Readonly<Record<string, unknown>>;
      return Object.fromEntries(entries.map(([key, codec]) => [key, codec.encode(record[key])]));
    },
  };
}

/** A Lean inductive with named constructor arguments; a constructor with no arguments is nullary. */
function inductive<T extends { readonly tag: string }>(name: string, constructors: Constructors<T>): Codec<T> {
  const table = new Map(
    Object.entries(constructors).map(([tag, fields]) => [
      tag,
      Object.entries(fields as Readonly<Record<string, Codec<unknown>>>).map(
        ([key, codec]) => [key, loose(codec)] as const,
      ),
    ]),
  );
  return {
    decode: (json) => {
      const tag = tagOf(json);
      if (tag === null) {
        return refuse(`${name}: no inductive tag found`);
      }
      const fields = table.get(tag);
      if (fields === undefined) {
        return refuse(`${name}: no inductive constructor matched`);
      }
      const out: Record<string, unknown> = { tag };
      if (fields.length === 0) {
        return accept(out as T);
      }
      const payload = objVal(json, tag);
      if (!payload.ok) {
        return refuse(`${name}.${tag}: ${payload.refusal}`);
      }
      for (const [key, codec] of fields) {
        const raw = objVal(payload.value, key);
        const decoded = raw.ok ? codec.decode(raw.value) : raw;
        if (!decoded.ok) {
          return refuse(`${name}.${tag}.${key}: ${decoded.refusal}`);
        }
        out[key] = decoded.value;
      }
      return accept(out as T);
    },
    encode: (value) => {
      const fields = table.get(value.tag) ?? [];
      if (fields.length === 0) {
        return value.tag;
      }
      const record = value as unknown as Readonly<Record<string, unknown>>;
      return { [value.tag]: Object.fromEntries(fields.map(([key, codec]) => [key, codec.encode(record[key])])) };
    },
  };
}

/** A Lean inductive whose constructors are all nullary, mirrored as a plain string enum. */
function nullary<E extends string>(name: string, members: Readonly<Record<E, E>>): Codec<E> {
  const table = new Map<string, E>(Object.entries<E>(members));
  return {
    decode: (json) => {
      const tag = tagOf(json);
      const member = tag === null ? undefined : table.get(tag);
      return member === undefined ? refuse(`${name}: no inductive constructor matched`) : accept(member);
    },
    encode: (value) => value,
  };
}

// Value: the scenario contract's `variableValue`, as `Kernel.Codec.valueFromJson` reads it.

/** Lean's `String.toInt?`: an optional `-`, then digits with single `_` separators between digits. */
function leanToInt(text: string): bigint | null {
  const digits = text.startsWith("-") ? text.slice(1) : text;
  if (!/^[0-9]+(?:_[0-9]+)*$/u.test(digits)) {
    return null;
  }
  const magnitude = BigInt(digits.replaceAll("_", ""));
  return text.startsWith("-") ? -magnitude : magnitude;
}

function entryFromJson(entry: unknown): Decoded<Binding> {
  const name = string.decode(objValD(entry, "name"));
  if (!name.ok) {
    return name;
  }
  const raw = objVal(entry, "value");
  const value = raw.ok ? valueCodec.decode(raw.value) : raw;
  return value.ok ? accept([name.value, value.value] as const) : value;
}

export function entriesFromJson(json: unknown): Decoded<readonly Binding[]> {
  return list<Binding>({ decode: entryFromJson, encode: entryToJson }).decode(json);
}

function entryToJson(entry: Binding): JsonValue {
  return { name: entry[0], value: valueCodec.encode(entry[1]) };
}

export function mapDecoded<A, B>(decoded: Decoded<A>, wrap: (value: A) => B): Decoded<B> {
  return decoded.ok ? accept(wrap(decoded.value)) : decoded;
}

const valueKinds: ReadonlyMap<string, (json: unknown) => Decoded<Value>> = new Map<
  string,
  (json: unknown) => Decoded<Value>
>([
  ["null", () => accept<Value>({ tag: ValueTag.Null })],
  ["boolean", (json) => mapDecoded(bool.decode(objValD(json, "value")), (value) => ({ tag: ValueTag.Bool, value }))],
  ["integer", (json) => mapDecoded(int.decode(objValD(json, "value")), (value) => ({ tag: ValueTag.Int, value }))],
  [
    "decimal",
    (json) => {
      const coefficient = string.decode(objValD(json, "coefficient"));
      if (!coefficient.ok) {
        return coefficient;
      }
      const parsed = leanToInt(coefficient.value);
      if (parsed === null) {
        return refuse(`invalid decimal coefficient ${coefficient.value}`);
      }
      return mapDecoded(nat.decode(objValD(json, "scale")), (scale) => ({
        tag: ValueTag.Decimal,
        coefficient: parsed,
        scale,
      }));
    },
  ],
  ["string", (json) => mapDecoded(string.decode(objValD(json, "value")), (value) => ({ tag: ValueTag.String, value }))],
  [
    "stringList",
    (json) => mapDecoded(list(string).decode(objValD(json, "value")), (items) => ({ tag: ValueTag.StringList, items })),
  ],
  [
    "list",
    (json) => mapDecoded(list(valueCodec).decode(objValD(json, "value")), (items) => ({ tag: ValueTag.List, items })),
  ],
  ["map", (json) => mapDecoded(entriesFromJson(objValD(json, "value")), (entries) => ({ tag: ValueTag.Map, entries }))],
]);

function valueToJson(value: Value): JsonValue {
  switch (value.tag) {
    case ValueTag.Null:
      return { kind: "null" };
    case ValueTag.Bool:
      return { kind: "boolean", value: value.value };
    case ValueTag.Int:
      return { kind: "integer", value: value.value };
    case ValueTag.Decimal:
      return { kind: "decimal", coefficient: value.coefficient.toString(), scale: value.scale };
    case ValueTag.String:
      return { kind: "string", value: value.value };
    case ValueTag.StringList:
      return { kind: "stringList", value: [...value.items] };
    case ValueTag.List:
      return { kind: "list", value: value.items.map(valueToJson) };
    case ValueTag.Map:
      return { kind: "map", value: value.entries.map(entryToJson) };
  }
  return assertNever(value);
}

export const valueCodec: Codec<Value> = {
  decode: (json) => {
    const kind = string.decode(objValD(json, "kind"));
    if (!kind.ok) {
      return kind;
    }
    const decoder = valueKinds.get(kind.value);
    return decoder === undefined ? refuse(`unknown value kind ${kind.value}`) : decoder(json);
  },
  encode: valueToJson,
};

// The kernel IL, in `Kernel.IL.Types` declaration order.

/** A nullary enum whose members are their own wire names. */
function members<E extends string>(name: string, values: Readonly<Record<string, E>>): Codec<E> {
  return nullary<E>(name, Object.fromEntries(Object.values(values).map((value) => [value, value])) as Record<E, E>);
}

const simpleBoolean = inductive<SimpleBoolean>("SimpleBoolean", {
  [SimpleBooleanTag.Literal]: { value: bool },
  [SimpleBooleanTag.IsPresent]: { name: string },
  [SimpleBooleanTag.IsNull]: { name: string },
  [SimpleBooleanTag.StringEquals]: { name: string, value: string },
});

const expression = inductive<Expression>("Expression", {
  [ExpressionTag.Literal]: { value: valueCodec },
  [ExpressionTag.SimpleBoolean]: { body: simpleBoolean },
  [ExpressionTag.Variable]: { name: string },
  [ExpressionTag.Foreign]: { language: string, source: string },
});

const valueSource = inductive<ValueSource>("ValueSource", {
  [ValueSourceTag.Literal]: { value: string },
  [ValueSourceTag.Expression]: { body: expression },
});

const mapping = struct<Mapping>("Mapping", {
  target: string,
  source: expression,
  dialect: members("MappingDialect", MappingDialect),
});

const timerSchedule = inductive<TimerSchedule>("TimerSchedule", {
  [TimerScheduleTag.Duration]: { value: valueSource },
  [TimerScheduleTag.Date]: { value: valueSource },
  [TimerScheduleTag.Cycle]: { value: valueSource, dialect: members("CycleDialect", CycleDialect) },
});

const correlationCriterion = struct<CorrelationCriterion>("CorrelationCriterion", { key: string, value: expression });

const messageTrigger = struct<MessageTrigger>("MessageTrigger", {
  name: option(valueSource),
  correlation: list(correlationCriterion),
  interfaceRef: option(string),
  operationRef: option(string),
});

const trigger = inductive<Trigger>("Trigger", {
  [TriggerTag.Timer]: { payload: struct("TimerTrigger", { schedule: timerSchedule }) },
  [TriggerTag.Message]: { payload: messageTrigger },
  [TriggerTag.Signal]: { payload: struct("SignalTrigger", { name: valueSource }) },
  [TriggerTag.Condition]: {
    payload: struct("ConditionTrigger", { condition: expression, variableName: option(string), variableEvents: list(string) }),
  },
  [TriggerTag.Error]: {
    payload: struct("ErrorTrigger", { code: option(string), codeVariable: option(string), messageVariable: option(string) }),
  },
  [TriggerTag.Escalation]: { payload: struct("EscalationTrigger", { code: option(string), codeVariable: option(string) }) },
  [TriggerTag.Compensation]: {},
  [TriggerTag.Cancel]: {},
});

const subscription = struct<Subscription>("Subscription", { trigger, outputs: list(mapping) });

const boundary = struct<Boundary>("Boundary", {
  id: string,
  subscription,
  interrupting: bool,
  outgoing: list(string),
});

const effectBinding = struct<EffectBinding>("EffectBinding", { protocol: string, operation: string });

const throwRecord = inductive<Throw>("Throw", {
  [ThrowTag.None]: {},
  [ThrowTag.Message]: { payload: struct("MessageThrow", { binding: option(effectBinding), payload: list(mapping) }) },
  [ThrowTag.Signal]: {
    payload: struct("SignalThrow", {
      name: valueSource,
      payload: list(mapping),
      propagateAll: bool,
      localOnly: bool,
      businessKey: option(expression),
      asynchronous: bool,
    }),
  },
  [ThrowTag.Error]: { payload: struct("ErrorThrow", { code: string, message: option(valueSource) }) },
  [ThrowTag.Escalation]: { payload: struct("EscalationThrow", { code: string }) },
  [ThrowTag.Compensation]: { payload: struct("CompensationThrow", { activity: option(string), waitForCompletion: bool }) },
  [ThrowTag.Cancel]: {},
  [ThrowTag.Terminate]: {},
});

const callBinding = inductive<CallBinding>("CallBinding", {
  [CallBindingTag.Latest]: {},
  [CallBindingTag.Deployment]: {},
  [CallBindingTag.Version]: { value: valueSource },
  [CallBindingTag.VersionTag]: { value: valueSource },
});

const work = inductive<Work>("Work", {
  [WorkTag.None]: {},
  [WorkTag.Manual]: {},
  [WorkTag.User]: {
    payload: struct("UserWork", {
      name: option(string),
      assignee: option(valueSource),
      candidateUsers: list(valueSource),
      candidateGroups: list(valueSource),
      formKey: option(string),
      formFields: list(pair(string, string)),
      dueDate: option(valueSource),
      followUpDate: option(valueSource),
      priority: option(valueSource),
    }),
  },
  [WorkTag.Receive]: { payload: struct("ReceiveWork", { message: messageTrigger }) },
  [WorkTag.Service]: { payload: struct("ServiceWork", { protocol: string, operation: string }) },
  [WorkTag.Send]: {
    payload: struct("SendWork", {
      binding: effectBinding,
      recipient: option(valueSource),
      correlation: list(correlationCriterion),
      messageRef: option(string),
      operationRef: option(string),
    }),
  },
  [WorkTag.Script]: { payload: struct("ScriptWork", { format: string, source: string, resultVariable: option(string) }) },
  [WorkTag.Rule]: {
    payload: struct("RuleWork", {
      decision: valueSource,
      resultVariable: option(string),
      binding: callBinding,
      resultMapping: members("DecisionResultMapping", DecisionResultMapping),
    }),
  },
  [WorkTag.Call]: {
    payload: struct("CallWork", {
      calledElement: valueSource,
      binding: callBinding,
      tenant: option(valueSource),
      businessKey: option(expression),
      inputs: list(mapping),
      outputs: list(mapping),
      propagateAllInputs: bool,
      propagateAllOutputs: bool,
    }),
  },
});

const multiInstance = struct<MultiInstance>("MultiInstance", {
  mode: members("MultiInstanceMode", MultiInstanceMode),
  count: inductive<InstanceCount>("InstanceCount", {
    [InstanceCountTag.Collection]: { items: expression },
    [InstanceCountTag.Cardinality]: { count: expression },
  }),
  elementVariable: option(string),
  completionCondition: option(expression),
  inputDataItem: option(string),
  outputDataItem: option(string),
  outputCollection: option(string),
  mutableCollection: members("CollectionRead", CollectionRead),
});

const envelope = struct<Envelope>("Envelope", {
  incoming: list(string),
  outgoing: list(string),
  inputs: list(mapping),
  outputs: list(mapping),
  boundaries: list(boundary),
  multiInstance: option(multiInstance),
  compensationHandler: option(string),
  defaultFlow: option(string),
  asyncBefore: bool,
  asyncAfter: bool,
});

const transactionMethod = inductive<TransactionMethod>("TransactionMethod", {
  [TransactionMethodTag.Compensate]: {},
  [TransactionMethodTag.Store]: {},
  [TransactionMethodTag.Image]: {},
  [TransactionMethodTag.Other]: { uri: string },
});

const scopeKind = inductive<ScopeKind>("ScopeKind", {
  [ScopeKindTag.Embedded]: {},
  [ScopeKindTag.Transaction]: { payload: struct("TransactionScope", { method: transactionMethod }) },
  [ScopeKindTag.EventSubProcess]: { start: subscription, interrupting: bool },
});

const eventRole = inductive<EventRole>("EventRole", {
  [EventRoleTag.Catch]: { subscription },
  [EventRoleTag.Throw]: { record: throwRecord },
  [EventRoleTag.LinkCatch]: { name: string },
  [EventRoleTag.LinkThrow]: { name: string },
});

const gatewayKind = inductive<GatewayKind>("GatewayKind", {
  [GatewayKindTag.Exclusive]: { candidates: list(string), default: option(string) },
  [GatewayKindTag.Parallel]: {},
  [GatewayKindTag.Inclusive]: { candidates: list(string), default: option(string) },
  [GatewayKindTag.EventBased]: {},
});

const definitionRef = struct<DefinitionRef>("DefinitionRef", {
  key: string,
  version: option(nat),
  versionTag: option(string),
  deployment: option(string),
  tenant: option(string),
  sourceSha256: option(string),
});

const header = struct<Header>("Header", {
  id: string,
  origin: struct("ElementOrigin", { definition: option(definitionRef), sourceId: string }),
  sourceType: string,
  parent: option(string),
});

const element = inductive<Element>("Element", {
  [ElementTag.Activity]: { header, payload: struct("ActivityPayload", { work, envelope }) },
  [ElementTag.Scope]: {
    header,
    payload: struct("ScopePayload", { kind: scopeKind, children: list(string), localVariables: list(string), envelope }),
  },
  [ElementTag.Event]: {
    header,
    payload: struct("EventPayload", {
      role: eventRole,
      placement: members("Placement", Placement),
      incoming: list(string),
      outgoing: list(string),
    }),
  },
  [ElementTag.Gateway]: {
    header,
    payload: struct("GatewayPayload", { kind: gatewayKind, incoming: list(string), outgoing: list(string) }),
  },
  [ElementTag.Start]: {
    header,
    payload: struct("StartPayload", { subscription: option(subscription), outgoing: list(string) }),
  },
});

const flow = struct<Flow>("Flow", { id: string, source: string, target: string, condition: option(expression) });

const compensationHandlerFailure = inductive<CompensationHandlerFailure>("CompensationHandlerFailure", {
  [CompensationHandlerFailureTag.FailsInstance]: {},
  [CompensationHandlerFailureTag.Selected]: { code: string },
});

const profileOptions = struct<ProfileOptions>("ProfileOptions", {
  relations: list(string),
  evaluator: members("Evaluator", Evaluator),
  submission: members("SubmissionRule", SubmissionRule),
  scopeChainSubmissionBytes: option(nat),
  undeclaredWrite: members("UndeclaredWrite", UndeclaredWrite),
  errorPathOutputs: members("ErrorPathOutputs", ErrorPathOutputs),
  technicalFailure: members("TechnicalFailure", TechnicalFailure),
  incidentProcessCancellation: bool,
  continuationFailure: members("ContinuationFailure", ContinuationFailure),
  conditionOrder: members("ConditionOrder", ConditionOrder),
  messageCorrelation: members("MessageCorrelation", MessageCorrelation),
  deliveryVariables: members("DeliveryVariables", DeliveryVariables),
  multiInstanceFinalBody: members("MultiInstanceFinalBody", MultiInstanceFinalBody),
  multiInstanceOutputs: members("MultiInstanceOutputs", MultiInstanceOutputs),
  compensationOrder: members("CompensationOrder", CompensationOrder),
  compensationHandlerFailure,
  abnormalScopeEnd: members("AbnormalScopeEnd", AbnormalScopeEnd),
  unhandledError: members("UnhandledError", UnhandledError),
  callBindingTime: members("CallBindingTime", CallBindingTime),
  timerZone: option(string),
});

const program = struct<Program>("Program", {
  identity: struct("ProgramIdentity", { processId: string, sourceSha256: string, profile: string }),
  options: profileOptions,
  elements: list(element),
  flows: list(flow),
  variables: list(string),
  processes: list(struct("CalledProcess", { definition: definitionRef, children: list(string), variables: list(string) })),
});

/** A kernel IL program, strictly (`Kernel.Codec.programFromJson`). */
export function decodeProgram(json: unknown): Decoded<Program> {
  return strictly(program.decode, program.encode, json);
}

export function encodeProgram(value: Program): JsonValue {
  return program.encode(value);
}

/** Lean's derived `ToJson Expression`, which the definition capabilities publish for a correlation criterion. */
export function encodeExpression(value: Expression): JsonValue {
  return expression.encode(value);
}

export function decodeValue(json: unknown): Decoded<Value> {
  return valueCodec.decode(json);
}

export function encodeValue(value: Value): JsonValue {
  return valueCodec.encode(value);
}

// Scenario stimuli and bindings, as `Kernel.Codec` reads and writes them.

/** `[{name, value}]`, the scenario contract's variable bindings. */
export function bindingsFromJson(json: unknown): Decoded<readonly Binding[]> {
  return entriesFromJson(json);
}

export function bindingsToJson(bindings: readonly Binding[]): JsonValue {
  return bindings.map(entryToJson);
}

/*
 * Strict decoding (`Kernel.Codec`): a codec input is accepted only when its text repeats no key and its JSON is exactly
 * the canonical encoding of the value it decodes to; every refusal begins with one of these stable codes.
 */

export enum CodecRefusalCode {
  DuplicateField = "codec.duplicateField",
  UnknownField = "codec.unknownField",
  MissingField = "codec.missingField",
  Malformed = "codec.malformed",
}

/** Prefix a refusal that carries no code with `codec.malformed`. */
export function coded(refusal: string): string {
  return refusal.startsWith("codec.") ? refusal : `${CodecRefusalCode.Malformed}: ${refusal}`;
}

/** Object members in `text`: each member has the one `:` outside a string. */
function textMembers(text: string): number {
  let count = 0;
  let inString = false;
  let escaped = false;
  for (const char of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else inString = char !== '"';
    } else if (char === '"') inString = true;
    else if (char === ":") count += 1;
  }
  return count;
}

function jsonMembers(json: unknown): number {
  if (Array.isArray(json)) return json.reduce((count: number, item: unknown) => count + jsonMembers(item), 0);
  if (!isObject(json)) return 0;
  return Object.values(json).reduce((count: number, value) => count + jsonMembers(value), Object.keys(json).length);
}

/** `JSON.parse`, refusing a text whose objects repeat a key: parsing keeps one member per key, so the text then has
 * more members than the parsed JSON. */
export function parseStrict(text: string): Decoded<unknown> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return refuse(coded(error instanceof Error ? error.message : String(error)));
  }
  return textMembers(text) === jsonMembers(json) ? accept(json) : refuse(`${CodecRefusalCode.DuplicateField}: an object repeats a key`);
}

const sortedKeys = (json: Readonly<Record<string, unknown>>): string[] => Object.keys(json).sort(compareStrings);

/** The first place `input` departs from the key structure of `canonical`, in key order, else `null`. */
export function shapeRefusal(path: string, input: unknown, canonical: unknown): string | null {
  if (isObject(input) && isObject(canonical)) {
    const given = sortedKeys(input);
    const expected = sortedKeys(canonical);
    const unknown = given.find((key) => !Object.hasOwn(canonical, key));
    if (unknown !== undefined) return `${CodecRefusalCode.UnknownField}: ${path}.${unknown}`;
    const missing = expected.find((key) => !Object.hasOwn(input, key));
    if (missing !== undefined) return `${CodecRefusalCode.MissingField}: ${path}.${missing}`;
    for (const key of expected) {
      const refusal = shapeRefusal(`${path}.${key}`, input[key], canonical[key]);
      if (refusal !== null) return refusal;
    }
    return null;
  }
  if (Array.isArray(input) && Array.isArray(canonical)) {
    for (let index = 0; index < Math.min(input.length, canonical.length); index += 1) {
      const refusal = shapeRefusal(`${path}[${index}]`, input[index], canonical[index]);
      if (refusal !== null) return refusal;
    }
    return null;
  }
  return isObject(input) ? `${CodecRefusalCode.Malformed}: ${path} is an object` : null;
}

/** Decode `json` through `decode` and accept it only in the canonical encoding `encode` gives. */
export function strictly<T>(decode: (json: unknown) => Decoded<T>, encode: (value: T) => JsonValue, json: unknown): Decoded<T> {
  const decoded = decode(json);
  if (!decoded.ok) return refuse(coded(decoded.refusal));
  const refusal = shapeRefusal("$", json, encode(decoded.value));
  return refusal === null ? decoded : refuse(refusal);
}
