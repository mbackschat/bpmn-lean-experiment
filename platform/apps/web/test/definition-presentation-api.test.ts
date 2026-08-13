import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { DefinitionPresentationProvenanceKind } from "@bpmn-lean/platform-contracts";
import type {
  DeployedDefinitionVersion,
  ResolvedBpmnDiagramPresentation,
} from "@bpmn-lean/platform-contracts";

import {
  DefinitionApiClient,
  DefinitionProtocolError,
} from "../src/definitions-api.ts";

const presentationBpmnXml = "<definitions id=\"resolved\">ä</definitions>";
const presentationSha256 = createHash("sha256")
  .update(presentationBpmnXml, "utf8")
  .digest("hex");
const definition = {
  processId: "Process_Presentation",
  version: 3,
  source: {
    kind: "bpmnSource",
    id: "presentation.bpmn",
    sha256: "a".repeat(64),
    byteLength: 42,
    declaredEncoding: null,
    decodedAs: "UTF-8",
  },
  semanticProfile: "profile/portable",
  startCapabilities: { messageStarts: [], timerStarts: [] },
} as const satisfies DeployedDefinitionVersion;

function presentation(
  overrides: Partial<ResolvedBpmnDiagramPresentation> = {},
): ResolvedBpmnDiagramPresentation {
  return {
    schemaEpoch: 1,
    definition,
    sourceSha256: definition.source.sha256,
    presentationSha256,
    provenance: { kind: DefinitionPresentationProvenanceKind.Source },
    presentationBpmnXml,
    ...overrides,
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

test("fetches and binds one exact resolved presentation", async () => {
  const expectedDefinition = structuredClone(definition);
  const release = Promise.withResolvers<void>();
  let capturedUrl: string | undefined;
  let capturedInit: RequestInit | undefined;
  const client = new DefinitionApiClient("https://platform.test/ignored/", async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    await release.promise;
    return jsonResponse(presentation({ definition: expectedDefinition }));
  });
  const requestedDefinition = structuredClone(definition);

  const pending = client.getPresentation(requestedDefinition);
  Object.assign(requestedDefinition, { processId: "Process_Drift", version: 99 });
  Object.assign(requestedDefinition.source, { sha256: "f".repeat(64) });
  release.resolve();

  assert.deepEqual(await pending, presentation({ definition: expectedDefinition }));
  assert.equal(
    capturedUrl,
    "https://platform.test/api/v1/definitions/Process_Presentation/versions/3/presentation",
  );
  assert.equal(new Headers(capturedInit?.headers).get("accept"), "application/json");
});

test("rejects source binding drift even when the presentation digest is correct", async () => {
  const client = new DefinitionApiClient(
    "https://platform.test/",
    async () => jsonResponse(presentation({ sourceSha256: "d".repeat(64) })),
  );

  await assert.rejects(
    client.getPresentation(definition),
    (error: unknown) =>
      error instanceof DefinitionProtocolError && /source digest/u.test(error.message),
  );
});

test("rejects presentation digest drift and recursively private responses", async () => {
  const digestDriftClient = new DefinitionApiClient(
    "https://platform.test/",
    async () => jsonResponse(presentation({ presentationSha256: "e".repeat(64) })),
  );
  await assert.rejects(
    digestDriftClient.getPresentation(definition),
    (error: unknown) =>
      error instanceof DefinitionProtocolError && /presentation digest/u.test(error.message),
  );

  const privateClient = new DefinitionApiClient(
    "https://platform.test/",
    async () => jsonResponse({
      ...presentation(),
      provenance: {
        kind: DefinitionPresentationProvenanceKind.Generated,
        generatorId: "bpmn-auto-layout",
        generatorVersion: "1.3.0",
        effectiveGeneratorSha256: "c".repeat(64),
        workflowId: "private-workflow",
      },
    }),
  );
  await assert.rejects(privateClient.getPresentation(definition), DefinitionProtocolError);
});
