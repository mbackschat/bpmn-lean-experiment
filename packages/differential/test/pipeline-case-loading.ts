import { readFile } from "node:fs/promises";
import path from "node:path";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import type { BpmnCompilationResult } from "@bpmn-lean/bpmn-source";
import type { Scenario } from "@bpmn-lean/semantic-core";
import { projectRoot, readJson } from "./pipeline-target-support.ts";
import type { PipelineContext, RetainedEvidence, SemanticDifferentialCase } from "./pipeline-types.ts";

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
