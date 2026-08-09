import assert from "node:assert/strict";
import { request as sendNodeRequest } from "node:http";
import type { Server } from "node:http";
import { test } from "node:test";

import {
  createPlatformHttpServer,
} from "@bpmn-lean/platform-server";

test("uses configured public origin instead of an untrusted Host header", async () => {
  let routedUrl = "";
  const server = createPlatformHttpServer({
    publicOrigin: "https://public.example:8443",
    routes: [async (request) => {
      routedUrl = request.url;
      return new Response("ok");
    }],
  });

  await withListeningServer(server, async (port) => {
    const response = await nodeRequest(port, {
      path: "/definitions?active=true",
      headers: { Host: "attacker.invalid:9999" },
    });
    assert.equal(response.status, 200);
  });

  assert.equal(
    routedUrl,
    "https://public.example:8443/definitions?active=true",
  );
});

test("preserves request method, headers, and streamed body", async () => {
  const body = "<definition>streamed</definition>";
  const server = createPlatformHttpServer({
    publicOrigin: "http://public.example",
    routes: [async (request) => {
      assert.equal(request.method, "POST");
      assert.equal(request.headers.get("content-type"), "application/xml");
      assert.equal(request.headers.get("x-correlation-id"), "correlation-1");
      assert.equal(await request.text(), body);
      return new Response(null, { status: 204 });
    }],
  });

  await withListeningServer(server, async (port) => {
    const response = await nodeRequest(port, {
      method: "POST",
      path: "/api/v1/definitions",
      headers: {
        "Content-Type": "application/xml",
        "X-Correlation-Id": "correlation-1",
      },
      body,
    });
    assert.equal(response.status, 204);
    assert.equal(response.body, "");
  });
});

test("dispatches in declared order and stops after the first response", async () => {
  const visits: string[] = [];
  const server = createPlatformHttpServer({
    publicOrigin: "http://public.example",
    routes: [
      async () => {
        visits.push("first");
        return new Response("handled", { status: 202 });
      },
      async () => {
        visits.push("second");
        throw new Error("must not run");
      },
    ],
  });

  await withListeningServer(server, async (port) => {
    const response = await nodeRequest(port, { path: "/handled" });
    assert.equal(response.status, 202);
    assert.equal(response.body, "handled");
  });
  assert.deepEqual(visits, ["first"]);
});

test("returns closed generic errors for unknown routes and route exceptions", async () => {
  const notFoundServer = createPlatformHttpServer({
    publicOrigin: "http://public.example",
    routes: [async () => null],
  });
  await withListeningServer(notFoundServer, async (port) => {
    const response = await nodeRequest(port, { path: "/unknown" });
    assert.equal(response.status, 404);
    assert.equal(
      response.headers["content-type"],
      "application/json; charset=utf-8",
    );
    assert.deepEqual(JSON.parse(response.body), {
      error: { code: "notFound", message: "Resource not found." },
    });
  });

  const failingServer = createPlatformHttpServer({
    publicOrigin: "http://public.example",
    routes: [async () => {
      throw new Error("private database credentials");
    }],
  });
  await withListeningServer(failingServer, async (port) => {
    const response = await nodeRequest(port, { path: "/failing" });
    assert.equal(response.status, 500);
    assert.equal(
      response.headers["content-type"],
      "application/json; charset=utf-8",
    );
    assert.deepEqual(JSON.parse(response.body), {
      error: { code: "internalFailure", message: "Internal server error." },
    });
    assert.doesNotMatch(response.body, /credentials/u);
  });
});

test("copies response status and headers while streaming its body", async () => {
  const server = createPlatformHttpServer({
    publicOrigin: "http://public.example",
    routes: [async () => new Response("streamed response", {
      status: 206,
      headers: [
        ["content-type", "application/custom"],
        ["set-cookie", "first=1; Path=/"],
        ["set-cookie", "second=2; Path=/"],
        ["x-platform-result", "copied"],
      ],
    })],
  });

  await withListeningServer(server, async (port) => {
    const response = await nodeRequest(port, { path: "/stream" });
    assert.equal(response.status, 206);
    assert.equal(response.headers["content-type"], "application/custom");
    assert.equal(response.headers["x-platform-result"], "copied");
    assert.deepEqual(response.headers["set-cookie"], [
      "first=1; Path=/",
      "second=2; Path=/",
    ]);
    assert.equal(response.body, "streamed response");
  });
});

test("suppresses a routed response body for HEAD", async () => {
  const server = createPlatformHttpServer({
    publicOrigin: "http://public.example",
    routes: [async () => new Response("must not be written", {
      status: 200,
      headers: { "x-head": "preserved" },
    })],
  });

  await withListeningServer(server, async (port) => {
    const response = await nodeRequest(port, {
      method: "HEAD",
      path: "/head",
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers["x-head"], "preserved");
    assert.equal(response.body, "");
  });
});

test("validates the configured public origin once and snapshots route order", async () => {
  const invalidOrigins = [
    "relative.example",
    "ftp://public.example",
    "http://user:secret@public.example",
    "http://public.example/path",
    "http://public.example?query=1",
    "http://public.example#fragment",
  ];
  for (const publicOrigin of invalidOrigins) {
    assert.throws(
      () => createPlatformHttpServer({ publicOrigin, routes: [] }),
      /publicOrigin/u,
    );
  }

  const visits: string[] = [];
  const routes = [async (): Promise<Response | null> => {
    visits.push("original");
    return new Response(null, { status: 204 });
  }];
  const server = createPlatformHttpServer({
    publicOrigin: "http://public.example",
    routes,
  });
  routes.unshift(async () => {
    visits.push("late mutation");
    return null;
  });
  await withListeningServer(server, async (port) => {
    await nodeRequest(port, { path: "/snapshot" });
  });
  assert.deepEqual(visits, ["original"]);
});

type NodeResponse = Readonly<{
  status: number;
  headers: Readonly<Record<string, string | string[] | undefined>>;
  body: string;
}>;

type NodeRequestOptions = Readonly<{
  method?: string;
  path: string;
  headers?: Readonly<Record<string, string>>;
  body?: string;
}>;

async function withListeningServer(
  server: Server,
  run: (port: number) => Promise<void>,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  try {
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("ephemeral listener did not expose a TCP address");
    }
    await run(address.port);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error === undefined ? resolve() : reject(error));
    });
  }
}

async function nodeRequest(
  port: number,
  options: NodeRequestOptions,
): Promise<NodeResponse> {
  return await new Promise((resolve, reject) => {
    const request = sendNodeRequest({
      host: "127.0.0.1",
      port,
      method: options.method ?? "GET",
      path: options.path,
      headers: options.headers,
    }, (response) => {
      response.setEncoding("utf8");
      let body = "";
      response.on("data", (chunk: string) => {
        body += chunk;
      });
      response.once("end", () => {
        resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          body,
        });
      });
    });
    request.once("error", reject);
    request.end(options.body);
  });
}
