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
import {
  CorrelationScalarPathLanguage,
  isWellFormedSemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import type {
  AcceptedBpmnCompilation,
  BpmnSourceIdentity,
} from "@bpmn-lean/bpmn-source";
import {
  findModdleElement,
  importCompiledBpmnGraph,
  moddleElement,
  moddleElements,
} from "./compiled-moddle-graph.ts";

const profile = "bpmn-2.0.2-message-key-correlation-draft";
const sourceUrl = new URL(
  "../../../scenarios/message-key-correlation/process.bpmn",
  import.meta.url,
);

async function compile(bytes: Uint8Array, semanticProfile = profile) {
  return await compileBpmnToSemanticProcess({
    bytes,
    sourceId: "message-key-correlation-process",
    expectedSha256: undefined,
    semanticProfile,
    sourceOverlay: null,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
}

type SourceMutation = Readonly<{
  name: string;
  mutate: (source: string) => string;
}>;

function replaceOnce(source: string, from: string, to: string): string {
  const index = source.indexOf(from);
  assert.notEqual(index, -1, `fixture no longer contains ${from}`);
  return source.slice(0, index) + to + source.slice(index + from.length);
}

function elementExtent(
  source: string,
  tag: string,
  id: string,
): Readonly<{ start: number; end: number }> {
  let start = -1;
  let searchFrom = 0;
  while (true) {
    const candidate = source.indexOf(`<${tag}`, searchFrom);
    assert.notEqual(candidate, -1, `fixture no longer contains ${tag}#${id}`);
    const openingEnd = source.indexOf(">", candidate);
    assert.notEqual(openingEnd, -1, `fixture has an unterminated ${tag} opening tag`);
    if (source.slice(candidate, openingEnd + 1).includes(`id="${id}"`)) {
      start = candidate;
      if (/\/\s*>$/u.test(source.slice(candidate, openingEnd + 1))) {
        return { start, end: openingEnd + 1 };
      }
      const closing = `</${tag}>`;
      const closingStart = source.indexOf(closing, openingEnd + 1);
      assert.notEqual(closingStart, -1, `fixture has no closing tag for ${tag}#${id}`);
      return { start, end: closingStart + closing.length };
    }
    searchFrom = openingEnd + 1;
  }
}

function replaceInElement(
  source: string,
  tag: string,
  id: string,
  from: string,
  to: string,
): string {
  const { start, end } = elementExtent(source, tag, id);
  const element = source.slice(start, end);
  const replaced = replaceOnce(element, from, to);
  return source.slice(0, start) + replaced + source.slice(end);
}

function duplicateElement(source: string, tag: string, id: string): string {
  const { start, end } = elementExtent(source, tag, id);
  const element = source.slice(start, end);
  return source.slice(0, end) + `\n${element}` + source.slice(end);
}

function relocateElement(
  source: string,
  tag: string,
  id: string,
  before: string,
): string {
  const { start, end } = elementExtent(source, tag, id);
  const element = source.slice(start, end);
  const without = source.slice(0, start) + source.slice(end);
  return replaceOnce(without, before, `${element}\n${before}`);
}

function requireAccepted(
  result: Awaited<ReturnType<typeof compile>>,
): AcceptedBpmnCompilation {
  if (result.status !== BpmnCompilationStatus.Accepted) {
    throw new Error(JSON.stringify(result.diagnostics));
  }
  return result;
}

const channel = {
  kind: MessageChannelKind.OperationMessage,
  interfaceId: "Interface_ClearingHouse",
  interfaceOperationId: "Operation_ConfirmSettlement",
  messageId: "Message_SettlementConfirmed",
} as const;

const payloadSelector = {
  language: CorrelationScalarPathLanguage,
  body: "payload",
} as const;

const processPropertySelector = {
  language: CorrelationScalarPathLanguage,
  body: "property:Property_SettlementReference",
  propertyId: "Property_SettlementReference",
} as const;

test("admits the exact context-backed Message correlation source and lowers both waits", async () => {
  const result = requireAccepted(await compile(await readFile(sourceUrl)));

  assert.equal(isWellFormedSemanticProcessProgram(result.semanticProcess), true);
  assert.deepEqual(
    result.checkedProcess.nodes.find(
      ({ id }) => id === "MessageCatch_InitialSettlement",
    ),
    {
      kind: CheckedNodeKind.PayloadMessageCatchEvent,
      id: "MessageCatch_InitialSettlement",
      channel,
      directOutput: {
        associationId: "DataOutputAssociation_SettlementReference",
        sourceDataOutputId: "DataOutput_InitialSettlementReference",
        sourceDataOutputName: "Initial settlement reference",
        targetPropertyId: "Property_SettlementReference",
      },
    },
  );
  assert.deepEqual(
    result.checkedProcess.nodes.find(
      ({ id }) => id === "MessageCatch_CorrelatedSettlement",
    ),
    {
      kind: CheckedNodeKind.CorrelatedPayloadMessageCatchEvent,
      id: "MessageCatch_CorrelatedSettlement",
      channel,
      correlationKeyId: "CorrelationKey_SettlementReference",
      correlationPropertyId: "CorrelationProperty_SettlementReference",
      payloadSelector,
      processPropertySelector,
    },
  );
  assert.deepEqual(
    result.semanticProcess.operations.find(
      ({ kind }) => kind === SemanticOperationKind.AwaitPayloadMessage,
    ),
    {
      id: "operation:MessageCatch_InitialSettlement",
      kind: SemanticOperationKind.AwaitPayloadMessage,
      origin: {
        kind: "bpmnElement",
        elementId: "MessageCatch_InitialSettlement",
      },
      input: "place:Flow_Instructed_InitialSettlement",
      output: "place:Flow_Initial_Correlated",
      message: { elementId: "MessageCatch_InitialSettlement", channel },
      directOutput: {
        associationId: "DataOutputAssociation_SettlementReference",
        sourceDataOutputId: "DataOutput_InitialSettlementReference",
        sourceDataOutputName: "Initial settlement reference",
        targetPropertyId: "Property_SettlementReference",
      },
    },
  );
  assert.deepEqual(
    result.semanticProcess.operations.find(
      ({ kind }) => kind === SemanticOperationKind.AwaitCorrelatedPayloadMessage,
    ),
    {
      id: "operation:MessageCatch_CorrelatedSettlement",
      kind: SemanticOperationKind.AwaitCorrelatedPayloadMessage,
      origin: {
        kind: "bpmnElement",
        elementId: "MessageCatch_CorrelatedSettlement",
      },
      input: "place:Flow_Initial_Correlated",
      output: "place:Flow_Correlated_Review",
      message: { elementId: "MessageCatch_CorrelatedSettlement", channel },
      correlationKeyId: "CorrelationKey_SettlementReference",
      correlationPropertyId: "CorrelationProperty_SettlementReference",
      payloadSelector,
      processPropertySelector,
    },
  );
});

test("rejects a second structurally equal CorrelationProperty in exact source", async () => {
  const xml = await readFile(sourceUrl, "utf8");
  const mutation = xml
    .replace(
      "  <bpmn:correlationProperty\n" +
        '    id="CorrelationProperty_SettlementReference"',
      "  <bpmn:correlationProperty\n" +
        '    id="CorrelationProperty_StructurallyEqual"\n' +
        '    name="Settlement reference">\n' +
        "    <bpmn:correlationPropertyRetrievalExpression\n" +
        '      id="RetrievalExpression_StructurallyEqual"\n' +
        '      messageRef="Message_SettlementConfirmed">\n' +
        "      <bpmn:messagePath\n" +
        '        id="MessagePath_StructurallyEqual"\n' +
        '        language="urn:bpmn-lean:correlation-scalar-path:v1">payload</bpmn:messagePath>\n' +
        "    </bpmn:correlationPropertyRetrievalExpression>\n" +
        "  </bpmn:correlationProperty>\n" +
        "  <bpmn:correlationProperty\n" +
        '    id="CorrelationProperty_SettlementReference"',
    )
    .replace(
      'correlationPropertyRef="CorrelationProperty_SettlementReference">\n' +
        "        <bpmn:dataPath",
      'correlationPropertyRef="CorrelationProperty_StructurallyEqual">\n' +
        "        <bpmn:dataPath",
    );

  assert.notEqual(mutation, xml);
  assert.equal(
    (await compile(new TextEncoder().encode(mutation))).status,
    BpmnCompilationStatus.Rejected,
  );
});

test("rejects a detached structurally equal CorrelationProperty by parser object identity", async () => {
  const bytes = await readFile(sourceUrl);
  const imported = await importCompiledBpmnGraph(
    new TextDecoder().decode(bytes),
    1_000,
  );
  assert.deepEqual(imported.warnings, []);
  const definitions = moddleElement(imported.rootElement, "definitions");
  const roots = moddleElements(definitions, "rootElements");
  const process = findModdleElement(roots, "id", "Process_SettlementCorrelation");
  const correlationProperty = findModdleElement(
    roots,
    "id",
    "CorrelationProperty_SettlementReference",
  );
  const subscription = moddleElements(process, "correlationSubscriptions")[0];
  const binding = subscription === undefined
    ? undefined
    : moddleElements(subscription, "correlationPropertyBinding")[0];
  if (binding === undefined) {
    throw new TypeError("missing correlation binding");
  }
  const structuralTwin = Object.assign(
    Object.create(Object.getPrototypeOf(correlationProperty)),
    correlationProperty,
  );
  (binding as Record<string, unknown>)["correlationPropertyRef"] = structuralTwin;

  const specifier = new URL(
    "../dist/message-key-correlation-source.js",
    import.meta.url,
  ).href;
  const loaded: unknown = await import(specifier);
  if (
    loaded === null || typeof loaded !== "object" ||
    !("compileMessageKeyCorrelationCheckedProcess" in loaded) ||
    typeof loaded.compileMessageKeyCorrelationCheckedProcess !== "function"
  ) {
    throw new TypeError("compiled correlation reader is unavailable");
  }
  const reader = loaded.compileMessageKeyCorrelationCheckedProcess as (
    root: unknown,
    source: BpmnSourceIdentity,
    overlay: null,
  ) => Readonly<{ checkedProcess: unknown }>;
  const result = reader(
    imported.rootElement,
    {
      kind: "bpmnSource",
      id: "message-key-correlation-process",
      sha256: "a".repeat(64),
      byteLength: bytes.byteLength,
      declaredEncoding: "UTF-8",
      decodedAs: "UTF-8",
    },
    null,
  );

  assert.equal(result.checkedProcess, undefined);
});

test("admits selector spellings that XML decodes to the same characters", async () => {
  const xml = await readFile(sourceUrl, "utf8");
  const equivalent = xml
    .replace(">payload</bpmn:messagePath>", ">paylo&#97;d</bpmn:messagePath>")
    .replace(
      ">property:Property_SettlementReference</bpmn:dataPath>",
      ">property&#58;Property_SettlementReference</bpmn:dataPath>",
    );

  assert.notEqual(equivalent, xml);
  requireAccepted(await compile(new TextEncoder().encode(equivalent)));
});

test("rejects every correlation reference and endpoint mutation", async (context) => {
  const xml = await readFile(sourceUrl, "utf8");
  const mutations: ReadonlyArray<SourceMutation> = [
    { name: "Message item definition", mutate: (source) => replaceInElement(source, "bpmn:message", "Message_SettlementConfirmed", "ItemDefinition_SettlementReference", "Property_SettlementReference") },
    { name: "Operation input Message", mutate: (source) => replaceInElement(source, "bpmn:operation", "Operation_ConfirmSettlement", "Message_SettlementConfirmed", "Property_SettlementReference") },
    { name: "retrieval Message", mutate: (source) => replaceInElement(source, "bpmn:correlationPropertyRetrievalExpression", "RetrievalExpression_SettlementReference", "Message_SettlementConfirmed", "Property_SettlementReference") },
    { name: "definitional Collaboration", mutate: (source) => replaceInElement(source, "bpmn:process", "Process_SettlementCorrelation", "Collaboration_SettlementCorrelation", "Conversation_Settlement") },
    { name: "Start outgoing", mutate: (source) => replaceInElement(source, "bpmn:startEvent", "StartEvent_PaymentInstructed", "Flow_Instructed_InitialSettlement", "Flow_Initial_Correlated") },
    { name: "first flow source", mutate: (source) => replaceInElement(source, "bpmn:sequenceFlow", "Flow_Instructed_InitialSettlement", "StartEvent_PaymentInstructed", "UserTask_ReviewSettlement") },
    { name: "first flow target", mutate: (source) => replaceInElement(source, "bpmn:sequenceFlow", "Flow_Instructed_InitialSettlement", "MessageCatch_InitialSettlement", "MessageCatch_CorrelatedSettlement") },
    { name: "initial catch incoming", mutate: (source) => replaceInElement(source, "bpmn:intermediateCatchEvent", "MessageCatch_InitialSettlement", "Flow_Instructed_InitialSettlement", "Flow_Review_Recorded") },
    { name: "initial catch outgoing", mutate: (source) => replaceInElement(source, "bpmn:intermediateCatchEvent", "MessageCatch_InitialSettlement", "Flow_Initial_Correlated", "Flow_Correlated_Review") },
    { name: "DataOutput item definition", mutate: (source) => replaceInElement(source, "bpmn:dataOutput", "DataOutput_InitialSettlementReference", "ItemDefinition_SettlementReference", "Property_SettlementReference") },
    { name: "association source", mutate: (source) => replaceInElement(source, "bpmn:dataOutputAssociation", "DataOutputAssociation_SettlementReference", "DataOutput_InitialSettlementReference", "Property_SettlementReference") },
    { name: "association target", mutate: (source) => replaceInElement(source, "bpmn:dataOutputAssociation", "DataOutputAssociation_SettlementReference", "Property_SettlementReference", "DataOutput_InitialSettlementReference") },
    { name: "OutputSet output", mutate: (source) => replaceInElement(source, "bpmn:outputSet", "OutputSet_InitialSettlement", "DataOutput_InitialSettlementReference", "Property_SettlementReference") },
    { name: "initial catch Message", mutate: (source) => replaceInElement(source, "bpmn:messageEventDefinition", "MessageEventDefinition_InitialSettlement", "Message_SettlementConfirmed", "Property_SettlementReference") },
    { name: "initial catch Operation", mutate: (source) => replaceInElement(source, "bpmn:messageEventDefinition", "MessageEventDefinition_InitialSettlement", "Operation_ConfirmSettlement", "Interface_ClearingHouse") },
    { name: "middle flow source", mutate: (source) => replaceInElement(source, "bpmn:sequenceFlow", "Flow_Initial_Correlated", "MessageCatch_InitialSettlement", "StartEvent_PaymentInstructed") },
    { name: "middle flow target", mutate: (source) => replaceInElement(source, "bpmn:sequenceFlow", "Flow_Initial_Correlated", "MessageCatch_CorrelatedSettlement", "UserTask_ReviewSettlement") },
    { name: "correlated catch incoming", mutate: (source) => replaceInElement(source, "bpmn:intermediateCatchEvent", "MessageCatch_CorrelatedSettlement", "Flow_Initial_Correlated", "Flow_Instructed_InitialSettlement") },
    { name: "correlated catch outgoing", mutate: (source) => replaceInElement(source, "bpmn:intermediateCatchEvent", "MessageCatch_CorrelatedSettlement", "Flow_Correlated_Review", "Flow_Review_Recorded") },
    { name: "correlated catch Message", mutate: (source) => replaceInElement(source, "bpmn:messageEventDefinition", "MessageEventDefinition_CorrelatedSettlement", "Message_SettlementConfirmed", "Property_SettlementReference") },
    { name: "correlated catch Operation", mutate: (source) => replaceInElement(source, "bpmn:messageEventDefinition", "MessageEventDefinition_CorrelatedSettlement", "Operation_ConfirmSettlement", "Interface_ClearingHouse") },
    { name: "review flow source", mutate: (source) => replaceInElement(source, "bpmn:sequenceFlow", "Flow_Correlated_Review", "MessageCatch_CorrelatedSettlement", "MessageCatch_InitialSettlement") },
    { name: "review flow target", mutate: (source) => replaceInElement(source, "bpmn:sequenceFlow", "Flow_Correlated_Review", "UserTask_ReviewSettlement", "EndEvent_SettlementRecorded") },
    { name: "User Task incoming", mutate: (source) => replaceInElement(source, "bpmn:userTask", "UserTask_ReviewSettlement", "Flow_Correlated_Review", "Flow_Initial_Correlated") },
    { name: "User Task outgoing", mutate: (source) => replaceInElement(source, "bpmn:userTask", "UserTask_ReviewSettlement", "Flow_Review_Recorded", "Flow_Instructed_InitialSettlement") },
    { name: "final flow source", mutate: (source) => replaceInElement(source, "bpmn:sequenceFlow", "Flow_Review_Recorded", "UserTask_ReviewSettlement", "MessageCatch_CorrelatedSettlement") },
    { name: "final flow target", mutate: (source) => replaceInElement(source, "bpmn:sequenceFlow", "Flow_Review_Recorded", "EndEvent_SettlementRecorded", "StartEvent_PaymentInstructed") },
    { name: "End incoming", mutate: (source) => replaceInElement(source, "bpmn:endEvent", "EndEvent_SettlementRecorded", "Flow_Review_Recorded", "Flow_Correlated_Review") },
    { name: "subscription key", mutate: (source) => replaceInElement(source, "bpmn:correlationSubscription", "CorrelationSubscription_SettlementReference", "CorrelationKey_SettlementReference", "CorrelationProperty_SettlementReference") },
    { name: "binding property", mutate: (source) => replaceInElement(source, "bpmn:correlationPropertyBinding", "CorrelationPropertyBinding_SettlementReference", "CorrelationProperty_SettlementReference", "Property_SettlementReference") },
    { name: "Process Participant", mutate: (source) => replaceInElement(source, "bpmn:participant", "Participant_SettlementProcess", "Process_SettlementCorrelation", "Collaboration_SettlementCorrelation") },
    { name: "initial Message Flow source", mutate: (source) => replaceInElement(source, "bpmn:messageFlow", "MessageFlow_InitialSettlement", "Participant_ExternalClearingHouse", "Participant_SettlementProcess") },
    { name: "initial Message Flow target", mutate: (source) => replaceInElement(source, "bpmn:messageFlow", "MessageFlow_InitialSettlement", "MessageCatch_InitialSettlement", "MessageCatch_CorrelatedSettlement") },
    { name: "initial Message Flow Message", mutate: (source) => replaceInElement(source, "bpmn:messageFlow", "MessageFlow_InitialSettlement", "Message_SettlementConfirmed", "Property_SettlementReference") },
    { name: "correlated Message Flow source", mutate: (source) => replaceInElement(source, "bpmn:messageFlow", "MessageFlow_CorrelatedSettlement", "Participant_ExternalClearingHouse", "Participant_SettlementProcess") },
    { name: "correlated Message Flow target", mutate: (source) => replaceInElement(source, "bpmn:messageFlow", "MessageFlow_CorrelatedSettlement", "MessageCatch_CorrelatedSettlement", "MessageCatch_InitialSettlement") },
    { name: "correlated Message Flow Message", mutate: (source) => replaceInElement(source, "bpmn:messageFlow", "MessageFlow_CorrelatedSettlement", "Message_SettlementConfirmed", "Property_SettlementReference") },
    { name: "Conversation external Participant", mutate: (source) => replaceInElement(source, "bpmn:conversation", "Conversation_Settlement", "Participant_ExternalClearingHouse", "Participant_SettlementProcess") },
    { name: "Conversation Process Participant", mutate: (source) => replaceInElement(source, "bpmn:conversation", "Conversation_Settlement", "Participant_SettlementProcess", "Participant_ExternalClearingHouse") },
    { name: "Conversation initial Message Flow", mutate: (source) => replaceInElement(source, "bpmn:conversation", "Conversation_Settlement", "MessageFlow_InitialSettlement", "MessageFlow_CorrelatedSettlement") },
    { name: "Conversation correlated Message Flow", mutate: (source) => replaceInElement(source, "bpmn:conversation", "Conversation_Settlement", "MessageFlow_CorrelatedSettlement", "MessageFlow_InitialSettlement") },
    { name: "key CorrelationProperty", mutate: (source) => replaceInElement(source, "bpmn:correlationKey", "CorrelationKey_SettlementReference", "CorrelationProperty_SettlementReference", "Property_SettlementReference") },
  ];

  for (const mutation of mutations) {
    await context.test(mutation.name, async () => {
      const mutated = mutation.mutate(xml);
      assert.notEqual(mutated, xml);
      assert.equal(
        (await compile(new TextEncoder().encode(mutated))).status,
        BpmnCompilationStatus.Rejected,
      );
    });
  }
});

test("rejects every correlation containment and cardinality mutation", async (context) => {
  const xml = await readFile(sourceUrl, "utf8");
  const containmentMutations: ReadonlyArray<SourceMutation> = [
    { name: "ItemDefinition under Process", mutate: (source) => relocateElement(source, "bpmn:itemDefinition", "ItemDefinition_SettlementReference", "  </bpmn:process>") },
    { name: "Message under Process", mutate: (source) => relocateElement(source, "bpmn:message", "Message_SettlementConfirmed", "  </bpmn:process>") },
    { name: "Interface under Collaboration", mutate: (source) => relocateElement(source, "bpmn:interface", "Interface_ClearingHouse", "  </bpmn:collaboration>") },
    { name: "Operation under Definitions", mutate: (source) => relocateElement(source, "bpmn:operation", "Operation_ConfirmSettlement", "</bpmn:definitions>") },
    { name: "CorrelationProperty under Process", mutate: (source) => relocateElement(source, "bpmn:correlationProperty", "CorrelationProperty_SettlementReference", "  </bpmn:process>") },
    { name: "retrieval under Definitions", mutate: (source) => relocateElement(source, "bpmn:correlationPropertyRetrievalExpression", "RetrievalExpression_SettlementReference", "</bpmn:definitions>") },
    { name: "Process under Collaboration", mutate: (source) => relocateElement(source, "bpmn:process", "Process_SettlementCorrelation", "  </bpmn:collaboration>") },
    { name: "Property under Definitions", mutate: (source) => relocateElement(source, "bpmn:property", "Property_SettlementReference", "</bpmn:definitions>") },
    { name: "DataOutput under Process", mutate: (source) => relocateElement(source, "bpmn:dataOutput", "DataOutput_InitialSettlementReference", "  </bpmn:process>") },
    { name: "association under Process", mutate: (source) => relocateElement(source, "bpmn:dataOutputAssociation", "DataOutputAssociation_SettlementReference", "  </bpmn:process>") },
    { name: "OutputSet under Process", mutate: (source) => relocateElement(source, "bpmn:outputSet", "OutputSet_InitialSettlement", "  </bpmn:process>") },
    { name: "EventDefinition under Process", mutate: (source) => relocateElement(source, "bpmn:messageEventDefinition", "MessageEventDefinition_CorrelatedSettlement", "  </bpmn:process>") },
    { name: "subscription under Definitions", mutate: (source) => relocateElement(source, "bpmn:correlationSubscription", "CorrelationSubscription_SettlementReference", "</bpmn:definitions>") },
    { name: "binding under Process", mutate: (source) => relocateElement(source, "bpmn:correlationPropertyBinding", "CorrelationPropertyBinding_SettlementReference", "  </bpmn:process>") },
    { name: "Collaboration under Process", mutate: (source) => relocateElement(source, "bpmn:collaboration", "Collaboration_SettlementCorrelation", "  </bpmn:process>") },
    { name: "Participant under Definitions", mutate: (source) => relocateElement(source, "bpmn:participant", "Participant_SettlementProcess", "</bpmn:definitions>") },
    { name: "MessageFlow under Definitions", mutate: (source) => relocateElement(source, "bpmn:messageFlow", "MessageFlow_CorrelatedSettlement", "</bpmn:definitions>") },
    { name: "Conversation under Definitions", mutate: (source) => relocateElement(source, "bpmn:conversation", "Conversation_Settlement", "</bpmn:definitions>") },
    { name: "CorrelationKey under Collaboration", mutate: (source) => relocateElement(source, "bpmn:correlationKey", "CorrelationKey_SettlementReference", "  </bpmn:collaboration>") },
  ];
  const cardinalityElements = [
    ["bpmn:itemDefinition", "ItemDefinition_SettlementReference"],
    ["bpmn:message", "Message_SettlementConfirmed"],
    ["bpmn:interface", "Interface_ClearingHouse"],
    ["bpmn:operation", "Operation_ConfirmSettlement"],
    ["bpmn:correlationProperty", "CorrelationProperty_SettlementReference"],
    ["bpmn:correlationPropertyRetrievalExpression", "RetrievalExpression_SettlementReference"],
    ["bpmn:process", "Process_SettlementCorrelation"],
    ["bpmn:property", "Property_SettlementReference"],
    ["bpmn:dataOutput", "DataOutput_InitialSettlementReference"],
    ["bpmn:dataOutputAssociation", "DataOutputAssociation_SettlementReference"],
    ["bpmn:outputSet", "OutputSet_InitialSettlement"],
    ["bpmn:messageEventDefinition", "MessageEventDefinition_CorrelatedSettlement"],
    ["bpmn:correlationSubscription", "CorrelationSubscription_SettlementReference"],
    ["bpmn:correlationPropertyBinding", "CorrelationPropertyBinding_SettlementReference"],
    ["bpmn:collaboration", "Collaboration_SettlementCorrelation"],
    ["bpmn:participant", "Participant_SettlementProcess"],
    ["bpmn:messageFlow", "MessageFlow_CorrelatedSettlement"],
    ["bpmn:conversation", "Conversation_Settlement"],
    ["bpmn:correlationKey", "CorrelationKey_SettlementReference"],
  ] as const;
  const cardinalityMutations = cardinalityElements.map(([tag, id]) => ({
    name: `duplicate ${tag}#${id}`,
    mutate: (source: string) => duplicateElement(source, tag, id),
  }));

  for (const mutation of [...containmentMutations, ...cardinalityMutations]) {
    await context.test(mutation.name, async () => {
      const mutated = mutation.mutate(xml);
      assert.notEqual(mutated, xml);
      assert.equal(
        (await compile(new TextEncoder().encode(mutated))).status,
        BpmnCompilationStatus.Rejected,
      );
    });
  }
});

test("keeps the source outside both existing direct Message profiles", async () => {
  const bytes = await readFile(sourceUrl);

  for (
    const oldProfile of [
      "bpmn-2.0.2-intermediate-catch-message-draft",
      "bpmn-2.0.2-message-payload-catch-draft",
    ]
  ) {
    assert.equal(
      (await compile(bytes, oldProfile)).status,
      BpmnCompilationStatus.Rejected,
      oldProfile,
    );
  }
});
