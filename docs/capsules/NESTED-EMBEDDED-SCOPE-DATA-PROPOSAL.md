# Nested embedded scope data proposal

## Status

Lifecycle: draft
Review: pending

## Question and delivery boundary

Can a business process nest ordinary embedded Sub-Processes, declare local data on each, read and write that data by the CIB name-resolution rule and carry portable structured values through it, while every scope still completes only at its own quiescence?

This is the first increment of the embedded and called scope family selected in [PLAN](../PLAN.md#exact-resume-point). It serves `PC-SCOPE-01` and the embedded-owner parts of `PC-DATA-03` to `PC-DATA-06` in the [coverage checklist](../PRACTICAL-CIB7-COVERAGE-TARGET.md#business-data-and-expressions). Expression-based mappings wait for `PC-DATA-07`. Two later increments of the same family need decisions this proposal does not make: Call input/output mapping (`PC-SCOPE-04`) depends on the called-definition policy of `PC-SCOPE-03`, and repeated or concurrent activations of one definition (`PC-SCOPE-02`) depend on cycles or implicit merges (`PC-CF-06`, `PC-CF-07`). Each will be proposed as an amendment to this capsule; under the [family review unit](../REVIEW-POLICY.md#independent-cold-review-gate) the family then takes one checkpoint and one closure review.

## Normative basis and CIB classification

BPMN 2.0.2 Clause 10.3.5 makes an embedded Sub-Process a contextual scope, and Clause 13.3.4 completes its instance only when no token remains inside and no contained Activity is active. Clause 10.4.1 ties a Property's or Data Object's lifetime to its parent Sub-Process instance and makes it accessible to that parent's children, including nested descendants. BPMN references such data by element identity, so it has no name shadowing and no rule for writing an undeclared name.

CIB Seven `2.2.0` operationalizes scope data by name. At the pinned revision (`5a45b47ea2`, verified by the `research` doctor scope), `checkActivityInputOutputSupported` in `BpmnParse` accepts `camunda:inputOutput` on an ordinary `subProcess` and refuses output parameters only on End Events and Multi-Instance constructs. `PvmExecutionImpl.executeIoMapping` runs every input parameter at entry; `InputParameter` evaluates in the outer scope and installs a local binding. `ExecutionEntity.destroy` runs the output parameters when the scope ends; `OutputParameter` evaluates in the inner scope and calls `setVariable` on the outer scope. `AbstractVariableScope.setVariable` updates the binding in the nearest scope that has the name locally, walks parent by parent and creates it at the root only when no scope has it. A present null is a local binding and therefore shadows.

This proposal adds candidate `CIB-EXT-0020` (nested embedded scope locals and nearest-owner writes) to the [relation register](../CIB-BPMN-RELATION-REGISTER.md). It broadens the one-body-level account of `CIB-EXT-0017` to a nested chain of ordinary embedded scopes; `CIB-EXT-0017` itself stays unchanged. The name-based account is a CIB extension layered over the BPMN scope and lifetime rules, not a reinterpretation of them.

## Required, optional and excluded scope

Required: one private executable root Process with None Start and None End; ordinary embedded Sub-Processes nested to a definition depth of at most three below the root; inside each scope one None Start, one or more None Ends, User Tasks, mapped Service Tasks under the existing effect contract, and Parallel Gateway forks and joins; Sub-Process `camunda:inputParameter` declarations whose value is a String literal or an exact `${name}` reference; Sub-Process `camunda:outputParameter` declarations whose value is an exact `${name}` reference to a name declared by the same Sub-Process.

Optional: any finite number of such scopes, tasks and branches within the depth bound; scopes without declarations; separate child None Ends on distinct branches; reused names at several levels.

Excluded: Call Activities, repeated or concurrent activation of one Sub-Process definition, cycles, Event Sub-Processes, boundary Events, Exclusive or Inclusive Gateways, conditions, Multi-Instance, Transactions, Compensation, JUEL beyond exact `${name}`, script or list/map mapping notation, output sources that are not declared locals of the same scope, BPMN `property` and `dataObject` declarations inside Sub-Processes, and any new public observation field. These restrictions bound admission only; the representation below admits the excluded constructs later without reinterpreting accepted models.

## Profile and value domain

Candidate identity: `cibseven-2.2.0-nested-embedded-scope-data-draft`, the family's cumulative profile, widened in place by later increments under the [pre-baseline profile rule](../../contracts/README.md). Its ingress and scope-local value domain is `SingletonBusinessItem` from the [portable values capsule](PORTABLE-BUSINESS-VALUES-PROPOSAL.md#public-value-contract), with the 1,024-byte root-String bound: Start bindings, User Task completion patches, Service effect arguments and results, scope locals and output targets. Every copy across a scope boundary is by value; no committed state shares structure with a caller-owned stimulus.

## Representation and runtime ownership

No new opcode, runtime owner or wire field is added. The checked graph keeps explicit definition containment from the [embedded completion specification](EMBEDDED-SUBPROCESS-COMPLETION-SPEC.md#checked-source-and-semantic-process-definition), lifting its depth-one admission bound to three. Scope locals use the existing occurrence-keyed `variables.scopes` frames from [scoped data](SCOPED-DATA-SPEC.md), already shared by the sequential and parallel Multi-Instance bodies. Runtime scope occurrences already carry their parent occurrence, so the chain below is derived, not stored.

The scope-local, mapping and output policy becomes profile-derived, following the `PropertyPathValuePolicy` and effect-mapping precedents: arms `scalar` and `singletonBusinessItem`, with every existing profile pinned to `scalar` by equality theorems under unchanged names, and only this profile selecting `singletonBusinessItem`.

## Stable rules and separating witnesses

`NSD-ADMIT-01`: admission accepts exactly the required and optional scope above, rejects every exclusion and every parser warning, and refuses an output source that is not a name declared by the same Sub-Process.

`NSD-COMPLETE-01`: a scope occurrence completes only when it and every descendant scope occurrence own no token, task, wait or effect; completion disposes the occurrence and emits exactly one parent output. Witness: an outer scope forks into a User Task and an inner scope with two separately ending branches; completing the inner branches first completes only the inner scope, and the outer scope completes once after its own task. A first-End or wrong-parent completion mutant changes the observed open tasks.

`NSD-INIT-01`: entry evaluates every input parameter against the visible context of the entering parent occurrence before the new frame exists, then installs one frame owned by the new occurrence. Declaration order is irrelevant and an input cannot read a sibling input. Duplicate declared names refuse admission.

`NSD-READ-01`: a name resolves by walking from the reading occurrence's scope outward through its parent occurrences. The first frame declaring the name decides, including a present null; otherwise the Process binding decides; otherwise the name is unavailable under the existing unavailable-input rule. Witness: Process `status = "open"` and `initialStatus = null`; the outer scope declares `status = ${initialStatus}`; a Service Task two levels deeper maps `${status}` into its argument, and the open effect shows `null`, not `"open"`.

`NSD-WRITE-01`: a User Task completion binding or Service output updates the nearest frame on the writer's chain that declares the name, otherwise the Process binding, creating it when absent; it never creates a local and never changes another frame. Witness: an inner User Task completes with `status = "approved"`; the outer frame changes, a sibling scope's `status` and the Process `status` stay unchanged. Flattening every write to the Process, or writing to the innermost frame, each changes a later effect argument or the final Process variables.

`NSD-OUTPUT-01`: at normal completion, each output parameter reads its source from the completing frame and writes through `NSD-WRITE-01` starting at the parent occurrence. Targets are distinct; validation and all writes commit atomically with completion and disposal. Because sources are declared locals, an earlier output cannot change a later source. Witness: two outputs fan a structured order and a status out to differently named Process targets; a reordered declaration commits the identical state.

`NSD-RETIRE-01`: disposal removes exactly the completing occurrence's frame; the Process, ancestors and siblings keep their bindings, and no retired local remains readable.

`NSD-VALUE-01`: an order Map with two equal line items, a nested address with a present null and a negative Decimal, referenced into the outer frame, read by a nested effect, returned as a modified result and copied out to the Process, keeps multiplicity, order, Map keys, Decimal scale and null through every state, observation and restoration. A root List or a 1,025-byte root String refuses atomically at the surface that introduces it.

`NSD-REFUSE-01`: every refusal leaves the predecessor state, frames, tasks and effects unchanged.

Observation adds nothing: reads are observed through existing `openEffects` arguments, writes through later arguments and the Process `variables`, and [SDATA-OBSERVE-02](SCOPED-DATA-SPEC.md#sdata-observe-02) remains the projection boundary.

## Lean assurance lane

Lane shape: proved

Evidence: the starting owners are [scope variable data](../../BpmnSemantics/SemanticProcess/ScopeVariableData.lean), [scoped data primitives](../../BpmnSemantics/SemanticProcess/Data.lean) and the embedded scope completion relation; they are inputs to this account, not evidence for it.

Under the [risk-tiered lane rule](../PROJECT-DESIGN.md#lean-assurance-lane) nested quiescence involves concurrency, so `NSD-COMPLETE-01` and the frame laws are proved; source admission and witnesses are checked. Required quantified laws: completion is enabled only when the occurrence and its descendants own no work; chain read equals the first declaring frame or the Process; a write changes exactly the nearest declaring frame or the Process; disposal removes exactly one frame; every `scalar`-pinned profile keeps its current behavior. Finite admitted-source traces discharge the hypotheses for the witnesses above. The bound is two new law owners and one conformance owner, each at most 800 nonblank lines; growth beyond it triggers replanning.

The core Lean edits to `Data`, `ScopeVariableData`, the multi-instance scope write and `ValueDomain` (including its pending unused-simp-argument lint) are made in one batch, followed by one full Lean gate at family acceptance.

## Temporal hosting and refinement preflight

No new hosting mechanism is introduced. Durable ingress stays the existing Start, User Task completion and effect result; waits are existing User Task waits and effect Activities; there are no timers, Message waits, cancellation or interruption in this increment. Nested frames are ordinary runtime state carried through Continue-As-New, so the risk is size, not ordering: the profile joins the Start capacity envelope with a reserved journey covering the deepest admitted frames. Delivery, deduplication and replay reuse the existing effect and task identity. Under the once-per-mechanism rule no dedicated refinement witness is required; the registered scenarios run through the complete differential and Temporal pipeline at family acceptance.

## Evidence and acceptance

One retained business model, a purchase-order approval whose outer approval scope nests a compliance scope beside a credit check, carries the witnesses as answer-free scenarios with registered pipeline cases, seeded mutations, value-domain matrix rows, a corpus row and the About disclosure. The CIB lane is a calibration probe extending the existing body-data probe to two nested levels. Acceptance: Lean, core and pipeline agree on every scenario; the hosted pipeline passes once at family acceptance; `PC-SCOPE-01` and the embedded-owner acceptance clauses of `PC-DATA-04` to `PC-DATA-06` are evidenced, while their Call, repeated-activation and Multi-Instance clauses stay open.

## Versioning consequences

Apply the [pre-release wire policy](../../contracts/README.md#evolution-policy): the new profile identity is additive, every existing profile keeps its meaning through the `scalar` pin, and no wire field, legacy reader or migration is added. Before the first edit, `node scripts/what-binds.ts` on every grown path names the binding guards; the decisive ones are the [cross-target domain matrix](../../packages/differential/test/scenario-value-domain-lean-core.integration-test.ts), [contract artifact projections](../../scripts/contract-artifact-projections.test.ts) for `CIB-EXT-0020`, [Lean import boundaries](../../scripts/lean-import-boundaries.test.ts), [source hygiene](../../scripts/source-hygiene.test.ts) and the [executable model corpus](../../model-corpus/test/executable-model-corpus.test.ts).

### Owners this implementation grows

- Lean: scope variable data, scoped data primitives, multi-instance scope write, value domains, profile shapes, embedded scope admission and completion, and one new conformance owner.
- TypeScript core: scope variable data, sequential and parallel scope data readers, multi-instance scope write, semantic process data, profile catalog, value domains and restoration, graph policy and scope runtime.
- Source: embedded Sub-Process source admission, the business mapping source for Sub-Process parameters, compilation dispatch and preservation capability.
- Temporal: Start capacity envelope and journey.
- Registration: profile artifact, scenarios, pipeline cases, value contract, corpus and About.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
