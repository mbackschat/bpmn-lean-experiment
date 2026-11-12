import { asElement } from "../moddle-graph.js";
import type { ElementRecord } from "../moddle-graph.js";
import { fixed, headerOf } from "./build.js";
import { declaredImplementation, effectBinding, handlerKey } from "./binding.js";
import { conditionExpression, eventInputs, eventOutputs, itemDefinitionId, valueSource, variableCopies } from "./data.js";
import { FlowElementKind, ReadRefusal, ReadRefusalCode, list, optionalId, reference, requireId, targetNamespaceOf, text } from "./model.js";
import type { Built, ModelNode, ReadContext } from "./model.js";
import { assertNever, ctor, foreign, subscription, variable } from "./wire.js";
import type { KernelJson } from "./wire.js";

const correlationPathLanguage = "urn:bpmn-lean:correlation-scalar-path:v1";

enum EventDefinitionKind {
  Message = "bpmn:MessageEventDefinition",
  Timer = "bpmn:TimerEventDefinition",
  Signal = "bpmn:SignalEventDefinition",
  Conditional = "bpmn:ConditionalEventDefinition",
  Error = "bpmn:ErrorEventDefinition",
  Escalation = "bpmn:EscalationEventDefinition",
  Compensate = "bpmn:CompensateEventDefinition",
  Cancel = "bpmn:CancelEventDefinition",
  Terminate = "bpmn:TerminateEventDefinition",
  Link = "bpmn:LinkEventDefinition",
}

const eventDefinitionKinds: ReadonlySet<string> = new Set(Object.values(EventDefinitionKind));

/** A root-level EventDefinition acts only through an Event's `eventDefinitionRef`, which the reader refuses. */
export const isEventDefinition = (element: ElementRecord): boolean => eventDefinitionKinds.has(String(element.$type));

function kindOf(definition: ElementRecord): EventDefinitionKind {
  const type = String(definition.$type);
  if (!eventDefinitionKinds.has(type)) {
    throw new ReadRefusal(ReadRefusalCode.UnknownElement, optionalId(definition), `event definition ${type}`);
  }
  return type as EventDefinitionKind;
}

/** The first event definition of an Event, `null` for a None Event. */
export function firstDefinition(element: ElementRecord): ElementRecord | null {
  return list(element, "eventDefinitions")[0] ?? null;
}

/**
 * A Multiple Event's definitions after the first, in document order (BPMN 2.0.2 §10.5.1), each read as it would be
 * alone; admission refuses them (`event.multipleDefinitions`). A Link never joins one: §10.5.1 lists no Multiple Link.
 */
function laterDefinitions(event: ElementRecord, first: ElementRecord): ReadonlyArray<ElementRecord> {
  const later = list(event, "eventDefinitions").slice(1);
  if (later.length > 0 && [first, ...later].some((definition) => definition.$type === EventDefinitionKind.Link)) {
    throw new ReadRefusal(ReadRefusalCode.EventDefinitionOnElement, optionalId(event), "a Link in a Multiple Event");
  }
  return later;
}

/** The subscription of a catching Event whose first definition is `first`, with its Multiple and Parallel Multiple marks. */
function catchSubscription(ctx: ReadContext, event: ElementRecord, first: ElementRecord): KernelJson {
  return subscription(readTrigger(ctx, event, first), eventOutputs(ctx, event),
    laterDefinitions(event, first).map((definition) => readTrigger(ctx, event, definition)), event.parallelMultiple === true);
}

export const isCompensationDefinition = (definition: ElementRecord | null): boolean =>
  definition?.$type === EventDefinitionKind.Compensate;

function enclosingProcess(element: ElementRecord): ElementRecord | null {
  let current: ElementRecord | undefined = element;
  while (current !== undefined && current.$type !== "bpmn:Process") current = asElement(current.$parent);
  return current ?? null;
}

function conversationKeys(ctx: ReadContext, ownerId: string): ReadonlyArray<ElementRecord> {
  return list(ctx.definitions, "rootElements")
    .filter((root) => root.$type === "bpmn:Collaboration")
    .flatMap((collaboration) => {
      const flows = list(collaboration, "messageFlows").filter((flow) => optionalId(asElement(flow.targetRef) ?? {}) === ownerId);
      return list(collaboration, "conversations")
        .filter((conversation) => list(conversation, "messageFlowRef").some((flow) => flows.includes(flow)))
        .flatMap((conversation) => list(conversation, "correlationKeys"));
    });
}

function bindingValue(binding: ElementRecord): KernelJson {
  const path = asElement(binding.dataPath) ?? {};
  const body = text(path, "body") ?? "";
  const language = text(path, "language") ?? "";
  return language === correlationPathLanguage && body.startsWith("property:")
    ? variable(body.slice("property:".length))
    : foreign(language, body);
}

/**
 * The criteria of the key whose Message flow reaches this element. An element that writes the Property a binding
 * reads initializes the key from the Message itself (BPMN 2.0.2 §8.4.2) and carries no criterion for that binding.
 */
function correlationCriteria(ctx: ReadContext, owner: ElementRecord, ownerId: string): KernelJson[] {
  const keys = conversationKeys(ctx, ownerId);
  if (keys.length === 0) return [];
  const written = new Set(list(owner, "dataOutputAssociations").map((association) => optionalId(asElement(association.targetRef) ?? {})));
  const subscriptions = list(enclosingProcess(owner) ?? {}, "correlationSubscriptions");
  return subscriptions.flatMap((candidate) => {
    const key = asElement(candidate.correlationKeyRef);
    if (key === undefined || !keys.includes(key)) return [];
    return list(candidate, "correlationPropertyBinding").flatMap((binding) => {
      const value = bindingValue(binding);
      const name = asElement(asElement(value)?.variable)?.name;
      return typeof name === "string" && written.has(name) ? [] : [{ key: requireId(key), value }];
    });
  });
}

/**
 * The `MessageTrigger` of a Message Event Definition or Receive Task: the Message's identifier, which addresses it, its
 * `name`, a literal or, with an expression marker, a JUEL value as CIB reads it (`BpmnParse.java:454-465`), and its
 * `itemRef` ItemDefinition's identifier.
 */
export function messageTrigger(ctx: ReadContext, owner: ElementRecord, event: ElementRecord): KernelJson {
  const message = reference(owner, "messageRef", "bpmn:Message");
  const operation = reference(owner, "operationRef", "bpmn:Operation");
  return {
    messageRef: message === null ? null : requireId(message),
    name: message === null || typeof message.name !== "string" ? null : valueSource(message.name),
    correlation: correlationCriteria(ctx, event, requireId(event)),
    interfaceRef: operation === null ? null : optionalId(asElement(operation.$parent) ?? {}),
    operationRef: operation === null ? null : requireId(operation),
    itemRef: message === null ? null : itemDefinitionId(message, "itemRef"),
  };
}

function timerSchedule(definition: ElementRecord): KernelJson {
  const duration = asElement(definition.timeDuration);
  if (duration !== undefined) return ctor("duration", { value: valueSource(text(duration, "body") ?? "") });
  const date = asElement(definition.timeDate);
  if (date !== undefined) return ctor("date", { value: valueSource(text(date, "body") ?? "") });
  const cycle = asElement(definition.timeCycle);
  if (cycle !== undefined) {
    const body = text(cycle, "body") ?? "";
    // CIB `CycleBusinessCalendar`: a cycle not starting with `R` is a cron expression.
    return ctor("cycle", { value: valueSource(body), dialect: body.startsWith("R") || /[#$]\{/u.test(body) ? "iso8601" : "cron" });
  }
  throw new ReadRefusal(ReadRefusalCode.EventDefinitionOnElement, optionalId(definition), "timer without a time");
}

function readTrigger(ctx: ReadContext, event: ElementRecord, definition: ElementRecord): KernelJson {
  const kind = kindOf(definition);
  switch (kind) {
    case EventDefinitionKind.Message:
      return ctor("message", { payload: messageTrigger(ctx, definition, event) });
    case EventDefinitionKind.Timer:
      return ctor("timer", { payload: { schedule: timerSchedule(definition) } });
    case EventDefinitionKind.Signal:
      return ctor("signal", { payload: signalAddress(ctx, definition) });
    case EventDefinitionKind.Conditional:
      return ctor("condition", { payload: conditionPayload(ctx, definition) });
    case EventDefinitionKind.Error: {
      const error = reference(definition, "errorRef", "bpmn:Error");
      return ctor("error", { payload: {
        code: error === null ? null : text(error, "errorCode"),
        codeVariable: ctx.attribute(definition, "errorCodeVariable"),
        messageVariable: ctx.attribute(definition, "errorMessageVariable"),
      } });
    }
    case EventDefinitionKind.Escalation: {
      const escalation = reference(definition, "escalationRef", "bpmn:Escalation");
      return ctor("escalation", { payload: {
        code: escalation === null ? null : text(escalation, "escalationCode"),
        codeVariable: ctx.attribute(definition, "escalationCodeVariable"),
      } });
    }
    case EventDefinitionKind.Compensate:
      return "compensation";
    case EventDefinitionKind.Cancel:
      return "cancel";
    case EventDefinitionKind.Terminate:
    case EventDefinitionKind.Link:
      throw new ReadRefusal(ReadRefusalCode.EventDefinitionOnElement, optionalId(event), `${kind} as a trigger`);
  }
  return assertNever(kind);
}

/**
 * A Signal definition's `signalRef`, the QName of a Signal these Definitions declare (Table 10.100), and that Signal's
 * descriptive `name`, a value source CIB may evaluate (PC-SIGNAL-01).
 */
function signalAddress(ctx: ReadContext, definition: ElementRecord): Record<string, KernelJson> {
  const signal = reference(definition, "signalRef", "bpmn:Signal");
  if (signal === null) {
    throw new ReadRefusal(ReadRefusalCode.SignalWithoutReference, optionalId(definition), "signalRef absent");
  }
  const name = text(signal, "name");
  return {
    signalRef: { namespace: targetNamespaceOf(ctx.definitions), localName: requireId(signal) },
    name: name === null ? null : valueSource(name),
  };
}

function conditionPayload(ctx: ReadContext, definition: ElementRecord): KernelJson {
  const expression = asElement(definition.condition);
  // `source.schema` admits no Conditional definition without the condition `tConditionalEventDefinition` requires.
  if (expression === undefined) throw new TypeError("a schema-valid Conditional definition carries a condition");
  const events = ctx.attribute(definition, "variableEvents");
  return {
    condition: conditionExpression(ctx, expression),
    variableName: ctx.attribute(definition, "variableName"),
    variableEvents: events === null ? [] : events.split(",").map((entry) => entry.trim()),
  };
}

/**
 * CIB executes a Message throw with a declared implementation as a Service Task (`BpmnParse.java:1643-1653`,
 * `3174-3184`); without one it is an unbound pass-through. `MessageThrow` carries only a `camunda:delegateExpression`
 * binding, so every other implementation, a result variable, parameters, an asynchronous continuation and listeners,
 * which CIB would run, are refused with their own codes. It has no field for the Message or Operation it names either,
 * which CIB never reads, so those are reported.
 */
function messageThrow(ctx: ReadContext, event: ElementRecord, definition: ElementRecord): KernelJson {
  const id = optionalId(event);
  const declared = declaredImplementation(ctx, definition);
  if (declared !== null && declared.name !== "delegateExpression") {
    throw new ReadRefusal(ReadRefusalCode.ThrowMessageImplementation, id, `camunda:${declared.name}`);
  }
  const refusals: ReadonlyArray<readonly [boolean, ReadRefusalCode, string]> = [
    [ctx.attribute(definition, "resultVariable") !== null, ReadRefusalCode.ThrowMessageResultVariable, "camunda:resultVariable"],
    [ctx.extensions(event, "inputOutput").length > 0, ReadRefusalCode.ThrowMessageIoMapping, "camunda:inputOutput"],
    [["async", "asyncBefore", "asyncAfter"].some((name) => ctx.attribute(event, name) !== null),
      ReadRefusalCode.ThrowMessageAsynchronous, "camunda:asyncBefore or asyncAfter"],
    [ctx.extensions(event, "executionListener").length > 0, ReadRefusalCode.ThrowMessageListener, "camunda:executionListener"],
  ];
  for (const [present, code, evidence] of refusals) if (present) throw new ReadRefusal(code, id, evidence);
  const binding = declared === null ? null : effectBinding(ctx, definition);
  const key = declared === null ? null : handlerKey(ctx, definition);
  if (reference(definition, "messageRef", "bpmn:Message") !== null) {
    ctx.noteNotCarried({ element: optionalId(event), fact: "messageRef" });
  }
  if (reference(definition, "operationRef", "bpmn:Operation") !== null) {
    ctx.noteNotCarried({ element: optionalId(event), fact: "operationRef" });
  }
  return { binding, handlerKey: key, payload: eventInputs(ctx, event) };
}

/**
 * A Signal throw's payload and propagation: its Data Associations, then the `camunda:in` copies of its definition
 * (`BpmnParse#parseSignalEventDefinition`); `camunda:async` is the asynchronous throw.
 */
function signalThrow(ctx: ReadContext, event: ElementRecord, definition: ElementRecord): KernelJson {
  const copies = variableCopies(definition, ctx.extensions(definition, "in"));
  if (copies.localCopy) ctx.noteNotCarried({ element: optionalId(definition), fact: "camunda:in local" });
  const inputs = eventInputs(ctx, event);
  return {
    ...signalAddress(ctx, definition),
    payload: [...inputs, ...copies.mappings],
    propagateAll: copies.propagateAllAt === null ? null : inputs.length + copies.propagateAllAt,
    localOnly: copies.localOnly,
    businessKey: copies.businessKey,
    asynchronous: ctx.attribute(definition, "async") === "true",
  };
}

function requireCode(event: ElementRecord, code: string | null): string {
  if (code === null) throw new ReadRefusal(ReadRefusalCode.ThrowWithoutCode, optionalId(event), "no code to throw");
  return code;
}

function readThrow(ctx: ReadContext, event: ElementRecord, definition: ElementRecord): KernelJson {
  const kind = kindOf(definition);
  switch (kind) {
    case EventDefinitionKind.Message:
      return ctor("message", { payload: messageThrow(ctx, event, definition) });
    case EventDefinitionKind.Signal:
      return ctor("signal", { payload: signalThrow(ctx, event, definition) });
    case EventDefinitionKind.Error: {
      const error = reference(definition, "errorRef", "bpmn:Error");
      const message = error === null ? null : ctx.attribute(error, "errorMessage");
      return ctor("error", { payload: {
        code: requireCode(event, error === null ? null : text(error, "errorCode")),
        message: message === null ? null : valueSource(message),
      } });
    }
    case EventDefinitionKind.Escalation: {
      const escalation = reference(definition, "escalationRef", "bpmn:Escalation");
      return ctor("escalation", { payload: { code: requireCode(event, escalation === null ? null : text(escalation, "escalationCode")) } });
    }
    case EventDefinitionKind.Compensate:
      return ctor("compensation", { payload: {
        activity: optionalId(asElement(definition.activityRef) ?? {}),
        waitForCompletion: definition.waitForCompletion !== false,
      } });
    case EventDefinitionKind.Cancel:
      return "cancel";
    case EventDefinitionKind.Terminate:
      return "terminate";
    case EventDefinitionKind.Timer:
    case EventDefinitionKind.Conditional:
    case EventDefinitionKind.Link:
      throw new ReadRefusal(ReadRefusalCode.EventDefinitionOnElement, optionalId(event), `${kind} as a throw`);
  }
  return assertNever(kind);
}

function eventElement(ctx: ReadContext, node: ModelNode, sourceType: string, role: KernelJson, placement: string,
  alternativeThrows: KernelJson[] = []): Built {
  const id = requireId(node.element);
  return fixed(id, ctor("event", {
    header: headerOf(node, sourceType),
    payload: { role, placement, incoming: ctx.incoming(id), outgoing: ctx.outgoing(id), alternativeThrows },
  }));
}

/** The subscription of a triggered start, shared by its Start element and an Event Sub-Process's kind. */
export function startSubscription(ctx: ReadContext, event: ElementRecord): KernelJson | null {
  const definition = firstDefinition(event);
  return definition === null ? null : catchSubscription(ctx, event, definition);
}

function readStart(ctx: ReadContext, node: ModelNode): Built {
  const id = requireId(node.element);
  return fixed(id, ctor("start", {
    header: headerOf(node, FlowElementKind.StartEvent),
    payload: { subscription: startSubscription(ctx, node.element), outgoing: ctx.outgoing(id) },
  }));
}

/** A throw record and, for a Multiple throw Event, the records of its later definitions. */
function throwRecords(ctx: ReadContext, event: ElementRecord, definition: ElementRecord | null): [KernelJson, KernelJson[]] {
  if (definition === null) return ["none", []];
  return [readThrow(ctx, event, definition), laterDefinitions(event, definition).map((other) => readThrow(ctx, event, other))];
}

function readEnd(ctx: ReadContext, node: ModelNode): Built {
  const [record, alternatives] = throwRecords(ctx, node.element, firstDefinition(node.element));
  return eventElement(ctx, node, FlowElementKind.EndEvent, ctor("throw", { record }), "finish", alternatives);
}

const linkName = (definition: ElementRecord): string => text(definition, "name") ?? "";

function readCatch(ctx: ReadContext, node: ModelNode): Built {
  const definition = firstDefinition(node.element);
  if (definition === null) {
    throw new ReadRefusal(ReadRefusalCode.EventDefinitionOnElement, optionalId(node.element), "catch Event without a definition");
  }
  const role = definition.$type === EventDefinitionKind.Link && laterDefinitions(node.element, definition).length === 0
    ? ctor("linkCatch", { name: linkName(definition) })
    : ctor("catch", { subscription: catchSubscription(ctx, node.element, definition) });
  return eventElement(ctx, node, FlowElementKind.IntermediateCatchEvent, role, "intermediate");
}

function readIntermediateThrow(ctx: ReadContext, node: ModelNode): Built {
  const definition = firstDefinition(node.element);
  if (definition?.$type === EventDefinitionKind.Link && laterDefinitions(node.element, definition).length === 0) {
    return eventElement(ctx, node, FlowElementKind.IntermediateThrowEvent, ctor("linkThrow", { name: linkName(definition) }), "intermediate");
  }
  const [record, alternatives] = throwRecords(ctx, node.element, definition);
  return eventElement(ctx, node, FlowElementKind.IntermediateThrowEvent, ctor("throw", { record }), "intermediate", alternatives);
}

function readBoundary(ctx: ReadContext, node: ModelNode): Built {
  const id = requireId(node.element);
  const definition = firstDefinition(node.element);
  const host = asElement(node.element.attachedToRef);
  if (definition === null || host === undefined) {
    throw new ReadRefusal(ReadRefusalCode.EventDefinitionOnElement, id, "boundary Event without a definition or host");
  }
  // BPMN 2.0.2 Table 10.86: a Compensation boundary interrupts nothing, whatever `cancelActivity` says.
  const interrupting = !isCompensationDefinition(definition) && node.element.cancelActivity !== false;
  return {
    kind: "boundary",
    attachedTo: requireId(host),
    boundary: {
      id,
      sourceId: id,
      subscription: catchSubscription(ctx, node.element, definition),
      interrupting,
      outgoing: ctx.outgoing(id),
    },
  };
}

type EventKind = FlowElementKind.StartEvent | FlowElementKind.EndEvent | FlowElementKind.IntermediateCatchEvent |
  FlowElementKind.IntermediateThrowEvent | FlowElementKind.BoundaryEvent;

export function readEvent(ctx: ReadContext, node: ModelNode, kind: EventKind): Built {
  switch (kind) {
    case FlowElementKind.StartEvent:
      return readStart(ctx, node);
    case FlowElementKind.EndEvent:
      return readEnd(ctx, node);
    case FlowElementKind.IntermediateCatchEvent:
      return readCatch(ctx, node);
    case FlowElementKind.IntermediateThrowEvent:
      return readIntermediateThrow(ctx, node);
    case FlowElementKind.BoundaryEvent:
      return readBoundary(ctx, node);
  }
  return assertNever(kind);
}
