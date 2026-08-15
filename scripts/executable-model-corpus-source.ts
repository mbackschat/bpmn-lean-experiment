import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  CorpusModel,
  ExternalArchiveCorpusSource,
  ExternalCorpusSource,
} from "./executable-model-corpus-manifest.ts";

const maxCorpusModelBytes = 1024 * 1024;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function currentRevision(checkoutRoot: string): string {
  const result = spawnSync("git", ["-C", checkoutRoot, "rev-parse", "HEAD"], {
    encoding: "utf8",
    timeout: 5_000,
  });
  if (result.status !== 0) {
    throw new Error(
      `cannot resolve external checkout revision at ${checkoutRoot}: ${result.stderr}`,
    );
  }
  return result.stdout.trim();
}

export async function verifyExternalCorpusSource(
  source: ExternalCorpusSource,
  externalRoot: string,
): Promise<void> {
  if (source.kind === "git") {
    const checkoutRoot = path.join(externalRoot, source.checkoutRelativePath);
    const actualRevision = currentRevision(checkoutRoot);
    if (actualRevision !== source.revision) {
      throw new Error(
        `external source ${source.id} expected ${source.revision} but found ${actualRevision}`,
      );
    }
    return;
  }
  const archivePath = path.join(externalRoot, source.archiveRelativePath);
  const actualSha = sha256(await readFile(archivePath));
  if (actualSha !== source.sha256) {
    throw new Error(
      `external archive ${source.id} expected SHA-256 ${source.sha256} but found ${actualSha}`,
    );
  }
}

export async function readExternalCorpusModel(
  model: CorpusModel,
  sources: ReadonlyMap<string, ExternalCorpusSource>,
  externalRoot: string,
): Promise<Uint8Array> {
  if (model.source.kind === "retainedScenario") {
    throw new TypeError("external model reader requires an external source");
  }
  const source = sources.get(model.source.externalSourceId);
  if (source === undefined) {
    throw new Error(`external source ${model.source.externalSourceId} is absent`);
  }
  if (model.source.kind === "externalGit") {
    if (source.kind !== "git") {
      throw new Error(
        `external source ${model.source.externalSourceId} is not a Git checkout`,
      );
    }
    return readFile(path.join(
      externalRoot,
      source.checkoutRelativePath,
      model.source.relativePath,
    ));
  }
  if (source.kind !== "archive") {
    throw new Error(
      `external source ${model.source.externalSourceId} is not an archive`,
    );
  }
  return extractArchiveEntry(
    path.join(externalRoot, source.archiveRelativePath),
    source,
    model.source.relativePath,
  );
}

function extractArchiveEntry(
  archivePath: string,
  source: ExternalArchiveCorpusSource,
  relativePath: string,
): Uint8Array {
  const result = spawnSync("unzip", ["-p", archivePath, relativePath], {
    encoding: "buffer",
    maxBuffer: maxCorpusModelBytes + 1,
    timeout: 5_000,
  });
  if (result.error !== undefined) {
    throw new Error(
      `cannot read ${relativePath} from external archive ${source.id}: ${result.error.message}`,
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `cannot read ${relativePath} from external archive ${source.id}: ${result.stderr.toString("utf8").trim()}`,
    );
  }
  if (result.stdout.length === 0 || result.stdout.length > maxCorpusModelBytes) {
    throw new Error(
      `external archive entry ${relativePath} must contain 1..${maxCorpusModelBytes} bytes`,
    );
  }
  return new Uint8Array(result.stdout);
}
