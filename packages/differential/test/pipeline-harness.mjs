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
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  CanonicalObservationKind,
  ProcessStatus,
  StimulusKind,
  runScenario,
} from "@bpmn-lean/semantic-core";
import {
  DisagreementKind,
  DifferentialTarget,
  compareTargetResults,
  requireScenarioBinding,
} from "../dist/index.js";
import {
  ProcessCommandResultKind,
  TemporalCompletionDelivery,
  TemporalScenarioRunner,
} from "@bpmn-lean/temporal-adapter";
import { runCommand } from "../../../scripts/run-command.mjs";

const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
const temporalCacheDirectory = path.join(
  projectRoot,
  ".cache/temporal-cli",
);
const leanExecutable = "emitSemanticProcessResults";
const buildMs = Number.parseFloat(process.env.BPMN_PIPELINE_BUILD_MS ?? "");
const buildMode = process.env.BPMN_PIPELINE_BUILD_MODE;

const TemporalCaseRelation = Object.freeze({
  ExactSemantic: "exactSemantic",
  PostTerminalClosed: "postTerminalClosed",
});

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

function omitOneParallelOpenTask(result) {
  const running = runningObservation(result);
  if (running.openUserTasks?.length !== 2) {
    throw new Error("two calibrated parallel User Tasks are required");
  }
  running.openUserTasks = running.openUserTasks.slice(0, 1);
}

function omitLiveSiblingAfterStaleRejection(result) {
  const staleCommandIndex = result.trace.findIndex(
    (observation) =>
      observation.kind === CanonicalObservationKind.Command &&
      observation.commandId === "complete-stale-user-task-a",
  );
  const state = result.trace[staleCommandIndex + 1];
  if (
    staleCommandIndex < 0 ||
    state?.kind !== CanonicalObservationKind.State ||
    state.openUserTasks.length !== 1
  ) {
    throw new Error(
      "stale parallel calibration requires one live sibling",
    );
  }
  state.openUserTasks = [];
}

function mutateOpenTimerDeadline(result) {
  const running = runningObservation(result);
  const openTimer = running.openTimers?.[0];
  if (openTimer === undefined) {
    throw new Error("one calibrated open Timer is required");
  }
  running.openTimers[0] = {
    ...openTimer,
    deadlineMs: openTimer.deadlineMs + 1,
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
    completionDelivery:
      options.completionDelivery ??
      TemporalCompletionDelivery.Ordered,
    temporalRelation:
      options.temporalRelation ??
      TemporalCaseRelation.ExactSemantic,
    duplicateFirstCompletion:
      options.duplicateFirstCompletion === true,
    injectMutation: mutateOpenTaskActivation,
    expectedInjectedDisagreement: {
      kind: DisagreementKind.ObservationValue,
      path: "trace[2].openUserTasks[0].id.activation",
      expected: 1,
      actual: 2,
    },
  });
}

function parallelCase(id, scenarioFile, evidenceFile, options = {}) {
  return Object.freeze({
    id,
    scenarioRelativePath:
      `scenarios/parallel-fork-join/${scenarioFile}`,
    evidenceRelativePath:
      `scenarios/parallel-fork-join/${evidenceFile}`,
    bpmnRelativePath: "scenarios/parallel-fork-join/process.bpmn",
    workflowIdPrefix: id,
    expectedWaitTraceLength: 3,
    completionDelivery: TemporalCompletionDelivery.Ordered,
    temporalRelation: TemporalCaseRelation.ExactSemantic,
    injectMutation:
      options.injectMutation ?? omitOneParallelOpenTask,
    expectedInjectedDisagreement:
      options.expectedInjectedDisagreement ?? {
        kind: DisagreementKind.ObservationValue,
        path: "trace[2].openUserTasks.length",
        expected: 2,
        actual: 1,
      },
  });
}

function timerCase() {
  return Object.freeze({
    id: "intermediate-catch-timer-pt1s",
    scenarioRelativePath:
      "scenarios/intermediate-catch-timer/scenario.json",
    evidenceRelativePath:
      "scenarios/intermediate-catch-timer/cibseven-evidence.json",
    bpmnRelativePath:
      "scenarios/intermediate-catch-timer/process.bpmn",
    workflowIdPrefix: "intermediate-catch-timer-pt1s",
    expectedWaitTraceLength: 3,
    completionDelivery: TemporalCompletionDelivery.Ordered,
    temporalRelation: TemporalCaseRelation.ExactSemantic,
    injectMutation: mutateOpenTimerDeadline,
    expectedInjectedDisagreement: {
      kind: DisagreementKind.ObservationValue,
      path: "trace[2].openTimers[0].deadlineMs",
      expected: 1000,
      actual: 1001,
    },
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
      completionDelivery: TemporalCompletionDelivery.PostTerminal,
      temporalRelation: TemporalCaseRelation.PostTerminalClosed,
      duplicateFirstCompletion: true,
    },
  ),
  parallelCase(
    "parallel-fork-join-a-then-b",
    "a-then-b.scenario.json",
    "a-then-b.cibseven-evidence.json",
  ),
  parallelCase(
    "parallel-fork-join-b-then-a",
    "b-then-a.scenario.json",
    "b-then-a.cibseven-evidence.json",
  ),
  parallelCase(
    "parallel-fork-join-stale-a-while-b-active",
    "stale-a-while-b-active.scenario.json",
    "stale-a-while-b-active.cibseven-evidence.json",
    {
      injectMutation: omitLiveSiblingAfterStaleRejection,
      expectedInjectedDisagreement: {
        kind: DisagreementKind.ObservationValue,
        path: "trace[6].openUserTasks.length",
        expected: 1,
        actual: 0,
      },
    },
  ),
  timerCase(),
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

function leanDefinitionRecords(contexts) {
  return contexts.map(
    ({ scenario, checkedProcess, semanticProcess }) => ({
      scenarioId: scenario.id,
      checkedProcess,
      semanticProcess,
    }),
  );
}

function leanScenarioPaths(contexts) {
  return contexts.map(({ pipelineCase }) =>
    path.join(projectRoot, pipelineCase.scenarioRelativePath)
  );
}

async function writeJsonLines(filePath, records) {
  await writeFile(
    filePath,
    `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
    "utf8",
  );
}

async function runLeanTargets(contexts, inputPath) {
  const started = performance.now();
  await writeJsonLines(inputPath, leanDefinitionRecords(contexts));
  const execution = await runProcess(
    "lake",
    [
      "exe",
      leanExecutable,
      inputPath,
      ...leanScenarioPaths(contexts),
    ],
    10_000,
  );
  const records = execution.stdout
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
  const indexedRecords = indexExactRecords(
    records,
    contexts.map(({ scenario }) => scenario.id),
    "Lean",
  );
  return {
    results: new Map(
      contexts.map(({ scenario, checkedProcess }) => {
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
        const binding = record.definitionBinding;
        if (
          binding?.kind !== "leanDefinitionBinding" ||
          binding.sourceSha256 !==
            checkedProcess.identity.sourceSha256 ||
          binding.semanticProfile !==
            checkedProcess.identity.semanticProfile ||
          binding.programMatchesLeanLowering !== true
        ) {
          throw new TypeError(
            `Lean definition binding does not match ${scenario.id}`,
          );
        }
        return [scenario.id, record.result];
      }),
    ),
    totalMs: elapsedMs(started),
  };
}

async function requireLeanDefinitionMutationRejection(contexts, inputPath) {
  const records = structuredClone(leanDefinitionRecords(contexts));
  const firstOperation =
    records[0]?.semanticProcess?.operations?.[0];
  if (firstOperation?.origin?.elementId === undefined) {
    throw new TypeError("Lean definition mutation requires one operation");
  }
  firstOperation.origin.elementId =
    `${firstOperation.origin.elementId}_mutated`;
  await writeJsonLines(inputPath, records);
  try {
    await runProcess(
      "lake",
      [
        "exe",
        leanExecutable,
        inputPath,
        ...leanScenarioPaths(contexts),
      ],
      10_000,
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes(
        "Semantic Process does not equal Lean lowering",
      )
    ) {
      return {
        kind: "rejected",
        mutation: "operationOrigin",
      };
    }
    throw error;
  }
  throw new Error(
    "Lean accepted a Semantic Process that differs from its lowering",
  );
}

async function requireLeanScenarioMutationRejection(
  contexts,
  inputPath,
  scenarioPath,
) {
  await writeJsonLines(inputPath, leanDefinitionRecords(contexts));
  await writeFile(
    scenarioPath,
    JSON.stringify({
      ...contexts[0].scenario,
      unexpectedSemanticAnswer: "committed",
    }),
    "utf8",
  );
  const scenarioPaths = leanScenarioPaths(contexts);
  scenarioPaths[0] = scenarioPath;
  try {
    await runProcess(
      "lake",
      ["exe", leanExecutable, inputPath, ...scenarioPaths],
      10_000,
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("object fields do not match")
    ) {
      return {
        kind: "rejected",
        mutation: "scenarioExtraField",
      };
    }
    throw error;
  }
  throw new Error("Lean accepted a scenario with an extra answer field");
}

async function requireLeanProvenanceErasureRejection(
  contexts,
  inputPath,
) {
  const records = structuredClone(leanDefinitionRecords(contexts));
  const parallelRecord = records.find(
    ({ semanticProcess }) =>
      semanticProcess.identity.semanticProfile ===
      "parallel-fork-join-draft",
  );
  if (parallelRecord === undefined) {
    throw new TypeError(
      "Lean provenance mutation requires one parallel definition",
    );
  }
  for (const place of parallelRecord.semanticProcess.controlPlaces) {
    place.origin.elementId = "erased-sequence-flow-provenance";
  }
  await writeJsonLines(inputPath, records);
  try {
    await runProcess(
      "lake",
      [
        "exe",
        leanExecutable,
        inputPath,
        ...leanScenarioPaths(contexts),
      ],
      10_000,
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes(
        "Semantic Process does not equal Lean lowering",
      )
    ) {
      return {
        kind: "rejected",
        mutation: "parallelControlPlaceProvenanceErasure",
      };
    }
    throw error;
  }
  throw new Error(
    "Lean accepted erased Sequence Flow provenance",
  );
}

function runCoreTargets(contexts) {
  const started = performance.now();
  return {
    results: new Map(
      contexts.map(({ scenario, semanticProcess }) => [
        scenario.id,
        runScenario(scenario, semanticProcess),
      ]),
    ),
    totalMs: elapsedMs(started),
  };
}

function temporalOptions(pipelineCase, suffix) {
  const options = {
    workflowId: `${pipelineCase.workflowIdPrefix}-${suffix}`,
    completionDelivery: pipelineCase.completionDelivery,
  };
  if (pipelineCase.duplicateFirstCompletion) {
    options.duplicateFirstCompletion = true;
  }
  return options;
}

async function runTemporalTargets(runner, contexts) {
  const started = performance.now();
  const items = contexts.flatMap(({ pipelineCase, scenario, semanticProcess }) => [
    {
      scenario,
      semanticProcess,
      options: temporalOptions(pipelineCase, "primary"),
    },
    {
      scenario,
      semanticProcess,
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
          compileBpmnToSemanticProcess({
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
        checkedProcess: compilation.checkedProcess,
        semanticProcess: compilation.semanticProcess,
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
  const {
    pipelineCase,
    scenario,
    retainedEvidence,
    checkedProcess,
    semanticProcess,
  } = context;
  const {
    cibResult,
    canonicalCib,
    leanResult,
    semanticCoreResult,
    temporalResult,
  } = projectedTargets;
  const semanticCandidates = [
    {
      target: DifferentialTarget.Lean,
      result: leanResult,
    },
    {
      target: DifferentialTarget.SemanticCore,
      result: semanticCoreResult,
    },
  ];
  if (
    pipelineCase.temporalRelation ===
      TemporalCaseRelation.ExactSemantic
  ) {
    semanticCandidates.push({
      target: DifferentialTarget.Temporal,
      result: temporalResult.primary.result,
    });
  }
  // tag::four-target-comparison[]
  const comparison = compareTargetResults(
    {
      target: DifferentialTarget.CibSeven,
      result: canonicalCib,
    },
    semanticCandidates,
  );
  // end::four-target-comparison[]
  const expectedTemporalPrefix =
    pipelineCase.temporalRelation ===
      TemporalCaseRelation.PostTerminalClosed
      ? semanticPrefixThroughCompletion(semanticCoreResult)
      : null;
  const temporalPrefixComparison =
    expectedTemporalPrefix === null
      ? null
      : compareTargetResults(
          {
            target: DifferentialTarget.SemanticCore,
            result: expectedTemporalPrefix,
          },
          [
            {
              target: DifferentialTarget.Temporal,
              result: temporalResult.primary.result,
            },
          ],
        );
  const expectedPostTerminalCommand =
    pipelineCase.temporalRelation ===
      TemporalCaseRelation.PostTerminalClosed
      ? scenario.stimuli.at(-1)
      : null;
  const postTerminalResult =
    temporalResult.primary.interactionEvidence.postTerminalResult;
  if (
    expectedPostTerminalCommand !== null &&
    (
      postTerminalResult?.kind !==
        ProcessCommandResultKind.ProcessClosed ||
      postTerminalResult.commandId !==
        expectedPostTerminalCommand.commandId
    )
  ) {
    throw new Error(
      `Temporal did not classify ${expectedPostTerminalCommand.commandId} as processClosed`,
    );
  }
  if (
    expectedPostTerminalCommand === null &&
    postTerminalResult !== null
  ) {
    throw new Error(
      `Temporal returned an unexpected post-terminal result for ${scenario.id}`,
    );
  }
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
  const completionStimuli = scenario.stimuli.slice(1).filter(
    (stimulus) =>
      stimulus.kind === StimulusKind.CompleteUserTaskInstance,
  );
  const completionCommandIds = new Set(
    completionStimuli.map(({ commandId }) => commandId),
  );
  const expectedCompletionOutcomes = semanticCoreResult.trace.flatMap(
    (observation) =>
      observation.kind === CanonicalObservationKind.Command &&
      completionCommandIds.has(observation.commandId)
        ? [observation.outcome]
        : [],
  );
  if (
    pipelineCase.temporalRelation ===
      TemporalCaseRelation.PostTerminalClosed
  ) {
    expectedCompletionOutcomes.pop();
  }
  const intermediateCompletionCommandIds = completionStimuli
    .slice(0, -1)
    .map(({ commandId }) => commandId);
  const expectedOpenUserTasksAfterCompletions =
    intermediateCompletionCommandIds.map((commandId) => {
      const commandIndex = semanticCoreResult.trace.findIndex(
        (observation) =>
          observation.kind === CanonicalObservationKind.Command &&
          observation.commandId === commandId,
      );
      const state = semanticCoreResult.trace[commandIndex + 1];
      if (
        commandIndex < 0 ||
        state?.kind !== CanonicalObservationKind.State
      ) {
        throw new Error(
          `No stable state follows completion ${commandId}`,
        );
      }
      return state.openUserTasks;
    });

  return {
    report: {
      scenario: {
        id: scenario.id,
        profile: scenario.profile,
        bpmnSha256: scenario.bpmn.sha256,
        checkedProcess: {
          kind: checkedProcess.kind,
        },
        semanticProcess: {
          kind: semanticProcess.kind,
          compiler: semanticProcess.identity.compiler,
        },
        normativeRefs: scenario.provenance.normativeRefs,
        cibRevision: scenario.provenance.cibRevision,
      },
      comparison,
      temporalPrefixComparison,
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
      expectedPostTerminalResultKind:
        expectedPostTerminalCommand === null
          ? null
          : ProcessCommandResultKind.ProcessClosed,
      expectedCompletionOutcomes,
      expectedOpenUserTasksAfterCompletions,
      expectedDerivedTimerCommandId:
        scenario.stimuli.find(
          (stimulus) => stimulus.kind === StimulusKind.FireTimer,
        )?.commandId ?? null,
      cibCleanup: cibResult.diagnostics.cleanup,
    },
  };
}

function semanticPrefixThroughCompletion(result) {
  const completedStateIndex = result.trace.findIndex(
    (observation) =>
      observation.kind === CanonicalObservationKind.State &&
      observation.status === ProcessStatus.Completed,
  );
  if (completedStateIndex < 1) {
    throw new Error(
      "Post-terminal relation requires one completed semantic prefix",
    );
  }
  const finalCommand = result.trace[completedStateIndex - 1];
  if (finalCommand?.kind !== CanonicalObservationKind.Command) {
    throw new Error(
      "Completed semantic prefix has no preceding command outcome",
    );
  }
  return {
    outcome: {
      kind: "semantic",
      outcome: finalCommand.outcome,
    },
    trace: result.trace.slice(0, completedStateIndex + 1),
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
    const [
      cib,
      lean,
      leanDefinitionMutation,
      leanScenarioMutation,
      leanProvenanceMutation,
      temporal,
    ] = await Promise.all([
      runCibTargets(
        contexts.map(({ scenario }) => scenario),
        cibInputPath,
        cibOutputPath,
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
    ]);
    targets = {
      cib,
      lean,
      leanDefinitionMutation,
      leanScenarioMutation,
      leanProvenanceMutation,
      core,
      temporal,
    };
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
