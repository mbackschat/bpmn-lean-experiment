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
 * `axiom` declaration silently widens every dependent theorem's footprint. Guard 6 of the kernel
 * rewrite proposal rejects `native_decide` in the kernel; this guard has no recorded exceptions
 * because no maintained site exists. Lean outside the kernel (the scan scripts, the retained A12
 * legacy tree) is not maintained proof and is not scanned.
 */
export type ProofEscape = Readonly<{ line: number; token: string }>;

const identifierCharacter = String.raw`[\p{L}\p{N}_'!?]`;
// A name a declaration binds is an identifier, not the tactic: the kernel's admission entry point is `def admit`.
const proofEscapeToken = new RegExp(
  String.raw`(?<!${identifierCharacter}|\.|\b(?:def|abbrev|opaque|theorem)\s+)(sorryAx|sorry|admit|axiom)(?!${identifierCharacter})`,
  "gu",
);

/** Maintained sources: `Kernel/**`, plus root Lean entry points. */
export function isMaintainedLeanPath(sourcePath: string): boolean {
  return sourcePath.includes("/")
    ? sourcePath.startsWith("Kernel/")
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
    "def admitted : True := by admit",
  ].join("\n");
  assert.deepEqual(proofEscapes(source), [
    { line: 1, token: "sorry" },
    { line: 3, token: "admit" },
    { line: 4, token: "axiom" },
    { line: 5, token: "axiom" },
    { line: 6, token: "axiom" },
    { line: 7, token: "sorryAx" },
    { line: 8, token: "sorry" },
    { line: 9, token: "admit" },
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
    "def admit (program : Nat) : Option String := none",
  ].join("\n");
  assert.deepEqual(proofEscapes(source), []);
});

test("maintained scope covers the kernel and root entry points and excludes other Lean", () => {
  for (const maintained of [
    "Kernel.lean",
    "Kernel/Step.lean",
    "Kernel/Proofs/Step.lean",
  ]) assert.equal(isMaintainedLeanPath(maintained), true, maintained);
  for (const outside of [
    "scripts/kernel-dispatch.lean",
    "adoption/a12/legacy/source-tree/BpmnSemantics/Data.lean",
  ]) assert.equal(isMaintainedLeanPath(outside), false, outside);
});

test("maintained Lean contains no sorry, admit or project axiom", () => {
  const maintained = worktreeLeanSourceFiles().filter(isMaintainedLeanPath);
  // A renamed kernel root would empty the scan; it must fail rather than pass on nothing (guard 23).
  assert.ok(maintained.includes("Kernel/Step.lean"), `maintained Lean enumeration missed the kernel: ${maintained.length}`);
  const findings = readWorktreeSources(maintained)
    .flatMap(({ path, source }) =>
      proofEscapes(source).map(({ line, token }) => `${path}:${line} ${token}`));
  assert.deepEqual(
    findings,
    [],
    "an escape hatch keeps the build green while the theorem proves nothing",
  );
});
