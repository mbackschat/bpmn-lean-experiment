# Inclusive Gateway regions proposal

## Status

Lifecycle: draft
Review: pending

## Question and delivery boundary

Can the nested scope-data profile admit structured Inclusive Gateway regions in the Process root, each one diverging Inclusive Gateway paired with one converging Inclusive Gateway, whose outputs carry Simple Boolean v1 conditions or none, with an optional default, and whose branches hold User and Service Tasks, embedded Sub-Processes and nested Parallel or Inclusive regions, so that the split activates exactly the outputs whose condition holds or that carry none (or its default when none holds), the join waits for all and only the branches that split selected, and every other profile, every admitted model and every command and observation keep their meaning?

This is the next family of batch 4 in [PLAN](../PLAN.md#scheduled-delivery-batches) (remaining gateway compositions). Its mechanism is selected-set synchronization in a cumulative profile: the existing `selectMany` and `synchronizeSelected` operations of the [Inclusive Gateway specification](INCLUSIVE-GATEWAY-SPEC.md), widened from exactly two conditional candidates with a default around three User Tasks to structured regions of any admitted arity, with unconditioned outputs and an optional default. It serves these clauses of the [coverage checklist](../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list):

- `PC-CF-04`, primary: Inclusive selection and synchronization with selected one, two and three branches, an unselected branch and the default, and joins after scopes, where a selected branch is an embedded Sub-Process. The row stays open on unpaired and looping merges, joins after Calls and Multi-Instance, a still-reachable upstream branch outside a structured region, a default-less split whose every output is conditional, and comparison predicates (`PC-DATA-07/08`).
- `PC-CF-08`: the matrix cell *Parallel within Inclusive* for root regions, and the Sub-Process part of *Inclusive after Sub-Process/Call/MI*. The row stays open on its other cells and on Calls and Multi-Instance.

Screened out, each with its reason:

- Implicit Activity split and merge (`PC-CF-07`): every Activity operation has one output place, and the [implicit fan-in proposal](IMPLICIT-FAN-IN-PROPOSAL.md#independent-cold-review-receipt) was rejected because an entry merge needs a control place with no Sequence Flow behind it; both directions need a kernel extension.
- Link Events (`PC-BASIC-02`): the same kernel extension, for 4 models.
- Script and Business Rule Tasks (`PC-AUTO-05` to `PC-AUTO-08`): both open with a dependency and runtime design decision.
- A default-less split whose every output is conditional: when every condition is false it needs the no-match outcome of the [Exclusive Choice without a default](EXCLUSIVE-CHOICE-WITHOUT-DEFAULT-SPEC.md#representation-and-runtime-ownership), whose closure-result, host-start and proof changes are a family of their own; the next reach step of this mechanism.

Selection, 2026-11-04, re-decided after the first proposal review: chosen on reach and cost. Selector (pinned checkout `5a45b47` and the MIWG reference checkout, 2026-11-04): every `*.bpmn`, `*.bpmn2` and `*.bpmn20.xml` file outside `target/` and `node_modules/` directories that parses as XML; one diverging Inclusive Gateway is one with two or more outgoing Sequence Flows. Of the pinned checkout's 23 such splits, 22 declare no default; 9 of those have an unconditioned non-default output, and 13 condition every output. The MIWG checkout's 52 splits divide into 33 with a default and an unconditioned output, 15 without a default and with one, 2 with a default and every output conditioned, and 2 with neither. This class reaches the split shape of 10 of the 23 pinned and 50 of the 52 MIWG splits; requiring a default and a condition on every other output, as the first draft did, reached 1 and 2. These counts measure split shape only: region structure, root placement and the Simple Boolean conditions narrow them further, and no pinned model is admitted as it stands, because the profile requires a source overlay and refuses CIB attributes and JUEL. Close call against implicit split and merge (7 condition-free models): implicit flow needs a kernel extension, where Inclusive reuses an existing operation pair and changes one Lean contract field type.

## Normative basis and CIB classification

BPMN 2.0.2 Clause 10.6.3 evaluates every condition of a diverging Inclusive Gateway and traverses every Sequence Flow whose condition is true; the default is taken only when none is, and without a default that case is a runtime exception. The Sequence Flow attribute table (Clause 8.4.13) makes `conditionExpression` an optional gating condition, so an output without one is ungated and always traversed. Clause 13.4.3 with Table 13.3 activates the converging Gateway when at least one incoming flow has a token and, for every directed path that starts at a flow holding a token, ends at an incoming flow without one and does not visit the Gateway, there is also a path from that flow to an incoming flow with a token that does not visit it. Table 13.3 names the Structured Synchronizing Merge (WCP-7). The [Inclusive Gateway specification](INCLUSIVE-GATEWAY-SPEC.md#required-proposition) reviewed the bounded reading this family reuses: in an acyclic structured region the inputs that can still receive a token are exactly the selected branches still live, and an occurrence-owned selected set carries the liveness that an active Activity hides from a control-place-only transcription. [BPMN21-450](https://issues.omg.org/issues/BPMN21-450) remains open; no general algorithm is selected. Consult the [external reading copy](../reference/bpmn-2.0.2/README.md#reading-workflow).

CIB Seven `2.2.0` at the pinned checkout (`InclusiveGatewayActivityBehavior.java:46-129`) takes every non-default outgoing transition whose condition is absent or true, the default when none is, and throws when neither exists. Its join activates once the arrived executions reach the incoming count, or once no other leaf execution of the scope can reach the gateway (`activatesGateway`, `canReachActivity`). In an acyclic structured root region, the only executions that can reach the join are the region's own selected branches still live, including executions inside a Sub-Process on a branch through its flow scope, so the two accounts agree on every admitted model. Classification: no new relationship. The behavior is standards-settled for the admitted class, and the CIB probe calibrates it on the witnesses. CIB's reachability join on unstructured, looping or asynchronous graphs stays outside the class.

## Required, optional and excluded scope

Required, for the nested scope-data profile only:

- **Root Inclusive regions.** In the Process root body, a diverging Inclusive Gateway with one input and two or more outputs, paired with one converging Inclusive Gateway whose inputs are exactly one per split output and which has one output. Each non-default output carries one Simple Boolean v1 condition or none; the default, when named by the `default` reference, carries none. A split without a default has at least one unconditioned non-default output, so its selection is never empty. Outputs and their expected join inputs are pairwise distinct.
- **Branch content.** Each branch holds the root body content the profile admits between a fork and its join: User Tasks, mapped and unmapped Service Tasks, embedded Sub-Processes of the admitted depth and data, and nested Parallel or Inclusive regions. Every path from a split output reaches a User Task, Service Task or Sub-Process before any join or End (the strict cut, without pass-through branches).
- **Composition.** Regions compose with root Parallel regions, terminal forks and Sub-Processes in both directions of nesting, within the unchanged depth, task and closure bounds.

Optional: none.

Excluded, each refused at admission:

- an Inclusive Gateway in a Sub-Process body or a called Process body: a condition reads Process-scope bindings only, as the root Exclusive Choice does, and a body's nearest declaring frame would be invisible to it;
- a default-less split whose every output is conditional, a condition outside Simple Boolean v1, a mixed or unpaired Gateway, an unstructured or cross-branch flow, and an Inclusive split paired with a Parallel join or the reverse;
- a split whose branches end at separate Ends rather than its join;
- a branch that reaches its join without arming work: pass-through Tasks or None Throws alone, or directly;
- an Inclusive region in a model that also holds an Exclusive Choice or a cycle, which the profile already routes to its serial re-entry analysis and keeps apart from forks;
- a Call Activity anywhere in a definition that holds an Inclusive Gateway;
- every form above under any other profile. The [Inclusive Gateway specification](INCLUSIVE-GATEWAY-SPEC.md#exact-source-profile)'s profile keeps its exact topology through an explicit predicate (`IGR-PROFILE-01`).

These bound admission only, so later families broaden them without reinterpreting a model. No model this profile admits today changes meaning: it admits no Inclusive Gateway.

## Profile and public contract

The profile `cibseven-2.2.0-nested-embedded-scope-data-draft` grows in place under the [cumulative profile rule](../../contracts/README.md). Its value domain, Start contract, effect contract and closure limit are unchanged. The [profile artifact](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json) adds the feature `inclusive-gateway-regions`, cites Clauses 10.6.3 and 13.4.3 among its normative clauses, and narrows its exclusion `inclusive-and-event-based-gateways` to Event-Based Gateways and the excluded Inclusive forms above; the [profile README](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/README.md) states the class. Public observation is unchanged: it exposes the selected branches' waits, never the hidden selection record or partial join tokens.

The [Semantic Process IL](../SEMANTIC-PROCESS-IL-SPEC.md) and the [checked-process contract](../../contracts/schemas/checked-process.schema.json) widen their Inclusive forms, a breaking wire change under the [pre-release policy](../../contracts/README.md#evolution-policy), replaced atomically:

- `selectMany.candidates` from exactly two to one or more, `selectMany.defaultBranch` from required to optional, and `synchronizeSelected.inputs` from exactly three to two or more;
- the checked diverging node's `candidateFlowIds` from exactly two to one or more and its `defaultFlowId` from required to optional.

An unconditioned output lowers to a candidate whose condition is the Simple Boolean literal `true`: Clause 8.4.13 leaves it ungated, CIB takes it unconditionally, and `true` is already in the IL's value domain, so no Option condition type and no new operation is needed. The checked graph keeps the flow's condition `null`, as the source states it.

## Representation and runtime ownership

No new operation, runtime collection or transition family. A split lowers to `selectMany` and its join to `synchronizeSelected`, as the [Inclusive Gateway specification](INCLUSIVE-GATEWAY-SPEC.md#checked-graph-and-semantic-process-contract) defines them, with `selectionKey` the split's BPMN ID, candidates in canonical flow-ID order and join inputs in canonical place order. The hidden `SelectedBranchSet` record keeps its definition: created by the split, owned by the root scope occurrence, removed only by its join or owner interruption, and blocking the root's quiescent completion while live.

**Optional default.** Lean changes the field type of `selectMany`'s default to `Option InclusiveDefaultBranch`, and of the checked diverging node's default to `Option SequenceFlowId`, keeping both constructors' arity, as the Exclusive Choice without a default did for `choose`. A new family leaf dispatches on the default: `some d` calls the existing `evaluateInclusiveBranches` with `d`; `none` selects the true candidates and is disabled when they are empty, a case admission makes unreachable. The existing laws keep their statements for `some`, and the leaf adds the `none` law: under admission, the selection is the nonempty true subset.

**Expected join inputs and pairing.** Each candidate's and the default's `expectedJoinInput` is the join input its own branch reaches. One new leaf per language owns a walk from a split output: a serial vertex passes to its sole output, a nested Parallel or Inclusive split passes to its paired join's output, and the walk stops at the input flow into the paired join. The [Lean lowering](../../BpmnSemantics/SemanticProcess/Lowering.lean) and the [TypeScript lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts) call it for `expectedJoinInput`, and the [source projection](../../packages/bpmn-source/src/inclusive-gateway-source.ts) calls the same walk for the converging node's `pairedGatewayId`, replacing today's one-task lookup in `derivePairedGatewayId`. The same walk over Program control places is an admission check at the Program level in both languages (`IGR-BIND-01`).

**Admission projection and routing.** The nested analyses project a split as a fork vertex and its join as a join vertex, at the checked and Program levels alike, so the reviewed contraction, pairing and burst composition apply unchanged; `selectMany` charges one closure step, as `duplicate` does, and a selected subset never exceeds the bound computed for all branches. The projection, the operation and node alphabets and the routers are gated by this profile, so the embedded completion profile, which shares the analyses, does not widen. The Program router (`concurrentProgram` in Lean, `concurrentStructuredScopeDataProgram` in TypeScript) and the checked router (`checkedConcurrent`, `forks`) count an Inclusive split as a fork, so the existing routing of Choices and cycles away from forks applies to it. A new admission leaf per language adds what the shared analysis cannot see: the kind of each paired vertex, root-only placement, the strict cut, the outputs and default rule, the Call exclusion and `IGR-BIND-01`.

**Co-enabled members.** `selectMany` and `synchronizeSelected` are local control in the [commutation census](../../BpmnSemantics/SemanticProcess/InternalCommutationCensus.lean); their selection-record footprints and the pair laws `prepared_local_control_pair_commutes`, `prepared_end_local_control_pair_commutes`, `prepared_declared_entry_local_control_pair` and `prepared_merge_local_control_pair_commutes` already exist, and the TypeScript batch preparation accepts the same pairs. A split's footprint reads one `processVariable` atom per condition name (`InternalLocalControlPreparation`, `internal-transition-local-control-preparation.ts`). The one writer of Process variables inside a closure is a regional `completeScope` that copies outputs to the Process, and its footprint declares no Process-variable write, while `PreparedInternalTransition.Independent` does not make a regional completion dependent on local control. A split beside such a completion would therefore pass the footprint test: nothing fails closed, and the safeguard is the singleton premise of the [concurrent scope data specification](CONCURRENT-SCOPE-DATA-SPEC.md#representation-and-runtime-ownership), which names gateway conditions among its reopening triggers. This family re-establishes it: a command ends one wait, so a closure starts from one token; a split, like a fork, creates several tokens only on branches that each arm work before any join or End (the strict cut); a region's join fires only when its last selected branch arrives; and wait-free paths exist only in data-free definitions (`TFK-DATA-01`), which declare no output copy. So a scope still becomes quiescent only through the single token of the command that ended its last wait, its completion stays the only offer of its frontier, and a split reads only bindings committed before its step, including outputs that a preceding Sub-Process copied to the Process in the same closure. This premise is argued, not proved; a core test locks it on the witness journeys by asserting that no prepared batch holds a split beside a regional completion.

Rejected alternatives:

- a new `inclusiveRegion` vertex kind in the shared structured analysis: it is also the Multi-Instance owners', and the profile-gated projection plus a leaf check leaves those consumers untouched;
- an `Option` condition on `InclusiveCandidate` for unconditioned outputs: a second hub field type for a value the existing literal already expresses;
- admitting Inclusive regions in Sub-Process bodies with frame-aware condition evaluation: it needs a reading of conditions that `choose` does not have, for no selected model;
- admitting every default-less split with the no-match outcome: see the screened-out list above.

## Admission

Admission stays [profile-parameterized](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md). Under this profile only, and at the Program and checked levels alike, a definition with Inclusive Gateways admits when:

1. it is admitted by the nested analyses with every split projected as a fork and every join as a join;
2. every Inclusive split lies in the Process root body and its analysis-paired join is an Inclusive join naming it, and every Inclusive join is paired with an Inclusive split; a Parallel vertex is paired only with a Parallel vertex;
3. every split has two or more pairwise-distinct outputs, each non-default output with one Simple Boolean v1 condition or none, at most one conditionless default, and, without a default, at least one unconditioned output; its join has exactly one input per split output;
4. every path from a split output reaches a User Task, Service Task or Sub-Process before any join or End;
5. the definition holds no Call Activity;
6. at the Program level, every `expectedJoinInput` is the join input its branch reaches and the expected inputs of one split are exactly its join's inputs (`IGR-BIND-01`); at the checked level, each join's `pairedGatewayId` is the split that rule 2's pairing finds.

Measured closure bursts of the witnesses, by the composition of the [nested scope-control class](NESTED-EMBEDDED-SCOPE-CONTROL-SPEC.md#admission): the account opening's largest is the resumption after *Assess applicant*, 8 steps (body End, `completeScope`, split, `enterScope` and child arming of *Enhanced due diligence*, and three branch armings); the event booking's largest is the resumption after *Quote event*, 8 steps (fork, venue, split, catering, inner fork, projector, technician, attendee list). Both sit at `semanticProcessClosureLimit = 8`; one more branch or step refuses them.

Nearest wrong algorithms, each with a separating witness below:

1. synchronizing every join input, which strands the one-true and default journeys;
2. releasing the join at the first selected arrival;
3. selecting only the first true candidate, as `choose` does;
4. trusting a Program's `expectedJoinInput` values without checking them against its own control places;
5. pairing by key alone, so that an Inclusive split structurally closed by a Parallel join is admitted;
6. admitting a region in a Sub-Process body, where a condition misses the body's frame;
7. treating an unconditioned output as false, or admitting a default-less split that can select nothing;
8. widening the exact Inclusive profile, or admitting regions under another profile.

## Stable rules

| Rule | Statement |
|---|---|
| `IGR-ADMIT-01` | The nested scope-data profile admits root Inclusive regions under the six admission conditions, within the unchanged depth, task and closure bounds, at the Program and checked levels alike. |
| `IGR-SELECT-01` | One split firing evaluates every condition against the same committed Process bindings, consumes its input token and produces one token on every output whose condition is true or absent, or on the default alone when there is none, recording the selected outputs' expected join inputs. |
| `IGR-JOIN-01` | The paired join is enabled exactly when every recorded input holds an owner-matching token; it consumes one token from each, removes the record, and produces one token. An unselected input never blocks it. |
| `IGR-BIND-01` | At the Program level, each branch's expected join input is the join input that branch reaches; lowering derives it by the checked walk. |
| `IGR-ROOT-01` | An Inclusive Gateway in a Sub-Process or called Process body is refused under this profile. |
| `IGR-PROFILE-01` | Every other profile refuses each form it refuses today, and the exact Inclusive profile admits only its exact topology: two conditioned candidates, a default, three join inputs and one User Task per branch, at the Program and checked levels. |

`IGR-SELECT-01` and `IGR-JOIN-01` restate `IGW-EVALUATE-01` to `IGW-JOIN-CONSUME-01` of the [Inclusive Gateway specification](INCLUSIVE-GATEWAY-SPEC.md#semantic-rules) for any admitted arity, branch content and unconditioned output; with a default present the propositions are unchanged.

## Newly reachable waits and resumption

None of a new kind. The waits are the User Task, effect and Sub-Process waits of the admitted accounts, now armed for a data-dependent subset of branches. A live selection record is never progress evidence; resumption depends on the selected branches' public waits, as in the Inclusive Gateway specification.

## Separating witnesses

Both models carry a source overlay and a mapped Service Task, as the profile's serial rule requires.

- **Account opening** (three conditions and a default, a Sub-Process branch, a Service Task branch):
  - Start binds `application`; Sub-Process *Assess applicant* declares `riskRating`, `residency` and `channel`, which its User Task *Assess applicant* writes, and copies all three to the Process.
  - Split *Required checks*: `stringEquals(riskRating,"high")` to Sub-Process *Enhanced due diligence* (body: User Task *Verify source of funds*); `stringEquals(residency,"foreign")` to User Task *Collect tax residency form*; `stringEquals(channel,"online")` to mapped Service Task *Verify identity document*, input `application`, output `identityCheck`; default to User Task *Standard verification*.
  - Join *Checks complete* → User Task *Open account* → End.
  - Journeys: all three true, completing the three branches in two different orders, where *Open account* opens only after the last; residency alone, where completing *Collect tax residency form* opens *Open account* at once; none true, through *Standard verification*; high risk and online, where the identity result arrives first and the join waits for *Enhanced due diligence*.
- **Event booking** (Parallel within Inclusive, an unconditioned output, no default):
  - Start binds `event`, `catering` and `technology`; mapped Service Task *Quote event*, input `event`, output `quote`.
  - Fork: branch one, User Task *Book venue*; branch two, split *Order extras* without a default: `stringEquals(catering,"yes")` to User Task *Order catering*; `stringEquals(technology,"yes")` to a fork of User Tasks *Rent projector* and *Book technician* and its join; unconditioned to User Task *Confirm attendee list*; join *Extras ordered*.
  - Join *Event ready* → User Task *Send confirmation* → End.
  - Journeys: both extras, with *Book venue* completed first in one journey and last in the other; no extras, where only *Confirm attendee list* opens on branch two.
- **Refused edits**, each asserted at the checked and Program levels separately beside its admitted original unless stated:
  - a crossing (wrong algorithm 5): Start → split *I* → [A], [B] → Parallel join *P*, then Parallel fork *Q* → [C], [D] → Inclusive join naming *I* → End; key pairing alone passes, structural pairing does not. Asserted at the Program level and on a hand-built checked graph, since source projection cannot express it;
  - a minimal data-free pair for `IGR-ROOT-01` (wrong algorithm 6): Start → mapped Service Task → Sub-Process {Start → split [`isPresent(rush)` → User Task, default → User Task] → join → End} → User Task → End, refused, and the same region in the root without the wrapping Sub-Process, admitted;
  - *Order extras*' unconditioned output given the condition `stringEquals(catering,"no")`, so that no output is unconditioned and there is no default (wrong algorithm 7);
  - *Required checks*' four branches ending at four root Ends instead of *Checks complete*, refused, while its Parallel twin is admitted as a root terminal fork;
  - *Collect tax residency form* replaced by a plain Task (the strict cut);
  - an Exclusive Choice added before *Required checks*;
  - a root Call Activity added after *Open account*, and a mapped Call in the body of *Enhanced due diligence*.
- **Program-level binding control:** the account opening Program with two candidates' `expectedJoinInput` values swapped, keeping the set, refused by `IGR-BIND-01` in both languages, while its graph validation alone admits it (wrong algorithm 4).
- **Profile control (minimal pairs), each asserted at the checked and Program analyses and at profile admission separately:** a data-free root region, Start → Sub-Process {Start → User Task → End} → split [`isPresent(rush)` → User Task, default → User Task] → join → User Task → End, admitted under this profile with a source overlay and refused under the embedded completion identity without one, while its Parallel twin is admitted under both; and, under the exact Inclusive profile, its retained fixture admitted while a twin with a third conditioned candidate whose flow runs straight to the join, keeping the three-User-Task multiset, is refused (wrong algorithm 8).
- **Runtime controls:** seeded pipeline mutations that synchronize every join input, release at the first selected arrival, select only the first true candidate, and evaluate an unconditioned output as false must each disagree on a registered journey (wrong algorithms 1 to 3 and 7).

## Rule-to-evidence matrix

| Rule | Positive and negative witness | Lanes | Killing mutation |
|---|---|---|---|
| `IGR-ADMIT-01` | Both models admitted at both levels; the refused edits beside their originals | Source, core, Lean conformance checks, pipeline | Drop the kind check (5), the strict cut, the nonempty rule (7) or the Call exclusion |
| `IGR-SELECT-01` | All-true, one-true, none-true and two-true account opening journeys; both event booking journeys, with and without extras | Core, pipeline across Lean, core and Temporal; CIB probe | First-true selection (3); unconditioned as false (7) |
| `IGR-JOIN-01` | Both completion orders, the one-true immediate release, the identity result arriving before *Enhanced due diligence* | Core, pipeline, CIB probe; Lean laws `nonempty_selected_subset_join_ready_iff`, `synchronize_selected_exact_consumption_and_record_removal` | All-input join (1), first-arrival release (2) |
| `IGR-BIND-01` | The swapped Program refused, its original admitted | Core and Lean conformance checks | Trust the Program's values (4) |
| `IGR-ROOT-01` | The wrapped region refused, its root twin admitted | Source, core, Lean conformance checks | Admit in bodies (6) |
| `IGR-PROFILE-01` | The embedded completion pair; the exact profile's fixture and its straight-flow twin | Core and Lean conformance checks | Widen another profile (8) |

## Lean assurance lane

Lane shape: checked

Evidence: the family adds no transition family. The two operations' relation, evaluator soundness and laws are quantified over candidate and input lists in [`InclusiveGateway`](../../BpmnSemantics/SemanticProcess/InclusiveGateway.lean): `evaluated_true_candidate_membership_iff`, `evaluated_default_iff_no_candidate_true`, `nonempty_selected_subset_join_ready_iff`, `synchronize_selected_exact_consumption_and_record_removal`, `selectManyState_sound` and `synchronizeSelectedState_sound`. Their distinctness premises (`defaultDistinct`, injective addresses) are discharged by admission condition 3. The optional default adds one law in the family leaf for the `none` case. Batches commit through the quantified local-control pair laws named under [Representation](#representation-and-runtime-ownership). What stays argued, not proved: the singleton premise that no admitted closure batches a split beside a regional completion; that the selected-set reading equals Table 13.3 on every admitted region; and join liveness, that every selected branch's token reaches its recorded input. Executable admission checks live in a new conformance module, admission-only and outside `CommandAdmission`'s cone: both models at both levels, the refused edits, the binding control and the profile controls. The journeys run through the pipeline's Lean target.

## Temporal hosting and refinement preflight

No new hosting mechanism. Ingress is the existing Start, effect result and User Task completion; waits are User Tasks and effects; no timer, cancellation or lifecycle transition is added. [Host admission](../../packages/temporal-adapter/protocol/src/host-admission.ts) classifies `selectMany` as a token split beside `duplicate` and `synchronizeSelected` as passive; its structured exemption admits a nested scope-data Program with concurrent effects only once the routing predicate counts `selectMany` as a split, which this family changes. The same predicate drives three further consumers, which then treat an Inclusive Program like a forking one: the pending-Activity limit in the [Workflow chain](../../packages/temporal-adapter/protocol/src/workflow-chain.ts), the [ordinary effect frontier scheduler](../../packages/temporal-adapter/workflow/src/ordinary-effect-frontier-scheduler.ts) and the [Start capacity envelope](../../packages/temporal-adapter/protocol/src/start-capacity-envelope.ts). A host-admission test of the account opening Program confirms the exemption. The preserved relation is equality of hosted committed state, hidden records included, and publications with the core's; no handler, Promise race or history order selects branches or readies the join. Delivery, ordering, deduplication, retry and replay risks are unchanged, since the split and join are internal steps inside one committed closure. The smallest witness is the hosted pipeline over both models' journeys at family closure.

## Evidence and acceptance

The models run as answer-free scenarios with registered pipeline cases, each with a seeded mutation, plus value-domain matrix rows, corpus rows and the About disclosure. A new CIB probe runs both models' journeys with JUEL twins of the conditions, as the Exclusive arity probe does, and observes each wait set and the join's single activation.

Then `PC-CF-04` is evidenced for root structured regions with Simple Boolean or absent conditions, every selection count, the default and joins after Sub-Processes, staying open on its other clauses; `PC-CF-08` gains its *Parallel within Inclusive* cell for root regions and the Sub-Process part of *Inclusive after Sub-Process/Call/MI*. Both stay open.

Nearest unsupported claims:

- Inclusive regions in Sub-Process or called bodies, beside Calls, unpaired, looping or unstructured Inclusive merges, and a default-less split whose every output is conditional;
- the singleton premise, the selected-set reading beyond acyclic structured regions, and join liveness, each argued and checked, not proved;
- that every actual closure stays within the admitted burst, not proved in Lean, as for the accounts this family reuses.

## Versioning consequences

A breaking wire change to the Semantic Process and checked-process contracts, replaced atomically under the [pre-release wire policy](../../contracts/README.md#evolution-policy): both schemas, both TypeScript contracts, the Lean field types and JSON readers, every producer and consumer, and the retained Inclusive fixtures, which stay valid because their forms lie inside the widened ranges. No admitted model changes its Program, route or behavior.

### Owners this implementation grows

Two Lean contract field types change; no guard bound changes. The hub edits land in one commit, so the fixtures rebuild once.

- Lean, contract batch: the default field types in [`SemanticProcessContract`](../../BpmnSemantics/SemanticProcessContract.lean) and [`CheckedProcessContract`](../../BpmnSemantics/CheckedProcessContract.lean) and their JSON readers; the closed-world hub [`ProgramStructuralValidation`](../../BpmnSemantics/SemanticProcess/ProgramStructuralValidation.lean), whose fixed Inclusive arities become the widened ranges in body edits; [`CheckedProcessAdmission`](../../BpmnSemantics/SemanticProcess/CheckedProcessAdmission.lean), whose `checkedInclusivePairingValid` and `inclusiveBranchReachesJoin` keep the one-task form only for the exact profile and whose fixed degree widens; [`InclusiveGateway`](../../BpmnSemantics/SemanticProcess/InclusiveGateway.lean) and the [local-control selection](../../BpmnSemantics/SemanticProcess/InternalLocalControlSelection.lean), whose `selectMany` call sites pass the optional default through the new dispatch leaf.
- Lean, admission: a new leaf beside [`NestedScopeBranchWork`](../../BpmnSemantics/SemanticProcess/NestedScopeBranchWork.lean) owns the region checks and the Program-level join-input walk, imported privately by [`NestedScopeControlAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean), which takes body edits only (vertex projection, `concurrentProgram`, `checkedConcurrent` and the root-Call restrictions), extracting before growth would exceed its review target. A second leaf owns the checked walk, which [`Lowering`](../../BpmnSemantics/SemanticProcess/Lowering.lean) calls from the body of `expectedJoinInput` and from the Inclusive candidate lowering that maps an absent condition to `true`, a net shrink of that owner. [`NestedScopeDataAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeDataAdmission.lean) projects the two operations in its vertex function. The narrow builds of each changed module and its `import all` consumers precede the commit; the full library runs once at family closure.
- TypeScript: [`semantic-process-contract.ts`](../../packages/semantic-core/src/semantic-process-contract.ts) widens the two tuples and makes the default optional; [`inclusive-gateway-admission.ts`](../../packages/semantic-core/src/inclusive-gateway-admission.ts) and the [runtime](../../packages/semantic-core/src/semantic-process-inclusive-gateway-runtime.ts) follow, and the exact profile's topology predicate joins the [checked](../../packages/semantic-core/src/checked-process-profile-shape.ts) and [Program](../../packages/semantic-core/src/semantic-program-profile-shape.ts) shape checks. A new module owns the region checks and the Program walk, called from the [nested scope-control admission](../../packages/semantic-core/src/nested-scope-control-admission.ts), which also gates its vertex projection and its operation and node alphabets by profile, extracting before growth would exceed its review target. [`structured-scope-data-routing.ts`](../../packages/semantic-core/src/structured-scope-data-routing.ts) counts an Inclusive split in `forks`, `concurrentStructuredScopeDataProgram` and `checkedRestrictionsHold`; [`nested-scope-data-admission.ts`](../../packages/semantic-core/src/nested-scope-data-admission.ts) projects both operations.
- Source: [`inclusive-gateway-source.ts`](../../packages/bpmn-source/src/inclusive-gateway-source.ts) widens projection for this profile and derives `pairedGatewayId` by the shared walk; [`semantic-process-lowering.ts`](../../packages/bpmn-source/src/semantic-process-lowering.ts) calls the walk and lowers an absent condition to `true`; the [nested source path](../../packages/bpmn-source/src/nested-scope-data-source.ts), [`checked-process-admission.ts`](../../packages/bpmn-source/src/checked-process-admission.ts) and [`checked-process-graph-admission.ts`](../../packages/bpmn-source/src/checked-process-graph-admission.ts) accept the widened nodes under this profile.
- Temporal: the [host admission](../../packages/temporal-adapter/protocol/src/host-admission.ts) test named in the preflight; the three consumers of the routing predicate change through it, not by edit.

Guards the implementation must satisfy, with bounds unchanged: [`lean-fanout`](../../scripts/lean-fanout.test.ts), [`lean-module-cost`](../../scripts/lean-module-cost.test.ts), [`source-hygiene`](../../scripts/source-hygiene.test.ts), the [operation consumer census](../../scripts/semantic-operation-consumer-census.test.ts) and the [Start capacity envelope test](../../packages/temporal-adapter/protocol/test/start-capacity-envelope.test.ts).

Existing witnesses that change, each with its disposition: the exact-arity refusals of the [Inclusive Gateway admission tests](../../packages/semantic-core/test/inclusive-gateway.test.ts) and the [Inclusive source test](../../packages/bpmn-source/test/inclusive-gateway-source.test.ts) move from structural validation to the exact profile's topology predicate; no other retained witness changes.

Owner passages amended at closure: the Inclusive exclusions of the [nested scope-control](NESTED-EMBEDDED-SCOPE-CONTROL-SPEC.md#required-optional-and-excluded-scope) and [root Parallel forks](ROOT-PARALLEL-FORKS-SPEC.md#required-optional-and-excluded-scope) specifications; the singleton premise and its reopening condition in the [concurrent scope data specification](CONCURRENT-SCOPE-DATA-SPEC.md#representation-and-runtime-ownership); the arity and default statements of the [Inclusive Gateway specification](INCLUSIVE-GATEWAY-SPEC.md#checked-graph-and-semantic-process-contract) and the [IL](../SEMANTIC-PROCESS-IL-SPEC.md); the profile README and the evidence cells of the two rows.

Registration: the profile artifact's `features`, normative clauses and README; scenarios, pipeline cases, the value-domain matrix, the corpus, About and the CIB probe; the [requirement ledger](../BPMN-REQUIREMENT-LEDGER.md) row `BPMN-INCLUSIVE-GATEWAY-01` amends its status line.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

The first proposal review of `1d904f4a` rejected an earlier account that required a default and a condition on every other output, which reached none of the models its selection counted, held an event booking witness above the closure limit, and omitted the checked router, the Lean checked admission and the exact profile's topology owner. This redesign takes a new cold review.
