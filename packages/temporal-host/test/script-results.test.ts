/**
 * The differential's recorded Script results (`withScriptResults`): each Script effect a committed input opens is
 * evaluated once over its committed arguments and answered by an `effectResult` input right after that input, so a
 * result that opens the next Script is answered in turn, and a run that opens no Script keeps its inputs. The
 * profile writes an undeclared result variable at the instance root (CIB-EXT-0007), as the cibseven profiles do.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { kernelProfileOptions, readKernelProgram } from "@bpmn-lean/bpmn-source";

const { withScriptResults } = await import(new URL("../dist/script-results.js", import.meta.url).href) as
  typeof import("../src/script-results.ts");

const options = { timeoutMs: 200 };

async function program(body: string): Promise<never> {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="D" targetNamespace="urn:t">
  <bpmn:process id="P" isExecutable="true">${body}</bpmn:process>
</bpmn:definitions>`;
  const read = await readKernelProgram({
    bytes: new TextEncoder().encode(xml), overlay: null, profile: "cibseven-2.2.0", limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  }, { ...kernelProfileOptions(["CIB-EXT-0007"]), scriptTask: "javascript" });
  assert.equal(read.kind, "read");
  return JSON.parse(JSON.stringify(read.kind === "read" ? read.program : null)) as never;
}

const script = (id: string, source: string, result: string) =>
  `<bpmn:scriptTask id="${id}" scriptFormat="javascript" camunda:resultVariable="${result}"><bpmn:script>${source}</bpmn:script></bpmn:scriptTask>`;
const flow = (id: string, source: string, target: string) => `<bpmn:sequenceFlow id="${id}" sourceRef="${source}" targetRef="${target}"/>`;
const start = { kind: "start", commandId: "start", instanceId: "I", variables: [{ name: "price", value: { kind: "string", value: "6" } }] };
const at = (elementId: string) => ({ processInstanceId: "I", elementId, activation: 1 });

test("each Script a committed input reaches is answered right after it, in turn", async () => {
  const json = await program(`<bpmn:startEvent id="S"/>${script("A", "parseInt(price, 10) * 2", "doubled")}${script("B", "doubled + 1", "next")}
    <bpmn:userTask id="W"/><bpmn:endEvent id="E"/>${flow("f1", "S", "A")}${flow("f2", "A", "B")}${flow("f3", "B", "W")}${flow("f4", "W", "E")}`);
  assert.deepEqual((withScriptResults(json, { stimuli: [start] } as never, options) as { stimuli: unknown[] }).stimuli, [
    start,
    { kind: "effectResult", commandId: "script-result:A:1:0", occurrence: at("A"),
      outcome: { kind: "success", outputs: [{ name: "doubled", value: { kind: "integer", value: 12 } }] } },
    { kind: "effectResult", commandId: "script-result:B:1:0", occurrence: at("B"),
      outcome: { kind: "success", outputs: [{ name: "next", value: { kind: "integer", value: 13 } }] } },
  ]);
});

test("a run that opens no Script keeps its inputs", async () => {
  const json = await program(`<bpmn:startEvent id="S"/><bpmn:userTask id="W"/><bpmn:endEvent id="E"/>${flow("f1", "S", "W")}${flow("f2", "W", "E")}`);
  const scenario = { stimuli: [start, { kind: "command", commandId: "done", occurrence: at("W"), action: { kind: "completeUserTask", values: [] } }] };
  assert.deepEqual(withScriptResults(json, scenario as never, options), scenario);
});
