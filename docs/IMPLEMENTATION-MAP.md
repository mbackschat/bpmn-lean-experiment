# Implementation map

This document is the sole detailed owner of current implementation, proof, evidence, and absence status. It describes the repository now, not milestone history.

## Current claim

The repository has an evidence-closed **draft** semantic capsule and a runnable pre-release product command for one private executable `None Start Event → User Task → None End Event` Process. Exact start installs canonical string/null Process variables before the first wait under selected CIB extension `CIB-EXT-0006`; exact completion atomically merges a second canonical patch under `CIB-EXT-0005`. Start visibility, exact completion, and wrong activation agree across pinned CIB Seven, the Lean reference interpreter, the independent TypeScript semantic core, and the Temporal adapter. For sequential stale completion, CIB Seven, Lean, and the core agree on semantic rejection and preservation of the committed start/completion data; Temporal agrees exactly through completion and separately returns adapter-owned `processClosed` under the explicit post-terminal schedule. The [MVP command](RUNNABLE-TEMPORAL-MVP-SPEC.md) strictly reads one local config, compiles before connecting, runs the same generic Workflow against a caller-owned Temporal service, exposes the stable task/input/delay/completion/final-state records, and rejects the maintained unsupported model without opening a connection.

Every multi-target agreement claim in this document carries one shared-origin qualifier: the TypeScript compiler in `@bpmn-lean/bpmn-source` is the sole producer of the checked BPMN graph and Semantic Process program that Lean, the TypeScript core, and the Temporal adapter all consume. Lean independently recomputes graph-to-program lowering and rejects inequality before evaluation; it has no BPMN XML parser, so a defect in XML-to-checked-graph translation propagates identically into those three targets. Pinned CIB Seven can separate that defect only for a declared CIB profile whose exact source it executes; the standards-only Simple Boolean profile has no such source-level oracle and states that limitation explicitly. The [parallel capsule's common-mode risks](capsules/PARALLEL-FORK-JOIN-SPEC.md#assurance-boundary), the [Exclusive Gateway assurance boundary](capsules/EXCLUSIVE-GATEWAY-CONDITION-SPEC.md#assurance-boundary), and [TESTING-SPEC's evidence lanes](TESTING-SPEC.md#evidence-lanes) own the correlation rule.

The parallel fork/join contract is evidence-closed as a draft under normative per-incoming-Sequence-Flow behavior. The bounded [Semantic Process IL spec](SEMANTIC-PROCESS-IL-SPEC.md), asymmetric runtime representations, and decision not to claim broad CIB parallel compatibility own the maintained definition boundary. Current schemas freeze the checked graph and Semantic Process wire shapes, and adversarial contract tests cover reference, arity, scope ownership, identity, canonical-order, candidate-order, and raw-to-canonical projection failures. The bounded source path now also admits one ordinary embedded Sub-Process scope while retaining generic profile-parameterized graph admission rather than a whole-topology disjunct.

Lean and TypeScript independently validate the definition-scope tree and ownership maps, replace `terminate` with `reachNoneEnd` plus quiescent `completeScope`, and execute scope-owned tokens and waits. Lean proves executable-operation soundness and generic nonquiescent-completion refusal; the scope capsule adds both completion orders, sibling-survival, outer-continuation, and stranded-child laws. Temporal hosts the child scope inside the same Workflow through passive Updates, survives Worker replacement, replays, and detects an early-exit bypass without a Child Workflow or cancellation event. CIB Seven supplies four content-bound `CIB-AGR-0007` schedules. The seventeen-case pipeline replays nineteen histories and retains case-specific target relations.

The [Intermediate Catch Timer contract](capsules/INTERMEDIATE-CATCH-TIMER-SPEC.md) is evidence-closed as a draft. The exact literal remains in the checked graph and independently lowers to `awaitTimer` duration 1000; Lean and TypeScript own full timer occurrence identity, exact-deadline eligibility, logical-time advancement, refusal, and `openTimers` observation. The scenario's answer-free `fireTimer` is applied directly by Lean and the core, realized by controlled-clock CIB scheduling, and never delivered to Temporal; the Workflow derives the identical content-bound stimulus exclusively from committed core state after one durable timer. Full-server evidence covers Worker absence at due time, exact history, receipt reconciliation, replay, and a separately bundled sleep-bypass mutation. Time skipping is a separately named optional calibration lane.

The [Intermediate Catch Message contract](capsules/INTERMEDIATE-CATCH-MESSAGE-SPEC.md) is evidence-closed as a draft. Exact BPMN source admission resolves one MessageEventDefinition through one Interface Operation to the same payload-free input Message and lowers it to `awaitMessage` with Catch Event identity plus the complete channel. Lean and TypeScript own subscription activation, exact identity/channel consumption, pre-activation/wrong/stale refusal, one-consumption behavior, `openMessageSubscriptions`, the delivery interaction, and four-kind element-sorted wait projection. Both Message/User Task orders pass generic graph/profile admission and the targeted closure/resumability gate. Temporal realizes delivery through a Signal plus durable result Query/receipt ledger, distinguishes malformed input, command-identity conflict, and semantic refusal, survives Worker absence, requires exact Signal history, and replays both orders. CIB is absent from the Message target set and all fourteen retained CIB projections carry an executable-guarded empty Message collection.

The [ordinary embedded Sub-Process completion contract](capsules/EMBEDDED-SUBPROCESS-COMPLETION-SPEC.md) is evidence-closed as a draft. Source admission flattens one non-event child scope into checked definition ownership, rejects cross-scope Flow and Event Sub-Process shapes, and lowers the child Start to an entry place rather than a second initiation. Both pure implementations preserve the independent child wait set, refuse premature child completion, complete only after exact owned quiescence, emit one outer continuation, and complete the root separately. Four answer-free schedules cover both child orders and stale completion before and after scope exit. Pinned CIB `2.2.0`, Lean, the core, and Temporal agree at the public boundary under `CIB-AGR-0007`.

The [Service Task effect spec](capsules/SERVICE-TASK-EFFECT-SPEC.md) is evidence-closed as a draft. Exact namespace-aware source admission maps the paired source binding to a profile-registered neutral protocol/operation descriptor in the checked Service Task and lowers it to `awaitEffect`; Lean and the pure TypeScript core implement effect occurrence, structured intent, matching completion, full-identity and stale refusal, and the separate `openEffects` observation with no caller interaction. Lean independently checks only neutral graph-to-program lowering, not the raw Camunda-to-neutral profile translation. The shared wire contract uses one occurrence shape across tasks, timers, and effects. The semantic core projects the explicit definition-field group plus occurrence and descriptor from admitted program data and committed intent. The adapter renders domain-separated transport and completion-command digests and schedules one non-local Activity exclusively from that material. Evidence covers plain success, fail-after-mutation reconciliation, cross-instance separation, omission collisions, host-identity over-inclusion, Worker replacement, typed exhaustion with unchanged committed intent, durable history, replay, Activity bypass, ordinary CIB execution, raw retry facts, content-bound retained evidence, and the complete differential matrix. CIB's effect wait remains adapter-decided and CIB does not claim the project transport key or a semantic effect-in-flight state.

The [CreateDocument data and mapping spec](capsules/CREATE-DOCUMENT-DATA-SPEC.md) is evidence-closed as a draft for the project-authored equivalent fixture and exact external-source admission boundary. Exact source/profile admission retains the raw binding as profile evidence and maps it to the neutral Activity/mapped-success descriptor; the checked graph retains the generic mapping names and normalized bodies. Lean and TypeScript independently check and execute the neutral lowering, one literal string input, committed effect arguments, a closed one-string local result patch, deterministic output mapping, local cleanup, and canonical Process variables; neither independently derives the Camunda source mapping. The [scoped runtime data spec](capsules/SCOPED-DATA-SPEC.md) replaces the former flat Process-variable field atomically with one explicit Process scope plus private Activity-local scopes keyed by complete effect occurrence. Its missing/duplicate/cross-owner, non-observability, closure-limit, and enabledness guards leave every canonical trace and shared wire artifact unchanged. The adapter content-binds both arguments and result, derives the Activity request from committed intent, preserves the mapping and replacement runtime state under retry and Worker replacement, replays both schedules, and rejects an Activity bypass through durable history. Fresh CIB Seven `2.0.0` evidence observes the mapped delegate input, local output, synchronous completion, and final Process variable. Its CIB relation is a host-final-state check, not an independent effect-in-flight or scoped-runtime account and not a failure/rollback equivalence claim.

The [typed BPMN Error and interrupting boundary-error spec](capsules/BOUNDARY-ERROR-SPEC.md) is evidence-closed as a draft. Exact checked source and lowering retain one attached exact-code route without adding an Error opcode. Lean and TypeScript implement a successful typed business-error result, discriminated null, exact-code matching, normal-route abandonment, profile-scoped patch → mapping → cleanup → boundary ordering, state-preserving refusal, and a checked normal-path non-law. Temporal derives the result command only from committed intent after a successful Activity result, distinguishes infrastructure failure and unmatched business code as adapter failures, drives the exposed boundary User Task, verifies Activity history, replays the primary execution, and rejects an Activity bypass. Packaged CIB Seven `2.0.0` supplies the separately classified synchronous host relation, target-shaped null mapping, content-bound evidence, and mapping-free unmatched calibration; it is the source of `BERROR-CIBMAP-01`, not independent corroboration.

The implementation is intentionally layered even where a target-shaped vertical witness crosses boundaries. The BPMN requirement ledger is the primary engine-coverage view and now exposes thirteen Process Execution mechanism families with dependencies and narrower closed slices; the CIB–BPMN register owns only classified profile additions and observations; the A12 ledger owns downstream adoption. `CreateDocument` and the typed boundary-error slice are first-round seam evidence, not a model-by-model compiler architecture. There is no A12 adapter package, Java Worker, façade bridge, or runtime dependency in this repository.

The independently reviewed [compositional BPMN admission proposal](COMPOSITIONAL-BPMN-ADMISSION-PROPOSAL.md) was superseded as a staged production-admission programme on 2026-07-30. Its completed Stages 1 through 3b remain accepted, frozen experiments: ordering and bounded selector correspondence; executable graph validation and stronger standalone `programWellFormed`; graph-derived tail and whole-process decomposition; saturation-certified path completeness and declarative acyclicity; and graph-derived single- and two-token frontier localization. Stage 3b closes at 298 new or materially rewritten nonblank Lean lines against commit `362f91f`, excluding 11 byte-identical relocated lines. The default verification gate builds and executes the experiment, and infrastructure guards lock theorem reachability plus the retained Boolean discriminators. No law states that either two-token target fires or that exactly two operations are enabled. Closure soundness, commutation, closure fuel stability, the four-step closure theorem, direct Timer/effect source clauses, source-to-program correspondence, and widened production source admission remain absent. The production closure-limit and multiple-enabledness safeguards now belong to the targeted per-capsule preservation gate.

The production semantic realization remains one pure TypeScript core hosted by the TypeScript Temporal Workflow. The [dual semantic-core account](DUAL-SEMANTIC-CORE-ARCHITECTURE-PROPOSAL.md) is rejected; there is no Java semantic core, Java Workflow, or Java-core experiment. JVM integration is an approved architecture boundary for future Activity Workers and client façades, not an implemented surface.

The dependency-free [Simple Boolean expression language](SIMPLE-BOOLEAN-EXPRESSION-DECISION.md) and [Exclusive Gateway condition specification](capsules/EXCLUSIVE-GATEWAY-CONDITION-SPEC.md) implement the standards-first conditional-routing slice. The explicit URI selects five total Boolean forms over complete Process-scope string/null bindings; omitted language remains BPMN's XPath default and is rejected. The checked graph retains exact bodies and declaration-ordered conditional/default Flow identities; Lean and TypeScript parse and evaluate independently; the generic `choose` transition consumes one token and produces exactly one selected route inside pure bounded closure. Temporal hosts, completes, and replays the selected User Task without an evaluator Activity, while a separately bundled route-substitution mutation exposes the wrong branch. The standards profile declares normative authority and no CIB result; the seventeen-case pipeline compares Lean, the core, and Temporal for this case. The [JUEL architecture](JUEL-EVALUATION-ARCHITECTURE-DECISION.md), exact CIB probes, and audited 38-artifact dependency graph remain a deferred CIB compatibility candidate; no JUEL dependency or Java evaluator module is adopted. The existing `MappingExpression.localVariable` arm remains only as a direct lookup for two exact admitted mapping tokens and must not grow into either expression language.

This is not a general BPMN engine, an OMG conformance result, or an immutable production CIB deployment/history compatibility baseline. Individual evidence-bound calibration profile artifacts may already be immutable under the narrower [profile-registry definition](../profiles/README.md).

## Implemented and absent surfaces

### Project foundation

#### Implemented

- Lean 4.31.0/Lake 5.0
- Node 24.18.0
- pnpm 11.18.0 with a repository-pinned CI-oriented local virtual-store projection, shared content-addressable store, exact wrapper-owned CLI selection that disables pnpm's recursive project-driven version switching, bounded wrapper regression execution, and ordinary/CI bare-wrapper guards
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
- enforced A12 boundary checks for source-license headers, dependency coordinates, exact external fixture bytes, external-checkout links, lower-layer bean identities, and the project-authored CreateDocument fixture provenance
- enforced implementation-surface reviewability through per-surface implemented/absent sections and a 120-word review-unit ceiling
- commit-bounded nonblank code/document capsule-cost measurement with a parser self-test and explicit unknown treatment for missing historical baselines
- dependency-free source-hygiene enforcement over tracked and pending Lean/TypeScript/JavaScript/Java source with a 600-nonblank-line review target, 1000-line hard ceiling, exact import-only Lean umbrellas, allowlist-free rejection of every hand-written `.js`/`.cjs`/`.mjs` module, and no current reviewed exceptions
- responsibility-owned Lean semantics, Temporal lifecycle, differential pipeline, contract verification, and CIB runner collaborators
- source-synchronized walkthrough
- focused and full gates
- GitHub Actions verification on Ubuntu and macOS with the warm feedback budget unchanged

#### Explicitly absent

- Release packaging, published libraries, production deployment
- automatic proof of semantic cohesion or function/class responsibility
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
- seventeen answer-free target scenarios with CIB evidence required only by declared CIB target sets
- produced checked-process and Semantic Process artifacts
- nullable checked conditions, one typed Simple Boolean expression union, and declaration-ordered `choose` candidates
- one definition-scope tree with exact node/Sequence-Flow and operation/control-place ownership, plus one shared occurrence-ID shape reused by User Tasks, Message subscriptions, timers, and effects
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
- the draft standards profiles `bpmn-2.0.2-simple-boolean-exclusive-gateway-draft`, `bpmn-2.0.2-timer-user-task-composition-draft`, and `bpmn-2.0.2-intermediate-catch-message-draft` instead declare BPMN 2.0.2 normative authority and explicitly have no CIB oracle
- draft CIB-backed `cibseven-2.2.0-embedded-subprocess-completion-draft` pins the one-level ordinary completion account and `CIB-AGR-0007`
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

- one rooted checked definition-scope tree with exact node and Sequence Flow ownership
- one rooted Semantic Process definition-scope tree with exact operation and control-place ownership
- one root runtime occurrence plus one level of parent-linked child occurrence identity
- scope-owned tokens and User Task, Message, Timer, and effect waits
- explicit `enterScope`, `reachNoneEnd`, and quiescent `completeScope` operations
- child None Start as entry structure rather than a second Process initiation
- exact child completion only after the owned region has no token, wait, or child occurrence
- child removal plus one parent-owned continuation and separate root completion
- missing, duplicate, cross-owner, premature-completion, and stranded-child guards

#### Explicitly absent

- arbitrary or repeated nesting, loops that reactivate one definition scope, and concurrent occurrences of the same child definition
- Event Sub-Processes, Call Activities, Transactions, compensation, cancellation, and exceptional propagation
- public projection of definition-scope or runtime-scope identity

### Semantic Process IL

#### Implemented

- Implemented draft spec for a checked source-facing graph
- current JSON Schemas and boundary validators for typed `initiate`, `enterScope`, `awaitUserTask`, `awaitTimer`, `awaitMessage`, `awaitEffect`, `duplicate`, `synchronize`, `choose`, `reachNoneEnd`, and `completeScope` operations
- `choose` carries exactly two declaration-ordered typed Simple Boolean candidates and one distinct default
- `awaitEffect` carries typed input/output mappings plus an optional exact-code boundary route across empty, CreateDocument, and boundary-error contracts
- deterministic TypeScript lowerer and independent Lean decoder/lowerer preserve admitted scope ownership, condition, mapping, route, and exact source data
- independent sequential, bounded-parallel, exact-timer, Timer/User Task composition, direct payload-free Message subscription, payload-free effect, CreateDocument data, boundary-error, Simple Boolean conditional evaluation, and ordinary embedded Sub-Process completion
- generic Lean relation/evaluator including choice, effect-completion, and operation-step soundness, laws, and non-laws
- separately gated frozen checked-source experiment

#### Explicitly absent

- Adopted checked-source operational relation and full observational preservation proof
- general mapping expression, JUEL evaluation request or receipt, general condition language/cardinality, variable, effect payload/fault, boundary handler, or propagation semantics

### BPMN source

#### Implemented

- Exact byte capture and SHA-256
- UTF-8/security preflight
- private `bpmn-moddle@10.0.0` import
- warning/reference-loss rejection
- bounded compilers for the sequential User Task, balanced parallel, exact `PT1S` timer, profile-parameterized finite acyclic Timer/User Task composition, direct payload-free Intermediate Catch Message in both Message/User Task orders, payload-free Service Task, exact A12 CreateDocument shape, exact A12-shaped boundary Error, exact two-condition-plus-default Simple Boolean Exclusive Gateway, and one-level ordinary embedded Sub-Process completion
- reusable checked-source scope ownership, reference, arity, scope-local reachability, co-reachability, and acyclicity validation separated from profile mechanism/cardinality capability
- explicit expression-language admission, strict five-form parsing, exact checked-body retention, and process-level Sequence Flow declaration order independent of gateway reference order
- exact source/profile admission preserves raw CIB bindings as evidence and maps them to registered neutral effect identities while checked graphs retain generic conditions, mappings, route/reference metadata, resolved Message channels, and names
- BPMNDI/modeler metadata remains outside semantics
- registered CreateDocument checkout and project-authored fixtures pass
- wrong sigils, method/property expressions, implicit XPath, wrong or per-expression language, invalid Simple Boolean syntax, conditional default, unsupported executable attributes/elements, altered parameters/mappings, false interruption, attachment/code drift, extra Error handlers, Event Sub-Processes, and cross-scope Sequence Flows reject

#### Explicitly absent

- General BPMN compiler, arbitrary graph admission or scope nesting, general FormalExpression/JUEL/XPath, other Exclusive Gateway topology/cardinality, Service Task/data/error bindings beyond the approved exact shapes, timer forms beyond exact `PT1S`, Message payload/key/global correlation/throw/flow or other Message Event loci, synchronous parser CPU isolation, non-UTF-8 decoder, source locations, general extension semantics, DI-preserving export, complete CMOF binding, deployment store

### Lean

#### Implemented

- Project-owned strict JSON parser with duplicate-key, unpaired-surrogate, and safe-integer rejection
- strict checked-graph, Semantic Process, and external scenario decoders with exact-key and closed-variant rejection
- executable JSON edge-case and Unicode scalar-order locks
- independent checked-graph validation with scope-tree/ownership plus empty/flowless/dangling regressions and standalone program graph validation for exact ownership, producer/consumer shape, reachability, co-reachability, and acyclicity
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
- exact Service Task lowering and success trace
- exact start-prefix projection of one structured effect intent
- quantified full effect-identity mismatch rejection with state preservation
- exact CreateDocument literal arguments, successful mapping trace, output-only Process target theorem, quantified invalid-patch refusal, missing/extra/duplicate examples, and direct-local-patch-to-Process-scope non-law
- boundary-error exact lowering/trace, declarative business-error soundness, exact null mapping, message noninterference, quantified identity/code/patch refusal, and normal-success non-law
- independent Simple Boolean parser/evaluator, checked-body-to-typed-expression lowering, declaration-ordered `choose` relation/evaluator soundness, second-true and all-false/default witnesses, `first_true_ignores_tail`, and `selected_output_owned`
- ordinary embedded Sub-Process exact lowering, entry/two-child-wait prefix, both completion orders, sibling survival, quiescent child completion, outer continuation, root completion, generic nonquiescent-completion refusal, and stranded-child non-resumability
- generic seventeen-scenario result emitter that consumes and echoes the same admitted scenario documents
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
- general or repeated scopes, variable types, effect faults, propagated Error handlers, expression languages, or exceptional propagation
- TypeScript or Temporal correspondence proof
- arbitrary BPMN XML parsing

### TypeScript semantic core

#### Implemented

- Dependency-free Semantic Process contracts
- shared safe-string admission and Unicode scalar-value comparator
- profile-registered opaque effect protocol/operation identities with no Camunda namespace, A12 bean, or target-model discriminator
- topology-independent scoped structural program validation plus exact profile definition-scope/operation-kind cardinality for the sequential, balanced two-branch, exact timer, Timer/User Task composition, direct Message subscription, payload-free effect, CreateDocument, boundary-error, Simple Boolean conditional-choice, and ordinary embedded Sub-Process surfaces
- pure enum-based execution of `initiate`, `enterScope`, `awaitUserTask`, `awaitTimer`, `awaitMessage`, `awaitEffect`, `duplicate`, per-incoming-flow `synchronize`, declaration-ordered `choose`, `reachNoneEnd`, and `completeScope`
- operation-ID-stable internal closure independent of program collection order
- explicit scope occurrence ownership on flow-identified token multiplicity and sorted semantic task/Message-subscription/timer/effect occurrences
- active waits sorted by the contract’s semantic kind rank and then element ID, guarded against cross-kind identifier order
- parallel completion-order, excess-token, and non-law witnesses
- exact timer wait, deadline, firing, full mismatch, stale refusal, and `openTimers` projection
- exact Message wait, resolved channel, one-consumption delivery, full identity/channel/pre-activation/stale refusal, reverse mechanism order, `openMessageSubscriptions`, and delivery-interaction projection
- exact effect wait, structured protocol/operation/argument intent, matching completion, full mismatch and stale refusal, and separate `openEffects` projection with no caller interaction
- closed string/null mapping evaluator, exact success/error local-patch validation, Process output mapping, canonical variables, and direct-patch ownership discriminator
- exact-code business-error route with atomic patch → mapping → cleanup → boundary behavior, normal-route abandonment, message noninterference, and state-preserving refusal
- independent five-form Simple Boolean parser/evaluator with present/null/absent discrimination, first-true tail irrelevance, second-true/default routing, exact three-step closure, and condition-origin/cardinality rejection
- ordinary embedded Sub-Process entry, independent child waits, both completion orders, exact owned quiescence, one outer continuation, root completion, premature-completion refusal, and stranded-child non-resumability
- pure effect-transport material projection from admitted definition fields plus one committed `openEffects` entry without hashing or host identity
- adapter-facing current task/Message/timer projection, exact structural stimulus validation including safe integers and scalar strings, command identity, and same-stimulus comparison
- atomic exact-task Process-variable merge before outgoing closure, including create, replacement, unrelated-binding preservation, explicit null, and state-preserving refusal
- exact Process-start variable installation before internal closure, with canonical string/null bindings, fresh Process scope, no Activity-local scope, and state-preserving refusal
- incremental deploy/advance and full scenario evaluation
- executable internal-enabled-count and stable-state-resumability checks, including a stranded-token negative witness
- malformed topology rejection

#### Explicitly absent

- an ambiguity refusal matching Lean's `ambiguousInternalChoice`: the closure selector advances the lowest canonical operation ID without signalling an unresolved semantic choice, so agreement with Lean at the one admitted multiple-enabled state rests on the `isSortedById(operations)` admission requirement and on per-profile unreachability of every other such state
- I/O, byte-level parser, Temporal SDK, CIB dependency, JUEL/XPath/FEEL/script grammar or evaluation, conditional-evaluation receipts, general BPMN state model, raw source-binding interpretation, effect execution or transport digest, value kinds beyond string/null, general mapping expressions or scope nesting, general faults/Error propagation, timer forms or races beyond the exact capsule, semantically material nondeterministic scheduling, arbitrary graph execution

### CIB oracle

#### Implemented

- Distinct pinned CIB Seven `2.2.0` and `2.0.0` embedded runner profiles
- exact deploy/start/query/complete
- generated-task-to-semantic-occurrence mapping
- multiple distinct active task projection with semantic sorting and per-element wait multiplicity
- exact/wrong/sequential-stale, balanced A-then-B/B-then-A, live-sibling stale, exact timer, exact payload-free Service Task success, four ordinary embedded Sub-Process completion/stale schedules, exact synchronous CreateDocument, and exact synchronous boundary-error host witnesses
- controlled epoch clock
- raw Process-instance count, engine-clock, Process-variable, timer-job due date/executability, effect-job binding/retry, effect-execution, and mapping-execution observations
- engine-observed pre-due timer eligibility
- bounded engine-level stale-task rejection probe
- pinned `2.2.0` Process-start/User Task completion-data phase-zero probe over public runtime/task/history services, covering initial-variable visibility at the first task under `CIB-EXT-0006` plus create/overwrite/preserve merge, present null, continuation/final visibility, no-data preservation, and unknown/stale no-write controls under `CIB-EXT-0005`
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
- persistent release-specific JSON-lines batches
- compatible test methods share class-owned embedded engines with per-session zero-state checks, while distinct configurations remain isolated
- boundary-safe identity-based PVM diagnostic traversal
- timings and full cleanup

#### Explicitly absent

- Intermediate Catch Message execution, subscription identity, channel derivation, delivery, or compatibility evidence
- arbitrary nested Sub-Process, Event Sub-Process, or exceptional propagation evidence
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
- ordinary embedded Sub-Process execution entirely through core-owned scope state, both child completion orders, sibling survival after the first completion, exact outer continuation, Worker replacement, retained Update result, replay, and zero Signal/Timer/Activity/Child-Workflow/cancellation history
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
- harness-only Query reconciliation with durable Update, timer, Activity, and receipt facts
- replay and cleanup
- command-ID-only, Message-Signal-payload, timer-bypass, Activity-bypass, conditional-route-bypass, and child-scope-bypass mutation guards
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
- value kinds beyond string/null or general effect faults/Error propagation
- Activity heartbeats
- cancellation recovery and exceptional child-scope interruption or propagation
- timer forms/races/cancellation beyond the exact capsule
- Search Attributes
- Continue-As-New
- task inbox

### Differential pipeline

#### Implemented

- Seventeen answer-free cases with explicit target sets
- fourteen release-grouped ordinary CIB cases plus three standards-only cases and one raw-only `2.2.0` Service Task fail-once execution
- one generic Lean result emitter
- one core batch
- thirty-four isolated Temporal executions
- exact case-specific relations including parallel live-sibling stale rejection, exact timer firing, Timer/User Task composition, Simple Boolean first-true routing, payload-free Service Task success, CreateDocument typed-data success, typed boundary-error routing, and four ordinary embedded Sub-Process completion/stale schedules
- sequential stale three-way semantic agreement plus exact Temporal completion prefix and separate `processClosed`
- Simple Boolean exact Lean/core/Temporal agreement with CIB absent
- Timer/User Task exact Lean/core/Temporal agreement with CIB absent
- Intermediate Catch Message exact Lean/core/Temporal agreement with CIB absent
- ordinary embedded Sub-Process exact CIB/Lean/core/Temporal agreement under `CIB-AGR-0007`
- CreateDocument and boundary-error exact Lean/core/Temporal semantic agreement plus separate CIB synchronous-final host relations
- retained-CIB comparison only for declared CIB cases
- Query/Update/durable-timer/Activity evidence
- definition binding
- activation, initial-task, live-sibling, timer-deadline, Message-channel/Signal-payload, conditional-route, raw effect-binding, neutral effect-operation, final-variable, boundary-null, premature-scope-exit, and provenance mutations
- nineteen-history replay
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
- implemented bounded mechanisms cover sequential User Task lifecycle/refusal, per-incoming-flow parallel synchronization, one exact Simple Boolean divergent Exclusive Gateway, one exact Intermediate Catch Timer, one directly addressed payload-free Intermediate Catch Message subscription, bounded successful Service Task execution, bounded string/null input/output mapping, one exact-code attached interrupting Error route, and ordinary one-level embedded Sub-Process completion

#### Explicitly absent

- Line-by-line exhaustive Process Execution denominator, arbitrary compositional graph or nested-scope admission, broad Activity/Event/Gateway/scope/data coverage, percentage-complete claim, or conformance claim

## Current evidence

The [canonical CIB observation fidelity table](TESTING-SPEC.md#canonical-cib-observation-fidelity) classifies all eleven top-level `stateObservation` fields and every nested occurrence, wait, Message subscription, timer, effect, interaction, and variable field as `engine-observed`, `adapter-derived`, `adapter-decided`, or `not-claimed`; a schema-depth test prevents omissions. Five CIB-backed capsules own additional rule-level fidelity in [the User Task capsule](capsules/USER-TASK-INTERACTION-SPEC.md#oracle-evidence-fidelity), [the Timer capsule](capsules/INTERMEDIATE-CATCH-TIMER-SPEC.md#cib-fidelity-by-rule), [the Service Task capsule](capsules/SERVICE-TASK-EFFECT-SPEC.md#cib-fidelity-labels), [the CreateDocument capsule](capsules/CREATE-DOCUMENT-DATA-SPEC.md#cib-fidelity-labels), and [the boundary-error capsule](capsules/BOUNDARY-ERROR-SPEC.md#rule-to-evidence-matrix). The ordinary Sub-Process lane reuses the same public-task fidelity and records its schedule-level evidence in its rule matrix. The Message capsule classifies its complete CIB surface as `not-claimed`, and the verifier enforces the retained empty collection.

The complete prepared pipeline requires:

- exact agreement for `user-task-discovery-completion` and `user-task-wrong-activation`;
- exact CIB Seven/Lean/core semantic agreement for `user-task-stale-completion`, exact core/Temporal prefix agreement through completion, and separate adapter-owned `processClosed`;
- exact agreement for `parallel-fork-join-a-then-b` and `parallel-fork-join-b-then-a`, including the symmetric one-task intermediate projections;
- exact four-target rejection for `parallel-fork-join-stale-a-while-b-active` with B unchanged;
- exact four-target agreement for `intermediate-catch-timer-pt1s`, including one wait at deadline 1000, identical content-bound firing command observation, completed logical time 1000, and no caller-enabled interaction; in the CIB lane the deadline and completed logical time are `adapter-derived` per [the Timer capsule's fidelity rows](capsules/INTERMEDIATE-CATCH-TIMER-SPEC.md#cib-fidelity-by-rule): the runner writes the scenario's firing time into the controlled engine clock and the projector reads that clock back, while the engine-observed facts are the raw job due-date delta and the pre-due/due eligibility transition;
- exact Lean/core/Temporal agreement for `timer-user-task-composition`, including the Timer wait at deadline 1000, committed-state-derived durable firing, the later User Task wait and completion, live replay, typed pre-start host admission, and detection of a one-millisecond deadline mutation; CIB is explicitly absent because it does not establish the composition or structural-admission rule;
- exact Lean/core/Temporal agreement for `exclusive-gateway-simple-boolean-first-true`, including declaration-ordered first-true routing to `Task_First`, tail irrelevance, completion, replay, and detection of a `Task_Second` route substitution; CIB is explicitly absent because it does not execute the project language;
- exact Lean/core/Temporal agreement for `intermediate-catch-message`, including one complete Message subscription, wrong-channel and stale state-preserving refusal, exact one-consumption delivery, the later User Task, Signal result/receipt reconciliation, Worker absence, exact duplicate recovery, identity-conflict classification, replay, and detection of Message-channel and Signal-payload substitutions; CIB is explicitly absent because no Message compatibility claim was selected;
- exact four-target agreement for `embedded-subprocess-completion-a-then-b`, `embedded-subprocess-completion-b-then-a`, `embedded-subprocess-completion-stale-a-while-b-active`, and `embedded-subprocess-completion-stale-a-after-scope`, including the independent child wait set, sibling preservation, absence of the outer continuation before child quiescence, exact one outer continuation, root completion, Worker replacement, replay, and early-exit mutation detection under `CIB-AGR-0007`;
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
- nineteen fetched live histories replayed before server shutdown;
- clean CIB and Temporal teardown.

The complete pipeline remains subject to the 15-second warm and 45-second cold budgets. Exact latest measurements and commands belong in [PLAN.md](PLAN.md), not in this inventory.

## Nearest unsupported claim

The nearest selected engine claim is direct interrupting Error propagation from the implemented child-scope foundation: one exact-code Error End Event, one directly attached boundary catcher, regional child cancellation, and one outer recovery route. The retained [proposal](capsules/SUBPROCESS-ERROR-PROPAGATION-PROPOSAL.md) must be rebased on the implemented scope representation and returned for owner approval before semantic work. Arbitrary serial composition, arbitrary graph progress, repeated or nested scope activation, Event Sub-Processes, Message payload/key/global correlation, inclusive/event-based gateways, loops, multi-instance, compensation, and general Event semantics remain unsupported. Conditional routing remains limited to the exact Simple Boolean profile, and JUEL remains demand-driven, deferred, and separately classified.

The downstream adoption inventory remains in the [A12 Workflows compatibility ledger](research/A12-WORKFLOWS-COMPATIBILITY-LEDGER.md). The exact `2.0.0` target-profile projector admits one of 50 distinct exact-byte A12 Workflows models unchanged at the static source/lowering boundary, but the closed exact-model product count remains zero because the external EUPL-1.2 model and A12 Java delegate have not executed through a separately bounded adoption adapter. This is an A12 adoption gap, not the primary BPMN coverage measure. The active Simple Boolean language matches none of the retained A12 JUEL sources and claims zero adoption coverage. Read-only JUEL evaluation, capability-bearing JUEL, scripts, listeners, forms/assignment, message correlation, A12 façade adaptation, and engine-plugin behavior remain unimplemented with target-backed priority only where they force lower-layer work.

The cross-language wire-hardening prerequisite is closed: schemas cap every current integer at `9007199254740991`, canonical identifiers use exact Unicode scalar-value ordering with no normalization, strict byte readers reject duplicate decoded keys and unpaired surrogates, and the TypeScript, Lean, and CIB boundary guards exercise their applicable representations. `awaitEffect` is part of the checked program, pure semantic accounts, and production Temporal refinement under the exact bounded specification.

The strongest unresolved proof claim remains full observational checked-source-to-program-run preservation. The [bounded experiment](experiments/CHECKED-SOURCE-RELATION-EXPERIMENT.md) retains a provisional direct account, a renamed positional-lowering discriminator, and accepted bounded structural/frontier results, but no run theorem. Production work now uses the targeted preservation boundary in the [Semantic Process IL spec](SEMANTIC-PROCESS-IL-SPEC.md#lean-specification-and-proof-obligations): each material admission or representation capsule protects its exact source-to-result risk, while the general theorem reopens only when a second capsule needs the same proposition or a targeted proof cannot remain local.
