# Lean comment discipline proposal

## Status

Draft. External review is requested. This proposal is not owner-approved and authorizes no source, instruction, or gate changes.

## Decision requested

Approve a Lean commenting contract that increases locally available semantic information without targeting comment volume: retain the existing semantic-surplus rule, require module-level contracts, make maintained conformance facts identifiable by name, add comments only at selected semantic and trust boundaries, and reject every density- or coverage-based enforcement mechanism.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

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
4. In maintained conformance modules, give each durable checked fact a descriptive private theorem name. Use a comment only when the name and proposition still cannot expose a discriminating fixture fact, provenance constraint, proof boundary, or nearest false generalization.
5. Keep routine private helpers, evident structure fields, direct decoder plumbing, and routine tactics uncommented.
6. Count necessary comments against the ordinary 600-nonblank-line review target and 1,000-line ceiling. If sound explanation exposes a cohesion or size problem, split by semantic ownership; do not compress code or delete useful comments to recover the counter.
7. Treat a stale comment, an unresolvable evidence reference, or a claim broader than its theorem or executable evidence as a source defect.

These rules intentionally prefer stronger names and types over prose. They also permit a sparse, self-explanatory module to remain sparse indefinitely.

## Required measures and rationale

| Measure | Required contract | Why it is proportionate | Boilerplate guardrail |
|---|---|---|---|
| Module contracts | Every maintained Lean source in `BpmnSemantics.lean` or `BpmnSemantics/**/*.lean` has a `/-! ... -/` module document after its import prelude and before its first declaration. | Purpose, semantic scope, and boundary are high-value facts that no individual declaration owns. All 60 files already comply, so the guard preserves an achieved baseline without prompting a backfill. | Check presence and placement only. Do not check words, headings, sentences, or covered declarations. |
| Identifiable conformance facts | Maintained `*Conformance.lean` modules outside `BpmnSemantics/Experiments/` contain no anonymous `example` declaration. Existing durable examples become descriptively named `private theorem`s without changing their propositions or proof terms except where Lean syntax requires it. | Names improve diagnostics, search, review citations, and claim-to-evidence mapping without requiring prose. The scope is the durable conformance surface, not all idiomatic Lean exploration. | Do not require a docstring or inline comment on the named theorem. Do not ban `example` in frozen experiments or temporary local exploration outside the maintained conformance surface. |
| Targeted surplus backfill | Add or strengthen comments only at the selected representation, evaluator, strict-decoding, cross-artifact, and discriminating-conformance boundaries listed below. | These are the locations where material facts are not recoverable locally from names and types. | Every proposed comment must pass the deletion test. A reviewer may reject any individual comment without replacing it. |
| Ownership-preserving splits | Make room in the two near-target modules by extracting cohesive owners rather than compressing code or adding a line-count exception. | Necessary explanation should not force a file beyond the established hygiene target, and the current files already expose independent responsibilities. | Split by role and independent buildability, never into equal chunks, include chains, a universal helper bag, or a new harness. |
| Objective self-tests | Extend the existing source-hygiene test with scanner fixtures and live-tree assertions. | The existing gate already owns Lean umbrellas, source enumeration, and nested-comment stripping, so no dependency or parallel policy harness is needed. | Include a sparse-but-valid fixture that must pass, making a future density or declaration-coverage rule an explicit test regression. |
| Ratio reporting | Preserve the one-line `tokei` command for occasional manual diagnosis. | It makes gross source-shape changes visible and reproduces the observation that opened this proposal. | No package script, CI gate, badge, trend objective, or pass/fail threshold is added. |

## Targeted source corrections

This proposal does not authorize a repository-wide comment pass. If approved, the initial correction is limited to the following source roles.

### Maintained conformance modules

Replace the 95 anonymous examples with descriptive private theorem names. Preserve each proposition and proof unless a separate semantic change is proposed and reviewed. The name should state the discriminating result, such as well-formed acceptance, exact lowering, mismatch refusal, canonical ordering, or the rejected count-based join account; it should not encode chronology or a test number.

Use a short section comment only where several facts share hidden context that their theorem names and propositions cannot carry. The likely high-value clusters are closure-fuel exhaustion, synthetic stranded states, reverse execution orders, strict JSON lexical counterexamples, and the count-based join false account. Routine `by decide`, equality, and constructor checks receive names but no prose.

### Runtime representation

Strengthen `BpmnSemantics/SemanticProcess/RuntimeState.lean` with one representation-invariant section near `RuntimeState`, not a docstring on every small structure. It should explain occurrence ownership, monotonic activation counters, the ownership relation among scope occurrences, tokens, and waits, and the removal obligations of interruption and scope completion. Public operations need individual documentation only where they establish or preserve one of those non-obvious invariants.

### External execution

Document `StimulusResult` and `applyStimulus` in `BpmnSemantics/SemanticProcess/Execution.lean`. The contract must distinguish semantic command outcomes from closure-bound and ambiguous-choice harness failures, state when internal closure runs, and state that refusal paths do not expose speculative state. Obvious singleton fixture constructors and routine pattern-match arms remain undocumented.

### Strict JSON and artifact admission

Document the public `parse` boundary in `BpmnSemantics/StrictJson.lean`: exact duplicate decoded keys and unpaired Unicode surrogates are rejected, and the entire input must be consumed. Do not narrate the private recursive parser.

Document only the public scenario, checked-process, program, definition-input, and cross-artifact validation boundaries currently collected in `BpmnSemantics/SemanticProcessJson.lean`. The useful surplus is strict current-shape admission, required-versus-null behavior, independent structural validation, canonical-lowering equality, and the remaining claim boundary. Private field decoders do not receive repetitive docstrings.

`BpmnSemantics/SemanticProcess/Scenario.lean` is a positive control: its public projection contracts are already locally documented, so this proposal requires no comment change there.

### Near-target module ownership

At the immutable project baseline, `BpmnSemantics/SemanticProcess/Lowering.lean` contains 592 nonblank lines and `BpmnSemantics/SemanticProcessJson.lean` contains 585. Comments continue to count toward the 600-line target.

`Lowering.lean` currently owns canonical lowering and preservation laws, checked-source structural validation, Semantic Process program validation, and cross-representation binding validation. Keep canonical lowering and its preservation laws in `Lowering.lean`; extract the checked-source, program, and definition-binding validators into one cohesive validation owner that imports lowering where equality is required. Update direct importers atomically and keep the narrow modules independently buildable.

Split `SemanticProcessJson.lean` by document role: scenario decoding, definition decoding for checked process and Semantic Process artifacts, and cross-artifact definition-input admission. Preserve `BpmnSemantics.SemanticProcessJson` as an import-only umbrella if its current import surface has consumers; the umbrella contains no declarations or fixtures.

These extractions are not comment-placement tricks. They address already-visible responsibility boundaries and prevent useful documentation from competing with the source-size gate. `RuntimeState.lean` remains cohesive unless the implementation review identifies a separate independently buildable owner; this proposal does not split it speculatively.

## Executable guard design

Extend [`scripts/source-hygiene.test.ts`](../scripts/source-hygiene.test.ts) rather than adding a comment-coverage tool. Its existing worktree enumeration already includes tracked and non-ignored pending sources, and its Lean scanner already removes nested block and line comments for the umbrella check.

The proposed assessment reports two objective violation classes with file and line information:

- a maintained Lean module whose first module document is absent or occurs after the first declaration;
- an anonymous top-level `example` in a maintained non-experimental conformance module after comments are removed.

The assessment does not count total comments, declaration docstrings, words, paragraphs, documentation percentage, or identifiers. It does not attempt to score prose quality. Those properties are either misleading incentives or require semantic review.

The source-hygiene self-tests must cover:

- rejection of a declaration-bearing module without a module document;
- acceptance of imports followed by a module document and declarations;
- rejection of a module document placed only after the first declaration;
- acceptance of an import-only umbrella with its module document;
- rejection of a real anonymous conformance `example` with its exact path and line;
- ignoring `example` text inside line comments and nested block comments;
- acceptance of a descriptively named `private theorem`, including a preceding attribute;
- exclusion of `BpmnSemantics/Experiments/` from the anonymous-example rule;
- inclusion of a non-ignored pending Lean file before commit;
- acceptance of a deliberately sparse, self-explanatory module with one module document, named declarations, and no declaration docstrings or inline comments.

The last fixture is an executable anti-boilerplate guardrail. If a later change introduces a density threshold or blanket declaration-documentation requirement, that fixture must fail and force an explicit owner-visible policy change.

No new package script is required. The existing `check:source-hygiene` command and the complete verification entry point remain the public gate.

## Human review guardrail

Automation cannot decide whether a comment contains semantic surplus. Review every added or materially changed comment with this compact test:

1. What exact information is lost if this comment is deleted?
2. Could a better name, type, theorem statement, module boundary, or section heading carry that information more reliably?
3. Is the retained claim stable, owned here, and no broader than its theorem, specification, or executable evidence?
4. Does one shared section or module comment already state it?
5. Would a future maintainer know when the comment has become false?

If question 1 has no concrete answer, delete the comment. If question 2 is yes, improve the source and omit the comment. If questions 3 through 5 cannot be answered, narrow the comment or move the fact to its proper documentation owner.

## Required, optional, and excluded scope

### Required if approved

- Add the instruction contract to [CLAUDE.md](../CLAUDE.md) without duplicating the entire proposal.
- Extend the existing source-hygiene gate and its adversarial self-tests.
- Remove anonymous examples from the maintained non-experimental conformance surface.
- Apply only the targeted semantic-surplus corrections described above.
- Resolve the two near-target module ownership issues before adding prose that would breach the source-hygiene target.
- Update [TESTING-SPEC.md](TESTING-SPEC.md), the documentation registry, and the exact implemented boundary when the guard and source correction are implemented.

### Optional and non-gating

- Record a fresh `tokei -t=Java,Kotlin,TypeScript,Lean` snapshot during a later policy review when it helps diagnose a large source-shape change.
- Add more comments outside the targeted modules only when an ordinary code review independently identifies a concrete semantic-surplus need.

### Excluded

- Any comment-density, comments-per-code-line, or documentation-coverage target.
- A docstring requirement for every public or private declaration.
- Minimum words, sentences, examples, references, or headings in a comment.
- Generated comment stubs, copied templates, placeholder prose, or an undocumented-declaration baseline manifest.
- Comments that narrate routine tactics, pattern matches, field extraction, loops, or private decoder plumbing.
- Changing BPMN meaning, runtime behavior, wire contracts, theorem propositions, proof strength, or evidence claims as part of the comment correction.
- Reopening or backfilling frozen experiments.
- Copying A12 comments or source; the sibling remains a comparative research input only.
- Adding a heuristic stale-citation scanner in this increment. Stable references remain review obligations unless a later repeated defect justifies a separately designed guard.

## Verification and acceptance

The proposal is ready for owner decision only after an external reviewer checks the committed proposal target and either approves it or all required findings are audited closed in the same reviewer thread.

An approved implementation is complete only when:

- the source-hygiene scanner self-tests fail before the guard exists and pass after it exists;
- the live guard reports no missing module contract and no anonymous example in its exact scope;
- the 95 existing conformance facts are named without a semantic change to their propositions or proofs;
- each added comment passes the deletion test and no blanket declaration backfill appears;
- the Lowering and JSON responsibilities are independently buildable at their narrow owners and no hand-written source crosses the 600-line review target through comment deletion or line compression;
- `./scripts/pnpm.sh run check:source-hygiene`, `lake test`, the documentation/infrastructure gate, `./scripts/verify.sh`, and `git diff --check` pass;
- any `tokei` result is reported as diagnostic context only and no threshold exists in source, package scripts, or CI;
- the implementation changes no semantic output, wire artifact, theorem proposition, or public evidence claim;
- the proposal is graduated according to [DOC-DISCIPLINE.md](DOC-DISCIPLINE.md) only after implementation and the required closure review.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Descriptive theorem names become a different form of boilerplate. | Restrict the rule to durable conformance modules, require names to state the result rather than a sequence number, and require no associated prose. External review should reject meaningless renames such as `example1`. |
| The lexical guard reports commented or quoted text. | Reuse nested-comment stripping, anchor detection to top-level declaration form, and lock comments, attributes, exact locations, and sparse valid files with self-tests. |
| Added comments push cohesive modules over the size target. | Count comments normally and split the two already near-target multi-role modules by ownership before backfill. Do not add exceptions or compress source. |
| Comments become a shadow specification. | Limit source comments to local contract and invariant surplus, link stable project owners when provenance matters, and keep implementation status and chronology out of source. |
| A ratio is mistaken for proof of improvement. | Keep `tokei` manual and non-gating; acceptance checks named facts, selected boundaries, scanner behavior, and semantic stability instead. |
| The correction silently changes semantics while renaming or splitting. | Preserve propositions and proof bodies, build the narrow modules, run `lake test` and the complete gate, and treat any semantic change as a separate proposal. |

## External review contract

The external reviewer should work read-only against the committed proposal target and read this proposal, the comment and Lean hygiene sections of [CLAUDE.md](../CLAUDE.md), the source-hygiene and independent-review sections of [TESTING-SPEC.md](TESTING-SPEC.md), [DOC-DISCIPLINE.md](DOC-DISCIPLINE.md), [`scripts/source-hygiene.test.ts`](../scripts/source-hygiene.test.ts), and the Lean modules named under targeted source corrections.

The review should answer:

1. Does every automated rule test an objective structural fact rather than an unverifiable notion of comment quality?
2. Does the sparse-valid self-test adequately prevent density and blanket-docstring enforcement from entering accidentally?
3. Is naming maintained conformance facts a real traceability improvement, or would any part of its scope manufacture low-value names?
4. Are the selected comment backfills limited to information not recoverable from names, types, theorem statements, and control flow?
5. Are the proposed Lowering and JSON splits based on semantic ownership rather than line balancing, and do they avoid a compatibility or proof-root gap?
6. Do any instructions encourage copied, stale, broader-than-evidence, or status-bearing comments?
7. Is any required measure missing, disproportionate, or better expressed as a human review rule than a machine guard?

Use the verdict and finding format in [the independent cold-review gate](TESTING-SPEC.md#independent-cold-review-gate). In particular, classify any boilerplate incentive as a required finding rather than an advisory style preference.
