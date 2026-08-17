import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import test from "node:test";

import { allocatePlaywrightLoopbackPorts } from "./playwright-loopback-ports.ts";

const showcaseRoot = new URL("../showcase/", import.meta.url);

test("allocates distinct released loopback ports for one Playwright run", async () => {
  const ports = await allocatePlaywrightLoopbackPorts();
  const reloaded = await allocatePlaywrightLoopbackPorts();
  assert.notEqual(ports.apiPort, ports.webPort);
  assert.deepEqual(reloaded, ports);
  assert.equal(ports.apiOrigin, `http://127.0.0.1:${ports.apiPort}`);
  assert.equal(ports.webOrigin, `http://127.0.0.1:${ports.webPort}`);
  await Promise.all([assertBindable(ports.apiPort), assertBindable(ports.webPort)]);
});

test("every browser project declares either run-local servers or one external origin", async () => {
  const showcaseConfigs = await discoverPlaywrightConfigs(showcaseRoot);
  assert.ok(showcaseConfigs.length > 0);
  for (const path of showcaseConfigs) {
    const source = await readFile(new URL(path, showcaseRoot), "utf8");
    if (source.includes("BPMN_EVALUATION_ORIGIN")) {
      assert.match(source, /BPMN_REFRESH_WALKTHROUGH_SCREENSHOTS/u, path);
      assert.doesNotMatch(source, /\bwebServer\s*:/u, path);
      assert.doesNotMatch(
        source,
        /(?:baseURL|url):\s*"http:\/\/127\.0\.0\.1:\d+/u,
        path,
      );
      continue;
    }
    assert.match(source, /allocatePlaywrightLoopbackPorts/u, path);
    assert.doesNotMatch(source, /PLATFORM_PORT:\s*"\d+"/u, path);
    assert.doesNotMatch(source, /--port\s+\d+/u, path);
    assert.doesNotMatch(source, /(?:baseURL|url):\s*"http:\/\/127\.0\.0\.1:\d+/u, path);
  }
});

async function discoverPlaywrightConfigs(
  directory: URL,
  prefix = "",
): Promise<string[]> {
  const paths: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relativePath = `${prefix}${entry.name}`;
    if (entry.isDirectory()) {
      paths.push(...await discoverPlaywrightConfigs(
        new URL(`${entry.name}/`, directory),
        `${relativePath}/`,
      ));
    } else if (entry.isFile() && entry.name === "playwright.config.ts") {
      paths.push(relativePath);
    }
  }
  return paths.sort();
}

async function assertBindable(port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.close((error) => error === undefined ? resolve() : reject(error));
    });
  });
}
