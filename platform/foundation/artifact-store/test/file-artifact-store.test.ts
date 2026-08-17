import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FileArtifactStore } from "../dist/index.js";
import { registerExactArtifactStoreContract } from "./support/artifact-store-contract.ts";
import type { StoredArtifactRecord } from "./support/artifact-store-contract.ts";

registerExactArtifactStoreContract("FileArtifactStore", async (run) => {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-artifacts-"));
  const directory = join(root, "sha256");
  try {
    await run({
      store: new FileArtifactStore(root),
      corruptStoredContent: async (sha256) => {
        const path = join(directory, sha256);
        const bytes = Uint8Array.from(await readFile(path));
        bytes[0] = (bytes[0] ?? 0) ^ 0xff;
        await writeFile(path, bytes);
      },
      readStoredRecord: async (sha256): Promise<StoredArtifactRecord> => {
        const bytes = Uint8Array.from(await readFile(join(directory, sha256)));
        return { sha256, byteLength: bytes.byteLength, bytes };
      },
    });
    const entries = await readDirectoryIfPresent(directory);
    assert.deepEqual(
      entries.filter((name) => name.startsWith(".")),
      [],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function readDirectoryIfPresent(path: string): Promise<readonly string[]> {
  try {
    return await readdir(path);
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}
