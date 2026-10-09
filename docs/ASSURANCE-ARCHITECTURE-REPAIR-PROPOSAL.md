# Assurance architecture repair proposal

## Status

Lifecycle: draft
Review: pending

## Mandate

The owner directed a codebase-wide assessment and correction on 2026-10-10, including Lean, TypeScript and the guidelines/scripts that shape their development. This proposal owns the repair design and acceptance boundaries across sessions. [PLAN](PLAN.md#exact-resume-point) owns current execution. The already authorized [PMIS proof correction](capsules/PARALLEL-MULTI-INSTANCE-SUBPROCESS-PROPOSAL.md#entry-and-retirement-publication-checkpoint) is the first concrete application, not the whole programme. Assessment findings below are provisional until their stated verification closes; this document does not declare the engine unsound or authorize weaker assurance.

## Problem and objective

The demonstrated defect is repeated reconstruction of execution and validation facts across proof consumers. Correct local laws do not automatically compose into admissible next commands, complete publications or usable stable states. Missing proof interfaces make each additional invariant repeat history traversal or unfold low-level validators. This increases maintenance work and delays the composed guarantees that delivery needs.

The objective is an assurance architecture in which each shared transition establishes reusable facts once, actual execution transports those facts through one maintained interface, and capsule guarantees consume them without assuming the successful outcome they promise. Apply the same scrutiny to TypeScript's validators and independent evidence producers. Preserve the executable semantics, selected profiles, public contracts and existing proved/checked boundaries unless a separately classified defect requires an explicit reviewed change.

Do not infer waste or unsoundness from source size. The [retired assurance-surface assessment](archived/LEAN-ASSURANCE-SURFACE-PROPOSAL.md) refuted broad deletion based on theorem counts and apparent fixture duplication. This proposal addresses demonstrated composition and evidence defects; it does not revive that rejected deletion premise, citation quotas or an unmeasured build-performance programme.

## Whole-codebase coverage

The unit of assessment is the complete maintained Lean tree and its root entry points, not a selected capsule. Include shared contracts and state, source/IL validation and lowering, every semantic family, command and scheduler composition, observation/publication, JSON and executable adapters, fixtures/conformance, and provisional experiments. Assess TypeScript consumers and assurance lanes wherever they share those contracts, plus the guidelines/scripts governing development and verification.

Derive the file/import/declaration inventory from the current source tree. Every Lean file must have an architectural area, role, assessment disposition and supporting evidence. A mechanical census establishes coverage, not correctness: files not substantively inspected remain explicitly unassessed. Temporary source-bound inventories support review; this proposal owns the area-level correction boundaries rather than introducing another maintained file registry.

Completion requires every area to be assessed and every demonstrated architectural defect to be corrected or explicitly resolved with the owner. Representative migrations test a shared mechanism before applying it to all affected consumers; they do not exempt the remaining codebase. Retain justified distinct semantic cases and record why apparently similar implementations cannot share a contract.

The 2026-10-10 initial inventory covers all 878 Lean paths: 877 below `BpmnSemantics/` and the root umbrella. Its source-manifest SHA-256 is `03fc7a444e67cdd9da76b9b1626bd86077f6ace23e797691a6b29d7ef1ef5ad1`. Every path received an import/declaration scan; only the expressly inspected boundaries below received a substantive disposition. The sixteen retained aggregation modules contain only imports; that finding says nothing about the correctness of their dependencies. This dated assessment baseline is not a live file-count requirement.

| Architectural area | Paths | Demonstrated finding applies | Retain inspected boundary | Further investigation |
|---|---:|---:|---:|---:|
| JSON and wire boundaries | 32 | 0 | 1 | 31 |
| Compensation and Transactions | 86 | 2 | 1 | 83 |
| Control flow and graph analysis | 54 | 4 | 0 | 50 |
| Data, expressions and values | 9 | 0 | 0 | 9 |
| Events, timers, messages and subscriptions | 97 | 1 | 0 | 96 |
| Execution, scheduling and publication | 133 | 4 | 0 | 129 |
| Library and assurance aggregation | 16 | 0 | 16 | 0 |
| Multi-Instance and repeated scopes | 134 | 3 | 0 | 131 |
| Provisional experiments | 16 | 0 | 1 | 15 |
| Scopes, Calls and regional cancellation | 196 | 3 | 0 | 193 |
| Source admission, lowering and profile contracts | 20 | 0 | 1 | 19 |
| State, identity and ownership foundations | 32 | 1 | 0 | 31 |
| Tasks, effects and business data | 53 | 0 | 0 | 53 |
| Total | 878 | 18 | 20 | 840 |

The inventory distinguishes finite conformance/fixture evidence, executable entry points, wire owners, proof owners, mixed definition/proof owners, definitions whose runtime/fixture role needs clarification, and aggregation. Continue substantive assessment area by area, including every state writer/remover, reader/serializer, command runner and observation producer. Rebuild source identities after changes; never carry a retention verdict across changed evidence by filename alone.

## Findings and discriminators

| ID | Evidence and mechanism | Required correction and acceptance |
|---|---|---|
| AA-01 | [PMIS wait publication](../BpmnSemantics/SemanticProcess/ParallelScopeWaitArmingPublicationProofs.lean) repeats closure, command-boundary and internal-prefix induction for one state predicate; runtime-position preservation needs the same traversal. The existing actual reachability relations already distinguish committed ingress, singleton selection, reserved batches and rollback. | Transport a parameterized state predicate over those existing relations. Migrate both consumers; remove their duplicate history traversal. Kernel-check their original quantified guarantees and the composed actual command endpoint without successor-validity or successful-publication premises. |
| AA-02 | [Batch prefix induction](../BpmnSemantics/SemanticProcess/InternalOperationOccurrence.lean) exposes preparation but drops counter-base/positive-slot evidence retained by `InternalOccurrencePatchStep`. Wait publication consequently reconstructs raw prefix folds and the evaluator's recursion. | Expose actual ordered patch-step evidence through invariant induction. Use the existing [reservation preservation law](../BpmnSemantics/SemanticProcess/ParallelScopeLifetimeAccounting.lean) to carry the needed invariant conjunction. Delete the consumer's raw-fold reconstruction; retain every reserved member and predecessor/successor association. |
| AA-03 | Independent whole-tree inspection finds repeated `TaskExecutionReachable` induction in [structured closure](../BpmnSemantics/SemanticProcess/StructuredCompositionClosureProofs.lean), [lifecycle](../BpmnSemantics/SemanticProcess/StructuredCompositionLifecycleProofs.lean) and [control](../BpmnSemantics/SemanticProcess/StructuredCompositionControlProofs.lean) proofs. This is a second family exhibiting repeated actual-step lookup/provenance recovery. | Verify the shared traversal and distinct semantic premises, then expose a family-appropriate induction interface and migrate at least two existing consumers. Do not force a PMIS-specific relation onto another family merely to share a name. |
| AA-04 | Runtime preservation reconstructs positional Boolean conjunctions in [commutation](../BpmnSemantics/SemanticProcess/InternalCommutationRuntimePreservation.lean), [regional cancellation](../BpmnSemantics/SemanticProcess/InternalRegionalCancellationRuntimeValidity.lean) and [scope creation](../BpmnSemantics/SemanticProcess/InternalScopeCreationRuntimeValidity.lean). The same invariant components are repeatedly unpacked and reassembled. | Introduce named logical views equivalent to the existing validator and reusable update/frame laws for actual consumers. Preserve the wire/runtime representation. Verify equivalence and migrate creation plus cancellation before extending the view across other families. |
| AA-05 | [Execution](../BpmnSemantics/SemanticProcess/Execution.lean) imports `CallDataStateLaws`; [Transition](../BpmnSemantics/SemanticProcess/Transition.lean) imports Event Sub-Process completion laws. The [import guard](../scripts/lean-import-boundaries.test.ts) currently isolates PMIS proof owners but does not establish a general runtime/proof boundary. Exact mixed-module responsibilities remain under assessment. | Separate executable definitions, relations and theorem consumers according to actual dependencies; replace inappropriate runtime-to-proof imports. Extend the existing guard with real non-PMIS counterexamples, including indirect imports. Do not classify modules solely by filename or break executable relation dependencies. |
| AA-06 | At baseline `2f38e92d`, [contributor guidance](../CLAUDE.md#code-hygiene-and-module-boundaries) permitted extraction only after two **completed** semantic users, while [proof review](REVIEW-POLICY.md#lean-proof-design-and-review) requires stronger shared interfaces when a second consumer reconstructs execution. A completed publication consumer plus an unfinished position consumer exposes the conflict. | Permit extraction for two concrete demonstrated consumers, including the increment under development. Require both consumers and their distinguishing obligations in the change; retain the prohibition on speculative frameworks. This corrects conflicting guidance rather than relaxing correctness. |
| AA-07 | An executable mutation of accepted source-bound SMI/PMI commands removes only lifecycle starts while retaining valid actual state and full E1. The authoritative host accumulator accepts the mutations and publishes zero open occurrences instead of the actual one/three/one for SMI entry, PMI entry and SMI successor. The core producer is correct; this is a demonstrated missing independent host completeness check, not evidence it currently emits omissions. | Compose the existing lifecycle relation with independently projected actual endpoint occurrences before accepting host publication. Retain per-transition transient lifecycle checks. Reject all three omission mutants while preserving unmodified commands and their numbered publications. |
| AA-08 | [Transaction phase induction](../BpmnSemantics/SemanticProcess/TransactionPhaseInduction.lean) and [scope phases](../BpmnSemantics/SemanticProcess/TransactionScopePhases.lean) repeatedly reopen admitted-role inventories and constructor shapes. | Derive named role inversion and actual-attempt contracts from the existing admitted-role certificate. Migrate continuation and scope-shape consumers while retaining cancellation, compensation and refusal distinctions. |
| AA-09 | [PMIS token positions](../BpmnSemantics/SemanticProcess/ParallelScopeTokenPositionProofs.lean) consumes a general deduplication/uniqueness fact through [Structured Composition admission proofs](../BpmnSemantics/SemanticProcess/StructuredCompositionAdmissionProofs.lean), which imports command admission. General collection/graph facts inherit unrelated high-level dependencies. | Move genuinely generic laws below profile admission; retain profile reader certificates separately. Verify two actual consumers and remove the inappropriate cross-family dependency without changing reader acceptance. |
| AA-10 | At baseline `2f38e92d`, contributor/testing headroom instructions required a separate prior extraction commit, while [commit policy](REVIEW-POLICY.md#commit-boundaries) keeps supporting helpers/modules with a coherent outcome. The textual conflict can encourage helper-sized checkpoints. Historical causation is not established merely by that conflict. | Remove automatic commit sequencing from headroom guidance. Retain cohesive ownership correction, size review and hard limits; separate a repair when it is independently useful, not solely because a file approaches a threshold. |
| AA-11 | Pinned-Node executable witnesses on registered User Task-cycle and mixed-task Programs show that valid/restorable high-water states at `Number.MAX_SAFE_INTEGER` commit activation `9007199254740992` in User Task and Effect domains. Preparation is `null`, full result commits without trace/publication, and successor restoration rejects. At one less, both domains remain valid and publish. The synthetic high-water predecessor is accepted by current predicates; feasible production reachability through that many commands is unproved. | Separate unsupported preparation from failed validation and make issuance refuse unsafe arithmetic before mutation across every counter domain. Retain legitimate unprepared operations. Test exact/over-bound command closure, complete publication, refusal state preservation and restoration, not merely a preparation helper. |
| AA-12 | The [removal completeness guard](../scripts/runtime-collection-removal-completeness.test.ts) describes filtering but derives assignment keys. Both a top-level owner collection and nested scoped data can be passed through unchanged while retaining the required keys. Its delete/rename mutants cannot distinguish these wrong accounts. Compensation terminal cleanup also repeats collection disposal; its inherited event-subscription field is a latent composition concern, not an admitted regression. | Retain key coverage as a structural census and correct its claim. Add behavioral no-op/wrong-owner removal mutants at actual regional, called-instance and terminal boundaries. Share owner classification only where disposal and retention rules agree; preserve historical counters, tombstones and distinct ownership semantics. |

The AA-07 and AA-11 separating probes and source/build hashes are retained in `/tmp/typescript-assurance-singleton-20261010`; `receipt-v4-node26` and `lifecycle-receipt-v1` passed at baseline `2f38e92d` by observing the specified defects. Existing built modules were used and source hashes recorded; no fresh compiler-invocation provenance is claimed. Durable regression tests must reproduce the defect from the maintained build before accepting its repair.

AA-11 is a cross-language boundary defect. [Lean activation](../BpmnSemantics/SemanticProcess/WaitActivation.lean) uses unbounded `Nat`, and ordinary preparation plus singleton selection also retain raw execution without safe-wire qualification. PMIS already qualifies issuance. A TypeScript-only refusal would introduce disagreement: the repair must give admitted command execution the same representability boundary and existing outcome category in both implementations. Mathematical raw transitions may remain total on `Nat`; their proof domain must not be confused with serializable admitted execution. Establish the precise outcome and preservation contract before changing either interpreter.

These findings are not an exhaustive verdict on every module. The assessment must cover independently sampled control flow, scopes/Calls, Multi-Instance, events and Compensation, and distinguish existing reusable mechanisms from missing interfaces. New rows require exact source evidence and a second instance or separating counterexample; observations without a demonstrated mechanism remain questions rather than repair mandates.

The wider sample includes Structured Process Composition, serial/mixed tasks, Transaction cancellation, regional cancellation, scope creation and interrupting Message Event Sub-Processes. Existing reusable cancellation and mixed-task reachability mechanisms should be retained. The findings do not justify replacing list storage with maps, unifying distinct ownership kinds or changing Semantic Process IL. The import census is not a measured build-cost result.

## Selected architecture

Keep one executable Lean state/transition model. A proof-only logical view may expose named facts about that state, but must be equivalent to the canonical validator where it claims equivalence; it is not a second runtime representation. Keep runtime definitions below reusable local laws, actual-execution transport and capsule-level composition. A lower layer must not import a downstream proof merely to recover one small definition or relation.

Local contracts expose the exact evidence produced by successful execution: owner identity, declared ports, allocation provenance, changed fields and preserved fields. They may assume predecessor invariants, but composition must establish those invariants from admitted Start and real command reachability. Accounting over-approximations remain useful for counting; they must not authorize ingress during an automatic closure.

Transport owns execution traversal once for each genuinely shared execution relation. Consumers provide property-specific establishment and preservation. Share only equal propositions and result domains; operations with distinct semantics retain distinct cases. A monolithic record containing every future invariant, a universal history framework and aliases over duplicated implementations do not satisfy this design.

Compose the end guarantee explicitly: admitted source/Start, reachable state validity, valid next-command admission, bounded internal completion, usable external wait or terminal state, and complete public observation. Distinguish these obligations. Position validity does not prove progress; a committed result does not prove trace/lifecycle acceptance; an accepted-input theorem does not prove all valid inputs are admitted.

Lean and TypeScript remain separately written realizations of the reviewed semantic account. Within each implementation, consolidate shared mechanisms and contracts where the evidence supports it. Do not generate TypeScript from Lean or share an evaluator between their evidence lanes. Shared wire contracts and neutral inputs remain appropriate; retained expected outcomes and independently derived completeness checks remain separate from the candidate under test.

## Guidelines and executable controls

Assess each policy/script concern as one of: conflicting or harmful rule, violation of an existing sound rule, or inefficient/incomplete executable control. Fix the responsible mechanism rather than adding another warning paragraph.

Review these concrete boundaries: extraction eligibility; whether a proof checkpoint represents a composed claim or merely a helper; whether module headroom drives ownership rather than arbitrary splitting; whether `what-binds` textual candidates are mistaken for authoritative dependencies; whether startup routing loads unrelated maps; and whether a green local proof is reported as a stronger delivery guarantee. AA-06, AA-10 and the narrow import-guard gap have identified corrective mechanisms; the other concerns require evidence before changing their contracts.

Retain mandatory semantic review, complete applicable verification, exact evidence provenance and resource ceilings. Remove duplicated work or false dependencies rather than weakening a gate. Reuse existing guards and owners; do not introduce a new registry, dashboard or citation-count programme as a substitute for architecture.

## Correction boundaries

Required outcomes, selected for their dependencies rather than file counts:

1. Close AA-01/AA-02 with publication and runtime-position consumers and a useful actual command endpoint. This is the PMIS pilot, with immutable independent review.
2. Close AA-03/AA-04 through representative independent families, retaining equivalence and composed consumer guarantees. Use those results to select further migrations from the assessed codebase.
3. Close demonstrated runtime/proof dependency defects and extend the existing import guard beyond PMIS without filename-only classification.
4. Complete the TypeScript assessment and correct every demonstrated candidate-oracle, validation-composition or duplicated-mechanism defect with independent adversarial tests.
5. Correct the policies/scripts that caused or failed to prevent these mechanisms, and reconcile architecture/status owners so subsequent sessions follow the repaired design.

Optional: broader storage or runtime representation changes only if local contracts cannot express the required invariant without circular premises or repeated reconstruction. Such a finding requires its exact counterexample and reviewed replacement contract before migration.

Excluded: discarding the codebase on the basis of size; weakening claims to manufacture completion; SDK fixing, private SDK rebuilds, dependency changes or performance/cold-library investigations; unrelated platform/UI redesign; changes to CIB/BPMN interpretation without the owning capsule and relationship classification.

## Acceptance and continuity

For each correction, retain the original claim and realistic wrong account, reproduce the missing mechanism, then verify the corrected consumers and complete affected package gate. Use kernel checks and inspect the composed theorem's premises and axiom footprint; compilation of a helper alone is insufficient. For TypeScript, require omissions/substitutions to be rejected by an oracle independent of the supplied candidate, and preserve full-state/refusal/publication comparisons where affected.

Independent review must assess dependency direction, invariant strength, actual execution provenance and the removal of repeated reconstruction. Judge improvement by reusable contracts consumed by real families and closed composed guarantees, not module count, proof volume or unmeasured time savings. Full Practical CIB7 acceptance remains a separate delivery boundary.

[PLAN](PLAN.md#exact-resume-point) retains the active correction, decisive receipt and next action. This proposal retains design and unresolved findings, not a session diary. Update existing [architecture](ARCHITECTURE.md), [review policy](REVIEW-POLICY.md), [testing owners](TESTING-SPEC.md#select-the-task-owner) and [`implementation-status-router`](IMPLEMENTATION-MAP.md) only where each owns a changed contract. Preserve unrelated work, stashes, failed evidence and the one-CPU/3-GiB/no-extra-swap Lean limit.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
