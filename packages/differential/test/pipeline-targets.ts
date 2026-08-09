/**
 * Target invocation, strict result binding, and source compilation for the differential pipeline.
 */
import {
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import type {
  BpmnCompilationResult,
} from "@bpmn-lean/bpmn-source";
import {
  runScenario,
} from "@bpmn-lean/semantic-core";
import type {
  Scenario,
  ScenarioResult,
} from "@bpmn-lean/semantic-core";
import {
  DifferentialTarget,
  requireScenarioBinding,
} from "@bpmn-lean/differential";
import {
  TemporalScenarioRunner,
} from "@bpmn-lean/temporal-testkit";
import type {
  TemporalScenarioBatchItem,
  TemporalScenarioExecution,
  TemporalScenarioExecutionOptions,
} from "@bpmn-lean/temporal-testkit";
import { parseStrictJson } from "../../../scripts/strict-json.ts";

export {
  runCibTargetGroups,
  runCibTargets,
} from "./pipeline-cib-targets.ts";
export {
  elapsedMs,
  runProcess,
} from "./pipeline-target-support.ts";
import {
  elapsedMs,
  indexExactRecords,
  mutableClone,
  projectRoot,
  readJson,
  runProcess,
} from "./pipeline-target-support.ts";
import type {
  CibPipelineResult,
  LeanDefinitionRecord,
  LeanResultRecord,
  PipelineCase,
  PipelineContext,
  PipelineTargets,
  RetainedEvidence,
  TargetBatch,
  TemporalCaseExecution,
  TemporalTargetBatch,
} from "./pipeline-types.ts";

const leanExecutable = "emitSemanticProcessResults";

export function canonicalCibResult(
  cibResult: CibPipelineResult,
): ScenarioResult {
  return {
    outcome: cibResult.outcome,
    trace: cibResult.trace,
  };
}

export function requireUniqueCaseIds(cases: ReadonlyArray<PipelineCase>): void {
  if (cases.length === 0) {
    throw new TypeError("At least one pipeline case is required");
  }
  const ids = cases.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) {
    throw new TypeError("Pipeline case IDs must be unique");
  }
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

export async function runLeanTargets(
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

export async function requireLeanDefinitionMutationRejection(
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

export async function requireLeanScenarioMutationRejection(
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

export async function requireLeanProvenanceErasureRejection(
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

export function runCoreTargets(
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
    executionSchedule: pipelineCase.executionSchedule,
    effectExecutionSchedule:
      pipelineCase.effectSchedules?.[suffix] ?? null,
  };
}

export async function runTemporalTargets(
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

export async function loadAndCompileCases(
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
      const [scenario, retainedEvidence] = await Promise.all([
        readJson<Scenario>(scenarioPath),
        pipelineCase.cib === null
          ? Promise.resolve(null)
          : readJson<RetainedEvidence>(
              path.join(
                projectRoot,
                pipelineCase.cib.evidenceRelativePath,
              ),
            ),
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
            sourceOverlay: null,
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
