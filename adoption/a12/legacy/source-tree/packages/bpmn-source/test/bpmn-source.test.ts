import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  BpmnCompilationStatus,
  BpmnSourceDiagnosticCode,
  CheckedNodeKind,
  SemanticOperationKind,
  SemanticProcessCompilerId,
  booleanAttributeNames,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import type {
  BpmnCompilationResult,
  BpmnSourceLimits,
  CompileBpmnToSemanticProcessRequest,
} from "@bpmn-lean/bpmn-source";
import type { Scenario } from "@bpmn-lean/semantic-core";

import {
  findModdleElement,
  importCompiledBpmnGraph,
  moddleElement,
  moddleElements,
} from "./compiled-moddle-graph.ts";

const scenarioUrl = new URL(
  "../../../scenarios/user-task-discovery-completion/scenario.json",
  import.meta.url,
);
const bpmnUrl = new URL(
  "../../../scenarios/user-task-discovery-completion/process.bpmn",
  import.meta.url,
);
const serviceTaskProbeUrl = new URL(
  "../../../scenarios/service-task-effect/process.bpmn",
  import.meta.url,
);
const createDocumentUrl = new URL(
  "../../../scenarios/create-document-data/process.bpmn",
  import.meta.url,
);
const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
// The retained scenario is a tracked answer-free document locked by the
// contract gate, so its declared type is the current wire contract.
const scenario = JSON.parse(
  await readFile(scenarioUrl, "utf8"),
) as Scenario;
const canonicalBytes = await readFile(bpmnUrl);

const limits: BpmnSourceLimits = Object.freeze({
  maxBytes: 1024 * 1024,
  parserDeadlineMs: 1_000,
});

function compile(
  bytes: Uint8Array,
  overrides: Partial<CompileBpmnToSemanticProcessRequest> = {},
): Promise<BpmnCompilationResult> {
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
      semanticProfile: "cibseven-2.2.0-user-task-process-data-draft",
      sourceId: "sequential-user-task-process",
      sourceSha256: "b5704a6d526ce5029e21b2de214653860bb23f7ed6169c4d912cd2412486378d",
    },
    processId: "Process_SequentialUserTask",
    definitionScopes: [{
      id: "scope:Process_SequentialUserTask",
      parentScopeId: null,
      originElementId: "Process_SequentialUserTask",
    }],
    nodeScopes: [
      {
        nodeId: "EndEvent_1",
        scopeId: "scope:Process_SequentialUserTask",
      },
      {
        nodeId: "StartEvent_1",
        scopeId: "scope:Process_SequentialUserTask",
      },
      {
        nodeId: "UserTask_Approve",
        scopeId: "scope:Process_SequentialUserTask",
      },
    ],
    sequenceFlowScopes: [
      {
        sequenceFlowId: "Flow_StartToTask",
        scopeId: "scope:Process_SequentialUserTask",
      },
      {
        sequenceFlowId: "Flow_TaskToEnd",
        scopeId: "scope:Process_SequentialUserTask",
      },
    ],
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
        condition: null,
      },
      {
        id: "Flow_TaskToEnd",
        sourceId: "UserTask_Approve",
        targetId: "EndEvent_1",
        condition: null,
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
      SemanticOperationKind.ReachNoneEnd,
      SemanticOperationKind.Initiate,
      SemanticOperationKind.AwaitUserTask,
      SemanticOperationKind.CompleteScope,
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

test("admits the exact Service Task source and foreign attributes without parser warnings", async () => {
  const probeBytes = await readFile(serviceTaskProbeUrl);
  const result = await compileBpmnToSemanticProcess({
    bytes: probeBytes,
    sourceId: "service-task-effect-phase-zero-probe",
    expectedSha256: undefined,
    semanticProfile: "cibseven-2.2.0-service-task-effect-draft",
    limits,
  });

  assert.deepEqual([...result.copyExactBytes()], [...probeBytes]);
  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  assert.deepEqual(result.diagnostics, []);

  const imported = await importCompiledBpmnGraph(
    new TextDecoder().decode(probeBytes),
    limits.parserDeadlineMs,
  );
  assert.deepEqual(imported.warnings, []);
  const process = findModdleElement(
    moddleElements(
      moddleElement(imported.rootElement, "rootElement"),
      "rootElements",
    ),
    "$type",
    "bpmn:Process",
  );
  const serviceTask = findModdleElement(
    moddleElements(process, "flowElements"),
    "id",
    "ServiceTask_Record",
  );
  const foreignAttributes = moddleElement(serviceTask["$attrs"], "$attrs");
  assert.equal(
    serviceTask["implementation"],
    "urn:bpmn-lean:effect:probe-v1",
  );
  assert.equal(
    foreignAttributes["camunda:delegateExpression"],
    "${bpmnLeanEffectHandler}",
  );
  assert.equal(foreignAttributes["camunda:asyncBefore"], "true");
});

test("admits the A12 CreateDocument source shape without rewriting metadata or mappings", async () => {
  const sourceBytes = await readFile(createDocumentUrl);
  const result = await compileBpmnToSemanticProcess({
    bytes: sourceBytes,
    sourceId: "a12-create-document-data",
    expectedSha256: undefined,
    semanticProfile: "cibseven-2.0.0-a12-create-document-draft",
    limits,
  });

  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual([...result.copyExactBytes()], [...sourceBytes]);
  assert.deepEqual(
    result.checkedProcess.nodes.find(
      ({ kind }) => kind === CheckedNodeKind.ServiceTask,
    ),
    {
      kind: CheckedNodeKind.ServiceTask,
      id: "CreateDocument",
      descriptor: {
        protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
        operation: "urn:bpmn-lean:effect-operation:mapped-success-v1",
      },
      bpmnErrorRoute: null,
      inputMappings: [
        {
          target: "documentModelName",
          expression: {
            kind: "stringLiteral",
            value: "MyDocumentModel",
          },
        },
      ],
      outputMappings: [
        {
          target: "myDocumentReference",
          expression: {
            kind: "localVariable",
            name: "newDocRef",
          },
        },
      ],
    },
  );
  assert.deepEqual(
    result.semanticProcess.operations.find(
      ({ kind }) => kind === SemanticOperationKind.AwaitEffect,
    ),
    {
      id: "operation:CreateDocument",
      kind: SemanticOperationKind.AwaitEffect,
      origin: {
        kind: "bpmnElement",
        elementId: "CreateDocument",
      },
      input: "place:Flow_StartToCreate",
      output: "place:Flow_CreateToEnd",
      effect: {
        elementId: "CreateDocument",
        descriptor: {
          protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
          operation: "urn:bpmn-lean:effect-operation:mapped-success-v1",
        },
        inputMappings: [
          {
            target: "documentModelName",
            expression: {
              kind: "stringLiteral",
              value: "MyDocumentModel",
            },
          },
        ],
        outputMappings: [
          {
            target: "myDocumentReference",
            expression: {
              kind: "localVariable",
              name: "newDocRef",
            },
          },
        ],
      },
      bpmnErrorRoute: null,
    },
  );
});

test("rejects executable drift outside the exact A12 CreateDocument profile", async () => {
  const source = await readFile(createDocumentUrl, "utf8");
  const mutations = [
    source.replace(
      "${createDocumentDelegate}",
      "${createDocumentDelegate.execute()}",
    ),
    source.replace(
      'camunda:delegateExpression="${createDocumentDelegate}"',
      'camunda:delegateExpression="${createDocumentDelegate}" camunda:class="example.Hostile"',
    ),
    source.replace('name="documentModelName"', 'name="otherInput"'),
    source.replace(">MyDocumentModel<", ">OtherModel<"),
    source.replace("${newDocRef}", "${result.newDocRef}"),
    source.replace(
      "</camunda:inputOutput>",
      '<camunda:inputParameter name="extra">value</camunda:inputParameter></camunda:inputOutput>',
    ),
  ];

  for (const mutation of mutations) {
    const result = await compileBpmnToSemanticProcess({
      bytes: new TextEncoder().encode(mutation),
      sourceId: "a12-create-document-data",
      expectedSha256: undefined,
      semanticProfile: "cibseven-2.0.0-a12-create-document-draft",
      limits,
    });
    assert.equal(result.status, BpmnCompilationStatus.Rejected);
  }
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

/**
 * The exact-lexeme guard derives its attribute set from the metamodel manifest rather than a list,
 * which is what makes it class-level. Nothing else would notice a manifest edit: `scoped-flow-elements.ts`
 * hardcodes `triggeredByEvent` in its own allowlist, so dropping that property from the manifest would
 * leave the compiler working and the guard silently un-armed for the one attribute whose reader admits
 * on the coerced value.
 */
test("derives the guarded boolean attributes from the metamodel manifest", () => {
  assert.deepEqual(booleanAttributeNames, [
    "cancelActivity",
    "instantiate",
    "isExecutable",
    "isInterrupting",
    "triggeredByEvent",
  ]);
});

/**
 * Locks the pinned parser's `xsd:boolean` coercion on the one lexeme where nothing else would notice
 * it changing.
 *
 * `coercionAgreesWithXsdBoolean` admits `true`, `false`, and `0`. The guard's over-rejection bounds
 * the risk for every lexeme it refuses and bounds nothing for those three, and `0` is the unbounded
 * case: if the parser ever mapped it to `true`, the guard would pass it and every reader keying on
 * `triggeredByEvent` or `instantiate` would invert silently — the original defect with a different
 * lexeme.
 *
 * Observed through the public compiler rather than the parser adapter, which keeps raw moddle inside
 * this package and keeps the assertion non-circular: the guard admits `isExecutable="0"`, so what
 * rejects the source afterwards is the coercion delivering `false` to a profile requiring `true`. A
 * parser that flipped `0` would make this source compile.
 *
 * This is not the only lock on the admitted set, and it is the weaker kind. `false` is locked by the
 * three profile admit-cases that would break on a `"false"`→true flip, and `0` additionally by
 * `admits cancelActivity="0"` in the non-interrupting source suite. Those are admit-assertions on an
 * admitted lexeme, which cannot go vacuous — both hazards turn accept into reject — where a
 * reject-assertion like this one can. Do not delete the stronger locks believing this replaces them.
 */
test("locks the pinned parser's coercion of the one lexeme the guard admits", async () => {
  const canonicalSource = new TextDecoder().decode(canonicalBytes);
  const executable = (lexeme: string) =>
    compile(
      new TextEncoder().encode(
        canonicalSource.replace('isExecutable="true"', `isExecutable="${lexeme}"`),
      ),
      { expectedSha256: undefined },
    );

  assert.equal((await executable("true")).status, BpmnCompilationStatus.Accepted);
  const zero = await executable("0");
  assert.notEqual(zero.status, BpmnCompilationStatus.Accepted);
  // The exact code, not merely "not accepted": that weaker form is satisfied by the guard refusing
  // the lexeme as well as by the coercion refusing the Process, so dropping `0` from the admitted
  // set would leave this green while it observed nothing.
  assert.deepEqual(
    zero.diagnostics.map(({ code }) => code),
    [BpmnSourceDiagnosticCode.UnsupportedModel],
  );
});
