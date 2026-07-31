import { readFile } from "node:fs/promises";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import type {
  AcceptedBpmnCompilation,
  BpmnSourceLimits,
} from "@bpmn-lean/bpmn-source";

export const semanticProcessTestLimits: BpmnSourceLimits = Object.freeze({
  maxBytes: 1024 * 1024,
  parserDeadlineMs: 1_000,
});

/** Compiles one tracked fixture that the calling suite expects to be admitted. */
export async function compileSemanticProcessFixture(
  fixtureUrl: URL,
  sourceId: string,
  semanticProfile: string,
): Promise<AcceptedBpmnCompilation> {
  const result = await compileBpmnToSemanticProcess({
    bytes: await readFile(fixtureUrl),
    sourceId,
    expectedSha256: undefined,
    semanticProfile,
    limits: semanticProcessTestLimits,
  });
  if (result.status !== BpmnCompilationStatus.Accepted) {
    throw new Error(
      `${sourceId} was rejected: ${JSON.stringify(result.diagnostics)}`,
    );
  }
  return result;
}
