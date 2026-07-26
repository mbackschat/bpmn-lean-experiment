import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  BpmnSourceDiagnosticCode,
  CheckedNodeKind,
  SemanticOperationKind,
  SemanticProcessCompilerId,
  compileBpmnToSemanticProcess,
} from "../dist/index.js";

const scenarioUrl = new URL(
  "../../../scenarios/user-task-discovery-completion/scenario.json",
  import.meta.url,
);
const bpmnUrl = new URL(
  "../../../scenarios/user-task-discovery-completion/process.bpmn",
  import.meta.url,
);
const serviceTaskProbeUrl = new URL(
  "../../../runners/cibseven/src/test/resources/org/bpmnlean/cibseven/CibSevenServiceTaskPhaseZeroProbeTest.bpmn",
  import.meta.url,
);
const scenario = JSON.parse(await readFile(scenarioUrl, "utf8"));
const canonicalBytes = await readFile(bpmnUrl);

const limits = Object.freeze({
  maxBytes: 1024 * 1024,
  parserDeadlineMs: 1_000,
});

function compile(bytes, overrides = {}) {
  return compileBpmnToSemanticProcess({
    bytes,
    sourceId: scenario.bpmn.id,
    expectedSha256: scenario.bpmn.sha256,
    semanticProfile: scenario.profile,
    limits,
    ...overrides,
  });
}

test("retains exact source identity and compiles checked and semantic definitions", async () => {
  const result = await compile(canonicalBytes);

  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  assert.deepEqual(result.diagnostics, []);
  const firstCopy = result.copyExactBytes();
  assert.deepEqual([...firstCopy], [...canonicalBytes]);
  firstCopy[0] = 0;
  assert.equal(result.copyExactBytes()[0], canonicalBytes[0]);
  assert.deepEqual(result.source, {
    kind: "bpmnSource",
    id: "sequential-user-task-process",
    sha256: "b5704a6d526ce5029e21b2de214653860bb23f7ed6169c4d912cd2412486378d",
    byteLength: canonicalBytes.byteLength,
    declaredEncoding: "UTF-8",
    decodedAs: "UTF-8",
  });
  assert.deepEqual(result.checkedProcess, {
    kind: "checkedProcess",
    identity: {
      semanticProfile: "cibseven-2.2.0-user-task-draft",
      sourceId: "sequential-user-task-process",
      sourceSha256: "b5704a6d526ce5029e21b2de214653860bb23f7ed6169c4d912cd2412486378d",
    },
    processId: "Process_SequentialUserTask",
    nodes: [
      { kind: CheckedNodeKind.NoneEndEvent, id: "EndEvent_1" },
      { kind: CheckedNodeKind.NoneStartEvent, id: "StartEvent_1" },
      {
        kind: CheckedNodeKind.UserTask,
        id: "UserTask_Approve",
        name: "Approve",
      },
    ],
    sequenceFlows: [
      {
        id: "Flow_StartToTask",
        sourceId: "StartEvent_1",
        targetId: "UserTask_Approve",
      },
      {
        id: "Flow_TaskToEnd",
        sourceId: "UserTask_Approve",
        targetId: "EndEvent_1",
      },
    ],
  });
  assert.equal(
    result.semanticProcess.identity.compiler,
    SemanticProcessCompilerId.BpmnSourceSemanticProcess,
  );
  assert.deepEqual(
    result.semanticProcess.operations.map(({ kind }) => kind),
    [
      SemanticOperationKind.Terminate,
      SemanticOperationKind.Initiate,
      SemanticOperationKind.AwaitUserTask,
    ],
  );
});

test("preserves an omitted optional User Task name as null", async () => {
  const xml = new TextDecoder().decode(canonicalBytes);
  const namelessBytes = new TextEncoder().encode(
    xml.replace(' name="Approve"', ""),
  );

  const result = await compile(namelessBytes, {
    expectedSha256: undefined,
  });

  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  assert.deepEqual(
    result.checkedProcess.nodes.find(
      ({ kind }) => kind === CheckedNodeKind.UserTask,
    ),
    {
      kind: CheckedNodeKind.UserTask,
      id: "UserTask_Approve",
      name: null,
    },
  );
});

test("rejects a source identity mismatch", async () => {
  const result = await compile(canonicalBytes, {
    expectedSha256: "0".repeat(64),
  });

  assert.equal(result.status, BpmnCompilationStatus.Rejected);
  assert.equal(result.checkedProcess, undefined);
  assert.equal(result.semanticProcess, undefined);
  assert.deepEqual(
    result.diagnostics.map(({ code }) => code),
    [BpmnSourceDiagnosticCode.SourceIdentityMismatch],
  );
});

test("records a UTF-8 declaration after a UTF-8 byte-order mark", async () => {
  const bomBytes = new Uint8Array(canonicalBytes.byteLength + 3);
  bomBytes.set([0xef, 0xbb, 0xbf]);
  bomBytes.set(canonicalBytes, 3);

  const result = await compile(bomBytes, {
    expectedSha256: undefined,
  });

  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  assert.equal(result.source.declaredEncoding, "UTF-8");
  assert.equal(result.source.decodedAs, "UTF-8");
});

test("blocks a declared encoding that the first capsule cannot decode", async () => {
  const xml = new TextDecoder().decode(canonicalBytes);
  const result = await compile(
    new TextEncoder().encode(xml.replace("UTF-8", "ISO-8859-1")),
    {
      expectedSha256: undefined,
    },
  );

  assert.equal(result.status, BpmnCompilationStatus.Rejected);
  assert.deepEqual(
    result.diagnostics.map(({ code }) => code),
    [BpmnSourceDiagnosticCode.UnsupportedEncoding],
  );
});

test("blocks executable admission when the parser reports a lost reference", async () => {
  const mutatedXml = new TextDecoder().decode(canonicalBytes).replace(
    'targetRef="EndEvent_1"',
    'targetRef="Missing_EndEvent"',
  );
  const mutatedBytes = new TextEncoder().encode(mutatedXml);
  const result = await compile(mutatedBytes, {
    expectedSha256: undefined,
  });

  assert.equal(result.status, BpmnCompilationStatus.Rejected);
  assert.equal(result.checkedProcess, undefined);
  assert.equal(result.semanticProcess, undefined);
  assert.ok(
    result.diagnostics.some(
      ({ code, evidence }) =>
        code === BpmnSourceDiagnosticCode.ParserWarning &&
        evidence.includes("Missing_EndEvent"),
    ),
  );
});

test("rejects a DOCTYPE before structural parsing", async () => {
  const xml = new TextDecoder().decode(canonicalBytes);
  const mutatedBytes = new TextEncoder().encode(
    xml.replace(
      "<bpmn:definitions",
      '<!DOCTYPE definitions SYSTEM "https://example.invalid/bpmn.dtd">\n<bpmn:definitions',
    ),
  );
  const result = await compile(mutatedBytes, {
    expectedSha256: undefined,
  });

  assert.equal(result.status, BpmnCompilationStatus.Rejected);
  assert.equal(result.checkedProcess, undefined);
  assert.equal(result.semanticProcess, undefined);
  assert.deepEqual(
    result.diagnostics.map(({ code }) => code),
    [BpmnSourceDiagnosticCode.DoctypeForbidden],
  );
});

test("rejects BPMN behavior outside the first executable profile", async () => {
  const xml = new TextDecoder().decode(canonicalBytes);
  const mutatedBytes = new TextEncoder().encode(
    xml
      .replace("<bpmn:userTask", "<bpmn:serviceTask")
      .replace("</bpmn:userTask>", "</bpmn:serviceTask>"),
  );
  const result = await compile(mutatedBytes, {
    expectedSha256: undefined,
  });

  assert.equal(result.status, BpmnCompilationStatus.Rejected);
  assert.equal(result.checkedProcess, undefined);
  assert.equal(result.semanticProcess, undefined);
  assert.ok(
    result.diagnostics.some(
      ({ code }) => code === BpmnSourceDiagnosticCode.UnsupportedModel,
    ),
  );
});

test("retains the exact Service Task probe source and foreign attributes without parser warnings", async () => {
  const probeBytes = await readFile(serviceTaskProbeUrl);
  const result = await compileBpmnToSemanticProcess({
    bytes: probeBytes,
    sourceId: "service-task-effect-phase-zero-probe",
    semanticProfile: scenario.profile,
    limits,
  });

  assert.deepEqual([...result.copyExactBytes()], [...probeBytes]);
  assert.equal(result.status, BpmnCompilationStatus.Rejected);
  assert.deepEqual(
    result.diagnostics.map(({ code }) => code),
    [BpmnSourceDiagnosticCode.UnsupportedModel],
  );

  const { importBpmnGraph } = await import("../dist/moddle-adapter.js");
  const imported = await importBpmnGraph(
    new TextDecoder().decode(probeBytes),
    limits.parserDeadlineMs,
  );
  assert.deepEqual(imported.warnings, []);
  const process = imported.rootElement.rootElements.find(
    ({ $type }) => $type === "bpmn:Process",
  );
  const serviceTask = process.flowElements.find(
    ({ id }) => id === "ServiceTask_Record",
  );
  assert.equal(
    serviceTask.implementation,
    "urn:bpmn-lean:effect:probe-v1",
  );
  assert.equal(
    serviceTask.$attrs["camunda:delegateExpression"],
    "${bpmnLeanEffectHandler}",
  );
  assert.equal(serviceTask.$attrs["camunda:asyncBefore"], "true");
});

test("enforces the caller-provided byte limit before parsing", async () => {
  const result = await compile(canonicalBytes, {
    expectedSha256: undefined,
    limits: {
      ...limits,
      maxBytes: canonicalBytes.byteLength - 1,
    },
  });

  assert.equal(result.status, BpmnCompilationStatus.Rejected);
  assert.equal(result.checkedProcess, undefined);
  assert.equal(result.semanticProcess, undefined);
  assert.deepEqual(
    result.diagnostics.map(({ code }) => code),
    [BpmnSourceDiagnosticCode.SourceTooLarge],
  );
});
