# Implementation map

This document is the sole detailed owner of current implementation, proof, evidence, and absence status. It describes the repository now, not milestone history. Semantic meaning, laws, and per-family exclusions belong to the owning [capsule](capsules/README.md); gate and evidence requirements to [TESTING-SPEC.md](TESTING-SPEC.md); exact profiles, scenarios, targets, and mutations to the guarded artifact catalogs; latest measurements and the resume point to [PLAN.md](PLAN.md). A fact recoverable from one of those owners does not belong here.

## Current claim

**Two products, one end-to-end implemented.** The BPMN execution engine executes a bounded but broad slice of BPMN 2.0.2 across twenty closed semantic capsules. The [BPM platform](BPM-PLATFORM-PROPOSAL.md) has an owner-approved contract, a tracked modular-monolith architecture, executable product and dependency guards, and an HTTP-only M1 definition workspace over its public definition API, but no complete start-to-result product capability; its absences are recorded under [BPM platform](#bpm-platform) below.

**What the engine does.** Exact BPMN bytes admit through a checked project-owned graph to the [Semantic Process IL](SEMANTIC-PROCESS-IL-SPEC.md), which a Lean reference interpreter and an independently written TypeScript semantic core each evaluate, and which a Temporal adapter hosts durably. Closed families are Parallel fork/join, Exclusive Gateway over a project-owned Boolean expression language, Inclusive Gateway, Event-Based Gateway, Call Activity, embedded Sub-Process completion and Error propagation, Intermediate Catch Timer and Message, Message-addressed Receive Task, Service Task effects, scoped runtime data, User Task start and completion data, and three boundary-Timer loci including one non-interrupting. Each capsule owns its own meaning and exclusions; this document owns only their status.

**What it does not do.** One generic standards profile admits the complete selected notation set and no other does. `bpmn-2.0.2-user-task-preserved-notation-draft` retains Diagram Interchange, pools, lanes, artifacts, and documentation without executing them, under [the preserve-only admission specification](PRESERVE-ONLY-ADMISSION-SPEC.md); every other standards profile rejects that set through an exact key allowlist. The two product-neutral mapped Service Task profiles may consume one data-only source overlay, but it can name only an existing profile-owned effect descriptor and exact inert expanded-name loci; it adds no engine operation or source reader.

Retained notation reaches no public observation and has no query surface. Refusals about the document or the checked graph name no element. The whole BPMN data family rejects everywhere. Admission is acyclic. Variables are string or null. There is no cancellation beyond the direct-parent regional case, no incidents, and no published transition record or token position.

**The evidence model, and its one shared-origin qualifier.** Registered answer-free scenarios run through Lean, the TypeScript core, Temporal, and selected pinned CIB Seven lanes; every case carries a seeded semantic mutation that must produce a disagreement, and retained CIB observations are content-bound. Neutral inputs stay physically separate from expected results.

Every multi-target agreement claim carries the same qualifier. The TypeScript compiler in `@bpmn-lean/bpmn-source` is the sole producer of the checked graph and program that Lean, the core, and the adapter all consume. Lean independently recomputes graph-to-program lowering and rejects inequality before evaluation, but it has no BPMN XML parser, so a defect in XML-to-checked-graph translation propagates identically into all three. Pinned CIB Seven separates that defect only for a declared CIB profile whose exact source it executes; standards-only profiles have no such oracle and say so.

**Product surface.** One driver answers the published `enabledInteractions` set for every registered profile under the [Temporal engine runner specification](RUNNABLE-TEMPORAL-MVP-SPEC.md), taking occurrence identity from that publication. Admission and configuration are checked for every registered profile without a Temporal service. Live durable execution is checked for one example per distinct host interaction mechanism, and is **absent by design** for profiles that reuse an already-evidenced mechanism, under the vertical-slice limit. No product lane is an independent semantic evidence lane, because it composes the already-evidenced compiler, core, Workflow, and client.

**Layering.** [The BPMN requirement ledger](BPMN-REQUIREMENT-LEDGER.md) is the primary engine-coverage view; [the CIB–BPMN register](CIB-BPMN-RELATION-REGISTER.md) owns classified profile additions; [the A12 ledger](research/A12-WORKFLOWS-COMPATIBILITY-LEDGER.md) owns downstream adoption. The three denominators never combine. There is no A12 adapter package, Java Worker, facade bridge, Java semantic core, or JUEL dependency in this repository; [PROJECT-DESIGN.md](PROJECT-DESIGN.md#cib-compatibility-and-polyglot-effect-execution) owns the reopen trigger for a second core.

**A12 product boundary.** The [implemented boundary specification](A12-ADD-ON-BOUNDARY-SPEC.md) contains no A12-specific production decision. The neutral mapped-boundary compiler output passes the shared schemas and exact checked-to-IL BPMN Error route verification, including a coherently renamed route place. The product scan covers `contracts/`, the root Lean umbrella, typed string values, typed BPMN Error messages, and the script catalog import closure through one inventory validated against immutable baseline `02330ad`. The frozen manifest verifies exact baseline bytes and derives the original A12-aware validator, projector, and effect-projection closure from fixed baseline roots.

A separate preservation oracle keeps the payload-free Service Task profile and BPMN bytes exact, permits only `sourceOverlay: null` in its scenario, and permits only the corresponding evidence-digest rebinding. Same-reviewer audit approved closure correction `8d6ea1a`; the active specification and [future adoption handoff](../adoption/a12/current/README.md#resume-point-for-a-future-a12-add-on) own the stable boundary and resumption path.

**This is not** a general BPMN engine, an OMG conformance result, or a production CIB deployment or history compatibility baseline. Individual evidence-bound calibration profile artifacts may already be immutable under the narrower [profile-registry definition](../profiles/README.md).

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
- role-named proposal/specification documents and their governed lifecycle
- enforced documentation index, filename-role, and local-link guards
- enforced directory-independent cold-review receipts for active material proposals and post-policy specifications under `docs/`, with Status-section approval detection, object-database and `HEAD`-ancestry validation, an immutable-baseline grandfather set, prospective same-model/same-effort `fork-turns-none` isolation, exact same-reviewer warm correction and guarded closure continuity, one equal-target combined checkpoint/closure mode for genuinely single-lane atomic closure, stage-specific focus, static-findings-first gate deferral, deterministic neutral review packets, historical receipt preservation, and graduation blocking
- executable Status, suffixless-singleton, registry, file-link, and heading-anchor documentation discipline; the supplied architecture handoff's current release/readiness obligations have active owners while the original brief and two residual proposals are archived provenance
- the non-redistributed OMG BPMN 2.0.2 corpus at external sibling `../oss/omg-bpmn-2.0.2`, with overrideable XSD/CMOF consumer paths, official-source-only atomic fetch, a 15-file tracked hash manifest, and an offline verifier; the optional Markdown/image conversion remains a non-authoritative cache
- portable external-input setup through a 14-repository/four-submodule canonical-remote/commit/tag/gitlink lock plus the per-file OMG digest manifest, separate `verify`/`adoption`/`research`/`all` provisioning scopes, a read-only doctor that hashes every dependency owner and inventories every registered cache root, A12-free CI provisioning, custom-root support, and fail-closed CMOF, MIWG, breadth, and selected adoption lanes; no contributor machine is presumed to contain `../oss`
- initial A12 boundary checks over product-source and built-in-artifact inventories, optional-root imports, source-license headers, dependency coordinates, exact external fixture bytes, external-checkout links, and the frozen legacy product-decision manifest, plus an explicit optional exact-source adoption gate outside complete MIT engine verification
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

### BPM platform

#### Implemented

- The concrete modular-monolith architecture and decision register in [ARCHITECTURE.md](ARCHITECTURE.md)
- Tracked ownership scaffolds for the server and web composition roots, public contracts, engine gateway, artifact store, definitions module, UI kit, production Workers, and the M1 showcase
- A narrow `@bpmn-lean/engine-api` compilation entry point plus `@bpmn-lean/platform-engine-gateway`, projecting source identity, definition identity, and located admission diagnostics without exposing the checked graph or Semantic Process program
- `@bpmn-lean/platform-artifact-store`, which verifies exact SHA-256 identity, publishes caller-snapshotted bytes atomically without replacement, detects occupied-path corruption, and returns defensive copies
- `@bpmn-lean/platform-contracts` with closed deeply immutable M1 definition transport types, strict unknown decoders, opaque engine diagnostics, and safe versioned route construction
- `@bpmn-lean/platform-definitions`, which snapshots deployment inputs before its first await, persists only admitted exact source, allocates durable process-local version ordinals through SQLite `BEGIN IMMEDIATE`, lists current and historical versions, and fails explicitly when metadata references missing content
- A Fetch-compatible definitions route contribution with closed raw-XML deployment input, claimed and streamed byte ceilings, producer-mutation-resistant chunk capture, public-only accepted/rejected projections, exact version/source reads, strict path and method validation, and generic internal failures
- `@bpmn-lean/platform-server`, a Node HTTP adapter with no external transport library and a modular-monolith composition root with configured request authority, streaming transport, ordered route dispatch, closed errors, local environment configuration, and idempotent socket/SQLite lifecycle
- An executable product-boundary guard that discovers tracked and pending source plus package manifests, resolves package aliases and subpaths to owners, fails closed on malformed or duplicate identities, and carries planted violations for every guarded dependency class
- An executable platform dependency policy that traverses the installed reachable production graph through workspace, direct, transitive, optional, and required-peer edges; fails closed on unresolved or contradictory identities; and holds the exact 23-package reachable production graph to MIT, Apache-2.0, ISC, and one identity-scoped bpmn.io license exception
- The HTTP-only `@bpmn-lean/platform-web` React 19.2.8 definition workspace, with exact upload, strict public response decoding, accepted and rejected diagnostics, catalog and version browsing, digest/length/ETag-verified exact-source retrieval, and no server/module/foundation import
- The owner-approved `bpmn-js` 18.22.1 viewer-only adapter, whose exact non-standard license text is hash-bound to its package identity, copied into the static distribution, and accompanied by an unchanged visible bpmn.io attribution link
- Development-only Vite 7.3.6 and React declaration packages for the static build and strict type gate; no build tool enters the reachable production graph
- Development-only Playwright 1.62.1 browser acceptance over its pinned headless Chromium, creating unseen exact BPMN bytes at runtime and checking admitted version 1, changed version 2, exact-source `bpmn-js` rendering and attribution, plus located rejection without version advancement; CI provisions and runs this required lane on Linux without adding any production dependency
- A separate strict no-emit platform harness and generated-output import guard, with planted clean-checkout counterexamples, so the composed M1 gate runs in CI before the platform-independent engine gate without making `verify.sh` build the platform tree

#### Explicitly absent

- The narrowed start boundary and executable M1 showcase
- the transition-record projection, every read model, and cross-instance discovery
- task list, task interaction and form rendering, operations and monitoring console, incident handling and retry, execution history, and mining views
- identity and authorization
- the platform component kit, routing, and the owner-selected `react-aria-components` and three TanStack packages; the M1 definition workspace uses plain CSS and no client state or routing dependency
- the cross-product projection agreement test that [PROJECT-DESIGN.md](PROJECT-DESIGN.md#one-repository-for-products-1-and-2) obligates; internal platform and cross-product import directions are guarded
- Narrowed start, observe, and submit-command engine entry points. Compilation is narrowed; `packages/temporal-adapter` still re-exports harness material alongside its client surface and is not a permitted platform dependency
- the deferred JUEL evaluator implementation under its product-owned `platform/workers/juel-evaluator/` location
- the two engine changes the [BPM platform proposal](BPM-PLATFORM-PROPOSAL.md#the-engine-boundary) records as prerequisites: publicly recoverable transitions and token positions, and a profile admission capability plus public projection for User Task assignment and form metadata

### A12 Workflows downstream adoption

#### Implemented

- Defined `release/2025.06` denominator of 62 physical and 50 distinct exact-byte BPMN models
- namespace-aware element/extension/expression census
- production delegate, listener, plugin, REST/JMS façade, and downstream-template inventory
- bounded CIB Seven `2.0.0`/`2.2.0` assessment
- a frozen legacy generation at immutable target `02330ad0f980a5fc282cc0aa93600a9632b86c3e`, manifest-bound outside product registries with its A12-specific import and catalog dependency closure derived from that target
- distinct current overlay-aware adoption scenarios, project-authored fixtures, overlay artifacts, and CIB evidence accepted by current schemas but absent from every product catalog
- optional exact external `CreateDocument.bpmn` static compilation through the product-neutral mapped-success profile and current data-only overlay, plus exact external boundary-Error source-shape calibration
- a preservation oracle that executes the immutable baseline tooling in an isolated export and compares its selected legacy/current checked graphs, Semantic Process programs, runtime results, and CIB evidence bodies outside the approved profile/overlay identity translation, plus a separate byte oracle for the payload-free Service Task's exact bounded wire-only changes
- two completed target-shaped legacy feasibility slices retained as adoption evidence rather than product implementation

#### Explicitly absent

- A12 adoption adapter/package
- production A12 add-on, overlay registry, handlers, migration, or distribution
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

- One structural schema file per semantic profile, source overlay, scenario, canonical result, CIB evidence, checked BPMN graph, and Semantic Process program
- stable document kinds
- semantic profile/source/compiler identity plus required nullable source-overlay identity in scenarios, checked graphs, Semantic Process programs, effect transport, and completed-process receipts
- exact scenario/profile/source-overlay content binding
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

- Every registered profile is a guarded artifact with exact authority, selected features, observation boundary, exclusions, environment, and reviewed CIB relationship IDs where applicable
- CIB-backed profiles pin exact oracle revisions and content-bound retained evidence; standards-only profiles declare no CIB execution target
- definition-scope and operation-kind cardinalities are checked per profile, separately from topology-independent graph validation
- immutable CIB artifact status freezes only evidence calibration, not a production deployment or history baseline

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
- `awaitEffect` carries typed input/output mappings plus an optional exact-code boundary route across payload-free, mapped-success, and mapped-boundary-Error contracts
- deterministic TypeScript lowerer and independent Lean decoder/lowerer preserve admitted scope ownership, condition, mapping, route, and exact source data
- independent sequential, bounded-parallel, exact-timer, Timer/User Task composition, operation-addressed Intermediate Catch Message and direct-Message Receive Task subscriptions, payload-free effect, mapped-success Service Task, mapped-boundary-Error Service Task, Simple Boolean conditional evaluation, ordinary embedded Sub-Process completion, direct-parent Sub-Process Error propagation, and bounded called-Process invocation/return
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
- bounded compilers for the sequential User Task, balanced parallel, exact `PT1S` timer, profile-parameterized finite acyclic Timer/User Task composition, operation-addressed payload-free Intermediate Catch Message in both Message/User Task orders, one direct-Message payload-free Receive Task, one exact operation-addressed Message-versus-`PT1S` Event-Based Gateway configuration, payload-free Service Task, bounded mapped-success and mapped-boundary-Error Service Task shapes, exact two-condition-plus-default Simple Boolean Exclusive Gateway, one structured two-condition-plus-default Inclusive Gateway split/direct-User-Task/join region, one-level ordinary embedded Sub-Process completion, one direct exact-code Sub-Process Error-propagation shape, and one exact namespace-qualified in-document called Process
- reusable checked-source scope ownership, reference, arity, scope-local reachability, co-reachability, and acyclicity validation separated from profile mechanism/cardinality capability
- explicit expression-language admission, strict five-form parsing, exact checked-body retention, and process-level Sequence Flow declaration order independent of gateway reference order
- exact source/profile admission maps built-in or overlay-supplied source bindings to profile-owned neutral effect descriptors while checked graphs retain only generic conditions, mappings, route/reference metadata, resolved Message channels, names, and source-overlay identity
- BPMNDI/modeler metadata remains outside semantics
- one preserve-enabled profile classifies parsed material three ways through [a closed recursive classifier](../packages/bpmn-source/src/preserved-element-classification.ts): a container is preserved only when every descendant is, references are excluded from the walk so a preserved shape may point at an executed element, and the source reaches its twin's checked graph and program once exact-source identity is normalized away
- one closed [compilation dispatch registry](../packages/bpmn-source/src/compilation-dispatch.ts) pairs the generic fallback, two product-neutral mapped Service Task profiles, and the Call Activity profile with their engine-owned readers and mandatory admission policies; a registry-derived complete-result oracle covers every accepted and adversarial path
- every foreign attribute rejects on every dispatch path unless its profile exempts that element's type; every resolved reference must point at its property's declared type
- classification refusals in the generic compiler and all three selected-shape readers name their element through [one locating owner](../packages/bpmn-source/src/admission-diagnostics.ts): nullable `id`, `$type`, containment path, named property or attribute, and the missing capability; unsupported own properties on selected executed flow elements are classified before projection through [one closed profile/type key inventory](../packages/bpmn-source/src/projected-flow-element-keys.ts), collected across loci, deduplicated, and ordered by path numerically. Parser warnings keep that record in parse order
- `xsi:type` is admitted as **parser-consumed**, selecting the resolved element type every projector then judges; `xsi:schemaLocation` and `xsi:noNamespaceSchemaLocation` are content-free schema hints. Each requires a prefix resolved from the document's own binding, and `xsi:nil` rejects because it empties content
- the optional adoption gate compiles the exact external CreateDocument source through a data-only overlay and compares both current adoption fixtures with the frozen baseline generation
- wrong sigils, method/property expressions, implicit XPath, wrong or per-expression language, invalid Simple Boolean syntax, conditional default, unsupported executable attributes/elements, altered parameters/mappings, false interruption, attachment/code drift, missing/catch-all/nonmatching/extra/non-direct Error handlers, Event Sub-Processes, and cross-scope Sequence Flows reject
- malformed, unprefixed, extra-colon, unknown-prefix, foreign-namespace, unresolved, self, and non-Process Call targets reject; declaration permutation is canonical and the called binding follows the QName rather than a fixture constant

#### Explicitly absent

- General BPMN compiler, arbitrary graph admission or scope nesting, general FormalExpression/JUEL/XPath, other Exclusive Gateway topology/cardinality, Service Task/data/error bindings beyond the approved exact shapes, catch-all/multi-handler/ancestor Error search, timer forms beyond exact `PT1S`, addressless/operation-addressed/instantiating/data-bearing Receive Task, Message payload/key/global correlation/throw/flow or other Message Event loci, external/imported/deployed Call targets, Global Tasks, Call data/mapping/version/tenant/recursion/repetition, synchronous parser CPU isolation, non-UTF-8 decoder, source locations, general extension semantics, DI-preserving export, complete CMOF binding, deployment store
- An element on refusals over the document or checked graph, on unsupported values of consumed keys, or on nested event-definition and mapping-child failures that have no separately reviewed inventory. Those remain `unsupportedModel` records with `element: null`. Preserved material is retained only in the exact source bytes, with no query surface or public projection
- The whole BPMN data family, and foreign content at every undeclared locus. A mapped Service Task overlay may declare only exact inert expanded-name/element-type pairs; unconsumed attributes, wildcards, and whole-type exemptions reject

### Lean

#### Implemented

- Project-owned strict JSON parser with duplicate-key, unpaired-surrogate, and safe-integer rejection
- strict checked-graph, Semantic Process, and external scenario decoders with exact-key and closed-variant rejection
- executable JSON edge-case and Unicode scalar-order locks
- separate checked-process admission, Semantic Process validation, cross-artifact binding, canonical lowering, and exact lowering-equality owners
- generic scope-owned token, occurrence, wait, selected-branch, called-Process, and scoped-variable runtime with canonical public projection
- declarative `OperationStep`/`ProgramStep` and `EffectCompletionStep`, executable transitions, and evaluator soundness at each closed capsule's declared proof boundary
- independent decoding, lowering, execution traces, refusal or preservation facts, and non-laws for every closed family named in [the current claim](#current-claim); the three boundary-Timer proof boundaries remain explicit in their sections below
- bounded internal closure for one enabled operation or the exact admitted two-task pair, rejecting every other multiple-enabled shape
- one catalog-driven result emitter that consumes and echoes answer-free scenarios, with strict role decoders and independent cross-artifact validation
- the separately gated checked-source experiment with bounded structural, decomposition, reachability, and enabled-frontier results

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
- shared safe-string admission, Unicode scalar ordering, and deeply immutable profile, program, runtime, stimulus, and result data
- topology-independent structural validation plus exact profile definition-scope and operation-kind cardinality
- pure exhaustive execution of the closed Semantic Process operation union, with operation-ID-stable internal closure independent of program collection order
- explicit scope-occurrence ownership over token multiplicity, child and called instances, selected branches, and canonical task, Message, timer, effect, and variable projections
- independent evaluation, exact refusal, hidden-state non-projection, and bounded closure for every closed family named in [the current claim](#current-claim), including both data mappings and both Error routes
- exact Process-start installation and User Task completion merge over canonical string/null bindings
- adapter-facing projection, structural stimulus validation, command identity, effect-transport material, incremental deployment and advancement, and complete scenario evaluation
- executable enabled-count and stable-state-resumability checks, with malformed-topology and stranded-state witnesses

#### Explicitly absent

- an ambiguity refusal matching Lean's `ambiguousInternalChoice`: the closure selector advances the lowest canonical operation ID without signalling an unresolved semantic choice, so agreement with Lean at the admitted independent two-User-Task states rests on canonical operation order, explicit activation-order equality for both the static parallel and data-dependent Inclusive cases, and per-profile rejection or unreachability of every other multiple-enabled shape
- I/O, byte-level parser, Temporal SDK, CIB dependency, JUEL/XPath/FEEL/script grammar or evaluation, conditional-evaluation receipts, general BPMN state model, raw source-binding interpretation, effect execution or transport digest, value kinds beyond string/null, general mapping expressions or scope nesting, Call data or generalized definition graphs, general faults or Error propagation beyond one direct parent, timer forms or races beyond the exact capsule, semantically material nondeterministic scheduling, arbitrary graph execution

### CIB oracle

#### Implemented

- Distinct pinned CIB Seven `2.2.0` and `2.0.0` embedded runner profiles
- exact deploy, start, public query, task or Message delivery, timer control, job execution, and completion probes for every CIB-backed family named in [the current claim](#current-claim)
- controlled epoch time, stale-command rejection, multiple-task projection, Process-variable mapping, effect retry, scope completion, and direct-parent Error propagation
- raw Process, task, subscription, timer, job, history, effect, and mapping observations retained as release-specific content-bound evidence
- verifier reconstruction of canonical status, logical time, variables, waits, interactions, and semantic instance identity from those raw observations
- reconstruction deliberately reuses the Java projector's ordering and raw-binding translation, so it checks raw-to-canonical consistency rather than independently deriving projection semantics
- phase-zero public-service probes for start and completion data, Service Task binding and retry, direct-Message Receive Task, Sub-Process Error propagation, and both product-neutral mapped Service Task host relations
- meaningful raw-observation, projection, binding, deadline, sibling, mapping, and variable mutations
- release-grouped evidence replacement, isolated engine configurations, zero-state checks, timings, and full cleanup

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
- typed `started | rejected` production start after separate semantic and host-capability admission, before Workflow creation
- external Worker and client lifecycle over caller-supplied connection and Task Queue settings, with collision-resistant content-derived Workflow and command identities
- one core-owned semantic loop with committed-state Query projection, User Task Update ingress, payload-free Message Signal ingress, durable Timer wakeup, bounded effect Activity, and retained result recovery
- exact duplicate coalescing, changed-content conflict, semantic refusal, process-closed and process-unknown separation, and committed-state-only acknowledgement
- durable hosting for every closed family named in [the current claim](#current-claim), keeping embedded and called Process work inside one Workflow rather than assigning BPMN meaning to Child Workflows
- family-parameterized boundary-deadline scheduling with distinct typed shared-activation refusals, plus the managed Event-Based Gateway race and passive Message subscription class
- Worker replacement, accepted-result recovery, exact Query and history assertions, replay, cleanup, and a separately bundled semantic or host-bypass mutation for each distinct mechanism
- canonical Process start and completion data, effect transport, public enabled-interaction and task-detail projection, validated terminal receipts, and the repository command's strict external-runtime configuration
- one live product example per distinct host mechanism, with reused mechanisms checked without a Temporal service and optional time-skipping calibration outside default verification

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
- exact-release grouping for CIB-backed cases, explicit standards-only cases, and one raw-only Service Task retry execution
- one generic Lean result emitter
- one core batch
- two isolated Temporal executions per registered scenario
- exact case-specific relations across every implemented family, with retained-CIB comparison only where the selected profile declares a CIB target
- separate synchronous CIB host relations for the two product-neutral mapped Service Task slices
- Query, Update, Signal, durable-Timer, Activity, result-recovery, replay, and cleanup evidence for each applicable host mechanism
- definition, provenance, admission, semantic-state, projection, host-bypass, and evidence mutations, including one required semantic disagreement per registered case
- isolated target execution, complete fetched-history replay, cleanup, timings, and feedback budgets

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

## Interrupting Activity boundary Timer

The [interrupting Activity boundary Timer specification](capsules/ACTIVITY-BOUNDARY-TIMER-SPEC.md) is **implemented and evidence-closed** for one interrupting exact-`PT1S` deadline on a User Task.

**Implemented.** Source, checked graph, `AwaitBoundedUserTask` lowering, Lean, the independent core, both registered victory routes, Worker-absence durability, shared-activation refusal, replay, and product examples are green.

**Absent in Lean.** Quantified state preservation for a stale identity after a victory still depends on a key-uniqueness invariant that `RuntimeState` does not enforce. The capsule records the required hypotheses instead of assuming them.

**Absent in evidence.** No target can present an off-deadline firing because the host derives the firing instant from committed state. The abandoned Activity's stale completion has no non-racing delivery mode after its task disappears. CIB observation is not selected. The shared-activation refusal identity reaches the Workflow result and Event History, but not a caller awaiting the completion Update.

## Non-interrupting boundary Timer

The [non-interrupting boundary Timer specification](capsules/NON-INTERRUPTING-BOUNDARY-TIMER-SPEC.md) is **implemented, evidence-closed, and graduated** for one exact-`PT1S` firing that preserves its User Task host.

**Implemented.** Source admission resolves `cancelActivity` into the closed `BoundaryInterruption` value, and the sibling profiles remain disjoint. The `awaitMonitoredUserTask` operation, Lean, the independent core, two registered schedules with mutations, Worker absence, shared-activation refusal, and replay are green. Firing keeps the monitored task live, spawns exactly one boundary task, and closes after both one-sided completions.

**Absent.** CIB observation is not selected. Repeated firing is outside the slice and would require an occurrence record before the one-sided join could remain unambiguous.

## Interrupting Sub-Process boundary Timer

[The interrupting Sub-Process boundary Timer specification](capsules/SUBPROCESS-BOUNDARY-TIMER-SPEC.md) is **implemented, evidence-closed, and graduated**, for exactly one embedded Sub-Process with one child task and one interrupting `PT1S` boundary Timer. That capsule owns the full exclusion set and is not restated here.

**Implemented.** The source, checked graph, `enterBoundedScope` wire operation, independent Lean and core arming and victory transitions, two registered routes with mutations, distinct shared-activation refusal, Worker-absence durability, and replay are green. The host reuses the family-parameterized boundary deadline scheduler while retaining a distinct refusal identity.

**Absent in Lean, and owned only here.** Both victory bridges take hypotheses their own transitions do not establish: `running` and `bounded` on the quiescence arm, and the quantified `parentOwned` on the deadline arm, whose derivation would additionally need scope-tree acyclicity and an empty called-instance closure that `RuntimeState` does not enforce. `deadline_arm_bridge_premise_is_satisfiable` is what keeps `parentOwned` non-vacuous. `BoundedScopeVictoryStep` is **not** wired into the global `ProgramStep` soundness; only `BoundedScopeArmingStep` is. The relation-level logical-time law is a joint bound over both arms rather than a law separating them.

**Absent in evidence.** CIB observation is not selected. Off-deadline and stale-child witnesses remain outside the registered schedules because no Temporal target can present them without replacing committed deadline derivation or racing task disappearance; Lean and the focused core test carry those refusals.

## Boolean attribute coercion at source admission

This section is the owner of a cross-cutting admission rule that no single capsule owns, because it spans five requirement rows.

`bpmn-moddle` reduces every `xsd:boolean` attribute to `value === "true"` and reports no warning. `xs:boolean` admits `true`, `false`, `1`, and `0`; the coercion agrees on three and maps `1` to false where the type means *true*. Whether that inversion is safe depends on the comparison direction: a reader requiring `true` refuses a coerced value, while a reader admitting on the coerced value is fooled by a lexeme meaning *true*. Three readers did the latter, so `triggeredByEvent="1"` admitted an Event Sub-Process as an ordinary embedded Sub-Process, and `instantiate="1"` admitted an instantiating Event-Based Gateway and Receive Task as non-instantiating.

**Implemented and green.** [The compiler](../packages/bpmn-source/src/compile.ts) refuses, on the exact decoded source, any occurrence of a `Boolean`-typed attribute whose lexeme the coercion does not preserve. `0` is admitted and `1` is not, which is the disagreement rather than a canonicality rule; an entity-encoded spelling of a valid boolean is refused as well, and that over-rejection is recorded rather than fixed. The attribute set derives from the metamodel manifest's `Boolean` properties rather than a list, so a boolean added to the manifest is covered when it is added.

**Owner-confirmed on 2026-08-07.** Refusing only the disagreement is what keeps the Event-Based Gateway specification's admitted `instantiate="0"` valid. Enumerated defaults stay outside the rule, because BPMN 2.0.2's own machine-readable artifacts disagree on the only such literal.

## Current evidence

[The canonical CIB observation fidelity table](TESTING-SPEC.md#canonical-cib-observation-fidelity) classifies every top-level `stateObservation` field and every nested occurrence, wait, subscription, timer, effect, interaction, and variable field as `engine-observed`, `adapter-derived`, `adapter-decided`, or `not-claimed`, with a schema-depth test preventing omissions. Rule-level fidelity is recorded in the owning CIB-backed capsules, not here.

**Per-scenario requirements are owned by the guarded artifact catalogs and each capsule's rule-to-evidence matrix**, and are deliberately not restated in this inventory. The registered scenarios, their declared target relations, their seeded mutations, and the exact cases the pipeline ran are emitted by the generated pipeline report; [TESTING-SPEC.md](TESTING-SPEC.md#complete-differentialrefinement-pipeline) owns what the gate requires.

What this inventory does own is the set of cross-cutting invariants the complete prepared pipeline must satisfy over their declared case sets, whatever the catalog currently contains. Each applies where its lane applies: the CIB bullets bind only CIB-backed cases, the host bullets only cases declaring a Temporal target.

- equality between current CIB execution and content-bound retained CIB evidence;
- the same waiting projection for successful and wrong-activation inputs before completion, and exact state preservation after wrong and stale completion rejection;
- equality between the pure core and each isolated Temporal result under that case's declared target relation, with correct Query projection and Update outcomes;
- proof that the Temporal runner never delivers `fireTimer` or `completeEffect`, that the Workflow derives each from committed semantic state, and that Event History contains the exact timer or Activity mechanism;
- duplicate logical-command stability, and classified disagreement when an activation ordinal is mutated;
- a rejected Lean scenario document carrying an injected extra answer field, plus exact equality between the admitted scenario and Lean's decoded echo;
- exact Lean definition identity and lowering equality, plus rejection of a schema-valid operation-origin mutation and of erased parallel control-place Sequence-Flow provenance;
- a seeded semantic mutation per registered case that produces its required disagreement;
- every fetched live history replayed before server shutdown, and clean CIB and Temporal teardown.

The warm-pipeline measures are two tiers owned by [TESTING-SPEC.md](TESTING-SPEC.md#default-verification): a reported 15-second soft target and a 40-second hard ceiling, with a separate sub-45-second cold budget. Exact counts and latest measurements belong to the generated report and [PLAN.md](PLAN.md). A hand-copied replay count here once drifted from the run's actual figure without any gate noticing, which is why counts are no longer restated in this document.

## Nearest unsupported claim

One nearest boundary per family. The owning capsule holds the full exclusion set.

- **Call Activity:** a second or repeated invocation of the same called Process. Deployment or version and tenant resolution, mappings, per-instance data, recursion, exceptional completion, cancellation, and Temporal Child Workflow identity stay outside. See [the capsule](capsules/CALL-ACTIVITY-SPEC.md).
- **Receive Task:** an addressless or operation-addressed, instantiating, data-bearing, correlated, or repeated Receive Task. See [the capsule](capsules/RECEIVE-TASK-MESSAGE-SPEC.md).
- **Sub-Process boundary Timer:** a deadline on a Sub-Process holding more than one child task. That is where this profile's single-child coincidence between the child's last consumed token and scope quiescence stops holding, so the withdrawal rule stated over quiescence becomes separately falsifiable rather than accidentally correct. See [the capsule](capsules/SUBPROCESS-BOUNDARY-TIMER-SPEC.md).
- **Non-interrupting boundary Timer:** a deadline that fires more than once, which `timeCycle` admits and Table 10.91 contemplates. A second firing makes the element-identity-to-activation join ambiguous, so a capsule admitting repetition must add the occurrence record rather than inherit the argument. See [the capsule](capsules/NON-INTERRUPTING-BOUNDARY-TIMER-SPEC.md).
- **Error:** handler search beyond one exact match attached to the directly enclosing embedded Sub-Process. Catch-all matching, multiple candidates, ancestor propagation, unmatched outcomes, Event Sub-Processes, payload mapping, and concurrent command races stay outside. See [the capsule](capsules/SUBPROCESS-ERROR-PROPAGATION-SPEC.md).
- **Expressions:** conditional routing beyond the exact Simple Boolean profile. JUEL remains demand-driven, deferred, and separately classified.
- **Unsupported across families:** arbitrary serial composition, arbitrary graph progress, repeated or nested scope activation, Message payload, key, and global correlation, loops, multi-instance, compensation, and general Event semantics.

**A12 adoption.** The optional adoption lane admits the exact external `CreateDocument.bpmn` bytes through the product-neutral mapped-success profile plus a content-bound data-only overlay. Its current oracle proves the two project-authored adoption projections equal the selected frozen generation outside the approved profile/overlay identity translation. The frozen manifest at immutable target `02330ad` derives the complete A12-specific baseline set plus the original validator, projector, and effect-projection roots independently of its own entries. Closure correction `8d6ea1a` is approved, and the [handoff](../adoption/a12/current/README.md#resume-point-for-a-future-a12-add-on) records how future product-3 work resumes.

The closed exact-model product count remains **zero** because no external EUPL-1.2 model and Java delegate have executed through an A12-owned add-on. This is optional adoption evidence, not the primary BPMN coverage measure or product-1 implementation. The active Simple Boolean language matches none of the retained A12 JUEL sources and claims zero adoption coverage.

**Closed prerequisite.** Cross-language wire hardening: schemas cap every current integer at `9007199254740991`, canonical identifiers use exact Unicode scalar-value ordering with no normalization, and strict byte readers reject duplicate decoded keys and unpaired surrogates.

**Strongest unresolved proof claim.** Full observational checked-source-to-program-run preservation. [The bounded experiment](experiments/CHECKED-SOURCE-RELATION-EXPERIMENT.md) retains a provisional direct account, a renamed positional-lowering discriminator, and accepted bounded structural and frontier results, but no run theorem. Production work uses the targeted preservation boundary in [the IL specification](SEMANTIC-PROCESS-IL-SPEC.md#lean-specification-and-proof-obligations); the general theorem reopens only when a second capsule needs the same proposition.
