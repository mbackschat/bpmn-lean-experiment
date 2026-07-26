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
import { isDeepStrictEqual } from "node:util";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import type {
  AcceptedBpmnCompilation,
  BpmnCompilationResult,
} from "@bpmn-lean/bpmn-source";
import {
  CanonicalObservationKind,
  ProcessStatus,
  ScenarioOutcomeKind,
  StimulusKind,
  compareCanonicalStrings,
  runScenario,
} from "@bpmn-lean/semantic-core";
import type {
  CanonicalObservation,
  Scenario,
  ScenarioResult,
  SemanticProcessProgram,
  StateObservation,
} from "@bpmn-lean/semantic-core";
import {
  DisagreementKind,
  DifferentialTarget,
  compareTargetResults,
  requireScenarioBinding,
} from "@bpmn-lean/differential";
import type {
  ScenarioDisagreement,
  TargetScenarioResult,
} from "@bpmn-lean/differential";
import {
  EffectExecutionSchedule,
  ProcessCommandResultKind,
  TemporalCompletionDelivery,
  TemporalScenarioRunner,
} from "@bpmn-lean/temporal-adapter";
import type {
  TemporalScenarioBatchItem,
  TemporalScenarioExecution,
  TemporalScenarioExecutionOptions,
} from "@bpmn-lean/temporal-adapter";
import { runCommand } from "../../../scripts/run-command.ts";
import { parseStrictJson } from "../../../scripts/strict-json.ts";

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

type TemporalCaseRelation =
  typeof TemporalCaseRelation[keyof typeof TemporalCaseRelation];

type DeepMutable<T> =
  T extends (...args: never[]) => unknown
    ? T
    : T extends ReadonlyArray<infer Item>
      ? Array<DeepMutable<Item>>
      : T extends object
        ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
        : T;

type MutableScenarioResult = DeepMutable<ScenarioResult>;
type MutableStateObservation = Extract<
  DeepMutable<CanonicalObservation>,
  { kind: CanonicalObservationKind.State }
>;
type ObservationValueDisagreement = Extract<
  ScenarioDisagreement,
  { kind: DisagreementKind.ObservationValue }
>;

export type PipelineCase = Readonly<{
  id: string;
  scenarioRelativePath: string;
  evidenceRelativePath: string;
  bpmnRelativePath: string;
  workflowIdPrefix: string;
  expectedWaitTraceLength: number;
  completionDelivery: TemporalCompletionDelivery;
  temporalRelation: TemporalCaseRelation;
  duplicateFirstCompletion?: boolean;
  effectScheduleSubstitution?: boolean;
  replayIsolation?: boolean;
  injectMutation: (result: MutableScenarioResult) => void;
  expectedInjectedDisagreement: ObservationValueDisagreement;
}>;

type InteractionCaseOptions = Readonly<{
  completionDelivery?: TemporalCompletionDelivery;
  temporalRelation?: TemporalCaseRelation;
  duplicateFirstCompletion?: boolean;
}>;

type ParallelCaseOptions = Readonly<{
  injectMutation?: PipelineCase["injectMutation"];
  expectedInjectedDisagreement?: ObservationValueDisagreement;
}>;

type RetainedEvidence = Readonly<{
  result: ScenarioResult;
}>;

type PipelineContext = Readonly<{
  pipelineCase: PipelineCase;
  scenario: Scenario;
  retainedEvidence: RetainedEvidence;
  checkedProcess: AcceptedBpmnCompilation["checkedProcess"];
  semanticProcess: SemanticProcessProgram;
}>;

type LeanDefinitionRecord = Readonly<{
  scenarioId: string;
  checkedProcess: AcceptedBpmnCompilation["checkedProcess"];
  semanticProcess: SemanticProcessProgram;
}>;

type LeanResultRecord = Readonly<{
  scenarioId: string;
  scenario: Scenario;
  definitionBinding: Readonly<{
    kind: "leanDefinitionBinding";
    sourceSha256: string;
    semanticProfile: string;
    programMatchesLeanLowering: boolean;
  }>;
  result: ScenarioResult;
}>;

type CibEffectExecution = Readonly<{
  afterCommandId: string;
  schedule: string;
  invocations: number;
  mutations: number;
  initialRetries: number;
  retriesAfterFirstFailure: number | null;
}>;

type CibPipelineResult = Readonly<{
  scenarioId: string;
  outcome: ScenarioResult["outcome"];
  trace: ScenarioResult["trace"];
  diagnostics: Readonly<{
    startupNanos: number;
    phases: Readonly<{
      waitProjectionNanos: number;
      completionProjectionNanos: number;
      totalNanos: number;
    }>;
    effectExecutions?: ReadonlyArray<CibEffectExecution>;
    cleanup: Readonly<Record<string, number>>;
  }>;
}>;

type TargetBatch<Result> = Readonly<{
  results: ReadonlyMap<string, Result>;
  totalMs: number;
}>;

type TemporalCaseExecution = Readonly<{
  primary: TemporalScenarioExecution;
  isolation: TemporalScenarioExecution;
}>;

type TemporalTargetBatch = TargetBatch<TemporalCaseExecution> & Readonly<{
  workflowIds: ReadonlyArray<string>;
}>;

type PipelineTargets = Readonly<{
  cib: TargetBatch<CibPipelineResult>;
  lean: TargetBatch<ScenarioResult>;
  leanDefinitionMutation: Readonly<{
    kind: "rejected";
    mutation: "operationOrigin";
  }>;
  leanScenarioMutation: Readonly<{
    kind: "rejected";
    mutation: "scenarioExtraField";
  }>;
  leanProvenanceMutation: Readonly<{
    kind: "rejected";
    mutation: "parallelControlPlaceProvenanceErasure";
  }>;
  core: TargetBatch<ScenarioResult>;
  temporal: TemporalTargetBatch;
  cibEffectRetry: TargetBatch<CibPipelineResult> | null;
}>;

type ProjectedTargets = Readonly<{
  cibResult: CibPipelineResult;
  canonicalCib: ScenarioResult;
  leanResult: ScenarioResult;
  semanticCoreResult: ScenarioResult;
  temporalResult: TemporalCaseExecution;
  cibEffectRetryResult: CibPipelineResult | null;
}>;

function mutableClone<T>(value: T): DeepMutable<T> {
  return structuredClone(value) as DeepMutable<T>;
}

function observationValueDisagreement(
  path: string,
  expected: unknown,
  actual: unknown,
): ObservationValueDisagreement {
  return {
    kind: DisagreementKind.ObservationValue,
    path,
    expected,
    actual,
  };
}

function mutateOpenTaskActivation(result: MutableScenarioResult): void {
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

function omitOneParallelOpenTask(result: MutableScenarioResult): void {
  const running = runningObservation(result);
  if (running.openUserTasks?.length !== 2) {
    throw new Error("two calibrated parallel User Tasks are required");
  }
  running.openUserTasks = running.openUserTasks.slice(0, 1);
}

function omitLiveSiblingAfterStaleRejection(
  result: MutableScenarioResult,
): void {
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

function mutateOpenTimerDeadline(result: MutableScenarioResult): void {
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

function mutateOpenEffectHandler(result: MutableScenarioResult): void {
  const running = runningObservation(result);
  const openEffect = running.openEffects?.[0];
  if (openEffect === undefined) {
    throw new Error("one calibrated open effect is required");
  }
  running.openEffects[0] = {
    ...openEffect,
    descriptor: {
      ...openEffect.descriptor,
      handler: `${openEffect.descriptor.handler}-mutated`,
    },
  } as unknown as typeof openEffect;
}

function runningObservation(
  result: MutableScenarioResult,
): MutableStateObservation {
  const observation = result.trace.find(
    (candidate): candidate is MutableStateObservation =>
      candidate.kind === CanonicalObservationKind.State &&
      candidate.status === ProcessStatus.Running,
  );
  if (observation === undefined) {
    throw new Error("calibrated running state is required");
  }
  return observation;
}

function interactionCase(
  id: string,
  scenarioFile: string,
  evidenceFile: string,
  options: InteractionCaseOptions = {},
): PipelineCase {
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
    expectedInjectedDisagreement: observationValueDisagreement(
      "trace[2].openUserTasks[0].id.activation",
      1,
      2,
    ),
  });
}

function parallelCase(
  id: string,
  scenarioFile: string,
  evidenceFile: string,
  options: ParallelCaseOptions = {},
): PipelineCase {
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
      options.expectedInjectedDisagreement ??
      observationValueDisagreement(
        "trace[2].openUserTasks.length",
        2,
        1,
      ),
  });
}

function timerCase(): PipelineCase {
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
    expectedInjectedDisagreement: observationValueDisagreement(
      "trace[2].openTimers[0].deadlineMs",
      1000,
      1001,
    ),
  });
}

function effectCase(): PipelineCase {
  return Object.freeze({
    id: "service-task-effect-success",
    scenarioRelativePath:
      "scenarios/service-task-effect/scenario.json",
    evidenceRelativePath:
      "scenarios/service-task-effect/cibseven-evidence.json",
    bpmnRelativePath: "scenarios/service-task-effect/process.bpmn",
    workflowIdPrefix: "service-task-effect-success",
    expectedWaitTraceLength: 3,
    completionDelivery: TemporalCompletionDelivery.Ordered,
    temporalRelation: TemporalCaseRelation.ExactSemantic,
    effectScheduleSubstitution: true,
    replayIsolation: true,
    injectMutation: mutateOpenEffectHandler,
    expectedInjectedDisagreement: observationValueDisagreement(
      "trace[2].openEffects[0].descriptor.handler",
      "bpmnLeanEffectHandler",
      "bpmnLeanEffectHandler-mutated",
    ),
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
      expectedInjectedDisagreement: observationValueDisagreement(
        "trace[6].openUserTasks.length",
        1,
        0,
      ),
    },
  ),
  timerCase(),
  effectCase(),
]);

function elapsedMs(started: number): number {
  return performance.now() - started;
}

async function readJson<Value>(filePath: string): Promise<Value> {
  return parseStrictJson<Value>(
    await readFile(filePath, "utf8"),
    filePath,
  );
}

function runProcess(
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

function canonicalCibResult(
  cibResult: CibPipelineResult,
): ScenarioResult {
  return {
    outcome: cibResult.outcome,
    trace: cibResult.trace,
  };
}

function requireUniqueCaseIds(cases: ReadonlyArray<PipelineCase>): void {
  if (cases.length === 0) {
    throw new TypeError("At least one pipeline case is required");
  }
  const ids = cases.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) {
    throw new TypeError("Pipeline case IDs must be unique");
  }
}

function indexExactRecords<Record extends Readonly<{ scenarioId: string }>>(
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

async function runCibTargets(
  scenarios: ReadonlyArray<Scenario>,
  inputPath: string,
  outputPath: string,
  effectSchedule = EffectExecutionSchedule.PlainSuccess,
): Promise<TargetBatch<CibPipelineResult>> {
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
      `-Dbpmn.pipeline.effectSchedule=${effectSchedule}`,
      "test",
    ],
    30_000,
  );
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

function leanDefinitionRecords(
  contexts: ReadonlyArray<PipelineContext>,
): ReadonlyArray<LeanDefinitionRecord> {
  return contexts.map(
    ({ scenario, checkedProcess, semanticProcess }) => ({
      scenarioId: scenario.id,
      checkedProcess,
      semanticProcess,
    }),
  );
}

function leanScenarioPaths(
  contexts: ReadonlyArray<PipelineContext>,
): Array<string> {
  return contexts.map(({ pipelineCase }) =>
    path.join(projectRoot, pipelineCase.scenarioRelativePath)
  );
}

async function writeJsonLines(
  filePath: string,
  records: ReadonlyArray<unknown>,
): Promise<void> {
  await writeFile(
    filePath,
    `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
    "utf8",
  );
}

async function runLeanTargets(
  contexts: ReadonlyArray<PipelineContext>,
  inputPath: string,
): Promise<TargetBatch<ScenarioResult>> {
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
    .map((line, index) =>
      parseStrictJson<LeanResultRecord>(
        line,
        `Lean result line ${index + 1}`,
      ));
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
        return [scenario.id, record.result] as const;
      }),
    ),
    totalMs: elapsedMs(started),
  };
}

async function requireLeanDefinitionMutationRejection(
  contexts: ReadonlyArray<PipelineContext>,
  inputPath: string,
): Promise<PipelineTargets["leanDefinitionMutation"]> {
  const records = mutableClone(leanDefinitionRecords(contexts));
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
  contexts: ReadonlyArray<PipelineContext>,
  inputPath: string,
  scenarioPath: string,
): Promise<PipelineTargets["leanScenarioMutation"]> {
  const firstContext = contexts[0];
  if (firstContext === undefined) {
    throw new TypeError("Lean scenario mutation requires one context");
  }
  await writeJsonLines(inputPath, leanDefinitionRecords(contexts));
  await writeFile(
    scenarioPath,
    JSON.stringify({
      ...firstContext.scenario,
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
  contexts: ReadonlyArray<PipelineContext>,
  inputPath: string,
): Promise<PipelineTargets["leanProvenanceMutation"]> {
  const records = mutableClone(leanDefinitionRecords(contexts));
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

function runCoreTargets(
  contexts: ReadonlyArray<PipelineContext>,
): TargetBatch<ScenarioResult> {
  const started = performance.now();
  return {
    results: new Map(
      contexts.map(({ scenario, semanticProcess }) => [
        scenario.id,
        runScenario(scenario, semanticProcess),
      ] as const),
    ),
    totalMs: elapsedMs(started),
  };
}

function temporalOptions(
  pipelineCase: PipelineCase,
  suffix: "primary" | "isolation",
): TemporalScenarioExecutionOptions {
  return {
    workflowId: `${pipelineCase.workflowIdPrefix}-${suffix}`,
    completionDelivery: pipelineCase.completionDelivery,
    ...(pipelineCase.duplicateFirstCompletion === true
      ? { duplicateFirstCompletion: true }
      : {}),
    ...(pipelineCase.effectScheduleSubstitution === true
      ? {
          effectExecutionSchedule:
            suffix === "isolation"
              ? EffectExecutionSchedule.FailAfterMutationOnce
              : EffectExecutionSchedule.PlainSuccess,
        }
      : {}),
  };
}

async function runTemporalTargets(
  runner: TemporalScenarioRunner,
  contexts: ReadonlyArray<PipelineContext>,
): Promise<TemporalTargetBatch> {
  const started = performance.now();
  const items: ReadonlyArray<TemporalScenarioBatchItem> =
    contexts.flatMap(
      ({ pipelineCase, scenario, semanticProcess }) => [
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
      ],
    );
  const executions = new Array<
    TemporalScenarioExecution | undefined
  >(items.length);
  const ordinaryEntries = items
    .map((item, index) => ({ item, index }))
    .filter(
      ({ item }) =>
        item.options.effectExecutionSchedule === undefined,
    );
  const effectEntries = items
    .map((item, index) => ({ item, index }))
    .filter(
      ({ item }) =>
        item.options.effectExecutionSchedule !== undefined,
    );
  const ordinaryPromise = runner.runScenarios(
    ordinaryEntries.map(({ item }) => item),
  );
  // The two same-intent schedules deliberately use isolated stores. Running
  // them sequentially avoids inventing a host execution ID in EffectRequest
  // merely to route concurrent harness registrations for the same key.
  for (const { item, index } of effectEntries) {
    executions[index] = await runner.runScenario(
      item.scenario,
      item.semanticProcess,
      item.options,
    );
  }
  const ordinaryExecutions = await ordinaryPromise;
  for (const [ordinaryIndex, { index }] of ordinaryEntries.entries()) {
    executions[index] = ordinaryExecutions[ordinaryIndex];
  }
  const results = new Map<string, TemporalCaseExecution>();
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

async function loadAndCompileCases(
  cases: ReadonlyArray<PipelineCase>,
): Promise<ReadonlyArray<PipelineContext>> {
  const sourceBytes = new Map<string, Promise<Buffer>>();
  const compilations =
    new Map<string, Promise<BpmnCompilationResult>>();
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
        readJson<Scenario>(scenarioPath),
        readJson<RetainedEvidence>(evidencePath),
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

function requiredResult<Result>(
  results: ReadonlyMap<string, Result>,
  scenarioId: string,
  targetName: string,
): Result {
  const result = results.get(scenarioId);
  if (result === undefined) {
    throw new Error(`${targetName} omitted scenario ${scenarioId}`);
  }
  return result;
}

function projectCaseTargets(
  context: PipelineContext,
  targets: PipelineTargets,
): ProjectedTargets {
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
    cibEffectRetryResult:
      targets.cibEffectRetry === null
        ? null
        : targets.cibEffectRetry.results.get(scenarioId) ?? null,
  };
}

function compareCase(
  context: PipelineContext,
  projectedTargets: ProjectedTargets,
) {
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
    cibEffectRetryResult,
  } = projectedTargets;
  const semanticCandidates: Array<TargetScenarioResult> = [
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
        ?? null
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
  if (pipelineCase.effectScheduleSubstitution === true) {
    if (cibEffectRetryResult === null) {
      throw new Error("Service Task case omitted the CIB retry execution");
    }
    if (
      !isDeepStrictEqual(
        canonicalCibResult(cibEffectRetryResult),
        canonicalCib,
      )
    ) {
      throw new Error(
        "CIB retry schedule changed the canonical Service Task result",
      );
    }
    const [execution] =
      cibEffectRetryResult.diagnostics.effectExecutions ?? [];
    if (
      execution?.schedule !== "failAfterMutationOnce" ||
      execution.invocations !== 2 ||
      execution.mutations !== 1 ||
      execution.initialRetries !== 3 ||
      execution.retriesAfterFirstFailure !== 2
    ) {
      throw new Error(
        "CIB retry schedule omitted its raw decrement/re-execution facts",
      );
    }
  } else if (cibEffectRetryResult !== null) {
    throw new Error(
      `Unexpected CIB retry execution for ${scenario.id}`,
    );
  }
  // tag::seeded-disagreement[]
  const injectedResult = mutableClone(semanticCoreResult);
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
      primaryEffectProbeEvidence:
        temporalResult.primary.effectProbeEvidence,
      isolationEffectProbeEvidence:
        temporalResult.isolation.effectProbeEvidence,
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
      expectedDerivedEffectCommandId:
        scenario.stimuli.find(
          (stimulus) => stimulus.kind === StimulusKind.CompleteEffect,
        )?.commandId ?? null,
      cibEffectRetryEvidence:
        cibEffectRetryResult?.diagnostics.effectExecutions?.[0] ??
        null,
      cibCleanup: cibResult.diagnostics.cleanup,
    },
  };
}

function semanticPrefixThroughCompletion(
  result: ScenarioResult,
): ScenarioResult {
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
      kind: ScenarioOutcomeKind.Semantic,
      outcome: finalCommand.outcome,
    },
    trace: result.trace.slice(0, completedStateIndex + 1),
  };
}

async function replayEvidence(
  runner: TemporalScenarioRunner,
  contexts: ReadonlyArray<PipelineContext>,
  temporalResults: ReadonlyMap<string, TemporalCaseExecution>,
): Promise<Readonly<{ liveHistories: number }>> {
  const items = contexts.flatMap((context) => {
    const temporal = requiredResult(
      temporalResults,
      context.scenario.id,
      "Temporal",
    );
    return [
      {
        history: temporal.primary.history,
        workflowId: `${context.pipelineCase.workflowIdPrefix}-live-replay`,
      },
      ...(context.pipelineCase.replayIsolation === true
        ? [{
            history: temporal.isolation.history,
            workflowId:
              `${context.pipelineCase.workflowIdPrefix}-isolation-live-replay`,
          }]
        : []),
    ];
  });
  await runner.replayHistories(items);
  return { liveHistories: items.length };
}

function cibTiming(
  cibTarget: TargetBatch<CibPipelineResult>,
  contexts: ReadonlyArray<PipelineContext>,
) {
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
  const firstContext = contexts[0];
  if (firstContext === undefined) {
    throw new TypeError("CIB timing requires one pipeline context");
  }
  const firstResult = requiredResult(
    cibTarget.results,
    firstContext.scenario.id,
    "CIB Seven",
  );
  return {
    total: cibTarget.totalMs,
    engineStartup: firstResult.diagnostics.startupNanos / 1e6,
    cases,
  };
}

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
  const cibInputPath = path.join(temporaryDirectory, "cib-input.jsonl");
  const cibOutputPath = path.join(temporaryDirectory, "cib-output.jsonl");
  const cibEffectRetryInputPath = path.join(
    temporaryDirectory,
    "cib-effect-retry-input.jsonl",
  );
  const cibEffectRetryOutputPath = path.join(
    temporaryDirectory,
    "cib-effect-retry-output.jsonl",
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
      cliVersion: "v1.8.1",
      downloadDirectory: temporalCacheDirectory,
    });
    startupMs = elapsedMs(startupStarted);

    const scenarioStarted = performance.now();
    const core = runCoreTargets(contexts);
    const effectContexts = contexts.filter(
      ({ pipelineCase }) =>
        pipelineCase.effectScheduleSubstitution === true,
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
      effectContexts.length === 0
        ? null
        : runCibTargets(
            effectContexts.map(({ scenario }) => scenario),
            cibEffectRetryInputPath,
            cibEffectRetryOutputPath,
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
