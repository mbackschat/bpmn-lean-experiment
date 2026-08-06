# Implementation map

This document is the sole detailed owner of current implementation, proof, evidence, and absence status. It describes the repository now, not milestone history.

## Current claim

The repository has an evidence-closed **draft** semantic capsule and a runnable pre-release product command for one private executable `None Start Event → User Task → None End Event` Process. Exact start installs canonical string/null Process variables before the first wait under selected CIB extension `CIB-EXT-0006`; exact completion atomically merges a second canonical patch under `CIB-EXT-0005`. Start visibility, exact completion, and wrong activation agree across pinned CIB Seven, the Lean reference interpreter, the independent TypeScript semantic core, and the Temporal adapter. For sequential stale completion, CIB Seven, Lean, and the core agree on semantic rejection and preservation of the committed start/completion data; Temporal agrees exactly through completion and separately returns adapter-owned `processClosed` under the explicit post-terminal schedule. The MVP command strictly reads one local config, compiles before connecting, runs the same generic Workflow against a caller-owned Temporal service, exposes the stable state/interaction/delay/result records, and rejects the maintained unsupported model without opening a connection. Its product surface now spans every registered profile under the [runnable Temporal MVP specification](RUNNABLE-TEMPORAL-MVP-SPEC.md): one driver answers the published `enabledInteractions` set, taking occurrence identity from that publication and refusing an ambiguous, unanswered, or uncommitted interaction; the production Worker registers the effect Activity backed by deterministic configured handlers; and eighteen non-rejection example configurations, covering every one of the seventeen registered profiles, are executable-checked to load, compile, and pass both pre-start gates.

Product evidence separates two claims. Admission and configuration are checked for all seventeen profiles without a Temporal service: each example loads under strict validation, compiles from exact source, satisfies host capability and semantic start admission, and declares a handler for every effect its program awaits. Live durable execution through the real command is checked for one example per distinct host interaction mechanism — completion Update, two concurrent tasks answered in declared plan order, a host-resolved durable timer with zero interactions, Message delivery through the published subscription identity, and the product effect Activity's declared success and `bpmnError` arms. Live execution of ten of the remaining eleven profiles is **absent by design**: each reuses a mechanism already evidenced above, and the project's vertical-slice limit prefers reuse over repeating a full-stack run per model. The interrupting Activity boundary Timer profile has two examples, one per route: the Activity victory answers the bounded task and its normal follow-on, while the deadline victory answers only the boundary follow-on and so declines to complete the bounded Activity at all. Its Workflow now arms the deadline durably through its own barrier-backed scheduler and refuses only a completion and deadline sharing one Workflow activation, under `BpmnBoundedActivitySchedulerUnavailable`. No product lane claims BPMN conformance, and none is an independent semantic evidence lane, because the product path composes the already-evidenced compiler, core, Workflow, and client. Both boundary examples are checked for admission and configuration; neither is a live durable product run, so the deadline victory's execution evidence remains the differential, Worker-replacement, and direct-VM lanes rather than the product command.

Every multi-target agreement claim in this document carries one shared-origin qualifier: the TypeScript compiler in `@bpmn-lean/bpmn-source` is the sole producer of the checked BPMN graph and Semantic Process program that Lean, the TypeScript core, and the Temporal adapter all consume. Lean independently recomputes graph-to-program lowering and rejects inequality before evaluation; it has no BPMN XML parser, so a defect in XML-to-checked-graph translation propagates identically into those three targets. Pinned CIB Seven can separate that defect only for a declared CIB profile whose exact source it executes; the standards-only Simple Boolean profile has no such source-level oracle and states that limitation explicitly. The [parallel capsule's common-mode risks](capsules/PARALLEL-FORK-JOIN-SPEC.md#assurance-boundary), the [Exclusive Gateway assurance boundary](capsules/EXCLUSIVE-GATEWAY-CONDITION-SPEC.md#assurance-boundary), and [TESTING-SPEC's evidence lanes](TESTING-SPEC.md#evidence-lanes) own the correlation rule.

The parallel fork/join contract is evidence-closed as a draft under normative per-incoming-Sequence-Flow behavior. The bounded [Semantic Process IL spec](SEMANTIC-PROCESS-IL-SPEC.md), asymmetric runtime representations, and decision not to claim broad CIB parallel compatibility own the maintained definition boundary. Current schemas freeze the checked graph and Semantic Process wire shapes, and adversarial contract tests cover reference, arity, scope ownership, identity, canonical-order, candidate-order, and raw-to-canonical projection failures. The bounded source path now also admits one ordinary embedded Sub-Process scope while retaining generic profile-parameterized graph admission rather than a whole-topology disjunct.

Lean and TypeScript independently validate the definition-scope tree and ownership maps, replace `terminate` with `reachNoneEnd` plus quiescent `completeScope`, and execute scope-owned tokens and waits. Lean proves executable-operation soundness and generic nonquiescent-completion refusal; the scope capsule adds both completion orders, sibling-survival, outer-continuation, and stranded-child laws. Temporal hosts the child scope inside the same Workflow through passive Updates, survives Worker replacement, replays, and detects an early-exit bypass without a Child Workflow or cancellation event. CIB Seven supplies four content-bound `CIB-AGR-0007` schedules. The guarded pipeline derives its complete case set and target relations from the artifact catalogs.

The [Intermediate Catch Timer contract](capsules/INTERMEDIATE-CATCH-TIMER-SPEC.md) is evidence-closed as a draft. The exact literal remains in the checked graph and independently lowers to `awaitTimer` duration 1000; Lean and TypeScript own full timer occurrence identity, exact-deadline eligibility, logical-time advancement, refusal, and `openTimers` observation. The scenario's answer-free `fireTimer` is applied directly by Lean and the core, realized by controlled-clock CIB scheduling, and never delivered to Temporal; the Workflow derives the identical content-bound stimulus exclusively from committed core state after one durable timer. Full-server evidence covers Worker absence at due time, exact history, receipt reconciliation, replay, and a separately bundled sleep-bypass mutation. Time skipping is a separately named optional calibration lane.

The [Intermediate Catch Message contract](capsules/INTERMEDIATE-CATCH-MESSAGE-SPEC.md) is evidence-closed as a draft. Exact BPMN source admission resolves one MessageEventDefinition through one Interface Operation to the same payload-free input Message and lowers it to `awaitMessage` with Catch Event identity plus the complete channel. Lean and TypeScript own subscription activation, exact identity/channel consumption, pre-activation/wrong/stale refusal, one-consumption behavior, `openMessageSubscriptions`, the delivery interaction, and four-kind element-sorted wait projection. Both Message/User Task orders pass generic graph/profile admission and the targeted closure/resumability gate. Temporal realizes delivery through a Signal plus durable result Query/receipt ledger, distinguishes malformed input, command-identity conflict, and semantic refusal, survives Worker absence, requires exact Signal history, and replays both orders. CIB is absent from the Message target set and every retained CIB projection carries an executable-guarded empty Message collection.

The [Message-addressed Receive Task specification](capsules/RECEIVE-TASK-MESSAGE-SPEC.md) is implemented and evidence-closed. `MessageChannel` is one closed `operationMessage | directMessage` union across TypeScript, Lean, all three current wire schemas, Java, artifacts, and Temporal command identity. Exact Receive Task source admission requires one direct root Message and a source-only nonempty Message name, lowers to the reused `awaitMessage`, and rejects operation-addressed and unsupported Activity shapes. Lean and the TypeScript core independently establish the exact direct wait, delivery, refusal, projection, and two-step post-delivery closure. The profile/scenario/result roundtrip and content-bound CIB `2.2.0` evidence establish `CIB-AGR-0009` plus operational mapping `CIB-OP-0005`; raw subscription removal and changed Message ID are mutation-guarded, while raw event-name fidelity belongs to the live probe and gateway/model cross-check. The complete differential establishes four-target agreement and detects a complete opposite-arm substitution. The focused Temporal witnesses pin the direct Query, malformed and live wrong-kind refusal, Signal acceptance during Worker absence, replacement recovery, one committed receipt result, empty terminal state, zero unrelated host mechanisms, mutation-sensitive Signal history, direct-channel erasure, and replay. Checkpoint `7226733` passed correction audit at `5a74bad`; external closure target `3881a7a` passed correction audit at `f5f9caf`.

The [ordinary embedded Sub-Process completion contract](capsules/EMBEDDED-SUBPROCESS-COMPLETION-SPEC.md) is evidence-closed as a draft. Source admission flattens one non-event child scope into checked definition ownership, rejects cross-scope Flow and Event Sub-Process shapes, and lowers the child Start to an entry place rather than a second initiation. Both pure implementations preserve the independent child wait set, refuse premature child completion, complete only after exact owned quiescence, emit one outer continuation, and complete the root separately. Four answer-free schedules cover both child orders and stale completion before and after scope exit. Pinned CIB `2.2.0`, Lean, the core, and Temporal agree at the public boundary under `CIB-AGR-0007`.

The [embedded Sub-Process Error-propagation contract](capsules/SUBPROCESS-ERROR-PROPAGATION-SPEC.md) is evidence-closed as a draft. Checked source retains explicit Error End and boundary Error nodes, exact Error identity, direct attachment, and a parent-local exceptional graph edge; lowering resolves one exact handler into `throwError`. Lean and TypeScript atomically cancel the child occurrence subtree, preserve root-owned work and monotonic counters, expose only Recover in both child-command orders, reject the stale sibling without state change, and keep the normal child output unreachable. The two command-order lifecycles and the stale schedule's recovery prefix agree across CIB `2.2.0`, Lean, the core, and Temporal under `CIB-AGR-0008`; the stale host-task refusal mapping additionally uses `CIB-OP-0001`. The Temporal witness replaces the Worker after the committed throw, while a semantic-core bypass matches the genuine recovery prefix and is detected when its retained pre-throw state incorrectly commits the next stale sibling command.

The [Service Task effect spec](capsules/SERVICE-TASK-EFFECT-SPEC.md) is evidence-closed as a draft. Exact namespace-aware source admission maps the paired source binding to a profile-registered neutral protocol/operation descriptor in the checked Service Task and lowers it to `awaitEffect`; Lean and the pure TypeScript core implement effect occurrence, structured intent, matching completion, full-identity and stale refusal, and the separate `openEffects` observation with no caller interaction. Lean independently checks only neutral graph-to-program lowering, not the raw Camunda-to-neutral profile translation. The shared wire contract uses one occurrence shape across tasks, timers, and effects. The semantic core projects the explicit definition-field group plus occurrence and descriptor from admitted program data and committed intent. The adapter renders domain-separated transport and completion-command digests and schedules one non-local Activity exclusively from that material. Evidence covers plain success, fail-after-mutation reconciliation, cross-instance separation, omission collisions, host-identity over-inclusion, Worker replacement, typed exhaustion with unchanged committed intent, durable history, replay, Activity bypass, ordinary CIB execution, raw retry facts, content-bound retained evidence, and the complete differential matrix. CIB's effect wait remains adapter-decided and CIB does not claim the project transport key or a semantic effect-in-flight state.

The [CreateDocument data and mapping spec](capsules/CREATE-DOCUMENT-DATA-SPEC.md) is evidence-closed as a draft for the project-authored equivalent fixture and exact external-source admission boundary. Exact source/profile admission retains the raw binding as profile evidence and maps it to the neutral Activity/mapped-success descriptor; the checked graph retains the generic mapping names and normalized bodies. Lean and TypeScript independently check and execute the neutral lowering, one literal string input, committed effect arguments, a closed one-string local result patch, deterministic output mapping, local cleanup, and canonical Process variables; neither independently derives the Camunda source mapping. The [scoped runtime data spec](capsules/SCOPED-DATA-SPEC.md) replaces the former flat Process-variable field atomically with one explicit Process scope plus private Activity-local scopes keyed by complete effect occurrence. Its missing/duplicate/cross-owner, non-observability, closure-limit, and enabledness guards leave every canonical trace and shared wire artifact unchanged. The adapter content-binds both arguments and result, derives the Activity request from committed intent, preserves the mapping and replacement runtime state under retry and Worker replacement, replays both schedules, and rejects an Activity bypass through durable history. Fresh CIB Seven `2.0.0` evidence observes the mapped delegate input, local output, synchronous completion, and final Process variable. Its CIB relation is a host-final-state check, not an independent effect-in-flight or scoped-runtime account and not a failure/rollback equivalence claim.

The [typed BPMN Error and interrupting boundary-error spec](capsules/BOUNDARY-ERROR-SPEC.md) is evidence-closed as a draft. Exact checked source and lowering retain one attached exact-code route without adding an Error opcode. Lean and TypeScript implement a successful typed business-error result, discriminated null, exact-code matching, normal-route abandonment, profile-scoped patch → mapping → cleanup → boundary ordering, state-preserving refusal, and a checked normal-path non-law. Temporal derives the result command only from committed intent after a successful Activity result, distinguishes infrastructure failure and unmatched business code as adapter failures, drives the exposed boundary User Task, verifies Activity history, replays the primary execution, and rejects an Activity bypass. Packaged CIB Seven `2.0.0` supplies the separately classified synchronous host relation, target-shaped null mapping, content-bound evidence, and mapping-free unmatched calibration; it is the source of `BERROR-CIBMAP-01`, not independent corroboration.

The implementation is intentionally layered even where a target-shaped vertical witness crosses boundaries. The BPMN requirement ledger is the primary engine-coverage view and now exposes thirteen Process Execution mechanism families with dependencies and narrower closed slices; the CIB–BPMN register owns only classified profile additions and observations; the A12 ledger owns downstream adoption. `CreateDocument` and the typed boundary-error slice are first-round seam evidence, not a model-by-model compiler architecture. There is no A12 adapter package, Java Worker, façade bridge, or runtime dependency in this repository.

The independently reviewed [archived compositional BPMN admission proposal](archived/COMPOSITIONAL-BPMN-ADMISSION-PROPOSAL.md) was superseded as a staged production-admission programme on 2026-07-30. Its completed Stages 1 through 3b remain accepted, frozen experiments: ordering and bounded selector correspondence; executable graph validation and stronger standalone `programWellFormed`; graph-derived tail and whole-process decomposition; saturation-certified path completeness and declarative acyclicity; and graph-derived single- and two-token frontier localization. Stage 3b closes at 298 new or materially rewritten nonblank Lean lines against commit `362f91f`, excluding 11 byte-identical relocated lines. The default verification gate builds and executes the experiment, and infrastructure guards lock theorem reachability plus the retained Boolean discriminators. No law states that either two-token target fires or that exactly two operations are enabled. Closure soundness, commutation, closure fuel stability, the four-step closure theorem, direct Timer/effect source clauses, source-to-program correspondence, and widened production source admission remain absent. The production closure-limit, multiple-enabledness, and stable-state-resumption safeguards are owned by the active targeted per-capsule preservation gate in [TESTING-SPEC.md](TESTING-SPEC.md#redgreen-semantic-workflow).

The production semantic realization remains one pure TypeScript core hosted by the TypeScript Temporal Workflow. The [archived dual semantic-core account](archived/DUAL-SEMANTIC-CORE-ARCHITECTURE-PROPOSAL.md) is rejected; there is no Java semantic core, Java Workflow, or Java-core experiment. JVM integration is an approved architecture boundary for future Activity Workers and client façades, not an implemented surface, and [PROJECT-DESIGN.md](PROJECT-DESIGN.md#cib-compatibility-and-polyglot-effect-execution) owns the exact reopen trigger.

The dependency-free [Simple Boolean expression language](SIMPLE-BOOLEAN-EXPRESSION-DECISION.md) and [Exclusive Gateway condition specification](capsules/EXCLUSIVE-GATEWAY-CONDITION-SPEC.md) implement the standards-first conditional-routing slice. The explicit URI selects five total Boolean forms over complete Process-scope string/null bindings; omitted language remains BPMN's XPath default and is rejected. The checked graph retains exact bodies and declaration-ordered conditional/default Flow identities; Lean and TypeScript parse and evaluate independently; the generic `choose` transition consumes one token and produces exactly one selected route inside pure bounded closure. Temporal hosts, completes, and replays the selected User Task without an evaluator Activity, while a separately bundled route-substitution mutation exposes the wrong branch. The standards profile declares normative authority and no CIB result; its registered pipeline case compares Lean, the core, and Temporal. The [JUEL architecture](JUEL-EVALUATION-ARCHITECTURE-DECISION.md), exact CIB probes, and audited 38-artifact dependency graph remain a deferred CIB compatibility candidate; no JUEL dependency or Java evaluator module is adopted. The existing `MappingExpression.localVariable` arm remains only as a direct lookup for two exact admitted mapping tokens and must not grow into either expression language.

The [Inclusive Gateway selected-branch specification](capsules/INCLUSIVE-GATEWAY-SPEC.md) implements the exact structured checked split/join, branch-local lowering to `selectMany` and `synchronizeSelected`, the hidden owner-scoped selected-branch record, standalone and checked-definition admission, premise-bearing Lean relations plus reusable laws, independent TypeScript behavior, selection-aware quiescence/interruption, and exhaustive Temporal host-capability classification. Four registered standards-only scenarios establish one-true, both completion orders, and default behavior across Lean, the TypeScript core, and Temporal, with case-specific differential mutations. Temporal additionally establishes exact intermediate Queries, Worker replacement after the first selected completion, accepted-result recovery, zero unrelated host mechanisms, four-history replay, and a `selectMany` selection-bypass discriminator. The existing `choose` remains first-true/single-output and `synchronize` remains all-input. No new or Inclusive-specific CIB relationship, execution target, retained evidence, or CIB evidence lane is selected; profile metadata retains `CIB-AGR-0001` and `CIB-OP-0001` only for the reused User Task boundary. Closure correction audit `15ebadc` passed without a semantic implementation defect or material redesign.

The [Event-Based Gateway Message/Timer specification](capsules/EVENT-BASED-GATEWAY-SPEC.md) implements the exact checked node, `awaitEventRace` operation, disjoint configuration-flow/control-place classification, strict source and standalone-program admission, exact checked-definition binding, hidden occurrence-owned race and activation counters, atomic arming, both winner directions, loser withdrawal, wrong/stale state-preserving refusal, canonical observation through the existing Message/Timer surfaces, quiescence blocking, interruption cleanup, and exhaustive host-operation classification. Winner admission is bound to one unique immutable race operation and both complete live members. The registered standards-only profile and two answer-free schedules compare exact Lean/core/Temporal results with CIB deliberately absent. Temporal hosts one cancellable durable Timer alongside Message ingress, groups readiness by deterministic activation tag behind one pinned-SDK job-drain barrier, fails closed on dual readiness before core advancement, preserves the original Timer across separately activated wrong ingress, survives Worker absence in both winner directions, and replays its retained histories. Exact Query/history and association, winner, barrier, batching-premise, priority, Timer-continuity, and core-bypass guards keep the host from selecting BPMN meaning. Existing standalone Message and Timer semantics and their current Temporal hosts remain unchanged. Closure correction audit `a62a51a` passed without a semantic implementation defect or material redesign.

The [interrupting Activity boundary Timer specification](capsules/ACTIVITY-BOUNDARY-TIMER-SPEC.md) is **implemented and evidence-closed**. Implemented and green: exact `TimerBoundaryEvent` source projection rejecting a lexical `cancelActivity="false"`, the `timerBoundaryEvent` checked node with its arity and `PT1S` literal admission, the checked-graph attachment edge, `AwaitBoundedUserTask` lowering that never emits a standalone `awaitTimer`, the registered `bpmn-2.0.2-activity-boundary-timer-draft` capability multiset, its live product example, the independent TypeScript transition family, executed over both victory schedules by the differential pipeline and now carrying [its own focused semantic-core test](../packages/semantic-core/test/activity-boundary-timer.test.ts) covering atomic arming, both victories, off-deadline and wrong-identity refusal with exact state preservation, and both stale-sibling directions — verified by seeding a core that accepts an early firing and one that accepts a late firing, the Lean arming relation with its evaluator-soundness bridge, and [the Lean conformance locks](../BpmnSemantics/ActivityBoundaryTimerConformance.lean) covering atomic arming, both victories, public distinguishability, pre-due and stale refusal, and refusal of a submitted value. Its pre-due arming-instant witness exists in Lean and the semantic core, never as a registered scenario, because the Temporal host derives its firing instant from the wait's own committed `deadlineMs` and the runner admits one firing per scenario, so no target can present an off-deadline instant. The same structural limit makes the Intermediate Catch Timer capsule's identically shaped `999` witness Lean-only, and no registered scenario in the project submits an off-deadline firing; a case declaring no Temporal target would be needed, and no capsule requires one yet. Lean now carries a declarative two-constructor victory relation requiring both waits live and pairing them through a committed operation, a soundness bridge for each evaluator-produced victory, activation-counter preservation across both arms, the logical-time law that separates them, and a quantified refusal of every firing that is not exactly due — which replaces the single `by decide` fixture as the arming-instant discriminator. It also proves that no victory half-withdraws the pair, that a victory removes its own deadline occurrence so the same pair cannot win twice, and that the Activity arm refuses any identity naming no live task. Two hypotheses are stated rather than assumed, and they name facts the state type does not enforce: `RuntimeState` carries no uniqueness invariant over `timerWaits`, so the twice-winning law takes `Nodup` explicitly, and the stronger claim that no later lookup *by key* can rediscover a withdrawn deadline needs uniqueness of the (instance, element, activation) key, which is likewise unstated. The shape such an invariant would take is settled rather than open: `eventRaceAssociationsValid` already asserts cardinality-one over `timerWaits` for event-race-owned timers, `calledProcessAssociationsValid` does the same for the hidden call collection, and both guard their operations and appear as explicit law hypotheses. A bounded pair's timer belongs to neither, so what is absent is a third instance of an established pattern. Both existing predicates are also conjuncts of `stableStateResumable`, which couples a third conjunct to any replacement of that predicate. A half-armed pair is now refused from both sides, so neither member can be spent alone. **Absent in Lean:** quantified state preservation for a stale identity after a victory, which depends on that unstated key-uniqueness invariant and remains a concrete fixture. Both closed wire schemas carry the new operation and node branches, and both languages refuse a deadline whose attachment does not resolve to a same-scope User Task. A guard requires every enum member to have a schema branch reachable from that schema's root; it enforces that direction only, because nothing yet rejects a schema branch whose enum member was deleted. The `profiles/bpmn-2.0.2-activity-boundary-timer-draft` artifact, two registered scenarios, and their two differential catalog cases with seeded mutations exist; both cases reach agreement across Lean, the TypeScript semantic core, and Temporal, and their two live histories replay. The host owns the deadline in a cancellation scope and refuses only a completion and deadline sharing one Workflow activation, under an identity distinct from the Event-race one; that refusal, both victories, and the route discriminator are witnessed against the installed pinned SDK's VM, and the coalescing premise is locked both at the `hasSignals` definition and behaviourally. The deadline also survives Worker absence across its due instant, with the replacement Worker committing the interruption while the bounded Activity is live, and the refused completion Update is answered by the Workflow's failure rather than stranded, confirmed on both sides: the emitted commands by direct VM, and the caller's answer against a real service. That answer names only that the Workflow closed before the Update completed, so the refusal's typed identity is available in the Workflow result and Event History but **not** to a caller awaiting the completion Update. **Absent:** the two registered scenarios the capsule now excludes with their reasons — the abandoned Activity's stale completion, whose Temporal agreement lane needs a delivery mode that neither waits for a task the deadline removed nor races the ordering the case depends on, and the pre-due firing described above; these are distinct limits and neither fix resolves the other; CIB observation of the boundary mechanism, which this standards-only capsule does not select. No conformance, CIB, or Temporal refinement claim is available for this family. The capsule's conditional semantic-checkpoint and closure reviews are both complete with their corrections audited, and it graduated to a specification on the approved closure.

The [bounded Call Activity specification](capsules/CALL-ACTIVITY-SPEC.md) is implemented and evidence-closed after its closure correction audit passed at `bb66c8c` without a material redesign. Exact source admission resolves one namespace-qualified in-document Process QName and canonicalizes one caller plus one distinct called Process root. The current checked graph, schemas, profile admission, generic graph validation, TypeScript lowering, and independent Lean lowering carry one closed Call Activity node plus paired caller-owned `invokeProcess` and called-owned `returnProcess` operations. Lean and the independent TypeScript core implement the hidden association, UTF-8-length-prefixed called identity, owner-derived User Task identity, quiescent exactly-once return, empty-data/wrong-ID/stale refusal, malformed-association non-resumability, interruption cleanup, and exact 3/3/2 closures without changing canonical observation. The registered standards-only profile and answer-free scenario compare Lean, core, and Temporal with CIB deliberately absent. Temporal uses the caller/root Workflow address while completing the derived called task, survives Worker replacement, recovers the accepted result and caller-only Query, returns the terminal receipt, asserts exactly three distinct Update pairs and zero unrelated host mechanisms, proves that the exact committed retry adds no accepted Update, replays history, and detects early return plus identity erasure. No Call-specific CIB relationship or lane exists; `CIB-AGR-0001` and `CIB-OP-0001` remain metadata for the reused User Task surface only.

The reviewer Proto-MVP milestone is closed at clean revision `4f2fe61`. Its complete 28-case catalog demonstrates every implemented bounded profile through each declared Lean, semantic-core, Temporal, selected CIB, retained-evidence, mutation, and replay lane, including 30 disposable histories and 56 isolated Workflow executions. This is an end-to-end architecture and evidence milestone, not a BPMN Process Execution conformance percentage or a broad CIB compatibility claim.

This is not a general BPMN engine, an OMG conformance result, or an immutable production CIB deployment/history compatibility baseline. Individual evidence-bound calibration profile artifacts may already be immutable under the narrower [profile-registry definition](../profiles/README.md).

## Implemented and absent surfaces

### Project foundation

#### Implemented

- Lean 4.31.0/Lake 5.0
- Node 24.18.0
- pnpm 11.20.0 with a repository-pinned CI-oriented local virtual-store projection, shared content-addressable store, exact wrapper-owned CLI selection that disables pnpm's recursive project-driven version switching, bounded wrapper regression execution, and ordinary/CI bare-wrapper guards
- both the Node and pnpm pins owned by a single `package.json` field each, derived by the wrapper, doctor, and CI setup steps through `scripts/pinned-toolchain.sh`, and guarded against a stale selector, `engines` entry, derived consumer, or documented version
- TypeScript 7.0.2
- Ajv 8.20.0
- direct MIT-licensed Node 24 declarations for strict no-emit checking
- every project-authored harness, package test, and calibration entry point executed directly as TypeScript under Node's erasable-type stripping, with a guard-enforced zero-JavaScript invariant
- process-group cleanup on both deadline and parent interruption with escaping-descendant regression guards
- one project-owned tuple-preserving `DeepReadonly<T>` contract utility with compile-time mutation locks
- closed Temporal execution schedules and zero-emit differential schedule/replay variants instead of optional-boolean mode bags
- compiler-backed rejection of non-erasable syntax in direct harness roots
- Java 21 with explicit, environment-first portable home resolution
- Temporal SDK 1.21.0 and CLI v1.8.1
- MIT licensing for project-authored material
- shared `CLAUDE.md`/`AGENTS.md`
- A12-aligned document roles and proposal/spec lifecycle
- enforced documentation index, filename-role, and local-link guards
- enforced directory-independent cold-review receipts for active material proposals and post-policy specifications under `docs/`, with Status-section approval detection, object-database and `HEAD`-ancestry validation, an immutable-baseline grandfather set, prospective same-model/same-effort `fork-turns-none` isolation, exact same-reviewer warm correction and guarded closure continuity, one equal-target combined checkpoint/closure mode for genuinely single-lane atomic closure, stage-specific focus, static-findings-first gate deferral, deterministic neutral review packets, historical receipt preservation, and graduation blocking
- executable Status, suffixless-singleton, registry, file-link, and heading-anchor documentation discipline; the supplied architecture handoff's current release/readiness obligations have active owners while the original brief and two residual proposals are archived provenance
- the non-redistributed OMG BPMN 2.0.2 corpus at external sibling `../oss/omg-bpmn-2.0.2`, with overrideable XSD/CMOF consumer paths, official-source-only atomic fetch, a 15-file tracked hash manifest, and an offline verifier; the optional Markdown/image conversion remains a non-authoritative cache
- portable external-input setup through a 13-repository/four-submodule canonical-remote/commit/tag/gitlink lock plus the per-file OMG digest manifest, separate `verify`/`adoption`/`research`/`all` provisioning scopes, a read-only doctor that hashes every dependency owner and inventories every registered cache root, A12-free CI provisioning, custom-root support, and fail-closed CMOF, MIWG, breadth, and selected adoption lanes; no contributor machine is presumed to contain `../oss`
- enforced A12 boundary checks for source-license headers, dependency coordinates, exact external fixture bytes, external-checkout links, lower-layer bean identities, and the project-authored CreateDocument fixture provenance, plus an explicit optional exact-source adoption gate outside complete MIT engine verification
- enforced implementation-surface reviewability through per-surface implemented/absent sections and a 120-word review-unit ceiling
- commit-bounded nonblank code/document capsule-cost measurement with a parser self-test and explicit unknown treatment for missing historical baselines
- dependency-free source-hygiene enforcement over tracked and pending Lean/TypeScript/JavaScript/Java source with a 600-nonblank-line review target, 1000-line hard ceiling, exact import-only Lean umbrellas, allowlist-free rejection of every hand-written `.js`/`.cjs`/`.mjs` module, required Lean module-document placement, descriptive public names for maintained non-experimental conformance facts, one composed Lean assessment shared by the live scan and explicit sparse-valid anti-boilerplate fixture, literal-aware diagnostics, and no current reviewed exceptions
- a Lean semantic-surplus comment contract with one shared runtime representation invariant and selected execution, strict-JSON, artifact-admission, and scenario support/run boundary documentation; no blanket declaration backfill was performed
- responsibility-owned Lean semantics, Temporal lifecycle, differential pipeline, contract verification, and CIB runner collaborators
- focused and full gates
- GitHub Actions verification on Ubuntu and macOS with the warm feedback budget unchanged

#### Explicitly absent

- Release packaging, published libraries, production deployment
- automatic proof of semantic cohesion or function/class responsibility
- comment-density, word-count, or declaration-documentation scoring; generated comment stubs
- Semgrep or tree-sitter dependency

### A12 Workflows downstream adoption

#### Implemented

- Defined `release/2025.06` denominator of 62 physical and 50 distinct exact-byte BPMN models
- namespace-aware element/extension/expression census
- production delegate, listener, plugin, REST/JMS façade, and downstream-template inventory
- bounded CIB Seven `2.0.0`/`2.2.0` assessment
- distinct immutable `cibseven-2.0.0-a12-create-document-draft` and `cibseven-2.0.0-a12-boundary-error-draft` profiles
- exact admission of the registered maintained `CreateDocument.bpmn` bytes when the checkout is available
- mandatory project-authored equivalent fixtures
- two completed target-shaped vertical feasibility slices proving lower-layer composition

#### Explicitly absent

- A12 adoption adapter/package
- closed exact-external-source end-to-end execution evidence and an A12 Java delegate
- Java delegate Worker bridge
- Java JUEL evaluator Worker
- A12 façade adapter
- script/listener runtime
- materialized Workflows-enabled full-stack template integration
- per-model semantic implementations
- any A12 runtime or license dependency in the MIT engine

### Wire contracts

#### Implemented

- One current structural schema per semantic profile, scenario, canonical result, CIB evidence, checked BPMN graph, and Semantic Process program
- stable document kinds
- semantic profile/source/compiler identity
- exact scenario/profile content binding
- a guarded catalog of answer-free target scenarios with CIB evidence required only by declared CIB target sets
- produced checked-process and Semantic Process artifacts
- nullable checked conditions, one typed Simple Boolean expression union, and declaration-ordered `choose` candidates
- exact divergent/convergent Inclusive Gateway checked-node arms, canonically ordered `selectMany` candidates, and fixed-cardinality `synchronizeSelected` inputs
- exact divergent Event-Based Gateway checked-node arm and named operation-addressed Message/exact-duration Timer arms on `awaitEventRace`, including both configuration-flow origins
- exact Call Activity checked-node arm and paired `invokeProcess`/`returnProcess` operations with called definition, root, entry, return, and caller-output identities
- explicit checked boundary Error and Error End variants plus one resolved direct-parent `throwError` handler with exact Error and Sequence Flow provenance
- one canonical definition-scope forest with exact node/Sequence-Flow and operation/control-place ownership, retaining one rooted tree for existing profiles and one distinct called root for the bounded Call profile, plus one shared occurrence-ID shape reused by User Tasks, Message subscriptions, timers, effects, and Call records
- closed string-or-null variable bindings, Process-variable observation, immutable effect arguments, and closed successful/business-error patches
- required canonical `submittedValues` on exact User Task completion, with empty-patch preservation and no legacy reader
- raw CIB state-query, task-query, timer-job, effect-job, effect-execution, and mapping-execution observations with verifier-reconstructed canonical projections that reuse the adapter's ordering and constant-field rules
- exhaustive schema-depth CIB fidelity classification for all eleven top-level state fields and every nested field
- required `openMessageSubscriptions`, `openTimers`, and separate `openEffects`
- typed `deliverMessage`, `fireTimer`, and `completeEffect`
- JavaScript-safe non-negative integer maxima
- exact non-normalized Unicode-scalar identifier order
- byte-aware duplicate-key and unpaired-surrogate rejection
- TypeScript/Lean edge locks for unknown and missing fields, closed enums, explicit null versus absence, unsafe and fractional numbers, and canonical arrays
- matching CIB scalar sorting and safe numeric carriers
- cross-artifact definition identity and source-origin checks
- reference, arity, identity, candidate-order, evidence, and projection mutations
- pre-release guard against embedded format counters, retired representation names, and milestone compatibility paths

#### Explicitly absent

- Parallel legacy schemas, migration readers, compatibility switches, general assertion language
- value kinds beyond string/null or general variable domain
- wider or decimal numeric domain
- identifier normalization or locale-sensitive ordering

### Semantic profile

#### Implemented

- Draft CIB-backed artifacts `cibseven-2.2.0-user-task-process-data-draft`, `parallel-fork-join-draft`, `cibseven-2.2.0-intermediate-catch-timer-draft`, `cibseven-2.2.0-service-task-effect-draft`, `cibseven-2.0.0-a12-create-document-draft`, and `cibseven-2.0.0-a12-boundary-error-draft` pin their oracle revision, environment, selected features, observation boundary, exclusions, and reviewed CIB–BPMN relationship IDs
- the draft standards profiles `bpmn-2.0.2-simple-boolean-exclusive-gateway-draft`, `bpmn-2.0.2-inclusive-gateway-selected-branches-draft`, `bpmn-2.0.2-event-based-gateway-message-timer-draft`, `bpmn-2.0.2-called-process-call-activity-draft`, `bpmn-2.0.2-timer-user-task-composition-draft`, and `bpmn-2.0.2-intermediate-catch-message-draft` declare BPMN 2.0.2 normative authority and explicitly have no CIB execution target; the Inclusive, Event-Based Gateway, and Call Activity profiles retain only reused User Task relationship metadata
- draft CIB-backed `cibseven-2.2.0-embedded-subprocess-completion-draft` pins the one-level ordinary completion account and `CIB-AGR-0007`
- draft CIB-backed `cibseven-2.2.0-subprocess-error-propagation-draft` pins one direct exact-code exceptional child-scope exit under `CIB-AGR-0008` and the stale host-task mapping under `CIB-OP-0001`
- exact profile definition-scope and operation-kind cardinalities are checked separately from topology-independent graph validation
- immutable CIB artifact status freezes evidence calibration and does not imply a production deployment/history baseline
- the boundary profile selects exact-code agreement `CIB-AGR-0005`, deferred-expression/error extension `CIB-EXT-0003`, caught-path mapping extension `CIB-EXT-0004`, synchronous-to-durable operational mapping `CIB-OP-0003`, and pinned unmatched behavior `CIB-CFG-0004`
- fresh content-bound packaged-engine evidence is release-bound to each CIB profile

#### Explicitly absent

- Separate CIB parallel-compatibility profile
- first production compatibility baseline
- full requirement classification
- approved gap interpretations beyond the reviewed slices
- confirmed deviations beyond the visible `CIB-DEV-0001` candidate

### Runtime scoped data

#### Implemented

- One deeply immutable replacement representation in Lean and TypeScript with explicit Process bindings plus private Activity-local bindings owned by complete semantic effect occurrence
- activation creates the owned input scope
- success and matching Error completion require one exact owner, apply program-owned output mapping, and remove only that scope atomically
- Process-only canonical projection
- cross-owner, missing-owner, duplicate-owner, private-local non-observability, closure-limit, data-independent-enabledness, and compile-time immutability guards
- unchanged shared wire artifacts, canonical traces, effect transport, retained CIB evidence, and Temporal Commands

#### Explicitly absent

- Root-scope compatibility wrapper
- parallel legacy runtime representation
- public Activity-local observation
- bare-element or bare-ordinal ownership
- variable-scope traversal, shadowing, or variable scope kinds beyond the implemented effect-local slice

### Definition and execution scopes

#### Implemented

- one canonical checked definition-scope forest with exact node and Sequence Flow ownership; existing profiles remain one rooted tree while the bounded Call profile adds one distinct parentless called root
- one canonical Semantic Process definition-scope forest with exact operation and control-place ownership plus entry-root and called-root completion strategies
- one root runtime occurrence plus one level of parent-linked child occurrence identity or one occurrence-linked parentless called root under the exact profile
- scope-owned tokens and User Task, Message, Timer, and effect waits
- explicit `enterScope`, `invokeProcess`, `returnProcess`, `reachNoneEnd`, and quiescent `completeScope` operations
- child None Start as entry structure rather than a second Process initiation
- exact child completion only after the owned region has no token, wait, or child occurrence
- child removal plus one parent-owned continuation and separate root completion
- direct-parent exact-code Error interruption that removes the child occurrence subtree, preserves monotonic counters and root-owned work, and emits one parent-owned boundary continuation
- owner-scoped selected-branch records that block quiescence until exact selected-input synchronization and are removed by owner interruption
- occurrence-owned Call records that block caller quiescence, bind one distinct called semantic instance, and remove the complete parentless called subtree on return or interruption
- missing, duplicate, cross-owner, premature-completion, and stranded-child guards

#### Explicitly absent

- arbitrary or repeated nesting, loops that reactivate one definition scope, and concurrent occurrences of the same child definition
- Event Sub-Processes, Call Activities beyond the exact two-Process empty-data normal-return slice, Transactions, compensation, general cancellation, and exceptional propagation beyond one direct-parent exact-code Error handler
- public projection of definition-scope or runtime-scope identity

### Semantic Process IL

#### Implemented

- Implemented draft spec for a checked source-facing graph
- current JSON Schemas and boundary validators for typed `initiate`, `enterScope`, `invokeProcess`, `returnProcess`, `awaitUserTask`, `awaitTimer`, `awaitMessage`, `awaitEventRace`, `awaitEffect`, `duplicate`, `synchronize`, `choose`, `selectMany`, `synchronizeSelected`, `throwError`, `reachNoneEnd`, and `completeScope` operations
- `choose` carries exactly two declaration-ordered typed Simple Boolean candidates and one distinct default
- `selectMany` carries two canonically ordered typed Simple Boolean candidates plus one default, each retaining its branch-local expected join input and one split-derived selection key; `synchronizeSelected` waits for the selected subset without changing `synchronize`
- `awaitEventRace` carries one named operation-addressed Message arm and one named exact-`PT1S` Timer arm with their configuration-flow origins, catch identities, and distinct winner outputs; its configuration Flows are not control places
- `awaitEffect` carries typed input/output mappings plus an optional exact-code boundary route across empty, CreateDocument, and boundary-error contracts
- deterministic TypeScript lowerer and independent Lean decoder/lowerer preserve admitted scope ownership, condition, mapping, route, and exact source data
- independent sequential, bounded-parallel, exact-timer, Timer/User Task composition, operation-addressed Intermediate Catch Message and direct-Message Receive Task subscriptions, payload-free effect, CreateDocument data, boundary-error, Simple Boolean conditional evaluation, ordinary embedded Sub-Process completion, direct-parent Sub-Process Error propagation, and bounded called-Process invocation/return
- generic Lean relation/evaluator including choice, effect-completion, and operation-step soundness, laws, and non-laws
- separately gated frozen checked-source experiment

#### Explicitly absent

- Adopted checked-source operational relation and full observational preservation proof
- general mapping expression, JUEL evaluation request or receipt, general condition language/cardinality, variable, effect payload/fault, catch-all or multi-handler Error search, or propagation beyond one direct parent

### BPMN source

#### Implemented

- Exact byte capture and SHA-256
- UTF-8/security preflight
- private `bpmn-moddle@10.0.0` import
- warning/reference-loss rejection
- bounded compilers for the sequential User Task, balanced parallel, exact `PT1S` timer, profile-parameterized finite acyclic Timer/User Task composition, operation-addressed payload-free Intermediate Catch Message in both Message/User Task orders, one direct-Message payload-free Receive Task, one exact operation-addressed Message-versus-`PT1S` Event-Based Gateway configuration, payload-free Service Task, exact A12 CreateDocument shape, exact A12-shaped boundary Error, exact two-condition-plus-default Simple Boolean Exclusive Gateway, one structured two-condition-plus-default Inclusive Gateway split/direct-User-Task/join region, one-level ordinary embedded Sub-Process completion, one direct exact-code Sub-Process Error-propagation shape, and one exact namespace-qualified in-document called Process
- reusable checked-source scope ownership, reference, arity, scope-local reachability, co-reachability, and acyclicity validation separated from profile mechanism/cardinality capability
- explicit expression-language admission, strict five-form parsing, exact checked-body retention, and process-level Sequence Flow declaration order independent of gateway reference order
- exact source/profile admission preserves raw CIB bindings as evidence and maps them to registered neutral effect identities while checked graphs retain generic conditions, mappings, route/reference metadata, resolved Message channels, and names
- BPMNDI/modeler metadata remains outside semantics
- registered CreateDocument checkout and project-authored fixtures pass
- wrong sigils, method/property expressions, implicit XPath, wrong or per-expression language, invalid Simple Boolean syntax, conditional default, unsupported executable attributes/elements, altered parameters/mappings, false interruption, attachment/code drift, missing/catch-all/nonmatching/extra/non-direct Error handlers, Event Sub-Processes, and cross-scope Sequence Flows reject
- malformed, unprefixed, extra-colon, unknown-prefix, foreign-namespace, unresolved, self, and non-Process Call targets reject; declaration permutation is canonical and the called binding follows the QName rather than a fixture constant

#### Explicitly absent

- General BPMN compiler, arbitrary graph admission or scope nesting, general FormalExpression/JUEL/XPath, other Exclusive Gateway topology/cardinality, Service Task/data/error bindings beyond the approved exact shapes, catch-all/multi-handler/ancestor Error search, timer forms beyond exact `PT1S`, addressless/operation-addressed/instantiating/data-bearing Receive Task, Message payload/key/global correlation/throw/flow or other Message Event loci, external/imported/deployed Call targets, Global Tasks, Call data/mapping/version/tenant/recursion/repetition, synchronous parser CPU isolation, non-UTF-8 decoder, source locations, general extension semantics, DI-preserving export, complete CMOF binding, deployment store

### Lean

#### Implemented

- Project-owned strict JSON parser with duplicate-key, unpaired-surrogate, and safe-integer rejection
- strict checked-graph, Semantic Process, and external scenario decoders with exact-key and closed-variant rejection
- executable JSON edge-case and Unicode scalar-order locks
- separate checked-process admission, Semantic Process structural validation, and cross-artifact binding owners; a narrow shared definition-artifact invariant owner contains only nonempty identity, lowercase SHA-256, and canonical string-order predicates, while the existing checked/program graph modules retain topology, ownership, producer/consumer, reachability, co-reachability, and acyclicity
- canonical lowerer with definition-identity and Sequence-Flow-origin preservation laws
- exact per-artifact lowering equality before evaluation
- generic scope-owned flow-identified token-multiplicity runtime with root and child definition-scope occurrences
- declarative `OperationStep`/`ProgramStep` plus `EffectCompletionStep`, executable operation/effect transitions, and evaluator-produced-operation soundness
- semantic task, Message-subscription, timer, and effect occurrences owned by complete scope occurrence
- kind-grouped canonical active-wait projection sorted as User Task, Message, Timer, then effect and by Unicode element ID within each kind, locked by a synthetic four-kind fixture with reverse-ordered same-kind waits
- bounded closure for one enabled operation or the exact disjoint two-task activation pair, with every other multiple-enabled state rejected
- User Task exact-completion and quantified mismatch laws
- completion-data create/replace/preserve/null witness, data-independent enabledness check, bounded post-patch closure, and quantified complete scoped-variable preservation on mismatch
- parallel laws and duplicate-left/no-right non-law
- independent `PT1S` normalization and exact lowering
- exact timer firing trace
- quantified full timer mismatch refusal and early-firing non-law
- exact Message reference-chain lowering, start subscription trace, exact channel/identity delivery, full mismatch/pre-activation/stale state preservation, reverse User Task/Message progress, and four-kind projection laws
- exact direct-Message Receive Task lowering, two-step start subscription, exact delivery soundness specialization, two-step Process completion, wrong-kind/wrong-Message/pre-activation/stale refusal, and exact subscription/interaction projection
- exact Service Task lowering and success trace
- exact start-prefix projection of one structured effect intent
- quantified full effect-identity mismatch rejection with state preservation
- exact CreateDocument literal arguments, successful mapping trace, output-only Process target theorem, quantified invalid-patch refusal, missing/extra/duplicate examples, and direct-local-patch-to-Process-scope non-law
- boundary-error exact lowering/trace, declarative business-error soundness, exact null mapping, message noninterference, quantified identity/code/patch refusal, and normal-success non-law
- independent Simple Boolean parser/evaluator, checked-body-to-typed-expression lowering, declaration-ordered `choose` relation/evaluator soundness, second-true and all-false/default witnesses, `first_true_ignores_tail`, and `selected_output_owned`
- exact structured Inclusive Gateway checked admission and branch-local lowering; declarative/executable `selectMany` and `synchronizeSelected` soundness; one-true, both-true, and default witnesses; bound-three exhaustion; data-dependent independent activation-order equality; both completion orders; selected-subset readiness/consumption; missing-record and quiescence non-laws; and owner-interruption cleanup
- exact Event-Based Gateway checked admission and configuration-flow lowering; declarative/executable atomic arming and two-constructor winner soundness; exact member ownership, both winner/withdrawal traces, wrong/stale state preservation, two-step arming and bound-one exhaustion, hidden-state non-projection, incomplete/erased-association non-laws, quiescence blocking, and owner-interruption cleanup
- ordinary embedded Sub-Process exact lowering, entry/two-child-wait prefix, both completion orders, sibling survival, quiescent child completion, outer continuation, root completion, generic nonquiescent-completion refusal, and stranded-child non-resumability
- direct-parent Error exact lowering, declarative/executable `throwError` soundness, both child-command orders, regional subtree cancellation, monotonic counter preservation, unreachable normal output, stale-sibling refusal, root-work preservation, and global-cancellation non-law
- generic catalog-driven result emitter that consumes and echoes the same admitted scenario documents
- strict JSON role owners for answer-free scenarios, combined checked-process/program definitions with shared semantic-element decoders, and independently validated cross-artifact definition input, assembled through an enforced import-only umbrella
- saturation-certified executable path completeness and declarative acyclicity
- experiment-only split direct checked-node account, general operation-prefix order theorem, two-segment enabled-transition correspondence checkpoint, executable structured parser, declarative graph-derived tail and whole-process decomposition, tail-parser soundness, unique Start/End, complete node/Flow coverage, decomposition uniqueness up to branch exchange, positive reachability soundness, graph-derived single-token exact and two-token permutation enabled-list localization, and renamed public divergence

#### Explicitly absent

- Optional vertex-count fuel adequacy and no-false-rejection theorem
- generalized arbitrary-cardinality or arbitrary-graph progress theorem beyond the implemented profile capability and targeted checks
- adopted checked-source semantics and run-level observational lowering-preservation proof
- either-target-fires and exactly-two enabledness at a two-token frontier
- generalized enabled-transition, supported-closure, admission, observation, and stimulus-list correspondence remain unresolved
- general multiple-enabled closure without an explicit semantic choice or checked commutation argument
- replay/host-attempt stability as a Lean proposition
- general or repeated scopes, variable types, effect faults, catch-all/multi-handler/ancestor Error search, expression languages, or exceptional propagation beyond one direct parent
- TypeScript or Temporal correspondence proof
- arbitrary BPMN XML parsing

### TypeScript semantic core

#### Implemented

- Dependency-free Semantic Process contracts
- shared safe-string admission and Unicode scalar-value comparator
- profile-registered opaque effect protocol/operation identities with no Camunda namespace, A12 bean, or target-model discriminator
- topology-independent scoped structural program validation plus exact profile definition-scope/operation-kind cardinality for the sequential, balanced two-branch, exact timer, Timer/User Task composition, operation-addressed Message catch, direct-Message Receive Task, exact Message/Timer Event-Based Gateway race, payload-free effect, CreateDocument, boundary-error, Simple Boolean conditional-choice, structured Inclusive Gateway, ordinary embedded Sub-Process, and bounded Call Activity surfaces
- pure enum-based execution of `initiate`, `enterScope`, `invokeProcess`, `returnProcess`, `awaitUserTask`, `awaitTimer`, `awaitMessage`, `awaitEffect`, `awaitEventRace`, `duplicate`, per-incoming-flow `synchronize`, declaration-ordered `choose`, all-true/default `selectMany`, selected-subset `synchronizeSelected`, `reachNoneEnd`, and `completeScope`
- operation-ID-stable internal closure independent of program collection order
- explicit scope occurrence ownership on flow-identified token multiplicity and sorted semantic task/Message-subscription/timer/effect occurrences
- active waits sorted by the contract’s semantic kind rank and then element ID, guarded against cross-kind identifier order
- parallel completion-order, excess-token, and non-law witnesses
- exact timer wait, deadline, firing, full mismatch, stale refusal, and `openTimers` projection
- exact closed-union Message wait, resolved operation/direct channel, one-consumption delivery, full identity/channel/pre-activation/stale refusal, reverse mechanism order, `openMessageSubscriptions`, and delivery-interaction projection, including the direct-Message Receive Task completion fixture
- exact effect wait, structured protocol/operation/argument intent, matching completion, full mismatch and stale refusal, and separate `openEffects` projection with no caller interaction
- closed string/null mapping evaluator, exact success/error local-patch validation, Process output mapping, canonical variables, and direct-patch ownership discriminator
- exact-code business-error route with atomic patch → mapping → cleanup → boundary behavior, normal-route abandonment, message noninterference, and state-preserving refusal
- independent five-form Simple Boolean parser/evaluator with present/null/absent discrimination, first-true tail irrelevance, second-true/default routing, exact three-step closure, and condition-origin/cardinality rejection
- independent Inclusive Gateway evaluation with same-binding all-candidate selection, branch-local selected-input tracking, one/both/default traces, exact four-step closure and bound-three exhaustion, both activation and completion orders, hidden-state non-projection, first-arrival/missing-record refusal, quiescence blocking, and interruption cleanup
- independent Event-Based Gateway atomic arming, complete Message/Timer association, both winner directions, complete loser withdrawal, wrong/stale/incomplete-association refusal, exact two-step closure and bound-one exhaustion, existing-surface projection, quiescence blocking, and interruption cleanup
- ordinary embedded Sub-Process entry, independent child waits, both completion orders, exact owned quiescence, one outer continuation, root completion, premature-completion refusal, and stranded-child non-resumability
- exact called-Process invocation/return with one hidden identity association, UTF-8-length-prefixed called instance, called-owner task identity, caller continuation only after called quiescence, exact 3/3/2 closure bounds, unique-record/root refusal, hidden-state non-projection, and parentless-subtree cleanup
- exact `throwError` validation and evaluation with direct-parent handler agreement, child-subtree cancellation across every runtime owner kind, monotonic counter and root-work preservation, both child-command orders, unreachable normal output, stale-sibling refusal, and stable-prefix resumability
- pure effect-transport material projection from admitted definition fields plus one committed `openEffects` entry without hashing or host identity
- adapter-facing current task/Message/timer projection, exact structural stimulus validation including safe integers and scalar strings, command identity, and same-stimulus comparison
- atomic exact-task Process-variable merge before outgoing closure, including create, replacement, unrelated-binding preservation, explicit null, and state-preserving refusal
- exact Process-start variable installation before internal closure, with canonical string/null bindings, fresh Process scope, no Activity-local scope, and state-preserving refusal
- incremental deploy/advance and full scenario evaluation
- executable internal-enabled-count and stable-state-resumability checks, including a stranded-token negative witness
- malformed topology rejection

#### Explicitly absent

- an ambiguity refusal matching Lean's `ambiguousInternalChoice`: the closure selector advances the lowest canonical operation ID without signalling an unresolved semantic choice, so agreement with Lean at the admitted independent two-User-Task states rests on canonical operation order, explicit activation-order equality for both the static parallel and data-dependent Inclusive cases, and per-profile rejection or unreachability of every other multiple-enabled shape
- I/O, byte-level parser, Temporal SDK, CIB dependency, JUEL/XPath/FEEL/script grammar or evaluation, conditional-evaluation receipts, general BPMN state model, raw source-binding interpretation, effect execution or transport digest, value kinds beyond string/null, general mapping expressions or scope nesting, Call data or generalized definition graphs, general faults or Error propagation beyond one direct parent, timer forms or races beyond the exact capsule, semantically material nondeterministic scheduling, arbitrary graph execution

### CIB oracle

#### Implemented

- Distinct pinned CIB Seven `2.2.0` and `2.0.0` embedded runner profiles
- exact deploy/start/query/complete across the retained Process, task, scope-completion, and Error-propagation fixtures
- generated-task-to-semantic-occurrence mapping
- multiple distinct active task projection with semantic sorting and per-element wait multiplicity
- exact/wrong/sequential-stale, balanced A-then-B/B-then-A, live-sibling stale, exact timer, exact payload-free Service Task success, four ordinary embedded Sub-Process completion/stale schedules, three Sub-Process Error-propagation schedules, exact synchronous CreateDocument, and exact synchronous boundary-error host witnesses
- controlled epoch clock
- raw Process-instance count, engine-clock, Process-variable, timer-job due date/executability, effect-job binding/retry, effect-execution, and mapping-execution observations
- engine-observed pre-due timer eligibility
- bounded engine-level stale-task rejection probe
- pinned `2.2.0` Process-start/User Task completion-data phase-zero probe over public runtime/task/history services, covering initial-variable visibility at the first task under `CIB-EXT-0006` plus create/overwrite/preserve merge, present null, continuation/final visibility, no-data preservation, and unknown/stale no-write controls under `CIB-EXT-0005`
- pinned `2.2.0` exact-source Sub-Process Error-propagation phase-zero probe under `CIB-AGR-0008`, covering Trigger-first and Sibling-first public task sets, recovery-route selection while the Process remains live, and completion only after Recover without a hidden-microstep claim
- pinned `2.2.0` project-authored direct-Message Receive Task phase-zero probe under `CIB-AGR-0009`, covering the public Message subscription's Receive Task ID/name, nonempty host identities, exact public delivery, subscription removal, and Process completion
- retained exact-completion evidence projects only names introduced by already committed start or completion commands through history-backed Process-variable queries; future or rejected submitted names cannot influence an earlier/current projection
- schema-valid duplicate-same-flow Parallel Gateway probe for candidate `CIB-DEV-0001`
- warning-free exact Service Task bindings, prefix-independent expanded QNames, bean resolution, immediately executable async-before job with no due date, public job-definition/deployed-model projection, independent raw protocol/handler controls, profile-registered raw-binding-to-neutral-operation projection, public retry decrement `3 → 2`, two invocations/one test-local mutation, clean re-execution, and no administrative retry mutation
- CreateDocument delegate input/local output plus final Process-variable history under packaged `2.0.0`
- boundary-error phase-zero deployment projection, code/attachment controls, successful mapping, caught code/message routing, caught-path sentinel and target-null output-mapping counterexamples, mapped and mapping-free unmatched controls, empty-name error-variable fact, ordinary boundary User Task/final-null relation, and content-bound evidence under packaged `2.0.0`
- verifier-reconstructed status, waits, open interactions, Process variables, and logical time from retained raw producer observations, with semantic instance identity bound to the answer-free start stimulus
- explicit empty `openMessageSubscriptions` in all retained canonical states, with a verifier mutation rejecting any unclaimed Message projection
- reconstruction reuses the Java projector's ordering, raw-binding translation, activation, lifecycle-state, and empty-argument rules, so it checks raw-to-canonical consistency rather than independently deriving projection semantics
- meaningful status, logical-time, Process-variable, task, sibling, timer-deadline, raw effect-binding, neutral effect-operation, final-variable, and boundary-null mutations
- completion-patch raw-variable mutation bound to the final canonical Process-variable projection
- explicit release-grouped evidence replacement
- content-bound `CIB-AGR-0007` evidence that the outer continuation remains absent until both child branches complete under either order, with stale-child rejection before and after scope exit
- content-bound `CIB-AGR-0008` evidence that both Error command orders expose only Recover while running and complete only after Recover, with a raw sibling-retention projection mutation
- persistent release-specific JSON-lines batches
- compatible test methods share class-owned embedded engines with per-session zero-state checks, while distinct configurations remain isolated
- boundary-safe identity-based PVM diagnostic traversal
- timings and full cleanup

#### Explicitly absent

- Intermediate Catch Message compatibility evidence; Receive Task compatibility beyond the retained direct-Message singleton profile
- arbitrary nested Sub-Process, Event Sub-Process, catch-all/multi-handler/ancestor Error search, or exceptional propagation beyond the direct-parent slice
- A CIB semantic effect-in-flight state, project transport key, typed Worker result, or engine-derived effect activation ordinal
- repeated live instances of one BPMN element and engine-derived activation ordinals
- independent derivation of canonical projection rules or raw Camunda-to-neutral translation
- exact external A12 Java delegate execution
- immutable negative-probe evidence
- reused CIB PVM algorithms/types as project semantics
- broad CIB corpus adoption
- general compatibility claim

### Temporal adapter

#### Implemented

- One semantic-lifetime Workflow receiving the start stimulus and admitted Semantic Process program
- exact canonical string/null initial Process bindings carried in the explicit start stimulus, installed by the core before the first stable wait, retained in Workflow history, Query state, and the completed receipt, and covered by replay
- external `ExternalTemporalRuntime` Worker/client lifecycle over a caller-supplied address, Namespace, identity, and Task Queue, with no embedded-server or port-binding responsibility and a live sequential Process witness
- explicit Process-start Task Queue shared with the selected Worker rather than a hidden production constant
- typed `started | rejected` production start result after separate semantic and Temporal host-capability checks and before Workflow creation
- conservative rejection of token-split graphs containing Timer or effect waits as `concurrentHostDrivenWaits`
- passive admission of direct Message Signal ingress without treating subscriptions as host-driven waits
- passive admission of the scope-owned child User Task set without treating the child scope as a Child Workflow
- exhaustive passive admission of `invokeProcess` and `returnProcess` as internal closure without treating the called Process as a Child Workflow
- collision-resistant SHA-256 Workflow ID derived from semantic Process address in production
- one shared Workflow-safe canonical typed-tuple encoder over exact scalar strings and non-negative safe integers for Process addresses, stimuli, timer firings, effect transport, and effect completion
- dependency-free deterministic SHA-256 with padding-boundary, supplementary-plane, multi-block, and native-crypto equality locks
- fixed literal encodings/digests with distinct domain prefixes
- content-bound Update/timer/effect command IDs
- complete User Task Update identity includes every canonical submitted binding and value; exact duplicate delivery coalesces while changed patch content conflicts
- adapter-rendered effect transport key including committed sorted arguments, with field-variation, under-inclusion, cross-instance, and host-over-inclusion witnesses
- isolated harness probe stores
- one non-local effect Activity derived exclusively from committed intent with two-second start-to-close, ten-second schedule-to-close, two attempts, 100-millisecond configured fixed backoff, no heartbeat, and closed success/business-error result
- payload-free and CreateDocument fail-after-mutation reconciliation
- typed `BPMN_EFFECT_EXECUTION_EXHAUSTED` and `BPMN_UNHANDLED_BPMN_ERROR` Workflow failures with unchanged last committed state
- Worker replacement after an unacknowledged mutation
- exact Activity request/policy/final-attempt/result history checks
- CreateDocument typed arguments/local patch/final Process mapping
- boundary-error typed result/null mapping, caller-completed boundary User Task, unmatched-code refusal, Activity-failure separation, replay, and separately bundled Activity-bypass mutation
- Simple Boolean gateway execution entirely through pure core closure, selected-branch completion/replay, and a separately bundled route-substitution mutation that exposes the wrong branch without adding an evaluator Activity
- structured Inclusive Gateway execution entirely through pure core closure, exact one/both/default wait sets, both completion orders, Worker replacement after the first completion, accepted-result recovery, four-history replay, zero unrelated host mechanisms, and a separately bundled selection-bypass mutation that drops one true branch
- one managed operation-addressed Message/exact-`PT1S` Event-Based Gateway race with an activation-tagged readiness accumulator, one cancellable durable Timer, atomic core-owned winner selection and loser withdrawal, Worker replacement in both winner directions, separately activated wrong-ingress Timer continuity, dual-ready typed fail-closed classification, exact Query/history assertions, replay, and barrier, SDK-batching-premise, fixed-priority, and core-bypass mutations
- bounded Call Activity execution under the caller/root Workflow address with distinct called semantic task identity, called-completion address separation, Worker replacement, accepted-result recovery, caller-only continuation, terminal receipt, exactly three distinct Update pairs with no additional accepted Update for the exact committed retry, zero unrelated host mechanisms, replay, and separately bundled early-return and identity-erasure mutations
- ordinary embedded Sub-Process execution entirely through core-owned scope state, both child completion orders, sibling survival after the first completion, exact outer continuation, Worker replacement, retained Update result, replay, and zero Signal/Timer/Activity/Child-Workflow/cancellation history
- direct-parent Sub-Process Error propagation entirely through core-owned scope state and internal `throwError` closure, post-throw Worker replacement, accepted-result plus Recover-only state recovery, stale-sibling refusal, Recover completion, replay, and zero Signal/Timer/Activity/Child-Workflow/cancellation history
- one semantic loop with start queued before handlers
- core-owned command policy
- a typed `semantic`/`processClosed`/`processUnknown` ingress result kept outside semantic outcomes
- retained-Update-first closure recovery
- exact completion commits submitted Process variables through the core before Update acknowledgement; final Query state and completed receipt retain the same canonical bindings through replay
- exact known-Process User Task detail Query over the complete active occurrence and caller-selected committed Process-variable names; absent and unselected names remain absent and Activity-local scope is never exposed
- one-task dummy form actor that refuses zero, multiple, unexpected, unavailable, or changed tasks, observes the same exact task before and after a configurable nonblocking host delay, and submits configured canonical string/null values only through the production completion Update
- strict repository command configuration with paths resolved relative to the config file, exact nested fields, canonical input/response bindings, explicit external Temporal address/Namespace/Task Queue/identity, typed JSON product records, and classified exit codes
- accepted three-second form simulation over the production Worker, Query, Update, and completed receipt plus a maintained parallel-model example that returns typed source admission rejection before connecting
- separately bundled completion-data bypass writes variables outside the core while omitting the core command result and is rejected by durable Query/Update reconciliation
- separately bundled scope bypass fabricates the outer continuation before child quiescence and is rejected by the retained Update/state relation
- validated address-bound completed receipt including variables
- `REJECT_DUPLICATE`
- conflicting-identity failure
- accepted-handler draining
- explicit ordered, post-terminal, accepted-batch, concurrent, Worker-down-at-timer-due, and Worker-down-at-effect-pending harness schedules
- unordered one-commit/one-rejection race witness
- committed-state-derived exact timer duration and firing with no runner delivery
- durable Timer-to-User-Task composition with ordered host progress, exact core agreement, and live replay
- payload-free `bpmn-deliver-message` Signal ingress, read-only result Query, ordered durable delivery ledger and completed-receipt recovery
- malformed Message request refusal before Signal submission, durable well-formed command-identity conflict, wrong/stale semantic refusal, exact duplicate coalescing, Worker absence, both Message/User Task orders, exact Signal payload history and mutation, replay, and cleanup
- direct-Message Receive Task Query projection, malformed and live wrong-kind refusal, Worker-absence Signal recovery, exact terminal receipt, zero unrelated host events, history-removal mutation, direct-channel-erasure discriminator, and replay through the shared Message Workflow bundle
- harness-only Query reconciliation with durable Update, timer, Activity, and receipt facts
- replay and cleanup
- command-ID-only, Message-Signal-payload, timer-bypass, Activity-bypass, conditional-route-bypass, and child-scope-bypass mutation guards
- an Error-propagation bypass guard whose fabricated post-cancellation result matches the expected public prefix but retains the pre-throw semantic state, so the next stale sibling command commits and produces a detectably wrong durable suffix
- optional time-skipping calibration outside default verification

#### Explicitly absent

- JUEL evaluation Activity, Java evaluator Worker, evaluation request/result contract, or cross-SDK evaluator evidence
- retained result beyond Temporal retention
- production canonical-observation API
- protocol that imposes caller order on concurrent distinct commands
- semantic policy copies in the Workflow
- Message payloads, key-based/global correlation, modeled Message throw, and cross-Workflow Message routing
- committed Event History fixtures
- patch branches
- legacy representation fallback
- production history baseline
- general Worker versioning
- expression evaluation beyond pure Simple Boolean v1
- value kinds beyond string/null or general effect faults/Error propagation beyond the direct-parent internal slice
- Activity heartbeats
- host cancellation recovery and exceptional child-scope interruption or propagation beyond the exact direct-parent Error slice
- timer forms/races/cancellation beyond the exact capsule
- Search Attributes
- Continue-As-New
- task inbox

### Differential pipeline

#### Implemented

- complete artifact-catalog coverage with explicit per-case target sets
- exact-release grouping for every CIB-backed case, explicit standards-only cases, and one raw-only `2.2.0` Service Task fail-once execution
- one generic Lean result emitter
- one core batch
- two isolated Temporal executions per registered scenario
- exact case-specific relations including parallel live-sibling stale rejection, exact timer firing, Timer/User Task composition, Simple Boolean first-true routing, payload-free Service Task success, CreateDocument typed-data success, typed boundary-error routing, and four ordinary embedded Sub-Process completion/stale schedules
- sequential stale three-way semantic agreement plus exact Temporal completion prefix and separate `processClosed`
- Simple Boolean exact Lean/core/Temporal agreement with CIB absent
- structured Inclusive Gateway exact Lean/core/Temporal agreement for one-true, both completion orders, and default with CIB absent
- Event-Based Gateway exact Lean/core/Temporal agreement for Message-first and Timer-first schedules with CIB absent
- bounded Call Activity exact Lean/core/Temporal agreement for the called-task, caller-task, and terminal trace with CIB absent
- Timer/User Task exact Lean/core/Temporal agreement with CIB absent
- Intermediate Catch Message exact Lean/core/Temporal agreement with CIB absent
- direct-Message Receive Task exact CIB/Lean/core/Temporal agreement under `CIB-AGR-0009`/`CIB-OP-0005`
- ordinary embedded Sub-Process exact CIB/Lean/core/Temporal agreement under `CIB-AGR-0007`
- direct-parent Sub-Process Error-propagation exact CIB/Lean/core/Temporal lifecycle agreement in Trigger-first and Sibling-first plus the stale schedule's recovery prefix under `CIB-AGR-0008`, with stale host-task refusal mapped under `CIB-OP-0001`
- CreateDocument and boundary-error exact Lean/core/Temporal semantic agreement plus separate CIB synchronous-final host relations
- retained-CIB comparison only for declared CIB cases
- Query/Update/durable-timer/Activity evidence
- definition binding
- activation, initial-task, live-sibling, timer-deadline, operation-Message ID, direct-Message closed-arm, Signal-payload/history, conditional-route, Inclusive selected-subset/wait-set/default/remaining-wait, Event-race winner/loser/barrier/batching-premise/priority/core-bypass, Call called-identity/early-return, raw effect-binding, neutral effect-operation, final-variable, boundary-null, premature-scope-exit, Error wrong-route/sibling-retention/stale-state, and provenance mutations
- thirty-history replay
- isolation, cleanup, timings, and budgets

#### Explicitly absent

- Universal equivalence, majority voting, general conformance suite
- Simple Boolean truth from CIB
- exact external A12 source execution
- uncorrelated Lean and TypeScript account failure

### BPMN conformance

#### Implemented

- Primary engine roadmap and ultimate Process Execution Conformance target are explicit
- the disposition ledger records thirteen first-pass mechanism families and reviewed requirements separately from CIB and A12 coverage
- implemented bounded mechanisms cover sequential User Task lifecycle/refusal, per-incoming-flow parallel synchronization, one exact Simple Boolean divergent Exclusive Gateway, one structured two-condition-plus-default Inclusive Gateway split and paired selected-subset join, one exact operation-addressed Message-versus-`PT1S` Event-Based Gateway race with bounded durable refinement, one exact Intermediate Catch Timer, one operation-addressed payload-free Intermediate Catch Message subscription, one direct-Message payload-free Receive Task, bounded successful Service Task execution, bounded string/null input/output mapping, one exact-code attached interrupting Service Task Error route, ordinary one-level embedded Sub-Process completion, and one direct-parent exact-code Error End propagation with regional cancellation

#### Explicitly absent

- Line-by-line exhaustive Process Execution denominator, arbitrary compositional graph or nested-scope admission, broad Activity/Event/Gateway/scope/data coverage, percentage-complete claim, or conformance claim

The interrupting **Sub-Process** boundary Timer capsule is past its first green implementation checkpoint and is **not** evidence-closed.

Implemented at the source and IL layer: one new `enterBoundedScope` operation in the Semantic Process contract and its wire schema branch, reusing a now-shared `BoundaryTimerArm` shape; the registered standards-only profile `bpmn-2.0.2-subprocess-boundary-timer-draft` with its exact checked-node and operation multisets in both targets and its admission-specification row; both boundary-attachment validators widened from a `UserTask`-only host predicate to an enumerated deadline-owning allowlist that fails closed; the schema-validated source fixture with its seven-case admission lock; and independent lowering in TypeScript and Lean requiring exact program equality.

Implemented above that layer: the TypeScript semantic core's three transitions — atomic arming, quiescence withdrawal, and deadline interruption over a regional cancellation owner now shared with Error propagation — under a ten-case focused test; the adapter's bounded-scope host class with its distinct `boundedScopeSchedulerUnavailable` refusal identity and the first cross-managed-class rejection assertion; and one product example checked through both pre-start gates.

Absent at this checkpoint, and each absence is deliberate rather than pending discovery.

Lean now carries both victory arms. Implemented and green at the semantic layer: the declarative arming relation with its evaluator-soundness bridge; `completeBoundedScope?`, which composes the shared scope completion with withdrawal of the parent-owned deadline in one transition, matched on the child's activation ordinal so a stale deadline cannot be withdrawn by a later child; and `interruptBoundedScope?` with the quantified refusal of every firing that is not exactly due.

Also implemented: the declarative two-constructor `BoundedScopeVictoryStep`, which requires the live deadline and pairs it to the child occurrence through a committed operation; the deadline-arm evaluator-soundness bridge; the law that no victory half-withdraws the triple; and a proof that an unbounded scope's completion is exactly the shared completion, so this family adds no behavior to an ordinary Sub-Process.

[Its own conformance module](../BpmnSemantics/SubProcessBoundaryTimerConformance.lean) locks atomic arming, parent ownership of the deadline, both victories at the public boundary, the follow-on identity as the separating witness, unreachability of the normal output on the deadline arm, an early firing leaving the armed triple exactly intact, both stale-sibling refusals with exact state preservation, and the required checked non-law that interruption does **not** preserve child-scope-owned state.

Making `completeBoundedScope?` reachable required `fire?` and `OperationStep` to carry the `Program` the withdrawal consults, which is the shape the TypeScript dispatcher already had. **That fixture also exposed a latent checked-graph defect:** `oneCompletionStrategyPerScope` counted child-scope entry only through `.enterScope` and `operationRespectsScopes` sent `.enterBoundedScope` to a catch-all requiring every output to be owner-scoped, so the validator rejected the lowered program that the profile's own admitted multiset already expected. Both are the wildcard-arm class recorded in [the process-assessment ledger](PROCESS-ASSESSMENT-LEDGER.md#findings), and the root fix is a total, named `enteredChildScopeId?` rather than a third ad-hoc match.

Both evaluator-soundness bridges are now implemented, together with the counter-and-history preservation law and the two per-evaluator logical-time laws. All four rest on a component-preservation lemma for the shared scope completion, which required extracting quiescence and normal completion out of `RuntimeState` into [their own owner](../BpmnSemantics/SemanticProcess/ScopeCompletion.lean): the outer transition decides whether a scope may complete, and a separate rewrite selector decides what completing it does. The quiescence bridge *derives* the deadline's liveness in the pre-state through that lemma rather than assuming it, since the evaluator finds the deadline in the completed state and completion leaves `timerWaits` untouched.

Two hypotheses are stated rather than assumed, and each names a fact its own transition does not establish. The quiescence bridge takes `running` because the shared completion decides it without exporting it. The deadline bridge takes `parentOwned`, and that gap is real: the evaluator erases the deadline after regional cancellation without re-checking that cancellation left it there. Atomic arming guarantees it, because the owner is the parent and therefore outside the cancelled subtree, but deriving it here would additionally need scope-tree acyclicity and an empty called-instance closure, neither of which `RuntimeState` enforces.

**`parentOwned` was first written as an unsatisfiable premise, and closure review caught it.** Quantified over every `TimerWait`, it asserted membership in a list `interruptScope` only ever filters, so nothing could satisfy it and the bridge proved nothing about the evaluator. It is now guarded by the transition's own three lookups, so it constrains exactly the states the deadline arm reaches, and `deadline_arm_bridge_premise_is_satisfiable` in [the conformance module](../BpmnSemantics/SubProcessBoundaryTimerConformance.lean) chains those lookups against the armed state and kernel-decides that each succeeds *and* the parent-owned deadline survives cancellation. That witness is the guard against a future weakening reintroducing vacuity, because a premise no state satisfies does not weaken a theorem, it deletes it.

**The logical-time law does not separate the arms and no longer claims to.** Stated over the victory relation it carries no arm hypothesis, so a step alone cannot attribute a disjunct to an arm; it is retained as a joint bound. The separation now lives in `completeBoundedScope_logical_time` and `interruptBoundedScope_logical_time`, one quantified law per evaluator, which is what the two `decide +kernel` conformance fixtures previously stood in for.

**Absent in Lean:** nothing in the capsule's required Lean lane.

The `profiles/bpmn-2.0.2-subprocess-boundary-timer-draft` artifact, two registered answer-free scenarios, and their two differential catalog cases with seeded mutations now exist. Both cases reach agreement across Lean, the TypeScript semantic core, and Temporal, and both seeded mutations produce their required disagreement: the quiescence schedule detects a retained withdrawn deadline, and the deadline schedule detects a child region left live beside the boundary route's own task. The two mutations are deliberately one per victory rule rather than two route discriminators, because the route choice is already the sibling capsule's mutation while regional cancellation is this family's own proposition.

**The adapter needed a host lane, and registering the scenarios is what exposed it.** `isBoundaryTimerDefinition` enumerates only `AwaitBoundedUserTask` operations, so a bounded-scope deadline fell through to the generic bare-durable-timer path that [the Workflow](../packages/temporal-adapter/src/workflow-implementation.ts) documents as unsound for a boundary deadline. The quiescence schedule then fired a deadline after its scope had already completed. Every gate that runs without a host port stayed green while the family had no Temporal host at all.

Rather than add a third near-duplicate scheduler, [the deadline scheduler](../packages/temporal-adapter/src/bounded-deadline-scheduler.ts) is now parameterized over a family descriptor, and both families instantiate the same activation-tagged batching and durable timer ownership under separate refusal identities. The bounded-scope identity is `BpmnBoundedScopeSchedulerUnavailable`, distinct because the outcome an operator loses is a whole child region reaching quiescence rather than one task completion. Behavior preservation for the bounded-Activity family was the criterion and it held, with every pre-existing adapter assertion unmodified.

The durable host evidence is the two differential executions with replay, plus a Worker-absence run across the due instant in which the replacement Worker cancels the live child region and emits the boundary route from committed state alone.

The new `BpmnBoundedScopeSchedulerUnavailable` identity now carries its own negative assertion through [a direct-VM shared-activation witness](../packages/temporal-adapter/test/bounded-scope-deadline-witness.ts). Both single-callback victories execute and reach their own End Event, the cross-route control does not, the quiescence arm withdraws the durable deadline while the deadline arm does not, and a shared activation refuses without first cancelling the timer. The generic assertions moved to [their own owner](../packages/temporal-adapter/test/boundary-deadline-assertions.ts) so the two families share them rather than keeping a second copy.

**The identity assertion is verified discriminating rather than assumed to be.** Seeding the bounded-scope family with the bounded-Activity failure type fails exactly one of the four tests, the one requiring the refusal not to carry the sibling's identity, while the other three still pass. That is the evidence that a copied identity would be visible here: without that assertion the seeded defect is green.

The pre-due firing and the post-victory stale refusal are excluded from the registry for two distinct structural reasons recorded in [the scenario README](../scenarios/subprocess-boundary-timer/README.md). The host derives its firing instant from the wait's own committed deadline, and only completion stimuli reach Temporal at all, so a stale timer firing would reach no host while a stale child completion after the deadline would race the host's own firing. Both stale directions remain covered in Lean and the focused core test, where the order is exact.

The requirement row `BPMN-SUBPROCESS-BOUNDARY-TIMER-01` is `supported` for exactly this bounded slice, and the capsule graduated to [a specification](capsules/SUBPROCESS-BOUNDARY-TIMER-SPEC.md) on the closed closure review. The conditional semantic-checkpoint review required by [the cold-review rule](../CLAUDE.md#independent-cold-review) is complete: the review of `ef4edd4` returned `approve-with-required-edits` and the same reviewer's audit of `3652549` returned `AUDIT: closed`.

## Non-interrupting boundary Timer

The [non-interrupting boundary Timer proposal](capsules/NON-INTERRUPTING-BOUNDARY-TIMER-PROPOSAL.md) is **implemented to its semantic checkpoint and not evidence-closed**. This is the first capsule in which a boundary Event fires without ending its host, so the enclosing scope holds two live branches and its completion must account for both.

**Implemented and green: source and profile.** The `cancelActivity` attribute is resolved once, in [the Timer Boundary Event source reader](../packages/bpmn-source/src/timer-boundary-event-source.ts), into a closed `BoundaryInterruption` value the checked node carries. An omitted attribute and a lexical `true` resolve to `interrupting` from the XSD and CMOF default, and a lexical `false` to `nonInterrupting`.

That reader cannot see the lexeme, so an exact-lexeme guard runs before parsing. `bpmn-moddle` reduces an `xsd:boolean` attribute to `value === "true"` and reports no warning, so every other lexeme reached the checked graph as `false` — the non-interrupting disposition. `cancelActivity="1"` is schema-valid and means *true*, so a valid interrupting boundary Event was admitted as non-interrupting; `"maybe"`, `"FALSE"`, and `""` were admitted at all. [The compiler](../packages/bpmn-source/src/compile.ts) now rejects any `cancelActivity` lexeme that is not exactly `true` or `false` on the exact decoded source, under its own `ambiguousBooleanLexeme` diagnostic, beside the existing pre-parse DOCTYPE refusal. It is deliberately element-blind and rejects the whole source, because narrowing it would mean re-parsing the attribute's owner outside the parser.

The guard matches both XML attribute-value delimiters. Its first form matched only the double-quoted spelling, so `cancelActivity='1'` stayed admitted; the checkpoint reviewer found that by varying the delimiter rather than the value. It compares lexemes, so it also refuses an entity-encoded spelling of a valid boolean such as `&#116;rue`. That over-rejection is the safe direction and is intentional, because resolving entities here would mean decoding XML outside the parser; a contributor meeting that rejection should read it as the guard's boundary rather than as a parser defect.

That disposition is what the profile checks. `bpmn-2.0.2-non-interrupting-boundary-timer-draft` and the interrupting sibling pin the same seven checked-node kinds, so the disposition is the only place their separation can be observed in checked source, and both languages check it there rather than after lowering. The deadline-owning host allowlist is disposition-aware and admits a non-interrupting deadline only on a User Task, so a non-interrupting Sub-Process host is refused at admission rather than lowering to an entry operation that would drop it.

**Implemented and green: lowering and the IL.** Lowering selects `awaitMonitoredUserTask` or `awaitBoundedUserTask` from that value. The arm shape, its wire schema branch, and its well-formedness predicate are shared with the interrupting family and discriminated only by operation kind, so neither family can admit the other's program. Both closed wire schemas carry the new operation branch and the checked node's disposition.

**Implemented and green: the semantic core.** [The independent core](../packages/semantic-core/src/semantic-process-monitored-task-runtime.ts) implements atomic arming, the host-preserving spawn, and the one-sided completion, with [its own focused test](../packages/semantic-core/test/non-interrupting-boundary-timer.test.ts) covering both completion orders, completion after firing, off-deadline and wrong-identity refusal with exact state preservation, and refusal of a submitted value. Verified by seeding a core that cancels its host on firing, one that retains the withdrawn deadline, one that requires both waits for completion, and one that accepts any instant at or after the deadline.

**Implemented and green: Lean.** [The family module](../BpmnSemantics/SemanticProcess/MonitoredTask.lean) carries declarative arming, spawn, and two-constructor completion relations distinct from the evaluator, a soundness bridge for each, the quantified host-preservation law that separates this family from its sibling, quantified routing and withdrawal laws, and quantified off-deadline and wrong-identity refusal. Its checked non-law is that a completion here succeeds under the exact premise on which the sibling's `completeBoundedUserTask_none_of_no_deadline_wait` refuses.

[The conformance module](../BpmnSemantics/NonInterruptingBoundaryTimerConformance.lean) locks atomic arming, the spawn preserving the host's element and activation ordinal, both deadline states of completion, the admission inversion against the sibling disposition, pre-due and stale refusal with exact state preservation, and `NBTIMER-QUIESCE-01`'s non-law in both completion orders.

**Implemented and green: host capability.** The Temporal adapter gains a fourth managed host class and a third `BoundedDeadlineFamily` — the counts differ because the Event-Based Gateway race is a managed class with no bounded deadline family under its own typed `BpmnMonitoredActivitySchedulerUnavailable` identity, because the outcome an operator loses here is a handler branch that never starts rather than a task or a region that never ends.

**Absent.** Every evidence lane after the checkpoint: the two registered answer-free schedules and their differential cases with seeded mutations, the Temporal spawn and withdrawal histories with replay, and the Worker-absence run across the due instant.

One product example configuration exists and is **not** deferred. Registering a profile makes [the product-example oracle](../packages/temporal-adapter/test/product-example-configs.test.ts) binding in the same change, so the obligation lands with registration rather than with the evidence lanes. Its declared plan answers the handler task first, which is reachable only after the deadline spawns it, then the still-open monitored task, then the normal follow-on. That oracle also admits the example through both pre-start gates without connecting, which is the first evidence that the new managed host class accepts this program. No conformance, CIB, or Temporal refinement claim is available for this family, and the requirement row `BPMN-NON-INTERRUPTING-BOUNDARY-TIMER-01` stays `unsupported`. The scenario directory holds the exact source and no schedule.

**Carried rather than checked.** The recovery join is unfalsifiable inside this profile: all targets recover the family by joining element identity to activation ordinal with no explicit occurrence record, and the profile's own uniqueness admission is what makes that safe. The falsifying state is a repeated or Multi-Instance Activity, and both are excluded, so a capsule admitting either must add the occurrence record rather than inherit this argument. The three seeded core defects that a soundness bridge also rejects are not two independent lanes: seeding a spawn that cancels its host fails `spawnFromMonitoredUserTask_sound` before any fixture runs, so for that defect the relation and the conformance fixture share a failure mode.

## Current evidence

The [canonical CIB observation fidelity table](TESTING-SPEC.md#canonical-cib-observation-fidelity) classifies all eleven top-level `stateObservation` fields and every nested occurrence, wait, Message subscription, timer, effect, interaction, and variable field as `engine-observed`, `adapter-derived`, `adapter-decided`, or `not-claimed`; a schema-depth test prevents omissions. Rule-level fidelity is recorded in the owning CIB-backed capsules, including [User Task](capsules/USER-TASK-INTERACTION-SPEC.md#oracle-evidence-fidelity), [Timer](capsules/INTERMEDIATE-CATCH-TIMER-SPEC.md#cib-fidelity-by-rule), [Service Task](capsules/SERVICE-TASK-EFFECT-SPEC.md#cib-fidelity-labels), [CreateDocument](capsules/CREATE-DOCUMENT-DATA-SPEC.md#cib-fidelity-labels), [boundary Error](capsules/BOUNDARY-ERROR-SPEC.md#rule-to-evidence-matrix), and [direct-Message Receive Task](capsules/RECEIVE-TASK-MESSAGE-SPEC.md#evidence-matrix). The ordinary Sub-Process lane reuses public-task fidelity and records schedule evidence in its rule matrix. Intermediate Catch Message remains standards-only, and retained CIB projections for those cases enforce an empty Message collection.

The complete prepared pipeline requires:

- exact agreement for `user-task-discovery-completion` and `user-task-wrong-activation`;
- exact CIB Seven/Lean/core semantic agreement for `user-task-stale-completion`, exact core/Temporal prefix agreement through completion, and separate adapter-owned `processClosed`;
- exact agreement for `parallel-fork-join-a-then-b` and `parallel-fork-join-b-then-a`, including the symmetric one-task intermediate projections;
- exact four-target rejection for `parallel-fork-join-stale-a-while-b-active` with B unchanged;
- exact four-target agreement for `intermediate-catch-timer-pt1s`, including one wait at deadline 1000, identical content-bound firing command observation, completed logical time 1000, and no caller-enabled interaction; in the CIB lane the deadline and completed logical time are `adapter-derived` per [the Timer capsule's fidelity rows](capsules/INTERMEDIATE-CATCH-TIMER-SPEC.md#cib-fidelity-by-rule): the runner writes the scenario's firing time into the controlled engine clock and the projector reads that clock back, while the engine-observed facts are the raw job due-date delta and the pre-due/due eligibility transition;
- exact Lean/core/Temporal agreement for `timer-user-task-composition`, including the Timer wait at deadline 1000, committed-state-derived durable firing, the later User Task wait and completion, live replay, typed pre-start host admission, and detection of a one-millisecond deadline mutation; CIB is explicitly absent because it does not establish the composition or structural-admission rule;
- exact Lean/core/Temporal agreement for `exclusive-gateway-simple-boolean-first-true`, including declaration-ordered first-true routing to `Task_First`, tail irrelevance, completion, replay, and detection of a `Task_Second` route substitution; CIB is explicitly absent because it does not execute the project language;
- exact Lean/core/Temporal agreement for `inclusive-gateway-one-true`, `inclusive-gateway-both-true-a-then-b`, `inclusive-gateway-both-true-b-then-a`, and `inclusive-gateway-default`, including the exact selected initial wait sets, sibling-only intermediate states, both completion orders, Worker replacement after the first selected completion, accepted-result recovery, zero unrelated host mechanisms, four-history replay, and detection of dropped/forced/substituted selected branches or waits; CIB is explicitly absent because no Inclusive Gateway relationship or expression profile was selected;
- exact Lean/core/Temporal agreement for `event-based-gateway-message-wins` and `event-based-gateway-timer-wins`, including one Message subscription for `MessageCatch` activation `1`, one `TimerCatch` activation `1` deadline `1000`, winner-only User Task projection, complete loser withdrawal, Worker absence in both winner directions, separately activated wrong-Message Timer continuity, dual-ready fail-closed classification, mutation-sensitive host ordering/cancellation, and replay; CIB is explicitly absent because no Event-Based Gateway relationship was selected;
- exact Lean/core/Temporal agreement for `called-process-call-activity`, including the derived called-task identity, absence of early caller continuation, caller/root identity after normal called return, terminal completion, Worker replacement, accepted-result recovery, exact three-distinct-Update/zero-unrelated-host-event history with no additional accepted Update for the exact committed retry, replay, and called-identity/early-return mutations; CIB is explicitly absent because no Call Activity relationship was selected;
- exact Lean/core/Temporal agreement for `intermediate-catch-message`, including one complete Message subscription, wrong-channel and stale state-preserving refusal, exact one-consumption delivery, the later User Task, Signal result/receipt reconciliation, Worker absence, exact duplicate recovery, identity-conflict classification, replay, and detection of Message-channel and Signal-payload substitutions; CIB is explicitly absent because no Message compatibility claim was selected;
- exact CIB/Lean/core/Temporal agreement for `message-addressed-receive-task`, including one direct Message subscription, exact completion, retained subscription removal, direct-arm differential mutation, live malformed/wrong-kind controls, Worker-absence Signal recovery, terminal receipt, zero unrelated host mechanisms, mutation-sensitive exact Signal history, and replay under `CIB-AGR-0009`/`CIB-OP-0005`;
- exact four-target agreement for `embedded-subprocess-completion-a-then-b`, `embedded-subprocess-completion-b-then-a`, `embedded-subprocess-completion-stale-a-while-b-active`, and `embedded-subprocess-completion-stale-a-after-scope`, including the independent child wait set, sibling preservation, absence of the outer continuation before child quiescence, exact one outer continuation, root completion, Worker replacement, replay, and early-exit mutation detection under `CIB-AGR-0007`;
- exact four-target agreement for `subprocess-error-propagation-trigger-first`, `subprocess-error-propagation-sibling-first`, and `subprocess-error-propagation-stale-sibling-after-error`, including the initial child pair, regional sibling removal, Recover-only continuation, order-specific hidden End counts, stale state preservation, post-throw Worker replacement, replay, and wrong-route/sibling-retention/bypass mutation detection; `CIB-AGR-0008` owns the recovery lifecycle and `CIB-OP-0001` owns the stale host-task refusal mapping;
- exact canonical agreement for `service-task-effect-success`, including one structured effect intent, the content-bound success command, completed state, and no caller-enabled interaction; CIB contributes an explicitly adapter-decided host-realization check rather than an independent semantic effect-in-flight state;
- exact Lean/core/Temporal semantic agreement for `a12-create-document-data`, including immutable arguments, one typed local patch, mapped Process variables, retry-equivalent isolation, and durable Activity evidence; CIB contributes a separate synchronous final-state relation with raw delegate input/local output and engine-observed final Process variable under `2.0.0`;
- exact Lean/core/Temporal semantic agreement for `service-task-boundary-error`, including the successful typed business-error result, null local patch, mapped null Process variable, normal-route abandonment, boundary User Task completion, Activity evidence, and primary-history replay; CIB contributes a separate synchronous final-state relation with engine-observed boundary routing and null mapping under `2.0.0`;
- equality between current CIB execution and content-bound retained CIB evidence;
- exact raw-only CIB retry evidence for one fail-once execution with retries `3 → 2`, two delegate invocations, one test-local mutation, and canonical equality to the retained plain-success execution;
- the same waiting projection for successful and wrong-activation inputs before completion;
- exact state preservation after wrong and stale completion rejection;
- equality between the pure core and both isolated Temporal results under each case's explicit target relation;
- correct Query projection and Update outcomes;
- proof that the Temporal runner never delivers `fireTimer` or `completeEffect`, the Workflow derives each from committed semantic state, and Event History contains the exact timer or Activity mechanism;
- duplicate logical-command stability;
- classified disagreement after activation `1` is mutated to `2`;
- a rejected Lean scenario document with an injected extra answer field, plus exact equality between the admitted scenario and Lean's decoded echo;
- exact Lean definition identity and lowering equality, plus rejection of a schema-valid operation-origin mutation;
- rejection of erased parallel control-place Sequence-Flow provenance; detection of raw Process-status, logical-time, and Process-variable drift; binding of semantic instance identity to the start stimulus; detection of an omitted parallel open task, a dropped live sibling after stale A, a one-millisecond timer-deadline mutation, a substituted Simple Boolean route, a mutated Service Task operation, a mutated CreateDocument final variable, and null-to-string boundary mapping drift;
- thirty fetched live histories replayed before server shutdown;
- clean CIB and Temporal teardown.

The complete pipeline remains subject to the 15-second warm and 45-second cold budgets. Exact latest measurements and commands belong in [PLAN.md](PLAN.md), not in this inventory.

## Nearest unsupported claim

The nearest unsupported Call Activity claim is a second or repeated invocation of the same called Process; deployment or version/tenant resolution, mappings and per-instance data, recursion, exceptional completion, cancellation, Temporal Child Workflow identity, and CIB compatibility remain outside the implemented profile. The nearest unsupported Receive Task claim is an addressless or operation-addressed, instantiating, data-bearing, correlated, or repeated Receive Task; the exact direct-Message slice has source, Lean, TypeScript, retained-CIB, differential, and Temporal evidence. The nearest unsupported Sub-Process boundary Timer claim is a deadline on a Sub-Process holding more than one child task, which is where this profile's single-child coincidence between the child's last consumed token and scope quiescence stops holding, so the withdrawal rule stated over quiescence becomes separately falsifiable rather than accidentally correct; nesting beyond one level, non-interrupting boundaries, other triggers, more than one boundary per Sub-Process, other Timer expressions, and CIB compatibility remain outside it. The nearest unsupported Error claim remains handler search beyond one exact match attached to the directly enclosing embedded Sub-Process. Catch-all matching, multiple candidates, ancestor propagation, unmatched Error outcomes, Event Sub-Processes, Error payload/data mapping, and concurrent command races remain absent. Arbitrary serial composition, arbitrary graph progress, repeated or nested scope activation, Message payload/key/global correlation, general Inclusive Gateway reachability beyond the exact structured selected-branch profile, Event-Based Gateway trigger sets or coalesced readiness beyond the exact operation-addressed Message/`PT1S` pair and its fail-closed host boundary, loops, multi-instance, compensation, and general Event semantics remain unsupported. Conditional routing remains limited to the exact Simple Boolean profile, and JUEL remains demand-driven, deferred, and separately classified.

The downstream adoption inventory remains in the [A12 Workflows compatibility ledger](research/A12-WORKFLOWS-COMPATIBILITY-LEDGER.md). The exact `2.0.0` target-profile projector admits one of 50 distinct exact-byte A12 Workflows models unchanged at the static source/lowering boundary, but the closed exact-model product count remains zero because the external EUPL-1.2 model and A12 Java delegate have not executed through a separately bounded adoption adapter. This is an A12 adoption gap, not the primary BPMN coverage measure. The active Simple Boolean language matches none of the retained A12 JUEL sources and claims zero adoption coverage. Read-only JUEL evaluation, capability-bearing JUEL, scripts, listeners, forms/assignment, message correlation, A12 façade adaptation, and engine-plugin behavior remain unimplemented with target-backed priority only where they force lower-layer work.

The cross-language wire-hardening prerequisite is closed: schemas cap every current integer at `9007199254740991`, canonical identifiers use exact Unicode scalar-value ordering with no normalization, strict byte readers reject duplicate decoded keys and unpaired surrogates, and the TypeScript, Lean, and CIB boundary guards exercise their applicable representations. `awaitEffect` is part of the checked program, pure semantic accounts, and production Temporal refinement under the exact bounded specification.

The strongest unresolved proof claim remains full observational checked-source-to-program-run preservation. The [bounded experiment](experiments/CHECKED-SOURCE-RELATION-EXPERIMENT.md) retains a provisional direct account, a renamed positional-lowering discriminator, and accepted bounded structural/frontier results, but no run theorem. Production work now uses the targeted preservation boundary in the [Semantic Process IL spec](SEMANTIC-PROCESS-IL-SPEC.md#lean-specification-and-proof-obligations): each material admission or representation capsule protects its exact source-to-result risk, while the general theorem reopens only when a second capsule needs the same proposition or a targeted proof cannot remain local.
