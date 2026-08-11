import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DefinitionScheduleStatus,
  PublicApiErrorCode,
} from "@bpmn-lean/platform-contracts";
import {
  DefinitionScheduleConflictError,
  DefinitionScheduleHttpRoutes,
  DefinitionScheduleIntegrityError,
  DefinitionScheduleValidationError,
} from "@bpmn-lean/platform-definitions";
import type {
  DefinitionMetadata,
  DefinitionReference,
  DefinitionSchedule,
  DefinitionScheduleReference,
  PutDefinitionSchedule,
  PutDefinitionScheduleResult,
} from "@bpmn-lean/platform-definitions";

const activationAt = "2026-08-11T12:00:00.000Z";
const definition = {
  processId: "Process/Timer",
  version: 2,
  source: {
    kind: "bpmnSource",
    id: "timer-start.bpmn",
    sha256: "a".repeat(64),
    byteLength: 128,
    declaredEncoding: null,
    decodedAs: "UTF-8",
  },
  semanticProfile: "bpmn-2.0.2-timer-start-event-draft",
  startCapabilities: {
    messageStarts: [],
    timerStarts: [{ startEventId: "TimerStart_PT1S", durationMs: 1_000 }],
  },
} as const satisfies DefinitionMetadata;
const scheduled = {
  scheduleId: "schedule/one",
  definition,
  timerStart: definition.startCapabilities.timerStarts[0],
  activationAt,
  dueAt: "2026-08-11T12:00:01.000Z",
  status: DefinitionScheduleStatus.Scheduled,
  instance: null,
} as const satisfies DefinitionSchedule;
const cancelled = {
  ...scheduled,
  status: DefinitionScheduleStatus.Cancelled,
} as const satisfies DefinitionSchedule;

test("creates one exact definition schedule through the public PUT route", async () => {
  const fixture = createFixture();

  const response = await fixture.routes.handle(scheduleRequest("PUT", {
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ activationAt }),
  }));

  assert.equal(response?.status, 201);
  assert.deepEqual(await responseJson(response), scheduled);
  assert.deepEqual(fixture.puts, [{
    processId: definition.processId,
    version: definition.version,
    scheduleId: scheduled.scheduleId,
    activationAt,
  }]);
});

test("lists, reads, and cancels schedules without exposing private host identity", async () => {
  const fixture = createFixture();

  const listResponse = await fixture.routes.handle(new Request(collectionUrl()));
  const getResponse = await fixture.routes.handle(scheduleRequest("GET"));
  const deleteResponse = await fixture.routes.handle(scheduleRequest("DELETE"));

  assert.equal(listResponse?.status, 200);
  assert.deepEqual(await responseJson(listResponse), {
    definition,
    schedules: [scheduled],
  });
  assert.equal(getResponse?.status, 200);
  assert.deepEqual(await responseJson(getResponse), scheduled);
  assert.equal(deleteResponse?.status, 200);
  const deleted = await responseJson(deleteResponse);
  assert.deepEqual(deleted, cancelled);
  assert.equal(JSON.stringify(deleted).includes("workflowId"), false);
});

test("returns 200 for an identical idempotent PUT retry", async () => {
  const fixture = createFixture({
    putResult: { created: false, schedule: structuredClone(scheduled) },
  });

  const response = await fixture.routes.handle(validPutRequest());

  assert.equal(response?.status, 200);
  assert.deepEqual(await responseJson(response), scheduled);
});

test("rejects malformed transport and request shapes before service entry", async () => {
  const cases = [
    { request: putRequest("{}"), status: 400 },
    { request: putRequest(JSON.stringify({ activationAt, extra: true })), status: 400 },
    { request: putRequest(JSON.stringify({ activationAt: 42 })), status: 400 },
    { request: putRequest("{"), status: 400 },
    { request: putRequest(JSON.stringify({ activationAt: "2026-08-11T12:00:00.001Z" })), status: 422 },
    {
      request: scheduleRequest("PUT", {
        headers: { "content-type": "text/plain" },
        body: JSON.stringify({ activationAt }),
      }),
      status: 415,
    },
    {
      request: scheduleRequest("PUT", {
        headers: {
          "content-type": "application/json",
          "content-length": "1025",
        },
        body: "{}",
      }),
      status: 413,
    },
    {
      request: scheduleRequest("PUT", {
        headers: { "content-type": "application/json" },
        body: new Uint8Array([0xff]),
      }),
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

test("maps missing, conflict, validation, and integrity outcomes exactly", async () => {
  const missingDefinition = createFixture({ definition: null });
  const missingResponse = await missingDefinition.routes.handle(validPutRequest());
  assert.equal(missingResponse?.status, 404);
  assert.equal(await responseCode(missingResponse), PublicApiErrorCode.NotFound);

  const cases = [
    {
      error: new DefinitionScheduleConflictError("private conflict detail"),
      status: 409,
      code: PublicApiErrorCode.Conflict,
    },
    {
      error: new DefinitionScheduleValidationError("activationAt is no longer future"),
      status: 422,
      code: PublicApiErrorCode.InvalidRequest,
    },
    {
      error: new DefinitionScheduleIntegrityError("private host identity drift"),
      status: 500,
      code: PublicApiErrorCode.InternalFailure,
    },
    {
      error: new Error("private Temporal failure"),
      status: 500,
      code: PublicApiErrorCode.InternalFailure,
    },
  ] as const;
  for (const { error, status, code } of cases) {
    const fixture = createFixture({ putError: error });
    const response = await fixture.routes.handle(validPutRequest());
    assert.equal(response?.status, status);
    const body = await response!.text();
    assert.equal(
      (JSON.parse(body) as { error: { code: string } }).error.code,
      code,
    );
    if (status === 500) {
      assert.doesNotMatch(body, /private|Temporal|identity/u);
    }
  }
});

test("returns 404 for missing schedule items and exact Allow headers for wrong methods", async () => {
  const missing = createFixture({ getResult: null, deleteResult: null });
  assert.equal(
    (await missing.routes.handle(scheduleRequest("GET")))?.status,
    404,
  );
  assert.equal(
    (await missing.routes.handle(scheduleRequest("DELETE")))?.status,
    404,
  );

  const itemWrong = await createFixture().routes.handle(scheduleRequest("POST"));
  assert.equal(itemWrong?.status, 405);
  assert.equal(itemWrong?.headers.get("allow"), "DELETE, GET, PUT");
  const collectionWrong = await createFixture().routes.handle(
    new Request(collectionUrl(), { method: "PUT" }),
  );
  assert.equal(collectionWrong?.status, 405);
  assert.equal(collectionWrong?.headers.get("allow"), "GET");
});

test("rejects malformed/query/body route input and leaves unknown paths unclaimed", async () => {
  const fixture = createFixture();
  assert.equal(
    (await fixture.routes.handle(putRequest(
      JSON.stringify({ activationAt }),
      `${scheduleUrl()}?private=1`,
    )))?.status,
    400,
  );
  assert.equal(
    (await fixture.routes.handle(new Request(scheduleUrl(), {
      headers: { "content-type": "application/json" },
    })))?.status,
    400,
  );
  assert.equal(
    (await fixture.routes.handle(new Request(
      "http://platform.test/api/v1/definitions/Process/versions/02/schedules/id",
    )))?.status,
    400,
  );
  assert.equal(
    await fixture.routes.handle(new Request(
      "http://platform.test/api/v1/definitions/Process/versions/2/start",
    )),
    null,
  );
  assert.equal(fixture.puts.length, 0);
});

type FixtureOptions = Readonly<{
  definition?: DefinitionMetadata | null;
  putResult?: PutDefinitionScheduleResult;
  putError?: unknown;
  getResult?: DefinitionSchedule | null;
  deleteResult?: DefinitionSchedule | null;
}>;

function createFixture(options: FixtureOptions = {}): Readonly<{
  routes: DefinitionScheduleHttpRoutes;
  puts: PutDefinitionSchedule[];
}> {
  const puts: PutDefinitionSchedule[] = [];
  const service = {
    put: async (request: PutDefinitionSchedule): Promise<PutDefinitionScheduleResult> => {
      puts.push(structuredClone(request));
      if (options.putError !== undefined) {
        throw options.putError;
      }
      return structuredClone(
        options.putResult ?? { created: true, schedule: scheduled },
      );
    },
    get: async (_reference: DefinitionScheduleReference) =>
      structuredClone(options.getResult === undefined ? scheduled : options.getResult),
    list: async (_reference: DefinitionReference) => [structuredClone(scheduled)],
    delete: async (_reference: DefinitionScheduleReference) =>
      structuredClone(
        options.deleteResult === undefined ? cancelled : options.deleteResult,
      ),
  };
  const definitions = {
    getDefinitionMetadata: (reference: DefinitionReference) =>
      reference.processId === definition.processId &&
        reference.version === definition.version
        ? structuredClone(options.definition === undefined
          ? definition
          : options.definition)
        : null,
  };
  return {
    routes: new DefinitionScheduleHttpRoutes(service, definitions),
    puts,
  };
}

function scheduleRequest(method: string, init: RequestInit = {}): Request {
  return new Request(
    scheduleUrl(),
    { ...init, method },
  );
}

function validPutRequest(): Request {
  return putRequest(JSON.stringify({ activationAt }));
}

function putRequest(
  body: NonNullable<RequestInit["body"]>,
  url: string = scheduleUrl(),
): Request {
  return new Request(url, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body,
  });
}

function scheduleUrl(): string {
  return `${collectionUrl()}/schedule%2Fone`;
}

function collectionUrl(): string {
  return "http://platform.test/api/v1/definitions/Process%2FTimer/versions/2/schedules";
}

async function responseJson(response: Response | null): Promise<unknown> {
  assert.ok(response !== null);
  return await response.json();
}

async function responseCode(response: Response | null): Promise<string> {
  const value = await responseJson(response) as { error: { code: string } };
  return value.error.code;
}
