/**
 * The kernel binding's time contract: a stimulus's `at` and the host's time for its own inputs reach the kernel as
 * `atMs`, and a timer firing keeps its deadline apart from the time it is applied at. Also the state a Continue-As-New
 * carries: work a Terminate removed stays removed once the state crossed the binding's codec.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { kernelProfileOptions, readKernelProgram } from "@bpmn-lean/bpmn-source";

const { kernelPort } = await import(new URL("../dist/kernel-port.js", import.meta.url).href) as
  typeof import("../src/kernel-port.ts");

const { EffectResultKind } = await import(new URL("../dist/port.js", import.meta.url).href) as
  typeof import("../src/port.ts");

const occurrence = { processInstanceId: "I", elementId: "T", activation: 1 };

test("a stimulus's stated time reaches the kernel as its atMs", () => {
  const decoded = kernelPort.decodeStimulus({ kind: "start", commandId: "start", instanceId: "I", variables: [], at: 1_700_000_000_000 });
  assert.equal(decoded.input.input.payload.atMs, 1_700_000_000_000);
  assert.equal(decoded.input.firing, null, "a stimulus that states no firing carries none");
});

test("a timer firing carries its deadline and the host's time; an effect result carries the host's time", () => {
  const timer = kernelPort.timerInput(occurrence, 1000, 1004);
  assert.deepEqual(timer.input.payload, { occurrence: { processInstanceId: "I", element: "T", activation: 1 }, logicalTimeMs: 1000, atMs: 1004 });
  const effect = kernelPort.effectInput(occurrence, { kind: EffectResultKind.TechnicalFailure }, 1500);
  assert.equal(effect.input.payload.atMs, 1500);
});

const projectRoot = new URL("../../../", import.meta.url);

// PC-TERMINATE-02 (TEND-REFUSE-01, docs/kernel/semantics/SCOPES-SEMANTICS-SPEC.md): a command or result addressed to
// work a Terminate removed is rejected unchanged after a host replacement too, because the removed occurrence is gone
// from the state the next Run decodes. The memory host never rolls over, so the replacement is the codec round trip
// itself; the witness is terminate-called-child `terminate-one-call-sibling-survives`, whose retained CIB answer
// rejects the same late inputs without a replacement.
test("work a Terminate removed stays rejected, state unchanged, once the state crossed the continuation codec", async () => {
  const scenarioPath = "scenarios/open-rows/terminate-called-child/terminate-one-call-sibling-survives.scenario.json";
  const scenario = JSON.parse(await readFile(new URL(scenarioPath, projectRoot), "utf8")) as {
    profile: string; bpmn: { relativePath: string; sha256: string }; stimuli: Array<{ commandId: string }>;
  };
  const profile = JSON.parse(await readFile(new URL(`profiles/${scenario.profile}/profile.json`, projectRoot), "utf8")) as
    { bpmn?: { relationships?: string[] } };
  const read = await readKernelProgram({
    bytes: await readFile(new URL(scenario.bpmn.relativePath, projectRoot)),
    expectedSha256: scenario.bpmn.sha256,
    overlay: null,
    profile: scenario.profile,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  }, kernelProfileOptions(profile.bpmn?.relationships ?? []));
  assert.equal(read.kind, "read");
  if (read.kind !== "read") return;
  const program = kernelPort.decodeProgram(JSON.parse(JSON.stringify(read.program)));
  const stimulus = (commandId: string) =>
    kernelPort.decodeStimulus(scenario.stimuli.find((entry) => entry.commandId === commandId)! as never).input;
  let state = null as Parameters<typeof kernelPort.encodeState>[0] | null;
  for (const commandId of ["s01-start", "s02-finish-north"]) {
    const result = kernelPort.step(program, state, stimulus(commandId));
    assert.ok(result.committed, `${commandId} commits`);
    state = result.state;
  }
  const encoded = kernelPort.encodeState(state!);
  const carried = kernelPort.decodeState(JSON.parse(JSON.stringify(encoded)));
  for (const commandId of ["s03-late-count-north", "s04-late-notify-north"]) {
    const late = kernelPort.step(program, carried, stimulus(commandId));
    assert.equal(late.committed, false, `${commandId} is not committed`);
    if (!late.committed) assert.equal(late.rejected, true, `${commandId} is rejected`);
  }
  assert.deepEqual(kernelPort.encodeState(carried), encoded);
});

// A program carries every bound version of a called definition, so one author's identifier can name two Script Tasks;
// the wait's definition tells them apart (SCRIPT-SEMANTICS-SPEC item 3).
test("a wait's Script Task is the one of the called definition the wait runs in", async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="D" targetNamespace="urn:t">
  <bpmn:process id="A" isExecutable="true">
    <bpmn:startEvent id="S"><bpmn:outgoing>f1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:scriptTask id="Compute" scriptFormat="javascript" camunda:resultVariable="r"><bpmn:incoming>f1</bpmn:incoming><bpmn:outgoing>f2</bpmn:outgoing><bpmn:script>0</bpmn:script></bpmn:scriptTask>
    <bpmn:endEvent id="E"><bpmn:incoming>f2</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="f1" sourceRef="S" targetRef="Compute"/><bpmn:sequenceFlow id="f2" sourceRef="Compute" targetRef="E"/>
  </bpmn:process>
</bpmn:definitions>`;
  const read = await readKernelProgram({
    bytes: new TextEncoder().encode(xml), overlay: null, profile: "cibseven-2.2.0", limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  }, { ...kernelProfileOptions([]), scriptTask: "javascript" });
  assert.equal(read.kind, "read");
  if (read.kind !== "read") return;
  const wire = JSON.parse(JSON.stringify(read.program)) as { elements: Array<Record<string, { header: { id: string; origin: { sourceId: string } } }>> };
  const version = (deployment: number) =>
    ({ key: "A", namespace: "urn:t", version: deployment, versionTag: null, deployment, tenant: null, sourceSha256: null });
  const scripts = wire.elements.flatMap((element) => {
    const { header } = Object.values(element)[0]!;
    if (header.origin.sourceId !== "Compute") return [];
    return [1, 2].map((deployment) => JSON.parse(JSON.stringify(element)
      .replaceAll(`"id":"${header.id}"`, `"id":"Compute@${deployment}"`)
      .replace('"definition":null', `"definition":${JSON.stringify(version(deployment))}`)
      .replace('"source":"0"', `"source":"${deployment}"`)) as typeof element);
  });
  assert.equal(scripts.length, 2);
  const carried = kernelPort.decodeProgram({ ...wire, elements: [...wire.elements, ...scripts] } as never);
  const wait = (definition: unknown) => ({ id: { processInstanceId: "I", elementId: "Compute", activation: 1 }, ...definition === null ? {} : { definition } }) as never;
  assert.equal(kernelPort.scriptOf(carried, wait(version(2)))?.source, "2");
  assert.equal(kernelPort.scriptOf(carried, wait(version(1)))?.source, "1");
  assert.equal(kernelPort.scriptOf(carried, wait(null))?.source, "0");
});
