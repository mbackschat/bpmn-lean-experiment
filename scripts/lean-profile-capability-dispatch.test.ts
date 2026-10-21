/**
 * Locks the single rewrite point of `programProfileCapabilitiesValid` (Finding 79 in
 * docs/PROCESS-ASSESSMENT-LEDGER.md). A proof that unfolds the dispatch must refute every earlier
 * branch condition, so each new profile branch broke every such proof and was repaired per site;
 * `programProfileCapabilitiesValid_of_undispatched` in its proof owner is now the only place a branch
 * is walked. The oracle is the masked Lean code, so prose and string literals naming the definition
 * do not count.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { analyzeLeanSource, worktreeLeanSourceFiles } from "./lean-source-analysis.ts";
import { readWorktreeSources } from "./worktree-source-read.ts";

const dispatchOwner = "BpmnSemantics/SemanticProcess/ProfileAdmission.lean";

// The generated equation lemmas (`.eq_1`, `.eq_def`) unfold the dispatch as surely as its name.
const dispatchName = String.raw`\bprogramProfileCapabilitiesValid(?:\.eq_(?:def|\d+))?(?![\w.'])`;
// A bracketed tactic list may span lines; `[^\]]` lets the match continue across them. Aesop takes
// its unfolding rules in a parenthesised clause rather than a list.
const unfoldingTactic = new RegExp(
  String.raw`\b(?:unfold|delta)\b[^\n]*${dispatchName}|` +
    String.raw`\baesop\b[^\n]*${dispatchName}|` +
    String.raw`\b(?:simp|simp_all|simpa|dsimp|simp_rw|rw|rewrite|erw|grind|norm_num)\b[^\[\n]*\[[^\]]*${dispatchName}`,
  "gu",
);

export function dispatchUnfoldingLines(source: string): number[] {
  const code = analyzeLeanSource(source).code;
  return [...code.matchAll(unfoldingTactic)].map(({ index }) => code.slice(0, index).split("\n").length);
}

test("only the dispatch owner unfolds programProfileCapabilitiesValid", () => {
  const offenders = readWorktreeSources(worktreeLeanSourceFiles())
    .filter(({ path }) => path !== dispatchOwner)
    .flatMap(({ path, source }) => dispatchUnfoldingLines(source).map(line => `${path}:${line}`));
  assert.deepEqual(
    offenders,
    [],
    "rewrite with programProfileCapabilitiesValid_of_undispatched instead of walking the profile dispatch",
  );
});

test("the dispatch scan finds tactic unfoldings and ignores the lemma, prose and hypotheses", () => {
  assert.deepEqual(dispatchUnfoldingLines("  unfold programProfileCapabilitiesValid"), [1]);
  assert.deepEqual(dispatchUnfoldingLines("  simp only [a,\n    programProfileCapabilitiesValid, b] at h"), [1]);
  assert.deepEqual(dispatchUnfoldingLines("  rw [programProfileCapabilitiesValid_of_undispatched p u] at h"), []);
  assert.deepEqual(dispatchUnfoldingLines("/-- Never unfold programProfileCapabilitiesValid. -/"), []);
  assert.deepEqual(dispatchUnfoldingLines("    (capabilities : programProfileCapabilitiesValid program = true) :"), []);
});

test("the dispatch scan covers equation lemmas and the automation tactics that take unfolding lemmas", () => {
  for (const tactic of [
    "  rw [programProfileCapabilitiesValid.eq_1] at h",
    "  simp only [programProfileCapabilitiesValid.eq_def] at h",
    "  grind [programProfileCapabilitiesValid]",
    "  norm_num [programProfileCapabilitiesValid] at h",
    "  aesop (add norm programProfileCapabilitiesValid)",
  ]) {
    assert.deepEqual(dispatchUnfoldingLines(tactic), [1], tactic);
  }
  assert.deepEqual(dispatchUnfoldingLines("  grind [programProfileCapabilitiesValid_of_undispatched]"), []);
  assert.deepEqual(dispatchUnfoldingLines("  aesop"), []);
});
