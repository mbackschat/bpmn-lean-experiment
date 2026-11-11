/**
 * A deploying document compiles against its population: the host does not assemble another deployment's processes
 * into a program, so a Call that only such a process answers is the host's restriction, while a Call nothing answers
 * stays the kernel's refusal.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EngineDefinitionCompilationStatus,
  compileBpmnDefinition,
  compileDefinitionForDeployment,
  engineCrossDeploymentCallCode,
  registerEngineDeployment,
  EngineDeploymentStatus,
} from "@bpmn-lean/engine-api";

import { limits, sha256, standardProfile, testHost, type TestHost } from "./support.ts";

const definitions = (body: string): Uint8Array => new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions" targetNamespace="urn:calls">${body}</bpmn:definitions>`);

const callee = definitions(`<bpmn:process id="Callee" isExecutable="true">
  <bpmn:startEvent id="Start"/><bpmn:endEvent id="End"/><bpmn:sequenceFlow id="f" sourceRef="Start" targetRef="End"/>
</bpmn:process>`);

const caller = (calledElement: string): Uint8Array => definitions(`<bpmn:process id="Caller" isExecutable="true">
  <bpmn:startEvent id="Start"/><bpmn:callActivity id="Call" calledElement="${calledElement}"/><bpmn:endEvent id="End"/>
  <bpmn:sequenceFlow id="f1" sourceRef="Start" targetRef="Call"/><bpmn:sequenceFlow id="f2" sourceRef="Call" targetRef="End"/>
</bpmn:process>`);

async function withCallee(): Promise<TestHost> {
  const host = testHost();
  const registered = await registerEngineDeployment({
    host, bytes: callee, sourceId: "callee", expectedSha256: await sha256(callee), profile: standardProfile,
    expectedProcessId: "Callee", version: 1, limits,
  });
  assert.equal(registered.status, EngineDeploymentStatus.Registered);
  return host;
}

async function codeOf(host: TestHost, bytes: Uint8Array): Promise<string | null> {
  const result = await compileDefinitionForDeployment({ host, bytes, sourceId: "caller", profile: standardProfile, limits });
  return result.status === EngineDefinitionCompilationStatus.Rejected ? result.diagnostics[0].code : null;
}

test("a Call that only another registered deployment's process answers is the host's cross-deployment refusal", async () => {
  const host = await withCallee();
  const result = await compileDefinitionForDeployment({ host, bytes: caller("Callee"), sourceId: "caller", profile: standardProfile, limits });
  assert.equal(result.status, EngineDefinitionCompilationStatus.Rejected);
  if (result.status !== EngineDefinitionCompilationStatus.Rejected) return;
  assert.equal(result.diagnostics[0].code, engineCrossDeploymentCallCode);
  assert.equal(engineCrossDeploymentCallCode, "host.call.crossDeployment");
  assert.equal(result.diagnostics[0].element, null);
});

test("a Call that no deployment's process answers keeps the kernel's calledProcessMissing", async () => {
  assert.equal(await codeOf(await withCallee(), caller("Nowhere")), "work.call.calledProcessMissing");
  assert.equal(await codeOf(testHost(), caller("Callee")), "work.call.calledProcessMissing",
    "with nothing registered, no other deployment answers the Call");
});

test("a document admitted on its own compiles for deployment as it compiles alone", async () => {
  const host = await withCallee();
  const alone = await compileBpmnDefinition({ bytes: callee, sourceId: "callee-again", profile: standardProfile, limits });
  assert.deepEqual(
    await compileDefinitionForDeployment({ host, bytes: callee, sourceId: "callee-again", profile: standardProfile, limits }), alone);
});
