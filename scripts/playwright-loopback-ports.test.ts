import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import test from "node:test";

import { allocatePlaywrightLoopbackPorts } from "./playwright-loopback-ports.ts";

const showcaseConfigs = [
  "showcase/m1-definition-deployment/playwright.config.ts",
  "showcase/m2-definition-scheduling/playwright.config.ts",
  "showcase/m2-message-start-ingress/playwright.config.ts",
  "showcase/m2-process-instance-search/playwright.config.ts",
  "showcase/m3-human-work/playwright.config.ts",
  "showcase/m4-incident-operations/playwright.config.ts",
  "showcase/platform-ui-quality/playwright.config.ts",
] as const;

test("allocates distinct released loopback ports for one Playwright run", async () => {
  const ports = await allocatePlaywrightLoopbackPorts();
  const reloaded = await allocatePlaywrightLoopbackPorts();
  assert.notEqual(ports.apiPort, ports.webPort);
  assert.deepEqual(reloaded, ports);
  assert.equal(ports.apiOrigin, `http://127.0.0.1:${ports.apiPort}`);
  assert.equal(ports.webOrigin, `http://127.0.0.1:${ports.webPort}`);
  await Promise.all([assertBindable(ports.apiPort), assertBindable(ports.webPort)]);
});

test("every browser showcase derives run-local ports instead of reserving fixed ones", async () => {
  for (const path of showcaseConfigs) {
    const source = await readFile(path, "utf8");
    assert.match(source, /allocatePlaywrightLoopbackPorts/u, path);
    assert.doesNotMatch(source, /PLATFORM_PORT:\s*"\d+"/u, path);
    assert.doesNotMatch(source, /--port\s+\d+/u, path);
    assert.doesNotMatch(source, /(?:baseURL|url):\s*"http:\/\/127\.0\.0\.1:\d+/u, path);
  }
});

async function assertBindable(port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.close((error) => error === undefined ? resolve() : reject(error));
    });
  });
}
