import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  CheckedNodeKind,
  SemanticOperationKind,
  compileBpmnToSemanticProcess,
  userTaskMetadataBindingValid,
} from "@bpmn-lean/bpmn-source";
import type {
  AcceptedBpmnCompilation,
  SemanticProcessProgram,
  SourceOverlaySelection,
} from "@bpmn-lean/bpmn-source";
import { SemanticProfileId } from "@bpmn-lean/semantic-core";
import type { DeepMutable } from "../../../scripts/contract-artifact-test-fixtures.ts";

import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";

const checkpointProfile =
  SemanticProfileId.ParallelUserTaskAssignmentFormMetadata;
const fixtureUrl = new URL(
  "./fixtures/parallel-user-task-metadata-composition.bpmn",
  import.meta.url,
);

test("admits the exact parallel User Task metadata composition source", async () => {
  const result = await acceptedFixture();

  assert.deepEqual(
    result.checkedProcess.nodes.map(({ kind }) => kind).sort(),
    [
      CheckedNodeKind.NoneEndEvent,
      CheckedNodeKind.NoneStartEvent,
      CheckedNodeKind.ParallelGateway,
      CheckedNodeKind.ParallelGateway,
      CheckedNodeKind.UserTask,
      CheckedNodeKind.UserTask,
    ].sort(),
  );
  assert.deepEqual(
    result.semanticProcess.operations.map(({ kind }) => kind).sort(),
    [
      SemanticOperationKind.Initiate,
      SemanticOperationKind.Duplicate,
      SemanticOperationKind.AwaitUserTask,
      SemanticOperationKind.AwaitUserTask,
      SemanticOperationKind.Synchronize,
      SemanticOperationKind.ReachNoneEnd,
      SemanticOperationKind.CompleteScope,
    ].sort(),
  );
  assert.deepEqual(metadataByElementId(result), new Map([
    ["UserTask_ContentReview", metadata("contentApproved", "boolean")],
    ["UserTask_RiskReview", metadata("riskApproved", "boolean")],
  ]));
});

test("binds metadata by exact element identity rather than collection position", async () => {
  const exact = await acceptedFixture();
  const reordered: SemanticProcessProgram = {
    ...exact.semanticProcess,
    operations: [...exact.semanticProcess.operations].reverse(),
  };
  assert.equal(
    userTaskMetadataBindingValid(exact.checkedProcess, reordered),
    true,
  );

  const swapped = structuredClone(exact.semanticProcess) as DeepMutable<
    SemanticProcessProgram
  >;
  const waits = swapped.operations.filter(
    (operation) => operation.kind === SemanticOperationKind.AwaitUserTask,
  );
  assert.equal(waits.length, 2);
  if (waits[0] === undefined || waits[1] === undefined) {
    return;
  }
  const firstMetadata = waits[0].task.metadata;
  const secondMetadata = waits[1].task.metadata;
  if (firstMetadata === undefined || secondMetadata === undefined) {
    throw new Error("expected both checkpoint waits to retain metadata");
  }
  waits[0].task.metadata = structuredClone(secondMetadata);
  waits[1].task.metadata = structuredClone(firstMetadata);
  assert.equal(
    userTaskMetadataBindingValid(exact.checkedProcess, swapped),
    false,
  );
});

test("admits either existing generated field type independently per task", async () => {
  const source = await readFile(fixtureUrl, "utf8");
  const result = await compile(
    source.replace('id="riskApproved" type="boolean"', 'id="riskApproved" type="string"'),
    checkpointProfile,
  );

  assert.equal(
    result.status,
    BpmnCompilationStatus.Accepted,
    JSON.stringify(result.diagnostics),
  );
});

test("rejects a metadata-free sibling and both predecessor profiles", async () => {
  const source = await readFile(fixtureUrl, "utf8");
  const oneMetadataFree = source
    .replace(' c7:candidateGroups="reviewers"', "")
    .replace(/\s*<bpmn:extensionElements>[\s\S]*?<\/bpmn:extensionElements>/u, "");

  const missing = await compile(oneMetadataFree, checkpointProfile);
  assert.equal(missing.status, BpmnCompilationStatus.Rejected);

  for (const oldProfile of [
    SemanticProfileId.ParallelForkJoin,
    SemanticProfileId.UserTaskAssignmentFormMetadata,
  ]) {
    const refused = await compile(source, oldProfile);
    assert.equal(refused.status, BpmnCompilationStatus.Rejected, oldProfile);
  }
});

test("rejects nearest source-shape mutations without widening generic admission", async () => {
  const source = await readFile(fixtureUrl, "utf8");
  const mutations = [
    ["duplicate task identity", source.replaceAll(
      "UserTask_RiskReview",
      "UserTask_ContentReview",
    )],
    ["wrong branch target", source.replace(
      'targetRef="UserTask_RiskReview"',
      'targetRef="UserTask_ContentReview"',
    )],
    ["foreign form shape", source.replace(
      '<c7:formData>',
      '<c7:formData unexpected="true">',
    )],
    ["BPMN data object", source.replace(
      "    <bpmn:startEvent",
      '    <bpmn:dataObject id="DataObject_Initial" />\n    <bpmn:startEvent',
    )],
  ] as const;
  for (const [name, mutation] of mutations) {
    const result = await compile(mutation, checkpointProfile);
    assert.equal(result.status, BpmnCompilationStatus.Rejected, name);
  }
});

test("rejects an unbalanced same-cardinality source in both parallel profiles", async () => {
  const source = unbalancedParallelSource(await readFile(fixtureUrl, "utf8"));
  const metadataFreeSource = source
    .replaceAll(' c7:candidateGroups="reviewers"', "")
    .replace(/\s*<bpmn:extensionElements>[\s\S]*?<\/bpmn:extensionElements>/gu, "");

  for (const [profile, input] of [
    [checkpointProfile, source],
    [SemanticProfileId.ParallelForkJoin, metadataFreeSource],
  ] as const) {
    const result = await compile(input, profile);
    assert.equal(result.status, BpmnCompilationStatus.Rejected, profile);
  }
});

test("rejects an otherwise valid source overlay before composed admission", async () => {
  const source = await readFile(fixtureUrl, "utf8");
  const overlay = await sourceOverlay(checkpointProfile);
  const result = await compile(source, checkpointProfile, overlay);

  assert.equal(result.status, BpmnCompilationStatus.Rejected);
});

async function acceptedFixture(): Promise<AcceptedBpmnCompilation> {
  const result = await compile(await readFile(fixtureUrl, "utf8"), checkpointProfile);
  assert.equal(
    result.status,
    BpmnCompilationStatus.Accepted,
    JSON.stringify(result.diagnostics),
  );
  if (result.status !== BpmnCompilationStatus.Accepted) {
    throw new Error("parallel metadata fixture was rejected");
  }
  return result;
}

function metadataByElementId(
  result: AcceptedBpmnCompilation,
): ReadonlyMap<string, unknown> {
  return new Map(result.checkedProcess.nodes.flatMap((node) =>
    node.kind === CheckedNodeKind.UserTask
      ? [[node.id, node.metadata]] as const
      : []
  ));
}

function metadata(key: string, type: "string" | "boolean") {
  return {
    assignment: { candidates: [{ kind: "group", id: "reviewers" }] },
    form: { fields: [{ key, type }] },
  };
}

async function compile(
  source: string,
  semanticProfile: string,
  sourceOverlay: SourceOverlaySelection | null = null,
) {
  return compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(source),
    sourceId: "parallel-user-task-metadata-composition",
    expectedSha256: undefined,
    semanticProfile,
    sourceOverlay,
    limits: semanticProcessTestLimits,
  });
}

async function sourceOverlay(
  semanticProfile: string,
): Promise<SourceOverlaySelection> {
  const id = "parallel-metadata-overlay";
  const bytes = new TextEncoder().encode(JSON.stringify({
    kind: "bpmnSourceOverlay",
    id,
    semanticProfile,
    effectBindings: [],
    inertAttributes: [],
  }));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  return { id, sha256, bytes };
}

function unbalancedParallelSource(source: string): string {
  return source
    .replace(
      /^\s*<bpmn:(?:incoming|outgoing)>.*<\/bpmn:(?:incoming|outgoing)>\s*$/gmu,
      "",
    )
    .replace(
      'id="Flow_StartToFork" sourceRef="StartEvent_1" targetRef="Gateway_Fork"',
      'id="Flow_StartToFork" sourceRef="StartEvent_1" targetRef="UserTask_ContentReview"',
    )
    .replace(
      'id="Flow_ForkToContent" sourceRef="Gateway_Fork" targetRef="UserTask_ContentReview"',
      'id="Flow_ForkToContent" sourceRef="UserTask_ContentReview" targetRef="Gateway_Fork"',
    )
    .replace(
      'id="Flow_ContentToJoin" sourceRef="UserTask_ContentReview" targetRef="Gateway_Join"',
      'id="Flow_ContentToJoin" sourceRef="Gateway_Fork" targetRef="Gateway_Join"',
    );
}
