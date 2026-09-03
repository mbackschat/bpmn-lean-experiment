/** Pure Lean/core target loading and execution for semantic differential cases. */
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
  CanonicalObservationKind,
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

import { parseStrictJson } from "../../../scripts/strict-json.ts";
import {
  elapsedMs,
  indexExactRecords,
  mutableClone,
  projectRoot,
  readJson,
  runProcess,
} from "./pipeline-target-support.ts";
import type {
  LeanDefinitionRecord,
  LeanResultRecord,
  PipelineContext,
  PipelineTargets,
  RetainedEvidence,
  SemanticDifferentialCase,
  TargetBatch,
} from "./pipeline-types.ts";

const leanCommand = "./scripts/lake.sh";
const leanProgram = "BpmnSemantics/SemanticProcessJsonMain.lean";

function leanDefinitionRecords<Case extends SemanticDifferentialCase>(
  contexts: ReadonlyArray<PipelineContext<Case>>,
): ReadonlyArray<LeanDefinitionRecord> {
  return contexts.map(
    ({ scenario, checkedProcess, semanticProcess }) => ({
      scenarioId: scenario.id,
      checkedProcess,
      semanticProcess,
    }),
  );
}

function leanScenarioPaths<Case extends SemanticDifferentialCase>(
  contexts: ReadonlyArray<PipelineContext<Case>>,
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

export async function runLeanTargets<Case extends SemanticDifferentialCase>(
  contexts: ReadonlyArray<PipelineContext<Case>>,
  inputPath: string,
): Promise<TargetBatch<ScenarioResult>> {
  const started = performance.now();
  await writeJsonLines(inputPath, leanDefinitionRecords(contexts));
  const execution = await runProcess(
    leanCommand,
    [
      "run",
      leanProgram,
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
          binding.sourceSha256 !== checkedProcess.identity.sourceSha256 ||
          binding.semanticProfile !== checkedProcess.identity.semanticProfile ||
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
  const firstOperation = records[0]?.semanticProcess?.operations?.[0];
  if (firstOperation?.origin?.elementId === undefined) {
    throw new TypeError("Lean definition mutation requires one operation");
  }
  firstOperation.origin.elementId = `${firstOperation.origin.elementId}_mutated`;
  await writeJsonLines(inputPath, records);
  try {
    await runProcess(
      leanCommand,
      [
        "run",
        leanProgram,
        inputPath,
        ...leanScenarioPaths(contexts),
      ],
      10_000,
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Semantic Process does not equal Lean lowering")
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
      leanCommand,
      ["run", leanProgram, inputPath, ...scenarioPaths],
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
      semanticProcess.identity.semanticProfile === "parallel-fork-join-draft",
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
      leanCommand,
      [
        "run",
        leanProgram,
        inputPath,
        ...leanScenarioPaths(contexts),
      ],
      10_000,
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Semantic Process does not equal Lean lowering")
    ) {
      return {
        kind: "rejected",
        mutation: "parallelControlPlaceProvenanceErasure",
      };
    }
    throw error;
  }
  throw new Error("Lean accepted erased Sequence Flow provenance");
}

export function runCoreTargets<Case extends SemanticDifferentialCase>(
  contexts: ReadonlyArray<PipelineContext<Case>>,
): TargetBatch<ScenarioResult> {
  const started = performance.now();
  return {
    results: new Map(
      contexts.map(({ scenario, semanticProcess }) => {
        const result = runScenario(scenario, semanticProcess);
        const consumedStimuli = result.trace.filter(({ kind }) =>
          kind === CanonicalObservationKind.Command
        ).length;
        if (consumedStimuli !== scenario.stimuli.length) {
          throw new Error(
            `Scenario ${scenario.id} did not consume every declared stimulus: ` +
              `${String(consumedStimuli)} of ${String(scenario.stimuli.length)}`,
          );
        }
        return [scenario.id, result] as const;
      }),
    ),
    totalMs: elapsedMs(started),
  };
}

export async function loadAndCompileCases<
  Case extends SemanticDifferentialCase,
>(
  cases: ReadonlyArray<Case>,
): Promise<ReadonlyArray<PipelineContext<Case>>> {
  const sourceBytes = new Map<string, Promise<Buffer>>();
  const compilations = new Map<string, Promise<BpmnCompilationResult>>();
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
              path.join(projectRoot, pipelineCase.cib.evidenceRelativePath),
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
      const bpmnPath = path.join(projectRoot, pipelineCase.bpmnRelativePath);
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
          })
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
