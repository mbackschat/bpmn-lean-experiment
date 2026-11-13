/**
 * One refusal test per `ReadRefusalCode`: the smallest BPMN source the reader cannot read faithfully, refused with that
 * code, and, where one exists, the corrected source beside it, which the reader reads. The reader refuses only parse,
 * preservation and unknown or unrepresentable source; semantic refusals belong to kernel admission.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { kernelProfileOptions, readKernelProgram } from "@bpmn-lean/bpmn-source";
import type { KernelRead, KernelSource } from "@bpmn-lean/bpmn-source";

type Bytes = string | Uint8Array;
type Case = Readonly<{ xml: Bytes; source?: Partial<KernelSource> }>;
type Row = Readonly<{
  code: string;
  description: string;
  /** Text the refusal's evidence names, which tells apart the several sites of one code. */
  evidence?: string;
  refused: Case;
  /** The same source with the defect corrected. */
  control?: Case;
}>;

const camunda = "http://camunda.org/schema/1.0/bpmn";
const xsi = "http://www.w3.org/2001/XMLSchema-instance";

function model(body: string, roots = ""): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="${camunda}" xmlns:xsi="${xsi}" id="D" targetNamespace="urn:t">
${roots}<bpmn:process id="P" isExecutable="true">${body}</bpmn:process></bpmn:definitions>`;
}

const bytesOf = (xml: Bytes): Uint8Array => (typeof xml === "string" ? new TextEncoder().encode(xml) : xml);
const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

function read({ xml, source = {} }: Case): Promise<KernelRead> {
  return readKernelProgram({
    bytes: bytesOf(xml),
    overlay: null,
    profile: "refusal-profile",
    limits: { maxBytes: 1 << 20, parserDeadlineMs: 2_000 },
    ...source,
  }, kernelProfileOptions([]));
}

const timer = (duration = "PT1S"): string =>
  `<bpmn:timerEventDefinition><bpmn:timeDuration xsi:type="bpmn:tFormalExpression">${duration}</bpmn:timeDuration></bpmn:timerEventDefinition>`;

const task = model(`<bpmn:task id="T"/>`);
const overlayWith = (fields: string): string => `{"kind":"bpmnSourceOverlay",${fields}"effectBindings":[],"inertAttributes":[]}`;
const overlayJson = overlayWith(`"id":"overlay","semanticProfile":"refusal-profile",`);
const overlayOf = (text: string, digest: string = sha256(bytesOf(text))): Partial<KernelSource> =>
  ({ overlay: { id: "overlay", sha256: digest, bytes: bytesOf(text) } });
const withOverlay = (text: string, digest?: string): Case => ({ xml: task, source: overlayOf(text, digest) });
/** A selected overlay whose artifact carries `id` and names the selection by the same `id`. */
const overlayIdentifiedAs = (id: string): KernelSource["overlay"] => {
  const bytes = bytesOf(overlayWith(`"id":${JSON.stringify(id)},"semanticProfile":"refusal-profile",`));
  return { id, sha256: sha256(bytes), bytes };
};

const boundaryOn = (cancelActivity: string): string =>
  model(`<bpmn:task id="T"/><bpmn:boundaryEvent id="B" attachedToRef="T" cancelActivity="${cancelActivity}">${timer()}</bpmn:boundaryEvent>`);

const foreignAttribute = (attribute: string): string => `<?xml version="1.0"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:x="urn:x" id="D" targetNamespace="urn:t"><bpmn:process id="P" isExecutable="true"><bpmn:task id="T" ${attribute}/></bpmn:process></bpmn:definitions>`;

const operation = `<bpmn:message id="M"/><bpmn:interface id="If" name="If"><bpmn:operation id="O" name="O"><bpmn:inMessageRef>M</bpmn:inMessageRef></bpmn:operation></bpmn:interface>`;
const timerDuration = `<bpmn:timeDuration xsi:type="bpmn:tFormalExpression">PT1S</bpmn:timeDuration>`;
const catching = (definition: string, roots = ""): string => model(`<bpmn:intermediateCatchEvent id="C">${definition}</bpmn:intermediateCatchEvent>`, roots);
const ending = (definition: string, roots = ""): string => model(`<bpmn:endEvent id="E">${definition}</bpmn:endEvent>`, roots);
const inputAssociation = (association: string, data = ""): string =>
  model(`<bpmn:property id="Prop"/><bpmn:dataObject id="Obj"/>${data}<bpmn:userTask id="U"><bpmn:ioSpecification><bpmn:dataInput id="I"/><bpmn:inputSet/><bpmn:outputSet/></bpmn:ioSpecification>${association}</bpmn:userTask>`);

export const rows: readonly Row[] = [
  // Preservation of the source bytes.
  {
    code: "source.tooLarge",
    description: "a source over the byte limit",
    refused: { xml: task, source: { limits: { maxBytes: 10, parserDeadlineMs: 2_000 } } },
    control: { xml: task },
  },
  {
    code: "source.identityMismatch",
    description: "a source whose digest is not the one captured",
    refused: { xml: task, source: { expectedSha256: "0".repeat(64) } },
    control: { xml: task, source: { expectedSha256: sha256(bytesOf(task)) } },
  },
  {
    code: "source.encoding",
    description: "a source declaring an encoding other than UTF-8",
    evidence: "ISO-8859-1",
    refused: { xml: task.replace("UTF-8", "ISO-8859-1") },
    control: { xml: task },
  },
  {
    code: "source.encoding",
    description: "a source whose bytes are not valid UTF-8",
    evidence: "not valid UTF-8",
    refused: { xml: Uint8Array.from([...bytesOf("<bpmn:definitions>"), 0xff, 0xfe]) },
    control: { xml: task },
  },
  {
    code: "source.doctype",
    description: "a source with a DOCTYPE",
    refused: { xml: task.replace("?>", "?><!DOCTYPE bpmn>") },
    control: { xml: task },
  },
  {
    code: "source.overlay",
    description: "an overlay whose digest is not the declared one",
    evidence: "digest mismatch",
    refused: withOverlay(overlayJson, "0".repeat(64)),
    control: withOverlay(overlayJson),
  },
  {
    code: "source.overlay",
    description: "an overlay that is not strict JSON",
    evidence: "not strict UTF-8 JSON",
    refused: withOverlay("{not json"),
    control: withOverlay(overlayJson),
  },
  {
    code: "source.overlay",
    description: "an overlay that is not a source overlay",
    evidence: "overlay contract",
    refused: withOverlay(`{"kind":"other","effectBindings":[],"inertAttributes":[]}`),
    control: withOverlay(overlayJson),
  },
  {
    code: "source.overlay",
    description: "an overlay authored for another semantic profile",
    evidence: "semanticProfile",
    refused: withOverlay(overlayWith(`"id":"overlay","semanticProfile":"other-profile",`)),
    control: withOverlay(overlayJson),
  },
  {
    code: "source.overlay",
    description: "an overlay that names no semantic profile",
    evidence: "semanticProfile",
    refused: withOverlay(overlayWith(`"id":"overlay",`)),
    control: withOverlay(overlayJson),
  },
  {
    code: "source.overlay",
    description: "an overlay without an id",
    evidence: "overlay id",
    refused: withOverlay(overlayWith(`"semanticProfile":"refusal-profile",`)),
    control: withOverlay(overlayJson),
  },
  {
    code: "source.overlay",
    description: "an overlay whose id is longer than 256 Unicode scalar values",
    evidence: "overlay id",
    refused: { xml: task, source: { overlay: overlayIdentifiedAs("🚀".repeat(257)) } },
    control: { xml: task, source: { overlay: overlayIdentifiedAs("🚀".repeat(256)) } },
  },
  {
    code: "source.overlay",
    description: "an overlay whose id is not the selected overlay's",
    evidence: "overlay id",
    refused: withOverlay(overlayWith(`"id":"another-overlay","semanticProfile":"refusal-profile",`)),
    control: withOverlay(overlayJson),
  },
  {
    code: "source.ambiguousBoolean",
    description: "a boolean attribute written as 1, which moddle would read as false",
    refused: { xml: boundaryOn("1") },
    control: { xml: boundaryOn("false") },
  },
  {
    code: "source.containmentCardinality",
    description: "a Timer with two durations, of which moddle keeps one",
    refused: { xml: catching(timer().replace("</bpmn:timerEventDefinition>",
      `<bpmn:timeDuration xsi:type="bpmn:tFormalExpression">PT2S</bpmn:timeDuration></bpmn:timerEventDefinition>`)) },
    control: { xml: catching(timer()) },
  },
  // Parsing.
  {
    code: "parser.failure",
    description: "a source that is not well-formed XML",
    refused: { xml: `<?xml version="1.0"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"` },
    control: { xml: task },
  },
  {
    code: "parser.warning",
    description: "an element moddle does not know",
    refused: { xml: model(`<bpmn:unknownThing id="T"/>`) },
    control: { xml: task },
  },
  {
    code: "parser.warning",
    description: "a duplicate identifier, which moddle reports before the reader scans identifiers",
    evidence: "duplicate ID",
    refused: { xml: model(`<bpmn:task id="T"/><bpmn:task id="T"/>`) },
    control: { xml: model(`<bpmn:task id="T"/><bpmn:task id="U"/>`) },
  },
  // Structure of the source.
  {
    code: "source.noProcess",
    description: "Definitions without a Process",
    refused: { xml: `<?xml version="1.0"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="urn:t"/>` },
    control: { xml: task },
  },
  {
    code: "source.missingId",
    description: "a flow element without an identifier",
    refused: { xml: model(`<bpmn:task/>`) },
    control: { xml: task },
  },
  {
    code: "source.reference",
    description: "a message reference that resolves to a Signal",
    refused: { xml: model(`<bpmn:startEvent id="S"><bpmn:messageEventDefinition messageRef="Sg"/></bpmn:startEvent>`, `<bpmn:signal id="Sg"/>`) },
    control: { xml: model(`<bpmn:startEvent id="S"><bpmn:messageEventDefinition messageRef="Sg"/></bpmn:startEvent>`, `<bpmn:message id="Sg"/>`) },
  },
  {
    code: "source.schema",
    description: "an operationRef written as an attribute, which the BPMN 2.0.2 XSD declares a child element",
    evidence: "operationRef",
    refused: { xml: catching(`<bpmn:messageEventDefinition messageRef="M" operationRef="O"/>`, operation) },
    control: { xml: catching(`<bpmn:messageEventDefinition messageRef="M"><bpmn:operationRef>O</bpmn:operationRef></bpmn:messageEventDefinition>`, operation) },
  },
  {
    code: "source.schema",
    description: "a Conditional definition without the condition the BPMN 2.0.2 XSD requires",
    evidence: "required child",
    refused: { xml: catching(`<bpmn:conditionalEventDefinition/>`) },
    control: {
      xml: catching(`<bpmn:conditionalEventDefinition><bpmn:condition xsi:type="bpmn:tFormalExpression">true</bpmn:condition></bpmn:conditionalEventDefinition>`),
    },
  },
  // Unknown or unrepresentable source.
  {
    code: "reader.unknownElement",
    description: "a flow element of a type with no IL shape",
    refused: { xml: model(`<bpmn:complexGateway id="G"/>`) },
    control: { xml: model(`<bpmn:exclusiveGateway id="G"/>`) },
  },
  {
    code: "reader.unknownAttribute",
    description: "an attribute outside the BPMN and CIB namespaces",
    refused: { xml: foreignAttribute(`x:a="1"`) },
    control: { xml: foreignAttribute("") },
  },
  {
    code: "reader.factNotCarried",
    description: "a CIB attribute the IL has no field for",
    evidence: "camunda:jobPriority",
    refused: { xml: model(`<bpmn:serviceTask id="T" camunda:delegateExpression="\${x}" camunda:jobPriority="5"/>`) },
    control: { xml: model(`<bpmn:serviceTask id="T" camunda:delegateExpression="\${x}"/>`) },
  },
  {
    code: "reader.factNotCarried",
    description: "a process carrying CIB history configuration the IL has no field for",
    evidence: "camunda:historyTimeToLive",
    refused: { xml: model("").replace('<bpmn:process id="P"', '<bpmn:process id="P" camunda:historyTimeToLive="180"') },
    control: { xml: model("") },
  },
  {
    code: "reader.unknownAttributeValue",
    description: "a decision result mapping the reader does not know",
    refused: { xml: model(`<bpmn:businessRuleTask id="R" camunda:decisionRef="d" camunda:mapDecisionResult="other"/>`) },
    control: { xml: model(`<bpmn:businessRuleTask id="R" camunda:decisionRef="d" camunda:mapDecisionResult="singleEntry"/>`) },
  },
  {
    code: "reader.unknownExtension",
    description: "an extension element outside the BPMN and CIB namespaces",
    refused: { xml: model(`<bpmn:task id="T"><bpmn:extensionElements><x:foo xmlns:x="urn:x"/></bpmn:extensionElements></bpmn:task>`) },
    control: { xml: task },
  },
  {
    code: "reader.eventDefinitionRef",
    description: "an Event naming a root-level definition, which pinned CIB never resolves",
    refused: { xml: catching(`<bpmn:eventDefinitionRef>Td</bpmn:eventDefinitionRef>`, `<bpmn:timerEventDefinition id="Td">${timerDuration}</bpmn:timerEventDefinition>`) },
    control: { xml: catching(timer()) },
  },
  {
    code: "reader.eventDefinitionOnElement",
    description: "a catch Event without an event definition",
    evidence: "catch Event without a definition",
    refused: { xml: model(`<bpmn:intermediateCatchEvent id="C"/>`) },
    control: { xml: catching(timer()) },
  },
  {
    code: "reader.eventDefinitionOnElement",
    description: "a Timer without a time",
    evidence: "timer without a time",
    refused: { xml: catching(`<bpmn:timerEventDefinition/>`) },
    control: { xml: catching(timer()) },
  },
  {
    code: "reader.eventDefinitionOnElement",
    description: "a Terminate definition on a start Event",
    evidence: "TerminateEventDefinition as a trigger",
    refused: { xml: model(`<bpmn:startEvent id="S"><bpmn:terminateEventDefinition/></bpmn:startEvent>`) },
    control: { xml: ending(`<bpmn:terminateEventDefinition/>`) },
  },
  {
    code: "reader.eventDefinitionOnElement",
    description: "a Timer definition on an End Event",
    evidence: "TimerEventDefinition as a throw",
    refused: { xml: ending(timer()) },
    control: { xml: catching(timer()) },
  },
  {
    code: "reader.eventDefinitionOnElement",
    description: "a boundary Event without a definition",
    evidence: "boundary Event without a definition or host",
    refused: { xml: model(`<bpmn:task id="T"/><bpmn:boundaryEvent id="B" attachedToRef="T"/>`) },
    control: { xml: boundaryOn("true") },
  },
  {
    code: "reader.standardLoop",
    description: "a standard loop on a Task",
    refused: { xml: model(`<bpmn:task id="T"><bpmn:standardLoopCharacteristics/></bpmn:task>`) },
    control: { xml: task },
  },
  {
    code: "reader.eventSubProcessStart",
    description: "an Event Sub-Process whose start Event has no trigger",
    refused: { xml: model(`<bpmn:subProcess id="E" triggeredByEvent="true"><bpmn:startEvent id="SS"/></bpmn:subProcess>`) },
    control: { xml: model(`<bpmn:subProcess id="E" triggeredByEvent="true"><bpmn:startEvent id="SS">${timer()}</bpmn:startEvent></bpmn:subProcess>`) },
  },
  {
    code: "reader.dataAssociationShape",
    description: "a Data Association without a source",
    evidence: "0 sourceRef values",
    refused: { xml: inputAssociation(`<bpmn:dataInputAssociation><bpmn:targetRef>I</bpmn:targetRef></bpmn:dataInputAssociation>`) },
    control: {
      xml: inputAssociation(`<bpmn:dataInputAssociation><bpmn:sourceRef>Prop</bpmn:sourceRef><bpmn:targetRef>I</bpmn:targetRef></bpmn:dataInputAssociation>`),
    },
  },
  {
    code: "reader.dataObjectReferenceWithoutObject",
    description: "a Data Association naming a Data Object reference that references no Data Object",
    evidence: "no dataObjectRef",
    refused: { xml: inputAssociation(`<bpmn:dataInputAssociation><bpmn:sourceRef>Ref</bpmn:sourceRef><bpmn:targetRef>I</bpmn:targetRef></bpmn:dataInputAssociation>`, `<bpmn:dataObjectReference id="Ref"/>`) },
    control: {
      xml: inputAssociation(`<bpmn:dataInputAssociation><bpmn:sourceRef>Ref</bpmn:sourceRef><bpmn:targetRef>I</bpmn:targetRef></bpmn:dataInputAssociation>`, `<bpmn:dataObjectReference id="Ref" dataObjectRef="Obj"/>`),
    },
  },
  {
    code: "source.schema",
    description: "a Data Association without the target the BPMN 2.0.2 XSD requires",
    evidence: "required child",
    refused: { xml: inputAssociation(`<bpmn:dataInputAssociation><bpmn:sourceRef>Prop</bpmn:sourceRef></bpmn:dataInputAssociation>`) },
    control: {
      xml: inputAssociation(`<bpmn:dataInputAssociation><bpmn:sourceRef>Prop</bpmn:sourceRef><bpmn:targetRef>I</bpmn:targetRef></bpmn:dataInputAssociation>`),
    },
  },
  {
    code: "reader.signalWithoutReference",
    description: "a Signal definition without a signal reference",
    refused: { xml: catching(`<bpmn:signalEventDefinition/>`) },
    control: { xml: catching(`<bpmn:signalEventDefinition signalRef="Sg"/>`, `<bpmn:signal id="Sg"/>`) },
  },
  {
    code: "reader.throwWithoutCode",
    description: "an End Event throwing an Error with no error reference",
    refused: { xml: ending(`<bpmn:errorEventDefinition/>`) },
    control: { xml: ending(`<bpmn:errorEventDefinition errorRef="Err"/>`, `<bpmn:error id="Err" errorCode="Failure"/>`) },
  },
  {
    code: "reader.throwWithoutCode",
    description: "an End Event throwing an Escalation with no escalation reference",
    refused: { xml: ending(`<bpmn:escalationEventDefinition/>`) },
    control: { xml: ending(`<bpmn:escalationEventDefinition escalationRef="Esc"/>`, `<bpmn:escalation id="Esc" escalationCode="Warning"/>`) },
  },
  {
    code: "throw.message.implementation",
    description: "a Message throw naming a Java class, which only a delegate binding replaces",
    evidence: "camunda:class",
    refused: { xml: ending(`<bpmn:messageEventDefinition camunda:class="org.example.Sender"/>`) },
    control: { xml: ending(`<bpmn:messageEventDefinition camunda:delegateExpression="\${sender}"/>`) },
  },
  {
    code: "throw.message.resultVariable",
    description: "a Message throw writing its delegate's result to a variable",
    refused: { xml: ending(`<bpmn:messageEventDefinition camunda:delegateExpression="\${sender}" camunda:resultVariable="r"/>`) },
    control: { xml: ending(`<bpmn:messageEventDefinition camunda:delegateExpression="\${sender}"/>`) },
  },
  {
    code: "throw.message.ioMapping",
    description: "a Message throw with CIB input parameters",
    refused: { xml: ending(`<bpmn:extensionElements><camunda:inputOutput><camunda:inputParameter name="a">1</camunda:inputParameter></camunda:inputOutput></bpmn:extensionElements><bpmn:messageEventDefinition camunda:delegateExpression="\${sender}"/>`) },
    control: { xml: ending(`<bpmn:messageEventDefinition camunda:delegateExpression="\${sender}"/>`) },
  },
  {
    code: "throw.message.asynchronous",
    description: "a Message throw with an asynchronous continuation",
    refused: { xml: model(`<bpmn:intermediateThrowEvent id="X" camunda:asyncBefore="true"><bpmn:messageEventDefinition camunda:delegateExpression="\${sender}"/></bpmn:intermediateThrowEvent>`) },
    control: { xml: model(`<bpmn:intermediateThrowEvent id="X"><bpmn:messageEventDefinition camunda:delegateExpression="\${sender}"/></bpmn:intermediateThrowEvent>`) },
  },
  {
    code: "throw.message.listener",
    description: "a Message throw with an execution listener",
    refused: { xml: ending(`<bpmn:extensionElements><camunda:executionListener event="start" delegateExpression="\${audit}"/></bpmn:extensionElements><bpmn:messageEventDefinition/>`) },
    control: { xml: ending(`<bpmn:messageEventDefinition/>`) },
  },
  {
    code: "reader.multiInstanceWithoutCount",
    description: "a Multi-Instance loop with neither a collection nor a cardinality",
    refused: { xml: model(`<bpmn:userTask id="U"><bpmn:multiInstanceLoopCharacteristics/></bpmn:userTask>`) },
    control: { xml: model(`<bpmn:userTask id="U"><bpmn:multiInstanceLoopCharacteristics camunda:collection="items"/></bpmn:userTask>`) },
  },
];

for (const row of rows) {
  test(`${row.description} is refused as ${row.code}`, async () => {
    const result = await read(row.refused);
    assert.ok(result.kind === "refused", JSON.stringify(result));
    assert.equal(result.code, row.code, result.evidence);
    if (row.evidence !== undefined) assert.ok(result.evidence.includes(row.evidence), result.evidence);
    if (row.control !== undefined) {
      const control = await read(row.control);
      assert.equal(control.kind, "read", `the control source is read: ${JSON.stringify(control)}`);
    }
  });
}
