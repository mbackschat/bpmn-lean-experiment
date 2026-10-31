/**
 * CSD-ADMIT-01 and CSD-AVAILABLE-01 through the exact-bytes source path: the retained Facility inspection model compiles
 * as a data-bearing embedded completion Program on both the checked and the Program analysis, and each refusal is a
 * one-fact mutation of an admitted control, so a reader that refused every data-bearing model could not pass.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import { EffectMappingValuePolicy, effectMappingValuePolicyForProgram } from "@bpmn-lean/semantic-core";
import type { SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";
const { nestedScopeControlCheckedStartNames, nestedScopeControlProgramStartNames } = await import(
  new URL("../../semantic-core/dist/nested-scope-control-admission.js", import.meta.url).href) as
  typeof import("../../semantic-core/src/nested-scope-control-admission.ts");

const semanticProfile = "cibseven-2.2.0-embedded-subprocess-completion-draft";
const directory = new URL("../../../scenarios/concurrent-scope-data/", import.meta.url);

type Overlay = Readonly<{ id: string; sha256: string; bytes: Uint8Array }>;

async function handlers(): Promise<Overlay> {
  const bytes = await readFile(new URL("facility-inspection-handlers.json", directory));
  return { id: "facility-inspection-handlers", sha256: createHash("sha256").update(bytes).digest("hex"), bytes };
}

const facility = async (): Promise<string> => readFile(new URL("facility-inspection.bpmn", directory), "utf8");

async function compile(xml: string) {
  return compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(xml), sourceId: "facility-inspection",
    expectedSha256: undefined, semanticProfile, sourceOverlay: await handlers(), limits: semanticProcessTestLimits });
}

async function admitted(xml: string): Promise<SemanticProcessProgram> {
  const result = await compile(xml);
  assert.ok(result.status === BpmnCompilationStatus.Accepted, JSON.stringify(result.diagnostics));
  return result.semanticProcess;
}

function replaceOnce(xml: string, from: string, to: string): string {
  assert.equal(xml.split(from).length, 2, from);
  return xml.replace(from, to);
}

test("the retained Facility inspection model is a data-bearing embedded completion Program with no required Start name", async () => {
  const result = await compile(await facility());
  assert.ok(result.status === BpmnCompilationStatus.Accepted, JSON.stringify(result.diagnostics));
  const program = result.semanticProcess;
  assert.deepEqual(program.scopeLocalData?.map(({ scopeId }) => scopeId).length, 3);
  assert.equal(effectMappingValuePolicyForProgram(program), EffectMappingValuePolicy.BoundedString);
  assert.deepEqual(nestedScopeControlProgramStartNames(program), []);
  const checked = result.checkedProcess;
  assert.deepEqual(nestedScopeControlCheckedStartNames({ ...checked, flows: checked.sequenceFlows }), []);
});

test("a check reading its sibling's output makes that output a required Start name", async () => {
  const xml = replaceOnce(await facility(), '<camunda:inputParameter name="result">${result}</camunda:inputParameter>',
    '<camunda:inputParameter name="result">${electricalResult}</camunda:inputParameter>');
  assert.deepEqual(nestedScopeControlProgramStartNames(await admitted(xml)), ["electricalResult"]);
});

/** A root Sub-Process beside a Call of an in-document Process; `declarations` is the only difference between variants. */
function callerBeside(declarations: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_Caller" targetNamespace="https://bpmn-lean.local/test">
  <process id="Process_Caller" isExecutable="true">
    <startEvent id="Started" />
    <subProcess id="Prepare">${declarations}
      <startEvent id="PrepareStarted" />
      <userTask id="PrepareFile" />
      <endEvent id="PrepareEnded" />
      <sequenceFlow id="Flow_PrepareStarted" sourceRef="PrepareStarted" targetRef="PrepareFile" />
      <sequenceFlow id="Flow_PrepareFile" sourceRef="PrepareFile" targetRef="PrepareEnded" />
    </subProcess>
    <callActivity id="Archive" calledElement="Process_Archive" />
    <endEvent id="Ended" />
    <sequenceFlow id="Flow_Started" sourceRef="Started" targetRef="Prepare" />
    <sequenceFlow id="Flow_Prepared" sourceRef="Prepare" targetRef="Archive" />
    <sequenceFlow id="Flow_Archived" sourceRef="Archive" targetRef="Ended" />
  </process>
  <process id="Process_Archive" isExecutable="true">
    <startEvent id="ArchiveStarted" />
    <userTask id="ArchiveFile" />
    <endEvent id="ArchiveEnded" />
    <sequenceFlow id="Flow_ArchiveStarted" sourceRef="ArchiveStarted" targetRef="ArchiveFile" />
    <sequenceFlow id="Flow_ArchiveFile" sourceRef="ArchiveFile" targetRef="ArchiveEnded" />
  </process>
</definitions>`;
}

// Mirrors the Lean witness `call_beside_data_is_refused`: the data-free caller is the admitted control, so the one added
// declaration is the refusal's only cause.
test("a Call beside one scope declaration is refused while the same data-free caller is admitted", async () => {
  const compileCaller = (xml: string) => compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(xml),
    sourceId: "caller", expectedSha256: undefined, semanticProfile, sourceOverlay: null, limits: semanticProcessTestLimits });
  const control = await compileCaller(callerBeside(""));
  assert.equal(control.status, BpmnCompilationStatus.Accepted, JSON.stringify(control.diagnostics));
  const declared = await compileCaller(callerBeside(
    '<extensionElements><camunda:inputOutput><camunda:inputParameter name="file">open</camunda:inputParameter></camunda:inputOutput></extensionElements>'));
  assert.equal(declared.status, BpmnCompilationStatus.Rejected);
});

test("an over-long literal and a ninth input are each refused in a data-bearing model", async () => {
  const xml = await facility();
  const refusals = {
    literal: replaceOnce(xml, '<camunda:inputParameter name="findings">open</camunda:inputParameter>',
      `<camunda:inputParameter name="findings">${"x".repeat(1025)}</camunda:inputParameter>`),
    declarations: replaceOnce(xml, '<camunda:inputParameter name="findings">open</camunda:inputParameter>',
      Array.from({ length: 8 }, (_, index) => `<camunda:inputParameter name="extra${index}">x</camunda:inputParameter>`).join("") +
        '<camunda:inputParameter name="findings">open</camunda:inputParameter>'),
  };
  for (const [label, mutated] of Object.entries(refusals)) {
    assert.equal((await compile(mutated)).status, BpmnCompilationStatus.Rejected, label);
  }
  const literal = replaceOnce(xml, '<camunda:inputParameter name="findings">open</camunda:inputParameter>',
    `<camunda:inputParameter name="findings">${"x".repeat(1024)}</camunda:inputParameter>`);
  assert.equal((await compile(literal)).status, BpmnCompilationStatus.Accepted, "a 1,024-byte literal");
});
