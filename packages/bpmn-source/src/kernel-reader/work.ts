import { asElement, asElementArray } from "../moddle-graph.js";
import type { ElementRecord } from "../moddle-graph.js";
import { envelopeFor, headerOf } from "./build.js";
import { activityProtocol, declaredImplementation, effectBinding, operation } from "./binding.js";
import { associationMappings, associationSourceId, associationTargetId, inputOutputParameters, valueSource, variableCopies } from "./data.js";
import { messageTrigger } from "./events.js";
import { FlowElementKind, ReadRefusal, ReadRefusalCode, extensionValues, list, optionalId, reference, requireId, text } from "./model.js";
import type { Built, ModelNode, ReadContext } from "./model.js";
import { readMultiInstance } from "./multi-instance.js";
import { assertNever, ctor, literalSource, mapping, MappingSyntax, variable } from "./wire.js";
import type { KernelJson } from "./wire.js";

const configuredHandlers: ReadonlyMap<string, string> = new Map([["urn:bpmn-lean:task-handler:probe-v1", operation("probe")]]);

const serviceWork = (ctx: ReadContext, element: ElementRecord): KernelJson =>
  ctor("service", { payload: effectBinding(ctx, element) });

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

/** CIB `BpmnParse#parseBinding`, `#parseVersion`, `#parseVersionTag` over one attribute family. */
function callableBinding(ctx: ReadContext, element: ElementRecord, attribute: string, version: string, versionTag: string): KernelJson {
  const declared = ctx.attribute(element, attribute) ?? CallBindingKind.Latest;
  if (!callBindingKinds.has(declared)) {
    throw new ReadRefusal(ReadRefusalCode.UnknownAttributeValue, optionalId(element), `${attribute} ${declared}`);
  }
  const binding = declared as CallBindingKind;
  switch (binding) {
    case CallBindingKind.Latest:
      return "latest";
    case CallBindingKind.Deployment:
      return "deployment";
    case CallBindingKind.Version:
      return ctor("version", { value: valueSource(ctx.attribute(element, version) ?? "") });
    case CallBindingKind.VersionTag:
      return ctor("versionTag", { value: valueSource(ctx.attribute(element, versionTag) ?? "") });
  }
  return assertNever(binding);
}

/** CIB `BpmnParse#parseTenantId`: an empty tenant is no tenant. */
function tenantSource(ctx: ReadContext, element: ElementRecord, attribute: string): KernelJson {
  const tenant = ctx.attribute(element, attribute);
  return tenant === null || tenant.length === 0 ? null : valueSource(tenant);
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
  const inCopies = variableCopies(element, ctx.extensions(element, "in"));
  const outCopies = variableCopies(element, ctx.extensions(element, "out"));
  if ([inCopies, outCopies].some((copies) => copies.localOnly || copies.localCopy)) {
    ctx.noteNotCarried({ element: optionalId(element), fact: "camunda:in/out local" });
  }
  const dataInputs = list(element, "dataInputAssociations").map((association) => ({
    target: correspondingData(element, called, "dataInputs", associationTargetId(association)),
    source: associationSourceId(association),
  }));
  const dataOutputs = list(element, "dataOutputAssociations").map((association) => ({
    source: correspondingData(element, called, "dataOutputs", associationSourceId(association)),
    target: associationTargetId(association),
  }));
  const associated = (entry: Readonly<{ target: string | null; source: string | null }>): KernelJson =>
    mapping(String(entry.target), variable(String(entry.source)), MappingSyntax.DataAssociation);
  return ctor("call", { payload: {
    calledElement: called === undefined ? valueSource(calledElement) : literalSource(requireId(called)),
    binding: callableBinding(ctx, element, "calledElementBinding", "calledElementVersion", "calledElementVersionTag"),
    tenant: tenantSource(ctx, element, "calledElementTenantId"),
    businessKey: inCopies.businessKey,
    inputs: [...dataInputs.map(associated), ...inCopies.mappings],
    outputs: [...dataOutputs.map(associated), ...outCopies.mappings],
    propagateAllInputs: inCopies.propagateAll,
    propagateAllOutputs: outCopies.propagateAll,
  } });
}

function sendWork(ctx: ReadContext, element: ElementRecord): KernelJson {
  return ctor("send", { payload: {
    binding: effectBinding(ctx, element),
    recipient: null,
    correlation: [],
    messageRef: optionalId(reference(element, "messageRef", "bpmn:Message") ?? {}),
    operationRef: optionalId(reference(element, "operationRef", "bpmn:Operation") ?? {}),
  } });
}

function scriptWork(ctx: ReadContext, element: ElementRecord): KernelJson {
  return ctor("script", { payload: {
    format: text(element, "scriptFormat") ?? "",
    source: text(element, "script") ?? "",
    resultVariable: ctx.attribute(element, "resultVariable"),
  } });
}

/** CIB `DecisionEvaluationUtil#getDecisionResultMapperForName`; any other name fails the parse. */
enum DecisionResultMapper {
  SingleEntry = "singleEntry",
  SingleResult = "singleResult",
  CollectEntries = "collectEntries",
  ResultList = "resultList",
}

const decisionResultMappers: ReadonlySet<string> = new Set(Object.values(DecisionResultMapper));

function decisionResultMapping(ctx: ReadContext, element: ElementRecord): KernelJson {
  const declared = ctx.attribute(element, "mapDecisionResult") ?? DecisionResultMapper.ResultList;
  if (!decisionResultMappers.has(declared)) {
    throw new ReadRefusal(ReadRefusalCode.UnknownAttributeValue, optionalId(element), `mapDecisionResult ${declared}`);
  }
  return declared;
}

function ruleWork(ctx: ReadContext, element: ElementRecord): KernelJson {
  return ctor("rule", { payload: {
    decision: valueSource(ctx.attribute(element, "decisionRef") ?? ""),
    resultVariable: ctx.attribute(element, "resultVariable"),
    binding: callableBinding(ctx, element, "decisionRefBinding", "decisionRefVersion", "decisionRefVersionTag"),
    resultMapping: decisionResultMapping(ctx, element),
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
        : { work: sendWork(ctx, element), sourceType: kind };
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
    inputs: [...associationMappings(ctx, open("dataInputAssociations")), ...parameters.inputs],
    outputs: [...associationMappings(ctx, open("dataOutputAssociations")), ...parameters.outputs],
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
      payload: { work, envelope: envelopeFor(ctx, node.element, data, boundaries) },
    }),
  };
}
