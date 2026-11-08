import { asElement } from "../moddle-graph.js";
import type { ElementRecord } from "../moddle-graph.js";
import { fixed, headerOf } from "./build.js";
import { conditionExpression, eventInputs, eventOutputs, valueSource } from "./data.js";
import { FlowElementKind, ReadRefusal, ReadRefusalCode, list, optionalId, reference, requireId, text } from "./model.js";
import type { Built, ModelNode, ReadContext } from "./model.js";
import { assertNever, ctor, foreign, literalSource, subscription, variable } from "./wire.js";
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

function kindOf(definition: ElementRecord): EventDefinitionKind {
  const type = String(definition.$type);
  if (!eventDefinitionKinds.has(type)) {
    throw new ReadRefusal(ReadRefusalCode.UnknownElement, optionalId(definition), `event definition ${type}`);
  }
  return type as EventDefinitionKind;
}

/** The single event definition of an Event, `null` for a None Event; a Multiple Event has no IL shape. */
export function singleDefinition(element: ElementRecord): ElementRecord | null {
  const definitions = [...list(element, "eventDefinitions"), ...list(element, "eventDefinitionRef")];
  if (definitions.length > 1) {
    throw new ReadRefusal(ReadRefusalCode.MultipleEventDefinitions, optionalId(element), `${definitions.length} definitions`);
  }
  return definitions[0] ?? null;
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

/** The `MessageTrigger` of a Message Event Definition or Receive Task; a Message is named by its identifier. */
export function messageTrigger(ctx: ReadContext, owner: ElementRecord, event: ElementRecord): KernelJson {
  const message = reference(owner, "messageRef", "bpmn:Message");
  const operation = reference(owner, "operationRef", "bpmn:Operation");
  return {
    name: message === null ? null : literalSource(requireId(message)),
    correlation: correlationCriteria(ctx, event, requireId(event)),
    interfaceRef: operation === null ? null : optionalId(asElement(operation.$parent) ?? {}),
    operationRef: operation === null ? null : requireId(operation),
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
      return ctor("signal", { payload: { name: signalName(definition) } });
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

function signalName(definition: ElementRecord): KernelJson {
  const signal = reference(definition, "signalRef", "bpmn:Signal");
  if (signal === null) {
    throw new ReadRefusal(ReadRefusalCode.SignalWithoutReference, optionalId(definition), "signalRef absent");
  }
  return literalSource(requireId(signal));
}

function conditionPayload(ctx: ReadContext, definition: ElementRecord): KernelJson {
  const expression = asElement(definition.condition);
  if (expression === undefined) {
    throw new ReadRefusal(ReadRefusalCode.ConditionWithoutExpression, optionalId(definition), "conditional Event without a condition");
  }
  const events = ctx.attribute(definition, "variableEvents");
  return {
    condition: conditionExpression(ctx, expression),
    variableName: ctx.attribute(definition, "variableName"),
    variableEvents: events === null ? [] : events.split(",").map((entry) => entry.trim()),
  };
}

function requireCode(event: ElementRecord, code: string | null): string {
  if (code === null) throw new ReadRefusal(ReadRefusalCode.ThrowWithoutCode, optionalId(event), "no code to throw");
  return code;
}

function readThrow(ctx: ReadContext, event: ElementRecord, definition: ElementRecord): KernelJson {
  const kind = kindOf(definition);
  switch (kind) {
    case EventDefinitionKind.Message: {
      const message = reference(definition, "messageRef", "bpmn:Message");
      return ctor("message", { payload: { binding: message === null ? "" : requireId(message), payload: eventInputs(ctx, event) } });
    }
    case EventDefinitionKind.Signal:
      return ctor("signal", { payload: { name: signalName(definition), payload: eventInputs(ctx, event) } });
    case EventDefinitionKind.Error: {
      const error = reference(definition, "errorRef", "bpmn:Error");
      return ctor("error", { payload: {
        code: requireCode(event, error === null ? null : text(error, "errorCode")),
        message: error === null ? null : ctx.attribute(error, "errorMessage"),
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

function eventElement(ctx: ReadContext, node: ModelNode, sourceType: string, role: KernelJson, placement: string): Built {
  const id = requireId(node.element);
  return fixed(id, ctor("event", {
    header: headerOf(node, sourceType),
    payload: { role, placement, incoming: ctx.incoming(id), outgoing: ctx.outgoing(id) },
  }));
}

/** The subscription of a triggered start, shared by its Start element and an Event Sub-Process's kind. */
export function startSubscription(ctx: ReadContext, event: ElementRecord): KernelJson | null {
  const definition = singleDefinition(event);
  return definition === null ? null : subscription(readTrigger(ctx, event, definition), eventOutputs(ctx, event));
}

function readStart(ctx: ReadContext, node: ModelNode): Built {
  const id = requireId(node.element);
  return fixed(id, ctor("start", {
    header: headerOf(node, FlowElementKind.StartEvent),
    payload: { subscription: startSubscription(ctx, node.element), outgoing: ctx.outgoing(id) },
  }));
}

function readEnd(ctx: ReadContext, node: ModelNode): Built {
  const definition = singleDefinition(node.element);
  const record = definition === null ? "none" : readThrow(ctx, node.element, definition);
  return eventElement(ctx, node, FlowElementKind.EndEvent, ctor("throw", { record }), "finish");
}

const linkName = (definition: ElementRecord): string => text(definition, "name") ?? "";

function readCatch(ctx: ReadContext, node: ModelNode): Built {
  const definition = singleDefinition(node.element);
  if (definition === null) {
    throw new ReadRefusal(ReadRefusalCode.EventDefinitionOnElement, optionalId(node.element), "catch Event without a definition");
  }
  const role = definition.$type === EventDefinitionKind.Link
    ? ctor("linkCatch", { name: linkName(definition) })
    : ctor("catch", { subscription: subscription(readTrigger(ctx, node.element, definition), eventOutputs(ctx, node.element)) });
  return eventElement(ctx, node, FlowElementKind.IntermediateCatchEvent, role, "intermediate");
}

function readIntermediateThrow(ctx: ReadContext, node: ModelNode): Built {
  const definition = singleDefinition(node.element);
  const role = definition?.$type === EventDefinitionKind.Link
    ? ctor("linkThrow", { name: linkName(definition) })
    : ctor("throw", { record: definition === null ? "none" : readThrow(ctx, node.element, definition) });
  return eventElement(ctx, node, FlowElementKind.IntermediateThrowEvent, role, "intermediate");
}

function readBoundary(ctx: ReadContext, node: ModelNode): Built {
  const id = requireId(node.element);
  const definition = singleDefinition(node.element);
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
      subscription: subscription(readTrigger(ctx, node.element, definition), eventOutputs(ctx, node.element)),
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
