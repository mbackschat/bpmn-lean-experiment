import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import {
  BpmnCompilationStatus,
  compileSequentialUserTaskBpmn,
} from "@bpmn-lean/bpmn-source";
import {
  CanonicalObservationKind,
  ProcessStatus,
  runScenario,
} from "@bpmn-lean/semantic-core";
import {
  DifferentialTarget,
  compareTargetResults,
} from "../dist/index.js";
import { TemporalScenarioRunner } from "../../temporal-adapter/dist/index.js";
import { runCommand } from "../../../scripts/run-command.mjs";

const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
const temporalCacheDirectory = path.join(
  projectRoot,
  ".cache/temporal-cli",
);
const buildMs = Number.parseFloat(process.env.BPMN_PIPELINE_BUILD_MS ?? "");
const buildMode = process.env.BPMN_PIPELINE_BUILD_MODE;

function mutateRunningStatus(result) {
  const injectedObservation = result.trace.find(
    (observation) =>
      observation.kind === CanonicalObservationKind.State &&
      observation.status === ProcessStatus.Running,
  );
  if (injectedObservation === undefined) {
    throw new Error("calibrated running state is required");
  }
  injectedObservation.status = ProcessStatus.Completed;
}

export const pipelineCases = Object.freeze([
  Object.freeze({
    id: "m0-sequential-user-task",
    scenarioRelativePath:
      "scenarios/m0-sequential-user-task/scenario.json",
    evidenceRelativePath:
      "scenarios/m0-sequential-user-task/cibseven-evidence.json",
    bpmnRelativePath:
      "scenarios/m0-sequential-user-task/process.bpmn",
    retainedHistoryRelativePaths: Object.freeze([
      "packages/temporal-adapter/test/fixtures/m0-sequential-user-task.history.json",
    ]),
    leanExecutable: "emitSequentialUserTaskResult",
    workflowIdPrefix: "m0-pipeline",
    expectedWaitTraceLength: 3,
    injectMutation: mutateRunningStatus,
  }),
]);

function elapsedMs(started) {
  return performance.now() - started;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function runProcess(command, args, timeoutMs) {
  return runCommand(command, args, {
    cwd: projectRoot,
    env: process.env,
    timeoutMs,
  });
}

function canonicalCibResult(cibResult) {
  return {
    outcome: cibResult.outcome,
    trace: cibResult.trace,
  };
}

async function runCibTarget(scenarioPath, outputPath) {
  const started = performance.now();
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
      `-Dbpmn.pipeline.projectRoot=${projectRoot}`,
      `-Dbpmn.pipeline.scenario=${scenarioPath}`,
      `-Dbpmn.pipeline.output=${outputPath}`,
      "test",
    ],
    30_000,
  );
  const result = await readJson(outputPath);
  return { result, totalMs: elapsedMs(started) };
}

async function runLeanTarget(executable) {
  const started = performance.now();
  const execution = await runProcess(
    "lake",
    ["exe", executable],
    10_000,
  );
  return {
    result: JSON.parse(execution.stdout.trim()),
    totalMs: elapsedMs(started),
  };
}

async function runCoreTarget(scenario, executableIr) {
  const started = performance.now();
  return {
    result: runScenario(scenario, executableIr),
    totalMs: elapsedMs(started),
  };
}

async function runTemporalTarget(
  runner,
  scenario,
  executableIr,
  workflowIdPrefix,
) {
  const started = performance.now();
  const workflowIds = [
    `${workflowIdPrefix}-primary`,
    `${workflowIdPrefix}-isolation`,
  ];
  const [primary, isolation] = await Promise.all([
    runner.runScenario(
      scenario,
      executableIr,
      {
        workflowId: workflowIds[0],
      },
    ),
    runner.runScenario(
      scenario,
      executableIr,
      {
        workflowId: workflowIds[1],
      },
    ),
  ]);
  return {
    primary,
    isolation,
    workflowIds,
    totalMs: elapsedMs(started),
  };
}

export async function runPipelineCase(pipelineCase) {
  if (!Number.isFinite(buildMs)) {
    throw new TypeError("pipeline build timing is required");
  }
  if (buildMode !== "measured" && buildMode !== "prebuilt") {
    throw new TypeError("pipeline build mode is required");
  }
  const scenarioPath = path.join(
    projectRoot,
    pipelineCase.scenarioRelativePath,
  );
  const evidencePath = path.join(
    projectRoot,
    pipelineCase.evidenceRelativePath,
  );
  const bpmnPath = path.join(
    projectRoot,
    pipelineCase.bpmnRelativePath,
  );
  const [scenario, retainedEvidence] = await Promise.all([
    readJson(scenarioPath),
    readJson(evidencePath),
  ]);
  const ingestionStarted = performance.now();
  const compilation = await compileSequentialUserTaskBpmn({
    bytes: await readFile(bpmnPath),
    sourceId: scenario.bpmn.id,
    expectedSha256: scenario.bpmn.sha256,
    semanticProfile: scenario.profile,
    limits: {
      maxBytes: 1024 * 1024,
      parserDeadlineMs: 1_000,
    },
  });
  if (compilation.status !== BpmnCompilationStatus.Accepted) {
    throw new Error(
      `BPMN compilation was rejected: ${JSON.stringify(compilation.diagnostics)}`,
    );
  }
  const executableIr = compilation.executableIr;
  const ingestionMs = elapsedMs(ingestionStarted);
  const retainedHistories = await Promise.all(
    pipelineCase.retainedHistoryRelativePaths.map(
      (relativePath) => readJson(path.join(projectRoot, relativePath)),
    ),
  );
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), "bpmn-differential-"),
  );
  const cibOutputPath = path.join(temporaryDirectory, "cib-result.json");
  const warmStarted = performance.now();
  let runner;
  let startupMs = 0;
  let scenarioExecutionMs = 0;
  let observationProjectionMs = 0;
  let comparisonMs = 0;
  let replayMs = 0;
  let cleanupMs = 0;
  let cibTarget;
  let leanTarget;
  let coreTarget;
  let temporalTarget;
  let comparison;
  let evidenceComparison;
  let injectedComparison;
  let revision;

  try {
    const startupStarted = performance.now();
    runner = await TemporalScenarioRunner.create({
      cliVersion: "v1.8.1",
      downloadDirectory: temporalCacheDirectory,
    });
    startupMs = elapsedMs(startupStarted);

    const scenarioStarted = performance.now();
    [cibTarget, leanTarget, coreTarget, temporalTarget] = await Promise.all([
      runCibTarget(scenarioPath, cibOutputPath),
      runLeanTarget(pipelineCase.leanExecutable),
      runCoreTarget(scenario, executableIr),
      runTemporalTarget(
        runner,
        scenario,
        executableIr,
        pipelineCase.workflowIdPrefix,
      ),
    ]);
    scenarioExecutionMs = elapsedMs(scenarioStarted);

    const projectionStarted = performance.now();
    const targetResults = {
      cibSeven: canonicalCibResult(cibTarget.result),
      lean: leanTarget.result,
      semanticCore: coreTarget.result,
      temporal: temporalTarget.primary.result,
    };
    observationProjectionMs = elapsedMs(projectionStarted);

    const comparisonStarted = performance.now();
    comparison = compareTargetResults(
      {
        target: DifferentialTarget.CibSeven,
        result: targetResults.cibSeven,
      },
      [
        {
          target: DifferentialTarget.Lean,
          result: targetResults.lean,
        },
        {
          target: DifferentialTarget.SemanticCore,
          result: targetResults.semanticCore,
        },
        {
          target: DifferentialTarget.Temporal,
          result: targetResults.temporal,
        },
      ],
    );
    evidenceComparison = compareTargetResults(
      {
        target: DifferentialTarget.RetainedCibEvidence,
        result: retainedEvidence.result,
      },
      [
        {
          target: DifferentialTarget.CibSeven,
          result: targetResults.cibSeven,
        },
      ],
    );

    const injectedResult = structuredClone(targetResults.semanticCore);
    pipelineCase.injectMutation(injectedResult);
    injectedComparison = compareTargetResults(
      {
        target: DifferentialTarget.CibSeven,
        result: targetResults.cibSeven,
      },
      [
        {
          target: DifferentialTarget.SemanticCore,
          result: injectedResult,
        },
      ],
    );
    comparisonMs = elapsedMs(comparisonStarted);

    const replayStarted = performance.now();
    await runner.replayHistory(
      temporalTarget.primary.history,
      `${pipelineCase.workflowIdPrefix}-live-replay`,
    );
    for (const [index, retainedHistory] of retainedHistories.entries()) {
      await runner.replayHistory(
        retainedHistory,
        `${pipelineCase.workflowIdPrefix}-retained-replay-${index}`,
      );
    }
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

  const warmMs = elapsedMs(warmStarted);
  const coldMs = buildMode === "measured" ? buildMs + warmMs : null;

  const cibPhases = cibTarget.result.diagnostics.phases;
  const report = {
    schemaVersion: "0.1.0",
    buildMode,
    scenario: {
      id: scenario.id,
      profile: scenario.profile,
      bpmnSha256: scenario.bpmn.sha256,
      executableIr: {
        schemaVersion: executableIr.schemaVersion,
        kind: executableIr.kind,
        compiler: executableIr.identity.compiler,
      },
      normativeRefs: scenario.provenance.normativeRefs,
      cibRevision: scenario.provenance.cibRevision,
    },
    implementationRevision: revision,
    comparison,
    evidenceComparison,
    injectedDisagreement: injectedComparison,
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
      cibSeven: {
        total: cibTarget.totalMs,
        engineStartup: cibTarget.result.diagnostics.startupNanos / 1e6,
        scenario: cibPhases.totalNanos / 1e6,
        observationProjection:
          (cibPhases.waitProjectionNanos +
            cibPhases.completionProjectionNanos) /
          1e6,
      },
      lean: leanTarget.totalMs,
      semanticCore: coreTarget.totalMs,
      temporal: temporalTarget.totalMs,
    },
    isolation: {
      cibCleanup: cibTarget.result.diagnostics.cleanup,
      temporalWorkflowIds: temporalTarget.workflowIds,
    },
  };

  return {
    report,
    evidence: {
      expectedWaitTrace: coreTarget.result.trace.slice(
        0,
        pipelineCase.expectedWaitTraceLength,
      ),
      actualWaitTrace: temporalTarget.primary.waitTrace,
      primaryTemporalResult: temporalTarget.primary.result,
      isolationTemporalResult: temporalTarget.isolation.result,
      cibCleanup: cibTarget.result.diagnostics.cleanup,
    },
  };
}

export function runMilestoneZeroPipeline() {
  return runPipelineCase(pipelineCases[0]);
}
