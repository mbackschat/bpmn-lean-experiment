import { asElement, asElementArray, readNamespaceUriForPrefix } from "../moddle-graph.js";
import type { ElementRecord } from "../moddle-graph.js";
import { compareIds } from "./wire.js";
import type { KernelJson } from "./wire.js";

/** Stable refusal codes of the reader: parse, preservation and unknown or unrepresentable source shapes only. */
export enum ReadRefusalCode {
  SourceTooLarge = "source.tooLarge",
  SourceIdentityMismatch = "source.identityMismatch",
  SourceEncoding = "source.encoding",
  SourceDoctype = "source.doctype",
  SourceOverlay = "source.overlay",
  SourceAmbiguousBoolean = "source.ambiguousBoolean",
  SourceContainmentCardinality = "source.containmentCardinality",
  SourceNoProcess = "source.noProcess",
  SourceMissingId = "source.missingId",
  SourceReference = "source.reference",
  SourceSchema = "source.schema",
  SourceLoopBodyWhitespace = "source.loopBodyWhitespace",
  ParserFailure = "parser.failure",
  ParserWarning = "parser.warning",
  UnknownElement = "reader.unknownElement",
  UnknownAttribute = "reader.unknownAttribute",
  UnknownAttributeValue = "reader.unknownAttributeValue",
  UnknownExtension = "reader.unknownExtension",
  FactNotCarried = "reader.factNotCarried",
  EventDefinitionRef = "reader.eventDefinitionRef",
  EventDefinitionOnElement = "reader.eventDefinitionOnElement",
  StandardLoop = "reader.standardLoop",
  EventSubProcessStart = "reader.eventSubProcessStart",
  DataAssociationShape = "reader.dataAssociationShape",
  /** A Data Object reference inside a Scope, whose item the reader would declare per occurrence (`scopeItems`). */
  ScopedDataObjectReference = "reader.scopedDataObjectReference",
  SignalWithoutReference = "reader.signalWithoutReference",
  ThrowWithoutCode = "reader.throwWithoutCode",
  /** A Message throw's CIB attributes the IL has no field for, which CIB would run (PC-MESSAGE-09). */
  ThrowMessageImplementation = "throw.message.implementation",
  ThrowMessageResultVariable = "throw.message.resultVariable",
  ThrowMessageIoMapping = "throw.message.ioMapping",
  ThrowMessageAsynchronous = "throw.message.asynchronous",
  ThrowMessageListener = "throw.message.listener",
  MultiInstanceWithoutCount = "reader.multiInstanceWithoutCount",
  EmptyLoopCardinality = "reader.emptyLoopCardinality",
  ConditionExpressionType = "reader.conditionExpressionType",
  DecisionSchema = "decision.schema",
}

export class ReadRefusal extends Error {
  constructor(
    readonly code: ReadRefusalCode,
    readonly element: string | null,
    readonly evidence: string,
  ) {
    super(`${code}: ${evidence}`);
  }
}

/** One closed view of a BPMN flow element's `$type`, so that dispatch is an exhaustive switch. */
export enum FlowElementKind {
  StartEvent = "startEvent",
  EndEvent = "endEvent",
  IntermediateCatchEvent = "intermediateCatchEvent",
  IntermediateThrowEvent = "intermediateThrowEvent",
  BoundaryEvent = "boundaryEvent",
  Task = "task",
  ManualTask = "manualTask",
  UserTask = "userTask",
  ServiceTask = "serviceTask",
  SendTask = "sendTask",
  ReceiveTask = "receiveTask",
  ScriptTask = "scriptTask",
  BusinessRuleTask = "businessRuleTask",
  CallActivity = "callActivity",
  SubProcess = "subProcess",
  Transaction = "transaction",
  ExclusiveGateway = "exclusiveGateway",
  InclusiveGateway = "inclusiveGateway",
  ParallelGateway = "parallelGateway",
  EventBasedGateway = "eventBasedGateway",
  SequenceFlow = "sequenceFlow",
  DataDeclaration = "dataDeclaration",
}

const flowElementKinds: ReadonlyMap<string, FlowElementKind> = new Map([
  ["bpmn:StartEvent", FlowElementKind.StartEvent],
  ["bpmn:EndEvent", FlowElementKind.EndEvent],
  ["bpmn:IntermediateCatchEvent", FlowElementKind.IntermediateCatchEvent],
  ["bpmn:IntermediateThrowEvent", FlowElementKind.IntermediateThrowEvent],
  ["bpmn:BoundaryEvent", FlowElementKind.BoundaryEvent],
  ["bpmn:Task", FlowElementKind.Task],
  ["bpmn:ManualTask", FlowElementKind.ManualTask],
  ["bpmn:UserTask", FlowElementKind.UserTask],
  ["bpmn:ServiceTask", FlowElementKind.ServiceTask],
  ["bpmn:SendTask", FlowElementKind.SendTask],
  ["bpmn:ReceiveTask", FlowElementKind.ReceiveTask],
  ["bpmn:ScriptTask", FlowElementKind.ScriptTask],
  ["bpmn:BusinessRuleTask", FlowElementKind.BusinessRuleTask],
  ["bpmn:CallActivity", FlowElementKind.CallActivity],
  ["bpmn:SubProcess", FlowElementKind.SubProcess],
  ["bpmn:Transaction", FlowElementKind.Transaction],
  ["bpmn:ExclusiveGateway", FlowElementKind.ExclusiveGateway],
  ["bpmn:InclusiveGateway", FlowElementKind.InclusiveGateway],
  ["bpmn:ParallelGateway", FlowElementKind.ParallelGateway],
  ["bpmn:EventBasedGateway", FlowElementKind.EventBasedGateway],
  ["bpmn:SequenceFlow", FlowElementKind.SequenceFlow],
  ["bpmn:DataObject", FlowElementKind.DataDeclaration],
  ["bpmn:DataObjectReference", FlowElementKind.DataDeclaration],
  ["bpmn:DataStoreReference", FlowElementKind.DataDeclaration],
]);

/** Root elements with no executable content of their own: they are read through references or stay in exact bytes. */
const inertRootTypes: ReadonlySet<string> = new Set([
  "bpmn:ItemDefinition",
  "bpmn:Message",
  "bpmn:Interface",
  "bpmn:Error",
  "bpmn:Escalation",
  "bpmn:Signal",
  "bpmn:CorrelationProperty",
  "bpmn:Collaboration",
  "bpmn:DataStore",
  "bpmn:Resource",
  "bpmn:Category",
  "bpmn:EndPoint",
  "bpmn:PartnerEntity",
  "bpmn:PartnerRole",
]);

export const flowElementKind = (element: ElementRecord): FlowElementKind => {
  const kind = flowElementKinds.get(String(element.$type));
  if (kind === undefined) {
    throw new ReadRefusal(ReadRefusalCode.UnknownElement, optionalId(element), `flow element ${String(element.$type)}`);
  }
  return kind;
};

export const optionalId = (element: ElementRecord): string | null =>
  typeof element.id === "string" && element.id.length > 0 ? element.id : null;

export function requireId(element: ElementRecord): string {
  const id = optionalId(element);
  if (id === null) {
    throw new ReadRefusal(ReadRefusalCode.SourceMissingId, null, `${String(element.$type)} without id`);
  }
  return id;
}

export const text = (element: ElementRecord, key: string): string | null =>
  typeof element[key] === "string" ? element[key] : null;

export const list = (element: ElementRecord, key: string): ReadonlyArray<ElementRecord> =>
  asElementArray(element[key]) ?? [];

/**
 * The item names a process or Sub-Process declares for each of its occurrences (BPMN 2.0.2 §10.4.1): its Properties
 * and the Data Objects and Data Object references among its own flow elements. A Data Store holds no instance data,
 * and a nested Sub-Process's items are its own.
 */
export function containerItems(container: ElementRecord): string[] {
  const data = list(container, "flowElements")
    .filter((element) => element.$type === "bpmn:DataObject" || element.$type === "bpmn:DataObjectReference");
  return [...list(container, "properties"), ...data].map(requireId).sort(compareIds);
}

/** A resolved reference of the expected BPMN type; a reference to another type is malformed source. */
export function reference(owner: ElementRecord, key: string, expectedType: string): ElementRecord | null {
  const target = asElement(owner[key]);
  if (target === undefined) return null;
  if (target.$type !== expectedType) {
    throw new ReadRefusal(
      ReadRefusalCode.SourceReference,
      optionalId(owner),
      `${key} resolves to ${String(target.$type)}, expected ${expectedType}`,
    );
  }
  return target;
}

export type ModelNode = Readonly<{
  element: ElementRecord;
  kind: FlowElementKind;
  /** The id of the enclosing Sub-Process, `null` at process level. */
  parent: string | null;
  /** The enclosing container: a Process or a Sub-Process. */
  container: ElementRecord;
}>;

/** A built element waits for its boundaries; a boundary is placed in its host's envelope. */
export type Built =
  | Readonly<{ kind: "element"; id: string; build: (boundaries: KernelJson[]) => KernelJson }>
  | Readonly<{ kind: "boundary"; attachedTo: string; boundary: KernelJson }>;

export type EffectBinding = Readonly<{
  implementation: string | null;
  delegateExpression: string;
  protocol: string;
  operation: string;
}>;

export type SourceFactNotCarried = Readonly<{ element: string | null; fact: string }>;

/** The compensation structure of the model, derived from Associations and compensation Event Sub-Processes. */
export type CompensationSubject = Readonly<{
  subject: string;
  handler: string;
  /** The compensation boundary Event of an Activity subject, `null` for a compensation Event Sub-Process. */
  boundary: string | null;
  /** The container the handler joins as a child: the subject's container, or the subject Sub-Process itself. */
  container: ElementRecord;
}>;

export type ReadContext = Readonly<{
  definitions: ElementRecord;
  rootProcess: ElementRecord;
  processes: ReadonlyArray<ElementRecord>;
  nodes: ReadonlyMap<string, ModelNode>;
  flows: ReadonlyArray<ElementRecord>;
  incoming: (id: string) => string[];
  outgoing: (id: string) => string[];
  childrenOf: (container: ElementRecord) => ReadonlyArray<ModelNode>;
  compensation: ReadonlyArray<CompensationSubject>;
  handlers: ReadonlySet<string>;
  /** Ids of the elements a compensation Event Sub-Process erases along with itself. */
  erased: ReadonlySet<string>;
  bindings: ReadonlyArray<EffectBinding>;
  inertAttributes: ReadonlySet<string>;
  expressionLanguage: string | null;
  attribute: (element: ElementRecord, localName: string) => string | null;
  extensions: (element: ElementRecord, localName: string) => ReadonlyArray<ElementRecord>;
  noteNotCarried: (fact: SourceFactNotCarried) => void;
}>;

export const camundaNamespace = "http://camunda.org/schema/1.0/bpmn";
const xsiNamespace = "http://www.w3.org/2001/XMLSchema-instance";

/** The namespace URI of an extension element's or attribute's prefix, resolved from its own inherited declarations. */
export function namespaceOf(element: ElementRecord, definitions: ElementRecord, prefix: string): string | undefined {
  const namespace = readNamespaceUriForPrefix(element, definitions, prefix);
  return typeof namespace === "string" ? namespace : undefined;
}

/** An XML QName as the kernel IL carries it (`Kernel.QName`). */
export type QualifiedName = { namespace: string | null; localName: string };

/** The Definitions' `targetNamespace`, the namespace of every element they declare. */
export const targetNamespaceOf = (definitions: ElementRecord): string | null =>
  typeof definitions.targetNamespace === "string" ? definitions.targetNamespace : null;

/**
 * The QName an `xsd:QName` attribute value names: a prefix resolves through the element's in-scope declarations, and
 * one without a binding names nothing (`null`); an unprefixed name takes the Definitions' `targetNamespace`, the
 * namespace of the elements the same document declares (PC-SCOPE-03).
 */
export function qualifiedName(element: ElementRecord, definitions: ElementRecord, value: string): QualifiedName | null {
  const separator = value.indexOf(":");
  if (separator < 0) return { namespace: targetNamespaceOf(definitions), localName: value };
  const namespace = namespaceOf(element, definitions, value.slice(0, separator));
  return namespace === undefined ? null : { namespace, localName: value.slice(separator + 1) };
}

/** Whether `name` is the QName of `element`, which these Definitions declare: their `targetNamespace` and its id. */
export const namesElement = (name: QualifiedName | null, definitions: ElementRecord, element: ElementRecord): boolean =>
  name !== null && name.namespace === targetNamespaceOf(definitions) && name.localName === element.id;

const prefixOf = (qualifiedName: string): string =>
  qualifiedName.includes(":") ? qualifiedName.slice(0, qualifiedName.indexOf(":")) : "";

const localNameOf = (qualifiedName: string): string =>
  qualifiedName.includes(":") ? qualifiedName.slice(qualifiedName.indexOf(":") + 1) : qualifiedName;

export const extensionLocalName = (element: ElementRecord): string => localNameOf(String(element.$type));

export function extensionValues(element: ElementRecord): ReadonlyArray<ElementRecord> {
  return list(asElement(element.extensionElements) ?? {}, "values");
}

/** Tracks which CIB attributes and extension elements of each element the reader consumed. */
export function createExtensionTracker(definitions: ElementRecord): Pick<
  ReadContext,
  "attribute" | "extensions"
> & { consumedBy: (element: ElementRecord) => ReadonlySet<string> } {
  const consumed = new Map<ElementRecord, Set<string>>();
  const consume = (element: ElementRecord, name: string): void => {
    const names = consumed.get(element) ?? new Set<string>();
    names.add(name);
    consumed.set(element, names);
  };
  return {
    consumedBy: (element) => consumed.get(element) ?? new Set<string>(),
    attribute: (element, localName) => {
      for (const [qualifiedName, value] of Object.entries(asElement(element.$attrs) ?? {})) {
        if (localNameOf(qualifiedName) === localName &&
          namespaceOf(element, definitions, prefixOf(qualifiedName)) === camundaNamespace && typeof value === "string") {
          consume(element, localName);
          return value;
        }
      }
      return null;
    },
    extensions: (element, localName) => {
      const matches = extensionValues(element).filter((value) =>
        extensionLocalName(value) === localName &&
        namespaceOf(value, definitions, prefixOf(String(value.$type))) === camundaNamespace);
      if (matches.length > 0) consume(element, localName);
      return matches;
    },
  };
}

/**
 * Refuses the foreign material of one element the IL does not carry: an unconsumed CIB attribute or extension element,
 * which CIB may act on and no profile rule yet proves safe to drop, and anything outside the CIB and project
 * namespaces, which has no reader.
 */
export function requireCarried(
  element: ElementRecord,
  definitions: ElementRecord,
  consumed: ReadonlySet<string>,
  inertAttributes: ReadonlySet<string>,
): void {
  const id = optionalId(element);
  for (const qualifiedName of Object.keys(asElement(element.$attrs) ?? {})) {
    if (qualifiedName === "xmlns" || qualifiedName.startsWith("xmlns:")) continue;
    const prefix = prefixOf(qualifiedName);
    const namespace = namespaceOf(element, definitions, prefix);
    const localName = localNameOf(qualifiedName);
    if (namespace === xsiNamespace || inertAttributes.has(`${namespace}#${localName}`)) continue;
    if (namespace !== camundaNamespace) {
      throw new ReadRefusal(ReadRefusalCode.UnknownAttribute, id, qualifiedName);
    }
    if (!consumed.has(localName)) throw new ReadRefusal(ReadRefusalCode.FactNotCarried, id, `camunda:${localName}`);
  }
  for (const value of extensionValues(element)) {
    const type = String(value.$type);
    if (type === "bpmnLean:TaskDefinition") continue;
    if (namespaceOf(value, definitions, prefixOf(type)) !== camundaNamespace) {
      throw new ReadRefusal(ReadRefusalCode.UnknownExtension, id, type);
    }
    const localName = extensionLocalName(value);
    if (!consumed.has(localName)) throw new ReadRefusal(ReadRefusalCode.FactNotCarried, id, `camunda:${localName}`);
  }
}

export function requireInertRoot(element: ElementRecord): void {
  if (!inertRootTypes.has(String(element.$type))) {
    throw new ReadRefusal(ReadRefusalCode.UnknownElement, optionalId(element), `root element ${String(element.$type)}`);
  }
}

export const byId = (left: ModelNode, right: ModelNode): number =>
  compareIds(requireId(left.element), requireId(right.element));
