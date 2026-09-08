import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createCachedLocalEnvironment,
  createCachedTimeSkippingEnvironment,
  temporalCliVersion,
} from "@bpmn-lean/temporal-testkit";
import { TestWorkflowEnvironment } from "@temporalio/testing";

const sdkVersion: string = createRequire(import.meta.url)("@temporalio/testing/package.json").version;
const executableSuffix = process.platform === "win32" ? ".exe" : "";
const downloadType = ["cached", "-download"].join("");
const cases = [
  { method: "createLocal", create: createCachedLocalEnvironment,
    filename: `temporal-${temporalCliVersion}${executableSuffix}`, version: temporalCliVersion },
  { method: "createTimeSkipping", create: createCachedTimeSkippingEnvironment,
    filename: `temporal-test-server-sdk-typescript-${sdkVersion}${executableSuffix}`, version: "default" },
] as const;

for (const entry of cases) {
  test(`${entry.method} reuses an aged exact executable without entering SDK expiration`, async (context) => {
    const directory = await mkdtemp(path.join(tmpdir(), "bpmn-ephemeral-cache-"));
    context.after(() => rm(directory, { recursive: true, force: true }));
    const executable = path.join(directory, entry.filename);
    await writeFile(executable, "test executable");
    const old = new Date("2000-01-01T00:00:00Z");
    await utimes(executable, old, old);
    const stopped = new Error("constructor boundary reached");
    const constructor = context.mock.method(TestWorkflowEnvironment, entry.method, async () => { throw stopped; });

    await assert.rejects(entry.create({ identity: "cache-test", downloadDirectory: directory }), (error) => error === stopped);

    assert.deepEqual(constructor.mock.calls[0]?.arguments, [{
      server: { executable: { type: "existing-path", path: executable } },
      client: { identity: "cache-test" },
    }]);
    assert.equal((await stat(executable)).mtimeMs, old.getTime());
  });

  test(`${entry.method} creates an absent cache and downloads only its selected version`, async (context) => {
    const directory = await mkdtemp(path.join(tmpdir(), "bpmn-ephemeral-cache-"));
    context.after(() => rm(directory, { recursive: true, force: true }));
    const cache = path.join(directory, "missing");
    const stopped = new Error("constructor boundary reached");
    const constructor = context.mock.method(TestWorkflowEnvironment, entry.method, async () => {
      assert.equal((await stat(cache)).isDirectory(), true);
      throw stopped;
    });

    await assert.rejects(entry.create({ identity: "cache-test", downloadDirectory: cache }), (error) => error === stopped);
    await writeFile(path.join(cache, "unrelated-version"), "must not select this executable");
    await assert.rejects(entry.create({ identity: "cache-test", downloadDirectory: cache }), (error) => error === stopped);

    for (const call of constructor.mock.calls) {
      assert.deepEqual(call.arguments, [{
        server: { executable: { type: downloadType, version: entry.version, downloadDir: cache } },
        client: { identity: "cache-test" },
      }]);
    }
  });

  test(`${entry.method} rejects an executable path that is a directory before SDK startup`, async (context) => {
    const directory = await mkdtemp(path.join(tmpdir(), "bpmn-ephemeral-cache-"));
    context.after(() => rm(directory, { recursive: true, force: true }));
    await mkdir(path.join(directory, entry.filename));
    const constructor = context.mock.method(TestWorkflowEnvironment, entry.method, async () => { throw new Error("must not start"); });

    await assert.rejects(entry.create({ identity: "cache-test", downloadDirectory: directory }), /not a file/u);
    assert.equal(constructor.mock.callCount(), 0);
  });
}

test("local cache selection respects an explicit fixed CLI version and preserves floating downloads", async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), "bpmn-ephemeral-cache-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const stopped = new Error("constructor boundary reached");
  const constructor = context.mock.method(TestWorkflowEnvironment, "createLocal", async () => { throw stopped; });
  const executable = path.join(directory, `temporal-v1.7.0${executableSuffix}`);
  await writeFile(executable, "explicit version");
  await assert.rejects(createCachedLocalEnvironment({ identity: "cache-test", downloadDirectory: directory, cliVersion: "v1.7.0" }), (error) => error === stopped);
  assert.deepEqual(constructor.mock.calls[0]?.arguments[0]?.server?.executable, { type: "existing-path", path: executable });

  for (const cliVersion of ["default", "latest"]) {
    await writeFile(path.join(directory, `temporal-${cliVersion}${executableSuffix}`), "floating version");
    await assert.rejects(createCachedLocalEnvironment({ identity: "cache-test", downloadDirectory: directory, cliVersion }), (error) => error === stopped);
    assert.deepEqual(constructor.mock.calls.at(-1)?.arguments[0]?.server?.executable,
      { type: downloadType, version: cliVersion, downloadDir: directory });
  }
});
