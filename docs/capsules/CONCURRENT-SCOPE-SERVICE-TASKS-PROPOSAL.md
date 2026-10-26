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

Every effect-admitting profile today is a serial chain. The [host admission](../../packages/temporal-adapter/protocol/src/host-admission.ts) refuses a token split beside an effect wait as `concurrentHostDrivenWaits`, and the one scheduler that runs concurrent ordinary effects, the [ordinary-effect frontier scheduler](../../packages/temporal-adapter/workflow/src/ordinary-effect-frontier-scheduler.ts), is bound to the private sequential Multi-Instance profile. The semantic mechanisms already exist: `awaitEffect` arms in the Ordinary arming batch, effect completion is occurrence-addressed, and [`scopeQuiescent`](../../BpmnSemantics/SemanticProcess/ScopeCompletion.lean) already counts owned effect waits. This family is therefore an admission and hosting increment over existing semantics, plus the laws that make concurrent effect isolation explicit.

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

- [`CIB-EXT-0015`](../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0015--serial-business-task-enclosing-inputs-and-local-results) classifies the named-delegate binding this family reuses: exact `${identifier}` delegate tokens bound through a content-bound source overlay, with `camunda:asyncBefore="true"`. Only its binding clause applies, because this family admits no mappings.
- A new operational mapping, `CIB-OP-0010` (concurrent async-before Service Task continuations mapped to concurrent effect occurrences), is added with its verifier coverage. CIB Seven creates one async-before continuation job per arriving token; jobs of sibling branches are independent and may execute in any order, and a job's delegate invocation and Service Task completion share one transaction. The project instead commits one effect wait per occurrence, runs one Temporal Activity per wait, and commits each result as its own command in callback order. Both accounts agree on the public boundary of open tasks, open effects and Process status after each completion; CIB's job identity, optimistic-locking retries at the join and transaction timing are host facts of CIB, not semantics. A CIB probe of one retained model is optional calibration, not acceptance. `EXT-0015`'s boundary sentence "no concurrent execution is claimed" is narrowed to point at `OP-0010`.

The profile artifact's `relationships` list stays byte-identical for its pinned digest, so the new scenarios cite both relationships in their provenance, as the Call scenarios cite `CIB-EXT-0021` under the [profile README](../../profiles/cibseven-2.2.0-embedded-subprocess-completion-draft/README.md).

## Required, optional and excluded scope

Required: everything the [nested scope-control class](NESTED-EMBEDDED-SCOPE-CONTROL-SPEC.md#required-optional-and-excluded-scope) and the [merge regions](CONCURRENT-EMBEDDED-ACTIVATIONS-SPEC.md#required-optional-and-excluded-scope) require, where a **task** is now a User Task or a data-free Service Task:

- a data-free Service Task has one incoming and one outgoing flow, no input or output mapping, no attached boundary event, and exactly the overlay binding of `CIB-EXT-0015`'s binding clause;
- a model with a Service Task carries a content-bound source overlay for this profile; a model without one keeps its present overlay-free admission;
- every rule that requires a User Task (a nonempty scope body, a Parallel branch reaching work before a join or End, a merge branch reaching work before the merge, a serial merge-target body) accepts either task kind;
- the 128-task bound counts both kinds, multiplicity-weighted as today;
- at most 32 Service Tasks per definition, multiplicity-weighted like the task bound. This is the concurrent-Activity ceiling of the hosting preflight below.

Optional: any mix of the two task kinds within those bounds, including Service Tasks in the root body, in Parallel branches at every depth, in merge-region branches and in merge-target bodies.

Excluded:

- Service Tasks with mappings, boundary events, `asyncAfter`, other execution bindings, or no overlay binding;
- Service Tasks in called-process bodies;
- Script, Send, Business Rule and other automated tasks;
- every exclusion of the nested scope-control class and the merge regions.

These restrictions narrow admission only. Data, Errors and incidents later broaden the class without reinterpreting an admitted model, because the effect wait already carries mapping, route and incident slots that this profile leaves empty.

## Profile and public contract

The profile `cibseven-2.2.0-embedded-subprocess-completion-draft` grows in place under the [cumulative profile rule](../../contracts/README.md). Every model it admits today keeps its exact admission, commands and observations. No wire shape changes: Programs, Start, User Task completion, effect completion, and every observation keep their current schemas, and the profile's value domain stays empty on every surface, so an effect result carries an empty patch.

Public effect identity already carries a per-element activation: an effect occurrence is `{ processInstanceId, elementId, activation }`, minted from the per-element effect counter. Two live effect occurrences of one Service Task element, one in each live merge-target occurrence, are therefore distinct, and a completion addresses exactly one of them.

## Representation and runtime ownership

Lowering is unchanged. A Service Task lowers to `awaitEffect` with its descriptor, empty input and output mappings and no Error route, as it does in the [serial business-task account](SERIAL-BUSINESS-TASK-COMPOSITION-PROPOSAL.md). There is no synthetic place, operation or origin.

Runtime ownership follows the existing account. Arming records the effect wait with the arriving token's owner, so an effect inside a Sub-Process belongs to that scope occurrence. Effect completion erases exactly the addressed wait and adds one token at its output for the wait's owner; with empty mappings it leaves variables unchanged. `scopeQuiescent` already refuses completion while the occurrence owns an effect wait. No new runtime field, operation kind or transition family is introduced.

Effect completion needs no new command gate: the profile's empty value domain already admits exactly an empty result patch, and a BPMN Error result is refused because the wait has no Error route. One runtime invariant widens: `RSI-BOUND-01` in the [runtime-state invariant specification](../RUNTIME-STATE-INVARIANT-SPEC.md) is stated for the Effect family: no live effect occurrence exceeds its element's recorded count. TypeScript adds it to `runtimeStateDefects`; Lean states it as the separate predicate `effectIdentityBound`, in the same pattern as `scopeIdentityBound`. Its preservation across transitions stays in [the deliberately open lane](../RUNTIME-STATE-INVARIANT-SPEC.md#the-deliberately-open-lane).

## Admission

Admission stays [profile-parameterized](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md). The structured-body analysis and the merge-region scan are kind-agnostic: a task is one vertex with one input and one output whose arming costs one step and whose completion resumes its successor. A Service Task therefore enters both as a task vertex, in each language:

- TypeScript: the checked-node and Program-operation vertex projections of [nested scope-control admission](../../packages/semantic-core/src/nested-scope-control-admission.ts) map a data-free Service Task and its `awaitEffect` to a task vertex, and its shape alphabets accept them;
- Lean: `checkedVertex?` and `operationVertex?` in [`NestedScopeControlAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean) gain the same arms, and the profile's shape bounds in [`ProfileShapeCatalog`](../../BpmnSemantics/SemanticProcess/ProfileShapeCatalog.lean) accept `awaitEffect`.

The burst analysis charges an effect completion exactly as a User Task completion: the successor's arming, or the join, merge, End and scope-completion cascade that the existing analysis already bounds within `semanticProcessClosureLimit = 8`. The overlay binding check reuses the serial business-task descriptor validation in both languages.

The nearest wrong algorithms are: completing a scope when its last User Task completes while one of its effects is still open; treating a branch with only a Service Task as empty work, so a join fires early; and resolving an effect completion by element alone, so it completes the effect of the wrong merge-target occurrence.

## Stable rules

- `CSE-ADMIT-01`: profile admission is the existing admission with a task being a User Task or a data-free, overlay-bound Service Task, within the 128-task and 32-Service-Task multiplicity-weighted bounds and the closure bound. Every excluded construct is refused before Workflow start.
- `CSE-ARM-01`: each token reaching a Service Task arms one fresh effect occurrence owned by the token's owner, even while another occurrence of the same element is open.
- `CSE-QUIESCE-01`: a scope occurrence that owns an open effect is not quiescent; its completion waits for that effect's result, independently of its User Tasks.
- `CSE-ISOLATE-01`: committing one effect's result removes only that effect occurrence and adds one token at its output for its owner; every other effect, User Task, token and scope occurrence is unchanged.
- `CSE-REFUSE-01`: an effect completion addressing a completed, unknown or other-occurrence effect is rejected with the committed state preserved, even while an effect of the same element is open in another occurrence.

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
- **Stale and misaddressed effects** (`CSE-REFUSE-01`). Re-sending the completion of *Price damage* 2 after it committed, while *Price damage* 1 is open, is rejected with the state unchanged; so is a completion naming a third activation.
- **Orders.** Reversed effect-completion and task-completion orders of each journey end in the same final observation, up to activation numbering.
- **Refusals.** Each of the following is refused before start: a Service Task with an input mapping; with an output mapping; with an attached boundary Error; without an overlay binding; with `asyncAfter`; inside a called-process body; a Script Task in a branch; and 33 multiplicity-weighted Service Tasks.

## Lean assurance lane

Lane shape: proved

Concurrency families are `proved` under the owner direction of 2026-10-14. The declarations live in one new family-owned laws module beside [`EffectCompletion`](../../BpmnSemantics/SemanticProcess/EffectCompletion.lean), never appended to a hub, as [migration step 5](../LEAN-BUILD-MODULARITY-PROPOSAL.md#migration-order) requires:

- `CSE-ISOLATE-01`: a frame law for `completeEffect` with empty output mappings. The successor's effect waits are the predecessor's with exactly the addressed wait erased, its tokens add exactly one token at the wait's output for its owner, and waits, message and timer waits, scope occurrences, variables and counters are unchanged. Every component of every other effect, task and occurrence is therefore preserved.
- `CSE-ARM-01`: a freshness law for effect arming: given `effectIdentityBound` in the predecessor, the armed occurrence differs from every live effect occurrence of its element. Executable checks confirm `effectIdentityBound` on the retained journey states.
- `CSE-QUIESCE-01`: `scopeQuiescent` is false whenever the occurrence owns an effect wait, specialized from its definition; the nested-scope journeys check that completion follows the last result.
- `CSE-ADMIT-01`: rules 1–3 keep the quantified per-body certificate, which is kind-agnostic. The new vertex arms, the admission of each retained model and each refusal are fixed by executable checks run natively by [`ConformanceChecksMain`](../../BpmnSemantics/ConformanceChecksMain.lean).
- `CSE-REFUSE-01`: executable conformance checks on the stale and misaddressed commands.

Checked non-law: User Task quiescence alone does not imply scope quiescence in this profile. An executable conformance check shows a state of the supplier journey in which Onboard owns no User Task and no token but one effect wait, and `scopeQuiescent` is false.

The nearest unsupported claims are that every admitted definition completes under every interleaving of effect results and human commands, and that effect identity is fresh in every reachable state. Progress over newly reachable states rests on the targeted preservation gate, and freshness beyond the retained journeys rests on the open preservation lane.

## Rule-to-evidence matrix

| Rule | BPMN or profile | Lean | TypeScript | Temporal | Negative witness | Mutation |
|---|---|---|---|---|---|---|
| `CSE-ADMIT-01` | required scope above | vertex arms, retained admissions and refusals by executable checks; per-body certificate | admission tests and source refusals | host admission of each retained Program; 32-Activity capacity fit | listed refusals | none; refusals are admission tests |
| `CSE-ARM-01` | Clauses 10.3.3.1, 13.3.3 | freshness law given `effectIdentityBound` | core journeys; `runtimeStateDefects` on every gate prefix | pipeline schedules | none | wrong activation |
| `CSE-QUIESCE-01` | Clause 13.3.4 | specialized quiescence law; checked non-law | core journeys | pipeline schedules | none | quiescence ignoring effects |
| `CSE-ISOLATE-01` | Clauses 13.3.3, 13.4.1 | `completeEffect` frame law; journey conformance | per-command sibling check in the preservation gate | pipeline schedules; recovery witness | none | premature join, wrong activation |
| `CSE-REFUSE-01` | profile command contract | stale and misaddressed conformance | stale-command journeys | pipeline schedule | stale and misaddressed effect | none |

## Targeted preservation gate

The core gate covers every retained journey prefix in every tested order of effect results and task completions. On each prefix it establishes that:

- every stable running state exposes a User Task or an effect, or has completed;
- no closure yields `ambiguousInternalChoice`, every closure stays within its computed bound, and the longest closure reaches it;
- each command leaves every other occurrence's open User Tasks and effects unchanged;
- `runtimeStateDefects`, with the extended `RSI-BOUND-01`, reports no defect.

Host admission is Program-static and is checked once per retained Program.

## Temporal hosting and refinement preflight

This family adds one hosting mechanism to a public profile: concurrent ordinary effect Activities beside passive User Task waits.

- **Ingress.** Start and User Task Update stay as they are. Effect results arrive as Activity completions and enter the same ingress queue as human commands, in callback order, through the existing ordinary-effect frontier scheduler.
- **Waits and effects.** The scheduler preflights the whole new frontier, starts one Activity per new effect occurrence with the occurrence's transport key as idempotency key, and never reschedules an occurrence it owns. Activities use the existing two-attempt legacy policy.
- **Timers and cancellation.** None. The profile admits no Timer and no interruption, so no running Activity is ever semantically cancelled. A technical failure or exhausted attempts fail the Workflow as a typed host failure, as in the serial business-task account; sibling Activities may already have run, which is a host fact with no semantic claim.
- **Lifecycle.** Rollover is fenced while an issued Activity or its released result is unreconciled; new Activities are not issued while the fence is up, and pending semantic effect waits cross Continue-As-New as committed state to be scheduled by the successor Run. The [history reservation](../../packages/temporal-adapter/workflow/src/ordinary-effect-history-reservation.ts) projects the drain envelope of the whole frontier before issuing it.
- **Capacity.** Two production bounds limit a frontier. Every released result occupies one entry of the 64-entry semantic input queue beside at most eight in-flight Updates, and the reservation charges each Activity its 64 KiB result bound plus six History Events, so a frontier the 128-task bound allows would not fit a fresh Run. The 32-Service-Task admission bound keeps all released results plus the Update ceiling inside the queue and the whole frontier's drain envelope under the Event History rollover trigger without the protected reserve. The capacity owner proves an exact-32 frontier fits a fresh Run under every production Event, byte and queue bound; the 33rd is refused by admission, never at runtime. The profile admits no values, so request bytes are fixed by the definition and the Start capacity envelope stays inapplicable.
- **Projection.** E1 and E2 publications come from the core's committed steps; Activity attempts, Activity IDs and Run identity stay host facts.

Hosting changes, each bounded to this profile and the sequential Multi-Instance profile that already uses the scheduler:

- [host admission](../../packages/temporal-adapter/protocol/src/host-admission.ts) admits this profile's token split beside effect waits only under complete profile admission, in the pattern the subscription profile uses, and keeps `concurrentHostDrivenWaits` for every other profile;
- the scheduler's profile guard and the rollover-fence gate accept one shared set of ordinary-effect frontier profiles instead of the sequential Multi-Instance identity;
- the scheduler selection moves out of [`workflow-implementation.ts`](../../packages/temporal-adapter/workflow/src/workflow-implementation.ts) into its own owner when the change would push that file past the review target.

The preserved state relation is the [concurrent activations relation](CONCURRENT-EMBEDDED-ACTIVATIONS-SPEC.md#temporal-hosting-and-refinement-preflight) extended with effect waits. It additionally preserves every open effect occurrence id, its owner, its descriptor and its transport key.

Risks and their deciders:

- **Ordering.** Results of concurrent Activities commit in arrival order, which is a nondeterministic input; the pipeline realizes each scenario's explicit effect-completion order through the testkit's ordered effect execution.
- **Deduplication.** A retried Activity reuses its transport key, so a handler sees one key per effect occurrence; a late result for an already committed occurrence is rejected by `CSE-REFUSE-01`.
- **Concurrency with human commands.** Effect results and Updates share one queue and one semantic loop, so no two commands interleave inside a closure.
- **Replay.** Activity scheduling order is derived from the committed frontier in its canonical projection order, so replay issues the same commands.

Smallest refinement witness: a recovery test on the claim intake model replaces the Worker while both *Price damage* Activities are in flight, commits *Price damage* 2 before a *Collect police report* Update and *Price damage* 1 after it, forces one Continue-As-New while an effect wait is open but unscheduled, checks E1 and E2 against the core oracle, and replays every Run. A component test of the capacity owner holds the exact-32 fit on a fresh Run.

## Evidence and acceptance

The supplier and claim intake models carry the journey witnesses as answer-free scenarios with registered pipeline cases, ordered effect schedules, and seeded premature-join, quiescence and wrong-activation mutations. They also get a corpus row, the About disclosure and a runnable Product 1 example with named handlers. The refusals are admission fixtures in both languages.

Acceptance requires:

- Lean, core and Temporal agree on every schedule in the complete pipeline;
- both languages refuse every listed refusal witness;
- every model the profile admits today keeps its exact evidence;
- the [requirement ledger](../BPMN-REQUIREMENT-LEDGER.md) rows `BPMN-SERVICE-TASK-01` and `BPMN-PARALLEL-GATEWAY-01` extend their closed slices to data-free Service Tasks running concurrently in Parallel branches and in nested and concurrently live Sub-Process occurrences;
- the [lifecycle specification](../TEMPORAL-PROCESS-LIFECYCLE-SPEC.md) names this profile as the first public profile admitting concurrent ordinary effect Activities, replacing its statement that the ordinary-effect reservation is private component qualification only.

## Common-mode risks

- Both languages transcribe the same kind-agnostic vertex account, so a Service Task whose burst the analysis undercounts would pass both admissions identically. The core closure-bound check on the longest cascade is the only executable detector.
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
  - [effect operation artifacts](../../scripts/effect-operation-artifact-consistency.test.ts) and [contract definition artifacts](../../scripts/contract-definition-artifacts.test.ts).
- Registration: the [capsule roundtrip](../../scripts/capsule-roundtrip.test.ts), the [pipeline catalog](../../packages/differential/test/pipeline-catalog.test.ts), [product examples](../../packages/temporal-adapter/testkit/test/product-example-configs.test.ts), [requirement ledger consistency](../../scripts/requirement-ledger-consistency.test.ts), the [executable model corpus](../../model-corpus/test/executable-model-corpus.test.ts) and the [contract artifact projections](../../scripts/contract-artifact-projections.test.ts), which bind the new register entry.
- Runtime invariants: the [non-reissue claim guard](../../scripts/runtime-state-non-reissue-claims.test.ts).
- Hosting: [host admission](../../packages/temporal-adapter/testkit/test/host-admission.test.ts), [execution publication integration](../../packages/temporal-adapter/workflow/test/execution-publication-integration.test.ts) and the [pre-release architecture guard](../../scripts/pre-release-architecture.test.ts).
- Structure: [Lean import boundaries](../../scripts/lean-import-boundaries.test.ts), the [profile capability dispatch guard](../../scripts/lean-profile-capability-dispatch.test.ts), [Lean fanout](../../scripts/lean-fanout.test.ts), the [semantic operation consumer census](../../scripts/semantic-operation-consumer-census.test.ts) and [source hygiene](../../scripts/source-hygiene.test.ts).

### Owners this implementation grows

Extract an owner before growth would exceed its review target:

- source: [checked element projection](../../packages/bpmn-source/src/checked-element-projection.ts) and [checked graph admission](../../packages/bpmn-source/src/checked-process-graph-admission.ts);
- TypeScript core: [nested scope-control admission](../../packages/semantic-core/src/nested-scope-control-admission.ts), the [Program](../../packages/semantic-core/src/semantic-program-profile-shape.ts) and [checked](../../packages/semantic-core/src/checked-process-profile-shape.ts) profile shapes, and `runtimeStateDefects`;
- Lean: [`NestedScopeControlAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean), [`ProfileShapeCatalog`](../../BpmnSemantics/SemanticProcess/ProfileShapeCatalog.lean), one new laws module and one new conformance owner;
- Temporal: [host admission](../../packages/temporal-adapter/protocol/src/host-admission.ts), the [frontier scheduler](../../packages/temporal-adapter/workflow/src/ordinary-effect-frontier-scheduler.ts) and [`workflow-implementation.ts`](../../packages/temporal-adapter/workflow/src/workflow-implementation.ts).

Growth falsifies these passages, which the implementation corrects: the Service Task exclusion of the [nested scope-control class](NESTED-EMBEDDED-SCOPE-CONTROL-SPEC.md#required-optional-and-excluded-scope) and of the merge regions; the [profile-parameterized admission](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md) row's operation list; `RSI-BOUND-01`'s statement that Effect remains unstated; and the lifecycle specification's host-predicate paragraph.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
