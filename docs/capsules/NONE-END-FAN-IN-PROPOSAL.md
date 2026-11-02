# None End fan-in proposal

## Status

Lifecycle: implementation-in-progress
Review: approved

## Question and delivery boundary

Can the nested scope-data profile admit a None End Event with two or more incoming Sequence Flows in its root graph, so that every token arriving on any of them ends there on its own, while every model, command and observation the profile admits today keeps its meaning and every other profile keeps its single-incoming End?

This is the next family of batch 4 in [PLAN](../PLAN.md#scheduled-delivery-batches). Its mechanism is uncontrolled incoming flow at an End: one `reachNoneEnd` per incoming flow, all owned by the End. It takes the uncontrolled incoming flow of [`BPMN-MECH-FLOW-01`](../BPMN-REQUIREMENT-LEDGER.md) at None End Events, for this profile's root graph only, as slice evidence toward the None End clause of `PC-BASIC-01` ("None Start/End … in the practical control-flow grammar") in the [coverage checklist](../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list). That clause also spans bodies, the called Process, forks and concurrent Ends, so it stays open and no checklist clause closes with this family. No other open row shares the mechanism: the uncontrolled-merge clauses of `PC-CF-07` and `PC-HUM-05` concern Activities, which have an output and need a different representation.

Screened out, each with its reason:

- fan-in at Activities: the [implicit fan-in proposal](IMPLICIT-FAN-IN-PROPOSAL.md#independent-cold-review-receipt) was rejected because an Activity's entry merge needs a control place with no Sequence Flow behind it, a kernel extension; an End has no output, so one operation per incoming flow needs no such place;
- fan-in at an End inside a Sub-Process body or the called Process: their bodies are single serial paths in this profile, so a second incoming flow needs a body Choice, which stays excluded;
- fan-in at an End in a model that forks: concurrent arrivals at one End need the concurrent account, which keeps its own Ends;
- fan-in at Error, Terminate or other End Events: this profile admits none of those kinds.

Each row keeps its other clauses open.

Selection, 2026-11-02, a close call against default-less Choices (the `PC-CF-02` clause screened out by [Exclusive choice arity](EXCLUSIVE-CHOICE-ARITY-SPEC.md#question-and-delivery-boundary)). Counted over the 1,944 parsed BPMN files among the 1,947 in the pinned CIB engine test resources, with "clean" meaning no Parallel, Inclusive or Event-Based Gateway, boundary or intermediate catch Event, Multi-Instance, Script, Receive, Send, Rule, Call or Transaction:

- a None End Event with two or more incoming flows: 131 files, 11 clean; of those that also hold a Sub-Process, as this profile requires, 55, none clean;
- a divergent Exclusive Gateway without a default: 49 files, 27 clean; with a Sub-Process, 8, 1 clean only because its event Sub-Process lies outside this family too (the proposal review counts 53 and 32 by a different definition).

Within the profile's class this family reaches 55 files against 8, and it changes no kernel type, while a default-less Choice's no-match is a runtime exception that needs an optional default in the kernel `choose` constructor and a flag-free rollback channel through the closure result that the closure proofs unfold. Raw counts overstate what this profile can admit, because it requires a Sub-Process; no clean model is reached by either family alone.

## Normative basis and CIB classification

**BPMN.** The End Event rules of Clause 10.5.3 (reading copy lines 7532 to 7536): an End Event "MAY have multiple incoming Sequence Flows" and acts as a sink for every token that arrives. Clause 13.5.6 gives an End Event's behavior per arriving token and completes the Process once no token remains. By analogy, the Intermediate Event note of Clause 10.5 (line 7727) and Clause 13.3.1 for Activities call several incoming flows uncontrolled flow: each token enables the node on its own, never waiting for the others.

**CIB Seven.** At pinned `5a45b47`, a transition's execution enters its destination activity without consulting the destination's other incoming transitions (`pvm/runtime/operation/AbstractPvmAtomicOperationTransitionNotifyListenerTake.java`). Only `ParallelGatewayActivityBehavior`, `InclusiveGatewayActivityBehavior` and `ParallelMultiInstanceActivityBehavior` under `bpmn/behavior/` collect joining executions; the None End behavior does not. Each arrival therefore ends in its own End activity instance, and the Process instance ends with its last execution.

Register change: a new entry `CIB-AGR-0015 — uncontrolled incoming Sequence Flow at a None End Event ends each token separately`, a normative agreement bounded to this profile's root graph, added with its verifier coverage.

## Required, optional and excluded scope

Required: every model the profile admits today, unchanged. In addition, in the root graph of the [re-entry account](SCOPE-REENTRY-SPEC.md#admission), a None End Event with two or more incoming Sequence Flows, each keeping its own identity. Everything else about the root graph, Sub-Process bodies and the called Process is as today; the root keeps exactly one None End, as today.

Optional: a fan-in End reached directly from a Choice, a Merge, a Task, a Sub-Process or a Call, on any number of incoming flows, including two flows of one Choice.

Excluded:

- fan-in at any other node;
- fan-in at an End inside a Sub-Process body or the called Process;
- fan-in at an End in a model that forks;
- every other exclusion of the re-entry account;
- fan-in in any other profile: profiles grow one family at a time under the cumulative profile rule.

These bound admission only: a later body, fork or Activity fan-in broadens the class without reinterpreting an admitted model.

## Profile and public contract

The profile `cibseven-2.2.0-nested-embedded-scope-data-draft` grows in place under the [cumulative profile rule](../../contracts/README.md). The [profile artifact](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json) gains the feature `none-end-event-uncontrolled-incoming-flow` and the relationship `CIB-AGR-0015`, and its exclusion `implicit-task-split-merge` stays. The [profile README](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/README.md) states the class.

Observation: each arrival publishes exactly what one arrival at a single-incoming End publishes today, the End's instantaneous occurrence, and its committed transition moves the token off the real Sequence Flow it arrived on. The one new public fact is the operation identity in that transition record: a fan-in End's operations are named per incoming flow (below), an IL identity like every other `operation:` identifier, never a BPMN element.

## Representation and runtime ownership

**No new opcode, Program field, checked node kind, control place or transition family.** A None End with k ≥ 2 incoming flows lowers to k `reachNoneEnd` operations, each with the End as origin and one incoming flow's existing control place as input. Its identifier is `operation:<End id>:from:<flow id>`; an End with one incoming flow keeps `operation:<End id>`, so every Program lowered today is unchanged. Every place keeps its Sequence Flow origin, and the single-producer and single-consumer rule of [`GraphValidation`](../../BpmnSemantics/SemanticProcess/GraphValidation.lean) keeps holding, because an End has no output and each incoming place has one consumer. Root completion stays the existing quiescent `completeScope`, which follows the last arrival.

Runtime-only and synthetic constructs: the k operation identifiers, derived from the End and flow ids, owned by the Program, published only as the `operationId` of a committed transition, created at lowering and never in runtime state.

## Admission

Admission stays [profile-parameterized](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md). Each locus widens for this profile only:

- **Checked arity.** The None End arm of `checkedNodeArityValid` in [`CheckedProcessAdmission`](../../BpmnSemantics/SemanticProcess/CheckedProcessAdmission.lean) accepts one or more incoming flows when both its `mixed` and `variableMerge` flags hold, a conjunction true for exactly this profile, so the arm changes in its body without a new parameter; the TypeScript twin in the [checked graph admission](../../packages/bpmn-source/src/checked-process-graph-admission.ts) tests the profile id. A comment names the coupling, and the new conformance module checks executably that the conjunction holds for no other registered profile.
- **Placement.** Both checked analyses of the profile, the [nested scope-data admission](../../packages/semantic-core/src/nested-scope-data-admission.ts) and [`NestedScopeDataAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeDataAdmission.lean) on the serial route and the [re-entry admission](../../packages/semantic-core/src/scope-reentry-admission.ts) and [`ScopeReentryAdmission`](../../BpmnSemantics/SemanticProcess/ScopeReentryAdmission.lean) on the re-entry route, accept a root End with several incoming flows only on the re-entry route and refuse one in a body or called Process. On the serial route a second incoming flow cannot arise, because only a Choice creates a second path. The re-entry rule of exactly one root None End (`SRE-ADMIT-01`, the root Finish count in `analyzeRootGraph` and its Lean twin) counts End elements: at the Program level the k Finish vertices of one End's operations count once, and two End elements still refuse. The re-entry leaf computes that count, the distinct origins of the root-bound `reachNoneEnd` operations, in `programAdmission` and `scopeReentryProgramAnalysis`, and passes it to the shared root rule; the shared vertex model gains no field.
- **Forks.** Once the arity relaxes, a fan-in End in a model that forks is refused at the checked level by the concurrent account's body arity, TypeScript [`structured-parallel-body-analysis`](../../packages/semantic-core/src/structured-parallel-body-analysis.ts) and Lean `StructuredParallelBodyAdmission`, which keep one incoming flow per End. The concurrent Program-level analysis has no origin rule, so the Program-level refusal of that shape rests on the lowering-equality bridge.
- **Program envelope, a declared relaxation.** `NestedScopeData.programEnvelope?` and the TypeScript `nestedScopeProgramModel`, which the re-entry account shares, require every operation origin to be distinct. They count the origin of `reachNoneEnd` operations that share one End once when every one of them is bound to the root scope, and keep refusing every other repeated origin: a `reachNoneEnd` sharing an origin with an operation of another kind, and `reachNoneEnd` operations sharing an origin across scopes. Root cause: the rule protects one-vertex-per-element, which the k arrivals of one End keep in substance, since each is an End vertex with no successor. The [mixed-task control-flow source test](../../packages/bpmn-source/test/mixed-task-control-flow-source.test.ts) witness of reused source identities keeps refusing in its profile.
- **Lowering.** The TypeScript [lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts) emits the k operations from its None End arm, which already returns a list. The Lean [`Lowering`](../../BpmnSemantics/SemanticProcess/Lowering.lean), whose `lowerNode` takes `firstPlace` of the incoming places today, gains one lane, written inline in the bodies of `lowerNode`, which yields nothing for a fan-in End, and `lowerCheckedProcess`, which concatenates one operation per incoming place beside the `lowerParallelMultiInstanceCompletion?` lane, with the per-flow identifier spelled inline from `nodeOperationId`, so no declaration is added. [`DefinitionInput`](../../BpmnSemantics/SemanticProcessJson/DefinitionInput.lean) keeps requiring the Lean lowering to equal the TypeScript Program.

The re-entry account needs no other change. The Program-level route rule `SRE-ROUTE-01` still sees the model's Choice, and the checked route predicate does too, since every admitted fan-in End lies behind a Choice. Each arrival fires one `reachNoneEnd`, which the burst (`SRE-BURST-01`) counts as one step at both levels, as it does for a single-incoming End.

The nearest wrong algorithms each have a separating witness below:

1. the single-incoming bound kept at one locus, which refuses the model at that level;
2. the bound lifted for every profile;
3. only the first incoming flow lowered, as Lean's `firstPlace` does today, which strands a token arriving on any other flow;
4. the End as a join that waits for every incoming flow, which never completes;
5. the envelope relaxed for every repeated origin, or across scopes.

## Stable rules

- `NEF-ADMIT-01`: admission accepts exactly the required and optional scope above under this profile, refuses every exclusion and parser warning, and leaves every model admitted today, under every profile, with its admission and its exact Program.
- `NEF-END-01`: a token arriving on any incoming flow of an admitted fan-in End ends there in one step, publishing one instantaneous End occurrence, whether or not tokens arrived or will arrive on the End's other incoming flows; the Process completes once no token remains.

## Newly reachable waits and resumption

None. An End is reached in the closure that delivers its token, and no wait is added. The host capability obligation is the existing one for re-entry Programs: the Start capacity envelope's Program-level and reserved-result checks.

## Separating witnesses

The witness model is *Travel request*, retained under `scenarios/none-end-fan-in/` with a source overlay for its one Service Task:

- **Assess request**, a Sub-Process whose User Task *Check request* writes `decision` and `channel`, which it copies to the Process.
- **Route request**, a Choice: `stringEquals(decision,"reject")` straight to the None End *Request closed*; `stringEquals(channel,"phone")` to User Task *Call traveller*, which flows to *Request closed*; and the default to the mapped Service Task *Book travel*, which flows to *Request closed*.

*Request closed* has three incoming flows.

Journeys, each ending at *Request closed* on a different incoming flow:

- **Rejected.** The token ends from *Route request* directly.
- **By phone.** The token ends from *Call traveller* after its completion.
- **Booked.** The token ends from *Book travel* after its effect result.

Each separates wrong algorithms 3 and 4: the second and third journeys arrive on a flow other than the first declared, and every journey must complete the Process with one End occurrence.

Admission witnesses at both levels, besides the model:

- an edit redirecting the reject candidate from *Request closed* to *Book travel*, which only adds an incoming flow to an Activity, is refused (Activity fan-in);
- an edit redirecting the phone candidate to *Request closed* and removing *Call traveller*, so that two flows of *Route request* enter the End, which then has three incoming flows, is admitted at both levels;
- an edit adding a Parallel fork whose two branches both end at *Request closed* is refused by the TypeScript and Lean checked analyses (fan-in under forks);
- an edit giving *Book travel* its own second None End keeps today's refusal of two root End elements;
- in a profile that keeps single-incoming Ends, the model is refused at the checked arity (profile control, wrong algorithm 2), for TypeScript in the per-profile loop of the [mixed-task control-flow source test](../../packages/bpmn-source/test/mixed-task-control-flow-source.test.ts) and for Lean in the new conformance module;
- Programs whose `reachNoneEnd` shares an origin with an `awaitUserTask`, or whose two `reachNoneEnd` operations share an origin with one bound to the root and one to a Sub-Process body, are refused by the envelope at both levels (wrong algorithm 5).

Lowering witnesses: the model's Program holds three `reachNoneEnd` operations with the End as origin, one per incoming place, at both levels; every retained model keeps its exact Program.

## Rule-to-evidence matrix

| Rule | Positive and negative witness | Lanes | Killing mutation |
|---|---|---|---|
| `NEF-ADMIT-01` | The model admitted at both levels; each refused edit and the envelope negative refused; the profile control; every retained model keeps its admission and Program | Source, core, Lean conformance module, corpus | Keep the single-incoming bound at any locus, lift it for every profile, or relax the envelope for every repeated origin |
| `NEF-END-01` | Each journey completes from a different incoming flow with one End occurrence | Pipeline, core runtime test, Lean conformance module, CIB probe | Lower only the first incoming flow, or join the incoming flows |

## Lean assurance lane

Lane shape: checked

Evidence: the family adds no transition family and no runtime law; each arrival fires the existing `reachNoneEnd` step, and publication is unchanged. A new executable conformance module, beside the [re-entry conformance module](../../BpmnSemantics/ScopeReentryConformance.lean) whose admission owners it shares, checks admission of the model at both levels, the refused edits, the envelope negative and the profile control, and that `lowerCheckedProcess` yields the three End operations; the pipeline checks Lean, core and Temporal agreement on the journeys.

## Temporal hosting and refinement preflight

No new hosting mechanism. Re-entry Programs of this profile are already hosted, and an End arrival is an internal step inside one command closure. Ingress, waits, effects, cancellation, lifecycle and the publication projection are unchanged, and so are the delivery, ordering, deduplication, retry and replay risks. The preserved relation is equality of hosted committed state and publications with the core's. The smallest witness is the hosted pipeline over the three journeys at family closure.

## Evidence and acceptance

The model runs as three answer-free scenarios with registered pipeline cases, each with a seeded mutation, plus a value-domain matrix row, a corpus row and the About disclosure. The CIB lane extends the [scope re-entry probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenScopeReentryProbeTest.java) with the three journeys under JUEL renditions of the conditions (`CIB-CFG-0005`), asserting the Process ends and *Request closed* has one historic activity instance.

Acceptance:

- Lean, core and pipeline agree on every scenario of the profile.
- The probe agrees.
- Every retained model stays admitted with its exact Program.
- The hosted pipeline passes once at family closure.

Closure gates:

- **Green at `d5c9b537`:** `LEAN_FULL_GATE=nef-family-closure ./scripts/lake.sh build BpmnConformance`, 935 jobs, with the [conformance module](../../BpmnSemantics/NoneEndFanInConformance.lean); its six checks, the twelve of the re-entry module and the five of the Exclusive choice arity module evaluate true.
- **Green at `8fe8b856`:** the complete `verify.sh`: the Lean library and executable checks, the runtime stage with the CIB oracle and probe, the complete Temporal gate and the pipeline over all 163 registered cases, warm in 120.3 s, 57% of its derived 211.9 s ceiling; then `test:model-corpus` over all 86 models. The research doctor failed only on an untracked `.locmetryrc` of 2026-10-23 in the pinned CIB checkout, outside this family and left in place.
- **Calibration:** the three travel request tests of the [scope re-entry probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenScopeReentryProbeTest.java) pass with its six other tests on pinned CIB Seven `2.2.0`.
- **Fork refusal:** a fan-in End under a root fork is refused at three checked loci, the concurrent body End arity, its second-visit check and the root terminal-fork rule; relaxing the arity alone leaves the edit refused.

Then `BPMN-MECH-FLOW-01` is evidenced for uncontrolled incoming flow at a None End in this profile's root graph, which is slice evidence toward `PC-BASIC-01`'s None End clause; both stay open, and no checklist clause closes.

Nearest unsupported claims:

- fan-in at Activities, Gateways other than Merges, or other End kinds;
- fan-in at an End in bodies, in the called Process or under forks;
- fan-in in any other profile.

## Versioning consequences

Apply the [pre-release wire policy](../../contracts/README.md#evolution-policy): no wire shape, schema or value arm changes; admission widens under the profile, the profile artifact grows in place, and no legacy reader or migration is added. No Program lowered today changes, because no admitted End has two incoming flows.

### Owners this implementation grows

Build cost is a constraint. No kernel type changes and no declaration is added to a hub. Two Lean hub bodies change, in one commit so the global fixtures that kernel-decide `lowerCheckedProcess … = program` rebuild once; should the module system count a body change of an exposed definition as an interface change, `Lowering`'s fan-out bound is the one that guard checks:

- `Lowering`, for the End lane, because the Lean lowering must equal the TypeScript one;
- the None End arm of `checkedNodeArityValid` in `CheckedProcessAdmission`, because the checked arity is the first refusal.

Lean owners besides the hubs:

- `programEnvelope?` in `NestedScopeDataAdmission` and the root placement checks there and in `ScopeReentryAdmission`;
- a new executable conformance module, a family-owned module that imports admission and lowering owners only.

TypeScript owners: the [checked graph admission](../../packages/bpmn-source/src/checked-process-graph-admission.ts), the [lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts), the [identifiers](../../packages/bpmn-source/src/semantic-process-identifiers.ts), the [nested scope-data admission](../../packages/semantic-core/src/nested-scope-data-admission.ts) and the [re-entry admission](../../packages/semantic-core/src/scope-reentry-admission.ts). `Lowering` sits closest to the module-size target that `node scripts/what-binds.ts` reports, so its lane is placed in a family-owned leaf when its growth would exceed that target.

Registration:

- `CIB-AGR-0015` in the [register](../CIB-BPMN-RELATION-REGISTER.md);
- the [profile artifact](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json) entries above and the README;
- the [scope re-entry specification](SCOPE-REENTRY-SPEC.md#required-optional-and-excluded-scope), whose single-incoming End this family narrows;
- the [requirement ledger](../BPMN-REQUIREMENT-LEDGER.md) row `BPMN-MECH-FLOW-01`;
- scenarios, pipeline cases, the value-domain matrix, the corpus, About and the CIB probe.

Guards the implementation must change or satisfy:

- [`lean-fanout`](../../scripts/lean-fanout.test.ts), [`lean-import-boundaries`](../../scripts/lean-import-boundaries.test.ts), [`lean-module-cost`](../../scripts/lean-module-cost.test.ts) and [`source-hygiene`](../../scripts/source-hygiene.test.ts), which bound every grown owner and the new module;
- [`semantic-operation-consumer-census`](../../scripts/semantic-operation-consumer-census.test.ts), for the new `reachNoneEnd` producer;
- the [mixed-task control-flow source test](../../packages/bpmn-source/test/mixed-task-control-flow-source.test.ts) and the [checked graph admission test](../../packages/bpmn-source/test/checked-process-graph-admission.test.ts), which lock the other profiles' single-incoming Ends;
- the [pipeline budget guard](../../scripts/pipeline-budget.test.ts), whose derived ceiling the three cases move without a bound change;
- the [value-domain matrix](../../packages/differential/test/scenario-value-domain-lean-core.integration-test.ts), the [executable model corpus](../../model-corpus/test/executable-model-corpus.test.ts), [`requirement-ledger-consistency`](../../scripts/requirement-ledger-consistency.test.ts) and the [About disclosure guard](../../scripts/capability-catalog-disclosures.test.ts), for the grown artifact;
- [`document-reviewability`](../../scripts/document-reviewability.test.ts), for this inventory.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `d93a7b2c` | `fork-turns-none` | `approve-with-required-edits` | `0bc5a8e2, 86897969` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
