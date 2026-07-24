import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  BpmnExecutableIrKind,
  BpmnSourceDiagnosticCode,
  compileSequentialUserTaskBpmn,
} from "../dist/index.js";

const scenarioUrl = new URL(
  "../../../scenarios/m0-sequential-user-task/scenario.json",
  import.meta.url,
);
const bpmnUrl = new URL(
  "../../../scenarios/m0-sequential-user-task/process.bpmn",
  import.meta.url,
);
const scenario = JSON.parse(await readFile(scenarioUrl, "utf8"));
const canonicalBytes = await readFile(bpmnUrl);

const limits = Object.freeze({
  maxBytes: 1024 * 1024,
  parserDeadlineMs: 1_000,
});

function compile(bytes, overrides = {}) {
  return compileSequentialUserTaskBpmn({
    bytes,
    sourceId: scenario.bpmn.id,
    expectedSha256: scenario.bpmn.sha256,
    semanticProfile: scenario.profile,
    limits,
    ...overrides,
  });
}

test("retains the exact source identity and compiles the M0 model to versioned IR", async () => {
  const result = await compile(canonicalBytes);

  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  assert.deepEqual(result.diagnostics, []);
  const firstCopy = result.copyExactBytes();
  assert.deepEqual([...firstCopy], [...canonicalBytes]);
  firstCopy[0] = 0;
  assert.equal(result.copyExactBytes()[0], canonicalBytes[0]);
  assert.deepEqual(result.source, {
    schemaVersion: "0.1.0",
    id: "m0-sequential-user-task-process",
    sha256: "537758345c021a30d3dcca2e8d18137fae151d6501b72b4b46a77e6125dee295",
    byteLength: canonicalBytes.byteLength,
    declaredEncoding: "UTF-8",
    decodedAs: "UTF-8",
  });
  assert.deepEqual(result.executableIr, {
    schemaVersion: "0.1.0",
    kind: BpmnExecutableIrKind.SequentialUserTask,
    identity: {
      compiler: "bpmn-source-sequential-user-task@0.1.0",
      semanticProfile: "cibseven-2.2.0-spike.1",
      sourceId: "m0-sequential-user-task-process",
      sourceSha256: "537758345c021a30d3dcca2e8d18137fae151d6501b72b4b46a77e6125dee295",
    },
    processId: "Process_SequentialUserTask",
    startEventId: "StartEvent_1",
    userTaskId: "UserTask_Approve",
    endEventId: "EndEvent_1",
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
});

test("rejects a source identity mismatch", async () => {
  const result = await compile(canonicalBytes, {
    expectedSha256: "0".repeat(64),
  });

  assert.equal(result.status, BpmnCompilationStatus.Rejected);
  assert.equal(result.executableIr, undefined);
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
  assert.equal(result.executableIr, undefined);
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
  assert.equal(result.executableIr, undefined);
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
  assert.equal(result.executableIr, undefined);
  assert.ok(
    result.diagnostics.some(
      ({ code }) => code === BpmnSourceDiagnosticCode.UnsupportedModel,
    ),
  );
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
  assert.equal(result.executableIr, undefined);
  assert.deepEqual(
    result.diagnostics.map(({ code }) => code),
    [BpmnSourceDiagnosticCode.SourceTooLarge],
  );
});
