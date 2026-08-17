import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "..");

test("shared API startup and request handling never scan Product 1 populations", async () => {
  const source = await read("platform/apps/server/src/shared-composition.ts");
  assert.doesNotMatch(
    source,
    /Sqlite|FileArtifactStore|IncidentAggregationService|new WorkService|\.reconcileAll\(|dataDirectory|mkdir/u,
  );
  for (const requiredBoundary of [
    "PostgresqlExecutionProjectionReader",
    "PostgresqlFlowNodeMetricsReader",
    "PostgresqlIncidentSnapshotReader",
    "PostgresqlWorkSnapshotReader",
    "ExactCurrentWorkTaskReader",
    "IncidentMutationDeliveryMode.BackgroundRecovery",
  ]) {
    assert.match(source, new RegExp(requiredBoundary.replace(".", "\\."), "u"));
  }
});

test("the recovery worker owns bounded background loops without HTTP or startup scans", async () => {
  const [composition, families] = await Promise.all([
    read("platform/apps/recovery-worker/src/composition.ts"),
    read("platform/apps/recovery-worker/src/family-loops.ts"),
  ]);
  assert.doesNotMatch(composition, /reconcileAll|createServer|HttpRoutes|listAll|scanPopulation/u);
  assert.doesNotMatch(families, /reconcileAll|HttpRoutes|listAll|scanPopulation/u);
  assert.match(families, /recoveryWorkerFamilies/u);
});

async function read(relativePath: string): Promise<string> {
  return await readFile(path.join(projectRoot, relativePath), "utf8");
}
