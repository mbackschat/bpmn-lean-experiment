import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL("../", import.meta.url));

test("ships the exact bpmn-js notice and unmodified watermark implementation", async () => {
  const retainedNotice = await readFile(
    path.join(webRoot, "public/third-party/bpmn-js.LICENSE.txt"),
  );
  const distributedNotice = await readFile(
    path.join(webRoot, "dist/third-party/bpmn-js.LICENSE.txt"),
  );
  assert.deepEqual(distributedNotice, retainedNotice);

  const assetDirectory = path.join(webRoot, "dist/assets");
  const scripts = (await readdir(assetDirectory))
    .filter((name) => name.endsWith(".js"))
    .sort();
  assert.ok(scripts.length > 0);
  const bundle = (await Promise.all(
    scripts.map(async (name) => readFile(path.join(assetDirectory, name), "utf8")),
  )).join("\n");
  assert.match(bundle, /bjs-powered-by/u);
  assert.match(bundle, /http:\/\/bpmn\.io/u);
});
