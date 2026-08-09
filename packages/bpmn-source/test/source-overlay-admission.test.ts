import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  BpmnSourceDiagnosticCode,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import type {
  CompileBpmnToSemanticProcessRequest,
  SourceOverlaySelection,
} from "@bpmn-lean/bpmn-source";
import {
  CheckedNodeKind,
  SemanticProfileId,
} from "@bpmn-lean/semantic-core";

import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";

const mappedSuccessSource = new URL(
  "../../../scenarios/mapped-success-service-task/process.bpmn",
  import.meta.url,
);
const mappedBoundarySource = new URL(
  "../../../scenarios/mapped-boundary-error-service-task/process.bpmn",
  import.meta.url,
);

const activity = "urn:bpmn-lean:effect-protocol:activity-v1";
const mappedSuccess = "urn:bpmn-lean:effect-operation:mapped-success-v1";
const mappedBoundary =
  "urn:bpmn-lean:effect-operation:mapped-boundary-error-v1";

test("compiles both neutral mapped Service Task mechanisms without an overlay", async () => {
  const results = await Promise.all([
    compileSource(
      await readFile(mappedSuccessSource),
      SemanticProfileId.MappedSuccessServiceTask,
      null,
    ),
    compileSource(
      await readFile(mappedBoundarySource),
      SemanticProfileId.MappedBoundaryErrorServiceTask,
      null,
    ),
  ]);

  assert.deepEqual(
    results.map(({ status }) => status),
    [BpmnCompilationStatus.Accepted, BpmnCompilationStatus.Accepted],
  );
  assert.deepEqual(
    results.map(({ checkedProcess }) => checkedProcess?.identity.sourceOverlay),
    [null, null],
  );
});

test("projects bounded mappings, route data, and source IDs instead of fixture literals", async () => {
  const success = (await readFile(mappedSuccessSource, "utf8"))
    .replaceAll("Process_MappedSuccess", "Process_AlternateSuccess")
    .replaceAll("MappedSuccessTask", "AlternateSuccessTask")
    .replaceAll("StartEvent_MappedSuccess", "AlternateSuccessStart")
    .replaceAll("EndEvent_MappedSuccess", "AlternateSuccessEnd")
    .replaceAll("requestValue", "inputName")
    .replaceAll("example-input", "alternate-input")
    .replaceAll("resultValue", "outputName")
    .replaceAll("${result}", "${localResult}");
  const boundary = (await readFile(mappedBoundarySource, "utf8"))
    .replaceAll("Process_MappedBoundaryError", "Process_AlternateBoundary")
    .replaceAll("MappedBoundaryEffectTask", "AlternateBoundaryEffect")
    .replaceAll("MappedBusinessError", "AlternateBusinessCode")
    .replaceAll("ReviewMappedError", "AlternateReviewTask")
    .replaceAll("requestValue", "boundaryInput")
    .replaceAll("example-input", "boundary-value")
    .replaceAll("resultValue", "boundaryOutput")
    .replaceAll("${result}", "${boundaryLocal}");
  const [successResult, boundaryResult] = await Promise.all([
    compileSource(
      new TextEncoder().encode(success),
      SemanticProfileId.MappedSuccessServiceTask,
      null,
    ),
    compileSource(
      new TextEncoder().encode(boundary),
      SemanticProfileId.MappedBoundaryErrorServiceTask,
      null,
    ),
  ]);

  assert.equal(successResult.status, BpmnCompilationStatus.Accepted);
  assert.equal(boundaryResult.status, BpmnCompilationStatus.Accepted);
  assert.equal(successResult.checkedProcess.processId, "Process_AlternateSuccess");
  const successTask = successResult.checkedProcess.nodes.find(
    ({ kind }) => kind === CheckedNodeKind.ServiceTask,
  );
  assert.ok(successTask?.kind === CheckedNodeKind.ServiceTask);
  assert.deepEqual(successTask.inputMappings, [{
    target: "inputName",
    expression: { kind: "stringLiteral", value: "alternate-input" },
  }]);
  const boundaryTask = boundaryResult.checkedProcess.nodes.find(
    ({ kind }) => kind === CheckedNodeKind.ServiceTask,
  );
  assert.ok(boundaryTask?.kind === CheckedNodeKind.ServiceTask);
  assert.equal(boundaryTask.bpmnErrorRoute?.code, "AlternateBusinessCode");
  assert.deepEqual(boundaryTask.outputMappings, [{
    target: "boundaryOutput",
    expression: { kind: "localVariable", name: "boundaryLocal" },
  }]);
});

test("admits an alternate exact binding and content-binds its overlay identity", async () => {
  const source = await readFile(mappedSuccessSource, "utf8");
  const alternateToken = "${alternateMappedSuccessHandler}";
  const artifact = overlayArtifact({
    id: "alternate-mapped-success",
    semanticProfile: SemanticProfileId.MappedSuccessServiceTask,
    effectBindings: [binding(null, alternateToken, mappedSuccess)],
  });
  const selection = await selectOverlay(artifact);

  const result = await compileSource(
    new TextEncoder().encode(
      source.replace("${mappedSuccessHandler}", alternateToken),
    ),
    SemanticProfileId.MappedSuccessServiceTask,
    selection,
  );

  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  assert.deepEqual(result.checkedProcess.identity.sourceOverlay, {
    id: selection.id,
    sha256: selection.sha256,
  });
  assert.deepEqual(
    result.semanticProcess.identity.sourceOverlay,
    result.checkedProcess.identity.sourceOverlay,
  );
});

test("rejects an overlay whose descriptor belongs only to another profile before projection", async () => {
  const artifact = overlayArtifact({
    id: "cross-profile-binding",
    semanticProfile: SemanticProfileId.MappedSuccessServiceTask,
    effectBindings: [binding(null, "${alternateHandler}", mappedBoundary)],
  });
  const result = await compileSource(
    await readFile(mappedSuccessSource),
    SemanticProfileId.MappedSuccessServiceTask,
    await selectOverlay(artifact),
  );

  assert.equal(result.status, BpmnCompilationStatus.Rejected);
  assert.deepEqual(result.diagnostics.map(({ code }) => code), [
    BpmnSourceDiagnosticCode.UnsupportedModel,
  ]);
  assert.match(result.diagnostics[0]?.evidence ?? "", /profile-owned allowlist/u);
});

test("declares one exact inert attribute without changing the checked graph or program", async () => {
  const source = await readFile(mappedSuccessSource, "utf8");
  const namespaceUri = "urn:example:mapped-source-metadata";
  const withAttribute = source.replace(
    '<bpmn:process id="Process_MappedSuccess"',
    `<bpmn:process xmlns:metadata="${namespaceUri}" metadata:revision="one" id="Process_MappedSuccess"`,
  );
  const artifact = overlayArtifact({
    id: "mapped-success-inert-metadata",
    semanticProfile: SemanticProfileId.MappedSuccessServiceTask,
    inertAttributes: [{
      elementType: "bpmn:Process",
      expandedName: { namespaceUri, localName: "revision" },
    }],
  });
  const selection = await selectOverlay(artifact);
  const without = await compileSource(
    new TextEncoder().encode(source),
    SemanticProfileId.MappedSuccessServiceTask,
    selection,
  );
  const withMetadata = await compileSource(
    new TextEncoder().encode(withAttribute),
    SemanticProfileId.MappedSuccessServiceTask,
    selection,
  );

  assert.equal(without.status, BpmnCompilationStatus.Accepted);
  assert.equal(withMetadata.status, BpmnCompilationStatus.Accepted);
  assert.notEqual(without.source.sha256, withMetadata.source.sha256);
  assert.deepEqual(
    withoutSourceDigest(without.checkedProcess),
    withoutSourceDigest(withMetadata.checkedProcess),
  );
  assert.deepEqual(
    withoutSourceDigest(without.semanticProcess),
    withoutSourceDigest(withMetadata.semanticProcess),
  );
});

test("retains both classification findings on an overlay-selected source", async () => {
  const source = await readFile(mappedSuccessSource, "utf8");
  const namespaceUri = "urn:example:unregistered";
  const perturbed = source
    .replace(
      "<bpmn:definitions",
      `<bpmn:definitions xmlns:vendor="${namespaceUri}"`,
    )
    .replace(
      '<bpmn:startEvent id="StartEvent_MappedSuccess"',
      '<bpmn:startEvent vendor:mode="async" id="StartEvent_MappedSuccess"',
    )
    .replace(
      "</bpmn:process>",
      '<bpmn:scriptTask id="UnsupportedExecutable" /></bpmn:process>',
    );
  const artifact = overlayArtifact({
    id: "classification-overlay",
    semanticProfile: SemanticProfileId.MappedSuccessServiceTask,
  });
  const result = await compileSource(
    new TextEncoder().encode(perturbed),
    SemanticProfileId.MappedSuccessServiceTask,
    await selectOverlay(artifact),
  );

  assert.equal(result.status, BpmnCompilationStatus.Rejected);
  assert.ok(result.diagnostics.some(
    ({ code }) => code === BpmnSourceDiagnosticCode.UnconsumedForeignAttribute,
  ));
  assert.ok(result.diagnostics.some(
    ({ code }) => code === BpmnSourceDiagnosticCode.UnsupportedElementType,
  ));
});

test("rejects malformed or capability-bearing overlays before structural projection", async () => {
  const valid = overlayArtifact({
    id: "strict-overlay",
    semanticProfile: SemanticProfileId.MappedSuccessServiceTask,
  });
  const duplicateBinding = binding(null, "${alternate}", mappedSuccess);
  const mutations: ReadonlyArray<Readonly<{ name: string; json: string }>> = [
    {
      name: "unknown callback property",
      json: valid.replace('"inertAttributes":[]', '"inertAttributes":[],"reader":"./reader.js"'),
    },
    {
      name: "duplicate object key",
      json: valid.replace('"id":"strict-overlay"', '"id":"strict-overlay","id":"second"'),
    },
    {
      name: "unpaired surrogate",
      json: valid.replace('"id":"strict-overlay"', '"id":"\\ud800"'),
    },
    {
      name: "wildcard attribute",
      json: overlayArtifact({
        id: "strict-overlay",
        semanticProfile: SemanticProfileId.MappedSuccessServiceTask,
        inertAttributes: [{
          elementType: "*",
          expandedName: { namespaceUri: "urn:example", localName: "mode" },
        }],
      }),
    },
    {
      name: "duplicate source binding",
      json: overlayArtifact({
        id: "strict-overlay",
        semanticProfile: SemanticProfileId.MappedSuccessServiceTask,
        effectBindings: [duplicateBinding, duplicateBinding],
      }),
    },
    {
      name: "duplicate inert locus",
      json: overlayArtifact({
        id: "strict-overlay",
        semanticProfile: SemanticProfileId.MappedSuccessServiceTask,
        inertAttributes: [
          {
            elementType: "bpmn:Process",
            expandedName: { namespaceUri: "urn:example", localName: "mode" },
          },
          {
            elementType: "bpmn:Process",
            expandedName: { namespaceUri: "urn:example", localName: "mode" },
          },
        ],
      }),
    },
    {
      name: "overlong Unicode scalar string",
      json: valid.replace("strict-overlay", "😀".repeat(257)),
    },
    {
      name: "oversized binding set",
      json: overlayArtifact({
        id: "strict-overlay",
        semanticProfile: SemanticProfileId.MappedSuccessServiceTask,
        effectBindings: Array.from({ length: 65 }, (_, index) =>
          binding(null, `\${handler${index}}`, mappedSuccess)
        ),
      }),
    },
  ];

  for (const mutation of mutations) {
    const result = await compileSource(
      await readFile(mappedSuccessSource),
      SemanticProfileId.MappedSuccessServiceTask,
      await selectOverlayText("strict-overlay", mutation.json),
    );
    assert.equal(
      result.status,
      BpmnCompilationStatus.Rejected,
      `${mutation.name} must reject`,
    );
    assert.equal(
      result.diagnostics[0]?.code,
      BpmnSourceDiagnosticCode.InvalidSourceOverlay,
      mutation.name,
    );
  }
});

test("enforces the overlay byte bound before digest comparison", async () => {
  const result = await compileSource(
    await readFile(mappedSuccessSource),
    SemanticProfileId.MappedSuccessServiceTask,
    {
      id: "oversized",
      sha256: "0".repeat(64),
      bytes: new Uint8Array(65_537),
    },
  );

  assert.equal(result.status, BpmnCompilationStatus.Rejected);
  assert.equal(
    result.diagnostics[0]?.code,
    BpmnSourceDiagnosticCode.InvalidSourceOverlay,
  );
  assert.match(result.diagnostics[0]?.evidence ?? "", /65536 bytes/u);
});

test("requires exact overlay ID, digest, and selected profile identity", async () => {
  const artifact = overlayArtifact({
    id: "identity-bound-overlay",
    semanticProfile: SemanticProfileId.MappedSuccessServiceTask,
  });
  const selection = await selectOverlay(artifact);
  const profileMismatch = overlayArtifact({
    id: "identity-bound-overlay",
    semanticProfile: SemanticProfileId.MappedBoundaryErrorServiceTask,
  });
  const cases: ReadonlyArray<SourceOverlaySelection> = [
    { ...selection, id: "wrong-id" },
    { ...selection, sha256: "0".repeat(64) },
    await selectOverlayText("identity-bound-overlay", profileMismatch),
  ];

  for (const sourceOverlay of cases) {
    const result = await compileSource(
      await readFile(mappedSuccessSource),
      SemanticProfileId.MappedSuccessServiceTask,
      sourceOverlay,
    );
    assert.equal(result.status, BpmnCompilationStatus.Rejected);
  }
});

test("requires overlay collections to use exact Unicode-scalar canonical order", async () => {
  const artifact = overlayArtifact({
    id: "canonical-order-overlay",
    semanticProfile: SemanticProfileId.MappedSuccessServiceTask,
    effectBindings: [
      binding(null, "${zHandler}", mappedSuccess),
      binding(null, "${aHandler}", mappedSuccess),
    ],
  });
  const result = await compileSource(
    await readFile(mappedSuccessSource),
    SemanticProfileId.MappedSuccessServiceTask,
    await selectOverlay(artifact),
  );

  assert.equal(result.status, BpmnCompilationStatus.Rejected);
  assert.equal(
    result.diagnostics[0]?.code,
    BpmnSourceDiagnosticCode.InvalidSourceOverlay,
  );
});

async function compileSource(
  bytes: Uint8Array,
  semanticProfile: string,
  sourceOverlay: SourceOverlaySelection | null,
) {
  return compileBpmnToSemanticProcess({
    bytes,
    sourceId: "source-overlay-test",
    expectedSha256: undefined,
    semanticProfile,
    sourceOverlay,
    limits: semanticProcessTestLimits,
  });
}

function overlayArtifact(options: Readonly<{
  id: string;
  semanticProfile: string;
  effectBindings?: ReadonlyArray<unknown>;
  inertAttributes?: ReadonlyArray<unknown>;
}>): string {
  return JSON.stringify({
    kind: "bpmnSourceOverlay",
    id: options.id,
    semanticProfile: options.semanticProfile,
    effectBindings: options.effectBindings ?? [],
    inertAttributes: options.inertAttributes ?? [],
  });
}

function binding(
  implementation: string | null,
  delegateExpression: string,
  operation: string,
) {
  return {
    source: { implementation, delegateExpression },
    descriptor: { protocol: activity, operation },
  };
}

async function selectOverlay(json: string): Promise<SourceOverlaySelection> {
  const parsed = JSON.parse(json) as Readonly<{ id: string }>;
  return selectOverlayText(parsed.id, json);
}

async function selectOverlayText(
  id: string,
  json: string,
): Promise<SourceOverlaySelection> {
  const bytes = new TextEncoder().encode(json);
  return { id, sha256: await sha256(bytes), bytes };
}

function withoutSourceDigest<Definition extends Readonly<{
  identity: Readonly<{ sourceSha256: string }>;
}>>(definition: Definition): Definition {
  return {
    ...definition,
    identity: { ...definition.identity, sourceSha256: "<source-digest>" },
  };
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const input = new Uint8Array(bytes.byteLength);
  input.set(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", input);
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}
