/**
 * Oracle guard of the invariant "admitted ⇒ valid against the pinned OMG `BPMN20.xsd`" (PC-BASIC-04): the reader
 * refuses every document `scripts/validate-bpmn-xml.sh` (`xmllint`) rejects, with `source.schema` or an earlier code
 * covering that facet, and never refuses a valid one with `source.schema`.
 * The cases exercise each facet the generated schema table covers, and the package's fixtures, invalid ones included,
 * stand for authored models. Invalid documents are written to a temporary directory only, outside the set `verify.sh`
 * validates. The validator's absence fails the guard rather than skipping it.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { kernelProfileOptions, readKernelProgram } from "@bpmn-lean/bpmn-source";

const validator = fileURLToPath(new URL("../../../scripts/validate-bpmn-xml.sh", import.meta.url));
const fixtures = fileURLToPath(new URL("./fixtures/", import.meta.url));

function model(body: string, roots = "", diagram = ""): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:camunda="http://camunda.org/schema/1.0/bpmn" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" id="D" targetNamespace="urn:t">
${roots}<bpmn:process id="P" isExecutable="true">${body}</bpmn:process>${diagram}</bpmn:definitions>`;
}

const flow = `<bpmn:startEvent id="S"/><bpmn:task id="T"/><bpmn:sequenceFlow id="F" sourceRef="S" targetRef="T"/>`;
const operation = `<bpmn:message id="M"/><bpmn:interface id="If" name="If"><bpmn:operation id="O" name="O"><bpmn:inMessageRef>M</bpmn:inMessageRef></bpmn:operation></bpmn:interface>`;

/** Each facet: a valid case and the invalid case that breaks only that facet. */
const cases: ReadonlyArray<readonly [string, string]> = [
  ["valid-plain", model(flow)],
  ["valid-wildcards", model(`<bpmn:documentation>d</bpmn:documentation><bpmn:userTask id="U" camunda:assignee="a"><bpmn:extensionElements><camunda:inputOutput/></bpmn:extensionElements></bpmn:userTask>`,
    "", `<bpmndi:BPMNDiagram id="Di"><bpmndi:BPMNPlane id="Pl" bpmnElement="P"/></bpmndi:BPMNDiagram>`)],
  ["valid-xsi-type", model(`${flow}<bpmn:endEvent id="E"/><bpmn:sequenceFlow id="G" sourceRef="T" targetRef="E"><bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">a</bpmn:conditionExpression></bpmn:sequenceFlow>`)],
  ["valid-operation-element", model(`<bpmn:intermediateCatchEvent id="C"><bpmn:messageEventDefinition messageRef="M"><bpmn:operationRef>O</bpmn:operationRef></bpmn:messageEventDefinition></bpmn:intermediateCatchEvent>`, operation)],
  ["valid-artifact-after", model(`${flow}<bpmn:textAnnotation id="N"/>`)],
  ["invalid-operation-attribute", model(`<bpmn:intermediateCatchEvent id="C"><bpmn:messageEventDefinition messageRef="M" operationRef="O"/></bpmn:intermediateCatchEvent>`, operation)],
  ["invalid-artifact-before", model(`<bpmn:textAnnotation id="N"/>${flow}`)],
  ["invalid-incoming-after-outgoing", model(`<bpmn:startEvent id="S"><bpmn:outgoing>F</bpmn:outgoing></bpmn:startEvent><bpmn:task id="T"><bpmn:outgoing>G</bpmn:outgoing><bpmn:incoming>F</bpmn:incoming></bpmn:task><bpmn:endEvent id="E"/><bpmn:sequenceFlow id="F" sourceRef="S" targetRef="T"/><bpmn:sequenceFlow id="G" sourceRef="T" targetRef="E"/>`)],
  ["invalid-undeclared-attribute", model(`<bpmn:task id="T" color="red"/>`)],
  ["invalid-model-namespace-attribute", model(`<bpmn:task id="T" bpmn:name="x"/>`)],
  ["invalid-required-attribute", model(flow, operation.replace(` name="If"`, ""))],
  ["invalid-required-child", model(`<bpmn:intermediateCatchEvent id="C"><bpmn:conditionalEventDefinition/></bpmn:intermediateCatchEvent>`)],
  ["invalid-enumeration", model(`<bpmn:exclusiveGateway id="G" gatewayDirection="Sideways"/>`)],
  ["invalid-integer", model(`<bpmn:task id="T" startQuantity="many"/>`)],
  ["invalid-id", model(`<bpmn:task id="1T"/>`)],
  ["invalid-qname-prefix", model(`<bpmn:callActivity id="C" calledElement="nope:Q"/>`)],
  ["invalid-qname-expression", model(`<bpmn:callActivity id="C" calledElement="\${key}"/>`)],
  ["invalid-text", model(`<bpmn:task id="T">stray</bpmn:task>`)],
  ["invalid-xsi-type", model(`${flow}<bpmn:endEvent id="E"/><bpmn:sequenceFlow id="G" sourceRef="T" targetRef="E"><bpmn:conditionExpression xsi:type="bpmn:tNothing">a</bpmn:conditionExpression></bpmn:sequenceFlow>`)],
  ["invalid-abstract-type", model(`${flow}<bpmn:endEvent id="E"/><bpmn:sequenceFlow id="G" sourceRef="T" targetRef="E"><bpmn:conditionExpression xsi:type="bpmn:tBaseElementWithMixedContent">a</bpmn:conditionExpression></bpmn:sequenceFlow>`)],
];

function xmllintAccepts(path: string): boolean {
  const run = spawnSync(validator, [path], { encoding: "utf8", timeout: 20_000 });
  assert.match(run.stdout, /schema-validated against/u, `the validator ran: ${run.stderr}`);
  return run.status === 0;
}

/** The reader's refusal code, `null` when it reads the document. */
async function refusal(xml: string): Promise<string | null> {
  const result = await readKernelProgram({
    bytes: new TextEncoder().encode(xml), overlay: null, profile: "any-profile",
    limits: { maxBytes: 1 << 20, parserDeadlineMs: 2_000 },
  }, kernelProfileOptions([]));
  return result.kind === "read" ? null : result.code;
}

async function agrees(xml: string, valid: boolean, name: string): Promise<void> {
  const code = await refusal(xml);
  if (valid) assert.notEqual(code, "source.schema", `${name}: valid, yet refused as source.schema`);
  else assert.notEqual(code, null, `${name}: invalid, yet read`);
}

test("the reader refuses each facet case xmllint rejects, and refuses no valid one as source.schema", async () => {
  const workspace = mkdtempSync(join(tmpdir(), "bpmn-schema-oracle-"));
  try {
    for (const [name, xml] of cases) {
      const path = join(workspace, `${name}.bpmn`);
      writeFileSync(path, xml);
      const valid = xmllintAccepts(path);
      assert.equal(valid, name.startsWith("valid-"), `${name}: the case breaks only its facet`);
      await agrees(xml, valid, name);
    }
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("the reader refuses each package fixture xmllint rejects, and refuses no valid one as source.schema", async () => {
  const files = readdirSync(fixtures, { recursive: true }).map(String).filter((file) => file.endsWith(".bpmn"));
  assert.ok(files.length > 0);
  for (const file of files) {
    const path = join(fixtures, file);
    await agrees(readFileSync(path, "utf8"), xmllintAccepts(path), file);
  }
});
