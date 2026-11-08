import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { Ajv2020 } from "ajv/dist/2020.js";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import type {
  AcceptedBpmnCompilation,
  BpmnSourceLimits,
} from "@bpmn-lean/bpmn-source";
import type { SemanticProcessProgram } from "@bpmn-lean/semantic-core";

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
    sourceOverlay: null,
    limits: semanticProcessTestLimits,
  });
  if (result.status !== BpmnCompilationStatus.Accepted) {
    throw new Error(
      `${sourceId} was rejected: ${JSON.stringify(result.diagnostics)}`,
    );
  }
  return result;
}

const programValid = new Ajv2020({ strict: true, allErrors: true }).compile(JSON.parse(
  await readFile(new URL("../../../contracts/schemas/semantic-process.schema.json", import.meta.url), "utf8")));

/** Whether a Program satisfies the published Program schema, which no runtime path checks. */
export function programSchemaAccepts(program: SemanticProcessProgram): boolean {
  return programValid(program);
}

export function assertProgramSchema(program: SemanticProcessProgram, label: string): void {
  assert.equal(programValid(program), true, `${label}: ${JSON.stringify(programValid.errors)}`);
}
