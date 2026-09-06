# Runtime initialization assurance repair specification

## Status

Lifecycle: implemented
Review: closure-approved

## Question and current boundary

Which initialization boundary establishes the complete current runtime-state invariant when a Program declares a Compensation parent snapshot?

The [initialization proof owner](../../BpmnSemantics/SemanticProcess/RuntimeStateWellFormedInitialization.lean) establishes the complete invariant at actual committed start admission under the explicit output-position hypothesis. Its raw `runningProgramStartState?` theorem and raw Message/Timer corollaries require absence of a snapshot declaration: a structurally valid selected-root Program can produce a raw running state satisfying `runtimePositionValid` while failing the snapshot conjunct and therefore `runtimeStateWellFormed`. [Command admission](../../BpmnSemantics/SemanticProcess/CommandAdmission.lean) reserves that root context afterward and validates the prepared snapshot state before returning a committed admission.

The [import guard](../../scripts/lean-import-boundaries.test.ts) requires default-root reachability for maintained non-experimental named theorem owners as well as conformance files. This keeps initialization under the default kernel check when its predicate grows; filename-only enrollment cannot establish that assurance boundary.

## Required, optional, and excluded functionality

Required: preserve the exact `initialState_wellFormed` signature; establish the complete unchanged runtime invariant for successful actual start admission from `initialState`; retain the existing `runtimePositionValid` hypothesis on the result; supply end-to-end corollaries for all three admitted start constructors through both snapshot-aware and declaration-free legacy admission; accurately restrict the raw-builder theorem and its raw Message/Timer corollaries; and make maintained assurance owners reachable from the default Lean root.

Optional functionality: none.

Excluded: changing the raw running-state builder, the aggregate runtime invariant or its conjuncts, source or Program admission, profile selection, RuntimeState representation, public observation, command outcomes, or any runtime transition. General initialization from arbitrary prior states, full-invariant preservation across internal closure or every transition, removal of the position hypothesis, new CIB behavior, and a Temporal refinement theorem are outside this repair. The separately approved [empty-state capacity correction](COMPENSATION-EMPTY-STATE-CAPACITY-REPAIR-PROPOSAL.md) supplies the execution-capacity prerequisite; this repair neither revises that account nor licenses a capacity exception.

## Selected proof contract

All rules below belong to project-owned Lean assurance. They select no BPMN interpretation or CIB relationship and introduce no runtime-only construct, semantic operation, stimulus, or wire field. The [runtime invariant specification](../RUNTIME-STATE-INVARIANT-SPEC.md#contract) continues to own the predicate.

| Rule | Required proposition |
|---|---|
| `RINIT-EMPTY-01` | For every `program : Program` and `instanceId : SemanticId`, `runtimePositionValid program instanceId initialState = true` implies `runtimeStateWellFormed program instanceId initialState = true`, with the existing theorem name and signature unchanged. |
| `RINIT-START-01` | For each `startProcess`, `triggerMessageStart`, or `triggerTimerStart` stimulus whose requested instance is `instanceId`, a committed result of `admitStimulusWithCompensationSnapshots program initialState stimulus` satisfying `runtimePositionValid program instanceId result.state = true` satisfies the complete `runtimeStateWellFormed program instanceId result.state = true`. No hypothesis assumes the output's full invariant or its missing snapshot conjunct. |
| `RINIT-LEGACY-01` | The same complete guarantee holds for committed `admitStimulus program initialState stimulus` starts. Its successful domain is declaration-free, and the existing declaration-free equality with snapshot-aware admission transfers the guarantee. |
| `RINIT-RAW-01` | The unchanged raw builder remains an intermediate state constructor. Its full-invariant theorem and raw Message/Timer corollaries explicitly require absence of a snapshot declaration; they no longer claim the false declaration-bearing quantified result. |
| `RINIT-REACH-01` | Every maintained non-experimental Lean assurance owner selected by the source-derived rule below is reachable from `BpmnSemantics.lean`, so changing a predicate cannot leave its maintained theorem owner outside the default kernel check. |

`RSI-OBL-01` retains its existing proposition. `RSI-OBL-02` is corrected to the actual committed-start boundary described by `RINIT-START-01` and `RINIT-LEGACY-01`; the former unrestricted raw-constructor proposition is explicitly withdrawn. Existing consumers of a raw theorem must establish its new declaration-free premise or consume the actual-admission theorem. A proof compatibility wrapper that silently reinstates the false proposition is excluded.

The successful admission equation establishes the started-state frame: initialization leaves no live task, timer, effect, incident, controller, Activity record, retained completed Activity, trigger, or handler-effect wait. Root reservation may change only `compensationParentContextRetentions`. The snapshot conjunct follows from `admitStimulusWithCompensationSnapshots_committed_stateValid` for declaring Programs and from the empty declaration-free state otherwise; all other conjuncts follow from that derived frame and the existing position premise. This is a proof over the existing constructor and admission equations, not a new gate that tests the desired full conclusion.

## Lean assurance lane

Lane shape: proved

Evidence: quantified initialization and committed-start laws in the [initialization owner](../../BpmnSemantics/SemanticProcess/RuntimeStateWellFormedInitialization.lean), using the [snapshot-aware admission guarantee](../../BpmnSemantics/SemanticProcess/CommandAdmission.lean) and [kernel-decided raw-versus-reserved witnesses](../../BpmnSemantics/RuntimeStateInitializationConformance.lean). The successful-admission equation and explicit position hypothesis are the complete public premises; no full post-state well-formedness premise is added.

The general preservation and other open obligations in the [existing specification](../RUNTIME-STATE-INVARIANT-SPEC.md#the-deliberately-open-lane) remain separately owned. This quantified initialization lane neither weakens their predicate nor supplies their missing transition induction.

## Evidence and cross-target matrix

| Boundary | Lean evidence required | Independent or negative discriminator | Explicit non-requirement |
|---|---|---|---|
| Empty state | Existing-signature theorem covers the full current conjunction, including declaration-owned empty collections | Declaration-free and valid declaring Programs; execution-byte capacity is supplied by its separate correction | No unconditional `programWellFormed` or position theorem |
| Raw versus reserved root | Minimal structurally valid Program has a successful raw constructor and true position predicate but false snapshot/full invariant; actual committed admission of that Program satisfies the complete invariant | Replacing the actual admitted result by the raw result must fail; the witness checks committed admission independently of structural validity | A registered profile identifier alone is not proof of full profile-capability admission |
| Start family | Quantified theorem plus named ordinary, Message, and Timer committed-admission corollaries | Declaration-free, selected-root, and child-only snapshot declarations across all three start kinds where existing admission permits them; exact root identity and unchanged non-snapshot fields | No new source profile or start shape to fill a matrix cell |
| Capacity refusal | Existing actual admission retains exact `initialState` when root reservation refuses capacity | Otherwise admitted selected-root case whose limit cannot reserve the candidate; no committed result | No guarantee that every well-formed declaration can fit a nonempty reservation |
| Build reachability | Default root includes the maintained initialization owner and every source-derived assurance owner | Omitted initialization and differently named preservation owners both reject; transitive imports pass and comment/string-only imports do not confer reachability | Reachability alone proves no theorem or semantic claim |
| TypeScript, CIB, Temporal | Existing complete gates retain their current behavioral evidence | Exact unchanged runtime producers and registered results constrain accidental behavioral edits | No new correspondence, CIB, replay, or hosting evidence lane is claimed |

The retained kernel witness separates the raw result from actual committed admission. A child-only declaration is a separate control: absence of a selected root must not be mistaken for a requirement to manufacture a root reservation. Capacity refusal and positive reservation execute the existing admission path, so the committed premise is demonstrably satisfiable.

The Lean laws and their Lean fixtures share the same account and count as one lane. The build guard establishes kernel reachability rather than an independent semantic account. The nearest unsupported claim remains complete runtime-state preservation after arbitrary admitted execution, including internal closure after the start admission; this repair establishes only its initialization base.

## Temporal hosting and refinement preflight

This assurance correction adds no durable ingress, wait, timer, effect, cancellation, lifecycle, projection, delivery, ordering, concurrency, deduplication, retry, or replay mechanism. Existing start admission, reservation, and committed-state transport remain byte-identical. The host continues to consume the actual committed state, and the state relation remains exact carriage of that state. The nearest host counterexample would be using the intermediate raw state as a committed publication; the existing complete verifier remains regression evidence, while this repair proves no new Temporal proposition and requires no synthetic host capability.

## Versioning consequences

The [initialization owner](../../BpmnSemantics/SemanticProcess/RuntimeStateWellFormedInitialization.lean) changes theorem boundaries and proofs; [command admission](../../BpmnSemantics/SemanticProcess/CommandAdmission.lean) may add only proof lemmas exposing its existing started-state frame. The [root library](../../BpmnSemantics.lean) imports the maintained assurance closure. The [import-boundary guard](../../scripts/lean-import-boundaries.test.ts) reuses its current import graph, [literal-aware Lean analysis](../../scripts/lean-source-analysis.ts), and tracked/pending source discovery: select non-experimental `BpmnSemantics/` files that either satisfy the existing conformance-name rule or contain a real named `theorem` declaration, then require root reachability. Declaration modifiers, attributes, indentation, comments, and literals must be separated by lexical analysis. An orphan with a different basename is still in the class. No exhaustive file registry or filename-only initialization exception is introduced.

The [runtime invariant specification](../RUNTIME-STATE-INVARIANT-SPEC.md), [`implementation-status-delegation:ENGINE-SEMANTIC-INVARIANT`](../ENGINE-SEMANTIC-INVARIANT-IMPLEMENTATION-MAP.md#runtime-state-well-formedness), [`implementation-status-owner:ENGINE-RUNTIME-PROOF`](../ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [`implementation-status-owner:ASSURANCE-ADOPTION`](../ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md), [testing specification](../TESTING-SPEC.md), [documentation registry](../README.md), [capsule registry](README.md), and [PLAN](../PLAN.md) must describe the corrected guarantee and its current evidence without retaining the unrestricted raw-state claim. Existing runtime bytes, profiles, schemas, public APIs, and histories need no version or migration; the pre-release policy supplies no exemption from accurate proof claims.

Mechanically routed constraints include [source hygiene](../../scripts/source-hygiene.test.ts), [Lean source contracts](../../scripts/lean-source-contracts.test.ts), [import boundaries](../../scripts/lean-import-boundaries.test.ts), [module cost](../../scripts/lean-module-cost.test.ts), [verification entry points](../../scripts/verification-entrypoint.test.ts), [operation-consumer census](../../scripts/semantic-operation-consumer-census.test.ts), [Activity writer census](../../scripts/activity-occurrence-writer-census.test.ts), [internal-commutation census](../../scripts/internal-commutation-census.test.ts), [removal completeness](../../scripts/runtime-collection-removal-completeness.test.ts), [pre-release architecture](../../scripts/pre-release-architecture.test.ts), [document reviewability](../../scripts/document-reviewability.test.ts), [review receipts](../../scripts/independent-review-policy.test.ts), [document control plane](../../scripts/document-control-plane.test.ts), [map routes](../../scripts/structural-map-routes.test.ts), and [Markdown links](../../scripts/markdown-links.test.ts). The remaining tree-wide guards reported by [what-binds](../../scripts/what-binds.ts) remain constraints, not permission to change their separate product owners.

## Closure evidence and reflection

The unchanged empty-state theorem, generic actual-admission bridges, six named committed-start corollaries, and accurately restricted raw-start theorems pass their focused kernel gates. The retained witness checks the raw root-reservation counterexample beside successful actual admission, declaration-free ordinary/Message/Timer starts, child-only declaration behavior, capacity refusal, and existing declared-Message/Timer profile refusals. These are initialization facts under the specified position premise, not general execution preservation.

The source-derived import guard's separating cases cover omitted initialization and differently named preservation owners, transitive imports, declaration modifiers, and false declarations inside comments, strings, or quoted identifiers. Complete Product 1 verification passed at closure target `64c524b7`. The [cost ledger](../CAPSULE-COST-LEDGER.md#measurements) records the conservative combined initialization/runtime-ownership range, comparison with empty-state capacity, and immutable fixed-limit consumer measurements. Public admission-frame lemmas place the proof at the actual committed boundary; source-derived theorem discovery removes manual assurance enrollment without inventing another registry.

Warm closure continues the approved checkpoint audit at `a3c9176e`. Its executable continuity manifest preserves the selected account, public contract, exclusions, and evidence strategy with digest `3f03bbebff45439c734225fa54bb4163bd414e7a6c3be4976813adb961a0f708`. The reviewer verified selector completeness, exact bytes, ancestry, cost reproduction, and the complete gate. Approval closes this initialization repair alone; capacity, start-data, native deployment, and general preservation retain their own boundaries.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `fa7c01ffb69681286241e9127ae5e75b03ff5ef8` | `fork-turns-none` | `approve` | `not-required` |
| Semantic checkpoint | `d7469e19d90811bf1b1de99adb5942cc8f3d4470` | `fork-turns-none` | `approve-with-required-edits` | `a3c9176e70388b2ac132e37fe1f3cd9b6cc848c7` |
| Closure | `64c524b797d341b001d2e8afddcc23830a3ab85f` | `checkpoint-reviewer-warm` | `approve` | `not-required` |
