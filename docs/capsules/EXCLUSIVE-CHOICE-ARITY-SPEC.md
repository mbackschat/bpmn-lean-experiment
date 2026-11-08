# Exclusive choice arity specification

## Status

Lifecycle: implemented
Review: approved

## Question and delivery boundary

Can the nested scope-data profile admit Exclusive Choices with any positive number of conditional flows and a default, so that a token takes the first conditional flow in XML order whose condition is true, or the default when none is, while every model, command and observation the profile admits today keeps its meaning and every other profile keeps its exact two-condition Choice?

This is the next family of batch 4 in [PLAN](../PLAN.md#scheduled-delivery-batches). Its shared mechanism is the ordered choice of the [mixed-task control-flow account](MIXED-TASK-CONTROL-FLOW-PROPOSAL.md), which already widened the IL and checked representations to nonempty ordered candidate lists and proved first-true and default selection over any list, applied to the Choices that the [scope re-entry specification](SCOPE-REENTRY-SPEC.md#required-optional-and-excluded-scope) admits in this profile's root graph. It takes the open row of the [coverage checklist](../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) whose remaining clause is that arity:

- `PC-CF-02`, its candidate-count clause for this profile: ordered Choices over one, two and three conditions, where several true candidates select the first declared one, the default runs only when none matches, and every arrival passes a Merge.

Screened out, each with its reason:

- `PC-CF-02`'s default-less Choices: a no-match there is a runtime exception (Table 13.2), which needs an absent-default IL shape and an exception outcome; they are the next candidate family.
- `PC-CF-08`'s Exclusive-within-Parallel cell: it needs merges inside concurrent regions, which the concurrent account refuses.
- Exclusive Gateways in Sub-Process bodies: they need scoped condition reads.
- `PC-CF-04`: held with `PC-DATA-07`/`08`.
- `PC-CF-07`: implicit split and merge, a different mechanism.

Each row keeps its other clauses open.

Selection, 2026-11-02: chosen on reach over the other Exclusive exclusions of the nested scope-data profile. Of the 1,944 BPMN models that parse among the 1,947 in the pinned CIB engine test resources, 90 hold an Exclusive Gateway. Their divergent shapes are:

- one conditional flow plus a default: 26 models;
- two conditional flows without a default: about 30 models (29 to 31 by counting method);
- three conditional flows without a default: 8 models;
- two conditional flows plus a default, the only shape the profile admits today: 1 model.

No model has three or more conditional flows plus a default, so the corpus reach this family buys is the 26 one-condition models; its three-condition witness is standards evidence. By contrast, 10 models hold an Exclusive Gateway inside a Sub-Process, and 26 both fork and choose. Close call against also admitting Choices without a default, the largest shape. It was left to a later family because it needs an absent default in the IL and a runtime-exception outcome that the exception rows own, while this family needs neither.

## Normative basis and CIB classification

**BPMN.** Clauses 10.6.2 and 13.4.2 and Table 13.2 (reading copy line 12527) do not bound the number of outgoing flows of a divergent Exclusive Gateway. The conditions are evaluated in order, the first true one receives the token, no later condition is evaluated, and the default receives it only when none is true. The XML order of the flows is the order, as [`CIB-INT-0001`](../CIB-BPMN-RELATION-REGISTER.md#cib-int-0001--exclusive-gateway-candidate-order-is-xml-sequence-flow-declaration-order) selects. The [Simple Boolean v1 language](../SIMPLE-BOOLEAN-EXPRESSION-DECISION.md) is total, so every candidate evaluates to true or false.

**CIB Seven.** At pinned `5a45b47`, `bpmn/behavior/ExclusiveGatewayActivityBehavior.java#doLeave` iterates every outgoing transition in declaration order with no fixed count. It takes the first whose condition is true; failing that, it takes the default, or throws when there is none. It also takes a non-default transition without a condition, which this profile keeps refusing.

Register changes:

- the boundary of [`CIB-AGR-0006`](../CIB-BPMN-RELATION-REGISTER.md#cib-agr-0006--divergent-exclusive-gateway-first-true-and-default-routing) stops excluding Choices with one or with more than two conditions, for this profile;
- the admitted source of [`CIB-CFG-0005`](../CIB-BPMN-RELATION-REGISTER.md#cib-cfg-0005--pinned-read-only-juel-condition-environment) widens from exactly two non-default conditions to any positive number with one conditionless default, for probe calibration only.

`CIB-INT-0001` applies unchanged. The family calibrates on the CIB oracle (below): the probe calibrates CIB's declaration-order and default routing over string equality, never Simple Boolean truth, which CIB does not execute.

## Required, optional and excluded scope

Required: every model the profile admits today, unchanged. In addition, Choices in the root graph of the [re-entry account](SCOPE-REENTRY-SPEC.md#admission) with one or more Simple Boolean v1 conditional flows in XML declaration order and one conditionless referenced default. Everything else about the root graph, the Merges, Sub-Process bodies and the called Process is as today.

Optional: none beyond the re-entry account's own optional scope, so several Choices of different arity in one model, on cycles or not, are admitted.

Excluded:

- a Choice without a default;
- a non-default flow without a condition;
- a condition on the default;
- Exclusive Gateways inside a Sub-Process body or the called Process;
- a model that both forks and chooses;
- every other exclusion of the re-entry account;
- every Choice arity change in any other profile.

These bound admission only: a later default-less Choice or body Choice broadens the class without reinterpreting an admitted model.

## Profile and public contract

The profile `cibseven-2.2.0-nested-embedded-scope-data-draft` grows in place under the [cumulative profile rule](../../contracts/README.md). Every model it admits today keeps its route, admission, Start rule, commands and observations. Today every Choice of the profile has exactly two conditions, and the widened rule selects among them exactly as before.

The [profile artifact](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json) grows in place: the feature list gains `exclusive-gateway-any-positive-conditional-flow-count`, and the exclusion `choices-with-other-than-two-conditions` becomes `choices-without-a-default`. The [profile README](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/README.md) states the class, including that no admission rule bounds the candidate count: a very wide Choice is bounded only by the 192 KiB `semanticProcessProgramBytes` Workflow-argument check at Start, which refuses its Program before the Workflow is created with an untyped error, not a typed capacity failure, because the Start capacity envelope measures no re-entry Program. Observation adds nothing.

## Representation and runtime ownership

**No new representation.** No opcode, Program field, checked node, runtime collection or transition family is added. The checked `exclusiveGateway` node and the IL `choose` operation already carry nonempty ordered candidate lists, and the runtime selects through `selectConditionalOutput` for every profile. A Choice fires in one internal step of any arity, so the re-entry account's burst count (`SRE-BURST-01`), its cycle cut (`SRE-CYCLE-01`) and its Start rule (`SRE-AVAILABLE-01`, under which a Choice's reads require nothing) count, cut and read a wider Choice as they do a two-condition one.

## Admission

Admission stays [profile-parameterized](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md). The two-condition bound for this profile sits at these loci, and each widens to a nonempty candidate list for this profile only:

- the Program-level `choose` arm of the closed-world [`ProgramStructuralValidation`](../../BpmnSemantics/SemanticProcess/ProgramStructuralValidation.lean) and its TypeScript counterpart in the [operation admission](../../packages/semantic-core/src/semantic-process-operation-admission.ts);
- the checked `exclusiveGateway` arity in [`CheckedProcessAdmission`](../../BpmnSemantics/SemanticProcess/CheckedProcessAdmission.lean), in the source [checked-process admission](../../packages/bpmn-source/src/checked-process-admission.ts), and in the outgoing-flow count of `hasSelectedArity` in the source [checked graph admission](../../packages/bpmn-source/src/checked-process-graph-admission.ts), whose Lean twin counts candidates generically;
- the re-entry account's Choice vertex at both levels, in [`ScopeReentryAdmission`](../../BpmnSemantics/SemanticProcess/ScopeReentryAdmission.lean), in the [nested scope-data admission](../../packages/semantic-core/src/nested-scope-data-admission.ts), and in the output count of `rootArityValid` in the TypeScript [re-entry admission](../../packages/semantic-core/src/scope-reentry-admission.ts), which has no Lean twin;
- the source projection of a divergent Exclusive Gateway in the [nested scope-data source](../../packages/bpmn-source/src/nested-scope-data-source.ts), through the existing `variableArity` parameter of the [Exclusive Gateway source](../../packages/bpmn-source/src/simple-boolean-exclusive-gateway-source.ts).

The nearest wrong algorithms each have a separating witness below:

1. the two-condition bound kept at one locus, which refuses the model at that level;
2. the bound lifted for every profile, which admits a three-condition Choice in a profile that keeps two;
3. evaluation that stops after two candidates, or reads the last or any true candidate instead of the first;
4. a default taken while a later candidate is true.

## Stable rules

- `XCA-ADMIT-01`: admission accepts exactly the required scope above under this profile, refuses every exclusion and parser warning, and leaves every model admitted today, under every profile, with its admission.
- `XCA-ORDER-01`: a token arriving at an admitted Choice takes the first conditional flow in XML declaration order whose condition is true, whatever the number of candidates and whether later candidates are true.
- `XCA-DEFAULT-01`: the token takes the default exactly when every candidate is false.

## Newly reachable waits and resumption

None. A Choice is an internal step between waits the profile already admits, and each branch target is a User Task, Service Task, Sub-Process, Call or Merge of the re-entry account. The host capability obligation is the existing one for re-entry Programs: the Start capacity envelope's Program-level and reserved-result checks.

## Separating witnesses

The witness model is *Complaint handling*, retained under `scenarios/exclusive-choice-arity/` with a source overlay for its one Service Task:

- **Review.** The Sub-Process *Review complaint* declares `category` and `priority`, which its User Task *Classify complaint* writes, and copies both to the Process.
- **Route complaint**, a Choice with three conditions in this order:
  1. `stringEquals(priority,"urgent")` to User Task *Escalate to supervisor*;
  2. `stringEquals(category,"billing")` to User Task *Correct invoice*;
  3. `stringEquals(category,"delivery")` to the mapped Service Task *Reship order*.

  Its default goes to User Task *Answer customer*.
- **Complaint handled**, a Merge of the four branches.
- **Follow-up needed**, a Choice with one condition: `stringEquals(category,"delivery")` to User Task *Confirm delivery*, and the default to a Merge before the one None End.

Journeys:

- **Urgent billing complaint.** *Escalate to supervisor* opens, although the second candidate is also true (`XCA-ORDER-01`); the one-condition Choice takes its default. This separates last-true, any-true and reversed order.
- **Delivery complaint.** *Reship order* is armed after two false candidates (`XCA-ORDER-01`); the one-condition Choice takes its candidate to *Confirm delivery*. This separates evaluation that stops after two candidates.
- **Product complaint.** *Answer customer* opens after three false candidates (`XCA-DEFAULT-01`), and the one-condition Choice takes its default. This separates a default taken too early or too late.

A fourth schedule, a billing complaint that is not urgent, selects the middle candidate *Correct invoice* alone. It runs in the core runtime test and the CIB probe, not as a pipeline case, and separates evaluation that skips a middle candidate.

Source-order witnesses on *Route complaint* (`XCA-ORDER-01`, [`CIB-INT-0001`](../CIB-BPMN-RELATION-REGISTER.md#cib-int-0001--exclusive-gateway-candidate-order-is-xml-sequence-flow-declaration-order)), which only the source lane can carry:

- reversing the declarations of the three conditional `sequenceFlow` elements, keeping their ids and the gateway's `<outgoing>` references, reverses the checked and IL candidate order, and the urgent billing schedule then opens *Correct invoice*;
- renaming the flow ids so that their sort order opposes declaration order, and reordering the gateway's `<outgoing>` references, changes neither order nor the selected task.

Refused edits of this model:

- *Route complaint* without its default: the `default` attribute, *Answer customer* and its two flows are removed, so the gateway keeps three conditional flows and no default, and no other node changes arity;
- a fourth outgoing flow without a condition;
- a condition on the default;
- *Route complaint* moved into the body of *Review complaint*.

Profile control (wrong algorithm 2), per locus rather than per model, because a profile with exact shapes refuses a three-condition model elsewhere whether or not the arity bound is lifted:

- **TypeScript, Program level:** the existing per-profile loop of the [mixed-task control-flow source test](../../packages/bpmn-source/test/mixed-task-control-flow-source.test.ts), which calls the operation admission per profile, gains the nested profile, admitting any positive count, while every other profile except the mixed ones keeps exactly two;
- **TypeScript, checked level:** the profile-to-arity decision of the checked-process admission and of `hasSelectedArity` is extracted into one exported predicate over the profile id, which both loci call, and the same loop enumerates that predicate per registered profile, so neither locus can lift the bound alone;
- **Lean, Program level:** the new Lean conformance module evaluates `operationWellFormed` of [`ProgramStructuralValidation`](../../BpmnSemantics/SemanticProcess/ProgramStructuralValidation.lean) on one three-candidate `choose` under a profile id that keeps two, which consults only the `choose` arm.

Recorded gap: the Lean checked level has no profile control. Its profile-to-flag mapping is computed inside `checkedWellFormed`, a profile id cannot reach `checkedNodeArityValid` directly, and evaluating `checkedWellFormed` is masked by the exact profile shapes. Naming the mapping as a predicate the module could enumerate would add a public declaration or an import to the hubs this family edits only in their bodies, against the [Lean build efficiency rule](../../CLAUDE.md#code). A lift of that mapping for every profile is therefore caught only where it changes a retained model's admission. It cannot make Lean admit a wider Choice under another profile, because Lean admission also requires the Program-level `operationWellFormed`, which the Lean Program-level control covers; it weakens only the independent checked-graph check.

Existing witnesses that change: the refusal of one and three conditions in the [scope re-entry source test](../../packages/bpmn-source/test/scope-reentry-source.test.ts) and `choice_arity_is_two_conditions` in the [re-entry conformance module](../../BpmnSemantics/ScopeReentryConformance.lean) become admitted witnesses of those edits.

## Rule-to-evidence matrix

| Rule | Positive and negative witness | Lanes | Killing mutation |
|---|---|---|---|
| `XCA-ADMIT-01` | The model admitted at both levels; each refused edit refused; the per-locus profile control; every retained model of every profile keeps its admission | Source, core, Lean conformance module, corpus | Keep the two-condition bound at any one locus, or lift it for every profile at any locus other than the Lean checked mapping (recorded gap) |
| `XCA-ORDER-01` | Urgent billing selects the first of two true candidates; billing alone selects the middle one; delivery selects the third after two false; reversed declarations flip the selection and renamed ids change nothing | Pipeline, core runtime test, source test, CIB probe | Select the last true candidate, skip a middle candidate, evaluate only the first two, or order candidates by flow id or `<outgoing>` reference |
| `XCA-DEFAULT-01` | Product complaint takes both defaults; the delivery complaint's one-condition Choice takes its candidate | Pipeline, CIB probe | Take the default while a candidate is true |

## Lean assurance lane

Lane shape: checked

Evidence: the family adds no transition family and no runtime law. Selection is `selectConditionalOutput`, whose laws `choice_first_true` and `choice_default` in [`MixedTaskControlFlowDataProofs`](../../BpmnSemantics/SemanticProcess/MixedTaskControlFlowDataProofs.lean) hold for every candidate list with no profile premise. An executable conformance module, [`exclusiveChoiceArityConformanceChecks`](../../BpmnSemantics/ExclusiveChoiceArityConformance.lean#exclusiveChoiceArityConformanceChecks), checks admission of the model at both levels, each refused edit and the profile control. The pipeline checks agreement with the core and Temporal on the journeys.

## Temporal hosting and refinement preflight

No new hosting mechanism. Re-entry Programs of this profile are already hosted, and a Choice is an internal step inside one command closure. Ingress, waits, effects, cancellation, lifecycle and the publication projection are unchanged, and so are the delivery, ordering, deduplication, retry and replay risks. The preserved relation is equality of hosted committed state and core state. The smallest witness is the hosted pipeline over the three journeys at family closure.

## Evidence and acceptance

The model runs as three answer-free scenarios with registered pipeline cases, each with a seeded mutation, plus value-domain matrix rows, a corpus row and the About disclosure. The CIB lane is a test beside the [scope re-entry probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenScopeReentryProbeTest.java). It uses JUEL renditions of the conditions under `CIB-CFG-0005` and asserts, for each of the four schedules, the task or job each Choice selects. Every name a Choice reads is written before the first Choice, as the re-entry probe requires.

The three pipeline cases raise the warm pipeline budget by three cases at the unchanged per-case rate. That raise is a [Rule 2](../../CLAUDE.md#rule-2-declare-and-check-every-bulk-change) bound change, with its own direction review.

Acceptance:

- Lean, core and pipeline agree on every scenario of the profile.
- The probe agrees.
- Every retained model stays admitted.
- The hosted pipeline passes once at family closure.

Then `PC-CF-02` is evidenced for the candidate count of this profile's root Choices, and it stays open on default-less Choices, body Choices and its other clauses.

Nearest unsupported claims:

- that the Lean checked level keeps two conditions for every other profile, beyond the retained models (recorded gap above);
- Choices without a default, where a no-match is a runtime exception;
- Choices in Sub-Process bodies or the called Process;
- Choices in models that fork.

Closure gates, 2026-11-02:

- **Green at `e6ead9a9`:** `LEAN_FULL_GATE=xca-family-closure ./scripts/lake.sh build BpmnConformance`, 934 jobs, with the [conformance module](../../BpmnSemantics/ExclusiveChoiceArityConformance.lean); its five checks and the twelve of the [re-entry module](../../BpmnSemantics/ScopeReentryConformance.lean) evaluate true.
- **Green at `5a1148ac`:** the complete `verify.sh`: the Lean library and executable checks, the runtime stage, the complete Temporal gate and the pipeline over all 160 registered cases, whose warm total of 119.6 s is 58% of its ceiling; then the research doctor and `test:model-corpus` over all 85 models.
- **Calibration:** the four complaint tests of the [scope re-entry probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenScopeReentryProbeTest.java) pass with its two re-entry tests on pinned CIB Seven `2.2.0`.

As implemented, where the account above left a choice or a witness changed:

- **Default-less edit.** A checked `exclusiveGateway` always carries a default, so *Route complaint* without its default has no checked-level transcription; that refused edit is witnessed by the source test only, while the Lean module carries the other three.
- **Seeded mutations.** Urgent billing opens *Correct invoice* (last true candidate), delivery arms nothing (evaluation stops after two candidates) and product opens no task (a no-match skips the default). Taking the default while the one-condition Choice's candidate is true is killed by the delivery journey's locked *Confirm delivery* step rather than by a seeded mutation.
- **Probe owner.** The complaint calibration is four tests of the scope re-entry probe, whose session gained a model directory and condition count, instead of a new probe class with a copy of that session.
- **Value domain.** The delivery schedule is the matrix row; it requires `orderNumber` alone and admits the appended Process output `category`.
- **Pipeline budget.** The three cases raise the warm pipeline budget from 204,100 to 208,000 ms and the hosted one from 306,150 to 312,000 ms. Root cause: the [budget guard](../../scripts/pipeline-budget.test.ts) floors the warm budget at registered cases times the unchanged 1,300 ms rate, so no added case fits under the old value. A Rule 2 bound review, a fresh direction review and a post-check passed; the hosted run at 157 cases used 160.4 s, 52% of its ceiling.
- **Body-Choice witness.** The TypeScript source test refuses a separate three-condition Choice added in the body of *Review complaint*, which source condition placement refuses before the re-entry body rule; the Lean module moves *Route complaint* itself into that body.
- **Lean burst cost.** `rootSteps` in [`ScopeDataBurst`](../../BpmnSemantics/SemanticProcess/ScopeDataBurst.lean) enumerates paths without memoization within its fuel of nine, so its work grows with the fourth power of Choice width in chained Choice and Merge pairs; no retained model approaches that, the memoized TypeScript twin refuses such a model in milliseconds, and Lean admission is off the production path.
- **Rule 2 for wide commits.** The widening commit `1d7afa1f` (21 files) and the registration commit `e6ead9a9` (23 files) exceed Rule 2's 20-file trigger. Their declared scope was this proposal's owner and registration inventory, approved before either ran, but no target-effect limits, review or post-check was recorded before work built on them; the closure review caught it. A LOW post-check against that inventory, with a +15 net-line limit on the source admission owners, ran afterwards and passed: every touched path lies in the inventory, those owners grow by net 13 lines, and no file is deleted.
- **Module cost rows.** The new conformance module gains its measured [cost row](../../scripts/lean-module-cost.ts), and the re-entry module's row is re-measured because its flipped check changed its code.

## Versioning consequences

Apply the [pre-release wire policy](../../contracts/README.md#evolution-policy): no wire shape, schema or value arm changes; admission widens under the profile, the profile artifact grows in place, and no legacy reader or migration is added.

### Owners this implementation grows

Build cost is a constraint. No kernel type and no hub interface changes. Two Lean edits are body edits of closed-world functions, made in one commit so the global fixtures rebuild once:

- the `choose` arm of `ProgramStructuralValidation`, which the [Lean build modularity specification](../LEAN-BUILD-MODULARITY-SPEC.md#current-boundary) names among the closed-world functions whose body edit rebuilds the global fixtures;
- the profile flag passed to `checkedNodeArityValid` in `CheckedProcessAdmission`, whose only other use, the Merge arity, is already variable for this profile.

The SRE specification excluded this widening to avoid exactly that rebuild. The reach above now pays for it once.

Lean owners:

- the two Choice arity checks in `ScopeReentryAdmission`;
- the flipped witness in `ScopeReentryConformance`;
- a new executable conformance module, a family-owned module that imports admission owners only.

TypeScript owners: the [operation admission](../../packages/semantic-core/src/semantic-process-operation-admission.ts), the [nested scope-data admission](../../packages/semantic-core/src/nested-scope-data-admission.ts), the [re-entry admission](../../packages/semantic-core/src/scope-reentry-admission.ts), the [checked-process admission](../../packages/bpmn-source/src/checked-process-admission.ts), the [checked graph admission](../../packages/bpmn-source/src/checked-process-graph-admission.ts) and the [nested scope-data source](../../packages/bpmn-source/src/nested-scope-data-source.ts). The checked-process admission and the operation admission sit closest to the module-size target that `node scripts/what-binds.ts` reports, so each edit there stays line-neutral, and an owner is extracted before growth would exceed that target.

Registration:

- the `CIB-AGR-0006` and `CIB-CFG-0005` boundaries in the [register](../CIB-BPMN-RELATION-REGISTER.md);
- the [profile artifact](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json) entries above and the README;
- the [scope re-entry specification](SCOPE-REENTRY-SPEC.md#required-optional-and-excluded-scope), whose arity exclusion this family narrows;
- the [requirement ledger](../BPMN-REQUIREMENT-LEDGER.md) rows `BPMN-EXCLUSIVE-GATEWAY-01` and `BPMN-MECH-GATEWAY-01`;
- scenarios, pipeline cases, the value-domain matrix, the corpus, About and the CIB probe.

Guards the implementation must change or satisfy:

- [`lean-fanout`](../../scripts/lean-fanout.test.ts), [`lean-import-boundaries`](../../scripts/lean-import-boundaries.test.ts), [`lean-module-cost`](../../scripts/lean-module-cost.test.ts) and [`source-hygiene`](../../scripts/source-hygiene.test.ts), which bound every grown owner and the new module;
- the [mixed-task control-flow source test](../../packages/bpmn-source/test/mixed-task-control-flow-source.test.ts), which locks the old profiles' two-condition Choices beside the mixed profiles' widened ones;
- the [pipeline budget guard](../../scripts/pipeline-budget.test.ts) and the [verification entrypoint guard](../../scripts/verification-entrypoint.test.ts), for the three cases;
- the value-domain matrix, the [executable model corpus](../../model-corpus/test/executable-model-corpus.test.ts), [`requirement-ledger-consistency`](https://github.com/mbackschat/bpmn-lean-experiment/blob/7f85d302750487fa2c30e54597200dadb2568c3d/scripts/requirement-ledger-consistency.test.ts) and the [About disclosure guard](../../scripts/capability-catalog-disclosures.test.ts), for the grown artifact;
- [`document-reviewability`](https://github.com/mbackschat/bpmn-lean-experiment/blob/7f85d302750487fa2c30e54597200dadb2568c3d/scripts/document-reviewability.test.ts), for this inventory.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `736861f6` | `fork-turns-none` | `approve-with-required-edits` | `4ffdef0f, 99960eb9` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `2378dbb2` | `fork-turns-none` | `approve-with-required-edits` | `ec385812` |
