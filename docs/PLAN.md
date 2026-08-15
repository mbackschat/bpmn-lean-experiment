# Plan

This document owns the current checkpoint, ordered next work, unresolved decisions, and exact resume point. It is not a feature-history board: durable product and semantic boundaries belong in [PROJECT-DESIGN.md](PROJECT-DESIGN.md), concrete repository and deployment architecture in [ARCHITECTURE.md](ARCHITECTURE.md), exact supported and absent surfaces in [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md), test procedure in [TESTING-SPEC.md](TESTING-SPEC.md), semantic meaning in the owning [capsule](capsules/README.md), commit-bounded cost in [CAPSULE-COST-LEDGER.md](CAPSULE-COST-LEDGER.md), and process findings in [PROCESS-ASSESSMENT-LEDGER.md](PROCESS-ASSESSMENT-LEDGER.md). A completed item is deleted from here once its content has an owner; Git retains the history. [The plan-shape guard](../scripts/plan-status-consistency.test.ts) enforces that.

## Current checkpoint

The engine and BPM platform remain separate MIT products under [PROJECT-DESIGN.md](PROJECT-DESIGN.md#product-division) and the package boundaries in [ARCHITECTURE.md](ARCHITECTURE.md). M0 through M4 and the M5 committed-execution publication increment are closed. [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md) owns the exact implemented and absent surfaces; the graduated [capsule specifications](capsules/README.md) own semantic meaning and evidence.

The M5 flow-node occurrence metrics increment is implemented, closure-reviewed, evidence-closed, and graduated. Its Product 1 publication, Product 2 projection and aggregation, and local 1280/1600 functional UI lane are green. The curated executable BPMN model corpus now contains 23 retained business-purpose-shaped project models that cover all 25 executable BPMN element or semantic variants registered by the production pipeline, plus seven external candidates across six deduplicated CIB Seven, OMG, and Betsy families. Two models are catalog-ready through production-preview Chromium journeys: the sequential User Task assignment/form model and the closure-reviewed parallel content-and-risk review. Product 2 also exposes the exact package version, restrictions, and separately classified CIB evidence through the About capability table.

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

**Status: closed.** The [Boolean Process-data specification](capsules/BOOLEAN-PROCESS-DATA-SPEC.md), [E2 User Task assignment and form metadata specification](capsules/USER-TASK-ASSIGNMENT-FORM-METADATA-SPEC.md), and [Product 2 human-work specification](BPM-PLATFORM-HUMAN-WORK-SPEC.md) are implemented, closure-reviewed, evidence-closed, and graduated. Product 2 human work includes independently reviewed public contracts and private engine operations, durable all-producer publication, exact current-task aggregation, fake identity policy, claims, typed detail, retry-safe completion, same-transaction audit outbox, strict HTTP routes, a CSS-Modules React inbox, live Temporal evidence, and Chromium acceptance. Closure target `c72a3bb` and final correction audit `23892a5` close the governed M3 work.

**Demo.** A person picks a task from an inbox, fills a form whose fields are not all strings, submits, and the process continues on the value they entered.

**Engine capsules.** The value domain, widening variables beyond the current string-and-null contract; and E2, the admission capability and public projection for User Task assignment and form metadata that [the platform proposal](BPM-PLATFORM-PROPOSAL.md#the-engine-boundary) records as its second engine prerequisite.

**Platform increments.** The pluggable identity boundary with a fake default, the shared task inbox, claim and release as platform-owned authorization, form projection, and the audit record of who acted.

The [human-work specification](BPM-PLATFORM-HUMAN-WORK-SPEC.md) owns one atomic public contract for current cross-instance tasks, private exact observation locators, actor claims, one typed field, retry-safe completion, platform audit, and a CSS-Modules React inbox.

**Exit gate.** The internal system-visible aggregation matches the engine's published open User Tasks exactly before actor-policy projection; no platform component constructs an occurrence identity; every engine state-changing action is authorized against the exact published occurrence; platform claim and audit state remains distinct from BPMN meaning; and a non-string value survives the round trip through all declared targets.

### M4 — it survives going wrong

**Status: closed.** [Stage 1](capsules/SERVICE-TASK-INCIDENT-RETRY-SPEC.md), one bounded Service Task incident and exact retry, [Stage 2](capsules/SERVICE-TASK-INCIDENT-CANCELLATION-SPEC.md), exact incident-scoped hosting-root Process cancellation, and [Stage 3](BPM-PLATFORM-INCIDENT-OPERATIONS-SPEC.md), current Product 2 incident operations, are implemented, closure-reviewed, evidence-closed, and graduated.

**Demo.** A failing Service Task raises an incident an operator can see, retry, and cancel, and a cancelled scope leaves no orphaned work.

**Engine capsules.** Cancellation beyond the current direct-parent regional case, and incidents as a semantic outcome distinct from Temporal transport retries.

**Platform increments.** The operations console, incident handling, retry and cancellation surfaces, and effect diagnostics.

**Exit gate.** An incident is a published semantic fact rather than an inferred one; cancelling an ancestor scope cancels its descendants with counters preserved; and the platform exposes no retry count that is a Temporal attempt.

### M5 — it can be operated and explained

**Status: in progress.** The independently closure-reviewed [committed execution publication specification](capsules/COMMITTED-EXECUTION-PUBLICATION-SPEC.md) implements exact evaluator-root traces, independent current positions, strict wire and canonical bytes, an atomic Workflow publication Query, a representation-free client and gateway, an opaque-locator engine API, live retention and replay evidence, fail-closed transactional Product 2 projection, and two-width desktop History, Diagram, and canonical export evidence. The closure-reviewed [flow-node occurrence metrics specification](capsules/FLOW-NODE-OCCURRENCE-METRICS-SPEC.md) adds exact occurrence frequency and completed duration over a complete exact-version population. The owner-approved [operator-history and audit-export proposal](BPM-PLATFORM-OPERATOR-HISTORY-AUDIT-EXPORT-PROPOSAL.md) is implemented end to end with focused and complete Product 2 evidence; its required context-cold closure review and graduation remain before M5 closes.

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

## Ordered work

Incomplete items only. Each carries a status label that [the plan-shape guard](../scripts/plan-status-consistency.test.ts) reads.

1. **In progress: close M5 operator history and audit export.** The bounded Operations-authorized, per-Process-instance view and canonical download over the existing Work action and incident-action audit streams are implemented with separate source-local ordering and completeness boundaries, strict public bytes, private-fact exclusion, restart convergence, independent failure handling, and complete Product 2 evidence. Commit the immutable implementation target, obtain the required context-cold closure review, apply any required corrections through the same reviewer, then graduate the approved proposal and close M5.

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

**Latest complete gate: 2026-08-14, exit 0 for the three-level verification policy and desktop functional-browser simplification.** The complete local macOS `./scripts/verify.sh` run includes Lean, semantic core, source-compiled Lean/TypeScript publication parity, protocol/schema/canonical bytes, Workflow Query, client/API, both CIB releases, differential comparison, 207 Temporal adapter tests, 52 retained history replays, and the complete four-target pipeline. The pipeline reported 27289.563ms against the 15000ms soft feedback target; this is correctness evidence and does not replace an uncontended performance baseline. The path-scoped Product 2 browser evidence is now the locally reproducible 1280/1600 functional matrix, while one wide Diagram screenshot remains manual and non-blocking.

**Two performance baselines are retained, because a catalog change breaks comparability and one figure cannot span it.**

| Catalog | Commit | Warm total | Conditions |
|---|---|---:|---|
| 30 cases | `13cdec8` | 15986.670ms | uncontended, owner-confirmed idle host |
| 28 cases | `ac2813c` | 13476ms | uncontended, fastest 28-case measurement |

No uncontended measurement exists at 32, 34, or 35 cases. Until one does, judge a new figure against the per-case trend across these two rather than against either alone, and record any contended run as correctness evidence rather than moving a baseline. Two independent 34-case runs on 2026-08-07 measured 20406.710ms and 20036ms, within 2% of each other, which is weak evidence that this catalog genuinely costs about twenty seconds rather than that both runs were contended; treat a figure near twenty seconds as unexplained rather than as a regression until an idle-host run settles it.

**The Lean build's memory bound is a standing constraint, not a run record.** [CLAUDE.md](../CLAUDE.md#verification) owns the fixed one-thread pin, root-integrator-only execution rule, and reason the value is conservative; [the Lean wrapper](../scripts/lake.sh) replaces inherited overrides, holds the fail-closed host lock, and rejects explicit umbrella contamination of a focused target set. [The executable check](../scripts/verification-entrypoint.test.ts) exercises those three runtime separators against a fake Lake executable and dynamically rejects a bare `lake` subcommand in tracked or pending command surfaces.

## BPMN coverage program

BPMN Process Execution coverage is the primary engine roadmap. Group requirements by reusable mechanism rather than by XML element: Process lifecycle and graph flow; Activity lifecycle; branching and merging; scopes and interruption; event subscription and consumption; variables, data, and mapping; looping and multi-instance; compensation; import and reference closure. [The requirement ledger](BPMN-REQUIREMENT-LEDGER.md) owns dispositions. The [CIB breadth research](research/CIB-SEVEN-BPMN-BREADTH-RESEARCH.md) measures mature engine-test breadth, while the scheduled curated executable corpus measures independent whole-model families that this project can or cannot actually run. Neither raw XML-tag counts nor cloned model counts select work by themselves. [The ladder](#showcase-milestone-ladder) breaks the remaining ties.

### Executable model corpus decision gate

The curated corpus is a maintained product and engine acceptance input, not a fourth conformance denominator. Its manifest must distinguish exact source admission, semantic execution, durable Temporal execution, selected CIB comparison, and Product 2 usability. A model may succeed in one lane and fail in another without that distinction being collapsed. In particular, an engine-runnable User Task model without public assignment metadata is not operator-workspace-ready, and a viewer-renderable model is not necessarily startable.

Corpus prevalence is counted by independently reviewed clone family and reusable BPMN mechanism, not by physical file or XML element occurrence alone. The roadmap report must publish the number of independent model families blocked by a mechanism and a separate semantic-risk assessment naming the realistic representation, concurrency, ordering, cancellation, scope, liveness, identity, data, or Temporal-refinement failure it could expose, together with normative dependencies, implementation cost, Temporal feasibility, and standards value. Model-family reach and semantic risk are co-equal inputs after normative dependencies and must not be collapsed into one score. The next semantic capsule is selected from that evidence under the durable ordering rule in [PROJECT-DESIGN.md](PROJECT-DESIGN.md#cib-seven-220-breadth-ordering); a frequent construct does not bypass its prerequisites or approval lifecycle, and a rare high-risk family is not deferred merely because the first corpus contains few examples of it.

The standing high-risk semantic families are Activity lifecycle and implicit merge/split behavior; inclusive and complex synchronization; repeated scopes, interruption, and cancellation; event subscription lifetime, correlation, races, and Event Sub-Processes; loops, multi-instance, fairness, divergence, and stable-state progress; data availability, mapping, mutation, expressions, and external language execution; compensation ordering and snapshot state; repeated runtime occurrences and complete command identity; and Temporal delivery, retry, replay, and cancellation refinements that could erase a public BPMN outcome. This list is a risk lens rather than an implementation queue. Each next-family decision compares it with the current corpus and CIB breadth evidence.

The first corpus increment closes only when all of the following are executable locally:

1. provenance and licence policy prevents external copyrighted or reciprocal material from entering the MIT retained-model tree while still permitting exact hash-bound external research;
2. duplicate and near-duplicate examples cannot inflate the model-family or mechanism ranking;
3. every retained model is schema-valid, parser-admitted, profile-bound, and exercised to a declared terminal state or explicit public resumption point through the semantic core and production Temporal path;
4. every catalog-visible model passes a production-backed headless-Chromium user journey through deploy or selection, start, each required Work or Operations action, terminal or explicit resumption status, and applicable public history or audit, with each mutation's false precondition separately locked and strict public-contract failures treated as corpus failures rather than hidden fixture gaps;
5. unsupported candidates remain useful as classified blockers with exact first unsupported mechanisms, never as falsely offered examples;
6. a generated roadmap report ranks unimplemented reusable mechanisms by clone-family reach, while the owning research records the co-equal semantic-risk assessment before selection, without changing the BPMN, CIB, and platform coverage denominators.
7. every newly registered executable element or semantic variant atomically adds or expands a credible project-owned retained model, records a concrete business purpose, updates the canonical restriction/CIB-evidence row consumed by Product 2 About, and keeps the derived support, catalog, and retained-model coverage sets equal.

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

- production identity-provider integration, arbitrary rendered forms, BPMN data associations, and assignment expressions beyond the implemented metadata and fake-identity boundary;
- engine-global task discovery through Search Attributes; Product 2 instead owns its current-task projection from published engine facts;
- timer forms or races beyond the implemented timer and boundary-event capsules, compensation, and Event Sub-Processes; Message payload, key-based/global correlation, modeled throw, Message Flow, and other Message Event loci remain unimplemented beyond the direct payload-free catch;
- multi-instance, migration, and Continue-As-New;
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

**Next action: complete ordered-work item 1 by committing the implemented M5 operator-history and audit-export target and obtaining its required context-cold closure review.** After any required correction audit, graduate the approved proposal and close M5. The next semantic-family decision remains after M5: classify Script Task execution against BPMN, CIB, deterministic sandboxing, data, security, and Temporal requirements before deciding whether its two-family prevalence justifies a proposal.

Item 1 is **blocked on nothing**. The exact manifest, 23 retained models covering all 25 registered executable variants, seven external candidates across six clone families, provenance and catalog guards, Product 2 About disclosure, and two production browser journeys are closure-reviewed and complete. Product 2 readiness is two; 21 retained models remain excluded from its catalog.

**Latest evidence:** The parallel composition closure target `619f7d9` received a context-cold closure review; correction `8888530` closed its empty-Start and fresh-command stale-refusal findings, and the same reviewer approved the correction. The complete repository gate is green at `a15aebc`, including the serialized Lean lane, both pinned CIB releases, live Temporal, the 49-case differential pipeline, corpus guards, and documentation consistency.

**Standing constraints for the next family.** Every registered scenario must run through Temporal, because `PipelineCase.temporalRelation` is non-nullable while `cib` is nullable, so a schedule no Temporal target can execute cannot be registered. A profile artifact, its scenarios, and its live example are one atomic change across three guards. Package tests execute `dist/`, so build before believing a result. Only the root integrator runs Lean, always through `./scripts/lake.sh`, one command at a time; the full `./scripts/lake.sh build` still does not build the `Experiments` tree that `./scripts/verify.sh` also builds. Invoke `./scripts/verify.sh` bare, because a trailing `; echo` replaces its exit status and has already reported a failing run as green. Registering a schedule proves a family is hosted but not that its host is *used*: a boundary-deadline family is separated from the generic durable-timer fallback only by a shared activation carrying both callbacks, so each such family needs a direct-VM witness checked by mutating `ownsDeadline`.

**The compositional-admission experiment remains accepted and frozen**; do not begin another stage without a documented reopen trigger and owner approval.
