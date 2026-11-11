/**
 * Program assembly (PC-SCOPE-03, R-CALL-1): a deployment's program carries a renamed copy of every other deployment's
 * process its Calls name, transitively. Each reference kind a copy renames has its own test, so that a reference left
 * pointing at the source's identifier, which would bind a copy to another copy's element, fails by name.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { assembleProgram, carriedId, kernelProfileOptions, readKernelProgram } from "@bpmn-lean/bpmn-source";
import type { AssemblyDeployment, KernelRead } from "@bpmn-lean/bpmn-source";

type Json = Record<string, any>;

const definitions = (namespace: string, body: string): string => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
  xmlns:b="urn:b" id="D" targetNamespace="${namespace}">${body}</bpmn:definitions>`;

const caller = definitions("urn:a", `<bpmn:process id="Caller" isExecutable="true">
  <bpmn:startEvent id="S"/><bpmn:callActivity id="Call" calledElement="b:Callee"/><bpmn:sequenceFlow id="f" sourceRef="S" targetRef="Call"/>
</bpmn:process>`);

/** One element of every reference kind; the same identifiers recur in every copy. */
const callee = definitions("urn:b", `<bpmn:process id="Callee" isExecutable="true" camunda:versionTag="t1">
  <bpmn:startEvent id="S"/>
  <bpmn:exclusiveGateway id="X" default="xd"/>
  <bpmn:task id="Work" default="wd"/>
  <bpmn:boundaryEvent id="Late" attachedToRef="Work"><bpmn:timerEventDefinition><bpmn:timeDuration>PT1M</bpmn:timeDuration></bpmn:timerEventDefinition></bpmn:boundaryEvent>
  <bpmn:subProcess id="Sub"><bpmn:task id="Inner"/></bpmn:subProcess>
  <bpmn:task id="Comp"/>
  <bpmn:boundaryEvent id="CompB" attachedToRef="Comp"><bpmn:compensateEventDefinition/></bpmn:boundaryEvent>
  <bpmn:task id="Handler" isForCompensation="true"/>
  <bpmn:intermediateThrowEvent id="Undo"><bpmn:compensateEventDefinition activityRef="Comp"/></bpmn:intermediateThrowEvent>
  <bpmn:intermediateThrowEvent id="Jump"><bpmn:linkEventDefinition name="L"/></bpmn:intermediateThrowEvent>
  <bpmn:intermediateCatchEvent id="Land"><bpmn:linkEventDefinition name="L"/></bpmn:intermediateCatchEvent>
  <bpmn:callActivity id="Deeper" calledElement="Leaf"/>
  <bpmn:endEvent id="E"/>
  <bpmn:sequenceFlow id="s" sourceRef="S" targetRef="X"/>
  <bpmn:sequenceFlow id="xc" sourceRef="X" targetRef="Work"><bpmn:conditionExpression>\${go}</bpmn:conditionExpression></bpmn:sequenceFlow>
  <bpmn:sequenceFlow id="xd" sourceRef="X" targetRef="Sub"/>
  <bpmn:sequenceFlow id="wd" sourceRef="Work" targetRef="E"/>
  <bpmn:sequenceFlow id="wc" sourceRef="Work" targetRef="E"><bpmn:conditionExpression>\${go}</bpmn:conditionExpression></bpmn:sequenceFlow>
  <bpmn:sequenceFlow id="lf" sourceRef="Late" targetRef="E"/>
  <bpmn:association id="A" associationDirection="One" sourceRef="CompB" targetRef="Handler"/>
</bpmn:process>`);

const leaf = definitions("urn:b", `<bpmn:process id="Leaf" isExecutable="true"><bpmn:task id="Inner"/></bpmn:process>`);

async function deployment(deploymentId: number, xml: string): Promise<AssemblyDeployment> {
  const read: KernelRead = await readKernelProgram({
    bytes: new TextEncoder().encode(xml), overlay: null, profile: "any-profile", limits: { maxBytes: 1 << 20, parserDeadlineMs: 2_000 },
  }, kernelProfileOptions([]));
  assert.equal(read.kind, "read", JSON.stringify(read));
  const { program, versionTag } = read as Extract<KernelRead, { kind: "read" }>;
  return { deploymentId, program, versionTag };
}

/** The caller deployed as 1, the callee as 2 and 3, the leaf as 4; the program of deployment 1. */
async function assembled(): Promise<Json> {
  const population = [await deployment(1, caller), await deployment(2, callee), await deployment(3, callee), await deployment(4, leaf)];
  return assembleProgram(population, 1) as Json;
}

const element = (program: Json, id: string): Json => {
  const found = program.elements.find((entry: Json) => (Object.values(entry)[0] as Json).header.id === id);
  assert.ok(found, `element ${id}`);
  return Object.values(found)[0] as Json;
};

const flow = (program: Json, id: string): Json => {
  const found = program.flows.find((entry: Json) => entry.id === id);
  assert.ok(found, `flow ${id}`);
  return found;
};

test("each copy is stamped with its key, namespace, deployment, version tag and source digest, and nothing else", async () => {
  const program = await assembled();
  const sha = (await deployment(2, callee)).program as Json;
  assert.deepEqual(program.processes.map((process: Json) => process.definition), [
    { key: "Callee", namespace: "urn:b", version: null, versionTag: "t1", deployment: 2, tenant: null, sourceSha256: sha.identity.sourceSha256 },
    { key: "Callee", namespace: "urn:b", version: null, versionTag: "t1", deployment: 3, tenant: null, sourceSha256: sha.identity.sourceSha256 },
    { key: "Leaf", namespace: "urn:b", version: null, versionTag: null, deployment: 4, tenant: null, sourceSha256: program.processes[2].definition.sourceSha256 },
  ]);
  assert.deepEqual(program.identity, ((await deployment(1, caller)).program as Json).identity);
});

test("a copy's element identifiers are renamed by deployment and keep the author's identifier as their origin", async () => {
  const program = await assembled();
  for (const deploymentId of [2, 3]) {
    const header = element(program, carriedId("Work", deploymentId)).header;
    assert.deepEqual(header.origin, { definition: null, sourceId: "Work" });
  }
  assert.equal(program.elements.filter((entry: Json) => (Object.values(entry)[0] as Json).header.origin.sourceId === "S").length, 3);
});

test("a copy's process lists its renamed top-level elements, and its nested elements their renamed parent", async () => {
  const program = await assembled();
  assert.ok(program.processes[0].children.includes(carriedId("Sub", 2)));
  assert.ok(!program.processes[0].children.includes(carriedId("Inner", 2)));
  assert.equal(element(program, carriedId("Inner", 2)).header.parent, carriedId("Sub", 2));
  assert.deepEqual(element(program, carriedId("Sub", 3)).payload.children, [carriedId("Inner", 3)]);
});

test("a copy's flows are renamed with their source and target, and only its own flows are copied", async () => {
  const program = await assembled();
  assert.deepEqual(flow(program, carriedId("s", 2)), { id: carriedId("s", 2), source: carriedId("S", 2), target: carriedId("X", 2), condition: null });
  assert.equal(program.flows.length, 1 + 2 * 6);
});

test("a copy's incoming and outgoing flows are renamed on Activities, Events, Gateways and starts", async () => {
  const program = await assembled();
  assert.deepEqual(element(program, carriedId("S", 2)).payload.outgoing, [carriedId("s", 2)]);
  assert.deepEqual(element(program, carriedId("X", 2)).payload.incoming, [carriedId("s", 2)]);
  assert.deepEqual(element(program, carriedId("Work", 2)).payload.envelope.incoming, [carriedId("xc", 2)]);
  assert.deepEqual(element(program, carriedId("E", 2)).payload.incoming, [carriedId("wd", 2), carriedId("wc", 2), carriedId("lf", 2)]);
});

test("a copy's Exclusive candidates and default flow are renamed", async () => {
  const program = await assembled();
  assert.deepEqual(element(program, carriedId("X", 3)).payload.kind, { exclusive: { candidates: [carriedId("xc", 3)], default: carriedId("xd", 3) } });
});

test("a copy's Activity default flow is renamed", async () => {
  const program = await assembled();
  assert.equal(element(program, carriedId("Work", 2)).payload.envelope.defaultFlow, carriedId("wd", 2));
});

test("a copy's boundaries are renamed with their flows and keep the author's identifier", async () => {
  const program = await assembled();
  const [boundary] = element(program, carriedId("Work", 2)).payload.envelope.boundaries;
  assert.deepEqual([boundary.id, boundary.sourceId, boundary.outgoing], [carriedId("Late", 2), "Late", [carriedId("lf", 2)]]);
  assert.equal(flow(program, carriedId("lf", 2)).source, carriedId("Late", 2));
});

test("a copy's compensation handler and compensation throw are renamed", async () => {
  const program = await assembled();
  assert.deepEqual(element(program, carriedId("Comp", 2)).payload.envelope.compensationHandlers, [carriedId("Handler", 2)]);
  assert.equal(element(program, carriedId("Undo", 2)).payload.role.throw.record.compensation.payload.activity, carriedId("Comp", 2));
});

test("a copy's Link names are renamed by deployment, so two copies never pair across each other", async () => {
  const program = await assembled();
  assert.deepEqual(element(program, carriedId("Jump", 2)).payload.role, { linkThrow: { name: carriedId("L", 2) } });
  assert.deepEqual(element(program, carriedId("Land", 3)).payload.role, { linkCatch: { name: carriedId("L", 3) } });
});

test("copying is transitive over the copies' Calls, and the caller's own deployment is never copied", async () => {
  const own = definitions("urn:a", `<bpmn:process id="Root" isExecutable="true"><bpmn:callActivity id="Call" calledElement="Inner"/></bpmn:process>
    <bpmn:process id="Inner" isExecutable="true"><bpmn:task id="T"/></bpmn:process>`);
  const population = [await deployment(1, own), await deployment(2, own)];
  const second = assembleProgram(population, 2) as Json;
  assert.deepEqual(second.processes.map((process: Json) => process.definition.deployment), [null, 1]);
  assert.deepEqual(second.processes[1].children, [carriedId("T", 1)]);
  assert.ok((await assembled()).processes.some((process: Json) => process.definition.key === "Leaf"));
});

test("a Call names the key of its QName's local part, and a key no other deployment declares copies nothing", async () => {
  const missing = definitions("urn:a", `<bpmn:process id="Caller" isExecutable="true"><bpmn:callActivity id="Call" calledElement="Missing"/></bpmn:process>`);
  assert.deepEqual((assembleProgram([await deployment(1, missing), await deployment(2, leaf)], 1) as Json).processes, []);
  const prefixed = assembleProgram([await deployment(1, caller), await deployment(2, leaf)], 1) as Json;
  assert.deepEqual(prefixed.processes, []);
  assert.throws(() => assembleProgram([], 1), RangeError);
});
