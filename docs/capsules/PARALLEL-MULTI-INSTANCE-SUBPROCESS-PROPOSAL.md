# Parallel Multi-Instance Sub-Process proposal

## Status

Lifecycle: draft
Review: pending

## Purpose and boundary

Execute a collection of applicants' checks concurrently, with human review and automated validation inside each applicant's Sub-Process. Preserve body identity and local data, count completed bodies rather than individual tasks, and cancel unfinished bodies when the selected completion condition succeeds. This is required depth in [Practical CIB7 Coverage](../PRACTICAL-CIB7-COVERAGE-TARGET.md), not an optional exotic feature.

This draft selects a substantial increment and identifies its unresolved feasibility obligations. It authorizes no implementation, public profile or coverage claim. [PLAN](../PLAN.md#exact-resume-point) retains implementation sequencing and failed hosting evidence. The [sequential Sub-Process account](SEQUENTIAL-MULTI-INSTANCE-SUBPROCESS-PROPOSAL.md) supplies reusable body/data semantics; the [parallel User Task contract](PARALLEL-MULTI-INSTANCE-SPEC.md) supplies a comparison for accounting and cancellation, not evidence for repeated Sub-Process bodies.

## Source basis

Use the [BPMN Markdown reference](../reference/bpmn-2.0.2/README.md). BPMN 2.0.2 §13.3.7 fixes the number of instances at entry, distinguishes parallel generation, and evaluates the completion condition after an instance completes; a true condition cancels remaining instances and completes the outer Activity. §§10.3.5 and 13.3.4 supply embedded scope completion. One branch reaching an End is not completion while the body still owns work.

The pristine CIB Seven `2.2.0` checkout registered in [SOURCES](../SOURCES.md), commit `5a45b47ea22688d774de97277c3ff7013f54fdd2`, contains the following source evidence:

| Source, relative to the CIB checkout | Relevant evidence |
|---|---|
| `engine/src/main/java/org/cibseven/bpm/engine/impl/bpmn/behavior/MultiInstanceActivityBehavior.java` | `execute` resolves the count once and immediately leaves on zero; `performInstance` binds the loop index and collection element; completion conditions require Boolean values. |
| `engine/src/main/java/org/cibseven/bpm/engine/impl/bpmn/behavior/ParallelMultiInstanceActivityBehavior.java` | `createInstances` creates concurrent children and starts them; `concurrentChildExecutionEnded` updates completed/active counts, tests the condition on the ended execution, deletes unfinished children on early completion and leaves the outer scope once. Internal reverse traversal is not a public scheduling guarantee. |
| `engine/src/test/java/org/cibseven/bpm/engine/test/bpmn/multiinstance/MultiInstanceTest.java` | `testParallelSubProcess`, `testParallelSubProcessCompletionCondition` and `testParallelSubProcessWithTimer` cover concurrent bodies, first completed-body cancellation and outer interruption. |
| `engine/src/test/resources/org/cibseven/bpm/engine/test/bpmn/multiinstance/MultiInstanceTest.testParallelSubProcessCompletionCondition.bpmn20.xml` | Two bodies each contain two parallel human tasks; the condition counts completed instances, not completed tasks. |

These are inspected sources, not newly executed compatibility results. The [relationship register](../CIB-BPMN-RELATION-REGISTER.md) must classify the selected parallel lifecycle/data evidence before implementation; sequential-only relationships must not silently acquire parallel scope. CIB rejects MI output parameters: selected scope writes are useful result handling, while standard MI output aggregation cannot count toward this CIB target.

## Proposed practical contract

Required: one collection-driven parallel MI embedded Sub-Process in a root Process; a finite acyclic body mixing User Tasks and mapped-success Service Tasks; serial and structured Parallel regions, including separate branch None Ends; a serial parent continuation; empty input; distinct occurrences even for equal item values; body-local initialization and enclosing writes; natural completion and a selected Boolean Process-variable completion condition; cancellation of unfinished sibling bodies and their pending effects. Business handlers use the existing caller-supplied public binding.

The proposed collection target remains sixteen String items with the existing item/collection byte limits. This target is **not yet demonstrated compatible with automatic-closure capacity**. Do not reduce it to fit a convenient two-item witness. Body-local mappings, present-null shadowing, immutable collection/item names, User Task patches and explicit Service result mappings reuse the sequential account's meaning. Body initialization evaluates all declared inputs in the pre-entry enclosing context; declarations cannot read one another. Shared Process writes follow explicit command order; different bodies do not imply commuting writes to the same binding.

Optional within this account: multiple human/automated tasks and nested paired Parallel regions inside each body, provided admission establishes the complete bound. Excluded from this increment, but retained as practical obligations where supported: nested MI/scopes, Calls, cycles and conditional branching inside the body, outer Timer interruption, Error/Escalation, Compensation, mutable collections, arbitrary predicate expressions and cardinality-driven admission. No general expression language, vendor delegate API, output aggregation or rollback of completed external side effects is inferred.

Each generated body owns one issued scope identity, immutable index/item binding and its local declarations. The outer Activity owns a collection of those child scopes. A body Task completion changes its own branch; only complete body quiescence increments the outer completed count. After that increment, evaluate the selected condition. Natural exhaustion or a true condition produces exactly one parent continuation. A true condition cancels every still-active sibling; cancellation never increments the completed count. Initially true conditions still require a body to complete. Empty input issues no child or effect.

Cancellation removes the exact body's tokens, waits and local frames and records its lifecycle outcome; already committed Process writes survive. Late task commands and effect results cannot revive removed bodies. All generated identities remain distinct from Temporal Run IDs and Activity attempts. Duplicate accepted commands recover their retained result; a new stale command rejects without changing state or publications.

## Representation and closure prerequisites

The existing [Activity body](../../packages/semantic-core/src/activity-occurrence.ts) has a single-child scope arm. Parallel bodies need one authoritative multi-child ownership representation, integrated with uniqueness, cancellation, data lookup, quiescence and observation. A second controller list that independently duplicates child ownership is not acceptable. Keep fixed total and completed count separate from active membership; derive active count from authoritative membership. Public progress reuses the Sub-Process iteration shape and publishes all active bodies, with exact task/effect membership, rather than treating the first body as current.

The [closure evaluator](../../packages/semantic-core/src/semantic-process-closure.ts) charges each individual operation against [the eight-operation limit](../../packages/semantic-core/src/semantic-process-limits.ts), including operations applied in a prepared batch. With one ordinary Task activation per concurrent body, sixteen bodies already require more than eight operations before counting entry or forks. The [sequential analysis](../../packages/semantic-core/src/sequential-scope-control-analysis.ts) proves no bound for that multiplied frontier.

A separating experiment on 2026-10-05 called the current closure evaluator with independent frontiers of eight, nine and sixteen operations. Eight completed; nine and sixteen returned `hitBound` before applying the batch. Receipt `/tmp/parallel-scope-closure-capacity` was separately asserted successful. This establishes the capacity mechanism, not an executable MI implementation. Batching is therefore an evaluated alternative that does not resolve the limit. Neither a larger global constant nor silently collapsing several observable operations into one establishes correctness.

Before approving implementation, evaluate a model-derived bounded-closure account: derive the admitted graph's maximum automatic work across all generated bodies, preserve the existing transition/publication sequence, and check the bound before Start. It must retain existing profiles' limits and prove actual reachable completion within its declared budget, with finite resource ceilings. This is a proposed semantic/admission design change requiring review, not an approved runtime workaround. Exit the feasibility check with a separating executable witness and a precise theorem statement, or record the failed alternative without inventing a smaller coverage claim. Partial closure must never be published as a committed stable state.

## Lean assurance lane

Lane shape: proved

Evidence: the existing [scope completion laws](../../BpmnSemantics/SemanticProcess/ScopeCompletion.lean) supply the quiescence basis. Parallel repeated-body ownership, accounting, cancellation and bounded closure require new general laws; none is established by this draft.

Required laws cover unique body ownership, fixed total, completed/active accounting, no early parent continuation, exact cancellation, local-data isolation, and preservation outside declared writes/cancellation. The closure obligation starts from admitted source and actual Start reachability; it cannot assume a successful evaluator result or the desired successor. Existing sequential bounded-resumption gaps remain open and cannot serve as established lemmas. No fairness or termination claim is made about external handlers.

Bound the initial assurance investigation to the ownership representation and multiplied-frontier theorem. Do not allocate additional proof modules or begin broad proof assembly before feasibility and independent proposal review. Finite Lean/TypeScript agreement is required alongside the laws, not substituted for them.

| Separating case | Required distinction |
|---|---|
| Zero, one, two and sixteen items; duplicate item values | Cardinality, capacity and occurrence identity are independent. |
| One inner branch ends while its sibling waits | No completed-body count or parent continuation yet. |
| Interleave different bodies and reverse their completion order | Local frames remain isolated; shared writes follow command order. |
| Set condition true while another inner branch remains | Evaluate only when a whole body completes. |
| Complete one body while a sibling has a pending effect | Cancel the sibling semantically; late result cannot create completion. |
| Cancel after a sibling has committed a Process write | Preserve the write; do not fabricate compensation or rollback. |
| Same-named parent/local values, present null and reordered declarations | Exact lookup ownership and pre-entry initialization. |
| Renamed source IDs, malformed child ownership and over-capacity graph | Structural admission; no fixture-specific exception. |

## Temporal hosting and refinement preflight

Use one Workflow for the parent and all bodies. Start/User Task Updates and retained Activity results enter the existing serialized command boundary. Every pending effect uses a committed argument snapshot and occurrence key; transport retries preserve that key. Concurrent arrivals become explicit command order. Parallel body generation does not authorize arbitrary internal choice or shared-write commutation.

The state relation must preserve outer/body ownership, indices/items, local and Process bindings, completed counts, pending effects, command receipts and complete E1/E2 publications across Worker replacement and Continue-As-New. New multi-body membership must be admitted by every continuation reader and publication validator. An early-completion transaction publishes all semantic cancellations atomically. The adapter cancels obsolete Activities and fences late results; external effects already performed cannot be undone by Activity cancellation. Retain the existing in-flight Activity continuation fence and technical-failure boundary. No Timer mechanism is selected here; Process termination must still clean the complete owned population.

The smallest refinement witness uses two applicants: one has an open human check and pending automated validation when the other finishes and triggers early completion. Replace the Worker, recover the accepted completing command, deliver a late sibling result, compare full publications and replay every Run. Natural completion with reversed body order, empty input, sixteen-body admission and termination supply separate controls. A source-level CIB probe must first settle parallel local initialization and selected enclosing-write/condition context; synchronous CIB transactions do not prove durable-effect equivalence.

## Acceptance boundary

This proposal cannot advance to implementation approval until the capacity and ownership account is concrete, selected CIB relationships are classified with separating evidence, and independent cold review passes. Closure then requires the applicable proofs, full Lean/TypeScript state and refusal agreement, public handler integration, Temporal recovery/replay, registration and a retained applicant-check whole model with exact capability/restriction disclosure. The [corpus contract](../../model-corpus/README.md#admission-and-product-readiness-gate) owns atomic registration. Existing failed hosting gates remain failures; no runtime rerun or performance test is selected by this draft.

## Versioning consequences

Follow the [pre-release evolution policy](../PROJECT-DESIGN.md#pre-release-evolution-policy). Any multi-child representation must migrate producers, strict Lean/TypeScript readers, schemas, observations, lifecycle projections and continuation validation atomically. Preserve the meaning of existing single-child and Task-only profiles; no durable-history compatibility is implied. Run binding discovery on concrete implementation paths before changing them.

The existing [operation consumer census](../../scripts/semantic-operation-consumer-census.test.ts), [Activity ownership census](../../scripts/activity-occurrence-writer-census.test.ts), [cleanup completeness](../../scripts/runtime-collection-removal-completeness.test.ts), [publication coverage](../../scripts/execution-publication-contract-coverage.test.ts) and [reviewability guard](../../scripts/document-reviewability.test.ts) constrain the representation change. Their passing on this draft would not establish its semantics.

### Owners this implementation grows

Measured on 2026-10-05 against `dfb111b0`; recompute before implementation. The feasibility decision must name any additional owners before they grow.

| Owner | Headroom before 800 nonblank lines |
|---|---:|
| [Activity body ownership](../../packages/semantic-core/src/activity-occurrence.ts) | 568 |
| [Closure evaluator](../../packages/semantic-core/src/semantic-process-closure.ts) | 609 |
| [Runtime state](../../packages/semantic-core/src/semantic-process-state.ts) | 344 |

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
