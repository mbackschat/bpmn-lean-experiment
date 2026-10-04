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
  const readSource = (absolutePath: string): Promise<Buffer> => {
    let bytes = sourceBytes.get(absolutePath);
    if (bytes === undefined) {
      bytes = readFile(absolutePath);
      sourceBytes.set(absolutePath, bytes);
    }
    return bytes;
  };
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
      const overlayIdentity = scenario.bpmn.sourceOverlay;
      const overlayPath = pipelineCase.sourceOverlayRelativePath === undefined ? null
        : path.join(projectRoot, pipelineCase.sourceOverlayRelativePath);
      if (overlayIdentity !== null && overlayPath === null) {
        throw new Error(`Source overlay requires a selected path for ${pipelineCase.id}`);
      }
      if (overlayIdentity === null && overlayPath !== null) {
        throw new Error(`Source overlay path requires a scenario identity for ${pipelineCase.id}`);
      }
      const sourceOverlay = overlayIdentity === null || overlayPath === null ? null
        : { ...overlayIdentity, bytes: await readSource(overlayPath) };
      const compilationKey = JSON.stringify([
        bpmnPath,
        scenario.bpmn.id,
        scenario.bpmn.sha256,
        scenario.profile,
        overlayPath,
        overlayIdentity,
      ]);
      let compilationPromise = compilations.get(compilationKey);
      if (compilationPromise === undefined) {
        compilationPromise = readSource(bpmnPath).then((bytes) =>
          compileBpmnToSemanticProcess({
            bytes,
            sourceId: scenario.bpmn.id,
            expectedSha256: scenario.bpmn.sha256,
            sourceOverlay,
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
