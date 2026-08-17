import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { test } from "node:test";

import {
  createPlatformHttpServer,
  createStaticAssetsRoute,
} from "@bpmn-lean/platform-server";

test("serves SPA assets with bounded MIME and cache policy", async () => {
  const root = await createAssetTree();
  try {
    const route = createStaticAssetsRoute(root);

    const index = await route(new Request("http://platform.test/instances/one"));
    assert.equal(index?.status, 200);
    assert.equal(index?.headers.get("content-type"), "text/html; charset=utf-8");
    assert.equal(index?.headers.get("cache-control"), "no-cache");
    assert.equal(await index?.text(), "<h1>platform</h1>");

    const asset = await route(
      new Request("http://platform.test/assets/app-D3BrNGB4.js"),
    );
    assert.equal(asset?.status, 200);
    assert.equal(asset?.headers.get("content-type"), "text/javascript; charset=utf-8");
    assert.equal(
      asset?.headers.get("cache-control"),
      "public, max-age=31536000, immutable",
    );

    const unversioned = await route(
      new Request("http://platform.test/assets/readme.js"),
    );
    assert.equal(unversioned?.headers.get("cache-control"), "no-cache");
    assert.equal(
      await route(new Request("http://platform.test/assets/missing.js")),
      null,
    );
    assert.equal(
      await route(new Request("http://platform.test/assets")),
      null,
    );

    const head = await route(
      new Request("http://platform.test/assets/app-D3BrNGB4.js", {
        method: "HEAD",
      }),
    );
    assert.equal(head?.status, 200);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("never escapes its root through raw, encoded, or symlink traversal", async () => {
  const parent = await mkdtemp(join(tmpdir(), "bpmn-platform-static-boundary-"));
  const root = join(parent, "web");
  const secret = join(parent, "secret.txt");
  await mkdir(root);
  await writeFile(join(root, "index.html"), "safe-index");
  await writeFile(secret, "outside-secret");
  await symlink(secret, join(root, "leak.txt"));
  try {
    const route = createStaticAssetsRoute(root);
    for (const path of [
      `/../${basename(secret)}`,
      `/..%2f${basename(secret)}`,
      "/%2e%2e%2fsecret.txt",
      "/%5c..%5csecret.txt",
      "/leak.txt",
    ]) {
      const response = await route(new Request(`http://platform.test${path}`));
      assert.notEqual(await response?.text(), "outside-secret", path);
    }
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("leaves API misses to the ordered API JSON 404", async () => {
  const root = await createAssetTree();
  const server = createPlatformHttpServer({
    publicOrigin: "http://127.0.0.1:8388",
    routes: [createStaticAssetsRoute(root)],
  });
  const port = await listen(server);
  try {
    for (const path of ["/api", "/api/unknown", "/api%2Funknown"]) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), {
        error: { code: "notFound", message: "Resource not found." },
      });
    }
    assert.equal(
      await createStaticAssetsRoute(root)(new Request("http://platform.test/api")),
      null,
    );
    assert.equal(
      await createStaticAssetsRoute(root)(new Request("http://platform.test/", {
        method: "POST",
      })),
      null,
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error === undefined ? resolve() : reject(error));
    });
    await rm(root, { recursive: true, force: true });
  }
});

async function createAssetTree(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "bpmn-platform-static-"));
  await mkdir(join(root, "assets"));
  await writeFile(join(root, "index.html"), "<h1>platform</h1>");
  await writeFile(join(root, "assets", "app-D3BrNGB4.js"), "export {};\n");
  await writeFile(join(root, "assets", "readme.js"), "export {};\n");
  return root;
}

async function listen(server: ReturnType<typeof createServer>): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  assert.ok(address !== null && typeof address !== "string");
  return address.port;
}
