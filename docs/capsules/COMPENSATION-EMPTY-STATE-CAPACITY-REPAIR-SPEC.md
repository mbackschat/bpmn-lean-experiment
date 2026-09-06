# Compensation empty-state capacity repair specification

## Status

Implemented; independently closure-reviewed. The receipt below records the exact review and correction targets.

## Question and bounded outcome

What minimum execution-byte limit lets every admitted Compensation declaration represent its empty runtime collections?

The minimum `compensationExecution.limits.maxCanonicalBytes` is seven. The existing canonical execution encoder measures the ordered pair `[compensationTriggers, compensationHandlerEffectWaits]`; its empty encoding is `[[],[]]`, which occupies seven UTF-8 bytes. The separate retention and snapshot arrays still have their existing two-byte minimum. The upper limit remains 65,536.

## Existing authority and contradiction

The [trigger contract](COMPENSATION-TRIGGER-HANDLER-PROPOSAL.md#capacity-and-atomicity) bounds the canonical ordered pair, while the former [IL account](../SEMANTIC-PROCESS-IL-SPEC.md#boundaries) and declaration readers admitted a two-byte execution limit. Both runtime encoders charge seven bytes before any trigger exists. A structurally valid manual Program could therefore pass `runtimePositionValid` while its empty state failed `compensationExecutionStateValid` solely on capacity. The independent two-byte and six-byte boundary cases lock refusal of that contradiction; the exact source checkpoint itself selects 20,480 bytes.

The contradiction also prevented adding the complete Compensation predicate to the Lean aggregate while retaining the existing [initialization theorem](../../BpmnSemantics/SemanticProcess/RuntimeStateWellFormedInitialization.lean): its position-valid hypothesis admitted those empty states. Weakening that theorem, exempting empty runtime collections from capacity, or encoding the empty pair differently would conceal or change the existing capacity contract. Correct declaration admission preserves that contract.

## Required, optional, and excluded functionality

Required: TypeScript declaration admission, Lean declaration validity, and the strict Lean JSON reader accept only safe integer execution-byte limits from seven through 65,536 inclusive. They reject the former two-through-six range before runtime construction. Independent encoder checks establish the seven-byte empty pair; paired lower-bound cases and an upper-bound discriminator bind every reader to this rule. Existing source-checkpoint bytes and all registered profile artifacts remain exact.

Optional functionality: none.

Excluded: changing the canonical encoder, either two-byte retention/snapshot limit, any maximum, Program or RuntimeState shape, source XML, checkpoint topology, public admission, observation, command outcome, transition family, handler meaning, cancellation, scheduling, and general runtime-preservation claims. The separate [initialization specification](RUNTIME-INITIALIZATION-ASSURANCE-REPAIR-SPEC.md) owns its use of this admission fact.

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

Evidence: compact kernel-decided boundary witnesses in the existing [Program conformance owner](../../BpmnSemantics/CompensationTriggerHandlerProgramContractConformance.lean), plus a quantified consequence of declaration validity that its execution limit is at least the empty pair's canonical byte count. Every existing theorem statement remains unchanged; the JSON positive fixture uses the corrected admitted boundary. The soundness relation and evaluator for each existing transition remain untouched because this repair creates no transition family.

Separating negatives are two and six bytes on otherwise valid declarations, zero and unsafe/out-of-range limits, and 65,537 bytes. Positives are seven and 65,536; the seven-byte witness has no retained trigger, so it proves representability without claiming that any nonempty frontier fits. Independent TypeScript serialization of `[[],[]]` checks the encoder fact, while Lean checks its own measure. A two-byte-minimum mutation in any of the three declaration readers must fail. A mutation charging only one empty array must fail the encoder discriminator. Retention and snapshot two-byte positives guard against accidentally changing their distinct contracts.

The nearest non-law is that a minimally admitted declaration can execute every nonempty trigger. The existing prospective capacity checks still decide each candidate. The principal common-mode risk is copying a constant into all three validators without binding it to either encoder.

## Temporal hosting and refinement preflight

The correction changes declaration admission before execution. It adds no durable ingress, wait, timer, effect, cancellation, lifecycle, projection, delivery, ordering, concurrency, deduplication, retry, or replay mechanism. The state relation remains exact transport of the same Program and committed RuntimeState. The source checkpoint's fixed 20,480-byte declaration and its retained histories are unchanged; replay and the existing exact-source host-admission witnesses remain regression obligations under the complete gate. The nearest host counterexample is allowing a below-minimum manual declaration through a strict Program reader. Source/checkpoint rejection already prevents that manual shape from reaching the private scheduler; the semantic readers must independently reject it.

## Implementation and evidence owners

[TypeScript declaration admission](../../packages/semantic-core/src/compensation-trigger-handler-program-admission.ts), [Lean declaration validity](../../BpmnSemantics/SemanticProcess/CompensationTriggerHandlerDeclaration.lean), and [Lean JSON limits](../../BpmnSemantics/SemanticProcessJson/CompensationTriggerHandler.lean) enforce the same bound. The [TypeScript boundary tests](../../packages/semantic-core/test/compensation-empty-state-capacity.test.ts) independently check the encoder and every reader boundary. Lean uses its existing Program conformance owner and declaration-validity law without another reduction-heavy fixture graph. The [source-checkpoint fixture](../../BpmnSemantics/CompensationSourceLoweringFixtures.lean) and source compiler remain byte-identical.

[`implementation-status-owner:ENGINE-RUNTIME-PROOF`](../ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md)

The mechanically routed constraints include [Lean source contracts](../../scripts/lean-source-contracts.test.ts), [module costs](../../scripts/lean-module-cost.test.ts), [test selection](../../scripts/test-selection-coverage.test.ts), [import boundaries](../../scripts/lean-import-boundaries.test.ts), [architecture](../../scripts/pre-release-architecture.test.ts), [source hygiene](../../scripts/source-hygiene.test.ts), [review receipts](../../scripts/independent-review-policy.test.ts), [document reviewability](../../scripts/document-reviewability.test.ts), and [Markdown links](../../scripts/markdown-links.test.ts). The [cost ledger](../CAPSULE-COST-LEDGER.md#repair-closure-costs) records contiguous closure costs and reflection against the preceding start-data repair at the same TypeScript/Lean admission boundary.

## Closure boundary

Reopen if the fix requires a different encoding, a weaker theorem, any changed registered profile or exact-source Program, a runtime exception, or a host policy. Closure establishes only that every admitted Compensation declaration can represent its empty execution pair; nonempty reachability and general runtime preservation remain separately owned.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `ef22297c16836f445ca88bbed91727970d44f8cc` | `fork-turns-none` | `approve-with-required-edits` | `3b091a3e8f55c5b7b25fa60fe5a3fe2f592b34f5` |
| Semantic checkpoint | `ec66bc7a25445e05c0b69d21fef599874ed27262` | `fork-turns-none` | `approve` | `not-required` |
| Closure | `32b761063c95bc2de33363a7b057377f8c9d89d6` | `fork-turns-none` | `approve-with-required-edits` | `ca41ddff78f960adf3dd547d28f565dda60b728a` |
