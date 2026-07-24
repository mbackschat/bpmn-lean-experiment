import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
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
  requireScenarioBinding,
} from "../dist/index.js";
import { TemporalScenarioRunner } from "../../temporal-adapter/dist/index.js";
import { runCommand } from "../../../scripts/run-command.mjs";

const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
const temporalCacheDirectory = path.join(
  projectRoot,
  ".cache/temporal-cli",
);
const leanExecutable = "emitSequentialUserTaskResults";
const buildMs = Number.parseFloat(process.env.BPMN_PIPELINE_BUILD_MS ?? "");
const buildMode = process.env.BPMN_PIPELINE_BUILD_MODE;

function mutateOpenTaskActivation(result) {
  const running = runningObservation(result);
  const openTask = running.openUserTasks?.[0];
  if (openTask === undefined) {
    throw new Error("calibrated open User Task is required");
  }
  running.openUserTasks[0] = {
    ...openTask,
    id: {
      ...openTask.id,
      activation: 2,
    },
  };
}

function runningObservation(result) {
  const observation = result.trace.find(
    (candidate) =>
      candidate.kind === CanonicalObservationKind.State &&
      candidate.status === ProcessStatus.Running,
  );
  if (observation === undefined) {
    throw new Error("calibrated running state is required");
  }
  return observation;
}

function interactionCase(
  id,
  scenarioFile,
  evidenceFile,
  options = {},
) {
  return Object.freeze({
    id,
    scenarioRelativePath:
      `scenarios/user-task-discovery-completion/${scenarioFile}`,
    evidenceRelativePath:
      `scenarios/user-task-discovery-completion/${evidenceFile}`,
    bpmnRelativePath:
      "scenarios/user-task-discovery-completion/process.bpmn",
    workflowIdPrefix: id,
    expectedWaitTraceLength: 3,
    duplicateFirstCompletionUpdateId:
      options.duplicateFirstCompletionUpdateId,
    injectMutation: mutateOpenTaskActivation,
  });
}

export const pipelineCases = Object.freeze([
  interactionCase(
    "user-task-discovery-completion",
    "scenario.json",
    "cibseven-evidence.json",
  ),
  interactionCase(
    "user-task-wrong-activation",
    "wrong-activation.scenario.json",
    "wrong-activation.cibseven-evidence.json",
  ),
  interactionCase(
    "user-task-stale-completion",
    "stale-completion.scenario.json",
    "stale-completion.cibseven-evidence.json",
    {
      duplicateFirstCompletionUpdateId:
        "pipeline-duplicate-first-completion",
    },
  ),
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

function requireUniqueCaseIds(cases) {
  if (cases.length === 0) {
    throw new TypeError("At least one pipeline case is required");
  }
  const ids = cases.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) {
    throw new TypeError("Pipeline case IDs must be unique");
  }
}

function indexExactRecords(records, expectedIds, targetName) {
  if (records.length !== expectedIds.length) {
    throw new Error(
      `${targetName} returned ${records.length} results for ${expectedIds.length} scenarios`,
    );
  }
  const indexed = new Map();
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
  const actualIds = [...indexed.keys()].sort();
  const requiredIds = [...expectedIds].sort();
  if (JSON.stringify(actualIds) !== JSON.stringify(requiredIds)) {
    throw new Error(
      `${targetName} scenario identities do not match the batch`,
    );
  }
  return indexed;
}

async function runCibTargets(scenarios, inputPath, outputPath) {
  const started = performance.now();
  await writeFile(
    inputPath,
    `${scenarios.map((scenario) => JSON.stringify(scenario)).join("\n")}\n`,
    "utf8",
  );
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
      `-Dbpmn.pipeline.input=${inputPath}`,
      `-Dbpmn.pipeline.output=${outputPath}`,
      "test",
    ],
    30_000,
  );
  const records = (await readFile(outputPath, "utf8"))
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
  return {
    results: indexExactRecords(
      records,
      scenarios.map(({ id }) => id),
      "CIB Seven",
    ),
    totalMs: elapsedMs(started),
  };
}

async function runLeanTargets(scenarios) {
  const started = performance.now();
  const execution = await runProcess(
    "lake",
    ["exe", leanExecutable],
    10_000,
  );
  const records = execution.stdout
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
  const indexedRecords = indexExactRecords(
    records,
    scenarios.map(({ id }) => id),
    "Lean",
  );
  return {
    results: new Map(
      scenarios.map((scenario) => {
        const record = indexedRecords.get(scenario.id);
        if (record === undefined) {
          throw new TypeError(`Lean omitted scenario ${scenario.id}`);
        }
        requireScenarioBinding(
          DifferentialTarget.Lean,
          scenario,
          record.scenario,
        );
        if (record.result === undefined) {
          throw new TypeError(
            `Lean result for ${scenario.id} has no canonical result`,
          );
        }
        return [scenario.id, record.result];
      }),
    ),
    totalMs: elapsedMs(started),
  };
}

function runCoreTargets(contexts) {
  const started = performance.now();
  return {
    results: new Map(
      contexts.map(({ scenario, executableIr }) => [
        scenario.id,
        runScenario(scenario, executableIr),
      ]),
    ),
    totalMs: elapsedMs(started),
  };
}

function temporalOptions(pipelineCase, suffix) {
  const options = {
    workflowId: `${pipelineCase.workflowIdPrefix}-${suffix}`,
  };
  if (pipelineCase.duplicateFirstCompletionUpdateId !== undefined) {
    options.duplicateFirstCompletionUpdateId =
      pipelineCase.duplicateFirstCompletionUpdateId;
  }
  return options;
}

async function runTemporalTargets(runner, contexts) {
  const started = performance.now();
  const items = contexts.flatMap(({ pipelineCase, scenario, executableIr }) => [
    {
      scenario,
      executableIr,
      options: temporalOptions(pipelineCase, "primary"),
    },
    {
      scenario,
      executableIr,
      options: temporalOptions(pipelineCase, "isolation"),
    },
  ]);
  const executions = await runner.runScenarios(items);
  const results = new Map();
  for (const [index, { pipelineCase }] of contexts.entries()) {
    const primary = executions[index * 2];
    const isolation = executions[index * 2 + 1];
    if (primary === undefined || isolation === undefined) {
      throw new Error(
        `Temporal batch omitted execution ${pipelineCase.id}`,
      );
    }
    results.set(pipelineCase.id, { primary, isolation });
  }
  return {
    results,
    workflowIds: items.map(({ options }) => options.workflowId),
    totalMs: elapsedMs(started),
  };
}

async function loadAndCompileCases(cases) {
  const sourceBytes = new Map();
  const compilations = new Map();
  const loaded = await Promise.all(
    cases.map(async (pipelineCase) => {
      const scenarioPath = path.join(
        projectRoot,
        pipelineCase.scenarioRelativePath,
      );
      const evidencePath = path.join(
        projectRoot,
        pipelineCase.evidenceRelativePath,
      );
      const [scenario, retainedEvidence] = await Promise.all([
        readJson(scenarioPath),
        readJson(evidencePath),
      ]);
      return {
        pipelineCase,
        scenario,
        retainedEvidence,
      };
    }),
  );

  return Promise.all(
    loaded.map(async (context) => {
      const { pipelineCase, scenario } = context;
      const bpmnPath = path.join(
        projectRoot,
        pipelineCase.bpmnRelativePath,
      );
      let bytesPromise = sourceBytes.get(bpmnPath);
      if (bytesPromise === undefined) {
        bytesPromise = readFile(bpmnPath);
        sourceBytes.set(bpmnPath, bytesPromise);
      }
      const compilationKey = JSON.stringify([
        bpmnPath,
        scenario.bpmn.id,
        scenario.bpmn.sha256,
        scenario.profile,
      ]);
      let compilationPromise = compilations.get(compilationKey);
      if (compilationPromise === undefined) {
        compilationPromise = bytesPromise.then((bytes) =>
          compileSequentialUserTaskBpmn({
            bytes,
            sourceId: scenario.bpmn.id,
            expectedSha256: scenario.bpmn.sha256,
            semanticProfile: scenario.profile,
            limits: {
              maxBytes: 1024 * 1024,
              parserDeadlineMs: 1_000,
            },
          }),
        );
        compilations.set(compilationKey, compilationPromise);
      }
      const compilation = await compilationPromise;
      if (compilation.status !== BpmnCompilationStatus.Accepted) {
        throw new Error(
          `BPMN compilation was rejected for ${pipelineCase.id}: ${JSON.stringify(compilation.diagnostics)}`,
        );
      }
      return {
        ...context,
        executableIr: compilation.executableIr,
      };
    }),
  );
}

function requiredResult(results, scenarioId, targetName) {
  const result = results.get(scenarioId);
  if (result === undefined) {
    throw new Error(`${targetName} omitted scenario ${scenarioId}`);
  }
  return result;
}

function projectCaseTargets(context, targets) {
  const scenarioId = context.scenario.id;
  const cibResult = requiredResult(
    targets.cib.results,
    scenarioId,
    "CIB Seven",
  );
  return {
    cibResult,
    canonicalCib: canonicalCibResult(cibResult),
    leanResult: requiredResult(
      targets.lean.results,
      scenarioId,
      "Lean",
    ),
    semanticCoreResult: requiredResult(
      targets.core.results,
      scenarioId,
      "semantic core",
    ),
    temporalResult: requiredResult(
      targets.temporal.results,
      scenarioId,
      "Temporal",
    ),
  };
}

function compareCase(context, projectedTargets) {
  const { pipelineCase, scenario, retainedEvidence, executableIr } = context;
  const {
    cibResult,
    canonicalCib,
    leanResult,
    semanticCoreResult,
    temporalResult,
  } = projectedTargets;
  // tag::four-target-comparison[]
  const comparison = compareTargetResults(
    {
      target: DifferentialTarget.CibSeven,
      result: canonicalCib,
    },
    [
      {
        target: DifferentialTarget.Lean,
        result: leanResult,
      },
      {
        target: DifferentialTarget.SemanticCore,
        result: semanticCoreResult,
      },
      {
        target: DifferentialTarget.Temporal,
        result: temporalResult.primary.result,
      },
    ],
  );
  // end::four-target-comparison[]
  const evidenceComparison = compareTargetResults(
    {
      target: DifferentialTarget.RetainedCibEvidence,
      result: retainedEvidence.result,
    },
    [
      {
        target: DifferentialTarget.CibSeven,
        result: canonicalCib,
      },
    ],
  );
  // tag::seeded-disagreement[]
  const injectedResult = structuredClone(semanticCoreResult);
  pipelineCase.injectMutation(injectedResult);
  const injectedDisagreement = compareTargetResults(
    {
      target: DifferentialTarget.CibSeven,
      result: canonicalCib,
    },
    [
      {
        target: DifferentialTarget.SemanticCore,
        result: injectedResult,
      },
    ],
  );
  // end::seeded-disagreement[]
  const completionCommandIds = new Set(
    scenario.stimuli.slice(1).map(({ commandId }) => commandId),
  );
  const expectedCompletionOutcomes = semanticCoreResult.trace.flatMap(
    (observation) =>
      observation.kind === CanonicalObservationKind.Command &&
      completionCommandIds.has(observation.commandId)
        ? [observation.outcome]
        : [],
  );

  return {
    report: {
      scenario: {
        id: scenario.id,
        profile: scenario.profile,
        bpmnSha256: scenario.bpmn.sha256,
        executableIr: {
          kind: executableIr.kind,
          compiler: executableIr.identity.compiler,
        },
        normativeRefs: scenario.provenance.normativeRefs,
        cibRevision: scenario.provenance.cibRevision,
      },
      comparison,
      evidenceComparison,
      injectedDisagreement,
    },
    evidence: {
      scenarioId: scenario.id,
      expectedWaitTrace: semanticCoreResult.trace.slice(
        0,
        pipelineCase.expectedWaitTraceLength,
      ),
      actualWaitTrace: temporalResult.primary.waitTrace,
      primaryTemporalResult: temporalResult.primary.result,
      isolationTemporalResult: temporalResult.isolation.result,
      temporalInteractionEvidence:
        temporalResult.primary.interactionEvidence,
      expectedCompletionOutcomes,
      cibCleanup: cibResult.diagnostics.cleanup,
    },
  };
}

async function replayEvidence(runner, contexts, temporalResults) {
  const items = contexts.map((context) => {
    const temporal = requiredResult(
      temporalResults,
      context.scenario.id,
      "Temporal",
    );
    return {
      history: temporal.primary.history,
      workflowId: `${context.pipelineCase.workflowIdPrefix}-live-replay`,
    };
  });
  await runner.replayHistories(items);
  return { liveHistories: items.length };
}

function cibTiming(cibTarget, contexts) {
  const cases = contexts.map(({ scenario }) => {
    const result = requiredResult(
      cibTarget.results,
      scenario.id,
      "CIB Seven",
    );
    const phases = result.diagnostics.phases;
    return {
      scenarioId: scenario.id,
      scenario: phases.totalNanos / 1e6,
      observationProjection:
        (phases.waitProjectionNanos +
          phases.completionProjectionNanos) /
        1e6,
    };
  });
  const firstResult = requiredResult(
    cibTarget.results,
    contexts[0].scenario.id,
    "CIB Seven",
  );
  return {
    total: cibTarget.totalMs,
    engineStartup: firstResult.diagnostics.startupNanos / 1e6,
    cases,
  };
}

export async function runPipelineCases(cases) {
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
  const cibInputPath = path.join(temporaryDirectory, "cib-input.jsonl");
  const cibOutputPath = path.join(temporaryDirectory, "cib-output.jsonl");
  const warmStarted = performance.now();
  let runner;
  let startupMs = 0;
  let scenarioExecutionMs = 0;
  let observationProjectionMs = 0;
  let comparisonMs = 0;
  let replayMs = 0;
  let cleanupMs = 0;
  let targets;
  let caseResults;
  let replay;
  let revision;

  try {
    const startupStarted = performance.now();
    runner = await TemporalScenarioRunner.create({
      cliVersion: "v1.8.1",
      downloadDirectory: temporalCacheDirectory,
    });
    startupMs = elapsedMs(startupStarted);

    const scenarioStarted = performance.now();
    const core = runCoreTargets(contexts);
    const [cib, lean, temporal] = await Promise.all([
      runCibTargets(
        contexts.map(({ scenario }) => scenario),
        cibInputPath,
        cibOutputPath,
      ),
      runLeanTargets(contexts.map(({ scenario }) => scenario)),
      runTemporalTargets(runner, contexts),
    ]);
    targets = { cib, lean, core, temporal };
    scenarioExecutionMs = elapsedMs(scenarioStarted);

    const projectionStarted = performance.now();
    const projectedTargets = contexts.map((context) =>
      projectCaseTargets(context, targets),
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

  const warmMs = elapsedMs(warmStarted);
  const coldMs = buildMode === "measured" ? buildMs + warmMs : null;
  const report = {
    kind: "bpmnPipelineReport",
    buildMode,
    implementationRevision: revision,
    cases: caseResults.map(({ report: caseReport }) => caseReport),
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
