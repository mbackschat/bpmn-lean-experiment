import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import { compareCanonicalStrings } from "@bpmn-lean/semantic-core";
import { runCommand } from "../../../scripts/run-command.ts";
import { parseStrictJson } from "../../../scripts/strict-json.ts";

import type { DeepMutable } from "./pipeline-types.ts";

export const projectRoot = fileURLToPath(
  new URL("../../../", import.meta.url),
);

export function mutableClone<T>(value: T): DeepMutable<T> {
  return structuredClone(value) as DeepMutable<T>;
}

export function elapsedMs(started: number): number {
  return performance.now() - started;
}

export async function readJson<Value>(filePath: string): Promise<Value> {
  return parseStrictJson<Value>(
    await readFile(filePath, "utf8"),
    filePath,
  );
}

export function runProcess(
  command: string,
  args: ReadonlyArray<string>,
  timeoutMs: number,
) {
  return runCommand(command, args, {
    cwd: projectRoot,
    env: process.env,
    timeoutMs,
  });
}

export function indexExactRecords<
  Record extends Readonly<{ scenarioId: string }>,
>(
  records: ReadonlyArray<Record>,
  expectedIds: ReadonlyArray<string>,
  targetName: string,
): ReadonlyMap<string, Record> {
  if (records.length !== expectedIds.length) {
    throw new Error(
      `${targetName} returned ${records.length} results for ${expectedIds.length} scenarios`,
    );
  }
  const indexed = new Map<string, Record>();
  for (const record of records) {
    const scenarioId = record?.scenarioId;
    if (typeof scenarioId !== "string" || scenarioId.length === 0) {
      throw new TypeError(`${targetName} result has no scenario identity`);
    }
    if (indexed.has(scenarioId)) {
      throw new TypeError(
        `${targetName} returned duplicate scenario ${scenarioId}`,
      );
    }
    indexed.set(scenarioId, record);
  }
  const actualIds = [...indexed.keys()].sort(compareCanonicalStrings);
  const requiredIds = [...expectedIds].sort(compareCanonicalStrings);
  if (JSON.stringify(actualIds) !== JSON.stringify(requiredIds)) {
    throw new Error(
      `${targetName} scenario identities do not match the batch`,
    );
  }
  return indexed;
}
