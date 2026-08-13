import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DefinitionHttpRoutes,
} from "@bpmn-lean/platform-definitions";
import type {
  DefinitionDeploymentService,
  DefinitionPresentationResolver,
  DefinitionStartService,
} from "@bpmn-lean/platform-definitions";

const definition = {
  processId: "Process/Review",
  version: 7,
  source: {
    kind: "bpmnSource" as const,
    id: "review.bpmn",
    sha256: "a".repeat(64),
    byteLength: 42,
    declaredEncoding: null,
    decodedAs: "UTF-8" as const,
  },
  semanticProfile: "profile/review",
  startCapabilities: { messageStarts: [], timerStarts: [] },
};

test("returns one exact resolved definition presentation", async () => {
  const references: unknown[] = [];
  const presentation = {
    schemaEpoch: 1 as const,
    definition,
    sourceSha256: definition.source.sha256,
    presentationSha256: "b".repeat(64),
    provenance: { kind: "source" as const },
    presentationBpmnXml: "<bpmn:definitions />",
  };
  const routes = createRoutes({
    resolve: async (reference) => {
      references.push(reference);
      return presentation;
    },
  });

  const response = await routes.handle(new Request(
    "http://platform.test/api/v1/definitions/Process%2FReview/versions/7/presentation",
  ));

  assert.equal(response?.status, 200);
  assert.deepEqual(await response?.json(), presentation);
  assert.deepEqual(references, [{ processId: "Process/Review", version: 7 }]);
});

test("presentation route rejects query, wrong method, and missing version", async () => {
  const missing = createRoutes({ resolve: async () => null });
  const responses = await Promise.all([
    missing.handle(new Request(
      "http://platform.test/api/v1/definitions/Process/versions/1/presentation?extra=1",
    )),
    missing.handle(new Request(
      "http://platform.test/api/v1/definitions/Process/versions/1/presentation",
      { method: "POST" },
    )),
    missing.handle(new Request(
      "http://platform.test/api/v1/definitions/Process/versions/1/presentation",
    )),
  ]);
  assert.deepEqual(responses.map((response) => response?.status), [400, 405, 404]);
});

test("presentation failures return a generic response without private evidence", async () => {
  const routes = createRoutes({
    resolve: async () => {
      throw new Error("private generated sidecar corruption at /host/path");
    },
  });

  const response = await routes.handle(new Request(
    "http://platform.test/api/v1/definitions/Process/versions/1/presentation",
  ));

  assert.equal(response?.status, 500);
  assert.doesNotMatch(await response!.text(), /sidecar|host\/path/u);
});

function createRoutes(
  presentation: DefinitionPresentationResolver,
): DefinitionHttpRoutes {
  return new DefinitionHttpRoutes(
    {} as DefinitionDeploymentService,
    {} as DefinitionStartService,
    { maxSourceBytes: 1024 },
    presentation,
  );
}
