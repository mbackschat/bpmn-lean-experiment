# Compensation empty-state capacity repair proposal

## Status

Lifecycle: implementation-in-progress
Review: approved-with-required-edits

## Question and bounded outcome

What minimum execution-byte limit lets every admitted Compensation declaration represent its empty runtime collections?

This proposal changes only the minimum `compensationExecution.limits.maxCanonicalBytes` from two to seven. The existing canonical execution encoder measures the ordered pair `[compensationTriggers, compensationHandlerEffectWaits]`; its empty encoding is `[[],[]]`, which occupies seven UTF-8 bytes. The separate retention and snapshot arrays still have their existing two-byte minimum. The upper limit remains 65,536.

## Existing authority and contradiction

The [trigger contract](COMPENSATION-TRIGGER-HANDLER-PROPOSAL.md#capacity-and-atomicity) bounds the canonical ordered pair, while the [IL account](../SEMANTIC-PROCESS-IL-SPEC.md#boundaries) and current declaration readers admit a two-byte execution limit. Both runtime encoders charge seven bytes before any trigger exists. A structurally valid manual Program can therefore pass `runtimePositionValid` while its empty state fails `compensationExecutionStateValid` solely on capacity. Root kernel checks reproduce that conjunction for independent two-byte and six-byte mutations of the complete source-checkpoint fixture; the exact source checkpoint itself selects 20,480 bytes.

The contradiction also prevents adding the complete Compensation predicate to the Lean aggregate while retaining the existing [initialization theorem](../../BpmnSemantics/SemanticProcess/RuntimeStateWellFormedInitialization.lean): its position-valid hypothesis admits those empty states. Weakening that theorem, exempting empty runtime collections from capacity, or encoding the empty pair differently would conceal or change the existing capacity contract. This proposal corrects declaration admission instead.

## Required, optional, and excluded functionality

Required: TypeScript declaration admission, Lean declaration validity, and the strict Lean JSON reader accept only safe integer execution-byte limits from seven through 65,536 inclusive. They reject the former two-through-six range before runtime construction. Independent encoder checks establish the seven-byte empty pair; paired lower-bound cases and an upper-bound discriminator bind every reader to this rule. Existing source-checkpoint bytes and all registered profile artifacts remain exact.

Optional functionality: none.

Excluded: changing the canonical encoder, either two-byte retention/snapshot limit, any maximum, Program or RuntimeState shape, source XML, checkpoint topology, public admission, observation, command outcome, transition family, handler meaning, cancellation, scheduling, and general runtime-preservation claims. The separate runtime-invariant corrections may consume this repaired admission fact only after approval and evidence; this proposal does not claim their completion.

## Stable rule and compatibility

`COMPEMPTY-CAPACITY-01`: a Compensation execution declaration is admissible only when its canonical-byte limit can contain the canonical pair of empty declaration-owned runtime collections, as well as satisfying the existing maximum and integer rules. For the unchanged wire representation that lower bound is seven.

This is a project-owned representation constraint, not a new BPMN interpretation or CIB behavior. The already selected BPMN authority and exclusions remain in the [trigger proposal](COMPENSATION-TRIGGER-HANDLER-PROPOSAL.md#normative-authority-and-interpretation-boundary). No profile or CIB relationship is added. The correction narrows an unregistered manual-Program boundary; the sole private source checkpoint and every registered product profile retain their existing bytes and accepted inputs. Programs in the removed range could never fit the declaration-owned empty execution state. No durable-history migration or new wire version is selected.

## Cross-target invariant matrix

| Fact | TypeScript | Lean | Source and Temporal |
|---|---|---|---|
| Empty representation | Production canonical encoder measures seven bytes | Independent canonical measure reduces to seven | Existing pair bytes are preserved |
| Admission | Declaration reader requires seven through 65,536 | JSON reader and structural declaration validator require the same range | Exact lowered 20,480-byte declaration remains accepted |
| Refusal | Two and six reject before state construction | Both readers reject the same values | No new Workflow or continuation shape |
| Positive boundary | Seven admits a structurally valid empty/zero-subject declaration and empty runtime state | Same positive declaration and empty-state capacity facts | No claim that seven can hold a nonempty trigger |
| Non-requirement | No runtime exception for empty state | No weaker initialization or preservation theorem | No new host policy, public profile, or CIB evidence |

## Lean assurance lane

Lane shape: checked

Evidence: planned compact kernel-decided boundary witnesses in the existing [Program conformance owner](../../BpmnSemantics/CompensationTriggerHandlerProgramContractConformance.lean), plus a quantified consequence of declaration validity that its execution limit is at least the empty pair's canonical byte count. Every existing theorem statement remains unchanged; the JSON positive fixture changes its execution limit to the corrected admitted boundary. The soundness relation and evaluator for each existing transition remain untouched because this repair creates no transition family.

Separating negatives are two and six bytes on otherwise valid declarations, zero and unsafe/out-of-range limits, and 65,537 bytes. Positives are seven and 65,536; the seven-byte witness has no retained trigger, so it proves representability without claiming that any nonempty frontier fits. Independent TypeScript serialization of `[[],[]]` checks the encoder fact, while Lean checks its own measure. A two-byte-minimum mutation in any of the three declaration readers must fail. A mutation charging only one empty array must fail the encoder discriminator. Retention and snapshot two-byte positives guard against accidentally changing their distinct contracts.

The nearest non-law is that a minimally admitted declaration can execute every nonempty trigger. The existing prospective capacity checks still decide each candidate. The principal common-mode risk is copying a constant into all three validators without binding it to either encoder.

## Temporal hosting and refinement preflight

The correction changes declaration admission before execution. It adds no durable ingress, wait, timer, effect, cancellation, lifecycle, projection, delivery, ordering, concurrency, deduplication, retry, or replay mechanism. The state relation remains exact transport of the same Program and committed RuntimeState. The source checkpoint's fixed 20,480-byte declaration and its retained histories are unchanged; replay and the existing exact-source host-admission witnesses remain regression obligations under the complete gate. The nearest host counterexample is allowing a below-minimum manual declaration through a strict Program reader. Source/checkpoint rejection already prevents that manual shape from reaching the private scheduler; the semantic readers must independently reject it.

## Versioning consequences

The implementation changes [TypeScript declaration admission](../../packages/semantic-core/src/compensation-trigger-handler-program-admission.ts), [Lean declaration validity](../../BpmnSemantics/SemanticProcess/CompensationTriggerHandlerDeclaration.lean), and [Lean JSON limits](../../BpmnSemantics/SemanticProcessJson/CompensationTriggerHandler.lean). The existing [TypeScript Program contract tests](../../packages/semantic-core/test/compensation-trigger-handler-program-contract.test.ts) have only eight nonblank lines of headroom, so the new boundary cases belong in a separate focused test owner, `packages/semantic-core/test/compensation-empty-state-capacity.test.ts`. Lean uses its existing Program conformance owner and a declaration-validity law, without introducing another reduction-heavy fixture graph.

The [IL specification](../SEMANTIC-PROCESS-IL-SPEC.md), [trigger contract](COMPENSATION-TRIGGER-HANDLER-PROPOSAL.md), [core source map](../../packages/semantic-core/SOURCE-MAP.md), [core README](../../packages/semantic-core/README.md), and [PLAN](../PLAN.md) must reflect the corrected minimum or route to its owner wherever they currently state that fact. The [source-checkpoint fixture](../../BpmnSemantics/CompensationSourceLoweringFixtures.lean) and source compiler remain byte-identical. Current runtime status is routed by the following owner.

[`implementation-status-owner:ENGINE-RUNTIME-PROOF`](../ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md)

The mechanically routed constraints include [Lean source contracts](../../scripts/lean-source-contracts.test.ts), [module costs](../../scripts/lean-module-cost.test.ts), [test selection](../../scripts/test-selection-coverage.test.ts), [import boundaries](../../scripts/lean-import-boundaries.test.ts), [architecture](../../scripts/pre-release-architecture.test.ts), [source hygiene](../../scripts/source-hygiene.test.ts), [review receipts](../../scripts/independent-review-policy.test.ts), [document reviewability](../../scripts/document-reviewability.test.ts), and [Markdown links](../../scripts/markdown-links.test.ts). The complete affected core and Lean gates, immutable consumer calibration, complete Product 1 verifier, and independent closure review remain required. Cost is recorded against the preceding [start-data repair](COMPENSATION-DURABILITY-START-DATA-REPAIR-PROPOSAL.md) because both narrow Compensation admission at the same TypeScript/Lean boundary.

### Owners this implementation grows

| Owner | Current headroom | Growth condition |
|---|---:|---|
| [TypeScript declaration admission](../../packages/semantic-core/src/compensation-trigger-handler-program-admission.ts) | 433 | Keep the correction local to execution-limit validation |
| [Lean declaration validity](../../BpmnSemantics/SemanticProcess/CompensationTriggerHandlerDeclaration.lean) | 601 | Correct the bound and expose its validity consequence |
| [Lean JSON reader](../../BpmnSemantics/SemanticProcessJson/CompensationTriggerHandler.lean) | 723 | Preserve strict shape and integer decoding |
| [Lean Program conformance](../../BpmnSemantics/CompensationTriggerHandlerProgramContractConformance.lean) | 629 | Add compact independent boundary facts only |

These measurements are the nonblank-line remainder below the 800-line review target. Rerun the binding inventory before growth; if the correction cannot fit, redesign its owner boundary before editing.

## Stage boundary and closure

Cold proposal approval precedes any production admission change. The first green implementation target closes the three-reader agreement, canonical-byte law, independent positive/negative evidence, affected gates, consumer calibration, documentation, cost, and complete verification; it may use the governed combined checkpoint/closure review only when all those obligations are present and no dependent runtime-invariant implementation has crossed the unreviewed boundary. Otherwise it stops for the ordinary semantic-checkpoint review before dependent integration.

Reopen if the fix requires a different encoding, a weaker theorem, any changed registered profile or exact-source Program, a runtime exception, or a host policy. Closure establishes only that every admitted Compensation declaration can represent its empty execution pair; nonempty reachability and general runtime preservation remain separately owned.

## Implementation checkpoint

All three declaration readers implement the reviewed minimum. The [TypeScript boundary tests](../../packages/semantic-core/test/compensation-empty-state-capacity.test.ts) and [Lean conformance owner](../../BpmnSemantics/CompensationTriggerHandlerProgramContractConformance.lean) independently separate undersized execution declarations, valid empty states, upper/integer bounds, and unchanged retention/snapshot minima. The declaration-validity theorem implies that the independently measured canonical empty pair fits; every pre-existing theorem statement is unchanged.

On 2026-09-05, the complete semantic-core gate passed 726 tests, and complete Lean verification passed all 296 targets under the unchanged 3 GiB/no-swap controller. The kernel-decided boundary witnesses passed; full-gate peak usage was 3,006,087,168 cgroup bytes with zero limit-hit/OOM events and zero swaps. The [immutable consumer calibration](../CAPSULE-COST-LEDGER.md#measurements) binds the changed conformance owner to source commit `4b2a304f`. Product 1 verification and independent checkpoint/closure review remain outstanding. Dependent runtime-invariant integration stays blocked at that review boundary.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `ef22297c16836f445ca88bbed91727970d44f8cc` | `fork-turns-none` | `approve-with-required-edits` | `3b091a3e8f55c5b7b25fa60fe5a3fe2f592b34f5` |
| Semantic checkpoint | `ec66bc7a25445e05c0b69d21fef599874ed27262` | `not-recorded` | `pending` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
