# Concurrent scope Service Tasks proposal

## Status

Lifecycle: draft
Review: pending

## Question and delivery boundary

Can the scope family admit data-free Service Tasks wherever its nested scope-control class admits a User Task, so that several external effects run concurrently with each other and with human work, inside nested and concurrently live Sub-Process occurrences? Each effect must belong to exactly one task occurrence, keep its scope non-quiescent until its result commits, and leave every sibling effect, task and occurrence untouched when it completes.

This is the next family of batch 2 in [PLAN](../PLAN.md#exact-resume-point). It serves three clauses of the [coverage checklist](../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) and closes none of them, because each row also needs data (`PC-DATA-04`–`06`):

- `PC-SCOPE-01`: mixed User and Service activities in nested embedded scopes, completing at exact owned quiescence;
- `PC-SCOPE-02`: distinct effect lifetimes in two live occurrences of one embedded definition;
- `PC-CF-03`: Parallel fork/join composition with human and automated branches.

Every publicly hosted effect-admitting profile today is a serial chain. The [host admission](../../packages/temporal-adapter/protocol/src/host-admission.ts) refuses a token split beside an effect wait as `concurrentHostDrivenWaits`, and the one scheduler that runs concurrent ordinary effects, the [ordinary-effect frontier scheduler](../../packages/temporal-adapter/workflow/src/ordinary-effect-frontier-scheduler.ts), is bound to the private sequential Multi-Instance profile. The semantic mechanisms already exist: `awaitEffect` arms in the Ordinary arming batch, effect completion is occurrence-addressed, and [`scopeQuiescent`](../../BpmnSemantics/SemanticProcess/ScopeCompletion.lean) already counts owned effect waits. This family is therefore an admission and hosting increment over existing semantics, plus the laws that make concurrent effect isolation explicit.

The following stay later increments:

- data on Service Tasks: input and output mappings, Start values and completion values (`PC-DATA-04`–`06`, `PC-AUTO-01`);
- business Errors, incidents, retry and cancellation of a running effect (`PC-AUTO-03`, `PC-SCOPE-07`);
- Service Tasks in called-process bodies, cycles and Multi-Instance bodies of this profile;
- other automated task kinds (Script, Send, Business Rule).

## Normative basis and CIB classification

The passages below are in the [external reading copy](../reference/bpmn-2.0.2/README.md#reading-workflow).

- **Clause 10.3.3.1 and Clause 13.3.3.** A Service Task invokes its service when activated and completes when the service completes. Activation is per arriving token, so two tokens give two Activity instances with independent lifetimes.
- **Clause 13.3.4.** An embedded Sub-Process completes only when no token remains and no contained Activity is active. A running Service Task is an active Activity, so its scope cannot complete before the effect result.
- **Clause 13.4.1, Table 13.1.** A Parallel fork produces one token per outgoing flow, and the join waits for every incoming flow, regardless of which Activity kind the branches contain.

The profile stays standards-only for the new schedules, as the nested and concurrent schedules of this profile are. Two CIB relationships apply:

- [`CIB-EXT-0015`](../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0015--serial-business-task-enclosing-inputs-and-local-results) classifies the unambiguous named delegate bindings this family reuses. The binding rule itself, an exact `${identifier}` delegate token bound through a content-bound source overlay with `camunda:asyncBefore="true"`, is owned by the [serial business-task admission rules](SERIAL-BUSINESS-TASK-COMPOSITION-PROPOSAL.md#admission-and-execution-rules); this family admits no mappings.
- A new operational mapping, `CIB-OP-0010` (concurrent async-before Service Task continuations mapped to concurrent effect occurrences), is added with its verifier coverage. In the pinned checkout `5a45b47ea2`, `PvmAtomicOperationTransitionCreateScope.isAsync` and `PvmAtomicOperationActivityStartCreateScope.isAsync` (engine `impl/pvm/runtime/operation`, line 30) interrupt each execution entering an async-before activity, and `AsyncContinuationJobHandler` continues it from its own job, so each arriving token gets its own continuation job. That sibling jobs may execute in either order and that a job's delegate invocation and Service Task completion share one transaction are source-unverified until the register entry cites the deciding source or test. The project instead commits one effect wait per occurrence, runs one Temporal Activity per wait, and commits each result as its own command in callback order. Both accounts are expected to agree on the public boundary of open tasks, open effects and Process status after each completion; CIB's job identity and transaction timing are host facts of CIB, not semantics. A CIB probe of one retained model is optional calibration, not acceptance. `EXT-0015`'s boundary sentence "no concurrent execution is claimed" is narrowed to point at `OP-0010`.

The profile artifact stays byte-identical for its pinned digest, so its `relationships`, `extensions` and `excluded` lists (which name `effects`, `external-services` and `vendor-extensions`) no longer describe the admitted surface. As for Calls, the new scenarios cite both relationships in their provenance, and the [profile README](../../profiles/cibseven-2.2.0-embedded-subprocess-completion-draft/README.md) gains a paragraph superseding those three exclusions for data-free overlay-bound Service Tasks.

## Required, optional and excluded scope

Required: everything the [nested scope-control class](NESTED-EMBEDDED-SCOPE-CONTROL-SPEC.md#required-optional-and-excluded-scope) and the [merge regions](CONCURRENT-EMBEDDED-ACTIVATIONS-SPEC.md#required-optional-and-excluded-scope) require, where a **task** is now a User Task or a data-free Service Task:

- a data-free Service Task has one incoming and one outgoing flow, no input or output mapping, no attached boundary event, and exactly the overlay binding of `CIB-EXT-0015`'s binding clause;
- a model carries a content-bound source overlay for this profile exactly when it has a Service Task; a model without one keeps its present overlay-free admission, and an overlay on a model without a Service Task is refused;
- every rule that requires a User Task (a nonempty scope body, a Parallel branch reaching work before a join or End, a merge branch reaching work before the merge, a serial merge-target body) accepts either task kind, except the called-body rule, which keeps refusing Service Tasks;
- the 128-task bound counts both kinds, multiplicity-weighted as today;
- at most 32 Service Tasks per definition, multiplicity-weighted like the task bound. This is the concurrent-Activity ceiling of the hosting preflight below.

Optional: any mix of the two task kinds within those bounds, including Service Tasks in the root body, in Parallel branches at every depth, in merge-region branches and in merge-target bodies.

Excluded:

- Service Tasks with mappings, boundary events, `asyncAfter`, other execution bindings, or no overlay binding;
- Service Tasks in called-process bodies, and any Service Task in a model with a Call Activity;
- Script, Send, Business Rule and other automated tasks;
- every exclusion of the nested scope-control class and the merge regions.

These restrictions narrow admission only. Data, Errors and incidents later broaden the class without reinterpreting an admitted model, because the effect wait already carries mapping, route and incident slots that this profile leaves empty.

## Profile and public contract

The profile `cibseven-2.2.0-embedded-subprocess-completion-draft` grows in place under the [cumulative profile rule](../../contracts/README.md). Every model it admits today keeps its exact admission, commands and observations. No wire shape changes: Programs, Start, User Task completion, effect completion, and every observation keep their current schemas, and the profile's value domain stays empty on every surface, so an effect result carries an empty patch.

Public effect identity already carries a per-element activation: an effect occurrence is `{ processInstanceId, elementId, activation }`, minted from the per-element effect counter. Two live effect occurrences of one Service Task element, one in each live merge-target occurrence, are therefore distinct, and a completion addresses exactly one of them.

## Representation and runtime ownership

Lowering is unchanged. A Service Task lowers to `awaitEffect` with its descriptor, empty input and output mappings and no Error route, as it does in the [serial business-task account](SERIAL-BUSINESS-TASK-COMPOSITION-PROPOSAL.md). There is no synthetic place, operation or origin.

Runtime ownership follows the existing account. Arming records the effect wait with the arriving token's owner, so an effect inside a Sub-Process belongs to that scope occurrence. Arming also inserts one effect-owned Activity variable scope, empty here. Effect completion erases exactly the addressed wait, removes exactly that effect's Activity variable scope through `completeActivityVariableScope`, leaves Process variables unchanged, and adds one token at its output for the wait's owner. `scopeQuiescent` already refuses completion while the occurrence owns an effect wait. No new runtime field, operation kind or transition family is introduced.

Effect completion needs no new command gate: the profile's empty value domain already admits exactly an empty result patch, a BPMN Error result is refused because the wait has no Error route, and this profile reaches the generic `completeEffect` arm of the Lean command-admission cascade, which an executable dispatcher check records. No runtime invariant widens. `RSI-BOUND-01` in the [runtime-state invariant specification](../RUNTIME-STATE-INVARIANT-SPEC.md) keeps Effect unstated: arming already refuses a colliding occurrence through its availability guard, so a stale counter could make arming fail but never succeed wrongly. An Effect amendment would change the gated defect set of every effect-bearing profile under [AA-18](../ASSURANCE-IMPROVEMENT-REGISTER.md#aa-18) and is not needed for this family's claims.

## Admission

Admission stays [profile-parameterized](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md). The structured-body certificate and the merge-region scan see only task vertices, but the analysis around them is keyed off a per-body list built from User Tasks alone. In both languages that list drives the resumption-burst loop, the multiplicity-weighted 128 count, the merge-target body check (`serialTargetBody`: task vertices must equal listed tasks) and the called-body check. The widening therefore has three parts in each language:

- the checked-node and Program-operation vertex projections map a data-free Service Task and its `awaitEffect` to a task vertex, and the shape alphabets accept them;
- the per-body task list includes Service Tasks, so every Service Task completion is charged a resumption burst, counts toward the 128 bound and satisfies the merge-target body check; a separate per-body Service Task list feeds the 32 bound and the called-body check, which refuses any;
- a model with a Call Activity and a Service Task is refused.

The owners are [nested scope-control admission](../../packages/semantic-core/src/nested-scope-control-admission.ts) in TypeScript, and [`NestedScopeControlAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean) and the profile's shape bounds in [`ProfileShapeCatalog`](../../BpmnSemantics/SemanticProcess/ProfileShapeCatalog.lean) in Lean. An effect completion is then charged exactly as a User Task completion: the successor's arming, or the join, merge, End and scope-completion cascade that the existing analysis already bounds within `semanticProcessClosureLimit = 8`.

Source admission needs its own dispatch. This profile compiles through the Generic dispatch of [compilation dispatch](../../packages/bpmn-source/src/compilation-dispatch.ts), which refuses any overlay and filters foreign attributes by profile. A profile-specific dispatch selects overlay-free Generic compilation when the model has no Service Task and otherwise admits the overlay, `camunda:delegateExpression` and `camunda:asyncBefore` on Service Tasks only, reusing the serial business-task binding and descriptor validation of [serial business-task source](../../packages/bpmn-source/src/serial-business-task-source.ts).

The nearest wrong algorithms are: completing a scope when its last User Task completes while one of its effects is still open; treating a branch with only a Service Task as empty work, so a join fires early; and resolving an effect completion by element alone, so it completes the effect of the wrong merge-target occurrence.

## Stable rules

- `CSE-ADMIT-01`: profile admission is the existing admission with a task being a User Task or a data-free, overlay-bound Service Task, within the 128-task and 32-Service-Task multiplicity-weighted bounds and the closure bound. Every excluded construct is refused before Workflow start.
- `CSE-ARM-01`: each token reaching a Service Task arms one effect occurrence owned by the token's owner, with a fresh activation, even while another occurrence of the same element is open; on the retained journeys arming never fails.
- `CSE-QUIESCE-01`: a scope occurrence that owns an open effect is not quiescent; its completion waits for that effect's result, independently of its User Tasks.
- `CSE-ISOLATE-01`: committing one effect's result removes only that effect occurrence and its Activity variable scope and adds one token at its output for its owner; before internal closure, every other effect, User Task, token, scope occurrence and Process variable is unchanged, and after closure every other occurrence's open User Tasks and effects are unchanged.
- `CSE-REFUSE-01`: an effect completion addressing an activation that is not live is rejected with the committed state preserved, even while an effect of the same element is open in another occurrence.

## Separating witnesses

All witnesses differ at the public boundary of open User Tasks and open effects, named by element and activation, and Process status.

- **Supplier onboarding.** The root runs the Sub-Process *Onboard* and then *Activate supplier*, a Service Task. Onboard forks *Screen sanctions* (Service), *Verify bank account* (Service) and *Review contract* (User) into a join, then runs *Approve supplier* (User).
  - Completing *Review contract* first leaves both effects open and *Approve supplier* absent; completing the two effects in either order opens *Approve supplier* only after the second.
  - A premature-join mutation opens *Approve supplier* after the User Task and one effect.
  - *Activate supplier* is armed only after Onboard completes; a quiescence mutation that ignores effect waits completes Onboard while an effect is open.
- **Claim intake.** The root runs the Sub-Process *Intake* and then *Settle claim* (User). Intake forks *Collect police report* (User) and *Fetch policy* (Service) into an Exclusive merge before the Sub-Process *Assess item*, which runs *Price damage* (Service) and then *Confirm assessment* (User).
  - Both branches reach the merge, giving two live *Assess item* occurrences with *Price damage* activations 1 and 2 open at once.
  - Completing *Price damage* 2 first opens *Confirm assessment* 1 in the second occurrence and leaves *Price damage* 1 open; a wrong-activation mutation completes *Price damage* 1 instead.
  - *Settle claim* appears only after both occurrences and Intake complete.
- **Stale and absent effects** (`CSE-REFUSE-01`). Re-sending the completion of *Price damage* 2 after it committed, while *Price damage* 1 is open, is rejected with the state unchanged; so is a completion naming a third activation that was never armed. These run on Lean and the core only: the Temporal host never offers a completion for an effect it does not own.
- **Service Task burst.** An admission witness nests Sub-Processes to depth three and ends the deepest body with a Service Task, so the admitted maximum closure is that effect's completion cascading through three scope completions. Both languages compute the same bound, and the core closure-bound check reaches it. A twin whose cascade exceeds the closure limit only through the Service Task's completion is refused.
- **Orders.** Reversed effect-completion and task-completion orders of each journey end in the same final observation, up to activation numbering.
- **Refusals.** Each of the following is refused before start: a Service Task with an input mapping; with an output mapping; with an attached boundary Error; without an overlay binding; without `asyncBefore`; with `asyncAfter`; inside a called-process body; beside a Call Activity in the caller root; an overlay on a model without a Service Task; a Script Task in a branch; and 33 multiplicity-weighted Service Tasks.

## Lean assurance lane

Lane shape: proved

Concurrency families are `proved` under the owner direction of 2026-10-14. The declarations live in one new family-owned laws module beside [`EffectCompletion`](../../BpmnSemantics/SemanticProcess/EffectCompletion.lean), never appended to a hub, as [migration step 5](../LEAN-BUILD-MODULARITY-PROPOSAL.md#migration-order) requires:

- `CSE-ISOLATE-01`: a frame law for the pre-closure `completeEffect` with empty output mappings. The successor's effect waits are the predecessor's with exactly the addressed wait erased, `variables.activities` loses exactly that effect's scope, `variables.process` is unchanged, its tokens add exactly one token at the wait's output for its owner, and waits, message and timer waits, scope occurrences and counters are unchanged. The closure-level claim stays with the per-command sibling check of the preservation gate. An executable dispatcher check records that this profile selects the generic `completeEffect` arm.
- `CSE-ARM-01`: no new law. Arming's availability guard already excludes a colliding occurrence on success, and the preservation gate checks that arming never fails on the retained journeys.
- `CSE-QUIESCE-01`: `scopeQuiescent` is false whenever the occurrence owns an effect wait, specialized from its definition; the nested-scope journeys check that completion follows the last result.
- `CSE-ADMIT-01`: rules 1–3 keep the quantified per-body certificate, which is kind-agnostic. The new vertex arms, the admission of each retained model and each refusal are fixed by executable checks run natively by [`ConformanceChecksMain`](../../BpmnSemantics/ConformanceChecksMain.lean).
- `CSE-REFUSE-01`: executable conformance checks on the stale and misaddressed commands.

Checked non-law: User Task quiescence alone does not imply scope quiescence in this profile. An executable conformance check shows a state of the supplier journey in which Onboard owns no User Task and no token but one effect wait, and `scopeQuiescent` is false.

The nearest unsupported claims are that every admitted definition completes under every interleaving of effect results and human commands, and that effect arming never fails in a reachable state. Progress over newly reachable states rests on the targeted preservation gate, and freshness beyond the retained journeys rests on the open preservation lane.

## Rule-to-evidence matrix

| Rule | BPMN or profile | Lean | TypeScript | Temporal | Negative witness | Mutation |
|---|---|---|---|---|---|---|
| `CSE-ADMIT-01` | required scope above | vertex arms, retained admissions and refusals by executable checks; per-body certificate | admission tests and source refusals | host admission of each retained Program; 32-Activity capacity fit | listed refusals | none; refusals are admission tests |
| `CSE-ARM-01` | Clauses 10.3.3.1, 13.3.3 | existing arming availability guard; journey conformance | core journeys; no arming failure on every gate prefix | pipeline schedules | none | wrong activation |
| `CSE-QUIESCE-01` | Clause 13.3.4 | specialized quiescence law; checked non-law | core journeys | pipeline schedules | none | quiescence ignoring effects |
| `CSE-ISOLATE-01` | Clauses 13.3.3, 13.4.1 | `completeEffect` frame law; journey conformance | per-command sibling check in the preservation gate | pipeline schedules; recovery witness | none | premature join, wrong activation |
| `CSE-REFUSE-01` | profile command contract | stale and absent-activation conformance | stale-command journeys | not host-reachable: the host offers only owned results, and a rejected host result fails the Workflow as a typed host failure | stale and absent-activation effect | none |

## Targeted preservation gate

The core gate covers every retained journey prefix in every tested order of effect results and task completions. On each prefix it establishes that:

- every stable running state exposes a User Task or an effect, or has completed;
- no closure yields `ambiguousInternalChoice`, every closure stays within its computed bound, and the longest closure reaches it;
- each command leaves every other occurrence's open User Tasks and effects unchanged;
- no effect arming fails, and `runtimeStateDefects` reports no defect.

Host admission is Program-static and is checked once per retained Program.

## Temporal hosting and refinement preflight

This family adds one hosting mechanism to a public profile: concurrent ordinary effect Activities beside passive User Task waits.

- **Ingress.** Start and User Task Update stay as they are. Effect results arrive as Activity completions and enter the same ingress queue as human commands, in callback order, through the existing ordinary-effect frontier scheduler.
- **Waits and effects.** The scheduler preflights the whole new frontier, starts one Activity per new effect occurrence with the occurrence's transport key as idempotency key, and never reschedules an occurrence it owns. Activities use the existing two-attempt legacy policy.
- **Timers and cancellation.** None. The profile admits no Timer and no interruption, so no running Activity is ever semantically cancelled. A technical failure or exhausted attempts fail the Workflow as a typed host failure, as in the serial business-task account; sibling Activities may already have run, which is a host fact with no semantic claim.
- **Lifecycle.** Rollover is fenced while an issued Activity or its released result is unreconciled; new Activities are not issued while the fence is up, and pending semantic effect waits cross Continue-As-New as committed state to be scheduled by the successor Run. The [history reservation](../../packages/temporal-adapter/workflow/src/ordinary-effect-history-reservation.ts) projects the drain envelope of the whole frontier before issuing it.
- **Capacity.** Three production bounds limit a frontier. The pending-Activity limit of the [Workflow-chain contract](../../packages/temporal-adapter/protocol/src/workflow-chain.ts) is 1 today, and the general activation margin in [History capacity](../../packages/temporal-adapter/workflow/src/workflow-event-history-capacity.ts) charges one Activity lifecycle on that basis. Every released result occupies one entry of the 64-entry semantic input queue beside at most eight in-flight Updates. The ordinary-effect reservation charges each Activity its 64 KiB result bound plus six History Events, so a frontier the 128-task bound allows would not fit a fresh Run. This family therefore makes the pending-Activity limit profile-aware: 32 for this profile, every other profile keeping 1. For this profile the ordinary-effect reservation, which projects the drain of every issued and new Activity before issuing a frontier, replaces the general margin's one-Activity arm; the margin keeps that arm for every other profile. The scheduler refuses a frontier that would exceed the profile's pending-Activity limit as a host invariant failure, which admission makes unreachable. The 32-Service-Task bound keeps every released result plus the Update ceiling inside the queue and the whole frontier's drain envelope under the Event History rollover trigger without the protected reserve. The capacity owner proves an exact-32 frontier fits a fresh Run under the pending-Activity, Event, byte and queue bounds; the 33rd is refused by admission, never at runtime. The profile admits no values, so request bytes are fixed by the definition and the Start capacity envelope stays inapplicable.
- **Projection.** E1 and E2 publications come from the core's committed steps; Activity attempts, Activity IDs and Run identity stay host facts.

Hosting changes, each bounded to this profile and the sequential Multi-Instance profile that already uses the scheduler:

- [host admission](../../packages/temporal-adapter/protocol/src/host-admission.ts) admits this profile's token split beside effect waits exactly when the Program is well formed and `nestedScopeControlProgramAnalysis` admits it, which includes the 32-Service-Task bound, and keeps `concurrentHostDrivenWaits` for every other profile;
- the scheduler's profile guard and the rollover-fence gate accept one shared set of ordinary-effect frontier profiles instead of the sequential Multi-Instance identity;
- the scheduler selection moves out of [`workflow-implementation.ts`](../../packages/temporal-adapter/workflow/src/workflow-implementation.ts) into its own owner before this change, because that file has no headroom for any growth;
- the profile-aware pending-Activity limit enters [the Workflow-chain contract](../../packages/temporal-adapter/protocol/src/workflow-chain.ts) and the margin's Activity arm in [History capacity](../../packages/temporal-adapter/workflow/src/workflow-event-history-capacity.ts).

The preserved state relation is the [concurrent activations relation](CONCURRENT-EMBEDDED-ACTIVATIONS-SPEC.md#temporal-hosting-and-refinement-preflight) extended with effect waits. It additionally preserves every open effect occurrence id, its owner, its descriptor and its transport key.

Risks and their deciders:

- **Ordering.** Results of concurrent Activities commit in arrival order, which is a nondeterministic input; the pipeline realizes each scenario's explicit effect-completion order through the testkit's ordered effect execution.
- **Deduplication.** A retried Activity reuses its transport key, so a handler sees one key per effect occurrence. The scheduler releases each owned Activity's result once and forgets the owner only after reconciliation, so no second result for a committed occurrence reaches the semantic loop; a result the core rejects anyway fails the Workflow as a typed host failure, never a silent rejection.
- **Concurrency with human commands.** Effect results and Updates share one queue and one semantic loop, so no two commands interleave inside a closure.
- **Replay.** Activity scheduling order is derived from the committed frontier in its canonical projection order, so replay issues the same commands.

Smallest refinement witness: a recovery test on the claim intake model replaces the Worker while both *Price damage* Activities are in flight, commits *Price damage* 2 before a *Collect police report* Update and *Price damage* 1 after it, forces one Continue-As-New while an effect wait is open but unscheduled, checks E1 and E2 against the core oracle, and replays every Run. A component test of the capacity owner holds the exact-32 fit on a fresh Run, including the pending-Activity dimension.

## Evidence and acceptance

The supplier and claim intake models carry the journey witnesses as answer-free scenarios with registered pipeline cases, ordered effect schedules, and seeded premature-join, quiescence and wrong-activation mutations. They also get a corpus row, the About disclosure and a runnable Product 1 example with named handlers. The refusals are admission fixtures in both languages.

Acceptance requires:

- Lean, core and Temporal agree on every schedule in the complete pipeline;
- both languages refuse every listed refusal witness;
- every model the profile admits today keeps its exact evidence;
- the [requirement ledger](../BPMN-REQUIREMENT-LEDGER.md) rows `BPMN-SERVICE-TASK-01` and `BPMN-PARALLEL-GATEWAY-01` extend their closed slices to data-free Service Tasks running concurrently in Parallel branches and in nested and concurrently live Sub-Process occurrences;
- the [lifecycle specification](../TEMPORAL-PROCESS-LIFECYCLE-SPEC.md) names this profile as the first public profile admitting concurrent ordinary effect Activities, replacing its statement that the ordinary-effect reservation is private component qualification only.

## Common-mode risks

- Both languages key admission off the same per-body task list, so a Service Task whose burst the analysis undercounts would pass Lean admission, core admission and the admission parity test identically. The Service Task burst witness, whose maximum closure comes from an effect completion, and the core closure-bound check are the only executable detectors.
- Both languages share `scopeQuiescent`, so an omission of effect waits there would complete scopes early in both. The checked non-law and the quiescence mutation detect it.
- The Worker shares the TypeScript core, so hosted agreement is a refinement check, not independent semantics.
- The ordered-effect testkit realizes one chosen arrival order per schedule; orders no schedule names are covered only by the semantic laws and the preservation gate, not by hosting evidence.

## Versioning consequences

Under the [pre-release wire policy](../../contracts/README.md#evolution-policy) no wire shape changes. The profile identity, every schema and every existing Program stay byte-identical. The family changes no kernel type, so its Lean edits are body arms in existing modules plus one new laws module: the first check of contract items 3 and 5 of the [build modularity proposal](../LEAN-BUILD-MODULARITY-PROPOSAL.md#proposed-contract).

`node scripts/what-binds.ts` on the grown paths names these binding guards:

- Admission and profile:
  - [nested scope-control admission](../../packages/semantic-core/test/nested-scope-control-admission.test.ts);
  - [checked graph admission](../../packages/bpmn-source/test/checked-process-graph-admission.test.ts);
  - [projected flow-element keys](../../packages/bpmn-source/test/projected-flow-element-keys.test.ts);
  - [parallel-scope Lean/core admission parity](../../packages/differential/test/parallel-scope-admission-lean-core.integration-test.ts);
  - [effect operation artifacts](../../scripts/effect-operation-artifact-consistency.test.ts) and [contract definition artifacts](../../scripts/contract-definition-artifacts.test.ts);
  - [foreign-attribute admission](../../packages/bpmn-source/test/foreign-attribute-admission.test.ts), which binds the compilation dispatch.
- Registration: the [capsule roundtrip](../../scripts/capsule-roundtrip.test.ts), the [pipeline catalog](../../packages/differential/test/pipeline-catalog.test.ts), [product examples](../../packages/temporal-adapter/testkit/test/product-example-configs.test.ts), [requirement ledger consistency](../../scripts/requirement-ledger-consistency.test.ts), the [executable model corpus](../../model-corpus/test/executable-model-corpus.test.ts) and the [contract artifact projections](../../scripts/contract-artifact-projections.test.ts), which bind the new register entry.
- Runtime invariants: the [non-reissue claim guard](../../scripts/runtime-state-non-reissue-claims.test.ts).
- Hosting: [host admission](../../packages/temporal-adapter/testkit/test/host-admission.test.ts), [Workflow-chain limits](../../packages/temporal-adapter/protocol/test/workflow-chain.test.ts), [execution publication integration](../../packages/temporal-adapter/workflow/test/execution-publication-integration.test.ts) and the [pre-release architecture guard](../../scripts/pre-release-architecture.test.ts).
- Structure: [Lean import boundaries](../../scripts/lean-import-boundaries.test.ts), the [profile capability dispatch guard](../../scripts/lean-profile-capability-dispatch.test.ts), [Lean fanout](../../scripts/lean-fanout.test.ts), the [semantic operation consumer census](../../scripts/semantic-operation-consumer-census.test.ts) and [source hygiene](../../scripts/source-hygiene.test.ts).

### Owners this implementation grows

Extract an owner before growth would exceed its review target:

- source: [compilation dispatch](../../packages/bpmn-source/src/compilation-dispatch.ts), [serial business-task source](../../packages/bpmn-source/src/serial-business-task-source.ts), [checked element projection](../../packages/bpmn-source/src/checked-element-projection.ts) and [checked graph admission](../../packages/bpmn-source/src/checked-process-graph-admission.ts);
- TypeScript core: [nested scope-control admission](../../packages/semantic-core/src/nested-scope-control-admission.ts), the [Program](../../packages/semantic-core/src/semantic-program-profile-shape.ts) and [checked](../../packages/semantic-core/src/checked-process-profile-shape.ts) profile shapes;
- Lean: [`NestedScopeControlAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean), [`ProfileShapeCatalog`](../../BpmnSemantics/SemanticProcess/ProfileShapeCatalog.lean), whose remaining headroom is small enough that its new arms may require an extraction first, one new laws module and one new conformance owner;
- Temporal: [host admission](../../packages/temporal-adapter/protocol/src/host-admission.ts), [the Workflow-chain contract](../../packages/temporal-adapter/protocol/src/workflow-chain.ts), [History capacity](../../packages/temporal-adapter/workflow/src/workflow-event-history-capacity.ts), the [frontier scheduler](../../packages/temporal-adapter/workflow/src/ordinary-effect-frontier-scheduler.ts) and [`workflow-implementation.ts`](../../packages/temporal-adapter/workflow/src/workflow-implementation.ts), from which the scheduler selection is extracted first.

Growth falsifies these passages, which the implementation corrects: the Service Task exclusion of the [nested scope-control class](NESTED-EMBEDDED-SCOPE-CONTROL-SPEC.md#required-optional-and-excluded-scope) and of the merge regions; the [profile-parameterized admission](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md) row's operation list; the lifecycle specification's host-predicate paragraph, its statement that the ordinary-effect reservation is private component qualification, and its Workflow-chain activation-margin paragraph, which must name the profile-aware pending-Activity limit; the [repeated, nested and concurrent Calls account](REPEATED-NESTED-CONCURRENT-CALLS-SPEC.md), whose caller-root class now excludes Service Tasks explicitly; and `CIB-EXT-0015`'s boundary sentence on concurrent execution.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
