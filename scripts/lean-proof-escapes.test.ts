import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeLeanSource,
  worktreeLeanSourceFiles,
} from "./lean-source-analysis.ts";
import { readWorktreeSources } from "./worktree-source-read.ts";

/**
 * AA-17 oracle: maintained Lean carries no proof escape and declares no axiom of its own.
 *
 * Lean reports `sorry` as a warning, so a build with a `sorry` or `admit` stays green, and an
 * `axiom` declaration silently widens every dependent theorem's footprint. The sibling ratchet in
 * [Lean source contracts](lean-source-contracts.test.ts) already records `native_decide` sites
 * exactly; this guard has no recorded exceptions because no maintained site exists. Provisional
 * `BpmnSemantics/Experiments/` keep their separate gate and are not scanned.
 */
export type ProofEscape = Readonly<{ line: number; token: string }>;

const identifierCharacter = String.raw`[\p{L}\p{N}_'!?]`;
const proofEscapeToken = new RegExp(
  String.raw`(?<!${identifierCharacter}|\.)(sorryAx|sorry|admit|axiom)(?!${identifierCharacter})`,
  "gu",
);

/** Maintained sources: `BpmnSemantics/**` outside the experiments, plus root Lean entry points. */
export function isMaintainedLeanPath(sourcePath: string): boolean {
  return sourcePath.includes("/")
    ? sourcePath.startsWith("BpmnSemantics/") && !sourcePath.startsWith("BpmnSemantics/Experiments/")
    : sourcePath.endsWith(".lean");
}

/**
 * Proof-escape and axiom tokens in code position. Comments and string literals are masked by the
 * shared Lean analysis, so prose such as "no sorry remains" and `#print axioms` (a different token)
 * create no finding.
 */
export function proofEscapes(source: string): ReadonlyArray<ProofEscape> {
  return analyzeLeanSource(source).code.split(/\r?\n/u).flatMap((line, index) =>
    [...line.matchAll(proofEscapeToken)].map((match) => ({ line: index + 1, token: match[1] ?? "" })));
}

test("seeded proof escapes and axiom declarations are reported with their line", () => {
  const source = [
    "theorem a : True := by sorry",
    "theorem b : True := by\n  admit",
    "axiom c : False",
    "private axiom d : 1 = 2",
    "@[simp] noncomputable axiom e : Nat",
    "theorem f : True := sorryAx _ false",
    "theorem g : True := by simp <;> sorry",
  ].join("\n");
  assert.deepEqual(proofEscapes(source), [
    { line: 1, token: "sorry" },
    { line: 3, token: "admit" },
    { line: 4, token: "axiom" },
    { line: 5, token: "axiom" },
    { line: 6, token: "axiom" },
    { line: 7, token: "sorryAx" },
    { line: 8, token: "sorry" },
  ]);
});

test("comments, strings, longer identifiers and axiom queries create no finding", () => {
  const source = [
    "-- no sorry and no admit here",
    "/- nested /- axiom -/ sorry -/",
    "/-- A docstring that mentions `sorry`, admit and axiom. -/",
    'def message := "sorry, admit, axiom"',
    "#print axioms foo",
    "theorem h : True := by exact Foo.sorry",
    "theorem i : True := sorry_free_lemma",
    "theorem j : True := admits_nothing",
    "theorem k : True := axiomatic_form",
    "theorem α_sorry : True := trivial",
  ].join("\n");
  assert.deepEqual(proofEscapes(source), []);
});

test("maintained scope covers the library and root entry points and excludes experiments", () => {
  for (const maintained of [
    "BpmnSemantics.lean",
    "BpmnSemantics/Contract.lean",
    "BpmnSemantics/SemanticProcess/Execution.lean",
  ]) assert.equal(isMaintainedLeanPath(maintained), true, maintained);
  for (const provisional of [
    "BpmnSemantics/Experiments/CheckedSourceAdmission.lean",
    "adoption/a12/legacy/source-tree/BpmnSemantics/Data.lean",
  ]) assert.equal(isMaintainedLeanPath(provisional), false, provisional);
});

test("maintained Lean contains no sorry, admit or project axiom", () => {
  const findings = readWorktreeSources(worktreeLeanSourceFiles().filter(isMaintainedLeanPath))
    .flatMap(({ path, source }) =>
      proofEscapes(source).map(({ line, token }) => `${path}:${line} ${token}`));
  assert.deepEqual(
    findings,
    [],
    "an escape hatch keeps the build green while the theorem proves nothing",
  );
});
