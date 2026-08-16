import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  BpmnSourceDiagnosticCode,
  CheckedNodeKind,
  SemanticOperationKind,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import { importCompiledBpmnGraph } from "./compiled-moddle-graph.ts";

const profile = "bpmn-2.0.2-bpmn-lean-structured-human-work-draft";
const fixtureUrl = new URL("./fixtures/structured-human-work.bpmn", import.meta.url);

test("admits opaque Rendering and projects only assignment metadata", async () => {
  const source = await readFile(fixtureUrl, "utf8");
  const result = await compile(source);
  assert.equal(
    result.status,
    BpmnCompilationStatus.Accepted,
    JSON.stringify(result.diagnostics),
  );
  if (result.status !== BpmnCompilationStatus.Accepted) {
    return;
  }
  const task = result.checkedProcess.nodes.find(
    ({ kind }) => kind === CheckedNodeKind.UserTask,
  );
  const wait = result.semanticProcess.operations.find(
    ({ kind }) => kind === SemanticOperationKind.AwaitUserTask,
  );
  assert.deepEqual(task, {
    kind: CheckedNodeKind.UserTask,
    id: "ReviewException",
    name: "Review exception",
    metadata: {
      assignment: { candidates: [{ kind: "group", id: "reviewers" }] },
    },
  });
  assert.ok(wait?.kind === SemanticOperationKind.AwaitUserTask);
  assert.deepEqual(wait.task.metadata, task.metadata);
  assert.equal(JSON.stringify(result.checkedProcess).includes("structuredForm"), false);
  assert.equal(JSON.stringify(result.semanticProcess).includes("rendering"), false);
});

test("lowers Rendering-present and Rendering-absent twins identically", async () => {
  const source = await readFile(fixtureUrl, "utf8");
  const present = await accepted(source);
  const absent = await accepted(withoutRendering(source));

  assert.deepEqual(
    withoutExactSourceIdentity(present.checkedProcess),
    withoutExactSourceIdentity(absent.checkedProcess),
  );
  assert.deepEqual(
    withoutExactSourceIdentity(present.semanticProcess),
    withoutExactSourceIdentity(absent.semanticProcess),
  );
});

test("keeps unknown Rendering descendants opaque, including parser warnings", async () => {
  const source = await readFile(fixtureUrl, "utf8");
  const opaqueWarning = source.replace(
    '<bpmnLean:structuredForm>{"opaque":"test-content"}</bpmnLean:structuredForm>',
    '<bpmn:sequenceFlow id="OpaqueFlow" sourceRef="MissingSource" targetRef="MissingTarget"/>',
  );
  const imported = await importCompiledBpmnGraph(opaqueWarning, 1_000);
  assert.equal(imported.warnings.length > 0, true);
  assert.equal(
    imported.warnings.every(
      ({ code }) => code === BpmnSourceDiagnosticCode.ParserWarning,
    ),
    true,
  );
  const result = await compile(opaqueWarning);
  assert.equal(
    result.status,
    BpmnCompilationStatus.Accepted,
    JSON.stringify(result.diagnostics),
  );
});

test("never suppresses a parser warning outside Rendering", async () => {
  const source = await readFile(fixtureUrl, "utf8");
  const result = await compile(
    source.replace('targetRef="ReviewException"', 'targetRef="MissingTask"'),
  );
  assert.equal(result.status, BpmnCompilationStatus.Rejected);
  assert.equal(
    result.diagnostics.some(({ code }) => code === BpmnSourceDiagnosticCode.ParserWarning),
    true,
  );
});

test("refuses CIB formData and every nonliteral candidate-group shape", async () => {
  const source = await readFile(fixtureUrl, "utf8");
  const withFormData = source.replace(
    "      <bpmn:rendering",
    "      <bpmn:extensionElements><c7:formData><c7:formField id=\"approved\" type=\"boolean\"/></c7:formData></bpmn:extensionElements>\n      <bpmn:rendering",
  );
  const mutations = [
    withFormData,
    source.replace('candidateGroups="reviewers"', 'candidateGroups="reviewers,approvers"'),
    source.replace('candidateGroups="reviewers"', 'candidateGroups="${reviewers}"'),
    source.replace('candidateGroups="reviewers"', 'candidateGroups=" reviewers"'),
    source.replace('candidateGroups="reviewers"', 'candidateGroups="reviewers "'),
  ];
  for (const mutation of mutations) {
    assert.equal((await compile(mutation)).status, BpmnCompilationStatus.Rejected);
  }
});

test("refuses the M6 topology under an old profile and Rendering on a non-M6 source", async () => {
  const source = await readFile(fixtureUrl, "utf8");
  const oldProfile = await compile(
    source.replace(
      /\s*<bpmn:extensionElements>[\s\S]*?<\/bpmn:extensionElements>/u,
      "",
    ),
    "bpmn-2.0.2-simple-boolean-exclusive-gateway-draft",
  );
  assert.equal(oldProfile.status, BpmnCompilationStatus.Rejected);
  assert.equal(
    oldProfile.diagnostics.some(({ element }) => element?.subject === "renderings"),
    true,
  );
});

test("refuses every non-String-equality condition only for the M6 profile", async () => {
  const source = await readFile(fixtureUrl, "utf8");
  for (const expression of [
    "true",
    "isPresent(resolution)",
    "isNull(resolution)",
  ]) {
    const mutation = source.replace(
      'stringEquals(resolution,"approved")',
      expression,
    );
    assert.equal(
      (await compile(mutation)).status,
      BpmnCompilationStatus.Rejected,
      expression,
    );
  }
});

async function accepted(source: string) {
  const result = await compile(source);
  assert.equal(
    result.status,
    BpmnCompilationStatus.Accepted,
    JSON.stringify(result.diagnostics),
  );
  if (result.status !== BpmnCompilationStatus.Accepted) {
    throw new Error("structured Human Work fixture was rejected");
  }
  return result;
}

function withoutRendering(source: string): string {
  return source.replace(
    /\s*<bpmn:rendering[\s\S]*?<\/bpmn:rendering>/u,
    "",
  );
}

function withoutExactSourceIdentity<T extends Readonly<{ identity: object }>>(
  value: T,
): Omit<T, "identity"> & Readonly<{ identity: object }> {
  return {
    ...value,
    identity: {
      ...value.identity,
      sourceSha256: "normalized",
    },
  };
}

async function compile(source: string, semanticProfile = profile) {
  return compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(source),
    sourceId: "structured-human-work-test",
    expectedSha256: undefined,
    semanticProfile,
    sourceOverlay: null,
    limits: { maxBytes: 1_000_000, parserDeadlineMs: 1_000 },
  });
}
