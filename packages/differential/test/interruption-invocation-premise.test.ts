/**
 * The Lean interruption proofs take `InterruptionInvocationsRooted` (`RuntimePositionValidity.lean`) as an explicit
 * Program premise instead of deriving it from admission: a Program that declares an Error or Terminate operation keeps
 * every invocation in a Process root. This census locks it on every Program the pipeline compiles. It observes the
 * registered catalog under today's admission, not every Program a profile could admit; `PC-SCOPE-07` must discharge
 * the premise when it admits interruption around a Sub-Process-placed Call.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { SemanticOperationKind } from "@bpmn-lean/semantic-core";
import type { SemanticProcessProgram } from "@bpmn-lean/semantic-core";

import { loadAndCompileCases } from "./pipeline-case-loading.ts";
import { pipelineCases } from "./pipeline-cases.ts";

function interrupts(program: SemanticProcessProgram): boolean {
  return program.operations.some(({ kind }) =>
    kind === SemanticOperationKind.ThrowError || kind === SemanticOperationKind.TerminateScope);
}

/** The definition scopes owning an `invokeProcess` that are not Process roots. */
function embeddedInvocationScopes(program: SemanticProcessProgram): string[] {
  return program.operations.filter(({ kind }) => kind === SemanticOperationKind.InvokeProcess).flatMap(({ id }) =>
    program.operationScopes.filter(({ operationId }) => operationId === id).map(({ scopeId }) => scopeId))
    .filter(scopeId => program.definitionScopes.some(scope => scope.id === scopeId && scope.parentScopeId !== null));
}

test("every pipeline Program that declares an interrupting operation invokes only from Process roots", async () => {
  const programs = (await loadAndCompileCases(pipelineCases)).map(({ pipelineCase, semanticProcess }) =>
    ({ id: pipelineCase.id, program: semanticProcess }));
  for (const { id, program } of programs) {
    if (interrupts(program)) assert.deepEqual(embeddedInvocationScopes(program), [], id);
  }
  // Both sides of the implication occur in the catalog, so the census is not vacuous.
  assert.ok(programs.some(({ program }) => interrupts(program)), "some registered Program interrupts");
  assert.ok(programs.some(({ program }) => embeddedInvocationScopes(program).length > 0),
    "some registered Program invokes from an embedded scope");
});
