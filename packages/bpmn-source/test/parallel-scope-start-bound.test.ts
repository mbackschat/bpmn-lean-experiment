import assert from "node:assert/strict";
import { test } from "node:test";
import { parallelStartBoundCases } from "./parallel-scope-start-bound-fixture.ts";
const owner = await import(new URL("../dist/parallel-scope-start-bound.js", import.meta.url).href) as typeof import("../src/parallel-scope-start-bound.ts");

test("parallel Start closure bound charges the parent once and each admitted body plus retirement", async () => {
  for (const [index, { source, bindings, expected }] of (await parallelStartBoundCases()).entries())
    assert.equal(owner.parallelScopeStartClosureBound(source, bindings) ?? null, expected, `Start bound case ${index}`);
});
