# Plan

This document owns the current checkpoint, ordered next work, unresolved decisions, and exact resume point. It is not a feature-history board: durable product and semantic boundaries belong in [PROJECT-DESIGN.md](PROJECT-DESIGN.md), concrete repository and deployment architecture in [ARCHITECTURE.md](ARCHITECTURE.md), exact supported and absent surfaces in [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md), test procedure in [TESTING-SPEC.md](TESTING-SPEC.md), semantic meaning in the owning [capsule](capsules/README.md), commit-bounded cost in [CAPSULE-COST-LEDGER.md](CAPSULE-COST-LEDGER.md), and process findings in [PROCESS-ASSESSMENT-LEDGER.md](PROCESS-ASSESSMENT-LEDGER.md). A completed item is deleted from here once its content has an owner; Git retains the history. [The plan-shape guard](../scripts/plan-status-consistency.test.ts) enforces that.

## Current checkpoint

**Two MIT products are now separated.** The BPMN execution engine is implemented across twenty-plus closed semantic capsules; the [BPM platform](BPM-PLATFORM-PROPOSAL.md) is owner-approved as a contract and has its [modular-monolith architecture](ARCHITECTURE.md), guarded package dependency direction, narrow compilation and exact-version start gateway, exact content-addressed artifact store, public definition contract, durable definitions module, public definition HTTP routes, Node server composition root, HTTP-only React definition workspace with licensed exact-source diagram viewing and selected-version start, and registered real-Temporal M1 showcase. [PROJECT-DESIGN.md](PROJECT-DESIGN.md#product-division) owns the division and [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md) owns the exact implemented and absent boundary for both.

**The engine executes a bounded but broad slice.** Exact BPMN bytes admit through a checked project-owned graph to the Semantic Process IL, which Lean and an independently written TypeScript semantic core each evaluate, and which Temporal hosts durably. Closed families include Parallel fork/join, Exclusive Gateway with a project-owned Boolean expression language, Inclusive and Event-Based Gateways, Call Activity, embedded Sub-Process completion and Error propagation, Intermediate Catch Timer and Message, Message-addressed Receive Task, Service Task effects, User Task completion data, three boundary-Timer loci including the non-interrupting one, and the first resumption-bounded cycle. The cycle uses an explicit Exclusive Merge, traverses both conditional back-edges, exits through the default route, survives Worker replacement, refuses a stale occurrence, discriminates candidate-output and occurrence-identity defects, and replays. Each capsule owns its own meaning, laws, and exclusions.

**Message Start semantics and Product 2 ingress are implemented, closure-reviewed, evidence-closed, and graduated.** The registered standards-only profile preserves exact Process, Start Event, Message, Interface, and Interface Operation identity through source, checked graph, IL, Lean, the independent core, the answer-free differential case, the runnable example, and direct Temporal Workflow creation. The [Product 2 specification](BPM-PLATFORM-MESSAGE-INGRESS-SPEC.md) publishes one exact target through a durable no-redispatch resource, strict HTTP and UI surfaces, response-loss recovery, Worker-absent and replacement execution, exact fanout and browser-identity mutations, history/replay, and private-fact exclusion without changing BPMN meaning.

**Timer Start is implemented, closure-reviewed, evidence-closed, and graduated.** The registered standards-only [specification](capsules/TIMER-START-EVENT-SPEC.md) preserves exact Process, Start Event, duration, and output identity through source, checked graph, IL, Lean, the independent core, answer-free differential evidence, the runnable example, and a live one-action Temporal Schedule witness. That witness proves Worker absence, service-returned opaque Workflow/Run addressing, exact downstream completion, action exhaustion, meaningful mutations, and replay. Product 2 scheduling remains outside this capsule.

**Terminate End is implemented, closure-reviewed, evidence-closed, and graduated.** Closure target `2d75149` passed the complete verifier and independent context-cold closure review. The exact standards-only profile, three answer-free scenarios, runnable example, differential mutations, Worker replacement, stale refusal, 20-event history, durable global-cancellation discriminator, and replay evidence are maintained by the graduated specification.

**The configured Task extension is implemented, closure-reviewed, evidence-closed, and graduated.** The exact project-extension profile retains a distinct configured Task checked identity, lowers only its reviewed namespace/type binding to the existing neutral Probe effect, preserves plain Abstract Task as conforming but deferred, and carries registered answer-free, differential, live Temporal Worker-replacement/history/replay, and CIB-exclusion evidence. Closure target `e1f81ca` and correction `8959a0c` closed the governed review.

**Product 2 definition scheduling is implemented, closure-reviewed, evidence-closed, and graduated.** The [specification](BPM-PLATFORM-DEFINITION-SCHEDULING-SPEC.md) owns exact Timer Start capability publication, the strict one-shot schedule API, durable lifecycle, handle-free host operations, public UI, live exact-version and cancellation evidence, and headless-browser acceptance. Closure target `2b5cc40` passed the complete repository gate and approved warm-continuity review. M1 remains an independent regression floor.

**Product 2 Process-instance search is implemented, closure-reviewed, evidence-closed, and graduated.** The [specification](BPM-PLATFORM-PROCESS-INSTANCE-SEARCH-SPEC.md) owns the exact public identity contract, independent `operate` SQLite index, all three confirmed-start producer hooks, global HTTP route, HTTP-only panel, restart-stable cursor paging, exact filters, private-fact exclusion, live production-host witness, and browser acceptance. Closure target `8a87cf4` and correction `326dde5` closed the governed review.

**One generic standards profile now admits the complete selected notation set.** `bpmn-2.0.2-user-task-preserved-notation-draft` retains Diagram Interchange, pools, lanes, artifacts, and documentation without executing them. Every other standards profile rejects that set through an exact key allowlist. The two product-neutral mapped Service Task profiles may consume only a content-bound data-only overlay that maps alternate exact source bindings to an existing profile-owned descriptor and names exact inert expanded-name loci; it adds no reader or semantic operation. The preserve-enabled profile is registered with its own answer-free scenario, pipeline case, and live example, and a rejected file names each element the classification refused. Five structural requirement rows record what it admits without letting retention read as executable support. M1 is closed across engine admission, storage, versioning, public HTTP, exact-source rendering, selected-version start, real Temporal hosting, and required headless Chromium acceptance.

**The A12 product boundary is implemented and evidence-closed.** Same-reviewer audit approved closure correction `8d6ea1a` after the owner-authorized third checkpoint audit approved `398719b`. The [A12 add-on boundary specification](A12-ADD-ON-BOUNDARY-SPEC.md) owns the product-neutral overlay contract, optional preserved evidence, and exclusions. Built-in profiles, scenarios, source readers, Lean, the semantic core, Temporal, CIB evidence, product examples, and shared schemas contain no A12-specific production decision. [The current adoption handoff](../adoption/a12/current/README.md#resume-point-for-a-future-a12-add-on) explains how a future A12-owned repository resumes without crossing the product or licence boundary.

**Evidence is differential rather than self-reported.** Registered answer-free scenarios run through Lean, the semantic core, Temporal, and selected pinned CIB Seven lanes; every case carries a seeded semantic mutation that must produce a disagreement, and retained CIB observations are content-bound. Neutral scenario inputs stay physically separate from expected results.

## Showcase milestone ladder

The approved [BPM platform proposal](BPM-PLATFORM-PROPOSAL.md) makes showcase milestones its acceptance gates and leaves the list to this plan. This is that list.

Each milestone names one capability demonstrable end to end, the engine work it forces, the platform work it adds, and the executable gate that closes it. The order is a dependency order and not a schedule. It is deliberately shorter than the eight-stage horizon in [the competitive scope research](research/BPM-PLATFORM-COMPETITIVE-SCOPE-RESEARCH.md#dependency-ordered-roadmap), which is design input; the exit gates below are the binding ones, and a milestone closes only when its gate is green and [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md) records the exact surface it reached.

Two boundaries hold across the whole ladder. The engine must still build and verify with no platform package present, and the platform must reach the engine only through narrowed public entry points. A milestone that can be demonstrated only by violating either has not been reached.

### M0 — shipped floor

**Status: closed.**

The [Temporal engine runner](RUNNABLE-TEMPORAL-MVP-SPEC.md) over the registered profile catalog. No demo is owed; it exists so the later exit gates have a baseline to differ from. Its configured actors and effect handlers are host simulations, and User Task interaction stays simulated until M3 replaces it with a real inbox.

### M1 — a third party deploys their own BPMN file

**Status: closed.** The engine admission slice, narrow compilation and exact-version start gateway, exact artifact byte store, strict public definition contract, durable per-process versioning workflow, public definition API, server composition, React definition workspace with viewer-only diagram rendering and selected-version start, and required headless Chromium acceptance are implemented. The registered showcase composes a cached ephemeral Temporal service, production Worker, production platform server, and browser client without putting test infrastructure in a production dependency graph.

**Demo.** Someone who is not us uploads BPMN bytes we have never seen, receives an honest per-element admission verdict, and starts an instance when the file is admitted.

This is the owner's original acceptance condition. The preserve-enabled profile admits the selected modeler notation without executing it and reports each refused element. Product 2 receives exact uploaded bytes through its public API, compiles them without receiving private engine representations, stores exact digest-bound bytes without replacement, assigns durable monotonic versions within each process ID, and returns public diagnostics and exact source. Exact-version start recompiles stored bytes and binds source, digest, profile, Process ID, version, semantic instance ID, and Task Queue before calling the concrete Temporal client. The HTTP-only React client composes upload, diagnostics, catalog, version, source-identity verification, licensed diagram rendering, and selected-version start. The showcase exercises that composition over runtime-created source and real Temporal hosting.

**Engine capsules.** Preserve-only admission, splitting parsed material into executed, preserved, and rejected as [the minimal-engine research](research/MINIMAL-USEFUL-BPMN-ENGINE-RESEARCH.md) recommends; multi-root definitions with explicit executable-root selection; per-element rejection diagnostics carrying element identity and reason.

**Platform increments.** The public HTTP API, upload, content-addressed definition storage keyed by engine-computed digest, version ordinals within a BPMN process identifier, viewer-only diagram rendering, admission diagnostics, and a React client that consumes only the same public API an external adopter has.

**Exit gate.** An externally supplied file that is not a registered fixture is admitted, stored, versioned, rendered, and started; an unsupported one is rejected before Workflow start with its element identity; exact bytes, digest, profile, and version stay bound; and the engine gate passes with the platform tree absent.

### M2 — the file runs its real shape

**Status: closed.** The resumption-bounded cyclic-control-flow, Message Start Event, Timer Start Event, Terminate End Event, [configured Task extension](capsules/CONFIGURED-GENERIC-TASK-SPEC.md), [exact-version definition scheduling](BPM-PLATFORM-DEFINITION-SCHEDULING-SPEC.md), [published Message Start ingress](BPM-PLATFORM-MESSAGE-INGRESS-SPEC.md), and [Process-instance search](BPM-PLATFORM-PROCESS-INSTANCE-SEARCH-SPEC.md) increments are implemented, closure-reviewed, evidence-closed, and graduated.

**Demo.** A third-party model with a loop and a real start trigger executes, rather than only the acyclic shapes the current admission accepts.

**Engine capsules.** Compositional admission with cycles, replacing the topological-sort acyclicity check in [graph admission](../packages/semantic-core/src/semantic-process-graph-admission.ts); and the four base elements the research marks essential. Message Start, Timer Start, Terminate End, and the versioned configured Task extension are closed. The configured Task reuses the existing neutral effect mechanism while preserving plain Abstract Task's standard immediate-completion meaning as conforming but deferred.

This is the milestone that must be preceded by the decided-fixture cost review recorded below.

**Platform increments.** Definition scheduling for Timer Start, a published message ingress for Message Start, and instance search.

**Exit gate.** A cyclic model reaches a terminal state under each declared target; Terminate End cancels its containing scope and not the root when nested; the four new elements carry registered answer-free scenarios with seeded mutations; and the Lean gate stays inside its memory bound.

### M3 — real work with real data

**Status: in progress.** Implementation and executable evidence are complete; the exact closure reviewer is auditing the bounded correction. The [Boolean Process-data specification](capsules/BOOLEAN-PROCESS-DATA-SPEC.md) and [E2 User Task assignment and form metadata specification](capsules/USER-TASK-ASSIGNMENT-FORM-METADATA-SPEC.md) are implemented, evidence-closed, and graduated. The owner accepted final E2 administrative correction `264add2` without another audit on 2026-08-12. Product 2 human work now includes its independently approved public contract and private engine operations, durable all-producer publication, exact current-task aggregation, fake identity policy, claims, typed detail, retry-safe completion, same-transaction audit outbox, strict HTTP routes, CSS-Modules React inbox, live Temporal evidence, and Chromium acceptance. Context-cold closure target `c72a3bb` required a stale-claim retry correction, stable browser completion retry identity, and additional adversarial evidence. Corrections `5c6cf0a` and `ba9c3d6` close those findings, and graduation is the remaining M3 work after same-reviewer approval.

**Demo.** A person picks a task from an inbox, fills a form whose fields are not all strings, submits, and the process continues on the value they entered.

**Engine capsules.** The value domain, widening variables beyond the current string-and-null contract; and E2, the admission capability and public projection for User Task assignment and form metadata that [the platform proposal](BPM-PLATFORM-PROPOSAL.md#the-engine-boundary) records as its second engine prerequisite.

**Platform increments.** The pluggable identity boundary with a fake default, the shared task inbox, claim and release as platform-owned authorization, form projection, and the audit record of who acted.

The [human-work proposal](BPM-PLATFORM-HUMAN-WORK-PROPOSAL.md) selects one atomic public contract for current cross-instance tasks, private exact observation locators, actor claims, one typed field, retry-safe completion, platform audit, and a CSS-Modules React inbox. Exact redesigned target `7444ce3` received context-cold `APPROVE WITH REQUIRED EDITS`; correction `3b748e2` closed logical audit outcomes, audit-silent policy hiding, the same-transaction Work audit outbox, and configuration/schema ownership and received same-reviewer `APPROVE`.

**Exit gate.** The internal system-visible aggregation matches the engine's published open User Tasks exactly before actor-policy projection; no platform component constructs an occurrence identity; every engine state-changing action is authorized against the exact published occurrence; platform claim and audit state remains distinct from BPMN meaning; and a non-string value survives the round trip through all declared targets.

### M4 — it survives going wrong

**Status: not started.**

**Demo.** A failing Service Task raises an incident an operator can see, retry, and cancel, and a cancelled scope leaves no orphaned work.

**Engine capsules.** Cancellation beyond the current direct-parent regional case, and incidents as a semantic outcome distinct from Temporal transport retries.

**Platform increments.** The operations console, incident handling, retry and cancellation surfaces, and effect diagnostics.

**Exit gate.** An incident is a published semantic fact rather than an inferred one; cancelling an ancestor scope cancels its descendants with counters preserved; and the platform exposes no retry count that is a Temporal attempt.

### M5 — it can be operated and explained

**Status: not started.**

**Demo.** An operator replays what a finished instance did, sees where a running one stands on the diagram, and exports the history.

**Engine capsules.** E1, the publication of committed transition records and of control-token and scope positions. These are two distinct information requirements and must be specified and tested as two even if one publication serves both, because history needs the sequence and the diagram overlay needs the positions.

**Platform increments.** The read-model projection with monotonic revisions, cursoring, ordering, deduplication, gap detection, reconciliation, and rebuild; semantic and operator history; diagram overlays; frequency and duration views; audit export.

**Exit gate.** History is built only from committed publication, never from Event History or state differencing; the projection rebuilds to the same content from scratch; Worker replacement and platform restart do not corrupt it; and a seeded gap is detected rather than silently skipped.

### One Lean research question per engine milestone

The Lean lane must stay a research lane rather than becoming a proof tax on product work. Each engine milestone therefore carries one named question, declared at capsule start under [the assurance-lane rule](PROJECT-DESIGN.md#lean-assurance-lane) as proved, checked, or deliberately open. A question that cannot close within its capsule records its unresolved boundary in [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md); it does not quietly become a weaker claim.

| Milestone | Question | Why it is the risk |
|---|---|---|
| M1 | Non-interference of preserved payload: does admitting material the engine retains but never executes leave the executable subset's semantics unchanged? | Preserve-only admission is the first rule that lets unexecuted content into a checked definition. If preserved material can reach a semantic decision, the whole execute/preserve/reject split is unsound. |
| M2 | Progress and termination under cycles: what replaces acyclicity as the premise the closure, exhaustion, and stable-state laws rest on? | Acyclicity is currently a structural precondition, not a proof convenience. Removing it invalidates the hypotheses of the existing law set rather than merely widening admission. |
| M3 | Value-domain survival: does the current law set hold over a widened value domain, or does each law need an explicit value hypothesis? | The laws were written when every value was a string or null. A widened domain either passes through or exposes laws that were quietly domain-specific. |
| M4 | Ancestor cancellation: does the direct-parent regional cancellation result generalize to an arbitrary ancestor scope with its monotonic counters intact? | The Sub-Process Error capsule proved one level. Generalizing is where a cancellation account usually breaks. |
| M5 | Trace completeness: is the published transition sequence sufficient to reconstruct the state the engine reached, or only to narrate it? | If it is not, every downstream history and mining claim rests on a projection that cannot be checked against the engine. |

### Engine backlog behind the ladder

Ordered by the milestone that first needs it, not by size. Each is absent today and [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md) owns its exact status.

1. [Resumption-bounded compositional admission with cycles](capsules/CYCLIC-CONTROL-FLOW-SPEC.md), closed for M2.
2. [Message Start Event](capsules/MESSAGE-START-EVENT-SPEC.md), closed for M2.
3. [Timer Start Event](capsules/TIMER-START-EVENT-SPEC.md), closed for M2.
4. [Terminate End Event](capsules/TERMINATE-END-EVENT-SPEC.md), closed for M2.
5. [Configured Task extension](capsules/CONFIGURED-GENERIC-TASK-SPEC.md), closed for M2.
6. The value domain beyond string and null — M3.
7. E2: User Task assignment and form metadata as an admission capability and a public projection — M3.
8. Cancellation beyond the direct-parent regional case, and incidents as a semantic outcome — M4.
9. E1: committed transition records, and committed control-token and scope positions — M5.

E1 and E2 are material engine changes and each takes its own governed cycle. The follow-up extensions in [the extensions research](research/HIGH-PRIORITY-BPMN-EXTENSIONS-RESEARCH.md) — multi-instance, Event Sub-Process, and further boundary-event loci — sit behind M5 and are not in this ladder.

### Decided-fixture cost review, completed before compositional admission

**Completed 2026-08-10.** This is a Lean build-cost result only. Lean is assurance tooling and is absent from the engine and platform runtime dependency graphs.

Every kernel-decided fixture re-reduces the dispatcher branches it passes through, so a change that adds a branch to `fireTimer` or a sibling is re-paid by each such fixture, and the cost grows with the fixture count rather than with the change. Compositional admission with cycles touches admission, which nearly every fixture reduces through. [CLAUDE.md](../CLAUDE.md#code-hygiene-and-module-boundaries) already requires measuring resident memory alongside CPU and building one narrow target before a full build; this repository has twice reverted conversions whose builds had to be killed for exhausting host memory.

The measurement used the exact pinned Lean `4.31.0` Linux aarch64 toolchain, `LEAN_NUM_THREADS=1`, one container CPU, no swap, and a hard cgroup memory ceiling. Before the split, isolated `SemanticProcessConformance` compilation completed under a 3.4 GiB ceiling in 23.146 seconds with 21.656 user seconds, 1.090 system seconds, and 3,319,264 KiB maximum resident memory; the same module was killed with exit 137 under a 3 GiB ceiling. The profiler reached 13.08 seconds after the checked-process, program, profile, and definition-binding cluster, versus 21.95 seconds for the complete module. Its largest serial increments were parallel definition binding at 2.50 seconds, parallel program well-formedness at 1.54 seconds, sequential definition binding at 1.46 seconds, and Timer/User Task program well-formedness at 1.24 seconds.

**Decision: M2 lands behind a proof-lane split, without fixture restatement.** The unchanged admission, profile, binding, and lowering theorems now compile in `SemanticProcessAdmissionConformance` independently from runtime closure and evaluator checks. Under the original 3 GiB ceiling, the admission lane completed in 16.557 seconds with 15.261 user seconds, 1.142 system seconds, and 2,682,840 KiB maximum resident memory; the runtime lane completed in 7.316 seconds with 7.067 user seconds, 0.159 system seconds, and 1,921,416 KiB maximum resident memory. The split preserves every proposition and reduces the measured peak by 19.2%. Any later Lean admission widening must build the narrow admission lane under the same ceiling before a complete gate.

### A12 dispositions

A12 Workflows is product 3, owned by A12 under EUPL-1.2 and out of scope in this repository. Four things in this repository still refer to it and each needs an explicit disposition rather than drifting.

| Subject | Disposition |
|---|---|
| [The A12 Workflows compatibility ledger](research/A12-WORKFLOWS-COMPATIBILITY-LEDGER.md) and its 62-physical, 50-distinct model denominator | Retained as research and as the third coverage denominator. It stays a prioritization input and never orders a milestone by itself. |
| The `CreateDocument` and boundary-Error slices, their legacy `2.0.0` profiles, and their exact source readers | The [implemented A12 boundary specification](A12-ADD-ON-BOUNDARY-SPEC.md) keeps production decisions in neutral profiles and a data-only overlay contract while preserving the complete baseline A12-specific dependency closure under the optional adoption root. Closure correction `8d6ea1a` is approved. Do not repeat the shape for further A12 models. |
| The registered A12 checkouts and the `adoption` doctor scope | Retained read-only under the existing licence boundary. Never a build or runtime dependency, and never inferred from the MIT engine's `verify` gate. |
| The approved migration product goal and A12-as-acceptance-lane decisions above | Superseded as a driver of this repository's order. The engine may satisfy them, but the ladder above is ordered by BPMN mechanism leverage and platform milestone, and A12 prevalence only breaks ties between candidates of equal value. |

## Ordered work

Incomplete items only. Each carries a status label that [the plan-shape guard](../scripts/plan-status-consistency.test.ts) reads.

1. **Active: close Product 2 human work.** Obtain the same-reviewer audit of correction target `ba9c3d6`, record the closure receipt, and graduate the approved proposal to its maintained specification.

## Approved decisions

Only decisions that constrain the next work are kept here. A decision fully owned by a graduated specification lives in that specification; Git retains the rest.

**Approved 2026-08-07.**

- **BPM platform proposal as the phase-one platform contract:** [the proposal](BPM-PLATFORM-PROPOSAL.md) is the accepted contract for product 2. Its surfaces, engine boundary, selected stack, exclusions, and open decisions bind until its own reopen conditions are met. Approval settles the product boundary and not the sequencing, which [the ladder](#showcase-milestone-ladder) owns.
- **The competitive scope research stays research until the approved proposal is implemented:** [the competitive platform-scope research](research/BPM-PLATFORM-COMPETITIVE-SCOPE-RESEARCH.md) is not graduated, and neither its assurance-first positioning statement nor its eight full-scope modules enter [PROJECT-DESIGN.md](PROJECT-DESIGN.md), the approved proposal, or this plan before then. The reason is to finish the first product rather than widen it while building it. The reopen trigger is M5 closing its exit gate, at which point the whole document is reconsidered and anything adopted moves into its owner. Until then it may be cited as design input and may not be cited as an obligation.
- **Lean assurance-lane shapes, superseding part of the targeted preservation gate:** each capsule declares its Lean lane at capsule start as proved, checked, or **deliberately open**, under [the assurance-lane rule](PROJECT-DESIGN.md#lean-assurance-lane). The first two shapes are the choice decision 1 of 2026-07-30 already permits. **The third is new and widens a proof boundary**, because that gate requires every capsule in its scope to close the smallest reusable theorem *or* executable guard, and a deliberately open lane closes neither. It is retained because some obligations are genuinely unaffordable within a capsule and a recorded gap is better than an unrecorded one; a deliberately open lane must name its reason and reopen trigger in [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md). This supersession makes the assurance-lane rule a material change, owned by the platform proposal's review cycle as [that receipt](BPM-PLATFORM-PROPOSAL.md#independent-cold-review-receipt) records. It does not weaken decision 1 in any other respect.

**Approved 2026-08-10.**

- **Temporal adapter subsystem package boundary:** keep Temporal explicit as product-1 infrastructure, but replace the broad `@bpmn-lean/temporal-adapter` package with the separate protocol, client, Workflow, Worker, runner, and testkit packages owned by [ARCHITECTURE.md](ARCHITECTURE.md#temporal-adapter-subsystem). Product 2 reaches the concrete `@bpmn-lean/temporal-client` only through its engine gateway. There is no generic `ProcessStarter` portability interface and no production umbrella package. The owner approved the resulting `@temporalio/client@1.21.0` reachability.

**Approved 2026-07-30, and still binding on admission work.** These four are the ones M1 and M2 run into directly.

1. **Targeted preservation gate:** every capsule that widens admission or replaces lowering, runtime representation, or public observation must state the exact source-to-result claim at risk, retain a separating discriminator, and close the smallest reusable theorem or executable guard protecting that claim. It must additionally establish that every newly reachable internal closure stays within `semanticProcessClosureLimit`; that every newly reachable multiple-enabled state is an approved order-invariant pair, carries an explicit semantic choice, or is rejected consistently by Lean and the core; and that every newly reachable stable `running` state is terminally complete or exposes an explicit resumption surface. Tokens alone do not establish progress. A general preservation theorem becomes mandatory only when a second capsule needs the same proposition.
2. **Compositional admission successor:** exact whole-program execution-surface predicates are provisional. The successor is profile-parameterized structural admission, where one reusable validator owns topology-independent reference, producer/consumer, reachability, co-reachability, acyclicity, closure, and stable-state obligations while a selected profile supplies typed mechanism and cardinality capabilities. Do not add another whole-topology disjunct.
3. **Host capability is not semantic admission:** every capsule making a new wait-set combination reachable must define the adapter capability predicate separately from semantic well-formedness and check it before Workflow start. Violation must be a deterministic pre-start admission result, never a Workflow crash.
4. **Canonical wait-order reopen trigger:** the rule reopens if a later admission makes mixed or repeated same-kind waits reachable or changes the wait-kind domain. It has already fired once, for the Intermediate Catch Message capsule; all four projectors now order by semantic kind rank and then element ID.

**Approved 2026-07-26, retained for their reopen triggers.**

- **C2 freeze:** keep the five-operation checked-source relation experiment compiling without extending its source semantics. **Reopen before admission widens beyond the two fixture-pinned topologies**, after another fixture-coincidental lowering defect surfaces, or when a capsule independently needs source-level semantics. M1 fires the first trigger, so the reopen decision is due with the preserve-only admission proposal. [The experiment record](experiments/CHECKED-SOURCE-RELATION-EXPERIMENT.md) owns the not-adopted result and its precise unresolved boundary.
- **Semantic-core runtime language:** one TypeScript semantic core hosted by the TypeScript Temporal Workflow. A JVM Worker or client facade is not a semantic-core consumer. Reopen only for a named non-Temporal embedded JVM product mode that must own semantic Process state in-process.

**Approved 2026-08-03, governing review and feedback cost.**

- **No governed cycle for non-material work:** an increment changing none of the governed claims opens no proposal, checkpoint, or closure review and is governed by the executable guards plus the applicable complete gate. [TESTING-SPEC.md](TESTING-SPEC.md#independent-cold-review-gate) owns the negative case.
- **Recurring drift becomes a guard, not a review finding.**
- **Two-tier warm-pipeline feedback measure:** 15000ms is a reported soft target and 40000ms the hard ceiling. Regression detection lives in the reported `phaseMs.warmTotal` figure compared against the last uncontended measurement; "the gate passed" is not evidence about speed.
- **Two-tier CIB Maven deadline:** one 120000ms ceiling from a single owner, with a 30000ms workstation soft target reported after success.

## Last verified baseline

**Latest complete gate: 2026-08-12, exit 0 at Boolean closure target `9669e8c`.** All registered cases reached agreement across their declared targets, every seeded semantic mutation produced its required disagreement, and all 46 live histories passed. The run took 189.26 seconds and has output SHA-256 `e6f47bb9d009bf9b4d47fe16c74c7b057d6e8ba5240945f0ba62e4564181d812`. The independently reviewed closure corrections after that target changed only focused evidence and documentation owners and passed their proportionate gates. This is a correctness result, not a new performance baseline.

**Two performance baselines are retained, because a catalog change breaks comparability and one figure cannot span it.**

| Catalog | Commit | Warm total | Conditions |
|---|---|---:|---|
| 30 cases | `13cdec8` | 15986.670ms | uncontended, owner-confirmed idle host |
| 28 cases | `ac2813c` | 13476ms | uncontended, fastest 28-case measurement |

No uncontended measurement exists at 32, 34, or 35 cases. Until one does, judge a new figure against the per-case trend across these two rather than against either alone, and record any contended run as correctness evidence rather than moving a baseline. Two independent 34-case runs on 2026-08-07 measured 20406.710ms and 20036ms, within 2% of each other, which is weak evidence that this catalog genuinely costs about twenty seconds rather than that both runs were contended; treat a figure near twenty seconds as unexplained rather than as a regression until an idle-host run settles it.

**The Lean build's memory bound is a standing constraint, not a run record.** [CLAUDE.md](../CLAUDE.md#verification) owns the thread pin, its measured peaks, and the reason the default is the most conservative value; [the Lean wrapper](../scripts/lake.sh) owns the single call site and [an executable check](../scripts/verification-entrypoint.test.ts) dynamically rejects a bare `lake` subcommand in tracked or pending command surfaces.

## BPMN coverage program

BPMN Process Execution coverage is the primary engine roadmap. Group requirements by reusable mechanism rather than by XML element: Process lifecycle and graph flow; Activity lifecycle; branching and merging; scopes and interruption; event subscription and consumption; variables, data, and mapping; looping and multi-instance; compensation; import and reference closure. [The requirement ledger](BPMN-REQUIREMENT-LEDGER.md) owns dispositions and [the breadth research](research/CIB-SEVEN-BPMN-BREADTH-RESEARCH.md) owns the measured selection between equal-value candidates. [The ladder](#showcase-milestone-ladder) breaks the remaining ties.

### CIB on-demand gate

For every BPMN work unit, answer these questions before adding CIB-specific implementation:

1. Does BPMN leave a material choice that this profile must resolve?
2. Does admitted source require a `camunda:*` extension?
3. Does the compatibility claim require a pinned engine observation not already covered?
4. Can CIB configuration or host behavior change the canonical or adoption-visible result?
5. Does a concrete downstream blocker remain after the standard mechanism is implemented?

If all answers are no, no new CIB profile surface is added. If any answer is yes, add the smallest relationship-register entry, profile delta, probe, fidelity label, and mutation that establishes that fact. Do not make every standard capsule pay for a new CIB extension lane.

### Vertical-slice limit

One first-round vertical witness is appropriate for a genuinely new host seam such as durable timers, external effects, or typed business faults. Once the seam exists, later models and source variants should reuse it through generic admission, profile configuration, and downstream regression tests. Do not add model-specific IL operations, Lean evaluators, semantic-core branches, or Temporal Workflows for each A12 model.

## Explicitly deferred

- assignment, users/groups, authorization, rendered forms, task-list UI, and BPMN data associations; the engine runner provides only configured host simulations and the implemented selected Process-variable completion patch;
- global task discovery or Search Attributes;
- timer forms or races beyond the exact Intermediate Catch Timer capsule, Activities and retries beyond the bounded Service Task specification, host/general cancellation, incidents, compensation, and Event Sub-Processes; Message payload, key-based/global correlation, modeled throw, Message Flow, and other Message Event loci remain unimplemented beyond the direct payload-free catch;
- multi-instance, loops, migration, and Continue-As-New;
- a universal BPMN IL, general BPMN compiler, or general semantic assertion language;
- any expansion of the exact Simple Boolean v1 grammar or use outside its Exclusive Gateway capsule; JUEL, capability-bearing expressions, variable mutation, XPath, DMN/FEEL, Groovy, FreeMarker, and JavaScript remain separate profile/runtime decisions;
- a separate CIB parallel-compatibility profile until it has a concrete consumer;
- a classified four-quadrant project-admission × CIB-deployment lane over the pinned MIWG corpus; schedule it with or after the admission-successor checkpoint, report all four quadrants without asserting set equality, and do not count it as execution evidence;
- a runtime uniqueness invariant over the wait collections, which the [interrupting Activity boundary Timer capsule](capsules/ACTIVITY-BOUNDARY-TIMER-SPEC.md) carries as two explicit hypotheses and needs for its quantified stale-identity law. Its shape is settled, not open: `eventRaceAssociationsValid` and `calledProcessAssociationsValid` already assert cardinality-one over the collections they own, guard their operations, and appear as law hypotheses. Both are also conjuncts of `stableStateResumable`, so a third conjunct must land with any replacement of that predicate rather than before it, and the reopen trigger is whichever comes first;
- immutable profile or production Event History compatibility;
- public BPMN conformance or broad CIB compatibility claims.

## Stop conditions

Stop for owner direction if:

- a new normative or pinned-CIB observation reopens the approved semantic account;
- the profile feature or observation boundary would expand beyond the approved capsule;
- a dependency addition, removal, replacement, or upgrade is required;
- the Simple Boolean language would expand beyond its exact URI, grammar, total result, Process-scope string/null context, or read-only capability boundary, or any Workflow code, Lean, or TypeScript core path would parse or evaluate JUEL;
- lowering performs runtime scheduling, activation, completion, propagation, or other semantic work that the IL claims to own;
- an IL operation merely selects a retained topology-specific evaluator;
- a new operation mirrors a BPMN surface class without a reusable semantic mechanism and separating witness;
- required neutral semantic distinctions are erased before Lean can check lowering, or a source/profile translation is claimed as Lean-independent evidence when Lean receives only its normalized result;
- structural invalidity would become an ordinary semantic outcome;
- a second production semantic core or Workflow language is introduced without the exact reopen trigger and fresh owner approval recorded in [PROJECT-DESIGN.md](PROJECT-DESIGN.md#cib-compatibility-and-polyglot-effect-execution);
- the preservation obligation cannot be stated without assuming the desired result;
- a Temporal preflight cannot map a required public semantic outcome without adding host-defined semantics;
- source and executable CIB revisions diverge;
- the feedback budget cannot be met without weakening independence or evidence.

## Exact resume point

**Next action: obtain the same-reviewer M3 human-work correction audit.** Context-cold target `c72a3bb` received `APPROVE WITH REQUIRED EDITS`; corrections `5c6cf0a` and `ba9c3d6` close the three findings. Record the receipt and graduate the maintained specification if the exact reviewer approves the correction target.

**No technical or environmental blocker remains.** E2 is graduated and Product 2 implementation is authorized. The earlier approval of concrete `@temporalio/client@1.21.0` Product 2 reachability and the no-umbrella Temporal subsystem package layout remains binding.

**Last verified commands:** `./scripts/doctor.sh verify`, `./scripts/verify.sh`, `./scripts/pnpm.sh run test:platform-work-checkpoint`, and `./scripts/pnpm.sh run test:showcase:m3-human-work` are green through correction target `ba9c3d6`; the latter two required local loopback execution. Focused Work, audit, public-contract, engine-operation, HTTP, UI, production-server, Product 2 boundary, source-hygiene, and infrastructure gates remain green.

**Standing constraints for the next family.** Every registered scenario must run through Temporal, because `PipelineCase.temporalRelation` is non-nullable while `cib` is nullable, so a schedule no Temporal target can execute cannot be registered. A profile artifact, its scenarios, and its live example are one atomic change across three guards. Package tests execute `dist/`, so build before believing a result, and plain `lake build` does not build the `Experiments` tree that `./scripts/verify.sh` also builds. Invoke `./scripts/verify.sh` bare, because a trailing `; echo` replaces its exit status and has already reported a failing run as green. Registering a schedule proves a family is hosted but not that its host is *used*: a boundary-deadline family is separated from the generic durable-timer fallback only by a shared activation carrying both callbacks, so each such family needs a direct-VM witness checked by mutating `ownsDeadline`.

**The compositional-admission experiment remains accepted and frozen**; do not begin another stage without a documented reopen trigger and owner approval.
