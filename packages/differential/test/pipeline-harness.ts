/**
 * Resource lifecycle and phase orchestration for the four-target differential pipeline.
 */
import {
  mkdtemp,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import {
  EffectExecutionSchedule,
  TemporalScenarioRunner,
} from "@bpmn-lean/temporal-testkit";

import {
  cibTiming,
  compareCase,
  projectCaseTargets,
  replayEvidence,
} from "./pipeline-comparison.ts";
export {
  pipelineCases,
} from "./pipeline-cases.ts";
import type {
  PipelineCase,
  PipelineTargets,
} from "./pipeline-types.ts";
import {
  CibEffectExecutionSchedule,
} from "./pipeline-types.ts";
import {
  elapsedMs,
  loadAndCompileCases,
  requireLeanDefinitionMutationRejection,
  requireLeanProvenanceErasureRejection,
  requireLeanScenarioMutationRejection,
  requireUniqueCaseIds,
  runCibTargetGroups,
  runCoreTargets,
  runLeanTargets,
  runProcess,
  runTemporalTargets,
} from "./pipeline-targets.ts";

const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
const temporalCacheDirectory = path.join(
  projectRoot,
  ".cache/temporal-cli",
);
const buildMs = Number.parseFloat(process.env.BPMN_PIPELINE_BUILD_MS ?? "");
const buildMode = process.env.BPMN_PIPELINE_BUILD_MODE;

export async function runPipelineCases(
  cases: ReadonlyArray<PipelineCase>,
) {
  requireUniqueCaseIds(cases);
  if (!Number.isFinite(buildMs)) {
    throw new TypeError("pipeline build timing is required");
  }
  if (buildMode !== "measured" && buildMode !== "prebuilt") {
    throw new TypeError("pipeline build mode is required");
  }

  const ingestionStarted = performance.now();
  const contexts = await loadAndCompileCases(cases);
  const ingestionMs = elapsedMs(ingestionStarted);
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), "bpmn-differential-"),
  );
  const leanInputPath = path.join(
    temporaryDirectory,
    "lean-definition-input.jsonl",
  );
  const leanMutationInputPath = path.join(
    temporaryDirectory,
    "lean-definition-mutation.jsonl",
  );
  const leanProvenanceMutationInputPath = path.join(
    temporaryDirectory,
    "lean-provenance-mutation.jsonl",
  );
  const leanScenarioMutationInputPath = path.join(
    temporaryDirectory,
    "lean-scenario-mutation.jsonl",
  );
  const leanScenarioMutationPath = path.join(
    temporaryDirectory,
    "lean-scenario-mutation.json",
  );
  const warmStarted = performance.now();
  let runner: TemporalScenarioRunner | undefined;
  let startupMs = 0;
  let scenarioExecutionMs = 0;
  let observationProjectionMs = 0;
  let comparisonMs = 0;
  let replayMs = 0;
  let cleanupMs = 0;
  let targets: PipelineTargets | undefined;
  let caseResults:
    | ReadonlyArray<ReturnType<typeof compareCase>>
    | undefined;
  let replay: Readonly<{ liveHistories: number }> | undefined;
  let revision:
    | Readonly<{
        commit: string;
        dirty: boolean;
        collectionMs: number;
      }>
    | undefined;

  try {
    const startupStarted = performance.now();
    runner = await TemporalScenarioRunner.create({
      downloadDirectory: temporalCacheDirectory,
    });
    startupMs = elapsedMs(startupStarted);

    const scenarioStarted = performance.now();
    const core = runCoreTargets(contexts);
    const effectContexts = contexts.filter(
      ({ pipelineCase }) =>
        pipelineCase.cib?.effectExecutionSchedule ===
          CibEffectExecutionSchedule.FailAfterMutationOnce,
    );
    const [
      cib,
      lean,
      leanDefinitionMutation,
      leanScenarioMutation,
      leanProvenanceMutation,
      temporal,
      cibEffectRetry,
    ] = await Promise.all([
      runCibTargetGroups(
        contexts,
        temporaryDirectory,
        "cib",
      ),
      runLeanTargets(contexts, leanInputPath),
      requireLeanDefinitionMutationRejection(
        contexts,
        leanMutationInputPath,
      ),
      requireLeanScenarioMutationRejection(
        contexts,
        leanScenarioMutationInputPath,
        leanScenarioMutationPath,
      ),
      requireLeanProvenanceErasureRejection(
        contexts,
        leanProvenanceMutationInputPath,
      ),
      runTemporalTargets(runner, contexts),
      effectContexts.length === 0
        ? null
        : runCibTargetGroups(
            effectContexts,
            temporaryDirectory,
            "cib-effect-retry",
            EffectExecutionSchedule.FailAfterMutationOnce,
          ),
    ]);
    const completedTargets: PipelineTargets = {
      cib,
      lean,
      leanDefinitionMutation,
      leanScenarioMutation,
      leanProvenanceMutation,
      core,
      temporal,
      cibEffectRetry,
    };
    targets = completedTargets;
    scenarioExecutionMs = elapsedMs(scenarioStarted);

    const projectionStarted = performance.now();
    const projectedTargets = contexts.map((context) =>
      projectCaseTargets(context, completedTargets),
    );
    observationProjectionMs = elapsedMs(projectionStarted);

    const comparisonStarted = performance.now();
    caseResults = contexts.map((context, index) => {
      const projected = projectedTargets[index];
      if (projected === undefined) {
        throw new Error(`Target projection omitted ${context.scenario.id}`);
      }
      return compareCase(context, projected);
    });
    comparisonMs = elapsedMs(comparisonStarted);

    const replayStarted = performance.now();
    replay = await replayEvidence(
      runner,
      contexts,
      temporal.results,
    );
    replayMs = elapsedMs(replayStarted);

    const revisionStarted = performance.now();
    const [commit, status] = await Promise.all([
      runProcess("git", ["rev-parse", "HEAD"], 5_000),
      runProcess("git", ["status", "--porcelain"], 5_000),
    ]);
    revision = {
      commit: commit.stdout.trim(),
      dirty: status.stdout.trim().length > 0,
      collectionMs: elapsedMs(revisionStarted),
    };
  } finally {
    const cleanupStarted = performance.now();
    if (runner !== undefined) {
      await runner.shutdown();
    }
    await rm(temporaryDirectory, { recursive: true, force: true });
    cleanupMs = elapsedMs(cleanupStarted);
  }

  if (
    targets === undefined ||
    caseResults === undefined ||
    replay === undefined ||
    revision === undefined
  ) {
    throw new Error("pipeline completed without required evidence");
  }

  const warmMs = elapsedMs(warmStarted);
  const coldMs = buildMode === "measured" ? buildMs + warmMs : null;
  const report = {
    kind: "bpmnPipelineReport",
    buildMode,
    implementationRevision: revision,
    cases: caseResults.map(({ report: caseReport }) => caseReport),
    leanDefinitionMutation: targets.leanDefinitionMutation,
    leanScenarioMutation: targets.leanScenarioMutation,
    leanProvenanceMutation: targets.leanProvenanceMutation,
    replay,
    phaseMs: {
      build: buildMs,
      ingestion: ingestionMs,
      startup: startupMs,
      scenarioExecution: scenarioExecutionMs,
      observationProjection: observationProjectionMs,
      comparison: comparisonMs,
      replay: replayMs,
      cleanup: cleanupMs,
      warmTotal: warmMs,
      coldTotal: coldMs,
    },
    targetMs: {
      cibSeven: cibTiming(targets.cib, contexts),
      lean: targets.lean.totalMs,
      semanticCore: targets.core.totalMs,
      temporal: targets.temporal.totalMs,
    },
    isolation: {
      temporalWorkflowIds: targets.temporal.workflowIds,
    },
  };

  return {
    report,
    evidence: caseResults.map(({ evidence }) => evidence),
  };
}
