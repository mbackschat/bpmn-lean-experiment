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
  CalledElementResolution,
  CollectionRead,
  CompensationHandlerFailureTag,
  CompensationOrder,
  ConditionOrder,
  ConditionalStart,
  ContinuationFailure,
  CycleDialect,
  DecisionResultMapping,
  DeliveryVariables,
  ElementTag,
  ErrorCatchVariables,
  ErrorPathOutputs,
  Evaluator,
  EventGatewayInstantiation,
  EventRoleTag,
  ExpressionTag,
  GatewayKindTag,
  InstanceCountTag,
  MappingDialect,
  MessageCorrelation,
  MultiInstanceBinding,
  MultiInstanceCount,
  BusinessRuleTask,
  InclusiveJoinReach,
  BranchSchedule,
  ConditionalRetrigger,
  MalformedTimer,
  MessageNames,
  MessageThrowForms,
  ScopeStart,
  SignalDelivery,
  SignalNames,
  SignalPayload,
  MultiInstanceCounters,
  MultiInstanceInputFailure,
  MultiInstanceFinalBody,
  MultiInstanceMode,
  MultiInstanceOutputs,
  Placement,
  RaisedCallOutputs,
  ResultValues,
  OutputContext,
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
  type QName,
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
import {
  JuelBinary, JuelCallTag, JuelMethod, JuelNodeTag, JuelUnary, type JuelBinaryNode, type JuelCall, type JuelCallNode,
  type JuelChoiceNode, type JuelComputedCallNode, type JuelFunctionNode, type JuelNode,
} from "./types/juel.js";
import type { Binding } from "../state.js";
import { decisionResource } from "./codec/decision.js";
import {
  accept, bool, entriesFromJson, entryToJson, inductive, isObject, list, mapDecoded, members, nat, nullary, objVal, objValD,
  option, pair, refuseDecoding, string, struct, valueCodec, type Codec, type Decoded, type JsonValue,
} from "./codec/value.js";
export { accept, isObject, mapDecoded, nat, objVal, objValD, refuseDecoding, string, valueCodec, type Decoded, type JsonValue };

// The kernel IL, in `Kernel.IL.Types` declaration order.

const simpleBoolean = inductive<SimpleBoolean>("SimpleBoolean", {
  [SimpleBooleanTag.Literal]: { value: bool },
  [SimpleBooleanTag.IsPresent]: { name: string },
  [SimpleBooleanTag.IsNull]: { name: string },
  [SimpleBooleanTag.StringEquals]: { name: string, value: string },
});

const juelMethod = members("JuelMethod", JuelMethod);

/**
 * `Kernel.Codec`'s hand-written `JuelCall` instances: a call target travels as the Java method name the reader read,
 * looked up among the listed methods, whose wire names are the Java names; any other name stays `other`.
 */
const juelCall: Codec<JuelCall> = {
  decode: (json) => {
    const listed = juelMethod.decode(json);
    if (listed.ok) return accept({ tag: JuelCallTag.Listed, method: listed.value });
    const name = string.decode(json);
    return name.ok ? accept({ tag: JuelCallTag.Other, name: name.value }) : refuseDecoding(`JuelCall: ${name.refusal}`);
  },
  encode: (call) => {
    switch (call.tag) {
      case JuelCallTag.Listed:
        return call.method;
      case JuelCallTag.Other:
        return call.name;
    }
    return assertNever(call);
  },
};

const juelNode = inductive<JuelNode>("JuelNode", {
  [JuelNodeTag.Text]: { value: string },
  [JuelNodeTag.Composite]: { parts: list(nat) },
  [JuelNodeTag.Null]: {},
  [JuelNodeTag.Bool]: { value: bool },
  [JuelNodeTag.Integer]: { digits: string },
  [JuelNodeTag.Float]: { lexeme: string },
  [JuelNodeTag.StringLiteral]: { value: string },
  [JuelNodeTag.Identifier]: { name: string },
  [JuelNodeTag.Function]: {
    payload: struct<JuelFunctionNode>("JuelFunctionNode", { qualifier: option(string), name: string, args: list(nat) }),
  },
  [JuelNodeTag.Dot]: { base: nat, property: string },
  [JuelNodeTag.Bracket]: { base: nat, property: nat },
  [JuelNodeTag.Call]: { payload: struct<JuelCallNode>("JuelCallNode", { receiver: nat, target: juelCall, args: list(nat) }) },
  [JuelNodeTag.ComputedCall]: {
    payload: struct<JuelComputedCallNode>("JuelComputedCallNode", { receiver: nat, name: nat, args: list(nat) }),
  },
  [JuelNodeTag.Unary]: { op: members("JuelUnary", JuelUnary), operand: nat },
  [JuelNodeTag.Binary]: {
    payload: struct<JuelBinaryNode>("JuelBinaryNode", { op: members("JuelBinary", JuelBinary), left: nat, right: nat }),
  },
  [JuelNodeTag.Choice]: {
    payload: struct<JuelChoiceNode>("JuelChoiceNode", { condition: nat, whenTrue: nat, whenFalse: nat }),
  },
});

const expression = inductive<Expression>("Expression", {
  [ExpressionTag.Literal]: { value: valueCodec },
  [ExpressionTag.SimpleBoolean]: { body: simpleBoolean },
  [ExpressionTag.Variable]: { name: string },
  [ExpressionTag.Juel]: { nodes: list(juelNode) },
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
  messageRef: option(string),
  name: option(valueSource),
  correlation: list(correlationCriterion),
  interfaceRef: option(string),
  operationRef: option(string),
});

const qName = struct<QName>("QName", { namespace: option(string), localName: string });

const trigger = inductive<Trigger>("Trigger", {
  [TriggerTag.Timer]: { payload: struct("TimerTrigger", { schedule: timerSchedule }) },
  [TriggerTag.Message]: { payload: messageTrigger },
  [TriggerTag.Signal]: { payload: struct("SignalTrigger", { signalRef: option(qName), name: option(valueSource) }) },
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

const subscription = struct<Subscription>("Subscription", {
  trigger,
  outputs: list(mapping),
  alternatives: list(trigger),
  parallelMultiple: bool,
});

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
      signalRef: option(qName),
      name: option(valueSource),
      payload: list(mapping),
      propagateAll: option(nat),
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
  [WorkTag.Receive]: { payload: struct("ReceiveWork", { message: messageTrigger, instantiate: bool }) },
  [WorkTag.Service]: { payload: struct("ServiceWork", { protocol: string, operation: string, handlerKey: option(string) }) },
  [WorkTag.Send]: {
    payload: struct("SendWork", {
      binding: effectBinding,
      handlerKey: option(string),
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
      tenant: option(valueSource),
    }),
  },
  [WorkTag.Call]: {
    payload: struct("CallWork", {
      calledElement: valueSource,
      calledQName: option(qName),
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
    [InstanceCountTag.CountAndCollection]: { count: expression, items: expression },
  }),
  elementVariable: option(string),
  completionCondition: option(expression),
  inputDataItem: option(string),
  outputDataItem: option(string),
  outputCollection: option(string),
  mutableCollection: members("CollectionRead", CollectionRead),
  asyncBefore: bool,
  asyncAfter: bool,
  loopDataInputRef: option(string),
  inputDataItemName: option(string),
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
  [GatewayKindTag.EventBased]: { instantiation: members("EventGatewayInstantiation", EventGatewayInstantiation) },
});

const definitionRef = struct<DefinitionRef>("DefinitionRef", {
  key: string,
  namespace: option(string),
  version: option(nat),
  versionTag: option(string),
  deployment: option(nat),
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
      alternativeThrows: list(throwRecord),
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
  raisedCallOutputs: members("RaisedCallOutputs", RaisedCallOutputs),
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
  errorCatchVariables: members("ErrorCatchVariables", ErrorCatchVariables),
  callBindingTime: members("CallBindingTime", CallBindingTime),
  timerZone: option(string),
  multiInstanceBinding: members("MultiInstanceBinding", MultiInstanceBinding),
  effectResultValues: members("ResultValues", ResultValues),
  outputContext: members("OutputContext", OutputContext),
  multiInstanceCounters: members("MultiInstanceCounters", MultiInstanceCounters),
  multiInstanceInputFailure: members("MultiInstanceInputFailure", MultiInstanceInputFailure),
  multiInstanceCount: members("MultiInstanceCount", MultiInstanceCount),
  businessRuleTask: members("BusinessRuleTask", BusinessRuleTask),
  inclusiveJoinReach: members("InclusiveJoinReach", InclusiveJoinReach),
  branchSchedule: members("BranchSchedule", BranchSchedule),
  conditionalRetrigger: members("ConditionalRetrigger", ConditionalRetrigger),
  malformedTimer: members("MalformedTimer", MalformedTimer),
  messageNames: members("MessageNames", MessageNames),
  scopeStart: members("ScopeStart", ScopeStart),
  signalNames: members("SignalNames", SignalNames),
  signalPayload: members("SignalPayload", SignalPayload),
  signalDelivery: members("SignalDelivery", SignalDelivery),
  conditionalStart: members("ConditionalStart", ConditionalStart),
  calledElementResolution: members("CalledElementResolution", CalledElementResolution),
  messageThrowForms: members("MessageThrowForms", MessageThrowForms),
});

const program = struct<Program>("Program", {
  identity: struct("ProgramIdentity", {
    processId: string, namespace: option(string), sourceSha256: string, profile: string, deployment: option(nat),
  }),
  options: profileOptions,
  elements: list(element),
  flows: list(flow),
  variables: list(string),
  processes: list(struct("CalledProcess", {
    definition: definitionRef,
    children: list(string),
    variables: list(string),
    executable: bool,
  })),
  executable: bool,
  decisionResources: list(decisionResource),
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
    return refuseDecoding(coded(error instanceof Error ? error.message : String(error)));
  }
  return textMembers(text) === jsonMembers(json) ? accept(json) : refuseDecoding(`${CodecRefusalCode.DuplicateField}: an object repeats a key`);
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
  if (!decoded.ok) return refuseDecoding(coded(decoded.refusal));
  const refusal = shapeRefusal("$", json, encode(decoded.value));
  return refusal === null ? decoded : refuseDecoding(refusal);
}
