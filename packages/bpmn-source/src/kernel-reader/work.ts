import { asElement, asElementArray } from "../moddle-graph.js";
import type { ElementRecord } from "../moddle-graph.js";
import { envelopeFor, headerOf } from "./build.js";
import { activityProtocol, declaredImplementation, effectBinding, handlerKey, operation } from "./binding.js";
import {
  associationMappings, associationSourceId, associationSourceItem, associationTargetId, associationTargetItem, dataOutputDecl, inputOutputParameters, javaTrim, valueSource,
  variableCopies,
} from "./data.js";
import { messageTrigger } from "./events.js";
import {
  FlowElementKind, ReadRefusal, ReadRefusalCode, extensionValues, list, namesElement, optionalId, qualifiedName, reference, requireId, text,
} from "./model.js";
import type { Built, ModelNode, QualifiedName, ReadContext } from "./model.js";
import { readMultiInstance } from "./multi-instance.js";
import { assertNever, ctor, mapping, MappingSyntax, variable } from "./wire.js";
import type { KernelJson } from "./wire.js";

const configuredHandlers: ReadonlyMap<string, string> = new Map([["urn:bpmn-lean:task-handler:probe-v1", operation("probe")]]);

const serviceWork = (ctx: ReadContext, element: ElementRecord): KernelJson =>
  ctor("service", { payload: { ...(effectBinding(ctx, element) as Record<string, KernelJson>), handlerKey: handlerKey(ctx, element) } });

function configuredTaskWork(element: ElementRecord): KernelJson | null {
  const definition = extensionValues(element).find((value) => value.$type === "bpmnLean:TaskDefinition");
  if (definition === undefined) return null;
  const handler = text(definition, "type") ?? "";
  return ctor("service", { payload: { protocol: activityProtocol, operation: configuredHandlers.get(handler) ?? handler, handlerKey: null } });
}

/**
 * The entries of a CIB candidate list as `BpmnParse.parseCommaSeparatedList` reads them: split at commas, each trimmed
 * by Java's `String.trim`, so U+00A0 stays, and a bare last comma ends the list rather than opening an entry. CIB
 * publishes an entry that trims to empty as a candidate with the empty ID, which the canonical result cannot hold
 * (CIB-EXT-0011), so such an entry is refused.
 */
function candidateList(ctx: ReadContext, element: ElementRecord, attribute: "candidateUsers" | "candidateGroups"): KernelJson[] {
  const value = ctx.attribute(element, attribute);
  if (value === null || value === "") return [];
  const segments = value.split(",");
  if (segments.at(-1) === "") segments.pop();
  return segments.map((segment) => {
    const entry = javaTrim(segment);
    if (entry === "") {
      throw new ReadRefusal(ReadRefusalCode.EmptyCandidateEntry, optionalId(element), `camunda:${attribute} ${JSON.stringify(value)}`);
    }
    return valueSource(entry);
  });
}

const optionalSource = (value: string | null): KernelJson => (value === null ? null : valueSource(value));

function formFields(ctx: ReadContext, element: ElementRecord): KernelJson[] {
  return ctx.extensions(element, "formData").flatMap((formData) => asElementArray(formData.$children) ?? [])
    .map((field) => {
      if (asElementArray(field.$children) !== undefined) {
        ctx.noteNotCarried({ element: optionalId(element), fact: `camunda:formField ${String(field.id)} children` });
      }
      // An absent id or type reads as empty, which admission refuses as CIB's deployment does (`work.user.formField`).
      return [typeof field.id === "string" ? field.id : "", typeof field.type === "string" ? field.type : ""];
    });
}

function userWork(ctx: ReadContext, element: ElementRecord): KernelJson {
  return ctor("user", { payload: {
    name: text(element, "name"),
    assignee: optionalSource(ctx.attribute(element, "assignee")),
    candidateUsers: candidateList(ctx, element, "candidateUsers"),
    candidateGroups: candidateList(ctx, element, "candidateGroups"),
    formKey: ctx.attribute(element, "formKey"),
    formFields: formFields(ctx, element),
    dueDate: optionalSource(ctx.attribute(element, "dueDate")),
    followUpDate: optionalSource(ctx.attribute(element, "followUpDate")),
    priority: optionalSource(ctx.attribute(element, "priority")),
  } });
}

/**
 * The QName a Call's `calledElement` names. `Semantic.xsd` types it `xsd:QName`, so the source schema has refused an
 * expression and an unbound prefix before this reads it (PC-SCOPE-03).
 */
export const calledQName = (definitions: ElementRecord, element: ElementRecord): QualifiedName | null =>
  qualifiedName(element, definitions, text(element, "calledElement") ?? "");

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
  const name = calledQName(ctx.definitions, element);
  const called = ctx.processes.find((process) => namesElement(name, ctx.definitions, process));
  const inCopies = variableCopies(element, ctx.extensions(element, "in"));
  const outCopies = variableCopies(element, ctx.extensions(element, "out"));
  if ([inCopies, outCopies].some((copies) => copies.localOnly || copies.localCopy)) {
    ctx.noteNotCarried({ element: optionalId(element), fact: "camunda:in/out local" });
  }
  const dataInputs = list(element, "dataInputAssociations").map((association) => ({
    target: correspondingData(element, called, "dataInputs", associationTargetId(association)),
    source: associationSourceItem(association),
  }));
  const dataOutputs = list(element, "dataOutputAssociations").map((association) => ({
    source: correspondingData(element, called, "dataOutputs", associationSourceId(association)),
    target: associationTargetItem(association),
  }));
  const associated = (entry: Readonly<{ target: string | null; source: string | null }>): KernelJson =>
    mapping(String(entry.target), variable(String(entry.source)), MappingSyntax.DataAssociation);
  return ctor("call", { payload: {
    calledElement: valueSource(text(element, "calledElement") ?? ""),
    calledQName: name,
    binding: callableBinding(ctx, element, "calledElementBinding", "calledElementVersion", "calledElementVersionTag"),
    tenant: tenantSource(ctx, element, "calledElementTenantId"),
    businessKey: inCopies.businessKey,
    inputs: [...dataInputs.map(associated), ...inCopies.mappings],
    outputs: [...dataOutputs.map(associated), ...outCopies.mappings],
    propagateAllInputs: inCopies.propagateAll,
    propagateAllOutputs: outCopies.propagateAll,
  } });
}

/**
 * A Receive Task (BPMN 2.0.2 §10.3.3, Table 10.10; admission refuses an instantiating one, `work.receive.instantiate`)
 * with the Data Outputs and the count of OutputSets of its `ioSpecification`, which admission bounds (§10.4.1).
 */
function receiveWork(ctx: ReadContext, element: ElementRecord): KernelJson {
  const io = asElement(element.ioSpecification) ?? {};
  return ctor("receive", { payload: {
    message: messageTrigger(ctx, element, element),
    instantiate: element.instantiate === true,
    dataOutputs: list(io, "dataOutputs").map(dataOutputDecl),
    outputSets: list(io, "outputSets").length,
  } });
}

function sendWork(ctx: ReadContext, element: ElementRecord): KernelJson {
  return ctor("send", { payload: {
    binding: effectBinding(ctx, element),
    handlerKey: handlerKey(ctx, element),
    recipient: null,
    correlation: [],
    messageRef: optionalId(reference(element, "messageRef", "bpmn:Message") ?? {}),
    operationRef: optionalId(reference(element, "operationRef", "bpmn:Operation") ?? {}),
  } });
}

/**
 * A Script Task as CIB parses it (`BpmnParse#parseScriptTaskElement`): an absent `script` element is `none`, distinct
 * from an empty one, since CIB refuses a Script Task with neither a source nor a resource at deployment
 * (`ScriptUtil#getScript`); `camunda:resultVariableName` is the older spelling CIB reads only when
 * `camunda:resultVariable` is absent (`BpmnParse#parseResultVariable`).
 */
function scriptWork(ctx: ReadContext, element: ElementRecord): KernelJson {
  const resultVariable = ctx.attribute(element, "resultVariable");
  const legacyResultVariable = ctx.attribute(element, "resultVariableName");
  return ctor("script", { payload: {
    format: text(element, "scriptFormat") ?? "",
    source: text(element, "script"),
    resultVariable: resultVariable ?? legacyResultVariable,
    resource: ctx.attribute(element, "resource"),
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

/** A literal `decisionRef` is the decision's id (`BpmnParse.java:2366-2399`); an expression stays one. */
function ruleWork(ctx: ReadContext, element: ElementRecord, decisionRef: string): KernelJson {
  return ctor("rule", { payload: {
    decision: valueSource(decisionRef),
    resultVariable: ctx.attribute(element, "resultVariable"),
    binding: callableBinding(ctx, element, "decisionRefBinding", "decisionRefVersion", "decisionRefVersionTag"),
    resultMapping: decisionResultMapping(ctx, element),
    tenant: tenantSource(ctx, element, "decisionRefTenantId"),
  } });
}

type ActivityKind = FlowElementKind.Task | FlowElementKind.ManualTask | FlowElementKind.UserTask |
  FlowElementKind.ServiceTask | FlowElementKind.SendTask | FlowElementKind.ReceiveTask | FlowElementKind.ScriptTask |
  FlowElementKind.BusinessRuleTask | FlowElementKind.CallActivity;

/**
 * A Send Task performed by a configured handler, the bounded reading CIB-EXT-0023 selects: a `camunda:delegateExpression`
 * and no Message, Operation, output parameter or result variable, which that reading never reads. Any other Send Task
 * stays Send work, whose BPMN meaning `Kernel.Admission` refuses (PC-AUTO-04).
 */
const configuredSendHandler = (ctx: ReadContext, element: ElementRecord): boolean =>
  declaredImplementation(ctx, element)?.name === "delegateExpression" &&
  reference(element, "messageRef", "bpmn:Message") === null && reference(element, "operationRef", "bpmn:Operation") === null &&
  inputOutputParameters(ctx, element).outputs.length === 0 && ctx.attribute(element, "resultVariable") === null;

/**
 * The work of an Activity and the type recorded for it. A Business Rule Task with `camunda:decisionRef` is a decision
 * task whatever delegate it also names (`BpmnParse.java:2321-2324`), so that delegate attribute stays unconsumed and is
 * refused as not carried; without one CIB executes its declared implementation through the same delegate behaviour as
 * a Service Task, so it is read as Service work. A Send Task is read so only within `configuredSendHandler`.
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
      return configuredSendHandler(ctx, element)
        ? { work: serviceWork(ctx, element), sourceType: kind }
        : { work: sendWork(ctx, element), sourceType: kind };
    case FlowElementKind.ReceiveTask:
      return { work: receiveWork(ctx, element), sourceType: kind };
    case FlowElementKind.ScriptTask:
      return { work: scriptWork(ctx, element), sourceType: kind };
    case FlowElementKind.BusinessRuleTask: {
      const decisionRef = ctx.attribute(element, "decisionRef");
      if (decisionRef !== null) return { work: ruleWork(ctx, element, decisionRef), sourceType: kind };
      return declaredImplementation(ctx, element) !== null
        ? { work: serviceWork(ctx, element), sourceType: kind }
        : { work: ruleWork(ctx, element, ""), sourceType: kind };
    }
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
