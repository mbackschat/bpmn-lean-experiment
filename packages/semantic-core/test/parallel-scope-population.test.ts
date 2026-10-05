import assert from "node:assert/strict";
import test from "node:test";
const { ParallelScopeRetirementKind, retireParallelScopeIteration, validParallelScopePopulation } =
  await import(new URL("../dist/parallel-scope-population.js", import.meta.url).href) as typeof import("../src/parallel-scope-population.ts");
import type { ParallelScopeController, ParallelScopeIteration } from "../src/parallel-scope-population.ts";

const controller: ParallelScopeController = {
  id: { processInstanceId: "applicants", activityElementId: "Check", activation: 2 }, total: 3, completed: 0,
};
const iterations: readonly ParallelScopeIteration[] = [0, 1, 2].map(loopCounter => ({
  scope: { processInstanceId: "applicants", definitionScopeId: "CheckBody", activation: 8 + loopCounter },
  loopCounter, item: "same applicant value",
}));

test("retirement selects the complete child identity and preserves surviving indices and bindings", () => {
  const result = retireParallelScopeIteration(controller, iterations, iterations[1]!.scope, false);
  assert.equal(result?.kind, ParallelScopeRetirementKind.Remaining);
  if (result?.kind !== ParallelScopeRetirementKind.Remaining) assert.fail("expected remaining bodies");
  assert.deepEqual(result.iterations, [iterations[0], iterations[2]]);
  assert.deepEqual(result.controller, { ...controller, completed: 1 });
  assert.equal(validParallelScopePopulation(result.controller, result.iterations), true);
  assert.equal(retireParallelScopeIteration(result.controller, result.iterations, iterations[1]!.scope, false), null);
  for (const target of [
    { ...iterations[1]!.scope, processInstanceId: "other" },
    { ...iterations[1]!.scope, definitionScopeId: "other" },
    { ...iterations[1]!.scope, activation: 99 },
  ]) assert.equal(retireParallelScopeIteration(controller, iterations, target, true), null);
});

test("early completion cancels only surviving bodies and final retirement takes natural precedence", () => {
  const result = retireParallelScopeIteration(controller, iterations, iterations[1]!.scope, true);
  assert.deepEqual(result, { kind: ParallelScopeRetirementKind.EarlyCompletion,
    controller: { ...controller, completed: 1 }, completedIteration: iterations[1],
    cancelled: [iterations[0], iterations[2]] });
  const last = retireParallelScopeIteration({ ...controller, completed: 2 }, [iterations[2]!], iterations[2]!.scope, true);
  assert.deepEqual(last, { kind: ParallelScopeRetirementKind.NaturalCompletion,
    controller: { ...controller, completed: 3 }, completedIteration: iterations[2] });
});

test("malformed ownership and accounting reject before selecting a body", () => {
  const invalid = [[], [...iterations, iterations[0]!], [...iterations].reverse(),
    [iterations[0]!, { ...iterations[1]!, loopCounter: 0 }, iterations[2]!],
    [iterations[0]!, { ...iterations[1]!, scope: iterations[0]!.scope }, iterations[2]!],
    iterations.map((value, index) => index === 1 ? { ...value, loopCounter: 3 } : value),
    iterations.map((value, index) => index === 1 ? { ...value, scope: { ...value.scope, definitionScopeId: "other" } } : value),
    iterations.map((value, index) => index === 1 ? { ...value, scope: { ...value.scope, processInstanceId: "other" } } : value),
  ];
  for (const entries of invalid) {
    assert.equal(validParallelScopePopulation(controller, entries), false);
    assert.equal(retireParallelScopeIteration(controller, entries, iterations[0]!.scope, false), null);
  }
  for (const completed of [-1, 0.5, 1, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(retireParallelScopeIteration({ ...controller, completed }, iterations, iterations[0]!.scope, false), null);
  }
});

for (const count of [1, 2, 16]) {
  test(`all ${count} bodies retire in reverse order without renumbering or early continuation`, () => {
    let owner = { ...controller, total: count };
    let active: readonly ParallelScopeIteration[] = Array.from({ length: count }, (_, loopCounter) => ({
      ...iterations[0]!, loopCounter, scope: { ...iterations[0]!.scope, activation: 8 + loopCounter },
    }));
    while (active.length > 0) {
      const result = retireParallelScopeIteration(owner, active, active.at(-1)!.scope, false);
      assert.ok(result);
      assert.equal(result.controller.total, count);
      assert.equal(result.controller.completed, owner.completed + 1);
      if (active.length === 1) {
        assert.equal(result.kind, ParallelScopeRetirementKind.NaturalCompletion);
        break;
      }
      assert.equal(result.kind, ParallelScopeRetirementKind.Remaining);
      if (result.kind !== ParallelScopeRetirementKind.Remaining) assert.fail("premature parent continuation");
      active = result.iterations;
      owner = result.controller;
    }
  });
}
