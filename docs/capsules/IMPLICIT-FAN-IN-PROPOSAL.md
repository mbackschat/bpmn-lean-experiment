# Implicit fan-in proposal

## Status

Lifecycle: draft
Review: rejected

## Question and delivery boundary

Can the nested scope-data profile admit Activities and None End Events with two or more incoming Sequence Flows in its root graph, so that every token arriving on any of them starts its own occurrence of the node without waiting for the others, while every model, command and observation the profile admits today keeps its meaning and every other profile keeps its single-incoming nodes?

This is the next family of batch 4 in [PLAN](../PLAN.md#scheduled-delivery-batches). Its shared mechanism is the uncontrolled-flow merge: a many-input `mergeExclusive` owned by the node it enters. The [scope re-entry account](SCOPE-REENTRY-SPEC.md#admission) already admits explicit Merges of any arity in this profile's root graph, and the [pass-through Task specification](PASS-THROUGH-TASK-SPEC.md#required-optional-and-excluded-scope) recorded that "an implicit merge, for example, lowers to a many-input `mergeExclusive`, which is CIB's per-token activation". The family takes every open row of the [coverage checklist](../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) that shares that mechanism, each for this profile's root graph only:

- `PC-CF-07`, its merge clause: one arriving token activates one Activity occurrence rather than synchronizing all incoming flows, and two arrivals give two occurrences;
- `PC-HUM-05`, its implicit merge clause: a Manual Task with several incoming flows passes each token once, keeping its own source kind;
- the uncontrolled incoming flow of [`BPMN-MECH-FLOW-01`](../BPMN-REQUIREMENT-LEDGER.md) at None End Events, which no checklist row names separately and which the same lowering serves.

Screened out, each with its reason:

- `PC-CF-07`'s implicit split: several outgoing flows from an Activity are a Parallel or Inclusive split (Clause 13.3.1), which the re-entry account refuses because it splits no token.
- Fan-in inside Sub-Process bodies and the called Process: their bodies are single serial paths in this profile, so fan-in there needs a body Choice, which stays excluded.
- Fan-in in models that fork: two concurrent arrivals at one node need the concurrent account's merge, which it refuses.
- Fan-in into a Gateway other than a converging Exclusive Gateway: that is a mixed or joining Gateway, a different mechanism.

Each row keeps its other clauses open.

Selection, 2026-11-02, a close call against default-less Choices (the `PC-CF-02` clause screened out by [Exclusive choice arity](EXCLUSIVE-CHOICE-ARITY-SPEC.md#question-and-delivery-boundary)): default-less Choices reach more clean models, but their no-match is a runtime exception that needs an optional default in the kernel `choose` constructor and a flag-free rollback channel through the closure result that the closure proofs unfold, while this family needs neither. Counted over the 1,944 parsed BPMN files among the 1,947 in the pinned CIB engine test resources, with "clean" meaning no Parallel, Inclusive or Event-Based Gateway, boundary or intermediate catch Event, Multi-Instance, Script, Receive, Send, Rule, Call or Transaction:

- a None End Event with two or more incoming flows: 131 files, 11 clean;
- an Activity with two or more incoming flows and none with two or more outgoing: 17 files, 8 clean;
- for comparison, a divergent Exclusive Gateway without a default: 49 files, 27 clean.

## Normative basis and CIB classification

**BPMN.** Clause 13.3.1 (reading copy line 12286): an Activity that is the target of several Sequence Flows "participates in uncontrolled flow": for each token arriving on any incoming flow the Activity "will be enabled independently of the arrival of tokens on other incoming Sequence Flows", and "the presence of multiple incoming Sequence Flows behaves as an exclusive gateway". The Activity note of Clause 10.3 (line 4614) adds that a further token "from the same path or another path" creates "a separate instance of the Activity". The Event note of Clause 10.5 (line 7727) states the same for Events with several incoming flows. Open issue [BPMN21-268](https://issues.omg.org/issues/BPMN21-268) concerns exactly this repeated activation; it questions modelling style, not the per-token reading, which three clauses state alike.

**CIB Seven.** At pinned `5a45b47`, a transition's execution enters its destination activity without consulting the destination's other incoming transitions (`pvm/runtime/operation/AbstractPvmAtomicOperationTransitionNotifyListenerTake.java`). Only `ParallelGatewayActivityBehavior`, `InclusiveGatewayActivityBehavior` and `ParallelMultiInstanceActivityBehavior` under `bpmn/behavior/` collect joining executions; no Task, Sub-Process, Call Activity or End Event behavior does. Each arrival therefore creates its own activity instance, and no instance is created for the merge itself.

Register change: a new entry `CIB-AGR-0015 — uncontrolled incoming Sequence Flow activates the target once per token`, a normative agreement bounded to this profile's root graph, added with its verifier coverage.

## Required, optional and excluded scope

Required: every model the profile admits today, unchanged. In addition, in the root graph of the [re-entry account](SCOPE-REENTRY-SPEC.md#admission), a User Task, Service Task, pass-through Abstract or Manual Task, embedded Sub-Process, Call Activity or None End Event with two or more incoming Sequence Flows. Every incoming flow keeps its own identity; everything else about the root graph, its Choices and Merges, Sub-Process bodies and the called Process is as today.

Optional: several fan-in nodes in one model, on cycles or not, and a fan-in node directly after a Choice, a Merge or another fan-in node.

Excluded:

- an Activity or None End Event with two or more outgoing flows (implicit split);
- fan-in inside a Sub-Process body or the called Process;
- fan-in in a model that forks;
- fan-in into any Gateway other than a converging Exclusive Gateway;
- every other exclusion of the re-entry account;
- fan-in in any other profile.

These bound admission only: a later body fan-in or fan-in under forks broadens the class with the same lowering, without reinterpreting an admitted model.

## Profile and public contract

The profile `cibseven-2.2.0-nested-embedded-scope-data-draft` grows in place under the [cumulative profile rule](../../contracts/README.md). The [profile artifact](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json) gains the feature `uncontrolled-incoming-sequence-flow` and the relationship `CIB-AGR-0015`, and its exclusion `implicit-task-split-merge` becomes `implicit-activity-split` plus `uncontrolled-incoming-flow-outside-the-root-graph`. The [profile README](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/README.md) states the class. Observation adds nothing: every arrival publishes the target's ordinary occurrence and nothing for the merge.

## Representation and runtime ownership

**No new opcode, Program field, checked node kind or transition family.** A node N with k ≥ 2 incoming flows lowers to one k-input `mergeExclusive` whose origin is N and whose output N's own operation consumes. A pass-through Task is already a one-input `mergeExclusive` with its own origin, so a pass-through Task with fan-in is that same operation with k inputs. The single-producer rule of [`GraphValidation`](../../BpmnSemantics/SemanticProcess/GraphValidation.lean) keeps holding, because every incoming flow keeps its own control place and only the merge consumes them.

**One publication rule, a body edit.** `IFI-PUBLISH-01` below makes a `mergeExclusive` whose output is consumed by an operation with the same origin publish no occurrence: it is N's uncontrolled-flow entry, not a flow node, exactly as CIB records no instance for it. Every other `mergeExclusive`, including a pass-through Task with or without fan-in, publishes as today. The rule holds wherever a merge's lifecycle is derived:

- in Lean, the `mergeExclusive` arm of `candidateFlowNodeOccurrenceDeltaForOwnedOperation?` in [`FlowNodeOccurrenceLifecycle`](../../BpmnSemantics/SemanticProcess/FlowNodeOccurrenceLifecycle.lean), and the merge lifecycle template its preparation owners prove equal to it;
- in TypeScript, the [lifecycle](../../packages/semantic-core/src/flow-node-occurrence-lifecycle.ts), the [publication completeness](../../packages/semantic-core/src/flow-node-occurrence-publication-completeness.ts) projection and the [merge preparation](../../packages/semantic-core/src/internal-transition-merge-preparation.ts), through one new family-owned predicate module so that the two owners nearest their size target do not grow.

The transition itself is unchanged: a fan-in merge fires in one internal step per arriving token, as a two-input Merge does today, so the re-entry burst (`SRE-BURST-01`), cycle cut (`SRE-CYCLE-01`) and Start rule (`SRE-AVAILABLE-01`) count, cut and read it as a Merge followed by its node.

## Admission

Admission stays [profile-parameterized](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md). The single-incoming bound for this profile's root graph sits at these loci, and each widens for this profile only:

- the incoming arity of the six node kinds above in [`CheckedProcessAdmission`](../../BpmnSemantics/SemanticProcess/CheckedProcessAdmission.lean) and in the source [checked-process admission](../../packages/bpmn-source/src/checked-process-admission.ts) and [checked graph admission](../../packages/bpmn-source/src/checked-process-graph-admission.ts);
- the checked root vertex projection of the re-entry account in [`ScopeReentryAdmission`](../../BpmnSemantics/SemanticProcess/ScopeReentryAdmission.lean) and the TypeScript [re-entry admission](../../packages/semantic-core/src/scope-reentry-admission.ts), where a node with k ≥ 2 incoming flows projects to a k-input Merge vertex followed by its own vertex, or, for a pass-through Task, to the k-input Merge vertex alone, matching the Program-level projection of the lowered operations;
- the lowering in the [nested scope-data source](../../packages/bpmn-source/src/nested-scope-data-source.ts).

The Program-level route rule `SRE-ROUTE-01` already counts every root `mergeExclusive` of two or more inputs as a Merge, so a fan-in model routes to the re-entry account at both levels; every admitted fan-in model also holds a Choice, because without a split only a Choice creates a second path. No Program-level arity check changes.

The nearest wrong algorithms each have a separating witness below:

1. the single-incoming bound kept at one locus, which refuses the model at that level;
2. the bound lifted for every profile;
3. the merge as a join that waits for every incoming flow;
4. a second arrival that reuses the first arrival's occurrence;
5. the merge publishing its own occurrence of the target, or a pass-through Task with fan-in publishing nothing.

## Stable rules

- `IFI-ADMIT-01`: admission accepts exactly the required and optional scope above under this profile, refuses every exclusion and parser warning, and leaves every model admitted today, under every profile, with its admission.
- `IFI-TOKEN-01`: a token arriving on any incoming flow of an admitted fan-in node starts one new occurrence of that node, whether or not tokens arrived or will arrive on its other incoming flows.
- `IFI-PUBLISH-01`: the uncontrolled-flow entry of a fan-in node publishes no occurrence of its own; each arrival publishes exactly what one arrival at a single-incoming node of the same kind publishes, so a pass-through Task publishes one instantaneous occurrence per arrival.

## Newly reachable waits and resumption

None. A fan-in merge is an internal step between waits the profile already admits, and each fan-in node is a node kind of the re-entry account. The host capability obligation is the existing one for re-entry Programs: the Start capacity envelope's Program-level and reserved-result checks.

## Separating witnesses

The witness model is *Travel request*, retained under `scenarios/implicit-fan-in/` with a source overlay for its one Service Task:

- **Submit request**, a User Task entered from the Start and from the rework path.
- **Assess request**, a Sub-Process whose User Task *Check request* writes `decision` and `channel`, which it copies to the Process.
- **Route request**, a Choice: `stringEquals(decision,"revise")` to User Task *Revise request*, which flows back to *Submit request*; `stringEquals(decision,"reject")` to the None End *Request closed*; `stringEquals(decision,"urgent")` to the Manual Task *Phone travel desk*, which flows to *Book travel*; and the default to the mapped Service Task *Book travel*.
- **Confirm booking**, a Choice after *Book travel*: `stringEquals(channel,"phone")` to User Task *Call traveller*, which flows to the Manual Task *File booking*; and the default to *File booking*.
- *File booking* flows to *Request closed*.

So the fan-in nodes are *Submit request* (User Task, on the cycle), *Book travel* (Service Task), *File booking* (Manual Task) and *Request closed* (None End).

Journeys:

- **Revised, then approved.** *Submit request* opens twice, the second time from the rework flow with a new occurrence (`IFI-TOKEN-01`, wrong algorithm 4). The second assessment takes the default to *Book travel*, then *File booking* from the default and *Request closed*.
- **Urgent, by phone.** *Phone travel desk* passes, *Book travel* is armed from its second incoming flow without waiting for the first (`IFI-TOKEN-01`, wrong algorithm 3), and *File booking* passes from *Call traveller*.
- **Rejected.** *Request closed* is reached from *Route request* directly, the End's first incoming flow.

Each journey's publications show one occurrence per arrival for every fan-in node, no occurrence for an entry merge, and one instantaneous occurrence of *File booking* per arrival (`IFI-PUBLISH-01`, wrong algorithm 5).

Admission witnesses at both levels:

- the model and an edit whose rework flow enters *Assess request* instead, a Sub-Process with fan-in, are admitted;
- refused edits: a second outgoing flow from *Book travel* (implicit split); *Check request* with a second incoming flow inside *Assess request*; and a Parallel fork whose two branches both enter *Book travel*.

Profile control (wrong algorithm 2), per locus: the existing per-profile loops of the [mixed-task control-flow source test](../../packages/bpmn-source/test/mixed-task-control-flow-source.test.ts) gain a fan-in node, which only this profile admits, and the new Lean conformance module evaluates the checked arity check on the model under a profile id that keeps single incoming flows.

Existing witnesses that change: the refusal of uncontrolled Activity fan-in in the [scope re-entry source test](../../packages/bpmn-source/test/scope-reentry-source.test.ts) and the [cyclic control-flow specification](CYCLIC-CONTROL-FLOW-SPEC.md) exclusion stay for every other profile; for this profile they become admitted witnesses where they lie in the root graph.

## Rule-to-evidence matrix

| Rule | Positive and negative witness | Lanes | Killing mutation |
|---|---|---|---|
| `IFI-ADMIT-01` | The model and its Sub-Process edit admitted at both levels; each refused edit refused; the per-locus profile control; every retained model of every profile keeps its admission | Source, core, Lean conformance module, corpus | Keep the single-incoming bound at any one locus, or lift it for every profile |
| `IFI-TOKEN-01` | Two occurrences of *Submit request* in the revised journey; *Book travel* armed from its second flow alone in the urgent journey | Pipeline, core runtime test, CIB probe | Join all incoming flows, or reuse the first occurrence for the second arrival |
| `IFI-PUBLISH-01` | Each journey's lifecycle publications: one occurrence per arrival, none for an entry merge, one instantaneous *File booking* per arrival | Pipeline, core runtime test, Lean conformance module, CIB probe | Publish an entry merge as an occurrence of its target, or suppress a pass-through Task's occurrence |

## Lean assurance lane

Lane shape: proved

Evidence: the family adds no transition family and no runtime law; the fan-in merge fires through the existing `mergeExclusive` step. The publication rule changes a body that the merge publication law [`prepareInternalMerge_accepted_lifecycle`](../../BpmnSemantics/SemanticProcess/InternalMergePublication.lean#prepareInternalMerge_accepted_lifecycle) and its siblings in [`InternalLocalControlLifecyclePublication`](../../BpmnSemantics/SemanticProcess/InternalLocalControlLifecyclePublication.lean) and [`FlowNodeOccurrenceInstantaneousPublication`](../../BpmnSemantics/SemanticProcess/FlowNodeOccurrenceInstantaneousPublication.lean) state over every program. Those laws are restated with the entry-merge case (`IFI-PUBLISH-01`) and re-proved, never weakened to a profile premise. Admission (`IFI-ADMIT-01`) is checked rather than proved: a new executable conformance module checks admission of the model at both levels, each refused edit, the profile control and the publication of one fan-in arrival. The pipeline checks agreement with the core and Temporal on the journeys (`IFI-TOKEN-01`).

## Temporal hosting and refinement preflight

No new hosting mechanism. Re-entry Programs of this profile are already hosted, and a fan-in merge is an internal step inside one command closure. Ingress, waits, effects, cancellation, lifecycle and the publication projection keep their mechanisms; the hosted publication changes only by the core rule above, which the host projects without interpretation. Delivery, ordering, deduplication, retry and replay risks are unchanged. The preserved relation is equality of hosted committed state and publications with the core's. The smallest witness is the hosted pipeline over the three journeys at family closure.

## Evidence and acceptance

The model runs as three answer-free scenarios with registered pipeline cases, each with a seeded mutation, plus a value-domain matrix row, a corpus row and the About disclosure. The CIB lane extends the [scope re-entry probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenScopeReentryProbeTest.java) with the three journeys under JUEL renditions of the conditions (`CIB-CFG-0005`), asserting the task sequence and the historic activity instance count of every fan-in node.

Acceptance:

- Lean, core and pipeline agree on every scenario of the profile.
- The probe agrees.
- Every retained model stays admitted.
- The hosted pipeline passes once at family closure.

Then `PC-CF-07` is evidenced for its merge clause in this profile's root graph, `PC-HUM-05` for its implicit merge clause there, and `BPMN-MECH-FLOW-01` for uncontrolled incoming flow there. Each stays open on its other clauses.

Nearest unsupported claims:

- implicit split;
- fan-in in bodies, in the called Process or under forks;
- fan-in in any other profile.

## Versioning consequences

Apply the [pre-release wire policy](../../contracts/README.md#evolution-policy): no wire shape, schema or value arm changes; admission widens under the profile, the profile artifact grows in place, and no legacy reader or migration is added. The publication rule changes no publication of an admitted model, because no admitted Program today has a `mergeExclusive` whose output is consumed by an operation of its own origin.

### Owners this implementation grows

Build cost is a constraint. No kernel type and no hub interface changes. One Lean body edit touches a hub function, the `mergeExclusive` arm of `candidateFlowNodeOccurrenceDeltaForOwnedOperation?` in [`FlowNodeOccurrenceLifecycle`](../../BpmnSemantics/SemanticProcess/FlowNodeOccurrenceLifecycle.lean), because every merge publication derives from it; the merge preparation template changes in the same commit, so the global fixtures rebuild once. The arity flag of `CheckedProcessAdmission` changes in its body.

Lean owners:

- the checked root vertex projection in `ScopeReentryAdmission`;
- the restated merge publication laws named in the Lean assurance lane;
- a new executable conformance module, a family-owned module that imports admission and publication owners only.

TypeScript owners: the [checked-process admission](../../packages/bpmn-source/src/checked-process-admission.ts), the [checked graph admission](../../packages/bpmn-source/src/checked-process-graph-admission.ts), the [nested scope-data source](../../packages/bpmn-source/src/nested-scope-data-source.ts), the [re-entry admission](../../packages/semantic-core/src/scope-reentry-admission.ts), the [lifecycle](../../packages/semantic-core/src/flow-node-occurrence-lifecycle.ts), the [publication completeness](../../packages/semantic-core/src/flow-node-occurrence-publication-completeness.ts) and the [merge preparation](../../packages/semantic-core/src/internal-transition-merge-preparation.ts). The lifecycle and the checked-process admission sit closest to the module-size target that `node scripts/what-binds.ts` reports, so each edit there stays line-neutral by calling the new predicate module, and an owner is extracted before growth would exceed that target.

Registration:

- `CIB-AGR-0015` in the [register](../CIB-BPMN-RELATION-REGISTER.md);
- the [profile artifact](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json) entries above and the README;
- the [scope re-entry specification](SCOPE-REENTRY-SPEC.md#required-optional-and-excluded-scope), whose exclusions this family narrows;
- the [requirement ledger](../BPMN-REQUIREMENT-LEDGER.md) row `BPMN-MECH-FLOW-01`;
- scenarios, pipeline cases, the value-domain matrix, the corpus, About and the CIB probe.

Guards the implementation must change or satisfy:

- [`lean-fanout`](../../scripts/lean-fanout.test.ts), [`lean-import-boundaries`](../../scripts/lean-import-boundaries.test.ts), [`lean-module-cost`](../../scripts/lean-module-cost.test.ts) and [`source-hygiene`](../../scripts/source-hygiene.test.ts), which bound every grown owner and the new modules;
- [`semantic-operation-consumer-census`](../../scripts/semantic-operation-consumer-census.test.ts), for every consumer of `mergeExclusive`;
- the [mixed-task control-flow source test](../../packages/bpmn-source/test/mixed-task-control-flow-source.test.ts) and the [checked graph admission test](../../packages/bpmn-source/test/checked-process-graph-admission.test.ts), which lock the other profiles' single incoming flows;
- the [pipeline budget guard](../../scripts/pipeline-budget.test.ts), whose derived ceiling the three cases move without a bound change;
- the [value-domain matrix](../../packages/differential/test/scenario-value-domain-lean-core.integration-test.ts), the [executable model corpus](../../model-corpus/test/executable-model-corpus.test.ts), [`requirement-ledger-consistency`](../../scripts/requirement-ledger-consistency.test.ts) and the [About disclosure guard](../../scripts/capability-catalog-disclosures.test.ts), for the grown artifact;
- [`document-reviewability`](../../scripts/document-reviewability.test.ts), for this inventory.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `db3c1f6a` | `fork-turns-none` | `reject` | `not-required` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

The proposal review of `db3c1f6a` (packet `84c90659ebd80db8ad3311a5e97661f1a4488c266e095d75c6df6a0fe595782d`) rejected the entry merge: its output needs a control place with no Sequence Flow behind it, which every place's required `BpmnSequenceFlowOrigin` forbids and which would publish a token position and a committed transition that CIB does not have, and the profile's Program envelope refuses two operations with one origin. Fan-in at Activities therefore needs a kernel extension, a typed entry place or multi-input target operations, and a new proposal. None End fan-in needs neither and is the [None End fan-in specification](NONE-END-FAN-IN-SPEC.md).
