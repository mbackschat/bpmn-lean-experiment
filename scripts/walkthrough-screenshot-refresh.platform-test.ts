import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  screenshotCatalog,
  screenshotTargetDirectory,
} from "../showcase/platform-browser-walkthrough/src/screenshot-catalog.ts";
import {
  refreshBrowserWalkthroughScreenshots,
} from "./refresh-browser-walkthrough-screenshots.ts";

const walkthroughDocument = "docs/BPM-PLATFORM-BROWSER-WALKTHROUGH.md";

function markdownImage(alt: string, filename: string): string {
  return `![${alt}](assets/bpm-platform-browser-walkthrough/${filename})`;
}

function pngDimensions(bytes: Buffer): Readonly<{ width: number; height: number }> {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.deepEqual(bytes.subarray(0, signature.length), signature);
  assert.equal(bytes.subarray(12, 16).toString("ascii"), "IHDR");
  return Object.freeze({
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  });
}

test("refreshes through an isolated Compose project and always removes its volumes", async () => {
  const commands: Array<Readonly<{ command: string; args: readonly string[] }>> = [];
  const failure = new Error("capture failed");

  await assert.rejects(refreshBrowserWalkthroughScreenshots({
    allocatePort: async () => 38421,
    processId: 912,
    run: async (command, args, environment) => {
      assert.equal(environment.BPMN_EVALUATION_ORIGIN, "http://127.0.0.1:38421");
      assert.equal(environment.BPMN_EVALUATION_PORT, "38421");
      assert.equal(environment.BPMN_EVALUATION_PROJECTION_MAX_AGE_MS, "30000");
      assert.equal(environment.BPMN_EVALUATION_PROJECTION_REFRESH_AFTER_MS, "5000");
      assert.equal(environment.BPMN_REFRESH_WALKTHROUGH_SCREENSHOTS, "true");
      commands.push({ command, args: [...args] });
      if (command.endsWith("pnpm.sh")) throw failure;
    },
  }), failure);

  assert.deepEqual(commands, [
    {
      command: "docker",
      args: [
        "compose",
        "--project-name",
        "bpmn-lean-walkthrough-912",
        "up",
        "--build",
        "--wait",
      ],
    },
    {
      command: "./scripts/pnpm.sh",
      args: [
        "--filter",
        "@bpmn-lean/showcase-platform-browser-walkthrough",
        "exec",
        "playwright",
        "test",
      ],
    },
    {
      command: "docker",
      args: [
        "compose",
        "--project-name",
        "bpmn-lean-walkthrough-912",
        "down",
        "--volumes",
        "--remove-orphans",
      ],
    },
  ]);
});

test("walkthrough embeds every exact 1440 by 900 catalog image once", async () => {
  const [document, actualFilenames] = await Promise.all([
    readFile(walkthroughDocument, "utf8"),
    readdir(screenshotTargetDirectory),
  ]);
  const expectedFilenames = screenshotCatalog.map(({ filename }) => filename);

  assert.deepEqual(actualFilenames.toSorted(), [...expectedFilenames].toSorted());
  for (const { alt, filename } of screenshotCatalog) {
    const image = markdownImage(alt, filename);
    assert.equal(document.split(image).length - 1, 1, `${filename} must occur exactly once`);
    assert.deepEqual(
      pngDimensions(await readFile(path.join(screenshotTargetDirectory, filename))),
      { width: 1440, height: 900 },
    );
  }
});
