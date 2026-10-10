import assert from "node:assert/strict";
import test from "node:test";
import { leanSelfComparisons } from "./lean-source-analysis.ts";

test("self-comparison scan separates candidate aliases from independent fixtures", () => {
  const fixture = { path: "Fixtures.lean", source: "namespace Fixture\ndef expected : Program := lowerCheckedProcess checked\nend Fixture\n" };
  const theorem = { path: "Conformance.lean", source: "namespace Evidence\nopen Fixture\ntheorem exact_lowering : lowerCheckedProcess\n checked = expected := by rfl\nend Evidence\n" };
  assert.deepEqual(leanSelfComparisons([fixture, theorem]), [
    { path: "Conformance.lean", line: 3, theorem: "exact_lowering", alias: "expected" },
  ]);
  assert.deepEqual(leanSelfComparisons([
    { ...fixture, source: fixture.source.replace("lowerCheckedProcess checked", "{ operations := [] }") }, theorem,
  ]), []);
  assert.deepEqual(leanSelfComparisons([fixture, {
    ...theorem, source: theorem.source.replace("lowerCheckedProcess\n checked", "lowerCheckedProcess other"),
  }]), []);
});

test("self-comparison scan masks comments and literals and resolves visible namespaces", () => {
  const fixture = { path: "Fixture.lean", source: "namespace Unopened\ndef expected : Nat := candidate input\nend Unopened\n" };
  const source = String.raw`/- theorem fake : candidate input = expected := by rfl -/
-- def expected : Nat := candidate input
def text := "theorem fake : candidate input = expected := by rfl"
theorem unrelated : candidate input = expected := by assumption
def withLiteral : Nat := candidate "left"
theorem distinctLiteral : candidate "right" = withLiteral := by assumption
`;
  assert.deepEqual(leanSelfComparisons([fixture, { path: "Masked.lean", source }]), []);
  assert.equal(leanSelfComparisons([fixture, {
    path: "Qualified.lean", source: "theorem qualified : candidate input = Unopened.expected := by rfl\n",
  }]).length, 1);
});

test("quoted comments cannot hide a true self-comparison", () => {
  const source = "def expected : Nat := candidate input -- independently \"expected\"\ntheorem exact : candidate input = expected := by rfl\n";
  assert.equal(leanSelfComparisons([{ path: "QuotedComment.lean", source }]).length, 1);
});

test("section ends retain the enclosing namespace and unqualified ends close it", () => {
  const source = "namespace Fixture\nsection Local\ndef expected : Nat := candidate input\nend Local\ntheorem inside : candidate input = expected := by rfl\nend\ntheorem outside : candidate input = expected := by assumption\n";
  assert.deepEqual(leanSelfComparisons([{ path: "Scopes.lean", source }]), [
    { path: "Scopes.lean", line: 5, theorem: "inside", alias: "expected" },
  ]);
});
