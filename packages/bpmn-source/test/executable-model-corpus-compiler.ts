import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";

import type {
  CorpusCompiler,
} from "../../../scripts/executable-model-corpus.ts";

/** Adapts the production compiler to the representation-free corpus admission boundary. */
export const compileCorpusModel: CorpusCompiler = async (request) => {
  const result = await compileBpmnToSemanticProcess(request);
  return {
    status: result.status === BpmnCompilationStatus.Accepted
      ? "accepted"
      : "rejected",
    diagnostics: result.diagnostics,
  };
};
