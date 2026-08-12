import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ProcessInstanceHttpRoutes,
} from "@bpmn-lean/platform-operate";
import type {
  ProcessInstanceSearchPage,
  ProcessInstanceSearchRequest,
  PublicProcessInstanceIdentity,
} from "@bpmn-lean/platform-contracts";

test("serves the exact identity-only page for decoded filters", async () => {
  const search = new StubSearch(page(
    instance("instance-2", 2),
    instance("instance-1", 1),
  ));
  const routes = new ProcessInstanceHttpRoutes(search);

  const response = await routes.handle(new Request(
    "http://platform.test/api/v1/process-instances?processId=Process_A&limit=2",
  ));

  assert.equal(response?.status, 200);
  assert.equal(response?.headers.get("content-type"), "application/json; charset=utf-8");
  assert.deepEqual(search.requests, [{ processId: "Process_A", limit: 2 }]);
  const value = await response?.json();
  assert.deepEqual(value, search.result);
  assert.equal(containsPrivateHostFact(value), false);
});

test("passes an opaque cursor unchanged and defaults the omitted limit", async () => {
  const search = new StubSearch(page());
  const routes = new ProcessInstanceHttpRoutes(search);

  assert.equal((await routes.handle(new Request(
    "http://platform.test/api/v1/process-instances?cursor=v1.MQ",
  )))?.status, 200);

  assert.deepEqual(search.requests, [{ cursor: "v1.MQ", limit: 50 }]);
});

test("rejects duplicate query fields and a nonempty GET body before search", async () => {
  const search = new StubSearch(page());
  const routes = new ProcessInstanceHttpRoutes(search);

  const duplicate = await routes.handle(new Request(
    "http://platform.test/api/v1/process-instances?processId=A&processId=B",
  ));
  assert.equal(duplicate?.status, 400);
  assert.deepEqual(await duplicate?.json(), {
    error: {
      code: "invalidRequest",
      message: "The Process-instance search request is invalid.",
    },
  });

  const body = new Request(
    "http://platform.test/api/v1/process-instances",
    { method: "POST", body: Uint8Array.of(1) },
  );
  Object.defineProperty(body, "method", { value: "GET" });
  const nonempty = await routes.handle(body);
  assert.equal(nonempty?.status, 400);
  assert.deepEqual(await nonempty?.json(), {
    error: {
      code: "invalidRequest",
      message: "The Process-instance search request is invalid.",
    },
  });
  assert.equal(search.requests.length, 0);
});

test("rejects malformed, unsafe, and nonzero Content-Length before search", async () => {
  const search = new StubSearch(page());
  const routes = new ProcessInstanceHttpRoutes(search);

  for (const value of ["malformed", "9007199254740992", "1"]) {
    const response = await routes.handle(new Request(
      "http://platform.test/api/v1/process-instances",
      { headers: { "content-length": value } },
    ));
    assert.equal(response?.status, 400);
    assert.deepEqual(await response?.json(), {
      error: {
        code: "invalidRequest",
        message: "The Process-instance search request is invalid.",
      },
    });
  }
  assert.equal(search.requests.length, 0);
});

test("returns the canonical method error for the recognized route", async () => {
  const search = new StubSearch(page());
  const routes = new ProcessInstanceHttpRoutes(search);

  const response = await routes.handle(new Request(
    "http://platform.test/api/v1/process-instances?limit=1",
    { method: "POST" },
  ));

  assert.equal(response?.status, 405);
  assert.equal(response?.headers.get("allow"), "GET");
  assert.deepEqual(await response?.json(), {
    error: {
      code: "methodNotAllowed",
      message: "The HTTP method is not allowed for this Process-instance route.",
    },
  });
  assert.equal(search.requests.length, 0);
});

test("leaves unknown paths unclaimed", async () => {
  const search = new StubSearch(page());
  const routes = new ProcessInstanceHttpRoutes(search);

  assert.equal(await routes.handle(new Request(
    "http://platform.test/api/v1/process-instances/missing",
  )), null);
  assert.equal(search.requests.length, 0);
});

test("maps unexpected search failures to the route-owned internal error", async () => {
  const search = new StubSearch(page());
  search.failure = new Error("private storage detail");
  const routes = new ProcessInstanceHttpRoutes(search);

  const response = await routes.handle(new Request(
    "http://platform.test/api/v1/process-instances",
  ));

  assert.equal(response?.status, 500);
  assert.deepEqual(await response?.json(), {
    error: {
      code: "internalFailure",
      message: "The Process-instance search request could not be completed.",
    },
  });
});

class StubSearch {
  readonly requests: ProcessInstanceSearchRequest[] = [];
  readonly result: ProcessInstanceSearchPage;
  failure: Error | null = null;

  constructor(result: ProcessInstanceSearchPage) {
    this.result = result;
  }

  searchProcessInstances(
    request: ProcessInstanceSearchRequest,
  ): ProcessInstanceSearchPage {
    this.requests.push(structuredClone(request));
    if (this.failure !== null) {
      throw this.failure;
    }
    return structuredClone(this.result);
  }
}

function page(
  ...instances: ReadonlyArray<PublicProcessInstanceIdentity>
): ProcessInstanceSearchPage {
  return { instances, nextCursor: null };
}

function instance(
  processInstanceId: string,
  version: number,
): PublicProcessInstanceIdentity {
  return {
    processInstanceId,
    definition: {
      processId: "Process_A",
      version,
      source: {
        kind: "bpmnSource",
        id: `source-${version}`,
        sha256: String(version).repeat(64),
        byteLength: 21,
        declaredEncoding: null,
        decodedAs: "UTF-8",
      },
      semanticProfile: "search-profile",
      startCapabilities: {
        messageStarts: [],
        timerStarts: [],
      },
    },
  };
}

function containsPrivateHostFact(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsPrivateHostFact);
  }
  if (value === null || typeof value !== "object") {
    return false;
  }
  return Object.entries(value).some(([key, nested]) =>
    /ordinal|workflow|run|taskqueue|history|status|timestamp|origin/iu.test(key) ||
    containsPrivateHostFact(nested)
  );
}
