import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SemanticOperationKind,
  type Scenario,
  type SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import { mutateConditionalSelection } from "@bpmn-lean/temporal-testkit";
import { compileExecutionInput, loadJson } from "./temporal-test-support.ts";

for (const count of [1, 2, 3]) {
  test(`two-branch bypass probe ${count === 2 ? "swaps" : "refuses"} ${count} candidates`, async () => {
    const scenario = await loadJson<Scenario>(new URL("../../../../scenarios/exclusive-gateway-simple-boolean/scenario.json", import.meta.url));
    const { semanticProcess } = await compileExecutionInput(scenario, new URL("../../../../scenarios/exclusive-gateway-simple-boolean/process.bpmn", import.meta.url));
    const changed: SemanticProcessProgram = {
      ...semanticProcess,
      operations: semanticProcess.operations.map(operation => {
        if (operation.kind !== SemanticOperationKind.Choose) return operation;
        const [first, second] = operation.candidates;
        assert.ok(second);
        if (count === 2) return operation;
        return { ...operation, candidates: count === 1 ? [first] : [first, second, { ...first, output: "third-branch" }] };
      }),
    };
    if (count !== 2) {
      assert.throws(() => mutateConditionalSelection(changed), /Branch-bypass mutation requires exactly two Exclusive candidates/u);
      return;
    }
    const original = changed.operations.find(operation => operation.kind === SemanticOperationKind.Choose);
    const mutated = mutateConditionalSelection(changed).operations.find(operation => operation.kind === SemanticOperationKind.Choose);
    assert.ok(original && mutated);
    const [first, second] = original.candidates;
    assert.ok(second);
    assert.deepEqual(mutated, { ...original, candidates: [
      { ...first, output: second.output, origin: second.origin },
      { ...second, output: first.output, origin: first.origin },
    ] });
  });
}
