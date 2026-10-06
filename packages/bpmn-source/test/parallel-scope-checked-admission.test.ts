import assert from "node:assert/strict";
import { test } from "node:test";
import { parallelAdmissionCases } from "./parallel-scope-admission-fixture.ts";
const compiler = await import(new URL("../dist/multi-instance-scope-source-compiler.js", import.meta.url).href) as typeof import("../src/multi-instance-scope-source-compiler.ts");

test("private checked parallel admission rejects malformed ownership and data independently of parsing", async () => {
  assert.equal(typeof compiler.parallelScopeCheckedSourceAdmitted, "function");
  for (const [index, { source, expected }] of (await parallelAdmissionCases()).entries())
    assert.equal(compiler.parallelScopeCheckedSourceAdmitted(source), expected, `admission case ${index}`);
});
