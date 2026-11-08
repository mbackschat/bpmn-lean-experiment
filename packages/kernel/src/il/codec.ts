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
  CallBindingTag,
  CycleDialect,
  ElementTag,
  EventRoleTag,
  ExpressionTag,
  GatewayKindTag,
  InstanceCountTag,
  MultiInstanceMode,
  Placement,
  ScopeKindTag,
  SimpleBooleanTag,
  ThrowTag,
  TimerScheduleTag,
  TriggerTag,
  ValueSourceTag,
  ValueTag,
  WorkTag,
  assertNever,
  type Element,
  type Expression,
  type Program,
  type Value,
} from "./types.js";
import {
  CommandActionTag,
  FailureTag,
  InputTag,
  type Binding,
  type Failure,
  type Input,
} from "../state.js";

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

function accept<T>(value: T): Decoded<T> {
  return { ok: true, value };
}

function refuse<T>(refusal: string): Decoded<T> {
  return { ok: false, refusal };
}

function isObject(json: unknown): json is Readonly<Record<string, unknown>> {
  return typeof json === "object" && json !== null && !Array.isArray(json);
}

/** Lean's `Json.getObjVal?`: the key must be present. */
function objVal(json: unknown, key: string): Decoded<unknown> {
  if (!isObject(json)) {
    return refuse("object expected");
  }
  return Object.hasOwn(json, key) ? accept(json[key]) : refuse(`property not found: ${key}`);
}

/** Lean's `Json.getObjValD`: an absent key, or a non-object, reads as `null`. */
function objValD(json: unknown, key: string): unknown {
  return isObject(json) && Object.hasOwn(json, key) ? json[key] : null;
}

/** Lean's `Json.getTag?`: a string, or the only key of an object. */
function tagOf(json: unknown): string | null {
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

const string: Codec<string> = {
  decode: (json) => (typeof json === "string" ? accept(json) : refuse("String expected")),
  encode: (value) => value,
};

const bool: Codec<boolean> = {
  decode: (json) => (typeof json === "boolean" ? accept(json) : refuse("Bool expected")),
  encode: (value) => value,
};

const nat: Codec<number> = {
  decode: (json) =>
    typeof json === "number" && Number.isSafeInteger(json) && json >= 0
      ? accept(json)
      : refuse("Natural number expected"),
  encode: (value) => value,
};

const int: Codec<number> = {
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

function entriesFromJson(json: unknown): Decoded<readonly Binding[]> {
  return list<Binding>({ decode: entryFromJson, encode: entryToJson }).decode(json);
}

function entryToJson(entry: Binding): JsonValue {
  return { name: entry[0], value: valueCodec.encode(entry[1]) };
}

function mapDecoded<A, B>(decoded: Decoded<A>, wrap: (value: A) => B): Decoded<B> {
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

const valueCodec: Codec<Value> = {
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

const simpleBoolean = inductive<import("./types.js").SimpleBoolean>("SimpleBoolean", {
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

const valueSource = inductive<import("./types.js").ValueSource>("ValueSource", {
  [ValueSourceTag.Literal]: { value: string },
  [ValueSourceTag.Expression]: { body: expression },
});

const mapping = struct<import("./types.js").Mapping>("Mapping", { target: string, source: expression });

const cycleDialect = nullary<CycleDialect>("CycleDialect", {
  [CycleDialect.Iso8601]: CycleDialect.Iso8601,
  [CycleDialect.Cron]: CycleDialect.Cron,
});

const timerSchedule = inductive<import("./types.js").TimerSchedule>("TimerSchedule", {
  [TimerScheduleTag.Duration]: { value: valueSource },
  [TimerScheduleTag.Date]: { value: valueSource },
  [TimerScheduleTag.Cycle]: { value: valueSource, dialect: cycleDialect },
});

const correlationCriterion = struct<import("./types.js").CorrelationCriterion>("CorrelationCriterion", {
  key: string,
  value: expression,
});

const messageTrigger = struct<import("./types.js").MessageTrigger>("MessageTrigger", {
  name: valueSource,
  correlation: list(correlationCriterion),
});

const trigger = inductive<import("./types.js").Trigger>("Trigger", {
  [TriggerTag.Timer]: { payload: struct("TimerTrigger", { schedule: timerSchedule }) },
  [TriggerTag.Message]: { payload: messageTrigger },
  [TriggerTag.Signal]: { payload: struct("SignalTrigger", { name: valueSource }) },
  [TriggerTag.Condition]: {
    payload: struct("ConditionTrigger", {
      condition: expression,
      variableName: option(string),
      variableEvents: list(string),
    }),
  },
  [TriggerTag.Error]: {
    payload: struct("ErrorTrigger", {
      code: option(string),
      codeVariable: option(string),
      messageVariable: option(string),
    }),
  },
  [TriggerTag.Escalation]: {
    payload: struct("EscalationTrigger", { code: option(string), codeVariable: option(string) }),
  },
  [TriggerTag.Compensation]: {},
  [TriggerTag.Cancel]: {},
});

const subscription = struct<import("./types.js").Subscription>("Subscription", {
  trigger,
  outputs: list(mapping),
});

const boundary = struct<import("./types.js").Boundary>("Boundary", {
  id: string,
  subscription,
  interrupting: bool,
  outgoing: list(string),
});

const throwRecord = inductive<import("./types.js").Throw>("Throw", {
  [ThrowTag.None]: {},
  [ThrowTag.Message]: { payload: struct("MessageThrow", { binding: string, payload: list(mapping) }) },
  [ThrowTag.Signal]: { payload: struct("SignalThrow", { name: valueSource, payload: list(mapping) }) },
  [ThrowTag.Error]: { payload: struct("ErrorThrow", { code: string, message: option(string) }) },
  [ThrowTag.Escalation]: { payload: struct("EscalationThrow", { code: string }) },
  [ThrowTag.Compensation]: {
    payload: struct("CompensationThrow", { activity: option(string), waitForCompletion: bool }),
  },
  [ThrowTag.Cancel]: {},
  [ThrowTag.Terminate]: {},
});

const callBinding = inductive<import("./types.js").CallBinding>("CallBinding", {
  [CallBindingTag.Latest]: {},
  [CallBindingTag.Deployment]: {},
  [CallBindingTag.Version]: { value: valueSource },
  [CallBindingTag.VersionTag]: { value: valueSource },
});

const work = inductive<import("./types.js").Work>("Work", {
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
  [WorkTag.Receive]: { payload: struct("ReceiveWork", { message: option(messageTrigger) }) },
  [WorkTag.Service]: { payload: struct("ServiceWork", { protocol: string, operation: string }) },
  [WorkTag.Send]: {
    payload: struct("SendWork", {
      binding: string,
      recipient: option(valueSource),
      correlation: list(correlationCriterion),
    }),
  },
  [WorkTag.Script]: {
    payload: struct("ScriptWork", { format: string, source: string, resultVariable: option(string) }),
  },
  [WorkTag.Rule]: { payload: struct("RuleWork", { decision: valueSource, resultVariable: option(string) }) },
  [WorkTag.Call]: {
    payload: struct("CallWork", {
      calledElement: valueSource,
      binding: callBinding,
      businessKey: option(expression),
      inputs: list(mapping),
      outputs: list(mapping),
      propagateAllInputs: bool,
      propagateAllOutputs: bool,
    }),
  },
});

const multiInstance = struct<import("./types.js").MultiInstance>("MultiInstance", {
  mode: nullary<MultiInstanceMode>("MultiInstanceMode", {
    [MultiInstanceMode.Sequential]: MultiInstanceMode.Sequential,
    [MultiInstanceMode.Parallel]: MultiInstanceMode.Parallel,
  }),
  count: inductive<import("./types.js").InstanceCount>("InstanceCount", {
    [InstanceCountTag.Collection]: { items: expression },
    [InstanceCountTag.Cardinality]: { count: expression },
  }),
  elementVariable: option(string),
  completionCondition: option(expression),
  inputDataItem: option(string),
  outputDataItem: option(string),
  outputCollection: option(string),
  mutableCollection: bool,
});

const envelope = struct<import("./types.js").Envelope>("Envelope", {
  incoming: list(string),
  outgoing: list(string),
  inputs: list(mapping),
  outputs: list(mapping),
  boundaries: list(boundary),
  multiInstance: option(multiInstance),
  compensationHandler: option(string),
});

const scopeKind = inductive<import("./types.js").ScopeKind>("ScopeKind", {
  [ScopeKindTag.Embedded]: {},
  [ScopeKindTag.Transaction]: {},
  [ScopeKindTag.EventSubProcess]: { start: subscription, interrupting: bool },
});

const eventRole = inductive<import("./types.js").EventRole>("EventRole", {
  [EventRoleTag.Catch]: { subscription },
  [EventRoleTag.Throw]: { record: throwRecord },
  [EventRoleTag.LinkCatch]: { name: string },
  [EventRoleTag.LinkThrow]: { name: string },
});

const conditionalFlow = struct<import("./types.js").ConditionalFlow>("ConditionalFlow", {
  flow: string,
  condition: option(expression),
});

const gatewayKind = inductive<import("./types.js").GatewayKind>("GatewayKind", {
  [GatewayKindTag.Exclusive]: { candidates: list(conditionalFlow), default: option(string) },
  [GatewayKindTag.Parallel]: {},
  [GatewayKindTag.Inclusive]: { candidates: list(conditionalFlow), default: option(string) },
  [GatewayKindTag.EventBased]: { arms: list(struct("EventArm", { target: string })) },
});

const header = struct<import("./types.js").Header>("Header", {
  id: string,
  sourceType: string,
  parent: option(string),
});

const element = inductive<Element>("Element", {
  [ElementTag.Activity]: {
    header,
    payload: struct("ActivityPayload", { work, envelope }),
  },
  [ElementTag.Scope]: {
    header,
    payload: struct("ScopePayload", {
      kind: scopeKind,
      children: list(string),
      localVariables: list(string),
      envelope,
    }),
  },
  [ElementTag.Event]: {
    header,
    payload: struct("EventPayload", {
      role: eventRole,
      placement: nullary<Placement>("Placement", {
        [Placement.Intermediate]: Placement.Intermediate,
        [Placement.Finish]: Placement.Finish,
      }),
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

const program = struct<Program>("Program", {
  identity: struct("ProgramIdentity", { processId: string, sourceSha256: string, profile: string }),
  elements: list(element),
  flows: list(struct("Flow", { id: string, source: string, target: string })),
});

export function decodeProgram(json: unknown): Decoded<Program> {
  return program.decode(json);
}

export function encodeProgram(value: Program): JsonValue {
  return program.encode(value);
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

/** `json[key]` when present, else an empty binding list: `(json.getObjVal? key).toOption.getD (Json.arr #[])`. */
function bindingsOrEmpty(json: unknown, key: string): Decoded<readonly Binding[]> {
  const raw = objVal(json, key);
  return bindingsFromJson(raw.ok ? raw.value : []);
}

const stimulusKinds: ReadonlyMap<string, (json: unknown) => Decoded<Input>> = new Map([
  [
    "startProcess",
    (json: unknown): Decoded<Input> => {
      const instanceId = string.decode(objValD(json, "instanceId"));
      if (!instanceId.ok) {
        return instanceId;
      }
      return mapDecoded(bindingsOrEmpty(json, "initialVariables"), (variables) => ({
        tag: InputTag.Start,
        payload: { instanceId: instanceId.value, startEvent: null, variables },
      }));
    },
  ],
  [
    "completeUserTaskInstance",
    (json: unknown): Decoded<Input> => {
      const task = objVal(json, "taskId");
      if (!task.ok) {
        return task;
      }
      const element = string.decode(objValD(task.value, "elementId"));
      if (!element.ok) {
        return element;
      }
      const activation = nat.decode(objValD(task.value, "activation"));
      if (!activation.ok) {
        return activation;
      }
      return mapDecoded(bindingsOrEmpty(json, "submittedValues"), (values) => ({
        tag: InputTag.Command,
        payload: {
          occurrence: { element: element.value, activation: activation.value },
          action: { tag: CommandActionTag.CompleteUserTask, values },
        },
      }));
    },
  ],
]);

/**
 * One scenario stimulus: its command identifier and the kernel input, or `null` for a stimulus kind the kernel
 * does not accept yet.
 */
export function stimulusFromJson(json: unknown): Decoded<readonly [string, Input | null]> {
  const commandId = string.decode(objValD(json, "commandId"));
  if (!commandId.ok) {
    return commandId;
  }
  const kind = string.decode(objValD(json, "kind"));
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
    case FailureTag.SemanticFailure:
      return "semanticFailure";
    case FailureTag.Unsupported:
      return "unsupported";
  }
  return assertNever(failure.tag);
}
