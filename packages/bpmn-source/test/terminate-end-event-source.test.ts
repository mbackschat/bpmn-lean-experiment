/** Locks the exact registered nested Terminate End Event source profile. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  CheckedNodeKind,
  CheckedProcessKind,
  SemanticOperationKind,
  compileBpmnToSemanticProcess,
  lowerCheckedProcess,
} from "@bpmn-lean/bpmn-source";
import type {
  AcceptedBpmnCompilation,
  BpmnCompilationResult,
  CheckedProcess,
} from "@bpmn-lean/bpmn-source";
import { SemanticProfileId } from "@bpmn-lean/semantic-core";

const sourceUrl = new URL("./fixtures/terminate-end-event.bpmn", import.meta.url);
const semanticProfile = SemanticProfileId.TerminateEnd;
const limits = Object.freeze({ maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 });

async function compile(bytes: Uint8Array): Promise<BpmnCompilationResult> {
  return await compileBpmnToSemanticProcess({
    bytes,
    sourceId: "terminate-end-event",
    expectedSha256: undefined,
    semanticProfile,
    sourceOverlay: null,
    limits,
  });
}

function requireAccepted(result: BpmnCompilationResult): AcceptedBpmnCompilation {
  if (result.status !== BpmnCompilationStatus.Accepted) {
    throw new Error(JSON.stringify(result.diagnostics));
  }
  return result;
}

test("compiles and lowers the exact registered nested Terminate End Event source", async () => {
  const bytes = await readFile(sourceUrl);
  const result = requireAccepted(await compile(bytes));

  assert.deepEqual(
    result.checkedProcess.nodes.find(({ id }) => id === "End_Terminate"),
    { kind: CheckedNodeKind.TerminateEndEvent, id: "End_Terminate" },
  );
  assert.deepEqual(
    result.checkedProcess.nodeScopes.find(
      ({ nodeId }) => nodeId === "End_Terminate",
    ),
    { nodeId: "End_Terminate", scopeId: "scope:SubProcess_Work" },
  );
  assert.deepEqual(
    result.semanticProcess.operations.find(
      ({ kind }) => kind === SemanticOperationKind.TerminateScope,
    ),
    {
      id: "operation:End_Terminate",
      kind: SemanticOperationKind.TerminateScope,
      origin: { kind: "bpmnElement", elementId: "End_Terminate" },
      input: "place:Flow_TriggerToTerminate",
      scopeId: "scope:SubProcess_Work",
    },
  );
  assert.deepEqual(Array.from(result.copyExactBytes()), Array.from(bytes));
});

test("derives Terminate origin, input, and scope only from arbitrary admitted identities", async () => {
  const xml = await readFile(sourceUrl, "utf8");
  const changed = xml
    .replaceAll("Process_TerminateEnd", "Process_q7")
    .replaceAll("SubProcess_Work", "Scope_z3")
    .replaceAll("End_Terminate", "End_v9")
    .replaceAll("Flow_TriggerToTerminate", "Flow_k4");
  assert.notEqual(changed, xml);

  const result = requireAccepted(await compile(new TextEncoder().encode(changed)));

  assert.deepEqual(
    result.checkedProcess.nodes.find(
      ({ kind }) => kind === CheckedNodeKind.TerminateEndEvent,
    ),
    { kind: CheckedNodeKind.TerminateEndEvent, id: "End_v9" },
  );
  assert.deepEqual(
    result.semanticProcess.operations.find(
      ({ kind }) => kind === SemanticOperationKind.TerminateScope,
    ),
    {
      id: "operation:End_v9",
      kind: SemanticOperationKind.TerminateScope,
      origin: { kind: "bpmnElement", elementId: "End_v9" },
      input: "place:Flow_k4",
      scopeId: "scope:Scope_z3",
    },
  );
});

test("admits parser-safe false Sub-Process values with equal structure and distinct identity", async () => {
  const xml = await readFile(sourceUrl, "utf8");
  const omitted = requireAccepted(await compile(new TextEncoder().encode(xml)));
  for (const lexeme of ["false", "0"]) {
    const explicitSource = xml.replace(
      '<bpmn:subProcess id="SubProcess_Work">',
      `<bpmn:subProcess id="SubProcess_Work" triggeredByEvent="${lexeme}">`,
    );
    assert.notEqual(explicitSource, xml);
    const explicitBytes = new TextEncoder().encode(explicitSource);
    const explicit = requireAccepted(await compile(explicitBytes));

    assert.notEqual(
      explicit.checkedProcess.identity.sourceSha256,
      omitted.checkedProcess.identity.sourceSha256,
    );
    assert.deepEqual(
      Array.from(explicit.copyExactBytes()),
      Array.from(explicitBytes),
    );
    assert.deepEqual(
      {
        ...explicit.checkedProcess,
        identity: omitted.checkedProcess.identity,
      },
      omitted.checkedProcess,
    );
    assert.deepEqual(
      {
        ...explicit.semanticProcess,
        identity: omitted.semanticProcess.identity,
      },
      omitted.semanticProcess,
    );
  }
});

test("rejects canonical and parser-hostile true-valued Event Sub-Processes", async () => {
  const xml = await readFile(sourceUrl, "utf8");
  for (const lexeme of ["true", "1"]) {
    const mutation = xml.replace(
      '<bpmn:subProcess id="SubProcess_Work">',
      `<bpmn:subProcess id="SubProcess_Work" triggeredByEvent="${lexeme}">`,
    );
    assert.notEqual(mutation, xml);
    assert.equal(
      (await compile(new TextEncoder().encode(mutation))).status,
      BpmnCompilationStatus.Rejected,
    );
  }
});

test("lowers the reusable root checked representation without registering a root source profile", () => {
  const checked = {
    kind: CheckedProcessKind.CheckedProcess,
    identity: {
      semanticProfile,
      sourceId: "synthetic-root-terminate",
      sourceOverlay: null,
      sourceSha256: "a".repeat(64),
    },
    processId: "RootProcess",
    definitionScopes: [{
      id: "scope:RootProcess",
      parentScopeId: null,
      originElementId: "RootProcess",
    }],
    nodeScopes: [
      { nodeId: "RootStart", scopeId: "scope:RootProcess" },
      { nodeId: "RootTerminate", scopeId: "scope:RootProcess" },
    ],
    sequenceFlowScopes: [{
      sequenceFlowId: "RootInput",
      scopeId: "scope:RootProcess",
    }],
    nodes: [
      { kind: CheckedNodeKind.NoneStartEvent, id: "RootStart" },
      { kind: CheckedNodeKind.TerminateEndEvent, id: "RootTerminate" },
    ],
    sequenceFlows: [{
      id: "RootInput",
      sourceId: "RootStart",
      targetId: "RootTerminate",
      condition: null,
    }],
  } as const satisfies CheckedProcess;

  const operation = lowerCheckedProcess(checked).operations.find(
    ({ kind }) => kind === SemanticOperationKind.TerminateScope,
  );

  assert.deepEqual(operation, {
    id: "operation:RootTerminate",
    kind: SemanticOperationKind.TerminateScope,
    origin: { kind: "bpmnElement", elementId: "RootTerminate" },
    input: "place:RootInput",
    scopeId: "scope:RootProcess",
  });
});

test("rejects the exact Terminate End source exclusions", async (context) => {
  const xml = await readFile(sourceUrl, "utf8");

  for (const [name, mutation] of Object.entries(terminateSourceMutations(xml))) {
    await context.test(name, async () => {
      assert.notEqual(mutation, xml, `${name} mutation matched nothing`);
      const result = await compile(new TextEncoder().encode(mutation));
      assert.equal(result.status, BpmnCompilationStatus.Rejected);
    });
  }
});

test("rejects repeated inline definitions through the shared raw cardinality owner", async () => {
  const xml = await readFile(sourceUrl, "utf8");
  const repeated = terminateSourceMutations(xml)["repeated definition"];
  assert.ok(repeated !== undefined);

  const result = await compile(new TextEncoder().encode(repeated));

  assert.equal(result.status, BpmnCompilationStatus.Rejected);
  assert.match(
    result.diagnostics[0]?.evidence ?? "",
    /requires 1 ThrowEvent\.eventDefinitions\[TerminateEventDefinition\].*source contains 2.*retained 2/u,
  );
});

function terminateSourceMutations(xml: string): Readonly<Record<string, string>> {
  const definition = "        <bpmn:terminateEventDefinition />";
  const childStart = '<bpmn:startEvent id="Start_Child">';
  return {
    "missing definition": xml.replace(`${definition}\n`, ""),
    "repeated definition": xml.replace(definition, `${definition}\n${definition}`),
    "referenced definition": xml
      .replace(
        definition,
        "        <bpmn:eventDefinitionRef>TerminateDefinition_Shared</bpmn:eventDefinitionRef>",
      )
      .replace(
        "  <bpmn:process",
        '  <bpmn:terminateEventDefinition id="TerminateDefinition_Shared" />\n  <bpmn:process',
      ),
    "extra definition property": xml.replace(
      definition,
      '        <bpmn:terminateEventDefinition id="TerminateDefinition_Inline" />',
    ),
    "wrong definition kind": xml.replace(
      definition,
      "        <bpmn:signalEventDefinition />",
    ),
    "definition on wrong Event kind": xml
      .replace(`${definition}\n`, "")
      .replace(childStart, `${childStart}\n${definition}`),
    "Terminate End at the root scope": xml
      .replace(`${definition}\n`, "")
      .replace(
        '    <bpmn:endEvent id="End_Root">',
        `    <bpmn:endEvent id="End_Root">\n${definition}`,
      ),
    "multiple incoming flows": xml.replace(
      "      <bpmn:sequenceFlow id=\"Flow_SiblingToEnd\"",
      '      <bpmn:sequenceFlow id="Flow_ExtraToTerminate" sourceRef="UserTask_Sibling" targetRef="End_Terminate" />\n      <bpmn:sequenceFlow id="Flow_SiblingToEnd"',
    ),
    "outgoing flow": xml.replace(
      "      <bpmn:sequenceFlow id=\"Flow_SiblingToEnd\"",
      '      <bpmn:sequenceFlow id="Flow_TerminateToSiblingEnd" sourceRef="End_Terminate" targetRef="End_Sibling" />\n      <bpmn:sequenceFlow id="Flow_SiblingToEnd"',
    ),
    "mixed End definitions": xml.replace(
      definition,
      `${definition}\n        <bpmn:errorEventDefinition />`,
    ),
    "extension payload": xml
      .replace(
        'xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"',
        'xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"\n  xmlns:test="urn:bpmn-lean:test"',
      )
      .replace(
        definition,
        `        <bpmn:extensionElements><test:payload /></bpmn:extensionElements>\n${definition}`,
      ),
  };
}
