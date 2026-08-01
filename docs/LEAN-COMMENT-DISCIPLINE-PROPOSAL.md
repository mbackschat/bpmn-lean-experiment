# Lean comment discipline proposal

## Status

Owner-approved on 2026-08-01. A read-only external fresh-session review of target `995dfd8` returned **APPROVE WITH REQUIRED EDITS**, and the same reviewer audited correction commit `c882d9c` and closed every required finding. Closure review of implementation target `db7c94c` returned **APPROVE WITH REQUIRED EDITS**; the guard-composition correction and advisory cleanup are committed at `35ae276` and pending same-thread correction audit before this proposal is archived or deleted. External-session isolation remains unattested in the receipt until that audit closes.

## Decision requested

Approve a Lean commenting contract that increases locally available semantic information without targeting comment volume: retain the existing semantic-surplus rule, require module-level contracts, make maintained conformance facts identifiable by name, add comments only at selected semantic and trust boundaries, and reject every density- or coverage-based enforcement mechanism.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `995dfd8` | `external-fresh-session` | `approve-with-required-edits` | `c882d9c` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `db7c94c` | `not-recorded` | `pending` | `not-applicable` |

This proposal does not select BPMN meaning, a profile, a runtime representation, a proof boundary, or a Temporal refinement claim, so no semantic checkpoint is required. The requested proposal review is nevertheless external and read-only because the main risk is a governance rule whose incentives produce worse source.

## Motivation

Lean is both executable source and an assurance artifact in this project. A reader must be able to recover the intended observable behavior, representation invariants, ownership rules, refusal boundaries, proof limits, and realistic wrong alternatives without reconstructing all of them from distant specifications. Names and types carry much of that information, but they cannot always carry why an ordering is observable, why a stronger theorem is false, which identity owns a token or wait, or which wire fact a strict decoder preserves.

The project already states the correct principle in [CLAUDE.md](../CLAUDE.md): comments document semantic surplus, there is no target comment density, and stale or broader-than-evidence comments are defects. The sibling A12 Lean project states materially the same principle. The discrepancy is therefore not primarily a missing philosophy; it is an uneven application of that philosophy and a lack of objective guardrails around the few structural practices that can be checked safely.

Too little explanation has concrete assurance costs. Anonymous conformance facts are difficult to cite in review findings, distinguish in searches, or relate to the owning claim. Central runtime structures expose ownership and lifecycle fields whose joint invariant is not recoverable from their declarations alone. Boundary functions can preserve distinctions such as duplicate-key rejection or committed-state visibility without making that contract obvious at the call site.

Too much explanation has equally concrete costs. Repeated declaration paraphrases conceal the rare comment that carries a real invariant. Quota-driven comments go stale, can sound more authoritative than the proof or evidence warrants, and consume the same source-hygiene budget as code. A rule that rewards comment lines would manufacture boilerplate and make this repository worse.

The goal is therefore higher information density, not higher comment density.

## Evidence and diagnosis

### Reproducible size snapshot

The motivating working-tree measurement used the author's command:

```sh
tokei -t=Java,Kotlin,TypeScript,Lean
```

It reported 56,478 code lines and 1,372 comment lines for this project, compared with 100,386 code lines and 8,591 comment lines for the Lean-only A12 sibling. Those values are 2.43 and 8.56 comment lines per 100 code lines respectively, a 3.52-fold difference. The project measurement came from a changing worktree and is retained only as the trigger for this proposal.

For an immutable comparison, a clean checkout of project commit `cab74e26b1bbbd47467fdc7d13ea5771b44bf9f2` reports 56,705 code lines and 1,375 comment lines across the selected languages. The [registered A12 comparison revision](SOURCES.md#lean-sibling-experiment) at commit `50fdd19f1b349b1a85755e5d105c920a944119ca` reports 100,386 Lean code lines and 8,591 comment lines. The conclusion is unchanged: 2.42 versus 8.56 comment lines per 100 code lines, or approximately 3.53-fold.

The mixed-language comparison is useful as a repository-level signal but is not like-for-like. On the same immutable baselines, this project's Lean sources contain 10,399 code lines and 467 comment lines, or 4.49 comments per 100 code lines. A12 contains 8.56, leaving an approximately 1.91-fold Lean-to-Lean difference. Neither ratio establishes that either codebase has the right amount of documentation.

`tokei` remains a diagnostic instrument under this proposal. Its result must never become a CI threshold, an acceptance criterion, a trend target, or a reason to retain a redundant comment.

### Lexical inventory

The following counts are deliberately lexical and are evidence about source shape, not comment quality:

| Signal | This project's Lean | A12 Lean | Interpretation |
|---|---:|---:|---|
| Files with a module documentation opener | 60 of 60 | 653 of 664 | The project already has broad module-level documentation; missing headers do not explain most of the gap. |
| Declaration documentation openers | 219 | 4,259 | A12 documents public and proof-facing declarations more often; some of the difference is scale and source role. |
| Ordinary block-comment openers | 0 | 1,802 | A12 frequently explains groups of conformance cases and non-obvious proof choices; copying that syntax or count would not copy its information. |
| Anonymous `example` declarations | 95 | 2,926 | Both projects use executable examples heavily. Raw prevalence is not a practice to imitate; maintained project conformance facts need stronger local identity. |

All 95 anonymous examples in this project are concentrated in nine maintained conformance modules, with none under `BpmnSemantics/Experiments/`: 37 in `SemanticProcessConformance.lean`, 15 in `SemanticProcessJsonConformance.lean`, 10 in `Conformance.lean`, 8 in `UserTaskInteractionConformance.lean`, 7 in `ExclusiveGatewaySimpleBooleanConformance.lean`, 6 each in `IntermediateCatchTimerConformance.lean` and `CreateDocumentDataConformance.lean`, 4 in `ServiceTaskEffectConformance.lean`, and 2 in `BoundaryErrorConformance.lean`.

Repository history supplies a stronger independent signal than the A12 ratio: the six newest maintained conformance modules use descriptive named theorems exclusively, while the anonymous examples are confined to nine older modules. The proposed naming rule therefore codifies the convention already used by the current capsule style and backfills the legacy assurance surface; it does not import a foreign documentation practice.

The useful difference in A12 is qualitative. Its additional prose often supplies a declaration contract, a group-level explanation of what a conformance cluster discriminates, an internal-versus-external proof boundary, or the nearest tempting false account. Ordinary loops, tactic sequences, and evident declarations generally remain uncommented. This supports a targeted semantic-surplus correction, not a density backfill.

### Root cause

The current instruction answers when a comment is justified, but the repository has no executable distinction between an identifiable maintained conformance claim and an anonymous scratch example. It also has no guard that preserves the already-achieved module-contract baseline. Review therefore catches comment quality only incidentally, while the easiest numerical response to a low ratio would be the wrong response.

The root invariant is:

> Every durable semantic fact must be locally identifiable, and every retained comment must carry information that would otherwise be lost; neither requirement implies a minimum amount of prose.

## Proposed instruction contract

The existing `Comments — document semantic surplus` section in [CLAUDE.md](../CLAUDE.md) remains authoritative and gains the following Lean-specific rules:

1. Apply a deletion test to every added or materially changed comment: if deleting it loses no contract, invariant, ordering rule, failure distinction, ownership fact, evidence provenance, resource boundary, or realistic false alternative, delete it and improve the name, type, theorem statement, or module structure instead.
2. Never add or retain a comment to satisfy a ratio, coverage count, minimum word count, public-declaration quota, or guard. Never generate comment or docstring stubs.
3. State a shared invariant once at the narrowest module or section that owns it. Do not repeat the same prose on every constructor, field, helper, theorem, or fixture.
4. In maintained conformance modules, give each durable checked fact a descriptive public `theorem` name, matching the convention already used by maintained named conformance facts. Reserve `private theorem` for supporting lemmas that are not themselves durable conformance claims. Use a comment only when the name and proposition still cannot expose a discriminating fixture fact, provenance constraint, proof boundary, or nearest false generalization.
5. Keep routine private helpers, evident structure fields, direct decoder plumbing, and routine tactics uncommented.
6. Count necessary comments against the ordinary 600-nonblank-line review target and 1,000-line ceiling. If sound explanation exposes a cohesion or size problem, split by semantic ownership; do not compress code or delete useful comments to recover the counter.
7. Treat a stale comment, an unresolvable evidence reference, or a claim broader than its theorem or executable evidence as a source defect.

These rules intentionally prefer stronger names and types over prose. They also permit a sparse, self-explanatory module to remain sparse indefinitely.

## Required measures and rationale

| Measure | Required contract | Why it is proportionate | Boilerplate guardrail |
|---|---|---|---|
| Module contracts | Every tracked or non-ignored pending `.lean` source has a `/-! ... -/` module document after its import prelude and before its first declaration. | Purpose, semantic scope, and boundary are high-value facts that no individual declaration owns. All 60 current files already comply, so the guard preserves an achieved baseline without prompting a backfill or silently exempting a future Lean root outside `BpmnSemantics/`. | Check presence and placement only. Do not check words, headings, sentences, or covered declarations. |
| Identifiable conformance facts | Maintained files whose filename is exactly `Conformance.lean` or ends with `Conformance.lean`, outside `BpmnSemantics/Experiments/`, contain no anonymous `example` declaration. Existing durable examples become descriptively named public `theorem`s. Ninety convert one-for-one without proposition or proof changes; the five constructor-specific `CommandOutcome.isCommit` examples become the one exhaustive law specified below. | Names improve diagnostics, search, review citations, and claim-to-evidence mapping without requiring prose. Public visibility matches the repository's established maintained-conformance convention and makes the assurance facts available for search and citation. | The exact root file `BpmnSemantics/Conformance.lean` is in scope; matching must not require a nonempty prefix before `Conformance.lean`. Do not require a docstring or inline comment on the named theorem, and do not ban `example` in frozen experiments or temporary local exploration outside the maintained conformance surface. |
| Targeted surplus backfill | Add or strengthen comments only at the selected representation, evaluator, strict-decoding, cross-artifact, and discriminating-conformance boundaries listed below. | These are the locations where material facts are not recoverable locally from names and types. | Every proposed comment must pass the deletion test. A reviewer may reject any individual comment without replacing it. |
| Ownership-preserving splits | Make room in the two near-target modules by extracting cohesive owners rather than compressing code or adding a line-count exception. | Necessary explanation should not force a file beyond the established hygiene target, and the current files already expose independent responsibilities. | Split by role and independent buildability, never into equal chunks, include chains, a universal helper bag, or a new harness. |
| Objective self-tests | Keep general source hygiene in `scripts/source-hygiene.test.ts`; put Lean module-document and conformance-naming policy in `scripts/lean-source-contracts.test.ts`, backed by a shared maintained-Lean discovery and literal-aware source-analysis module. Run both test modules through the existing `check:source-hygiene` script. | This preserves one public gate while preventing the current 445-nonblank-line general test owner from absorbing two scanners and their adversarial fixtures. | Include a sparse-but-valid fixture that must pass, making a future density or declaration-coverage rule an explicit test regression. Measure every resulting hand-written TypeScript owner at or below 600 nonblank lines. |
| Ratio reporting | Preserve the one-line `tokei` command for occasional manual diagnosis. | It makes gross source-shape changes visible and reproduces the observation that opened this proposal. | No package script, CI gate, badge, trend objective, or pass/fail threshold is added. |

## Targeted source corrections

This proposal does not authorize a repository-wide comment pass. If approved, the initial correction is limited to the following source roles. Targeted correction includes deleting or shortening an existing comment that fails the same deletion test; “backfill” never means additive-only editing.

### Maintained conformance modules

Replace the 95 anonymous examples with descriptive public theorem coverage. Convert 90 examples one-for-one, preserving each proposition and proof except for syntax required to supply a name. The name should state the discriminating result, such as well-formed acceptance, exact lowering, mismatch refusal, canonical ordering, or the rejected count-based join account; it should not encode chronology or a test number.

Do not manufacture five mechanical names for the five one-line `CommandOutcome.isCommit` constructor checks in `BpmnSemantics/Conformance.lean`. Replace that enumeration with one public exhaustive law whose cases entail all five existing claims:

```lean
namespace CommandOutcome

theorem isCommit_iff_committed (outcome : CommandOutcome) :
    outcome.isCommit = true ↔ outcome = .committed := by
  cases outcome <;> decide

end CommandOutcome
```

This is the only approved proposition strengthening in the correction. It replaces a constructor table with the stable semantic statement that table expresses; it does not change `CommandOutcome` or runtime behavior.

Use a short section comment only where several facts share hidden context that their theorem names and propositions cannot carry. The likely high-value clusters are closure-fuel exhaustion, synthetic stranded states, reverse execution orders, strict JSON lexical counterexamples, and the count-based join false account. Routine `by decide`, equality, and constructor checks receive names but no prose.

The three User Task interaction examples that discharge existing capsule rows receive the exact names `successful_scenario_trace_is_exact`, `waiting_projection_is_independent_of_next_command`, and `stale_completion_is_rejected_without_reactivation`. Facts discharged with `native_decide` remain finite executable evidence locks whose public names support diagnostics and evidence citation; they are not reusable semantic lemmas, and production proofs must not depend on them merely because conversion makes them public.

### Runtime representation

Strengthen `BpmnSemantics/SemanticProcess/RuntimeState.lean` with one representation-invariant section near `RuntimeState`, not a docstring on every small structure. It should explain occurrence ownership, monotonic activation counters, the ownership relation among scope occurrences, tokens, and waits, and the removal obligations of interruption and scope completion. Public operations need individual documentation only where they establish or preserve one of those non-obvious invariants.

### External execution

Document `StimulusResult` and `applyStimulus` in `BpmnSemantics/SemanticProcess/Execution.lean`. The contract must distinguish semantic command outcomes from closure-bound and ambiguous-choice harness failures, state when internal closure runs, and state that refusal paths do not expose speculative state. Obvious singleton fixture constructors and routine pattern-match arms remain undocumented.

### Strict JSON and artifact admission

Document the public `parse` boundary in `BpmnSemantics/StrictJson.lean`: exact duplicate decoded keys and unpaired Unicode surrogates are rejected, and the entire input must be consumed. Do not narrate the private recursive parser.

Document only the public scenario, checked-process, program, definition-input, and cross-artifact validation boundaries currently collected in `BpmnSemantics/SemanticProcessJson.lean`. The useful surplus is strict current-shape admission, required-versus-null behavior, independent structural validation, canonical-lowering equality, and the remaining claim boundary. Private field decoders do not receive repetitive docstrings.

Document the public run/support boundary in `BpmnSemantics/SemanticProcess/Scenario.lean`. `supportsScenario` must state that it admits only the scenario document kind, a structurally and profile-capability-valid program whose profile and source identity match the scenario, and exactly the required observation list. `runScenarioWithClosureLimit` must state that the caller-supplied closure limit is a bounded harness control and that failed support admission returns the unsupported deployment result. `runScenario` requires no docstring because its one-line body already exposes its role as the entry point using `scenarioClosureLimit`. Review the existing `observeStableState` docstring under the deletion test rather than treating it as a quality exemplar; retain it only for information not recoverable from the `Option` result and control-flow arms. Routine projection helpers whose contracts are evident remain undocumented. Delete the trailing `Exact bounded definitions and separating witnesses` section header because it owns no content.

### Near-target module ownership

At the immutable project baseline, `BpmnSemantics/SemanticProcess/Lowering.lean` contains 592 nonblank lines and `BpmnSemantics/SemanticProcessJson.lean` contains 585. Comments continue to count toward the 600-line target.

`Lowering.lean` currently owns canonical lowering and preservation laws, checked-source structural validation, Semantic Process IL program validation, and cross-representation binding validation. Keep canonical lowering and its preservation laws in `Lowering.lean`. Move the three representation-shared identity and canonical-order predicates—nonempty string, lowercase hexadecimal SHA-256, and strictly sorted strings—to `DefinitionArtifactInvariants.lean`; both admission owners import that exact narrow module, which contains no node, operation, profile, or graph rule. Move `checkedWellFormed` and its checked-source-specific helpers to `CheckedProcessAdmission.lean`; it composes identity, ownership, arity, profile capability, and the topology predicate already owned by `CheckedGraphValidation.lean`. Move `programWellFormed` and its IL-specific helpers to `ProgramStructuralValidation.lean`; it composes definition, place, operation, and initiation checks with `programGraphWellFormed`, while `GraphValidation.lean` remains the topology/search owner. Move `definitionBindingValid` to `DefinitionBindingValidation.lean`, which imports both independent admission owners and `Lowering.lean`; its single responsibility is the conjunction of independent admission, program profile capability, and exact canonical-lowering equality. Update direct importers atomically and keep every narrow owner independently buildable.

The separate binding owner is justified despite the predicate's current seven-line body: the predicate consumes both representations and canonical lowering, while neither representation-specific validator should acquire dependencies on the other side. Folding it into `ProgramStructuralValidation.lean` would make the IL validator own checked-source admission and lowering; keeping it cross-artifact preserves both dependency direction and a narrow public contract.

Split `SemanticProcessJson.lean` three ways rather than forcing checked-process and program decoding apart: `SemanticProcessJson/Scenario.lean` owns scenario decoding, `SemanticProcessJson/Definitions.lean` owns both checked-process and Semantic Process program decoding, and `SemanticProcessJson/DefinitionInput.lean` owns cross-artifact input decoding and admission. The combined definition-decoder owner retains `decodeVariableMapping`, `decodeEffectDescriptor`, and `decodeErrorReference`, which are shared semantic-element wire decoders used by both representations; they are neither duplicated nor moved into the wire-primitive `JsonSupport.lean`. Preserve `BpmnSemantics.SemanticProcessJson` as an import-only umbrella over those three owners; the umbrella contains no declarations or fixtures and is added to the explicit `leanUmbrellaModules` set so that property remains executable.

The necessary import-only edit to frozen `Experiments/CheckedSourceRelation.lean` is permitted: it may import the new admission owners alongside `Lowering.lean` so its unchanged definitions and proofs continue to resolve. This mechanical dependency update does not reopen, backfill, or broaden the experiment.

These extractions are not comment-placement tricks. They address already-visible responsibility boundaries and prevent useful documentation from competing with the source-size gate. `RuntimeState.lean` remains cohesive unless the implementation review identifies a separate independently buildable owner; this proposal does not split it speculatively.

## Executable guard design

Keep [`scripts/source-hygiene.test.ts`](../scripts/source-hygiene.test.ts) as the owner of file-size, import-only umbrella, JavaScript, build-output, and erasable-syntax policy. It is already 445 nonblank lines and does not absorb the new Lean policy tests.

Add `scripts/lean-source-contracts.test.ts` as the owner of module-document placement and named maintained-conformance facts. Add `scripts/lean-source-analysis.ts` as the shared owner of maintained Lean worktree discovery and lexical analysis. Its discovery function enumerates tracked and non-ignored pending Lean sources. Its scanner distinguishes code, line comments, nested block comments, string literals, and exact character-literal tokens, honors escapes, and preserves newline positions so diagnostics remain exact. A character literal is entered only after complete lookahead recognizes `'`, one Unicode source character or one valid Lean escape sequence, and its closing `'`; an unmatched apostrophe or identifier prime remains code. Comment state is recognized first and dominates both literal states, so apostrophes and quotes inside comments cannot open a literal. In particular, `--`, `/-`, and `-/` inside literals are data, never comment delimiters. The general source-hygiene owner retains its generic multi-language worktree enumeration and uses the shared scanner for import-only Lean umbrellas; the Lean-contract owner imports the dedicated Lean discovery function rather than duplicating enumeration.

Expose one composed `leanSourceViolations` assessment and use it for both the live worktree and every whole-policy fixture. The assessment reports two objective violation classes with file and line information:

- a tracked or non-ignored pending Lean module whose first module document is absent or occurs after the first declaration;
- an anonymous top-level `example` in a maintained non-experimental conformance module after comments and literals are classified, including indented declarations, inline attributes, and parenthesized binders.

The assessment does not count total comments, declaration docstrings, words, paragraphs, documentation percentage, or identifiers. It does not attempt to score prose quality. Those properties are either misleading incentives or require semantic review.

The Lean source-contract self-tests must cover:

- rejection of a declaration-bearing module without a module document;
- acceptance of imports followed by a module document and declarations;
- rejection of a module document placed only after the first declaration;
- acceptance of an import-only umbrella with its module document;
- rejection of a real anonymous conformance `example` with its exact path and line, including the exact `Conformance.lean` basename;
- ignoring `example` text inside line comments and nested block comments;
- acceptance of a descriptively named public `theorem`, including a preceding attribute;
- exclusion of `BpmnSemantics/Experiments/` from the anonymous-example rule;
- inclusion of a non-ignored pending Lean file before commit;
- preservation of `--`, `/-`, and `-/` inside string literals, including escaped quotes and backslashes, without false comment stripping or an unterminated-comment failure;
- acceptance of a primed identifier in code without entering character-literal state;
- acceptance of `'"'`, `'\''`, and an escaped control character such as `'\x08'` as complete character literals without opening a string or treating the closing apostrophe as an identifier prime;
- ignoring an apostrophe and a double quote inside both a declaration docstring and a line comment, proving that comment state dominates literal recognition;
- acceptance of a deliberately ratio-discriminating sparse module with exactly one single-line module document, at least 30 nonblank lines of several named declarations, and no declaration docstrings or inline comments.

The last fixture is an executable anti-boilerplate guardrail. Its comment-to-code ratio is at most 3.34 per 100, below the immutable project Lean baseline of 4.49, so any minimum ratio at or above that baseline rejects it; its undocumented named declarations separately make a blanket declaration-documentation rule reject it. Either policy change must therefore alter an explicit owner-visible regression test.

No new package-script key is required. Update the existing `check:source-hygiene` command to invoke both `scripts/source-hygiene.test.ts` and `scripts/lean-source-contracts.test.ts`; the complete verification entry point remains unchanged. The implementation acceptance review measures the general test owner, the Lean-contract test owner, and the shared Lean analysis owner independently and rejects any hand-written TypeScript file above the 600-line review target.

The anonymous-`example` rule deliberately uses the maintained `*Conformance.lean` filename contract. It does not mechanically prevent a future durable fact from being placed anonymously in `Fixtures.lean` or a future `*Laws.lean`; that residual is accepted because broadening the syntax ban to every maintained Lean module would also ban useful local executable examples unrelated to the assurance surface. Human review must move a durable conformance fact into its owning conformance module or give it a name. A repeated escape through another role is evidence for a separately reviewed role-based extension, not permission to add a blanket declaration rule now.

## Human review guardrail

Automation cannot decide whether a comment contains semantic surplus. Review every added or materially changed comment with this compact test:

1. What exact information is lost if this comment is deleted?
2. Could a better name, type, theorem statement, module boundary, or section heading carry that information more reliably?
3. Is the retained claim stable, owned here, and no broader than its theorem, specification, or executable evidence?
4. Does one shared section or module comment already state it?
5. Would a future maintainer know when the comment has become false?
6. Does this section or header still own the content it announces?

If question 1 has no concrete answer, delete the comment. If question 2 is yes, improve the source and omit the comment. If questions 3 through 6 cannot be answered, narrow or delete the comment, or move the fact to its proper documentation owner.

## Required, optional, and excluded scope

### Required if approved

- Add the instruction contract to [CLAUDE.md](../CLAUDE.md) without duplicating the entire proposal.
- Add the separate Lean source-contract test owner, share maintained-Lean discovery and literal-aware scanning through the focused analysis owner, and join both tests to the existing gate.
- Remove anonymous examples from the maintained non-experimental conformance surface.
- Apply only the targeted semantic-surplus corrections described above.
- Resolve the two near-target module ownership issues before adding prose that would breach the source-hygiene target.
- Update the Lean evidence cells for `UTASK-DISCOVER-01` and `UTASK-REFUSE-02` in [USER-TASK-INTERACTION-SPEC.md](capsules/USER-TASK-INTERACTION-SPEC.md): cite the three new checked theorem names specified above rather than `waitingObservation`, `expectedStaleCompletionTrace`, or another fixture definition.
- Update [TESTING-SPEC.md](TESTING-SPEC.md), [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md), and [PLAN.md](PLAN.md) when the guard and source correction are implemented; update the [documentation registry](README.md) atomically when the proposal is archived or deleted at closure.
- Treat the implementation as a bounded enabling increment: record its clean implementation baseline and reviewed closure commit in [CAPSULE-COST-LEDGER.md](CAPSULE-COST-LEDGER.md), and compare its code and documentation churn with the nearest source-hygiene increment.

### Optional and non-gating

- Record a fresh `tokei -t=Java,Kotlin,TypeScript,Lean` snapshot during a later policy review when it helps diagnose a large source-shape change.
- Add more comments outside the targeted modules only when an ordinary code review independently identifies a concrete semantic-surplus need.

### Excluded

- Any comment-density, comments-per-code-line, or documentation-coverage target.
- A docstring requirement for every public or private declaration.
- Minimum words, sentences, examples, references, or headings in a comment.
- Generated comment stubs, copied templates, placeholder prose, or an undocumented-declaration baseline manifest.
- Comments that narrate routine tactics, pattern matches, field extraction, loops, or private decoder plumbing.
- Changing BPMN meaning, runtime behavior, wire contracts, evidence claims, or theorem propositions and proof strength beyond the explicitly scoped exhaustive `CommandOutcome.isCommit` law.
- Reopening or backfilling frozen experiments; the explicitly permitted import-only update needed to preserve an existing frozen build is not a reopening.
- Copying A12 comments or source; the sibling remains a comparative research input only.
- Adding a heuristic stale-citation scanner in this increment. Stable references remain review obligations unless a later repeated defect justifies a separately designed guard.

## Verification and acceptance

The proposal is ready for owner decision only after an external reviewer checks the committed proposal target and either approves it or all required findings are audited closed in the same reviewer thread.

An approved implementation is complete only when:

- the source-hygiene scanner self-tests fail before the guard exists and pass after it exists;
- the live guard reports no module-document presence or placement violation and no anonymous example in its exact filename scope; module-document content remains a human review obligation;
- all 95 existing anonymous conformance claims remain covered by public named theorems: 90 one-for-one facts plus the one exhaustive `CommandOutcome.isCommit` law that entails the five replaced constructor checks, with no other proposition or proof change;
- each added comment passes the deletion test and no blanket declaration backfill appears;
- the Lowering and JSON responsibilities are independently buildable at their narrow owners and no hand-written source crosses the 600-line review target through comment deletion or line compression;
- the two User Task capsule evidence rows cite checked named facts rather than fixture data, and the enabling increment has a reproducible cost-ledger row;
- `./scripts/pnpm.sh run check:source-hygiene`, `lake test`, the documentation/infrastructure gate, `./scripts/verify.sh`, and `git diff --check` pass;
- any `tokei` result is reported as diagnostic context only and no threshold exists in source, package scripts, or CI;
- the implementation changes no semantic output, wire artifact, or public evidence claim, and changes no theorem proposition except for the approved `CommandOutcome.isCommit` consolidation;
- after implementation and the required closure review, the stable instruction and gate contracts remain in `CLAUDE.md` and `TESTING-SPEC.md`, and this proposal is archived or deleted with registry and inbound-link updates rather than graduated into a redundant standalone `-SPEC.md`.

## Implementation closure account

The implementation establishes two machine-checkable structural claims and no prose-quality score: every tracked or non-ignored pending Lean source has a module document in the required position, and every maintained non-experimental file whose basename is exactly or ends in `Conformance.lean` has no anonymous top-level `example`. One exported assessment composes every rule for both the live worktree and the sparse-valid conformance fixture. The 95 prior anonymous facts remain as 90 proposition-preserving public theorems plus the exhaustive `CommandOutcome.isCommit` law; the two User Task capsule rows cite the resulting named facts. The source splits preserve narrow checked-process admission, Semantic Process structural validation, cross-artifact binding, and JSON role owners without creating a 600-line exception.

The targeted comment correction adds one shared runtime representation invariant and documents only the selected execution, strict-JSON, artifact-admission, and scenario support/run boundaries. It also deletes the redundant `observeStableState` docstring and the trailing header that owned no content. No comment density, declaration coverage, word count, or generated stub enters source, scripts, package commands, or CI. No wire artifact, evaluator result, profile, evidence claim, or public observation changes; the exhaustive `CommandOutcome.isCommit` statement is the only changed theorem proposition authorized by this proposal.

The nearest unsupported claim is that passing the guard proves a comment or theorem name is informative. It proves only placement and naming structure; semantic surplus, truth, durability, and the accepted filename-scope escape remain human review obligations. The scanner is deliberately a focused literal-aware classifier rather than a complete Lean parser, so an unanticipated lexical form is another residual risk. The principal common-mode risk is that the implementation author and closure reviewer read the same names, comments, and source structure as adequate even though no independent instrument can measure recoverable information. The sparse-valid fixture, exact literal fixtures, deletion test, and external closure review are the bounded defenses; none is evidence for a target comment ratio.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Descriptive theorem names become a different form of boilerplate. | Restrict the rule to durable conformance modules, require names to state the result rather than a sequence number, and require no associated prose. External review should reject meaningless renames such as `example1`. |
| The lexical guard reports commented or quoted text. | Replace the comment-only stripper with shared literal-aware Lean lexical analysis; recognize character literals only by complete token lookahead, keep identifier primes as code, make comment state dominant, and lock the current strict-JSON and apostrophe cases with self-tests. |
| Added comments push cohesive modules over the size target. | Count comments normally and split the two already near-target multi-role modules by ownership before backfill. Do not add exceptions or compress source. |
| The new guard makes its own TypeScript owner exceed the source-hygiene target. | Keep general hygiene and Lean contracts in separate test owners, share only focused Lean discovery and lexical analysis, and require every resulting file to remain at or below 600 nonblank lines. |
| Filename scope lets a durable anonymous fact escape into another module role. | Accept the narrow residual explicitly, require human review to move or name such facts, and extend the guard only after evidence of a repeated role escape. |
| Comments become a shadow specification. | Limit source comments to local contract and invariant surplus, link stable project owners when provenance matters, and keep implementation status and chronology out of source. |
| A ratio is mistaken for proof of improvement. | Keep `tokei` manual and non-gating; acceptance checks named facts, selected boundaries, scanner behavior, and semantic stability instead. |
| The correction silently changes semantics while renaming or splitting. | Preserve propositions and proof bodies, build the narrow modules, run `lake test` and the complete gate, and treat any semantic change as a separate proposal. |

## External review contract

The external reviewer should work read-only against the committed proposal target and read this proposal, the comment and Lean hygiene sections of [CLAUDE.md](../CLAUDE.md), the source-hygiene and independent-review sections of [TESTING-SPEC.md](TESTING-SPEC.md), [DOC-DISCIPLINE.md](DOC-DISCIPLINE.md), [`scripts/source-hygiene.test.ts`](../scripts/source-hygiene.test.ts), and the Lean modules named under targeted source corrections.

The review should answer:

1. Does every automated rule test an objective structural fact rather than an unverifiable notion of comment quality?
2. Does the ratio-discriminating sparse-valid self-test adequately prevent density and blanket-docstring enforcement from entering accidentally?
3. Does public `theorem` visibility match the maintained conformance convention, and does the one exhaustive `CommandOutcome.isCommit` law avoid both boilerplate names and unjustified strengthening?
4. Are the selected comment backfills, including the `Scenario.lean` run/support boundary, limited to information not recoverable from names, types, theorem statements, and control flow?
5. Do the shared artifact predicates, checked-process admission, IL program validation, cross-artifact binding, and combined definition-decoder roles have explicit cohesive owners rather than a helper bag or line-balanced files, while preserving the existing graph-topology owners and dependency direction?
6. Is the guard split itself cohesive and below the source-size target, and does exact character-token lookahead keep identifier primes and comment-contained apostrophes or quotes from creating false findings in strict-JSON and other Lean sources?
7. Is the accepted filename-scope residual narrower and safer than a repository-wide anonymous-example ban?
8. Do any instructions encourage copied, stale, broader-than-evidence, or status-bearing comments?
9. Is any required measure missing, disproportionate, or better expressed as a human review rule than a machine guard?

Use the verdict and finding format in [the independent cold-review gate](TESTING-SPEC.md#independent-cold-review-gate). In particular, classify any boilerplate incentive as a required finding rather than an advisory style preference.
