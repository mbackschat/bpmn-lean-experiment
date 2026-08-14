import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MessageStartPublicationStatus,
  PublicApiErrorCode,
} from "@bpmn-lean/platform-contracts";
import type {
  MessageStartPublication,
  PutMessageStartPublicationRequest,
} from "@bpmn-lean/platform-contracts";
import {
  MessageStartPublicationConflictError,
  MessageStartPublicationDeliveryUnavailableError,
  MessageStartPublicationHttpRoutes,
  MessageStartPublicationIntegrityError,
  MessageStartPublicationNotFoundError,
  MessageStartPublicationValidationError,
} from "@bpmn-lean/platform-definitions";
import type {
  PutMessageStartPublicationResult,
} from "@bpmn-lean/platform-definitions";

const messageStart = {
  startEventId: "MessageStart_Order",
  channel: {
    kind: "operationMessage",
    interfaceId: "OrderInterface",
    interfaceOperationId: "SubmitOrder",
    messageId: "OrderSubmitted",
  },
} as const;
const definition = {
  processId: "Process/Message",
  version: 2,
  source: {
    kind: "bpmnSource",
    id: "message-start.bpmn",
    sha256: "a".repeat(64),
    byteLength: 256,
    declaredEncoding: null,
    decodedAs: "UTF-8",
  },
  semanticProfile: "bpmn-2.0.2-message-start-event-draft",
  startCapabilities: { messageStarts: [messageStart], timerStarts: [] },
} as const;
const accepted = {
  publicationId: "publication/one",
  definition,
  messageStart,
  status: MessageStartPublicationStatus.Accepted,
  instance: {
    processInstanceId: "semantic-instance-one",
    definition,
  },
} as const satisfies MessageStartPublication;
const pending = {
  ...accepted,
  status: MessageStartPublicationStatus.Pending,
  instance: null,
} as const satisfies MessageStartPublication;
const indeterminate = {
  ...accepted,
  status: MessageStartPublicationStatus.Indeterminate,
  instance: null,
} as const satisfies MessageStartPublication;

test("maps first acceptance, accepted retry, and non-success PUT states exactly", async () => {
  const cases = [
    { result: { created: true, publication: accepted }, status: 201 },
    { result: { created: false, publication: accepted }, status: 200 },
    { result: { created: true, publication: pending }, status: 202 },
    { result: { created: false, publication: indeterminate }, status: 202 },
  ] as const;

  for (const { result, status } of cases) {
    const fixture = createFixture({ putResult: result });
    const response = await fixture.routes.handle(validPutRequest());
    assert.equal(response?.status, status);
    assert.deepEqual(await responseJson(response), result.publication);
    assert.deepEqual(fixture.puts, [{
      publicationId: "publication/one",
      request: putBody,
    }]);
  }
});

test("returns every public GET state as 200 and returns missing as route-owned 404", async () => {
  for (const publication of [accepted, pending, indeterminate]) {
    const response = await createFixture({ getResult: publication }).routes.handle(
      publicationRequest("GET"),
    );
    assert.equal(response?.status, 200);
    assert.deepEqual(await responseJson(response), publication);
  }

  const missing = await createFixture({ getResult: null }).routes.handle(
    publicationRequest("GET"),
  );
  assert.equal(missing?.status, 404);
  assert.equal(await responseCode(missing), PublicApiErrorCode.NotFound);
});

test("rejects an oversized streamed publication body before service entry", async () => {
  const fixture = createFixture();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(4_097));
      controller.close();
    },
  });
  const init = {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: stream,
    duplex: "half",
  } satisfies RequestInit & { duplex: "half" };

  const response = await fixture.routes.handle(new Request(publicationUrl(), init));

  assert.equal(response?.status, 413);
  assert.equal(await responseCode(response), PublicApiErrorCode.PayloadTooLarge);
  assert.equal(fixture.puts.length, 0);
});

test("rejects malformed, unsupported, and query PUT input before service entry", async () => {
  const cases = [
    { request: putRequest("{"), status: 400 },
    { request: putRequest("{}"), status: 400 },
    { request: putRequest(JSON.stringify({ ...putBody, extra: true })), status: 400 },
    {
      request: putRequest(
        JSON.stringify(putBody).replace(
          '"processId":"Process/Message"',
          '"processId":"Other","\\u0070rocessId":"Process/Message"',
        ),
      ),
      status: 400,
    },
    {
      request: publicationRequest("PUT", {
        headers: { "content-type": "application/json" },
      }),
      status: 400,
    },
    {
      request: publicationRequest("PUT", {
        headers: { "content-type": "application/json" },
        body: new Uint8Array([0xff]),
      }),
      status: 400,
    },
    {
      request: publicationRequest("PUT", {
        headers: { "content-type": "text/plain" },
        body: JSON.stringify(putBody),
      }),
      status: 415,
    },
    {
      request: publicationRequest("PUT", {
        headers: {
          "content-type": "application/json",
          "content-length": "4097",
        },
        body: "{}",
      }),
      status: 413,
    },
    {
      request: putRequest(JSON.stringify(putBody), `${publicationUrl()}?latest=true`),
      status: 400,
    },
  ] as const;

  for (const { request, status } of cases) {
    const fixture = createFixture();
    const response = await fixture.routes.handle(request);
    assert.equal(response?.status, status, request.url);
    assert.equal(fixture.puts.length, 0, request.url);
  }
});

test("maps changed-target conflict and all private failures without evidence leakage", async () => {
  const cases = [
    {
      error: new MessageStartPublicationConflictError("changed Interface Operation"),
      status: 409,
      code: PublicApiErrorCode.Conflict,
    },
    {
      error: new MessageStartPublicationNotFoundError(putBody.definition),
      status: 404,
      code: PublicApiErrorCode.NotFound,
    },
    {
      error: new MessageStartPublicationValidationError("private admission evidence"),
      status: 422,
      code: PublicApiErrorCode.InvalidRequest,
    },
    {
      error: new MessageStartPublicationIntegrityError("private Workflow identity drift"),
      status: 500,
      code: PublicApiErrorCode.InternalFailure,
    },
    {
      error: new MessageStartPublicationDeliveryUnavailableError(),
      status: 500,
      code: PublicApiErrorCode.InternalFailure,
    },
    {
      error: new Error("private Temporal connection detail"),
      status: 500,
      code: PublicApiErrorCode.InternalFailure,
    },
  ] as const;

  for (const { error, status, code } of cases) {
    const response = await createFixture({ putError: error }).routes.handle(
      validPutRequest(),
    );
    assert.equal(response?.status, status);
    const body = await response!.text();
    assert.equal((JSON.parse(body) as { error: { code: string } }).error.code, code);
    assert.doesNotMatch(body, /Temporal|Workflow|admission evidence|identity drift/u);
  }
});

test("rejects GET input, malformed identities, and every unsupported operation", async () => {
  const fixture = createFixture();
  assert.equal(
    (await fixture.routes.handle(new Request(publicationUrl(), {
      headers: { "content-type": "application/json" },
    })))?.status,
    400,
  );
  assert.equal(
    (await fixture.routes.handle(new Request(`${publicationUrl()}?private=true`)))?.status,
    400,
  );
  for (const url of [
    "http://platform.test/api/v1/message-start-publications/",
    "http://platform.test/api/v1/message-start-publications/%FF",
  ]) {
    assert.equal((await fixture.routes.handle(new Request(url)))?.status, 400, url);
  }
  for (const method of ["POST", "DELETE", "PATCH"] as const) {
    const response = await fixture.routes.handle(publicationRequest(method));
    assert.equal(response?.status, 405, method);
    assert.equal(response?.headers.get("allow"), "GET, PUT", method);
  }
  assert.equal(fixture.puts.length, 0);
});

test("claims only the global publication item route", async () => {
  const routes = createFixture().routes;
  assert.equal(
    await routes.handle(new Request(
      "http://platform.test/api/v1/message-start-publications",
    )),
    null,
  );
  assert.equal(
    await routes.handle(new Request(
      "http://platform.test/api/v1/message-start-publications/one/extra",
    )),
    null,
  );
  assert.equal(
    await routes.handle(new Request(
      "http://platform.test/api/v1/definitions/Process/versions/1",
    )),
    null,
  );
});

type FixtureOptions = Readonly<{
  putResult?: PutMessageStartPublicationResult;
  putError?: unknown;
  getResult?: MessageStartPublication | null;
  getError?: unknown;
}>;

function createFixture(options: FixtureOptions = {}): Readonly<{
  routes: MessageStartPublicationHttpRoutes;
  puts: Array<Readonly<{
    publicationId: string;
    request: PutMessageStartPublicationRequest;
  }>>;
}> {
  const puts: Array<Readonly<{
    publicationId: string;
    request: PutMessageStartPublicationRequest;
  }>> = [];
  const routes = new MessageStartPublicationHttpRoutes({
    put: async (publicationId, request) => {
      puts.push({ publicationId, request: structuredClone(request) });
      if (options.putError !== undefined) {
        throw options.putError;
      }
      return structuredClone(
        options.putResult ?? { created: true, publication: accepted },
      );
    },
    get: async () => {
      if (options.getError !== undefined) {
        throw options.getError;
      }
      return structuredClone(
        options.getResult === undefined ? accepted : options.getResult,
      );
    },
  });
  return { routes, puts };
}

const putBody = {
  definition: {
    processId: definition.processId,
    version: definition.version,
  },
  messageStart,
} as const satisfies PutMessageStartPublicationRequest;

function validPutRequest(): Request {
  return putRequest(JSON.stringify(putBody));
}

function putRequest(body: string, url: string = publicationUrl()): Request {
  return new Request(url, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body,
  });
}

function publicationRequest(
  method: string,
  init: Omit<RequestInit, "method"> = {},
): Request {
  return new Request(publicationUrl(), { ...init, method });
}

function publicationUrl(): string {
  return "http://platform.test/api/v1/message-start-publications/publication%2Fone";
}

async function responseJson(response: Response | null): Promise<unknown> {
  assert.notEqual(response, null);
  return response!.json();
}

async function responseCode(response: Response | null): Promise<string> {
  const body = await responseJson(response) as { error: { code: string } };
  return body.error.code;
}
