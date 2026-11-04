# Inclusive Gateway regions proposal

## Status

Lifecycle: draft
Review: pending

## Question and delivery boundary

Can the nested scope-data profile admit structured Inclusive Gateway regions in the Process root, each one diverging Inclusive Gateway paired with one converging Inclusive Gateway, with one or more Simple Boolean conditional outputs and a required default, and with branches that hold User and Service Tasks, embedded Sub-Processes and nested Parallel or Inclusive regions, so that the split activates exactly its true subset (or its default), the join waits for all and only the branches that split selected, and every other profile, every admitted model and every command and observation keep their meaning?

This is the next family of batch 4 in [PLAN](../PLAN.md#scheduled-delivery-batches) (remaining gateway compositions). Its mechanism is selected-set synchronization in a cumulative profile: the existing `selectMany` and `synchronizeSelected` operations of the [Inclusive Gateway specification](INCLUSIVE-GATEWAY-SPEC.md), widened from exactly two candidates around three User Tasks to structured regions of any admitted arity. It serves these clauses of the [coverage checklist](../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list):

- `PC-CF-04`, primary: Inclusive selection and synchronization, selected one, two and three branches, an unselected branch and the default, and joins after scopes, where a selected branch is an embedded Sub-Process. The row stays open on unpaired and looping merges, joins after Calls and Multi-Instance, a still-reachable upstream branch outside a structured region, and comparison predicates (`PC-DATA-07/08`).
- `PC-CF-08`: the matrix cells *Parallel within Inclusive* and *Inclusive within Parallel* for root regions. The row stays open on its other cells.

Screened out, each with its reason:

- Implicit Activity split and merge (`PC-CF-07`): every Activity operation has one output place, and the [implicit fan-in proposal](IMPLICIT-FAN-IN-PROPOSAL.md#independent-cold-review-receipt) was rejected because an entry merge needs a control place with no Sequence Flow behind it; both directions need a kernel extension.
- Link Events (`PC-BASIC-02`): the same kernel extension, for 4 models.
- Script and Business Rule Tasks (`PC-AUTO-05` to `PC-AUTO-08`): both open with a dependency and runtime design decision.

Selection, 2026-11-04: chosen on reach, cost and semantic risk. Selector (pinned checkout `5a45b47`, 2026-11-04): every `*.bpmn` and `*.bpmn20.xml` file of the whole checkout outside `target/` directories that parses as XML and holds exactly one `process` element whose descendant element local names all lie in the [single-scope selector set](SINGLE-SCOPE-MODELS-SPEC.md#question-and-delivery-boundary) plus `subProcess`, `callActivity`, `sendTask` and `inclusiveGateway`. Of these, 24 hold an Inclusive Gateway, 9 of them with no condition or only literal ones; the other 15 use JUEL comparisons, which wait for `PC-DATA-07/08`. Against them, 7 condition-free models hold an implicit Activity split, merge or multi-output Start, and 5 both fork and choose. Close call against implicit split and merge: 9 models against 7, and Inclusive reuses an existing operation pair where implicit flow needs a kernel extension. As before, no pinned model is admitted as it stands, because the profile requires a source overlay and refuses CIB attributes.

## Normative basis and CIB classification

BPMN 2.0.2 Clause 10.6.3 gives the diverging Inclusive Gateway every outgoing flow whose condition is true, and its default only when none is. Clause 13.4.3 with Table 13.3 enables the converging Gateway once every incoming flow that has a token, or that a token can still reach, has one. Table 13.3 names the Structured Synchronizing Merge (WCP-7) as a supported pattern. The [Inclusive Gateway specification](INCLUSIVE-GATEWAY-SPEC.md#required-proposition) reviewed the bounded reading this family reuses: in an acyclic structured region, the inputs that can still contribute are exactly the selected branches still live, so an occurrence-owned selected set carries the liveness that an active Activity hides from a control-place-only transcription. [BPMN21-450](https://issues.omg.org/issues/BPMN21-450) remains open; no general algorithm is selected. Consult the [external reading copy](../reference/bpmn-2.0.2/README.md#reading-workflow).

CIB Seven `2.2.0` at the pinned checkout (`InclusiveGatewayActivityBehavior.java:46-129`) takes every non-default outgoing transition whose condition is absent or true, the default when none is, and throws when neither exists. Its join activates once the arrived executions reach the incoming count, or once no other leaf execution of the scope can reach the gateway (`activatesGateway`, `canReachActivity`). In an acyclic structured region, the only executions that can reach the join are the region's own selected branches still live, including executions inside a Sub-Process on a branch through its flow scope, so the two accounts agree on every admitted model. Classification: no new relationship. The behavior is standards-settled for the admitted class, and the CIB probe calibrates it on the witnesses. CIB's reachability join on unstructured, looping or asynchronous graphs stays outside the class.

## Required, optional and excluded scope

Required, for the nested scope-data profile only:

- **Root Inclusive regions.** In the Process root body, a diverging Inclusive Gateway with one input, one or more conditional outputs each carrying one Simple Boolean v1 condition, and one conditionless default output named by its `default` reference, paired with one converging Inclusive Gateway whose inputs are exactly one per split output and which has one output. A region contracts like a Parallel fork/join pair under rule 2 of the [nested scope-control class](NESTED-EMBEDDED-SCOPE-CONTROL-SPEC.md#admission).
- **Branch content.** Each branch holds the root body content the profile admits between a fork and its join: User Tasks, mapped and unmapped Service Tasks, embedded Sub-Processes of the admitted depth and data, and nested Parallel or Inclusive regions. Every path from a split output reaches a User Task, Service Task or Sub-Process before any join (the strict cut, without pass-through branches).
- **Composition.** Regions compose with root Parallel regions, terminal forks and Sub-Processes in both directions of nesting, within the unchanged depth, task and closure bounds.

Optional: none.

Excluded, each refused at admission:

- an Inclusive Gateway in a Sub-Process body or a called Process body: a condition reads Process-scope bindings only, as the root Exclusive Choice does, and a body's nearest declaring frame would be invisible to it;
- a split without a default, a conditionless non-default output, a condition outside Simple Boolean v1, a mixed or unpaired Gateway, an unstructured or cross-branch flow, and an Inclusive split paired with a Parallel join or the reverse;
- a split whose branches end at separate Ends rather than its join;
- a branch that reaches its join without arming work: pass-through Tasks or None Throws alone, or directly;
- an Inclusive region in a model that also holds an Exclusive Choice or a cycle, which the profile already routes to its serial re-entry analysis and keeps apart from forks;
- an Inclusive region beside a root Call, through the unchanged rule that refuses a Call in a forking root;
- every form above under any other profile; the [Inclusive Gateway specification](INCLUSIVE-GATEWAY-SPEC.md#exact-source-profile)'s profile keeps its exact topology.

These bound admission only, so later families broaden them without reinterpreting a model. No model this profile admits today changes meaning: it admits no Inclusive Gateway.

## Profile and public contract

The profile `cibseven-2.2.0-nested-embedded-scope-data-draft` grows in place under the [cumulative profile rule](../../contracts/README.md). Its value domain, Start contract, effect contract and closure limit are unchanged. The [profile artifact](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json) adds the feature `inclusive-gateway-regions` and narrows its exclusion `inclusive-and-event-based-gateways` to Event-Based Gateways and to the excluded Inclusive forms above; the [profile README](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/README.md) states the class. Public observation is unchanged: it exposes the selected branches' waits, never the hidden selection record or partial join tokens.

The [Semantic Process IL](../SEMANTIC-PROCESS-IL-SPEC.md) and the [checked-process contract](../../contracts/schemas/checked-process.schema.json) widen their Inclusive arity, a breaking wire change under the [pre-release policy](../../contracts/README.md#evolution-policy), replaced atomically: `selectMany.candidates` from exactly two to one or more, `synchronizeSelected.inputs` from exactly three to two or more, and the checked diverging node's `candidateFlowIds` from exactly two to one or more. The default stays required everywhere. Lean's contract types already carry lists and need no change.

## Representation and runtime ownership

No new operation, runtime collection or transition family. A split lowers to `selectMany` and its join to `synchronizeSelected`, exactly as the [Inclusive Gateway specification](INCLUSIVE-GATEWAY-SPEC.md#checked-graph-and-semantic-process-contract) defines them, with `selectionKey` the split's BPMN ID, candidates in canonical flow-ID order and join inputs in canonical place order. The hidden `SelectedBranchSet` record keeps its definition: created by the split, owned by the root scope occurrence, removed only by its join or owner interruption, and blocking the root's quiescent completion while live.

**Expected join inputs.** Each candidate's and the default's `expectedJoinInput` is the join input that its own branch reaches. Lowering derives it by walking from the split output: a serial vertex passes to its sole output, a nested Parallel or Inclusive split passes to its paired join's output, and the walk stops at the input flow into the paired join. One new leaf per language owns this walk, so the [Lean lowering](../../BpmnSemantics/SemanticProcess/Lowering.lean) and the [TypeScript lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts) each replace their one-task lookup by a call. The same walk over Program control places is an admission check at the Program level in both languages (`IGR-BIND-01`), so a Program that permutes two branches' join inputs is refused even when its source would lower correctly.

**Admission projection.** The nested analyses project a split as a fork vertex and its join as a join vertex, at the checked and Program levels alike, so the reviewed contraction, pairing and burst composition apply unchanged; `selectMany` charges one closure step, as `duplicate` does, and a selected subset never exceeds the bound computed for all branches. A new admission leaf per language adds what the shared analysis cannot see: the kind of each paired vertex, the root-only placement, the strict branch cut, the required default and conditions, and `IGR-BIND-01`. The Program router counts `selectMany` as a fork, so the existing refusals of forks beside Choices, cycles and root Calls apply to it.

**Co-enabled members.** `selectMany` and `synchronizeSelected` are local control in the [commutation census](../../BpmnSemantics/SemanticProcess/InternalCommutationCensus.lean); their selection-record footprints and pair laws already exist (`prepared_local_control_pair_commutes`, `prepared_end_local_control_pair_commutes`, `prepared_declared_entry_local_control_pair`, `prepared_merge_local_control_pair_commutes`), and the TypeScript batch preparation accepts the same pairs. The local-control footprint reads no variable bindings, which is sound only when no Process-binding writer shares a batch with a split. In this class the writers are external commands and regional completion with outputs; regional completion is never co-enabled, because every body arms work on entry and a closure's tokens all descend from its one starting token. A split therefore always reads the bindings committed before its closure step, including outputs that a preceding Sub-Process copied to the Process in the same closure. This premise is argued and checked, not proved.

Rejected alternatives:

- a new `inclusiveRegion` vertex kind in the shared structured analysis: it is also the Multi-Instance owner's, and the projection to fork and join plus a leaf check leaves those consumers untouched;
- admitting Inclusive regions in Sub-Process bodies with frame-aware condition evaluation: it needs a reading of conditions that `choose` does not have, for no selected model;
- an optional default with an exception outcome when no condition holds: it changes the Lean contract on a hub and adds a semantic failure outcome that no selected model needs.

## Admission

Admission stays [profile-parameterized](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md). Under this profile only, and at the Program and checked levels alike, a definition with Inclusive Gateways admits when:

1. it is admitted by the nested analyses with every split projected as a fork and every join as a join;
2. every Inclusive split lies in the Process root body and its analysis-paired join is an Inclusive join naming it, and every Inclusive join is paired with an Inclusive split; a Parallel vertex is paired only with a Parallel vertex;
3. every split has one or more conditional outputs, each with one Simple Boolean v1 condition, and one conditionless default, and its join has exactly one input per split output;
4. every path from a split output reaches a User Task, Service Task or Sub-Process before any join or End;
5. every `expectedJoinInput` is the join input its branch reaches (`IGR-BIND-01`), and the expected inputs of one split are exactly its join's inputs.

Nearest wrong algorithms, each with a separating witness below:

1. synchronizing every join input, which strands the one-true and default journeys;
2. releasing the join at the first selected arrival;
3. selecting only the first true candidate, as `choose` does;
4. trusting a Program's `expectedJoinInput` values without checking them against its own control places;
5. pairing an Inclusive split with a Parallel join or the reverse;
6. admitting a region in a Sub-Process body, where a condition misses the body's frame;
7. widening the exact Inclusive profile, or admitting regions under another profile.

## Stable rules

| Rule | Statement |
|---|---|
| `IGR-ADMIT-01` | The nested scope-data profile admits root Inclusive regions under the five admission conditions, within the unchanged depth, task and closure bounds, at the Program and checked levels alike. |
| `IGR-SELECT-01` | One split firing evaluates every condition against the same committed Process bindings, consumes its input token and produces one token on every true output, or on the default alone when none is true, recording the selected outputs' expected join inputs. |
| `IGR-JOIN-01` | The paired join is enabled exactly when every recorded input holds an owner-matching token; it consumes one token from each, removes the record, and produces one token. An unselected input never blocks it. |
| `IGR-BIND-01` | Each branch's expected join input is the join input that branch reaches, at the Program and checked levels. |
| `IGR-ROOT-01` | An Inclusive Gateway in a Sub-Process or called Process body is refused under this profile. |
| `IGR-PROFILE-01` | Every other profile refuses each form it refuses today, and the exact Inclusive profile keeps its exact topology. |

`IGR-SELECT-01` and `IGR-JOIN-01` restate `IGW-EVALUATE-01` to `IGW-JOIN-CONSUME-01` of the [Inclusive Gateway specification](INCLUSIVE-GATEWAY-SPEC.md#semantic-rules) for any admitted arity and branch content; the propositions are unchanged.

## Newly reachable waits and resumption

None of a new kind. The waits are the User Task, effect and Sub-Process waits of the admitted accounts, now armed for a data-dependent subset of branches. A live selection record is never progress evidence; resumption depends on the selected branches' public waits, as in the Inclusive Gateway specification.

## Separating witnesses

Both models carry a source overlay and a mapped Service Task, as the profile's serial rule requires.

- **Account opening** (three conditions, a Sub-Process branch, a Service Task branch):
  - Start binds `application`; Sub-Process *Assess applicant* declares `riskRating`, `residency` and `channel`, which its User Task *Assess applicant* writes, and copies all three to the Process.
  - Split *Required checks*: `stringEquals(riskRating,"high")` to Sub-Process *Enhanced due diligence* (body: User Task *Verify source of funds*); `stringEquals(residency,"foreign")` to User Task *Collect tax residency form*; `stringEquals(channel,"online")` to mapped Service Task *Verify identity document*, input `application`, output `identityCheck`; default to User Task *Standard verification*.
  - Join *Checks complete* → User Task *Open account* → End.
  - Journeys: all three true, completing the three branches in two different orders, where *Open account* opens only after the last; residency alone, where completing *Collect tax residency form* opens *Open account* at once; none true, through *Standard verification*; high risk and online, where the identity result arrives first and the join waits for *Enhanced due diligence*.
- **Event booking** (Inclusive within Parallel, Parallel within Inclusive):
  - Start binds `event`; mapped Service Task *Quote event*, input `event`, output `quote`; Sub-Process *Plan event* declares `catering` and `technology`, which its User Task *Choose options* writes, and copies both to the Process.
  - Fork: branch one, User Task *Book venue*; branch two, split *Order extras*: `stringEquals(catering,"yes")` to User Task *Order catering*; `stringEquals(technology,"yes")` to a fork of User Tasks *Rent projector* and *Book technician* and its join; default to User Task *Confirm no extras*; join *Extras ordered*.
  - Join *Event ready* → User Task *Send confirmation* → End.
  - Journeys: both extras, with *Book venue* completed first in one journey and last in the other; no extras, through *Confirm no extras*.
- **Refused edits**, each asserted at the checked and Program levels separately beside its admitted original:
  - *Checks complete* as a Parallel join (wrong algorithm 5), and the reverse pairing on *Event ready*'s fork with an Inclusive join;
  - the *Order extras* region moved into the *Plan event* body (wrong algorithm 6, `IGR-ROOT-01`);
  - *Required checks* without its default, and with the *Standard verification* flow made a conditionless non-default output;
  - *Collect tax residency form* replaced by a plain Task (the strict cut);
  - *Order extras*' branches ending at separate Ends instead of *Extras ordered*;
  - an Exclusive Choice added before *Required checks*.
- **Program-level binding control:** the account opening Program with two candidates' `expectedJoinInput` values swapped, keeping the set, refused by `IGR-BIND-01` in both languages, while its graph validation alone admits it (wrong algorithm 4).
- **Profile control (minimal pairs):** both models refused under the embedded completion profile's identity with the source overlay that profile requires, and the exact Inclusive profile's retained fixture still admitted with a third candidate refused under it (wrong algorithm 7).
- **Runtime controls:** seeded pipeline mutations that synchronize every join input, release at the first selected arrival, and select only the first true candidate must each disagree on a registered journey (wrong algorithms 1 to 3).

## Rule-to-evidence matrix

| Rule | Positive and negative witness | Lanes | Killing mutation |
|---|---|---|---|
| `IGR-ADMIT-01` | Both models admitted at both levels; the refused edits beside their originals | Source, core, Lean conformance checks, pipeline | Drop the kind check (5) or the strict cut |
| `IGR-SELECT-01` | All-true, one-true, none-true and two-true account opening journeys; both event booking journeys | Core, pipeline across Lean, core and Temporal; CIB probe | First-true selection (3) |
| `IGR-JOIN-01` | Both completion orders, the one-true immediate release, the identity result arriving before *Enhanced due diligence* | Core, pipeline, CIB probe; Lean laws `nonempty_selected_subset_join_ready_iff`, `synchronize_selected_exact_consumption_and_record_removal` | All-input join (1), first-arrival release (2) |
| `IGR-BIND-01` | The swapped Program refused, its original admitted | Core and Lean conformance checks | Trust the Program's values (4) |
| `IGR-ROOT-01` | The moved region refused | Source, core, Lean conformance checks | Admit in bodies (6) |
| `IGR-PROFILE-01` | Embedded completion refusals; the exact profile's fixture and its widened twin | Core and Lean conformance checks | Widen another profile (7) |

## Lean assurance lane

Lane shape: checked

Evidence: the family adds no transition family. The two operations' relation, evaluator soundness and laws are quantified over candidate and input lists of any length in [`InclusiveGateway`](../../BpmnSemantics/SemanticProcess/InclusiveGateway.lean): `evaluated_true_candidate_membership_iff`, `evaluated_default_iff_no_candidate_true`, `nonempty_selected_subset_join_ready_iff`, `synchronize_selected_exact_consumption_and_record_removal`, `selectManyState_sound` and `synchronizeSelectedState_sound`. Batches commit through the quantified local-control pair laws named under [Representation](#representation-and-runtime-ownership), and a violated independence premise fails closed to `ambiguousInternalChoice`. What stays argued, not proved: that no admitted closure batches a split beside a Process-binding writer, and that the selected-set reading equals Table 13.3 on every admitted region. Executable admission checks live in a new conformance module, admission-only and outside `CommandAdmission`'s cone: both models at both levels, the refused edits, the binding control and the profile controls. The journeys run through the pipeline's Lean target.

## Temporal hosting and refinement preflight

No new hosting mechanism. Ingress is the existing Start, effect result and User Task completion; waits are User Tasks and effects; no timer, cancellation or lifecycle transition is added. [Host admission](../../packages/temporal-adapter/protocol/src/host-admission.ts) already classifies `selectMany` as a token split beside `duplicate` and `synchronizeSelected` as passive; a nested scope-data Program with concurrent effects passes through the existing structured exemption exactly as a Parallel fork does, which the implementation confirms with a host-admission test of the account opening Program. The preserved relation is equality of hosted committed state, hidden records included, and publications with the core's; no handler, Promise race or history order selects branches or readies the join. Delivery, ordering, deduplication, retry and replay risks are unchanged, since the split and join are internal steps inside one committed closure. The smallest witness is the hosted pipeline over both models' journeys at family closure.

## Evidence and acceptance

The models run as answer-free scenarios with registered pipeline cases, each with a seeded mutation, plus value-domain matrix rows, corpus rows and the About disclosure. A new CIB probe runs both models' journeys with JUEL twins of the conditions, as the Exclusive arity probe does, and observes each wait set and the join's single activation.

Then `PC-CF-04` is evidenced for root structured regions with Simple Boolean conditions, joins after Sub-Processes and every selection count, staying open on its other clauses; `PC-CF-08` gains its *Parallel within Inclusive* and *Inclusive within Parallel* cells for root regions. Both stay open.

Nearest unsupported claims:

- Inclusive regions in Sub-Process or called bodies, unpaired, looping or unstructured Inclusive merges, and a missing default;
- that no admitted closure batches a split beside a Process-binding writer, which is argued and checked, not proved;
- that the selected-set reading equals Table 13.3 beyond acyclic structured regions;
- that every actual closure stays within the admitted burst, not proved in Lean, as for the accounts this family reuses.

## Versioning consequences

A breaking wire change to the Semantic Process and checked-process contracts, replaced atomically under the [pre-release wire policy](../../contracts/README.md#evolution-policy): both schemas, both TypeScript contracts, every producer and consumer, and the retained Inclusive fixtures, which stay valid because their arity lies inside the widened range. No admitted model changes its Program, route or behavior.

### Owners this implementation grows

No Lean contract type, hub interface or guard bound changes.

- Lean: a new leaf beside [`NestedScopeBranchWork`](../../BpmnSemantics/SemanticProcess/NestedScopeBranchWork.lean) owns the region checks and the Program-level join-input walk, imported privately by [`NestedScopeControlAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean), which takes body edits only (vertex projection and the router's fork test), extracting before growth would exceed its review target. A second new leaf owns the checked join-input walk, which [`Lowering`](../../BpmnSemantics/SemanticProcess/Lowering.lean) calls from the body of `expectedJoinInput`, a net shrink of that owner. [`ProgramStructuralValidation`](../../BpmnSemantics/SemanticProcess/ProgramStructuralValidation.lean) and [`GraphValidation`](../../BpmnSemantics/SemanticProcess/GraphValidation.lean) take body edits replacing the fixed Inclusive arities by the widened ranges. [`NestedScopeDataAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeDataAdmission.lean) projects the two operations in its vertex function. The narrow builds of each changed module and its `import all` consumers precede the commit; the full library runs once at family closure.
- TypeScript: [`semantic-process-contract.ts`](../../packages/semantic-core/src/semantic-process-contract.ts) widens the two tuples; [`inclusive-gateway-admission.ts`](../../packages/semantic-core/src/inclusive-gateway-admission.ts) and the [runtime](../../packages/semantic-core/src/semantic-process-inclusive-gateway-runtime.ts) follow. A new module owns the region checks and the Program walk, called from the [nested scope-control admission](../../packages/semantic-core/src/nested-scope-control-admission.ts), which grows by its call only, extracting before growth would exceed its review target. [`structured-scope-data-routing.ts`](../../packages/semantic-core/src/structured-scope-data-routing.ts) counts `selectMany` as a fork, and [`nested-scope-data-admission.ts`](../../packages/semantic-core/src/nested-scope-data-admission.ts) projects both operations.
- Source: [`inclusive-gateway-source.ts`](../../packages/bpmn-source/src/inclusive-gateway-source.ts) widens projection for this profile only; [`semantic-process-lowering.ts`](../../packages/bpmn-source/src/semantic-process-lowering.ts) calls the shared walk; the [nested source path](../../packages/bpmn-source/src/nested-scope-data-source.ts) and [`checked-process-graph-admission.ts`](../../packages/bpmn-source/src/checked-process-graph-admission.ts) accept the widened nodes under this profile.

Guards the implementation must satisfy, with bounds unchanged: [`lean-fanout`](../../scripts/lean-fanout.test.ts), [`lean-module-cost`](../../scripts/lean-module-cost.test.ts), [`source-hygiene`](../../scripts/source-hygiene.test.ts), the [operation consumer census](../../scripts/semantic-operation-consumer-census.test.ts) and the [Start capacity envelope test](../../packages/temporal-adapter/protocol/test/start-capacity-envelope.test.ts).

Existing witnesses that change, each with its disposition: the exact-arity refusals of the [Inclusive Gateway admission tests](../../packages/semantic-core/test/inclusive-gateway.test.ts) and the [Inclusive source test](../../packages/bpmn-source/test/inclusive-gateway-source.test.ts) move from structural validation to the exact profile's shape check, where a third candidate stays refused; no other retained witness changes.

Owner passages amended at closure: the Inclusive exclusions of the [nested scope-control](NESTED-EMBEDDED-SCOPE-CONTROL-SPEC.md#required-optional-and-excluded-scope) and [root Parallel forks](ROOT-PARALLEL-FORKS-SPEC.md#required-optional-and-excluded-scope) specifications; the arity statements of the [Inclusive Gateway specification](INCLUSIVE-GATEWAY-SPEC.md#checked-graph-and-semantic-process-contract) and the [IL](../SEMANTIC-PROCESS-IL-SPEC.md); the profile README and the evidence cells of the two rows.

Registration: the profile artifact's `features` and README; scenarios, pipeline cases, the value-domain matrix, the corpus, About and the CIB probe; the [requirement ledger](../BPMN-REQUIREMENT-LEDGER.md) row `BPMN-INCLUSIVE-GATEWAY-01` amends its status line.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
