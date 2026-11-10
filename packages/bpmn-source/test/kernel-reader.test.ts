/** Locks the BPMN-to-kernel-IL reader's boundary: it reads every BPMN fact and refuses only what it cannot read. */
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";

import { kernelProfileOptions, readKernelProgram, ReadRefusalCode } from "@bpmn-lean/bpmn-source";
import type { KernelJson, KernelRead } from "@bpmn-lean/bpmn-source";

type Json = Record<string, any>;

const camunda = "http://camunda.org/schema/1.0/bpmn";

function model(body: string, roots = ""): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="${camunda}" id="D" targetNamespace="urn:t">
${roots}<bpmn:process id="P" isExecutable="true">${body}</bpmn:process></bpmn:definitions>`;
}

/** The same model with its Definitions naming the Simple Boolean language, the only one the reader parses. */
const declared = (xml: string): string => xml.replace(`id="D"`, `id="D" expressionLanguage="urn:bpmn-lean:expression:simple-boolean:v1"`);

const read = (xml: string, profile = "any-profile"): Promise<KernelRead> => readKernelProgram({
  bytes: new TextEncoder().encode(xml),
  overlay: null,
  profile,
  limits: { maxBytes: 1 << 20, parserDeadlineMs: 2_000 },
}, kernelProfileOptions([]));

async function program(xml: string): Promise<Json> {
  const result = await read(xml);
  assert.equal(result.kind, "read", JSON.stringify(result));
  return (result as Extract<KernelRead, { kind: "read" }>).program as Json;
}

async function refusal(xml: string): Promise<string> {
  const result = await read(xml);
  assert.equal(result.kind, "refused", JSON.stringify(result));
  return (result as Extract<KernelRead, { kind: "refused" }>).code;
}

const element = (p: Json, id: string): Json => {
  const found = p.elements.find((entry: Json) => (Object.values(entry)[0] as Json).header.id === id);
  assert.ok(found, `element ${id}`);
  return found;
};

test("an exclusive gateway keeps document order of its candidates, an inclusive one id order", async () => {
  const p = await program(declared(model(`<bpmn:startEvent id="S"/>
    <bpmn:exclusiveGateway id="X" default="z"/><bpmn:inclusiveGateway id="I"/><bpmn:endEvent id="E"/>
    <bpmn:sequenceFlow id="s" sourceRef="S" targetRef="X"/>
    <bpmn:sequenceFlow id="b" sourceRef="X" targetRef="I"><bpmn:conditionExpression xsi:type="bpmn:tFormalExpression" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">isPresent(a)</bpmn:conditionExpression></bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="a" sourceRef="X" targetRef="I"><bpmn:conditionExpression xsi:type="bpmn:tFormalExpression" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">isNull(a)</bpmn:conditionExpression></bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="z" sourceRef="X" targetRef="I"/>
    <bpmn:sequenceFlow id="q" sourceRef="I" targetRef="E"><bpmn:conditionExpression xsi:type="bpmn:tFormalExpression" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">true</bpmn:conditionExpression></bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="p" sourceRef="I" targetRef="E"><bpmn:conditionExpression xsi:type="bpmn:tFormalExpression" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">false</bpmn:conditionExpression></bpmn:sequenceFlow>`)));
  assert.deepEqual(element(p, "X").gateway.payload.kind, { exclusive: { candidates: ["b", "a"], default: "z" } });
  assert.deepEqual(element(p, "I").gateway.payload.kind, { inclusive: { candidates: ["p", "q"], default: null } });
  const flow = (id: string): Json => p.flows.find((entry: Json) => entry.id === id);
  assert.deepEqual(flow("b").condition, { simpleBoolean: { body: { isPresent: { name: "a" } } } });
  assert.equal(flow("z").condition, null);
});

test("a non-instantiating Event-Based Gateway: its arms are the targets of its outgoing flows", async () => {
  const p = await program(model(`<bpmn:eventBasedGateway id="G"/><bpmn:intermediateCatchEvent id="C"><bpmn:messageEventDefinition messageRef="M"/></bpmn:intermediateCatchEvent>
    <bpmn:sequenceFlow id="f" sourceRef="G" targetRef="C"/>`, `<bpmn:message id="M"/>`));
  assert.deepEqual(element(p, "G").gateway.payload.kind, { eventBased: { instantiation: "none" } });
  assert.deepEqual(element(p, "G").gateway.payload.outgoing, ["f"]);
});

test("every element header names its source identifier, and a called process its definition", async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="urn:t">
<bpmn:process id="P" isExecutable="true"><bpmn:callActivity id="Call" calledElement="Q"/></bpmn:process>
<bpmn:process id="Q" isExecutable="true"><bpmn:task id="Inner"/></bpmn:process></bpmn:definitions>`;
  const p = await program(xml);
  assert.deepEqual(element(p, "Call").activity.header, { id: "Call", origin: { definition: null, sourceId: "Call" }, sourceType: "callActivity", parent: null });
  assert.deepEqual(p.processes, [{
    definition: { key: "Q", version: null, versionTag: null, deployment: null, tenant: null, sourceSha256: null },
    children: ["Inner"],
    variables: [],
    executable: true,
  }]);
});

test("each process declares its Properties, Data Objects, their references and its own Data Inputs and Outputs", async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="urn:t">
<bpmn:process id="P" isExecutable="true"><bpmn:property id="Prop"/><bpmn:dataObject id="Obj"/>
  <bpmn:dataObjectReference id="ObjRef" dataObjectRef="Obj"/><bpmn:dataStoreReference id="Store"/>
  <bpmn:subProcess id="Sub"><bpmn:dataObject id="Inner"/></bpmn:subProcess><bpmn:callActivity id="Call" calledElement="Q"/></bpmn:process>
<bpmn:process id="Q" isExecutable="true"><bpmn:ioSpecification><bpmn:dataInput id="In"/><bpmn:dataOutput id="Out"/>
  <bpmn:inputSet><bpmn:dataInputRefs>In</bpmn:dataInputRefs></bpmn:inputSet><bpmn:outputSet><bpmn:dataOutputRefs>Out</bpmn:dataOutputRefs></bpmn:outputSet>
  </bpmn:ioSpecification><bpmn:property id="QProp"/><bpmn:task id="T"/></bpmn:process></bpmn:definitions>`;
  const p = await program(xml);
  assert.deepEqual(p.variables, ["Obj", "ObjRef", "Prop"]);
  assert.deepEqual(p.processes[0].variables, ["In", "Out", "QProp"]);
});

test("each mapping names the syntax that wrote it", async () => {
  const p = await program(model(`<bpmn:property id="Prop"/>
    <bpmn:userTask id="U"><bpmn:extensionElements><camunda:inputOutput><camunda:inputParameter name="x">\${y}</camunda:inputParameter></camunda:inputOutput></bpmn:extensionElements>
      <bpmn:ioSpecification><bpmn:dataInput id="I"/><bpmn:inputSet/><bpmn:outputSet/></bpmn:ioSpecification>
      <bpmn:dataInputAssociation><bpmn:sourceRef>Prop</bpmn:sourceRef><bpmn:targetRef>I</bpmn:targetRef></bpmn:dataInputAssociation></bpmn:userTask>
    <bpmn:callActivity id="Call" calledElement="Other" camunda:calledElementTenantId="\${tenant}">
      <bpmn:extensionElements><camunda:in source="a" target="b"/><camunda:out sourceExpression="\${c}" target="d"/></bpmn:extensionElements></bpmn:callActivity>`));
  assert.deepEqual(element(p, "U").activity.payload.envelope.inputs, [
    { target: "I", source: { variable: { name: "Prop" } }, dialect: "dataAssociation" },
    { target: "x", source: { variable: { name: "y" } }, dialect: "ioParameter" },
  ]);
  const call = element(p, "Call").activity.payload.work.call.payload;
  assert.deepEqual(call.inputs, [{ target: "b", source: { variable: { name: "a" } }, dialect: "callVariable" }]);
  assert.deepEqual(call.outputs, [{ target: "d", source: { variable: { name: "c" } }, dialect: "ioParameter" }]);
  assert.deepEqual(call.tenant, { expression: { body: { variable: { name: "tenant" } } } });
  assert.equal(Object.hasOwn(call, "unsetSourceReadsNull"), false);
});

test("an Activity carries its default flow and asynchronous continuations in its envelope", async () => {
  const p = await program(declared(model(`<bpmn:task id="T" default="d" camunda:asyncBefore="true" camunda:asyncAfter="true"/><bpmn:task id="A" camunda:async="true"/>
    <bpmn:userTask id="U"><bpmn:multiInstanceLoopCharacteristics camunda:collection="items" isSequential="true"/></bpmn:userTask><bpmn:endEvent id="E"/>
    <bpmn:sequenceFlow id="c" sourceRef="T" targetRef="E"><bpmn:conditionExpression xsi:type="bpmn:tFormalExpression" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">true</bpmn:conditionExpression></bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="d" sourceRef="T" targetRef="E"/>`)));
  const envelope = element(p, "T").activity.payload.envelope;
  assert.equal(envelope.defaultFlow, "d");
  assert.equal(envelope.asyncBefore, true);
  assert.equal(envelope.asyncAfter, true);
  assert.equal(element(p, "A").activity.payload.envelope.asyncBefore, true);
  assert.equal(element(p, "U").activity.payload.envelope.defaultFlow, null);
  assert.equal(element(p, "U").activity.payload.envelope.multiInstance.mutableCollection, "entrySnapshot");
  assert.deepEqual(p.flows.find((entry: Json) => entry.id === "c").condition, { simpleBoolean: { body: { literal: { value: true } } } });
});

test("a Multi-Instance loop carries its own asynchronous continuations and the literal names CIB binds", async () => {
  const io = (id: string): string => `<bpmn:ioSpecification><bpmn:dataInput id="${id}s" isCollection="true"/><bpmn:dataInput id="${id}"/>
      <bpmn:inputSet><bpmn:dataInputRefs>${id}s</bpmn:dataInputRefs><bpmn:dataInputRefs>${id}</bpmn:dataInputRefs></bpmn:inputSet><bpmn:outputSet/></bpmn:ioSpecification>
    <bpmn:dataInputAssociation><bpmn:sourceRef>R</bpmn:sourceRef><bpmn:targetRef>${id}s</bpmn:targetRef></bpmn:dataInputAssociation>
    <bpmn:dataInputAssociation><bpmn:sourceRef>Item_${id}</bpmn:sourceRef><bpmn:targetRef>${id}</bpmn:targetRef></bpmn:dataInputAssociation>`;
  const p = await program(model(`<bpmn:dataObject id="O" isCollection="true"/><bpmn:dataObjectReference id="R" dataObjectRef="O"/>
    <bpmn:userTask id="U" camunda:asyncBefore="true">${io("In")}
      <bpmn:multiInstanceLoopCharacteristics camunda:async="true" camunda:asyncAfter="true">
        <bpmn:loopDataInputRef>Ins</bpmn:loopDataInputRef><bpmn:inputDataItem id="Item_In" name="item"/>
      </bpmn:multiInstanceLoopCharacteristics></bpmn:userTask>
    <bpmn:userTask id="V">${io("Vn")}
      <bpmn:multiInstanceLoopCharacteristics camunda:asyncBefore="true">
        <bpmn:loopDataInputRef>Vns</bpmn:loopDataInputRef><bpmn:inputDataItem id="Item_Vn"/>
      </bpmn:multiInstanceLoopCharacteristics></bpmn:userTask>`));
  const u = element(p, "U").activity.payload.envelope;
  assert.deepEqual([u.asyncBefore, u.asyncAfter], [true, false]);
  assert.deepEqual(u.multiInstance, {
    mode: "parallel", count: { collection: { items: { variable: { name: "R" } } } }, elementVariable: null,
    completionCondition: null, inputDataItem: "In", outputDataItem: null, outputCollection: null,
    mutableCollection: "entrySnapshot", asyncBefore: true, asyncAfter: true, loopDataInputRef: "Ins", inputDataItemName: "item",
  });
  const v = element(p, "V").activity.payload.envelope;
  assert.deepEqual([v.asyncBefore, v.asyncAfter], [false, false]);
  assert.deepEqual([v.multiInstance.asyncBefore, v.multiInstance.asyncAfter, v.multiInstance.loopDataInputRef, v.multiInstance.inputDataItemName],
    [true, false, "Vns", null]);
});

test("a Transaction carries its BPMN method, Compensate when absent", async () => {
  const p = await program(model(`<bpmn:transaction id="A"/><bpmn:transaction id="C" method="##Compensate"/><bpmn:transaction id="I" method="##Image"/>
    <bpmn:transaction id="S" method="##Store"/><bpmn:transaction id="O" method="urn:x:method"/>`));
  const method = (id: string): KernelJson => element(p, id).scope.payload.kind.transaction.payload.method;
  assert.deepEqual([method("A"), method("C"), method("I"), method("S"), method("O")],
    ["compensate", "compensate", "image", "store", { other: { uri: "urn:x:method" } }]);
});

test("throws carry their message, binding and Signal propagation", async () => {
  const p = await program(model(`<bpmn:endEvent id="Err"><bpmn:errorEventDefinition errorRef="E1"/></bpmn:endEvent>
    <bpmn:endEvent id="ErrX"><bpmn:errorEventDefinition errorRef="E2"/></bpmn:endEvent>
    <bpmn:intermediateThrowEvent id="Msg"><bpmn:messageEventDefinition messageRef="M"/></bpmn:intermediateThrowEvent>
    <bpmn:intermediateThrowEvent id="MsgD"><bpmn:messageEventDefinition messageRef="M" camunda:delegateExpression="\${sender}"/></bpmn:intermediateThrowEvent>
    <bpmn:intermediateThrowEvent id="Sig"><bpmn:signalEventDefinition signalRef="S" camunda:async="true"><bpmn:extensionElements>
      <camunda:in variables="all" local="true"/><camunda:in businessKey="\${key}"/><camunda:in source="a" target="b"/></bpmn:extensionElements></bpmn:signalEventDefinition></bpmn:intermediateThrowEvent>`,
  `<bpmn:error id="E1" errorCode="c1" camunda:errorMessage="failed"/><bpmn:error id="E2" errorCode="c2" camunda:errorMessage="\${why}"/>
    <bpmn:message id="M"/><bpmn:signal id="S" name="s"/>`));
  const record = (id: string): Json => element(p, id).event.payload.role.throw.record;
  assert.deepEqual(record("Err"), { error: { payload: { code: "c1", message: { literal: { value: "failed" } } } } });
  assert.deepEqual(record("ErrX").error.payload.message, { expression: { body: { variable: { name: "why" } } } });
  assert.deepEqual(record("Msg"), { message: { payload: { binding: null, payload: [] } } });
  assert.deepEqual(record("MsgD").message.payload.binding, { protocol: "##WebService", operation: "${sender}" });
  assert.deepEqual(record("Sig"), { signal: { payload: {
    name: { literal: { value: "S" } },
    payload: [{ target: "b", source: { variable: { name: "a" } }, dialect: "callVariable" }],
    propagateAll: true,
    localOnly: true,
    businessKey: { variable: { name: "key" } },
    asynchronous: true,
  } } });
});

test("a Message throw's Message has no IL field and is reported", async () => {
  const result = await read(model(`<bpmn:intermediateThrowEvent id="Msg"><bpmn:messageEventDefinition messageRef="M"/></bpmn:intermediateThrowEvent>`,
    `<bpmn:message id="M"/>`));
  assert.equal(result.kind, "read", JSON.stringify(result));
  assert.deepEqual((result as Extract<KernelRead, { kind: "read" }>).notCarried, [{ element: "Msg", fact: "messageRef" }]);
});

test("a Business Rule Task carries its decision binding and result mapping", async () => {
  const p = await program(model(`<bpmn:businessRuleTask id="R" camunda:decisionRef="d" camunda:decisionRefBinding="version"
    camunda:decisionRefVersion="3" camunda:mapDecisionResult="singleEntry" camunda:resultVariable="r"/><bpmn:businessRuleTask id="Latest" camunda:decisionRef="d"/>`));
  assert.deepEqual(element(p, "R").activity.payload.work, { rule: { payload: {
    decision: { literal: { value: "d" } },
    resultVariable: "r",
    binding: { version: { value: { literal: { value: "3" } } } },
    resultMapping: "singleEntry",
    tenant: null,
  } } });
  assert.deepEqual(element(p, "Latest").activity.payload.work.rule.payload.binding, "latest");
  assert.deepEqual(element(p, "Latest").activity.payload.work.rule.payload.resultMapping, "resultList");
  assert.equal(await refusal(model(`<bpmn:businessRuleTask id="R" camunda:decisionRef="d" camunda:mapDecisionResult="other"/>`)),
    ReadRefusalCode.UnknownAttributeValue);
});

test("the profile options are the full record, each non-default selected by the relation the kernel names", () => {
  assert.deepEqual(kernelProfileOptions([]), {
    relations: [],
    evaluator: "simpleBoolean",
    submission: "outputSet",
    scopeChainSubmissionBytes: null,
    undeclaredWrite: "refused",
    errorPathOutputs: "none",
    technicalFailure: "hostFailure",
    incidentProcessCancellation: false,
    continuationFailure: "rolledBack",
    conditionOrder: "afterOutputs",
    messageCorrelation: "modeledKey",
    deliveryVariables: "mappedOnly",
    multiInstanceFinalBody: "conditionEveryCompletion",
    multiInstanceOutputs: "aggregates",
    compensationOrder: "dependency",
    compensationHandlerFailure: "failsInstance",
    abnormalScopeEnd: "withoutOutflow",
    unhandledError: "failsInstance",
    errorCatchVariables: "refused",
    callBindingTime: "programAssembly",
    timerZone: null,
    multiInstanceBinding: "dataAssociations",
    effectResultValues: "outputSet",
    outputContext: "submission",
  });
  const relations = ["CIB-EXT-0010", "CIB-EXT-0020", "CIB-EXT-0016", "CIB-CFG-0008", "CIB-OP-0009", "CIB-EXT-0026",
    "CIB-INT-0011", "CIB-EXT-0025", "CIB-INT-0009", "CIB-LIM-0001", "CIB-INT-0007", "CIB-INT-0013", "CIB-EXT-0028"];
  assert.deepEqual(kernelProfileOptions(relations), {
    relations,
    evaluator: "simpleBoolean",
    submission: "installsVariables",
    scopeChainSubmissionBytes: 16_384,
    undeclaredWrite: "atInstanceRoot",
    errorPathOutputs: "mapped",
    technicalFailure: "incident",
    incidentProcessCancellation: true,
    continuationFailure: "incident",
    conditionOrder: "beforeOutputs",
    messageCorrelation: "apiCriteria",
    deliveryVariables: "installs",
    multiInstanceFinalBody: "modeSpecific",
    multiInstanceOutputs: "none",
    compensationOrder: "dependency",
    compensationHandlerFailure: "failsInstance",
    abnormalScopeEnd: "completesNormally",
    unhandledError: "endsThrowingPath",
    errorCatchVariables: "eventScope",
    callBindingTime: "programAssembly",
    timerZone: null,
    multiInstanceBinding: "dataAssociations",
    effectResultValues: "outputSet",
    outputContext: "submission",
  });
  assert.equal(kernelProfileOptions(["CIB-EXT-0031"]).outputContext, "activityScope");
  assert.equal(kernelProfileOptions(["CIB-INT-0014"]).multiInstanceBinding, "loopReferences");
  assert.equal(kernelProfileOptions(["CIB-EXT-0015"]).effectResultValues, "activityLocals");
  assert.equal(kernelProfileOptions(["CIB-EXT-0005"]).submission, "installsVariables");
  for (const creates of ["CIB-EXT-0005", "CIB-EXT-0007", "CIB-EXT-0009", "CIB-EXT-0020"]) {
    assert.equal(kernelProfileOptions([creates]).undeclaredWrite, "atInstanceRoot", creates);
  }
  assert.equal(kernelProfileOptions(["CIB-EXT-0010"]).undeclaredWrite, "refused");
  assert.equal(kernelProfileOptions(["CIB-EXT-0004"]).errorPathOutputs, "mapped");
  assert.equal(kernelProfileOptions(["CIB-EXT-0009"]).errorPathOutputs, "mapped");
  assert.equal(kernelProfileOptions(["CIB-EXT-0013"]).technicalFailure, "incident");
  assert.equal(kernelProfileOptions(["CIB-OP-0008"]).technicalFailure, "incident");
});

test("every User Task assignment and date attribute the BPMN sets is populated", async () => {
  const p = await program(model(`<bpmn:userTask id="U" name="N" camunda:assignee="\${who}" camunda:candidateUsers="a, b" camunda:candidateGroups="g"
    camunda:formKey="form" camunda:dueDate="2030-01-01" camunda:followUpDate="\${later}" camunda:priority="7"/>`));
  assert.deepEqual(element(p, "U").activity.payload.work.user.payload, {
    name: "N",
    assignee: { expression: { body: { variable: { name: "who" } } } },
    candidateUsers: [{ literal: { value: "a" } }, { literal: { value: "b" } }],
    candidateGroups: [{ literal: { value: "g" } }],
    formKey: "form",
    formFields: [],
    dueDate: { literal: { value: "2030-01-01" } },
    followUpDate: { expression: { body: { variable: { name: "later" } } } },
    priority: { literal: { value: "7" } },
  });
});

test("error and escalation variables are read from their event definitions", async () => {
  const p = await program(model(`<bpmn:task id="T"/><bpmn:boundaryEvent id="B" attachedToRef="T">
      <bpmn:errorEventDefinition errorRef="Err" camunda:errorCodeVariable="c" camunda:errorMessageVariable="m"/></bpmn:boundaryEvent>
    <bpmn:boundaryEvent id="C" attachedToRef="T" cancelActivity="false">
      <bpmn:escalationEventDefinition escalationRef="Esc" camunda:escalationCodeVariable="v"/></bpmn:boundaryEvent>`,
  `<bpmn:error id="Err" errorCode="E1"/><bpmn:escalation id="Esc" escalationCode="X1"/>`));
  const [error, escalation] = element(p, "T").activity.payload.envelope.boundaries as Json[];
  assert.deepEqual(error?.subscription.trigger.error.payload, { code: "E1", codeVariable: "c", messageVariable: "m" });
  assert.deepEqual(escalation?.subscription.trigger.escalation.payload, { code: "X1", codeVariable: "v" });
  assert.equal(escalation?.interrupting, false);
});

test("semantic choices are emitted in full shape and left to Kernel.Admission", async () => {
  const eventSubProcess = await program(model(`<bpmn:startEvent id="S"/><bpmn:subProcess id="ESP" triggeredByEvent="true">
    <bpmn:startEvent id="ES"><bpmn:messageEventDefinition messageRef="M"/></bpmn:startEvent><bpmn:endEvent id="EE"/>
    <bpmn:sequenceFlow id="ef" sourceRef="ES" targetRef="EE"/></bpmn:subProcess>`, `<bpmn:message id="M"/>`));
  const kind = element(eventSubProcess, "ESP").scope.payload.kind.eventSubProcess;
  assert.equal(kind.interrupting, true);
  assert.deepEqual(kind.start.trigger.message.payload.name, { literal: { value: "M" } });
  assert.ok(element(eventSubProcess, "ES").start.payload.subscription);

  const foreignCondition = await program(model(`<bpmn:exclusiveGateway id="X"/><bpmn:endEvent id="E"/>
    <bpmn:sequenceFlow id="f" sourceRef="X" targetRef="E"><bpmn:conditionExpression xsi:type="bpmn:tFormalExpression" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\${a &gt; 1}</bpmn:conditionExpression></bpmn:sequenceFlow>`));
  assert.deepEqual(element(foreignCondition, "X").gateway.payload.kind.exclusive.candidates, ["f"]);
  assert.deepEqual(foreignCondition.flows[0].condition, { juel: { nodes: [
    { identifier: { name: "a" } }, { integer: { digits: "1" } }, { binary: { payload: { op: "gt", left: 0, right: 1 } } },
  ] } });

  const compensationInput = await program(model(`<bpmn:property id="Prop"/><bpmn:userTask id="U"/>
    <bpmn:boundaryEvent id="B" attachedToRef="U"><bpmn:compensateEventDefinition/></bpmn:boundaryEvent>
    <bpmn:serviceTask id="H" isForCompensation="true"><bpmn:ioSpecification><bpmn:dataInput id="I"/><bpmn:inputSet/><bpmn:outputSet/></bpmn:ioSpecification>
      <bpmn:dataInputAssociation><bpmn:sourceRef>Prop</bpmn:sourceRef><bpmn:targetRef>I</bpmn:targetRef></bpmn:dataInputAssociation></bpmn:serviceTask>
    <bpmn:association id="A" sourceRef="B" targetRef="H"/>`));
  assert.equal(element(compensationInput, "U").activity.payload.envelope.compensationHandler, "H");
  assert.deepEqual(element(compensationInput, "H").activity.payload.envelope.inputs, [{ target: "I", source: { variable: { name: "Prop" } }, dialect: "dataAssociation" }]);
});

test("a condition with no named language is read as JUEL (CIB-EXT-0030), never as Simple Boolean", async () => {
  const flowWith = (language: string): string => model(`<bpmn:exclusiveGateway id="X" default="z"/><bpmn:endEvent id="E"/>
    <bpmn:sequenceFlow id="c" sourceRef="X" targetRef="E"><bpmn:conditionExpression xsi:type="bpmn:tFormalExpression" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"${language}>isPresent(a)</bpmn:conditionExpression></bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="z" sourceRef="X" targetRef="E"/>`);
  const condition = async (xml: string): Promise<unknown> => (await program(xml)).flows.find((entry: Json) => entry.id === "c").condition;
  assert.deepEqual(await condition(flowWith("")), { juel: { nodes: [{ text: { value: "isPresent(a)" } }] } });
  assert.deepEqual(await condition(declared(flowWith(""))), { simpleBoolean: { body: { isPresent: { name: "a" } } } });
  assert.deepEqual(await condition(flowWith(` language="urn:bpmn-lean:expression:simple-boolean:v1"`)), { simpleBoolean: { body: { isPresent: { name: "a" } } } });
});

test("a Send Task is read as an effect only as CIB-EXT-0023's configured handler", async () => {
  const p = await program(model(`<bpmn:sendTask id="Class" camunda:class="x.Y"/><bpmn:sendTask id="Bpmn" implementation="urn:x" operationRef="O"/>
    <bpmn:sendTask id="Named" messageRef="M" camunda:delegateExpression="\${d}"/>
    <bpmn:sendTask id="Output" camunda:delegateExpression="\${d}"><bpmn:extensionElements><camunda:inputOutput><camunda:outputParameter name="r">x</camunda:outputParameter></camunda:inputOutput></bpmn:extensionElements></bpmn:sendTask>`,
  `<bpmn:message id="M"/><bpmn:interface id="I" name="I"><bpmn:operation id="O" name="O"><bpmn:inMessageRef>M</bpmn:inMessageRef></bpmn:operation></bpmn:interface>`));
  for (const id of ["Class", "Bpmn", "Named", "Output"]) {
    assert.ok(Object.hasOwn(element(p, id).activity.payload.work, "send"), id);
    assert.equal(element(p, id).activity.header.sourceType, "sendTask", id);
  }
});

test("a Send Task without an implementation is read as Send work, a declared one as an effect", async () => {
  const p = await program(model(`<bpmn:sendTask id="Plain" messageRef="M"/><bpmn:sendTask id="Delegate" camunda:delegateExpression="\${d}"/>`, `<bpmn:message id="M"/>`));
  assert.deepEqual(element(p, "Plain").activity.payload.work, { send: { payload: {
    binding: { protocol: "##WebService", operation: "" },
    recipient: null,
    correlation: [],
    messageRef: "M",
    operationRef: null,
  } } });
  assert.equal(element(p, "Plain").activity.header.sourceType, "sendTask");
  assert.deepEqual(element(p, "Delegate").activity.payload.work, { service: { payload: { protocol: "##WebService", operation: "${d}" } } });
});

test("an unknown element, foreign attribute or unsafe source is refused with a stable code", async () => {
  assert.equal(await refusal(model(`<bpmn:complexGateway id="G"/>`)), ReadRefusalCode.UnknownElement);
  assert.equal(await refusal(`<?xml version="1.0"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:x="urn:x" id="D" targetNamespace="urn:t"><bpmn:process id="P" isExecutable="true"><bpmn:task id="T" x:a="1"/></bpmn:process></bpmn:definitions>`), ReadRefusalCode.UnknownAttribute);
  assert.equal(await refusal(model(`<bpmn:unknownThing id="T"/>`)), ReadRefusalCode.ParserWarning);
  assert.equal(await refusal(model(`<bpmn:boundaryEvent id="B" cancelActivity="1"/>`)), ReadRefusalCode.SourceAmbiguousBoolean);
  assert.equal(await refusal(`<!DOCTYPE x><a/>`), ReadRefusalCode.SourceDoctype);
  assert.equal(await refusal(model(`<bpmn:task id="T"><bpmn:standardLoopCharacteristics/></bpmn:task>`)), ReadRefusalCode.StandardLoop);
});

test("a CIB attribute the IL has no field for is refused, never dropped", async () => {
  // No profile rule yet proves an uncarried CIB attribute safe (CLAUDE.md, non-negotiable boundaries), and CIB may act
  // on it, so admitting the model would claim behaviour the kernel does not have.
  const result = await read(model(`<bpmn:serviceTask id="T" camunda:delegateExpression="\${x}" camunda:asyncBefore="true"/>
    <bpmn:businessRuleTask id="R" camunda:decisionRef="d" camunda:resultVariableName="r"/>`));
  assert.equal(result.kind, "refused");
  assert.deepEqual(result.kind === "refused" ? [result.code, result.element, result.evidence] : null,
    [ReadRefusalCode.FactNotCarried, "R", "camunda:resultVariableName"]);
});

test("a conditional Activity outflow, an Activity default and a Transaction method are carried, not reported", async () => {
  const result = await read(model(`<bpmn:task id="T" default="d"/><bpmn:transaction id="Tx" method="##Image"/><bpmn:endEvent id="E"/>
    <bpmn:sequenceFlow id="c" sourceRef="T" targetRef="E"><bpmn:conditionExpression xsi:type="bpmn:tFormalExpression" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">true</bpmn:conditionExpression></bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="d" sourceRef="T" targetRef="E"/>`));
  assert.equal(result.kind, "read", JSON.stringify(result));
  assert.deepEqual((result as Extract<KernelRead, { kind: "read" }>).notCarried, []);
});

test("a Multi-Instance loop without a count has no IL shape, and a conditional Event without a condition no schema", async () => {
  assert.equal(await refusal(model(`<bpmn:userTask id="U"><bpmn:multiInstanceLoopCharacteristics/></bpmn:userTask>`)), ReadRefusalCode.MultiInstanceWithoutCount);
  assert.equal(await refusal(model(`<bpmn:intermediateCatchEvent id="C"><bpmn:conditionalEventDefinition/></bpmn:intermediateCatchEvent>`)), ReadRefusalCode.SourceSchema);
});

test("the reader does not depend on the profile: only the program's identity changes", async () => {
  const xml = model(`<bpmn:userTask id="U"/>`);
  const left = await read(xml, "profile-a") as Extract<KernelRead, { kind: "read" }>;
  const right = await read(xml, "profile-b") as Extract<KernelRead, { kind: "read" }>;
  const withoutProfile = (program: KernelJson): Json => ({ ...(program as Json), identity: { ...(program as Json).identity, profile: "" } });
  assert.deepEqual(withoutProfile(left.program), withoutProfile(right.program));
});

test("the reader imports nothing from semantic-core", async () => {
  const directory = new URL("../src/kernel-reader/", import.meta.url);
  for (const name of await readdir(directory)) {
    const source = await readFile(new URL(name, directory), "utf8");
    assert.doesNotMatch(source, /@bpmn-lean\/semantic-core/u, name);
  }
});
