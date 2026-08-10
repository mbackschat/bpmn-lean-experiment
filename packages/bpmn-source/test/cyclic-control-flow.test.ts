import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";
import {
  BpmnCompilationStatus,
  CheckedNodeKind,
  SemanticOperationKind,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  SemanticProfileId,
  isWellFormedSemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import {
  verifyDefinitionReferences,
} from "../../../scripts/contract-artifact-consistency.ts";

const profile = SemanticProfileId.UserTaskCycle;
const oldProfile = SemanticProfileId.ExclusiveGatewaySimpleBoolean;
const limits = Object.freeze({ maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 });
const source = await readFile(
  new URL("./fixtures/cyclic-control-flow.bpmn", import.meta.url),
  "utf8",
);

async function compile(xml: string, semanticProfile: string = profile) {
  return compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(xml),
    sourceId: "cyclic-control-flow",
    expectedSha256: undefined,
    semanticProfile,
    sourceOverlay: null,
    limits,
  });
}

async function accepted(xml: string = source) {
  const result = await compile(xml);
  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  if (result.status !== BpmnCompilationStatus.Accepted) {
    throw new Error("cyclic fixture was not accepted");
  }
  return result;
}

test("projects and lowers the exact resumption-bounded cyclic source", async () => {
  const result = await accepted();
  assert.deepEqual(
    result.checkedProcess.nodes.find(({ id }) => id === "Merge"),
    { kind: CheckedNodeKind.ExclusiveMerge, id: "Merge" },
  );
  assert.deepEqual(
    result.semanticProcess.operations.find(({ id }) => id === "operation:Merge"),
    {
      id: "operation:Merge",
      kind: SemanticOperationKind.MergeExclusive,
      origin: { kind: "bpmnElement", elementId: "Merge" },
      inputs: ["place:Flow_Repeat", "place:Flow_Rework", "place:Flow_Start"],
      output: "place:Flow_Merge_Review",
    },
  );
  verifyDefinitionReferences(result.checkedProcess, result.semanticProcess);
});

test("keeps the cycle profile isolated from every acyclic profile", async () => {
  assert.equal((await compile(source, oldProfile)).status, BpmnCompilationStatus.Rejected);
});

test("accepts only absent, Unspecified, or Converging merge direction", async () => {
  const variants = [
    source.replace(' gatewayDirection="Converging"', ""),
    source.replace('gatewayDirection="Converging"', 'gatewayDirection="Unspecified"'),
    source,
  ];
  const projections = await Promise.all(variants.map(accepted));
  const normalized = projections.map(({ checkedProcess, semanticProcess }) => ({
    checkedNodes: checkedProcess.nodes,
    checkedFlows: checkedProcess.sequenceFlows,
    operations: semanticProcess.operations,
  }));
  assert.deepEqual(normalized[1], normalized[0]);
  assert.deepEqual(normalized[2], normalized[0]);

  for (const direction of ["Diverging", "Mixed"]) {
    const mutated = source.replace("Converging", direction);
    assert.equal((await compile(mutated)).status, BpmnCompilationStatus.Rejected);
  }
});

test("rejects merge defaults, merge-output conditions, wrong arity, and rewired topology", async () => {
  const mergeOutput = '<bpmn:sequenceFlow id="Flow_Merge_Review" sourceRef="Merge" targetRef="Review" />';
  const mutations = [
    source.replace('id="Merge" gatewayDirection="Converging"', 'id="Merge" gatewayDirection="Converging" default="Flow_Merge_Review"'),
    source.replace(mergeOutput, '<bpmn:sequenceFlow id="Flow_Merge_Review" sourceRef="Merge" targetRef="Review"><bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">true</bpmn:conditionExpression></bpmn:sequenceFlow>'),
    source.replace('</bpmn:process>', '<bpmn:sequenceFlow id="Flow_Fourth" sourceRef="Choice" targetRef="Merge"><bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">true</bpmn:conditionExpression></bpmn:sequenceFlow></bpmn:process>'),
    source.replace('targetRef="Review" />', 'targetRef="Choice" />'),
  ];
  for (const mutated of mutations) {
    assert.equal((await compile(mutated)).status, BpmnCompilationStatus.Rejected);
  }
});

test("evaluates back-edge conditions only at Choice and rejects conditions on conditionless edges", async () => {
  const repeatCondition = '<bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">stringEquals(route,"repeat")</bpmn:conditionExpression>';
  const startFlow = '<bpmn:sequenceFlow id="Flow_Start" sourceRef="Start" targetRef="Merge" />';
  const mergeFlow = '<bpmn:sequenceFlow id="Flow_Merge_Review" sourceRef="Merge" targetRef="Review" />';
  const conditioned = (flow: string) => flow.replace(" />", `>${repeatCondition}</bpmn:sequenceFlow>`);
  const mutations = [
    source.replace(repeatCondition, ""),
    source.replace(startFlow, conditioned(startFlow)),
    source.replace(mergeFlow, conditioned(mergeFlow)),
  ];
  for (const mutated of mutations) {
    assert.equal((await compile(mutated)).status, BpmnCompilationStatus.Rejected);
  }
});

test("canonicalizes merge inputs without reordering conditional Choice candidates", async () => {
  const incomingPermutation = source.replace(
    '<bpmn:incoming>Flow_Start</bpmn:incoming>\n      <bpmn:incoming>Flow_Repeat</bpmn:incoming>\n      <bpmn:incoming>Flow_Rework</bpmn:incoming>',
    '<bpmn:incoming>Flow_Rework</bpmn:incoming>\n      <bpmn:incoming>Flow_Start</bpmn:incoming>\n      <bpmn:incoming>Flow_Repeat</bpmn:incoming>',
  );
  const baseline = await accepted();
  const permuted = await accepted(incomingPermutation);
  assert.deepEqual(permuted.checkedProcess.nodes, baseline.checkedProcess.nodes);
  assert.deepEqual(permuted.semanticProcess.operations, baseline.semanticProcess.operations);

  const repeatBlock = source.match(/    <bpmn:sequenceFlow id="Flow_Repeat"[\s\S]*?    <\/bpmn:sequenceFlow>\n/u)?.[0];
  const reworkBlock = source.match(/    <bpmn:sequenceFlow id="Flow_Rework"[\s\S]*?    <\/bpmn:sequenceFlow>\n/u)?.[0];
  assert.ok(repeatBlock !== undefined && reworkBlock !== undefined);
  const swapped = source.replace(`${repeatBlock}${reworkBlock}`, `${reworkBlock}${repeatBlock}`);
  const reordered = await accepted(swapped);
  const merge = reordered.semanticProcess.operations.find(
    (operation): operation is Extract<typeof operation, { kind: SemanticOperationKind.MergeExclusive }> =>
      operation.kind === SemanticOperationKind.MergeExclusive,
  );
  const choice = reordered.semanticProcess.operations.find(
    (operation): operation is Extract<typeof operation, { kind: SemanticOperationKind.Choose }> =>
      operation.kind === SemanticOperationKind.Choose,
  );
  assert.deepEqual(merge?.inputs, ["place:Flow_Repeat", "place:Flow_Rework", "place:Flow_Start"]);
  assert.deepEqual(choice?.candidates.map(({ origin }) => origin.elementId), ["Flow_Rework", "Flow_Repeat"]);
});

test("schema branches are strict while merge inputs remain reusable and nonempty", async () => {
  const [checkedSchema, semanticSchema] = await Promise.all([
    readFile(new URL("../../../contracts/schemas/checked-process.schema.json", import.meta.url), "utf8"),
    readFile(new URL("../../../contracts/schemas/semantic-process.schema.json", import.meta.url), "utf8"),
  ]);
  const ajv = new Ajv2020({ strict: true });
  const checked = JSON.parse(checkedSchema) as { $defs: Record<string, unknown> };
  const semantic = JSON.parse(semanticSchema) as { $defs: Record<string, unknown> };
  const node = ajv.compile({ $schema: "https://json-schema.org/draft/2020-12/schema", $defs: checked.$defs, $ref: "#/$defs/node" });
  const operation = ajv.compile({ $schema: "https://json-schema.org/draft/2020-12/schema", $defs: semantic.$defs, $ref: "#/$defs/operation" });
  assert.equal(node({ kind: "exclusiveMerge", id: "Merge" }), true);
  assert.equal(node({ kind: "exclusiveMerge", id: "Merge", direction: "converging" }), false);
  const base = { id: "operation:Merge", kind: "mergeExclusive", origin: { kind: "bpmnElement", elementId: "Merge" }, output: "place:Out" };
  assert.equal(operation({ ...base, inputs: ["place:One"] }), true);
  assert.equal(operation({ ...base, inputs: ["place:A", "place:B", "place:C"] }), true);
  assert.equal(operation({ ...base, inputs: [] }), false);
  assert.equal(operation({ ...base, inputs: ["place:A", "place:A"] }), false);
});

test("artifact consistency rejects merge endpoint drift to another known place", async () => {
  const result = await accepted();
  const semanticProcess = {
    ...result.semanticProcess,
    operations: result.semanticProcess.operations.map((operation) =>
      operation.kind === SemanticOperationKind.MergeExclusive
        ? { ...operation, output: "place:Flow_Exit" }
        : operation
    ),
  };
  assert.throws(
    () => verifyDefinitionReferences(result.checkedProcess, semanticProcess),
    /no exact operation endpoint binding/,
  );
});

test("direct program admission rejects source-profile merge arity drift", async () => {
  const result = await accepted();
  const semanticProcess = {
    ...result.semanticProcess,
    operations: result.semanticProcess.operations.map((operation) =>
      operation.kind === SemanticOperationKind.MergeExclusive
        ? { ...operation, inputs: [operation.inputs[0]] }
        : operation
    ),
  };
  assert.equal(isWellFormedSemanticProcessProgram(semanticProcess), false);
});
