import {
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

import type { Scenario } from "@bpmn-lean/semantic-core";
import { EffectExecutionSchedule } from "@bpmn-lean/temporal-adapter";
import {
  reportCibSevenMavenElapsed,
  resolveCibSevenMavenTimeoutMs,
} from "../../../scripts/cibseven-maven-budget.ts";
import { parseStrictJson } from "../../../scripts/strict-json.ts";

import {
  elapsedMs,
  indexExactRecords,
  projectRoot,
  runProcess,
} from "./pipeline-target-support.ts";
import type {
  CibPipelineResult,
  CibPipelineConfiguration,
  PipelineContext,
  TargetBatch,
} from "./pipeline-types.ts";

export async function runCibTargets(
  scenarios: ReadonlyArray<Scenario>,
  inputPath: string,
  outputPath: string,
  engineVersion: CibPipelineConfiguration["version"],
  effectSchedule = EffectExecutionSchedule.PlainSuccess,
): Promise<TargetBatch<CibPipelineResult>> {
  const started = performance.now();
  await writeFile(
    inputPath,
    `${scenarios.map((scenario) => JSON.stringify(scenario)).join("\n")}\n`,
    "utf8",
  );
  const mavenStartedMs = Date.now();
  await runProcess(
    "runners/cibseven/mvnw",
    [
      "-s",
      "runners/cibseven/maven-settings.xml",
      "-f",
      "runners/cibseven/pom.xml",
      "--no-transfer-progress",
      "-Dstyle.color=never",
      "-Dtest=CibSevenPipelineExportBridge",
      `-Dcibseven.version=${engineVersion}`,
      `-Dbpmn.pipeline.projectRoot=${projectRoot}`,
      `-Dbpmn.pipeline.input=${inputPath}`,
      `-Dbpmn.pipeline.output=${outputPath}`,
      `-Dbpmn.pipeline.effectSchedule=${effectSchedule}`,
      "test",
    ],
    resolveCibSevenMavenTimeoutMs(process.env),
  );
  reportCibSevenMavenElapsed(engineVersion, Date.now() - mavenStartedMs);
  const records = (await readFile(outputPath, "utf8"))
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line, index) =>
      parseStrictJson<CibPipelineResult>(
        line,
        `CIB result line ${index + 1}`,
      ));
  return {
    results: indexExactRecords(
      records,
      scenarios.map(({ id }) => id),
      "CIB Seven",
    ),
    totalMs: elapsedMs(started),
  };
}

export async function runCibTargetGroups(
  contexts: ReadonlyArray<PipelineContext>,
  temporaryDirectory: string,
  filePrefix: string,
  effectSchedule = EffectExecutionSchedule.PlainSuccess,
): Promise<TargetBatch<CibPipelineResult>> {
  const started = performance.now();
  const cibContexts = contexts.filter(
    ({ pipelineCase }) => pipelineCase.cib !== null,
  );
  const groups = Map.groupBy(
    cibContexts,
    ({ pipelineCase }) => {
      const configuration = pipelineCase.cib;
      if (configuration === null) {
        throw new Error("CIB target group received a standards-only case");
      }
      return configuration.version;
    },
  );
  const batches = await Promise.all(
    [...groups.entries()].map(([engineVersion, versionContexts]) =>
      runCibTargets(
        versionContexts.map(({ scenario }) => scenario),
        path.join(
          temporaryDirectory,
          `${filePrefix}-${engineVersion}-input.jsonl`,
        ),
        path.join(
          temporaryDirectory,
          `${filePrefix}-${engineVersion}-output.jsonl`,
        ),
        engineVersion,
        effectSchedule,
      )
    ),
  );
  const results = new Map<string, CibPipelineResult>();
  for (const batch of batches) {
    for (const [scenarioId, result] of batch.results) {
      if (results.has(scenarioId)) {
        throw new Error(
          `CIB release groups returned duplicate scenario ${scenarioId}`,
        );
      }
      results.set(scenarioId, result);
    }
  }
  return {
    results,
    totalMs: elapsedMs(started),
  };
}
