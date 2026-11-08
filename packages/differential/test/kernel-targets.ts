/** Lean `kernelRun` and TypeScript kernel execution for differential cases. */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

import type { KernelJson } from "@bpmn-lean/bpmn-source";
import { runScenario } from "@bpmn-lean/kernel";
import { CanonicalObservationKind } from "@bpmn-lean/semantic-core";
import type { Scenario, ScenarioResult } from "@bpmn-lean/semantic-core";

import { prepareNativeLeanDriver } from "../../../scripts/lean-native-driver.ts";
import { leanDriverBatchTimeoutMsFor } from "../../../scripts/pipeline-budget.ts";
import { elapsedMs, projectRoot, runProcess } from "./pipeline-target-support.ts";
import { parseWireJson } from "../../../scripts/strict-json.ts";
import type { PipelineContext, SemanticDifferentialCase, TargetBatch } from "./pipeline-types.ts";

const kernelDriver = "Kernel/Run.lean";

/** Runs `kernelRun` once with the given arguments; the deadline covers execution only, never the build. */
async function runKernelDriver(args: ReadonlyArray<string>, caseCount: number): Promise<string> {
  const execution = await runProcess(
    await prepareNativeLeanDriver(kernelDriver),
    args,
    leanDriverBatchTimeoutMsFor(caseCount),
    "utf8Fatal",
  );
  return execution.stdout;
}

/** The Lean kernel's result for one single-instance scenario file. */
export async function runLeanKernelScenario(programPath: string, scenarioPath: string): Promise<unknown> {
  return parseWireJson(await runKernelDriver([programPath, scenarioPath], 1), scenarioPath);
}

/** The Lean kernel's result for one population scenario file, one program per definition in scenario order. */
export async function runLeanKernelPopulation(
  programPaths: ReadonlyArray<string>,
  scenarioPath: string,
): Promise<unknown> {
  return parseWireJson(await runKernelDriver(["--population", ...programPaths, scenarioPath], 1), scenarioPath);
}

/** A run that stops short of its declared stimuli has silently dropped part of the journey the case claims. */
function requireConsumedStimuli(scenario: Scenario, result: ScenarioResult): void {
  const consumed = result.trace.filter(({ kind }) => kind === CanonicalObservationKind.Command).length;
  if (consumed !== scenario.stimuli.length) {
    throw new Error(
      `Scenario ${scenario.id} did not consume every declared stimulus: ` +
        `${String(consumed)} of ${String(scenario.stimuli.length)}`,
    );
  }
}

/** Runs each case's kernel IL through Lean `kernelRun`, writing the programs under `directory`. */
export async function runKernelTargets<Case extends SemanticDifferentialCase>(
  contexts: ReadonlyArray<PipelineContext<Case>>,
  directory: string,
): Promise<TargetBatch<ScenarioResult>> {
  const started = performance.now();
  const results = new Map<string, ScenarioResult>();
  for (const [index, { pipelineCase, scenario, kernelProgram }] of contexts.entries()) {
    const programPath = path.join(directory, `kernel-program-${String(index)}.json`);
    await writeProgram(programPath, kernelProgram);
    const result = await runLeanKernelScenario(
      programPath,
      path.join(projectRoot, pipelineCase.scenarioRelativePath),
    ) as ScenarioResult;
    requireConsumedStimuli(scenario, result);
    results.set(scenario.id, result);
  }
  return { results, totalMs: elapsedMs(started) };
}

export function writeProgram(programPath: string, program: KernelJson): Promise<void> {
  return writeFile(programPath, JSON.stringify(program), "utf8");
}

/** Runs each case's kernel IL through the TypeScript kernel. */
export function runKernelTsTargets<Case extends SemanticDifferentialCase>(
  contexts: ReadonlyArray<PipelineContext<Case>>,
): TargetBatch<ScenarioResult> {
  const started = performance.now();
  return {
    results: new Map(
      contexts.map(({ scenario, kernelProgram }) => {
        const result = runScenario(kernelProgram, scenario) as ScenarioResult;
        requireConsumedStimuli(scenario, result);
        return [scenario.id, result] as const;
      }),
    ),
    totalMs: elapsedMs(started),
  };
}

export { loadAndCompileCases } from "./pipeline-case-loading.ts";
