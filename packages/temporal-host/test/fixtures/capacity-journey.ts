/**
 * The realistic sixteen-body parallel Multi-Instance journey that the capacity table must host (PC-QUALIFY-10), and the
 * values that size the table's witnesses. The model is PC-MI-04/05's mixed-body vehicle
 * (`scenarios/open-rows/multi-instance-sub-process/parallel.bpmn`): per body a Commercial and a Compliance User Task,
 * then the asynchronous Service Task *Validate*. The data are business-sized: sixteen invoice headers in one collection,
 * a twelve-line review record per Commercial completion and an eight-finding validation record per effect result; its
 * state peaks at 250,487 bytes once every Compliance completed (measured 2026-11-13).
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { kernelProfileOptions, readKernelProgram } from "@bpmn-lean/bpmn-source";

import type { JsonValue } from "../../src/port.ts";

const { canonicalBytes, chainCapacity } = await import(new URL("../../dist/capacity.js", import.meta.url).href) as
  typeof import("../../src/capacity.ts");

const projectRoot = new URL("../../../../", import.meta.url);

export const str = (value: string): JsonValue => ({ kind: "string", value });
export const int = (value: number): JsonValue => ({ kind: "integer", value });
/** The value domain requires Map keys in strictly increasing order. */
export const map = (entries: readonly (readonly [string, JsonValue])[]): JsonValue =>
  ({ kind: "map", value: [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([name, value]) => ({ name, value })) });
export const list = (values: readonly JsonValue[]): JsonValue => ({ kind: "list", value: values });

/** A List of Strings of `lengths` ASCII characters: one character more is one canonical byte more wherever it is held once. */
export const pad = (lengths: readonly number[]): JsonValue => list(lengths.map((length) => str("x".repeat(length))));

/**
 * `total` characters spread over `strings` Strings, each within the value domain's 1,024-byte String bound: with the
 * count fixed, one character more is one byte more.
 */
export function padLengths(total: number, strings = 16): number[] {
  const each = Math.floor(total / strings);
  const lengths = Array.from({ length: strings }, (_, index) => each + (index < total - each * strings ? 1 : 0));
  if ((lengths[0] ?? 0) > 1_024) throw new RangeError(`${String(total)} characters exceed ${String(strings)} Strings`);
  return lengths;
}

export function invoiceHeader(index: number): JsonValue {
  return map([
    ["invoiceNo", str(`INV-2026-${String(100_000 + index)}`)],
    ["supplier", str(`Supplier ${String(index)} GmbH`)],
    ["currency", str("EUR")],
    ["amountCents", int(1_234_500 + index * 731)],
    ["dueDate", str("2026-12-31")],
    ["costCenter", str(`CC-${String(4_000 + index)}`)],
  ]);
}

export function reviewRecord(index: number): JsonValue {
  return map([
    ["reviewer", str(`user${String(index)}@example.test`)],
    ["verdict", str("approved-with-remarks")],
    ["remarks", str(`Checked against contract ${String(index)}; price deviation within tolerance; delivery partially confirmed by goods receipt. `.repeat(3))],
    ["address", map([["street", str(`Main Street ${String(index)}`)], ["city", str("Berlin")], ["zip", str("10115")], ["country", str("DE")]])],
    ["lines", list(Array.from({ length: 12 }, (_, line) => map([
      ["sku", str(`SKU-${String(index)}-${String(line)}-ABCDEFG`)],
      ["description", str(`Line item ${String(line)} for invoice ${String(index)}, standard delivery`)],
      ["qty", int(1 + line)], ["priceCents", int(9_990 + line * 13)], ["taxCode", str("VAT19")],
    ])))],
  ]);
}

export function validationRecord(index: number): JsonValue {
  return map([
    ["validator", str("invoice-validation-service/4.2")],
    ["checkedAt", str("2026-11-13T10:00:00Z")],
    ["score", int(87 + (index % 10))],
    ["findings", list(Array.from({ length: 8 }, (_, finding) => map([
      ["code", str(`VAL-${String(100 + finding)}`)], ["severity", str(finding % 3 === 0 ? "warning" : "info")],
      ["message", str(`Rule ${String(finding)} evaluated on invoice ${String(index)}: amounts, tax identifiers and bank details consistent with master data.`)],
    ])))],
  ]);
}

export const instanceId = "Instance_1";
const occurrence = (elementId: string, activation: number) => ({ processInstanceId: instanceId, elementId, activation });

export const completeTask = (commandId: string, elementId: string, activation: number, values: readonly JsonValue[] = []): JsonValue =>
  ({ kind: "command", commandId, occurrence: occurrence(elementId, activation), action: { kind: "completeUserTask", values } });

/** The effect result of body `activation`'s *Validate* in the Activity's result form, as a stimulus. */
export const validated = (commandId: string, activation: number, outputs: readonly JsonValue[]): JsonValue =>
  ({ kind: "effectResult", commandId, occurrence: occurrence("ServiceTask_Validate", activation), outcome: { kind: "success", outputs } });

/**
 * The phases of the parallel journey over `bodies` bodies; `extra` start variables travel with the collection, and
 * `status` is what each Commercial completion writes.
 */
export function parallelJourney(bodies: number, invoices: readonly JsonValue[], extra: readonly JsonValue[] = [],
  status: (body: number) => JsonValue = reviewRecord): Readonly<{
  start: JsonValue; commercial: JsonValue[]; compliance: JsonValue[]; results: JsonValue[]; publish: JsonValue;
}> {
  return {
    start: {
      kind: "start", commandId: "s-start", instanceId,
      variables: [{ name: "invoices", value: list(invoices) }, { name: "note", value: str("Quarter-end batch; four-eyes review required.") },
        { name: "quorum", value: int(99) }, ...extra],
    },
    commercial: Array.from({ length: bodies }, (_, body) =>
      completeTask(`c-com-${String(body + 1)}`, "UserTask_Commercial", body + 1, [{ name: "status", value: status(body + 1) }])),
    compliance: Array.from({ length: bodies }, (_, body) => completeTask(`c-cmp-${String(body + 1)}`, "UserTask_Compliance", body + 1)),
    results: Array.from({ length: bodies }, (_, body) =>
      validated(`e-${String(body + 1)}`, body + 1, [{ name: "result", value: validationRecord(body + 1) }])),
    publish: completeTask("c-publish", "UserTask_Publish", 1),
  };
}

/** The realistic journey: sixteen bodies over sixteen invoice headers. */
export const realisticJourney = (extra: readonly JsonValue[] = []) =>
  parallelJourney(16, Array.from({ length: 16 }, (_, body) => invoiceHeader(body + 1)), extra);

async function profileOptions(profile: string) {
  const document = JSON.parse(await readFile(new URL(`profiles/${profile}/profile.json`, projectRoot), "utf8")) as
    Readonly<{ bpmn?: Readonly<{ relationships?: readonly string[] }> }>;
  return kernelProfileOptions(document.bpmn?.relationships ?? []);
}

/** The kernel program of `bytes` under the CIB Seven profile the multi-instance and cycle scenarios use, in wire form. */
export async function cibProgram(bytes: Uint8Array): Promise<JsonValue> {
  const read = await readKernelProgram({
    bytes, overlay: null, profile: "cibseven-2.2.0", limits: { maxBytes: 4 * 1_048_576, parserDeadlineMs: 5_000 },
  }, await profileOptions("cibseven-2.2.0"));
  if (read.kind !== "read") throw new Error(`reader refused ${read.code}`);
  return JSON.parse(JSON.stringify(read.program)) as JsonValue;
}

export async function scenarioProgram(relativePath: string): Promise<JsonValue> {
  return cibProgram(await readFile(new URL(relativePath, projectRoot)));
}

export const parallelModel = "scenarios/open-rows/multi-instance-sub-process/parallel.bpmn";
export const innerBoundaryModel = "scenarios/open-rows/multi-instance-sub-process/parallel-inner-boundary.bpmn";
export const automaticLoopModel = "scenarios/open-rows/cycle-compositions/automatic-loop.bpmn";

const service = (id: string, inputs: readonly string[]) => `<bpmn:serviceTask id="${id}" implementation="urn:bpmn-lean:effect:probe-v1"
      camunda:delegateExpression="\${bpmnLeanEffectHandler}" camunda:asyncBefore="true"><bpmn:extensionElements><camunda:inputOutput>
      ${inputs.map((name) => `<camunda:inputParameter name="${name}">\${${name}}</camunda:inputParameter>`).join("")}
      <camunda:outputParameter name="answer">\${result}</camunda:outputParameter></camunda:inputOutput></bpmn:extensionElements></bpmn:serviceTask>`;

/**
 * A model sized for the byte witnesses: User Tasks *Fill1*..*Fill`fills`* in sequence, whose completions write process
 * variables; then the Service Task *Send*, whose effect request carries the variables `inputs`; then the User Task
 * *Final* and, after it, a Script Task whose comment of `scriptPad` characters sizes the program (it never runs before
 * the witnesses end).
 */
export function sizingModel(fills: number, inputs: readonly string[], scriptPad: number): Uint8Array {
  const tasks = Array.from({ length: fills }, (_, index) => `Fill${String(index + 1)}`);
  const chain = ["Start", ...tasks, "Send", "Final", "Script", "End"];
  const flows = chain.slice(1).map((target, index) => `<bpmn:sequenceFlow id="f${String(index)}" sourceRef="${chain[index]!}" targetRef="${target}"/>`);
  return new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
  id="D" targetNamespace="urn:bpmn-lean:test:capacity">
  <bpmn:process id="Capacity" isExecutable="true">
    <bpmn:startEvent id="Start"/>
    ${tasks.map((id) => `<bpmn:userTask id="${id}"/>`).join("\n    ")}
    ${service("Send", inputs)}
    <bpmn:userTask id="Final"/>
    <bpmn:scriptTask id="Script" scriptFormat="javascript"><bpmn:script>// ${"p".repeat(scriptPad)}
</bpmn:script></bpmn:scriptTask>
    <bpmn:endEvent id="End"/>
    ${flows.join("\n    ")}
  </bpmn:process>
</bpmn:definitions>`);
}

/**
 * A model that leaves one more open wait with every completion of the User Task *Arm*: a parallel split sends one token
 * to a one-hour Timer catch (`timer`) or to the asynchronous Service Task *Effect* (`effect`), and one back to *Arm*.
 * A collection holds at most 32 members, so a Multi-Instance body cannot count past the pending-Activity bound.
 */
export function armingModel(wait: "timer" | "effect"): Uint8Array {
  const waiting = wait === "timer"
    ? `<bpmn:intermediateCatchEvent id="Wait"><bpmn:timerEventDefinition><bpmn:timeDuration xsi:type="bpmn:tFormalExpression">PT1H</bpmn:timeDuration></bpmn:timerEventDefinition></bpmn:intermediateCatchEvent>`
    : service("Wait", []);
  return new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="D" targetNamespace="urn:bpmn-lean:test:capacity-arming">
  <bpmn:process id="Arming" isExecutable="true">
    <bpmn:startEvent id="Start"/>
    <bpmn:exclusiveGateway id="Merge"/>
    <bpmn:userTask id="Arm"/>
    <bpmn:parallelGateway id="Split"/>
    ${waiting}
    <bpmn:endEvent id="Waited"/>
    <bpmn:sequenceFlow id="f1" sourceRef="Start" targetRef="Merge"/>
    <bpmn:sequenceFlow id="f2" sourceRef="Merge" targetRef="Arm"/>
    <bpmn:sequenceFlow id="f3" sourceRef="Arm" targetRef="Split"/>
    <bpmn:sequenceFlow id="f4" sourceRef="Split" targetRef="Wait"/>
    <bpmn:sequenceFlow id="f5" sourceRef="Wait" targetRef="Waited"/>
    <bpmn:sequenceFlow id="f6" sourceRef="Split" targetRef="Merge"/>
  </bpmn:process>
</bpmn:definitions>`);
}

/** Process variables `names`, each a pad of `characters` characters. */
export const sizingVariables = (names: readonly string[], characters: number): JsonValue[] =>
  names.map((name) => ({ name, value: pad(padLengths(characters)) }));

/**
 * The continuation witness's model and inputs: a program exactly at its own bound, a state grown by four completions,
 * and a fifth completion that adds a fixed variable and the variable `last` of `knob` characters, which decides the
 * carried argument while the state stays below its own bound.
 */
export async function continuationCase(): Promise<Readonly<{
  program: JsonValue; inputs: readonly JsonValue[]; last: (knob: number) => JsonValue;
}>> {
  const programOf = async (scriptPad: number) => cibProgram(sizingModel(5, [], scriptPad));
  const program = await programOf(chainCapacity.programBytes - canonicalBytes(await programOf(0)));
  assert.equal(canonicalBytes(program), chainCapacity.programBytes);
  const fill = (index: number) => completeTask(`fill-${String(index)}`, `Fill${String(index)}`, 1,
    sizingVariables([`v${String(index)}a`, `v${String(index)}b`, `v${String(index)}c`], 15_000));
  return {
    program,
    inputs: [{ kind: "start", commandId: "s", instanceId, variables: sizingVariables(["a", "b", "c"], 15_000) },
      fill(1), fill(2), fill(3), fill(4)],
    last: (knob) => completeTask("fill-5", "Fill5", 1, [...sizingVariables(["fixed"], 15_000), { name: "last", value: pad(padLengths(knob)) }]),
  };
}

/**
 * The largest knob whose last input `commits`: one character more is one carried byte more, so its successor carries
 * exactly the continuation bound.
 */
export async function continuationKnob(commits: (knob: number) => Promise<boolean>): Promise<number> {
  let low = 0;
  let high = 15_500;
  assert.ok(await commits(low) && !await commits(high));
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (await commits(middle)) low = middle;
    else high = middle;
  }
  return low;
}
