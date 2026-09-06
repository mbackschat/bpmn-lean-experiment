import assert from "node:assert/strict";
import {
  CommandOutcome,
  applyInternalOperationStep,
  compareCanonicalStrings,
} from "@bpmn-lean/semantic-core";
import type {
  AppliedInternalOperationStep,
  RuntimeState,
  SemanticProcessProgram,
  Stimulus,
} from "@bpmn-lean/semantic-core";

type AdmissionModule = typeof import("../src/semantic-command-admission.ts");
const { admit } = await import(
  new URL("../dist/semantic-command-admission.js", import.meta.url).href
) as AdmissionModule;

export function admittedInternalPrefix(
  program: SemanticProcessProgram,
  before: RuntimeState,
  stimulus: Stimulus,
  prefixOperationIds: readonly string[],
  expectedEnabledOperationIds: readonly string[],
): RuntimeState {
  const admitted = admit(program, before, stimulus);
  assert.equal(admitted.outcome, CommandOutcome.Committed, "fixture requires committed admission");
  let state = admitted.state;
  for (const id of prefixOperationIds) {
    assert.equal(program.operations.filter((operation) => operation.id === id).length,
      1, "fixture requires a unique operation declaration");
    const enabled = enabledSteps(program, state);
    assert.equal(enabled.length, 1, "fixture requires exactly one enabled operation");
    const step = enabled.find(({ operation }) => operation.id === id);
    assert.ok(step !== undefined, "fixture requires the requested operation to be enabled");
    state = step.successor;
  }
  assert.deepEqual(
    enabledSteps(program, state).map(({ operation }) => operation.id).sort(compareCanonicalStrings),
    [...expectedEnabledOperationIds].sort(compareCanonicalStrings),
    "fixture requires the exact stopping frontier",
  );
  return state;
}

function enabledSteps(
  program: SemanticProcessProgram,
  state: RuntimeState,
): AppliedInternalOperationStep[] {
  return program.operations.map((operation) => applyInternalOperationStep(program, operation, state))
    .filter((step): step is AppliedInternalOperationStep => step !== null);
}
