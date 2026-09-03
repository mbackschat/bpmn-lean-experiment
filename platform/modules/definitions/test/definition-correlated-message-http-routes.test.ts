import assert from "node:assert/strict";
import test from "node:test";

import {
  DefinitionCorrelatedMessageResolutionKind,
  DefinitionCorrelatedMessageSemanticOutcomeKind,
  PublicApiErrorCode,
} from "@bpmn-lean/platform-contracts";
import type {
  DefinitionCorrelatedMessageCapabilities,
  DefinitionCorrelatedMessagePublication,
  PutDefinitionCorrelatedMessagePublicationRequest,
} from "@bpmn-lean/platform-contracts";
import {
  DefinitionCorrelatedMessageHttpRoutes,
  DefinitionCorrelatedMessageIntegrityError,
  DefinitionCorrelatedMessagePublishStatus,
} from "@bpmn-lean/platform-definitions";
import type {
  DefinitionCorrelatedMessagePublishCommand,
  DefinitionCorrelatedMessagePublishResult,
  DefinitionReference,
} from "@bpmn-lean/platform-definitions";

const definition = {
  processId: "Correlated/Settlement",
  version: 2,
  source: {
    kind: "bpmnSource",
    id: "correlated-settlement.bpmn",
    sha256: "a".repeat(64),
    byteLength: 4096,
    declaredEncoding: "UTF-8",
    decodedAs: "UTF-8",
  },
  semanticProfile: "bpmn-2.0.2-bpmn-lean-message-key-correlation-v1",
  startCapabilities: { messageStarts: [], timerStarts: [] },
} as const;
const correlatedMessage = {
  catchEventId: "Catch/Settlement",
  channel: {
    kind: "operationMessage",
    interfaceId: "SettlementInterface",
    interfaceOperationId: "receiveSettlement",
    messageId: "SettlementReceived",
  },
  correlationKeyId: "SettlementCorrelationKey",
} as const;
const capabilities = {
  definition,
  messages: [correlatedMessage],
} as const satisfies DefinitionCorrelatedMessageCapabilities;
const publication = {
  definition,
  correlatedMessage,
  resolution: {
    kind: DefinitionCorrelatedMessageResolutionKind.Semantic,
    commandId: "command/42",
    ingressOrdinal: 7,
    outcome: {
      kind: DefinitionCorrelatedMessageSemanticOutcomeKind.RejectedAmbiguous,
    },
  },
} as const satisfies DefinitionCorrelatedMessagePublication;
const putBody = {
  payload: { kind: "string", value: "invoice-42" },
} as const satisfies PutDefinitionCorrelatedMessagePublicationRequest;

test("returns exact capabilities and every resolved publication as 200", async () => {
  const fixture = createFixture();

  const capabilitiesResponse = await fixture.routes.handle(
    new Request(collectionUrl()),
  );
  const publicationResponse = await fixture.routes.handle(validPutRequest());

  assert.equal(capabilitiesResponse?.status, 200);
  assert.deepEqual(await responseJson(capabilitiesResponse), capabilities);
  assert.equal(publicationResponse?.status, 200);
  assert.deepEqual(await responseJson(publicationResponse), publication);
  assert.deepEqual(fixture.describes, [{
    processId: definition.processId,
    version: definition.version,
  }]);
  assert.deepEqual(fixture.publishes, [{
    definition: {
      processId: definition.processId,
      version: definition.version,
    },
    catchEventId: correlatedMessage.catchEventId,
    commandId: publication.resolution.commandId,
    payload: putBody.payload,
  }]);
});

test("rejects target smuggling and malformed bodies before service entry", async () => {
  const cases = [
    putRequest("{"),
    putRequest("{}"),
    putRequest(JSON.stringify({ ...putBody, processInstanceId: "caller-target" })),
    putRequest(JSON.stringify({ payload: { ...putBody.payload, value: "" } })),
    putRequest(
      '{"payload":{"kind":"string","value":"one","\\u0076alue":"two"}}',
    ),
    new Request(publicationUrl(), {
      method: "PUT",
      headers: { "content-type": "text/plain" },
      body: JSON.stringify(putBody),
    }),
    putRequest(JSON.stringify(putBody), `${publicationUrl()}?target=private`),
  ];

  for (const request of cases) {
    const fixture = createFixture();
    const response = await fixture.routes.handle(request);
    assert.ok(response?.status === 400 || response?.status === 415, request.url);
    assert.equal(fixture.publishes.length, 0, request.url);
  }
});

test("enforces the 4096-byte request ceiling before service entry", async () => {
  const fixture = createFixture();
  const response = await fixture.routes.handle(new Request(publicationUrl(), {
    method: "PUT",
    headers: { "content-type": "application/json", "content-length": "4097" },
    body: "{}",
  }));

  assert.equal(response?.status, 413);
  assert.equal(await responseCode(response), PublicApiErrorCode.PayloadTooLarge);
  assert.equal(fixture.publishes.length, 0);
});

test("maps definition/capability absence, command conflict, and private failures", async () => {
  const cases = [
    {
      result: { status: DefinitionCorrelatedMessagePublishStatus.DefinitionNotFound },
      status: 404,
      code: PublicApiErrorCode.NotFound,
    },
    {
      result: { status: DefinitionCorrelatedMessagePublishStatus.CapabilityNotFound },
      status: 404,
      code: PublicApiErrorCode.NotFound,
    },
    {
      result: { status: DefinitionCorrelatedMessagePublishStatus.IdentityConflict },
      status: 409,
      code: PublicApiErrorCode.Conflict,
    },
  ] as const;
  for (const { result, status, code } of cases) {
    const response = await createFixture({ publishResult: result }).routes.handle(
      validPutRequest(),
    );
    assert.equal(response?.status, status);
    assert.equal(await responseCode(response), code);
  }

  for (const error of [
    new DefinitionCorrelatedMessageIntegrityError("private Workflow detail"),
    new Error("private Temporal detail"),
  ]) {
    const response = await createFixture({ publishError: error }).routes.handle(
      validPutRequest(),
    );
    const body = await response!.text();
    assert.equal(response?.status, 500);
    assert.doesNotMatch(body, /Workflow|Temporal|private/u);
  }
});

test("returns definition absence for capability GET and sanitizes discovery failures", async () => {
  const missing = await createFixture({ describeResult: null }).routes.handle(
    new Request(collectionUrl()),
  );
  assert.equal(missing?.status, 404);
  assert.equal(await responseCode(missing), PublicApiErrorCode.NotFound);

  const failed = await createFixture({
    describeError: new DefinitionCorrelatedMessageIntegrityError("private source drift"),
  }).routes.handle(new Request(collectionUrl()));
  assert.equal(failed?.status, 500);
  assert.doesNotMatch(await failed!.text(), /private|drift/u);
});

test("rejects bodies, queries, malformed identities, and unsupported methods", async () => {
  const fixture = createFixture();
  const getWithBody = new Request(collectionUrl(), {
    body: "{}",
    method: "POST",
  });
  Object.defineProperty(getWithBody, "method", { value: "GET" });
  assert.equal(
    (await fixture.routes.handle(getWithBody))?.status,
    400,
  );
  assert.equal(
    (await fixture.routes.handle(new Request(`${collectionUrl()}?private=true`)))?.status,
    400,
  );
  assert.equal(
    (await fixture.routes.handle(new Request(
      "http://platform.test/api/v1/definitions/Process/versions/02/correlated-messages",
    )))?.status,
    400,
  );
  const wrongCollectionMethod = await fixture.routes.handle(new Request(collectionUrl(), {
    method: "PUT",
  }));
  assert.equal(wrongCollectionMethod?.status, 405);
  assert.equal(wrongCollectionMethod?.headers.get("allow"), "GET");
  const wrongPublicationMethod = await fixture.routes.handle(new Request(publicationUrl(), {
    method: "GET",
  }));
  assert.equal(wrongPublicationMethod?.status, 405);
  assert.equal(wrongPublicationMethod?.headers.get("allow"), "PUT");
  assert.equal(
    await fixture.routes.handle(new Request(`${publicationUrl()}/extra`)),
    null,
  );
});

type FixtureOptions = Readonly<{
  describeResult?: DefinitionCorrelatedMessageCapabilities | null;
  describeError?: unknown;
  publishResult?: DefinitionCorrelatedMessagePublishResult;
  publishError?: unknown;
}>;

function createFixture(options: FixtureOptions = {}) {
  const describes: DefinitionReference[] = [];
  const publishes: DefinitionCorrelatedMessagePublishCommand[] = [];
  const routes = new DefinitionCorrelatedMessageHttpRoutes({
    describe: async (reference) => {
      describes.push(structuredClone(reference));
      if (options.describeError !== undefined) throw options.describeError;
      return structuredClone(
        options.describeResult === undefined ? capabilities : options.describeResult,
      );
    },
    publish: async (command) => {
      publishes.push(structuredClone(command));
      if (options.publishError !== undefined) throw options.publishError;
      return structuredClone(options.publishResult ?? {
        status: DefinitionCorrelatedMessagePublishStatus.Resolved,
        publication,
      });
    },
  });
  return { routes, describes, publishes };
}

function collectionUrl(): string {
  return "http://platform.test/api/v1/definitions/Correlated%2FSettlement/versions/2/correlated-messages";
}

function publicationUrl(): string {
  return `${collectionUrl()}/Catch%2FSettlement/publications/command%2F42`;
}

function validPutRequest(): Request {
  return putRequest(JSON.stringify(putBody));
}

function putRequest(body: string, url = publicationUrl()): Request {
  return new Request(url, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body,
  });
}

async function responseJson(response: Response | null): Promise<unknown> {
  assert.notEqual(response, null);
  return await response!.json();
}

async function responseCode(response: Response | null): Promise<string> {
  const value = await responseJson(response) as { error: { code: string } };
  return value.error.code;
}
