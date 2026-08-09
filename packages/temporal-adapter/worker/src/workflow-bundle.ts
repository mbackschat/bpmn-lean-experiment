/**
 * Owns the ordinary BPMN Workflow bundle used by disposable test Workers and replay.
 *
 * The compiled adapter output is immutable for one Node process. Keeping its first build, including a failed build, prevents Worker replacement and replay from silently compiling a different Workflow artifact.
 */
import { fileURLToPath } from "node:url";

import {
  DefaultLogger,
  bundleWorkflowCode,
} from "@temporalio/worker";
import type {
  WorkflowBundleWithSourceMap,
} from "@temporalio/worker";

export type BpmnWorkflowBundle = WorkflowBundleWithSourceMap;

type WorkflowBundleBuilder = () => Promise<BpmnWorkflowBundle>;

export function createWorkflowBundleLoader(
  build: WorkflowBundleBuilder,
): () => Promise<BpmnWorkflowBundle> {
  let ownedBuild: Promise<BpmnWorkflowBundle> | undefined;
  return () => {
    ownedBuild ??= build();
    return ownedBuild;
  };
}

const workflowsPath = fileURLToPath(
  import.meta.resolve("@bpmn-lean/temporal-workflow/workflows"),
);

export const loadBpmnWorkflowBundle = createWorkflowBundleLoader(() =>
  bundleWorkflowCode({
    workflowsPath,
    // Successful Webpack progress is expected gate plumbing. Compilation errors remain visible.
    logger: new DefaultLogger("ERROR"),
  })
);
