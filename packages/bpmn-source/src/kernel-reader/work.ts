import { asElement, asElementArray } from "../moddle-graph.js";
import type { ElementRecord } from "../moddle-graph.js";
import { envelopeFor, headerOf } from "./build.js";
import { associationInputs, associationOutputs, associationSourceId, associationTargetId, inputOutputParameters, valueExpression, valueSource } from "./data.js";
import { messageTrigger } from "./events.js";
import { FlowElementKind, ReadRefusal, ReadRefusalCode, extensionValues, list, optionalId, requireId, text } from "./model.js";
import type { Built, EffectBinding, ModelNode, ReadContext } from "./model.js";
import { readMultiInstance } from "./multi-instance.js";
import { assertNever, ctor, literalSource, mapping, variable } from "./wire.js";
import type { KernelJson } from "./wire.js";

const activityProtocol = "urn:bpmn-lean:effect-protocol:activity-v1";
const operation = (name: string): string => `urn:bpmn-lean:effect-operation:${name}-v1`;

/** The project's own effect implementations, by the source attributes that select them. */
const builtInBindings: ReadonlyArray<EffectBinding> = [
  { implementation: "urn:bpmn-lean:effect:probe-v1", delegateExpression: "${bpmnLeanEffectHandler}", protocol: activityProtocol, operation: operation("probe") },
  { implementation: null, delegateExpression: "${mappedSuccessHandler}", protocol: activityProtocol, operation: operation("mapped-success") },
  { implementation: "urn:bpmn-lean:effect-binding:mapped-boundary-error:v1", delegateExpression: "#{mappedBoundaryErrorHandler}", protocol: activityProtocol, operation: operation("mapped-boundary-error") },
];
const compensationEffectImplementation = "urn:bpmn-lean:effect:compensation-single-effect-v1";
const configuredHandlers: ReadonlyMap<string, string> = new Map([["urn:bpmn-lean:task-handler:probe-v1", operation("probe")]]);

/** CIB attributes that select an Activity's Java or external implementation. */
const implementationAttributes = ["delegateExpression", "class", "expression", "type", "topic"] as const;

function declaredImplementation(ctx: ReadContext, element: ElementRecord): Readonly<{ name: string; value: string }> | null {
  for (const name of implementationAttributes) {
    const value = ctx.attribute(element, name);
    if (value !== null) return { name, value };
  }
  return null;
}

/**
 * The effect a task selects: an overlay or built-in binding when its source attributes match one; otherwise the
 * source's own attributes unchanged, which `Kernel.Admission` refuses when no host implements that protocol.
 */
function serviceWork(ctx: ReadContext, element: ElementRecord): KernelJson {
  const declared = declaredImplementation(ctx, element);
  const delegate = declared?.name === "delegateExpression" ? declared.value : null;
  const implementation = text(element, "implementation");
  const bound = [...ctx.bindings, ...builtInBindings].find((binding) =>
    binding.delegateExpression === delegate && binding.implementation === implementation);
  if (bound !== undefined) return ctor("service", { payload: { protocol: bound.protocol, operation: bound.operation } });
  if (implementation === compensationEffectImplementation) {
    return ctor("service", { payload: { protocol: activityProtocol, operation: operation("compensation-single-effect") } });
  }
  const operationRef = optionalId(asElement(element.operationRef) ?? {});
  return ctor("service", { payload: {
    protocol: implementation ?? "##WebService",
    operation: declared?.value ?? operationRef ?? "",
  } });
}

function configuredTaskWork(element: ElementRecord): KernelJson | null {
  const definition = extensionValues(element).find((value) => value.$type === "bpmnLean:TaskDefinition");
  if (definition === undefined) return null;
  const handler = text(definition, "type") ?? "";
  return ctor("service", { payload: { protocol: activityProtocol, operation: configuredHandlers.get(handler) ?? handler } });
}

const commaList = (value: string | null): string[] =>
  value === null ? [] : value.split(",").map((entry) => entry.trim()).filter((entry) => entry.length > 0);

const optionalSource = (value: string | null): KernelJson => (value === null ? null : valueSource(value));

function formFields(ctx: ReadContext, element: ElementRecord): KernelJson[] {
  return ctx.extensions(element, "formData").flatMap((formData) => asElementArray(formData.$children) ?? [])
    .map((field) => {
      if (asElementArray(field.$children) !== undefined) {
        ctx.noteNotCarried({ element: optionalId(element), fact: `camunda:formField ${String(field.id)} children` });
      }
      return [String(field.id), typeof field.type === "string" ? field.type : ""];
    });
}

function userWork(ctx: ReadContext, element: ElementRecord): KernelJson {
  return ctor("user", { payload: {
    name: text(element, "name"),
    assignee: optionalSource(ctx.attribute(element, "assignee")),
    candidateUsers: commaList(ctx.attribute(element, "candidateUsers")).map(valueSource),
    candidateGroups: commaList(ctx.attribute(element, "candidateGroups")).map(valueSource),
    formKey: ctx.attribute(element, "formKey"),
    formFields: formFields(ctx, element),
    dueDate: optionalSource(ctx.attribute(element, "dueDate")),
    followUpDate: optionalSource(ctx.attribute(element, "followUpDate")),
    priority: optionalSource(ctx.attribute(element, "priority")),
  } });
}

/** A Process id named by a QName or a plain key: the local part when it names a Process in these Definitions. */
function resolveCalledProcess(ctx: ReadContext, calledElement: string): ElementRecord | undefined {
  const local = calledElement.includes(":") ? calledElement.slice(calledElement.indexOf(":") + 1) : calledElement;
  return ctx.processes.find((process) => process.id === local);
}

enum CallBindingKind {
  Latest = "latest",
  Deployment = "deployment",
  Version = "version",
  VersionTag = "versionTag",
}

const callBindingKinds: ReadonlySet<string> = new Set(Object.values(CallBindingKind));

function callBinding(ctx: ReadContext, element: ElementRecord): KernelJson {
  const declared = ctx.attribute(element, "calledElementBinding") ?? CallBindingKind.Latest;
  if (!callBindingKinds.has(declared)) {
    throw new ReadRefusal(ReadRefusalCode.UnknownAttributeValue, optionalId(element), `calledElementBinding ${declared}`);
  }
  const binding = declared as CallBindingKind;
  switch (binding) {
    case CallBindingKind.Latest:
      return "latest";
    case CallBindingKind.Deployment:
      return "deployment";
    case CallBindingKind.Version:
      return ctor("version", { value: valueSource(ctx.attribute(element, "calledElementVersion") ?? "") });
    case CallBindingKind.VersionTag:
      return ctor("versionTag", { value: valueSource(ctx.attribute(element, "calledElementVersionTag") ?? "") });
  }
  return assertNever(binding);
}

type CallMappings = Readonly<{ mappings: KernelJson[]; propagateAll: boolean; businessKey: KernelJson | null }>;

function camundaCallMappings(ctx: ReadContext, entries: ReadonlyArray<ElementRecord>, element: ElementRecord): CallMappings {
  const mappings: KernelJson[] = [];
  let propagateAll = false;
  let businessKey: KernelJson | null = null;
  for (const entry of entries) {
    if (entry.variables === "all") {
      propagateAll = true;
    } else if (typeof entry.businessKey === "string") {
      businessKey = /[#$]\{/u.test(entry.businessKey) ? valueExpression(entry.businessKey) : ctor("literal", { value: { kind: "string", value: entry.businessKey } });
    } else if (typeof entry.target === "string") {
      const source = typeof entry.sourceExpression === "string" ? valueExpression(entry.sourceExpression) : variable(String(entry.source));
      mappings.push(mapping(entry.target, source));
    } else {
      throw new ReadRefusal(ReadRefusalCode.UnknownAttributeValue, optionalId(element), "camunda call mapping without a target");
    }
    if (typeof entry.local === "string") {
      ctx.noteNotCarried({ element: optionalId(element), fact: "camunda:in/out local" });
    }
  }
  return { mappings, propagateAll, businessKey };
}

/** BPMN Call Activity data: a Call's DataInput or DataOutput corresponds by position to the called Process's (§10.3.6). */
function correspondingData(call: ElementRecord, called: ElementRecord | undefined, key: "dataInputs" | "dataOutputs", id: string | null): string | null {
  const own = list(asElement(call.ioSpecification) ?? {}, key);
  const position = own.findIndex((entry) => entry.id === id);
  const counterpart = position < 0 ? undefined : list(asElement(called?.ioSpecification) ?? {}, key)[position];
  return counterpart === undefined ? id : optionalId(counterpart);
}

function callWork(ctx: ReadContext, element: ElementRecord): KernelJson {
  const calledElement = text(element, "calledElement") ?? "";
  const called = resolveCalledProcess(ctx, calledElement);
  const inEntries = ctx.extensions(element, "in");
  const outEntries = ctx.extensions(element, "out");
  const camunda = inEntries.length > 0 || outEntries.length > 0;
  const inMappings = camundaCallMappings(ctx, inEntries, element);
  const outMappings = camundaCallMappings(ctx, outEntries, element);
  const dataInputs = list(element, "dataInputAssociations").map((association) => ({
    target: correspondingData(element, called, "dataInputs", associationTargetId(association)),
    source: associationSourceId(association),
  }));
  const dataOutputs = list(element, "dataOutputAssociations").map((association) => ({
    source: correspondingData(element, called, "dataOutputs", associationSourceId(association)),
    target: associationTargetId(association),
  }));
  return ctor("call", { payload: {
    calledElement: called === undefined ? valueSource(calledElement) : literalSource(requireId(called)),
    binding: callBinding(ctx, element),
    businessKey: inMappings.businessKey,
    inputs: [...dataInputs.map((entry) => mapping(String(entry.target), variable(String(entry.source)))), ...inMappings.mappings],
    outputs: [...dataOutputs.map((entry) => mapping(String(entry.target), variable(String(entry.source)))), ...outMappings.mappings],
    propagateAllInputs: inMappings.propagateAll,
    propagateAllOutputs: outMappings.propagateAll,
    unsetSourceReadsNull: camunda,
  } });
}

function sendWork(element: ElementRecord): KernelJson {
  return ctor("send", { payload: { binding: optionalId(asElement(element.messageRef) ?? {}) ?? "", recipient: null, correlation: [] } });
}

function scriptWork(ctx: ReadContext, element: ElementRecord): KernelJson {
  return ctor("script", { payload: {
    format: text(element, "scriptFormat") ?? "",
    source: text(element, "script") ?? "",
    resultVariable: ctx.attribute(element, "resultVariable"),
  } });
}

function ruleWork(ctx: ReadContext, element: ElementRecord): KernelJson {
  return ctor("rule", { payload: {
    decision: valueSource(ctx.attribute(element, "decisionRef") ?? ""),
    resultVariable: ctx.attribute(element, "resultVariable"),
  } });
}

type ActivityKind = FlowElementKind.Task | FlowElementKind.ManualTask | FlowElementKind.UserTask |
  FlowElementKind.ServiceTask | FlowElementKind.SendTask | FlowElementKind.ReceiveTask | FlowElementKind.ScriptTask |
  FlowElementKind.BusinessRuleTask | FlowElementKind.CallActivity;

const hasEffectImplementation = (ctx: ReadContext, element: ElementRecord): boolean =>
  declaredImplementation(ctx, element) !== null || text(element, "implementation") !== null;

/**
 * The work of an Activity and the type recorded for it. CIB executes a Send or Business Rule Task with a declared
 * implementation through the same delegate behaviour as a Service Task, so such a task is read as Service work.
 */
function workOf(ctx: ReadContext, element: ElementRecord, kind: ActivityKind): Readonly<{ work: KernelJson; sourceType: string }> {
  switch (kind) {
    case FlowElementKind.Task: {
      const configured = configuredTaskWork(element);
      return { work: configured ?? "none", sourceType: kind };
    }
    case FlowElementKind.ManualTask:
      return { work: "manual", sourceType: kind };
    case FlowElementKind.UserTask:
      return { work: userWork(ctx, element), sourceType: kind };
    case FlowElementKind.ServiceTask:
      return { work: serviceWork(ctx, element), sourceType: kind };
    case FlowElementKind.SendTask:
      return hasEffectImplementation(ctx, element)
        ? { work: serviceWork(ctx, element), sourceType: FlowElementKind.ServiceTask }
        : { work: sendWork(element), sourceType: kind };
    case FlowElementKind.ReceiveTask:
      return { work: ctor("receive", { payload: { message: messageTrigger(ctx, element, element) } }), sourceType: kind };
    case FlowElementKind.ScriptTask:
      return { work: scriptWork(ctx, element), sourceType: kind };
    case FlowElementKind.BusinessRuleTask:
      return declaredImplementation(ctx, element) !== null
        ? { work: serviceWork(ctx, element), sourceType: kind }
        : { work: ruleWork(ctx, element), sourceType: kind };
    case FlowElementKind.CallActivity:
      return { work: callWork(ctx, element), sourceType: kind };
  }
  return assertNever(kind);
}

export function readActivityData(ctx: ReadContext, element: ElementRecord, withAssociations: boolean): Readonly<Record<string, KernelJson>> {
  const loop = readMultiInstance(ctx, element);
  const parameters = inputOutputParameters(ctx, element);
  const open = (key: string): ElementRecord[] => withAssociations ? list(element, key).filter((association) => !loop.folded.has(association)) : [];
  return {
    inputs: [...associationInputs(ctx, open("dataInputAssociations")), ...parameters.inputs],
    outputs: [...associationOutputs(ctx, open("dataOutputAssociations")), ...parameters.outputs],
    multiInstance: loop.multiInstance,
  };
}

export function readActivity(ctx: ReadContext, node: ModelNode, kind: ActivityKind): Built {
  const id = requireId(node.element);
  const { work, sourceType } = workOf(ctx, node.element, kind);
  const data = readActivityData(ctx, node.element, kind !== FlowElementKind.CallActivity);
  return {
    kind: "element",
    id,
    build: (boundaries) => ctor("activity", {
      header: headerOf(node, sourceType),
      payload: { work, envelope: envelopeFor(ctx, id, data, boundaries) },
    }),
  };
}
