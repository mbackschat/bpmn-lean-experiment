/**
 * Locks the exact Intermediate Catch Message Event payload source slice and its lowering.
 *
 * The registered source deliberately keeps the Message, Event DataOutput, association, and target
 * Property identities distinct. The checked expectation therefore proves that presentation names do
 * not choose the write target, while the refusal cases below discriminate object-identity reference
 * resolution from structural or identifier-based equivalence.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  CheckedNodeKind,
  MessageChannelKind,
  SemanticOperationKind,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import { isWellFormedSemanticProcessProgram } from "@bpmn-lean/semantic-core";
import type {
  AcceptedBpmnCompilation,
  BpmnSourceLimits,
} from "@bpmn-lean/bpmn-source";

const payloadProfile = "bpmn-2.0.2-message-payload-catch-draft";
const sourceUrl = new URL(
  "../../../scenarios/message-payload-catch/process.bpmn",
  import.meta.url,
);
const limits: BpmnSourceLimits = Object.freeze({
  maxBytes: 1024 * 1024,
  parserDeadlineMs: 1_000,
});

const channel = {
  kind: MessageChannelKind.OperationMessage,
  interfaceId: "Interface_ClearingHouse",
  interfaceOperationId: "Operation_ConfirmSettlement",
  messageId: "Message_SettlementConfirmed",
} as const;
const directOutput = {
  associationId: "DataOutputAssociation_SettlementReference",
  sourceDataOutputId: "DataOutput_ConfirmedReference",
  sourceDataOutputName: "Confirmed settlement reference",
  targetPropertyId: "Property_SettlementReference",
} as const;

async function compile(
  bytes: Uint8Array,
  semanticProfile = payloadProfile,
): Promise<Awaited<ReturnType<typeof compileBpmnToSemanticProcess>>> {
  return await compileBpmnToSemanticProcess({
    bytes,
    sourceId: "message-payload-catch-process",
    expectedSha256: undefined,
    semanticProfile,
    sourceOverlay: null,
    limits,
  });
}

function requireAccepted(
  result: Awaited<ReturnType<typeof compile>>,
): AcceptedBpmnCompilation {
  if (result.status !== BpmnCompilationStatus.Accepted) {
    throw new Error(JSON.stringify(result.diagnostics));
  }
  return result;
}

test("admits one direct catch-Event payload output and lowers it", async () => {
  const result = requireAccepted(await compile(await readFile(sourceUrl)));

  assert.equal(isWellFormedSemanticProcessProgram(result.semanticProcess), true);
  assert.deepEqual(
    result.checkedProcess.nodes.find(
      ({ id }) => id === "MessageCatch_SettlementConfirmed",
    ),
    {
      kind: CheckedNodeKind.PayloadMessageCatchEvent,
      id: "MessageCatch_SettlementConfirmed",
      channel,
      directOutput,
    },
  );
  assert.deepEqual(
    result.semanticProcess.operations.find(
      ({ kind }) => kind === SemanticOperationKind.AwaitPayloadMessage,
    ),
    {
      id: "operation:MessageCatch_SettlementConfirmed",
      kind: SemanticOperationKind.AwaitPayloadMessage,
      origin: {
        kind: "bpmnElement",
        elementId: "MessageCatch_SettlementConfirmed",
      },
      input: "place:Flow_Instructed_Confirm",
      output: "place:Flow_Confirm_Review",
      message: {
        elementId: "MessageCatch_SettlementConfirmed",
        channel,
      },
      directOutput,
    },
  );
  assert.deepEqual(result.checkedProcess.nodes.map(({ kind }) => kind).sort(), [
    CheckedNodeKind.NoneStartEvent,
    CheckedNodeKind.PayloadMessageCatchEvent,
    CheckedNodeKind.UserTask,
    CheckedNodeKind.NoneEndEvent,
  ].sort());
  assert.equal(
    result.semanticProcess.operations.some(
      ({ kind }) => kind === SemanticOperationKind.AwaitMessage,
    ),
    false,
  );
});

test("requires Message and DataOutput item references to resolve to one object", async () => {
  const xml = await readFile(sourceUrl, "utf8");
  const mutation = xml
    .replace(
      '  <bpmn:itemDefinition id="ItemDefinition_SettlementReference" />',
      '  <bpmn:itemDefinition id="ItemDefinition_SettlementReference" />\n' +
        '  <bpmn:itemDefinition id="ItemDefinition_StructurallyEqual" />',
    )
    .replace(
      'itemSubjectRef="ItemDefinition_SettlementReference"',
      'itemSubjectRef="ItemDefinition_StructurallyEqual"',
    );

  assert.notEqual(mutation, xml);
  assert.equal(
    (await compile(new TextEncoder().encode(mutation))).status,
    BpmnCompilationStatus.Rejected,
  );
});

test("keeps the payload-bearing source outside every other current profile", async () => {
  const bytes = await readFile(sourceUrl);

  for (
    const profile of [
      "bpmn-2.0.2-intermediate-catch-message-draft",
      "bpmn-2.0.2-activity-data-output-user-task-draft",
    ]
  ) {
    assert.equal(
      (await compile(bytes, profile)).status,
      BpmnCompilationStatus.Rejected,
      profile,
    );
  }
});

test("refuses every model outside the reviewed catch-Event payload slice", async () => {
  const xml = await readFile(sourceUrl, "utf8");
  const mutations: ReadonlyArray<readonly [string, string]> = [
    [
      "renamed Definitions",
      xml.replace(
        "Definitions_MessagePayloadSettlement",
        "Definitions_Renamed",
      ),
    ],
    [
      "renamed Message presentation",
      xml.replace('name="Settlement confirmed"', 'name="Other message"'),
    ],
    [
      "renamed Interface presentation",
      xml.replace('name="Clearing house"', 'name="Other interface"'),
    ],
    [
      "renamed Operation presentation",
      xml.replace('name="Confirm settlement"', 'name="Other operation"'),
    ],
    [
      "renamed User Task presentation",
      xml.replace('name="Review settlement"', 'name="Other task"'),
    ],
    [
      "renamed DataOutput presentation",
      xml.replace(
        'name="Confirmed settlement reference"',
        'name="Other output"',
      ),
    ],
    [
      "missing Message item reference",
      xml.replace(
        '\n    itemRef="ItemDefinition_SettlementReference"',
        "",
      ),
    ],
    [
      "unresolved Message item reference",
      xml.replace(
        'itemRef="ItemDefinition_SettlementReference"',
        'itemRef="ItemDefinition_Missing"',
      ),
    ],
    [
      "second ItemDefinition",
      xml.replace(
        '  <bpmn:itemDefinition id="ItemDefinition_SettlementReference" />',
        '  <bpmn:itemDefinition id="ItemDefinition_SettlementReference" />\n' +
          '  <bpmn:itemDefinition id="ItemDefinition_Second" />',
      ),
    ],
    [
      "ItemDefinition structure",
      xml.replace(
        '<bpmn:itemDefinition id="ItemDefinition_SettlementReference" />',
        '<bpmn:itemDefinition id="ItemDefinition_SettlementReference" structureRef="bpmn:tString" />',
      ),
    ],
    [
      "ItemDefinition item kind",
      xml.replace(
        '<bpmn:itemDefinition id="ItemDefinition_SettlementReference" />',
        '<bpmn:itemDefinition id="ItemDefinition_SettlementReference" itemKind="Information" />',
      ),
    ],
    // The parser exposes the omitted metamodel default as false, so only own-key admission can
    // distinguish this explicit source attribute from the reviewed omission.
    [
      "explicit scalar ItemDefinition",
      xml.replace(
        '<bpmn:itemDefinition id="ItemDefinition_SettlementReference" />',
        '<bpmn:itemDefinition id="ItemDefinition_SettlementReference" isCollection="false" />',
      ),
    ],
    [
      "collection ItemDefinition",
      xml.replace(
        '<bpmn:itemDefinition id="ItemDefinition_SettlementReference" />',
        '<bpmn:itemDefinition id="ItemDefinition_SettlementReference" isCollection="true" />',
      ),
    ],
    [
      "Process Property item subject",
      xml.replace(
        '<bpmn:property id="Property_SettlementReference" />',
        '<bpmn:property id="Property_SettlementReference" itemSubjectRef="ItemDefinition_SettlementReference" />',
      ),
    ],
    [
      "Process Property data state",
      xml.replace(
        '<bpmn:property id="Property_SettlementReference" />',
        '<bpmn:property id="Property_SettlementReference">\n' +
          '      <bpmn:dataState name="available" />\n' +
          "    </bpmn:property>",
      ),
    ],
    [
      "second Process Property",
      xml.replace(
        '<bpmn:property id="Property_SettlementReference" />',
        '<bpmn:property id="Property_SettlementReference" />\n' +
          '    <bpmn:property id="Property_Second" />',
      ),
    ],
    [
      "missing DataOutput item subject",
      xml.replace(
        '\n        itemSubjectRef="ItemDefinition_SettlementReference"',
        "",
      ),
    ],
    [
      "unresolved DataOutput item subject",
      xml.replace(
        'itemSubjectRef="ItemDefinition_SettlementReference"',
        'itemSubjectRef="ItemDefinition_Missing"',
      ),
    ],
    // Like ItemDefinition, DataOutput carries a prototype default that must not erase explicit false.
    [
      "explicit scalar DataOutput",
      xml.replace(
        'name="Confirmed settlement reference"',
        'name="Confirmed settlement reference" isCollection="false"',
      ),
    ],
    [
      "collection DataOutput",
      xml.replace(
        'name="Confirmed settlement reference"',
        'name="Confirmed settlement reference" isCollection="true"',
      ),
    ],
    [
      "second DataOutput",
      xml.replace(
        "      <bpmn:dataOutputAssociation",
        '      <bpmn:dataOutput id="DataOutput_Second" name="Second" itemSubjectRef="ItemDefinition_SettlementReference" />\n' +
          "      <bpmn:dataOutputAssociation",
      ),
    ],
    [
      "optional output reference",
      xml.replace(
        "        <bpmn:dataOutputRefs>DataOutput_ConfirmedReference</bpmn:dataOutputRefs>",
        "        <bpmn:dataOutputRefs>DataOutput_ConfirmedReference</bpmn:dataOutputRefs>\n" +
          "        <bpmn:optionalOutputRefs>DataOutput_ConfirmedReference</bpmn:optionalOutputRefs>",
      ),
    ],
    [
      "while-executing output reference",
      xml.replace(
        "        <bpmn:dataOutputRefs>DataOutput_ConfirmedReference</bpmn:dataOutputRefs>",
        "        <bpmn:dataOutputRefs>DataOutput_ConfirmedReference</bpmn:dataOutputRefs>\n" +
          "        <bpmn:whileExecutingOutputRefs>DataOutput_ConfirmedReference</bpmn:whileExecutingOutputRefs>",
      ),
    ],
    [
      "unresolved required output reference",
      xml.replace(
        ">DataOutput_ConfirmedReference</bpmn:dataOutputRefs>",
        ">DataOutput_Missing</bpmn:dataOutputRefs>",
      ),
    ],
    // CatchEvent.outputSet is a singleton that bpmn-moddle can project after discarding one raw
    // occurrence; the profile's exact raw/imported cardinality lock must catch that erasure.
    [
      "duplicate direct OutputSet child",
      xml.replace(
        "      </bpmn:outputSet>",
        "      </bpmn:outputSet>\n" +
          '      <bpmn:outputSet id="OutputSet_Second">\n' +
          "        <bpmn:dataOutputRefs>DataOutput_ConfirmedReference</bpmn:dataOutputRefs>\n" +
          "      </bpmn:outputSet>",
      ),
    ],
    [
      "direct input set",
      xml.replace(
        '      <bpmn:outputSet id="OutputSet_SettlementConfirmed">',
        '      <bpmn:inputSet id="InputSet_Forbidden" />\n' +
          '      <bpmn:outputSet id="OutputSet_SettlementConfirmed">',
      ),
    ],
    [
      "reversed association direction",
      xml.replace(
        "        <bpmn:sourceRef>DataOutput_ConfirmedReference</bpmn:sourceRef>\n" +
          "        <bpmn:targetRef>Property_SettlementReference</bpmn:targetRef>",
        "        <bpmn:sourceRef>Property_SettlementReference</bpmn:sourceRef>\n" +
          "        <bpmn:targetRef>DataOutput_ConfirmedReference</bpmn:targetRef>",
      ),
    ],
    [
      "unresolved association source",
      xml.replace(
        ">DataOutput_ConfirmedReference</bpmn:sourceRef>",
        ">DataOutput_Missing</bpmn:sourceRef>",
      ),
    ],
    [
      "unresolved association target",
      xml.replace(
        ">Property_SettlementReference</bpmn:targetRef>",
        ">Property_Missing</bpmn:targetRef>",
      ),
    ],
    [
      "second association source",
      xml.replace(
        "        <bpmn:sourceRef>DataOutput_ConfirmedReference</bpmn:sourceRef>",
        "        <bpmn:sourceRef>DataOutput_ConfirmedReference</bpmn:sourceRef>\n" +
          "        <bpmn:sourceRef>Property_SettlementReference</bpmn:sourceRef>",
      ),
    ],
    [
      "association transformation",
      xml.replace(
        "        <bpmn:targetRef>Property_SettlementReference</bpmn:targetRef>",
        "        <bpmn:targetRef>Property_SettlementReference</bpmn:targetRef>\n" +
          '        <bpmn:transformation id="Transformation_Forbidden">payload</bpmn:transformation>',
      ),
    ],
    [
      "association assignment",
      xml.replace(
        "        <bpmn:targetRef>Property_SettlementReference</bpmn:targetRef>",
        "        <bpmn:targetRef>Property_SettlementReference</bpmn:targetRef>\n" +
          "        <bpmn:assignment>\n" +
          "          <bpmn:from>payload</bpmn:from>\n" +
          "          <bpmn:to>target</bpmn:to>\n" +
          "        </bpmn:assignment>",
      ),
    ],
    [
      "second DataOutputAssociation",
      xml.replace(
        "      </bpmn:dataOutputAssociation>",
        "      </bpmn:dataOutputAssociation>\n" +
          '      <bpmn:dataOutputAssociation id="DataOutputAssociation_Second">\n' +
          "        <bpmn:sourceRef>DataOutput_ConfirmedReference</bpmn:sourceRef>\n" +
          "        <bpmn:targetRef>Property_SettlementReference</bpmn:targetRef>\n" +
          "      </bpmn:dataOutputAssociation>",
      ),
    ],
    [
      "second MessageEventDefinition",
      xml.replace(
        '        operationRef="Operation_ConfirmSettlement" />',
        '        operationRef="Operation_ConfirmSettlement" />\n' +
          '      <bpmn:messageEventDefinition id="MessageEventDefinition_Second"\n' +
          '        messageRef="Message_SettlementConfirmed"\n' +
          '        operationRef="Operation_ConfirmSettlement" />',
      ),
    ],
    [
      "parallel Multiple Event",
      xml.replace(
        '<bpmn:intermediateCatchEvent id="MessageCatch_SettlementConfirmed">',
        '<bpmn:intermediateCatchEvent id="MessageCatch_SettlementConfirmed" parallelMultiple="true">',
      ),
    ],
    [
      "direct ioSpecification",
      xml.replace(
        "      <bpmn:dataOutput",
        '      <bpmn:ioSpecification id="IoSpecification_Forbidden" />\n' +
          "      <bpmn:dataOutput",
      ),
    ],
    [
      "rewired first route",
      xml.replace(
        'targetRef="MessageCatch_SettlementConfirmed"',
        'targetRef="UserTask_ReviewSettlement"',
      ),
    ],
    [
      "foreign Process attribute",
      xml
        .replace(
          'xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"',
          'xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"\n' +
            '  xmlns:vendor="urn:vendor"',
        )
        .replace(
          '<bpmn:process id="Process_MessagePayloadSettlement" isExecutable="true">',
          '<bpmn:process id="Process_MessagePayloadSettlement" isExecutable="true" vendor:extra="forbidden">',
        ),
    ],
  ];

  for (const [label, mutation] of mutations) {
    assert.notEqual(mutation, xml, label);
    assert.equal(
      (await compile(new TextEncoder().encode(mutation))).status,
      BpmnCompilationStatus.Rejected,
      label,
    );
  }
});
