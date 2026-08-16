# Implementation map

This document owns current implementation, proof, evidence, and absence status, not milestone history. Semantic meaning and exclusions belong to [capsules](capsules/README.md), gates to [TESTING-SPEC.md](TESTING-SPEC.md), guarded artifacts to their catalogs, and the resume point to [PLAN.md](PLAN.md).

## Current claim

**M1 through M6 are closed, completing the functional MVP on its documented single-node Product 2 deployment.** No production scalability or capacity claim is made.

**What the engine does.** Exact BPMN bytes admit through a checked project-owned graph to the [Semantic Process IL](SEMANTIC-PROCESS-IL-SPEC.md), which a Lean reference interpreter and an independently written TypeScript semantic core each evaluate, and which a Temporal adapter hosts durably. Closed families are Parallel fork/join, Exclusive Gateway over a project-owned Boolean expression language, Inclusive Gateway, Event-Based Gateway, Call Activity, embedded Sub-Process completion and Error propagation, Intermediate Catch Timer and Message, Message-addressed Receive Task, Service Task effects, scoped runtime data, User Task start and completion data, and three boundary-Timer loci including one non-interrupting.

**Current Message Start boundary.** The standards profile and Product 2 [Message Start ingress specification](BPM-PLATFORM-MESSAGE-INGRESS-SPEC.md) are closure-reviewed and evidence-closed. Product 2 publishes one exact target with durable no-redispatch recovery; broker routing and version fanout remain absent.

**Current closure boundary.** Process-instance search is closure-reviewed, evidence-closed, and graduated through its identity contract, SQLite index, three producers, HTTP/web, live restart/paging/filter/private-fact evidence, and browser acceptance. M2 is closed.

**Current Timer Start boundary.** The closure-reviewed standards profile preserves one top-level `PT1S` Timer Start through checked source, `initiateTimer`, Lean, the core, registered evidence, and one-action Temporal Schedule hosting. Product 2 scheduling remains a separate closed specification.

**Current Terminate End boundary.** The closure-reviewed standards profile implements selected-occurrence-retaining containing-scope cancellation through strict source, checked `terminateEndEvent`, no-output `terminateScope`, Lean, the core, registered differential evidence, and passive Temporal hosting. CIB evidence and Product 2 cancellation remain absent.

**Current configured Task boundary.** The closure-reviewed project extension retains distinct `configuredTask` checked identity and lowers only its exact binding to the existing Activity/Probe effect. It has registered Lean/core/differential/live Temporal evidence and a CIB pass-through exclusion oracle, but no CIB compatibility target or public effect-completion ingress.

**Current Boolean Process-data boundary.** The closure-reviewed [specification](capsules/BOOLEAN-PROCESS-DATA-SPEC.md) admits primitive Boolean only for exact completion in one registered sequential User Task profile. Its schema, Lean/core, CIB, differential, live Temporal, history, and replay evidence are green. Start and older profiles remain string/null-only; Product 2 consumes no new fact.

**Current E2 User Task metadata boundary.** The graduated [sequential metadata specification](capsules/USER-TASK-ASSIGNMENT-FORM-METADATA-SPEC.md) carries an optional literal group candidate and string-or-Boolean generated-form field through checked source, `awaitUserTask`, committed wait, and public `OpenUserTask`. The closure-reviewed [parallel composition specification](capsules/PARALLEL-USER-TASK-METADATA-COMPOSITION-SPEC.md) requires that metadata on both tasks of one exact balanced graph, empty Process Start data, and the existing completion and parallel runtime. Lean/core, combined CIB, differential, live Temporal/replay, mutation, corpus, and production-journey evidence are green. Product 2 consumes only published task/form facts through M3 Work.

**Current M6 boundary.** The [structured Human Work specification](BPM-PLATFORM-STRUCTURED-HUMAN-WORK-SPEC.md) is closure-reviewed and evidence-closed across Product 1 semantics and Product 2 forms.

**Current M5 boundary.** The closure-reviewed [E1 specification](capsules/COMMITTED-EXECUTION-PUBLICATION-SPEC.md) implements replay-complete transitions, exact current positions, a strict Workflow Query, retention/replay, and fail-closed Product 2 History, Diagram, and canonical export. The [metrics specification](capsules/FLOW-NODE-OCCURRENCE-METRICS-SPEC.md) adds Lean/core lifecycle parity, replay-stable time, exact-version all-or-unavailable frequency and completed duration, HTTP, and a two-width UI. The [operator-history specification](BPM-PLATFORM-OPERATOR-HISTORY-AUDIT-EXPORT-SPEC.md) completes M5 with independent bounded Work and incident audit snapshots, Operations authorization, canonical download, restart/privacy/focus evidence, and no merged chronology.

**Current executable-corpus boundary.** The maintained [executable model corpus](../model-corpus/README.md) binds 24 project models and seven external CIB Seven, OMG, and Betsy files to exact provenance, admission, pipeline, and Product 2 readiness. Its guard requires the canonical catalog and retained coverage to match all 25 pipeline-derived executable variants.

External drift fails closed. The sequential metadata, parallel metadata-composition, and structured expense-exception models have production Chromium journeys; the other 21 are browser-ineligible.

**What it does not do.** One generic profile retains selected notation without executing it. The BPMN data family remains rejected. All registered profiles except the bounded User Task cycle remain acyclic. Integer and String-list values appear only at M6 User Task completion; Product 1 owns no form semantics. The independently closure-reviewed [Service Task incident and retry specification](capsules/SERVICE-TASK-INCIDENT-RETRY-SPEC.md) owns one registered literal-generation-1 incident and one exact retry. Stage 2 adds only the exact incident-gated hosting-root cancellation successor; it does not add general BPMN or operator cancellation, native Temporal cancellation, compensation, another incident generation, or Product 2 action state.

**Evidence and product boundary.** Registered answer-free scenarios run their declared Lean, TypeScript, Temporal, and pinned CIB lanes with seeded mutations and content-bound evidence. TypeScript produces the shared checked graph/program; Lean checks lowering independently without parsing XML. Product drivers use published interactions and occurrence identities. Live execution is required once per distinct host mechanism; composed product examples are not an independent semantic lane.

**Layering.** [The BPMN requirement ledger](BPMN-REQUIREMENT-LEDGER.md) is the primary engine-coverage view; [the CIB–BPMN register](CIB-BPMN-RELATION-REGISTER.md) owns classified profile additions; [the A12 ledger](research/A12-WORKFLOWS-COMPATIBILITY-LEDGER.md) owns downstream adoption. The three denominators never combine. There is no A12 adapter package, Java Worker, facade bridge, Java semantic core, or JUEL dependency in this repository; [PROJECT-DESIGN.md](PROJECT-DESIGN.md#cib-compatibility-and-polyglot-effect-execution) owns the reopen trigger for a second core.

**A12 product boundary.** The [implemented boundary specification](A12-ADD-ON-BOUNDARY-SPEC.md) adds no A12-specific production decision. Neutral mapped-boundary output passes shared schemas and checked-to-IL Error-route verification; the MIT-closure inventory and preservation oracle are exact-byte bound to baseline `02330ad`. Closure correction `8d6ea1a` and the [future adoption handoff](../adoption/a12/current/README.md#resume-point-for-a-future-a12-add-on) own the boundary.

**This is not** a general BPMN engine, an OMG conformance result, or a production CIB deployment or history compatibility baseline. Individual evidence-bound calibration profile artifacts may already be immutable under the narrower [profile-registry definition](../profiles/README.md).

## Implemented and absent surfaces

### Project foundation

#### Implemented

- Lean 4.31.0/Lake 5.0
- Node 24.18.0
- pnpm 11.20.0 with a repository-pinned CI-oriented local virtual-store projection, shared content-addressable store, exact wrapper-owned CLI selection that disables pnpm's recursive project-driven version switching, package-owned builds with graph-derived topological root commands, bounded wrapper regression execution, and ordinary/CI bare-wrapper guards
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
- The Temporal adapter subsystem split into independently built protocol, client, Workflow, Worker, runner, and testkit workspace packages, with no production umbrella export and an executable guard over exact internal and SDK dependency direction
- MIT licensing for project-authored material
- shared `CLAUDE.md`/`AGENTS.md`
- role-named proposal/specification documents and their governed lifecycle
- enforced documentation index, filename-role, and local-link guards
- enforced directory-independent cold-review receipts for active material proposals and post-policy specifications under `docs/`, with Status-section approval detection, object-database and `HEAD`-ancestry validation, an immutable-baseline grandfather set, prospective same-model/same-effort `fork-turns-none` isolation, exact same-reviewer warm correction and guarded closure continuity, one equal-target combined checkpoint/closure mode for genuinely single-lane atomic closure, stage-specific focus, static-findings-first gate deferral, deterministic neutral review packets, historical receipt preservation, and graduation blocking
- executable Status, suffixless-singleton, registry, file-link, and heading-anchor documentation discipline; the supplied architecture handoff's current release/readiness obligations have active owners while the original brief and two residual proposals are archived provenance
- the non-redistributed OMG BPMN 2.0.2 corpus at external sibling `../oss/omg-bpmn-2.0.2`, with overrideable XSD/CMOF consumer paths, official-source-only atomic fetch, a 15-file tracked hash manifest, and an offline verifier; the optional Markdown/image conversion remains a non-authoritative cache
- portable external-input setup through a 14-repository/four-submodule canonical-remote/commit/tag/gitlink lock plus the per-file OMG digest manifest, separate `verify`/`adoption`/`research`/`all` provisioning scopes, a read-only doctor that derives all workspace manifests and package build caches from pnpm while hashing the fixed non-pnpm owners and inventorying registered shared caches, A12-free CI provisioning, custom-root support, and fail-closed CMOF, MIWG, breadth, and selected adoption lanes; no contributor machine is presumed to contain `../oss`
- enforced implementation-surface reviewability through per-surface implemented/absent sections and a 120-word review-unit ceiling
- commit-bounded nonblank code/document capsule-cost measurement with a parser self-test and explicit unknown treatment for missing historical baselines
- dependency-free source-hygiene enforcement over tracked and pending Lean/TypeScript/JavaScript/Java source with a 600-nonblank-line review target, 1000-line hard ceiling, exact import-only Lean umbrellas, allowlist-free rejection of every hand-written `.js`/`.cjs`/`.mjs` module, required Lean module-document placement, descriptive public names for maintained non-experimental conformance facts, one composed Lean assessment shared by the live scan and explicit sparse-valid anti-boilerplate fixture, literal-aware diagnostics, and no current reviewed exceptions
- a Lean semantic-surplus comment contract with one shared runtime representation invariant and selected execution, strict-JSON, artifact-admission, and scenario support/run boundary documentation; no blanket declaration backfill was performed
- responsibility-owned Lean semantics, Temporal lifecycle, differential pipeline, contract verification, and CIB runner collaborators
- focused and full gates
- routine GitHub Actions verification on Ubuntu only, with an executable guard that permits standard GitHub-hosted macOS solely for an explicitly manual clean-machine or Apple Silicon smoke job, unchanged warm feedback reporting, a wider hosted pathology ceiling, and derived test-process deadlines

#### Explicitly absent

- Release packaging, published libraries, production deployment
- automatic proof of semantic cohesion or function/class responsibility
- comment-density, word-count, or declaration-documentation scoring; generated comment stubs
- Semgrep or tree-sitter dependency

### BPM platform

#### Implemented

- The concrete modular-monolith architecture, decision register, and complete owner inventory in [ARCHITECTURE.md](ARCHITECTURE.md)
- Narrow `@bpmn-lean/engine-api` compilation and exact-definition start entry points plus `@bpmn-lean/platform-engine-gateway`, projecting source identity, definition identity, located admission diagnostics, and handle-free start outcomes without exposing the checked graph, Semantic Process program, or Temporal Workflow handle
- `@bpmn-lean/platform-artifact-store`, which verifies exact SHA-256 identity, publishes caller-snapshotted bytes atomically without replacement, detects occupied-path corruption, and returns defensive copies
- `@bpmn-lean/platform-postgresql-runtime`, with bounded pools, locked checksum migrations, and separate fast and PostgreSQL 18 tests
- `@bpmn-lean/platform-contracts` with closed deeply immutable M1 definition and exact-version start transport types, strict unknown decoders, opaque engine diagnostics and start failures, and safe versioned route construction
- `@bpmn-lean/platform-definitions`, which snapshots deployment and start inputs before their asynchronous boundaries, persists only admitted exact source, allocates durable process-local version ordinals through SQLite `BEGIN IMMEDIATE`, starts only one exact stored version, lists current and historical versions, and fails explicitly when metadata and content lose integrity
- A Fetch-compatible definitions route contribution with closed raw-XML deployment input, claimed and streamed byte ceilings, producer-mutation-resistant chunk capture, exact-version body-free start, public-only accepted/rejected projections, exact version/source reads, strict path and method validation, and generic internal failures
- `@bpmn-lean/platform-server`, a Node HTTP adapter with no external transport library and a modular-monolith composition root with configured request authority, streaming transport, ordered route dispatch, closed errors, local and Temporal environment configuration, and idempotent socket/SQLite/lazy-client lifecycle
- An executable product-boundary guard that discovers tracked and pending source plus package manifests, resolves package aliases and subpaths to owners, permits showcase evidence to drive exact public package roots while rejecting its deep imports, fails closed on malformed or duplicate identities, and carries planted violations for every guarded dependency class
- An executable platform licence policy that delegates production-closure discovery to pnpm's native licence report, requires 0BSD, MIT, Apache-2.0, BSD-3-Clause, ISC, or one identity-scoped bpmn.io licence exception, and does not duplicate the lockfile's graph or exact version inventory
- The HTTP-only `@bpmn-lean/platform-web` React 19.2.8 definition workspace, with exact upload, strict public response decoding, accepted and rejected diagnostics, catalog and version browsing, digest/length/ETag-verified exact-source retrieval, selected exact-version start with request-to-response identity verification, and no server/module/foundation import
- The owner-approved `bpmn-js` 18.22.1 viewer-only adapter, whose exact non-standard license text is hash-bound to its package identity, copied into the static distribution, and accompanied by an unchanged visible bpmn.io attribution link
- The private `@bpmn-lean/showcase-m1-definition-deployment` acceptance package, which composes a cached ephemeral Temporal service, the production BPMN Worker, the production platform server, and the HTTP-only web client on one Task Queue without adding reusable behavior or a private API
- Development-only Playwright 1.62.1 browser acceptance over its pinned headless Chromium, creating unseen exact BPMN bytes at runtime and checking admitted version 1, changed version 2, selected version-1 start through the concrete Temporal client, exact-source `bpmn-js` rendering and attribution, plus located rejection without version advancement; CI provisions and runs this required lane on Linux without adding any production dependency
- Accepted compilation projects exact Timer Start identity and normalized duration into a platform-owned immutable capability stored with every exact definition version; other current profiles retain an empty collection
- Accepted compilation also projects the exact Message Start Event and complete operation-addressed channel into the atomic `{ messageStarts, timerStarts }` capability contract; every other current profile publishes an empty Message Start collection
- A strict one-target Message Start publication contract and durable SQLite lifecycle with exact-version/channel identity, pre-dispatch `starting`, no redispatch after that boundary, handle-free reconciliation, stable integrity, and no private host identity
- Product 1 hosts exact Message Start requests behind canonical private addressing, while strict global routes and the HTTP-only panel expose only status-consistent public receipts and the accepted Process instance
- Live and browser M2 Message Start witnesses cover exact-version selection, response loss, platform restart, Worker absence/replacement, terminal history/replay, and private-fact exclusion without Schedule or fanout substitution
- A strict one-shot `(processId, version, scheduleId)` contract and HTTP client; exact SQLite reservation and reconciliation over immutable definition/capability/instance/Schedule facts; a narrow prepare/create-or-compare/inspect/pause/delete engine host that keeps Temporal addresses private; composed routes and startup cleanup; and an exact-version Timer Start panel that never resolves latest definition
- A live M2 Temporal witness covering exact version-1 retention after version-2 deployment, SQLite restart, Worker absence and replacement, opaque execution identity, action-won conflict, pre-start cancellation, one-action exhaustion, terminal cleanup, history, replay, and public private-ID exclusion
- An M2 browser showcase that composes the production server, Worker, Temporal service, and React UI and proves the scheduled version-1 Process instance after later version-2 deployment; the M1 showcase remains a separate unseen-source regression floor
- An identity-only Process-instance search contract and independent `@bpmn-lean/platform-operate` SQLite index with exact filters, stable opaque-cursor paging, immutable snapshots, classified same-ID races, and no Temporal dependency
- Three definitions-owned producer hooks that record before success and let durable Schedule and Message retries repair without repeating host work
- A strict global HTTP route and HTTP-only panel with duplicate refusal, filter-preserving paging, exact public fields, and no inferred lifecycle, time, origin, or private host fact
- Live restart, insertion-stable paging, exact-filter, external-start-exclusion, private-fact-scan, and three-distinct-Temporal-execution evidence plus field-specific browser acceptance
- Strict Work contracts and opaque Product 1 locators over one all-producer confirmation lifecycle; all-or-error task aggregation before fake group policy; uniform hiding; exact unavailable and ceiling distinctions; durable registrations, claim generations, retry-safe completion, same-transaction audit outbox, and reopen/concurrency/response-loss/ABA/reconciliation evidence
- Strict Work HTTP routes and an HTTP-only React Aria, TanStack, and CSS-Modules string-or-Boolean form; unclaimed work exposes only the explicit Claim action, completion request construction requires a live current-actor claim, definite HTTP refusals remain distinct from uncertain delivery, and live Temporal plus Chromium journeys cover Definitions/Operate/Work agreement, restart, Worker replacement, actor hiding, claim-before-work, completion, audit, history, replay, private-fact exclusion, and task removal
- Exact-source-bound Product 2 Human Task catalogs, element-ID joining, Zod validation, canonical completion, retry/conflict preservation, zero-mutation refusal, priority ordering, six accessible field kinds, three conditional actions, and 1280/1600 expense-exception journeys through semantic History and Work audit
- A full-content Work-first shell with deferred Definitions, Operations, About, and bpmn-js rendering; collection-to-detail tabs; source-first or digest-bound generated diagrams and modeller downloads; exact task highlighting; one responsive no-scroll native task table; distinct task and hosting identity; CSS Modules plus one token/reset owner; exact focus, state, and reduced-motion behavior; accessible real M1/M2/M3 browser floors; and fixed-fixture production-bundle Playwright at 1280 and 1600 pixels
- A read-only About destination with package version, the BPMN 2.0.2 target, all 25 catalog-owned executable restrictions, separate CIB evidence, a non-conformance warning, and two-width browser acceptance
- Confirmed-locator bootstrap, all-or-error current incident aggregation, exact operator authorization, durable content-bound Retry/Cancel with recovery and conflict detection, separate cursor-paged audit, strict HTTP, and an Operations workspace covering Process search, current incidents, diagram highlighting, audit, action state, two-width desktop browser behavior, and a real Temporal/browser/replay witness
- A strict engine-neutral execution-publication mirror and representation-free gateway, epoch-3 SQLite projection with transactional contiguity, exact overlap, unavailable/gap, restart, and revision-zero rebuild semantics, authorization-first reconciliation and HTTP routes, and an Operations Process-instance detail with fresh-only Overview, exact semantic History, multi-position Diagram overlay, canonical export, independently snapshotted Work and incident actions, strict canonical audit download, restart convergence, recursive host-private-fact exclusion, and two-width evidence
- E1-aligned flow-node lifecycle publication, live replay evidence, exact-version transactional occurrence projection, all-or-unavailable frequency and completed-duration aggregation, authorization-first HTTP, and accessible bpmn-js badges plus the same values in a table

#### Explicitly absent

- Horizontal Product 2 deployment: the PostgreSQL seam exists, but business persistence, artifacts, repair, and Temporal Query aggregation remain node-local. The [scale-out roadmap](TEMPORAL-BPMN-EXECUTION-SCALABILITY-PROPOSAL.md#horizon-1-remove-product-2s-single-node-scale-boundary) is in progress; no shared-mode evidence exists.
- Adjustable metric periods, running pseudo-duration, charts, heatmaps, metric export, post-retention archive, and cross-instance semantic ordering

- a production identity provider, directory synchronization, administrator role, claim delegation, or authorization model beyond the exact fake actor and group policy
- a client router, form library, themed component framework, virtualization, visual form builder, arbitrary or nested form schema, remote options, draft storage, attachments, or validation/computation involving I/O or user-authored expressions
- complete discovery of engine Process instances started outside Product 2
- the deferred JUEL evaluator implementation under its product-owned `platform/workers/juel-evaluator/` location
- recovery of legacy engine instances that predate the confirmed-start publication contract
- BPMN diagram editing, a public raw-sidecar format, automatic layout for multiple root Processes, collaborations, Call Activities without complete source DI, Sub-Processes, groups, annotations, associations, or data artifacts
- viewport-specific duplicate task DOMs, a permanent task-detail side panel, horizontal task-row scrolling, a themed component framework, runtime CSS-in-JS, or UI tests in Product 1 semantic feedback loops

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
- exact Message Start checked-node, channel-bound `initiateMessage`, and `triggerMessageStart` scenario/start shapes with strict first-stimulus placement
- registered exact Timer Start checked-node, duration-bound `initiateTimer`, and `triggerTimerStart` scenario/start shapes with strict first-stimulus placement
- exact identity-only Terminate End checked-node and no-output `terminateScope` operation with exact input and containing definition scope
- exact Call Activity checked-node arm and paired `invokeProcess`/`returnProcess` operations with called definition, root, entry, return, and caller-output identities
- explicit checked boundary Error and Error End variants plus one resolved direct-parent `throwError` handler with exact Error and Sequence Flow provenance
- one canonical definition-scope forest with exact node/Sequence-Flow and operation/control-place ownership, retaining one rooted tree for existing profiles and one distinct called root for the bounded Call profile, plus one shared occurrence-ID shape reused by User Tasks, Message subscriptions, timers, effects, and Call records
- one strict five-arm String/null/Boolean/non-negative-safe-integer/ordered-String-list value union with profile-specific surface admission and bounded canonical transport
- Process-variable observation, immutable effect arguments, and closed string/null successful/business-error patches
- required canonical `submittedValues` on exact User Task completion, with empty-patch preservation and no legacy reader
- raw CIB state-query, task-query, timer-job, effect-job, effect-execution, and mapping-execution observations with verifier-reconstructed canonical projections that reuse the adapter's ordering and constant-field rules
- exhaustive schema-depth CIB fidelity classification for all twelve top-level state fields and every nested field
- required `openMessageSubscriptions`, `openTimers`, and separate `openEffects`
- typed `deliverMessage`, `fireTimer`, and `completeEffect`
- registered literal-generation-1 effect-incident identity, strict `reportEffectFailure` and `retryIncident` stimuli, required `openIncidents`, incident active waits, and retry interactions, including nested public occurrence-equality validation outside JSON Schema
- JavaScript-safe non-negative integer maxima
- exact non-normalized Unicode-scalar identifier order
- byte-aware duplicate-key and unpaired-surrogate rejection
- TypeScript/Lean edge locks for unknown and missing fields, closed enums, explicit null versus absence, unsafe and fractional numbers, and canonical arrays
- matching CIB scalar sorting and safe numeric carriers
- cross-artifact definition identity and source-origin checks
- reference, arity, identity, candidate-order, evidence, and projection mutations
- pre-release guard against embedded format counters, retired representation names, and milestone compatibility paths
- committed-execution schemas, atomic revisions, exact identity/head equations, producer/public validation, and canonical UTF-8 bytes

#### Explicitly absent

- Parallel legacy schemas, migration readers, compatibility switches, general assertion language
- negative, fractional, unsafe, nested, heterogeneous, or other values; integer/list use outside M6 completion
- wider or decimal numeric domain
- identifier normalization or locale-sensitive ordering

### Semantic profile

#### Implemented

- Every registered profile is a guarded artifact with exact authority, selected features, observation boundary, exclusions, environment, and reviewed CIB relationship IDs where applicable
- CIB-backed profiles pin exact oracle revisions and content-bound retained evidence; standards-only profiles declare no CIB execution target
- definition-scope and operation-kind cardinalities are checked per profile, separately from topology-independent graph validation
- one registered Message Start capability requires one `initiateMessage` output and a matching exact Message-start stimulus
- one registered Timer Start capability requires one `initiateTimer` output, normalized duration `1000`, and a matching exact Timer-start stimulus
- one registered Terminate End capability fixes the exact nested definition-scope, operation-kind, and control-place cardinalities without adding an external stimulus
- immutable CIB artifact status freezes only evidence calibration, not a production deployment or history baseline
- one registered successor profile selects the predecessor-equivalent Service Task shape, literal-generation incident transition family, configured CIB failed-job incident projection, and one exact retry schedule while preserving predecessor checked-graph and IL content modulo profile identity

#### Explicitly absent

- general CIB parallel compatibility beyond the exact metadata composition
- first production compatibility baseline
- full requirement classification
- approved gap interpretations beyond the reviewed slices
- confirmed deviations beyond the visible `CIB-DEV-0001` candidate
- multiple or mixed Message Start Events, payload, external publication routing, definition-version fanout, or retry-transparent start receipt
- Product 2 Timer Start schedule lifecycle, version activation, public management, recurrence, and calendar forms

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
- containing-scope `terminateScope` cancellation that clears every represented live owner in the selected occurrence subtree, retains that occurrence quiescent, preserves higher-level work and monotonic state, and delegates all continuation or root completion to unchanged `completeScope`
- owner-scoped selected-branch records that block quiescence until exact selected-input synchronization and are removed by owner interruption
- occurrence-owned Call records that block caller quiescence, bind one distinct called semantic instance, and remove the complete parentless called subtree on return or interruption
- missing, duplicate, cross-owner, premature-completion, and stranded-child guards

#### Explicitly absent

- arbitrary or repeated nesting, loops that reactivate one definition scope, and concurrent occurrences of the same child definition
- Event Sub-Processes, Call Activities beyond the exact two-Process empty-data normal-return slice, Transactions, compensation, general cancellation beyond the exact reviewed regional slices, and exceptional propagation beyond one direct-parent exact-code Error handler
- public projection of definition-scope or runtime-scope identity

### Semantic Process IL

#### Implemented

- Implemented draft spec for a checked source-facing graph
- current JSON Schemas and boundary validators for typed `initiate`, `initiateMessage`, `initiateTimer`, `enterScope`, `invokeProcess`, `returnProcess`, `awaitUserTask`, `awaitTimer`, `awaitMessage`, `awaitEventRace`, `awaitEffect`, `duplicate`, `synchronize`, `mergeExclusive`, `choose`, `selectMany`, `synchronizeSelected`, `throwError`, `terminateScope`, `reachNoneEnd`, and `completeScope` operations
- `choose` carries exactly two declaration-ordered typed Simple Boolean candidates and one distinct default
- `selectMany` carries two canonically ordered typed Simple Boolean candidates plus one default, each retaining its branch-local expected join input and one split-derived selection key; `synchronizeSelected` waits for the selected subset without changing `synchronize`
- `awaitEventRace` carries one named operation-addressed Message arm and one named exact-`PT1S` Timer arm with their configuration-flow origins, catch identities, and distinct winner outputs; its configuration Flows are not control places
- `mergeExclusive` carries a canonical nonempty input collection and one output, with reusable per-offered-token declarative pass-through and a unique-offer executable subset; only the registered cycle profile fixes its input count at three
- ordinary `awaitUserTask.task` carries exact optional passive E2 metadata under the registered assignment/form profile; bounded and monitored User Task operations remain unchanged
- deterministic TypeScript lowerer and independent Lean decoder/lowerer preserve admitted scope ownership, condition, mapping, route, and exact source data
- exact Message Start lowering preserves Process, Start Event, Interface, Interface Operation, input Message, and every validated outgoing-flow identity; reusable `initiateMessage` admits canonical nonempty outputs while the registered capability fixes one
- exact Timer Start lowering preserves Process, Start Event, `PT1S -> 1000`, and every validated outgoing-flow identity; reusable `initiateTimer` admits canonical nonempty outputs while the registered capability fixes one
- exact Terminate End lowering preserves End Event origin, incoming control place, and containing definition scope while producing no continuation output
- independent sequential, bounded-parallel, exact-timer, Timer/User Task composition, operation-addressed Intermediate Catch Message and direct-Message Receive Task subscriptions, payload-free effect, mapped-success Service Task, mapped-boundary-Error Service Task, Simple Boolean conditional evaluation, ordinary embedded Sub-Process completion, direct-parent Sub-Process Error propagation, bounded called-Process invocation/return, and registered resumption-bounded cycle execution
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
- bounded compilers for the sequential User Task, balanced parallel, exact `PT1S` timer, profile-parameterized finite acyclic Timer/User Task composition, operation-addressed payload-free Intermediate Catch Message in both Message/User Task orders, one direct-Message payload-free Receive Task, one top-level operation-addressed payload-free Message Start Event, one top-level exact `PT1S` Timer Start Event, one exact operation-addressed Message-versus-`PT1S` Event-Based Gateway configuration, payload-free Service Task, one exact configured Task extension, and bounded mapped-success and mapped-boundary-Error Service Task shapes
- bounded compilers for the exact two-condition-plus-default Simple Boolean Exclusive Gateway, one exact resumption-bounded User Task cycle with an identity-only converging Exclusive Gateway, one structured two-condition-plus-default Inclusive Gateway split/direct-User-Task/join region, one-level ordinary embedded Sub-Process completion, one direct exact-code Sub-Process Error-propagation shape, one exact nested Terminate End shape with omitted or parser-safe false `triggeredByEvent`, and one exact namespace-qualified in-document called Process
- one registered E2 source reader for exact URI-expanded `candidateGroups` plus one exact `formData/formField`, including local or root alternate prefixes, quote-aware raw duplicate-attribute parser-erasure refusal across quoted delimiters and line terminators, exact boundary-space and literal restrictions, checked-to-IL metadata binding, and physical omission on metadata-free tasks
- reusable checked-source scope ownership, reference, arity, scope-local reachability, co-reachability, and profile-selected whole-graph or User-Task-cut acyclicity validation separated from profile mechanism/cardinality capability
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

- General BPMN compiler, arbitrary graph admission or scope nesting, cycles outside the exact registered User Task cycle profile, concurrent Multi-Merge execution, Standard Loop Characteristics, multi-instance, other Exclusive Gateway topology/cardinality, general FormalExpression/JUEL/XPath, Service Task/data/error bindings beyond the approved exact shapes, catch-all/multi-handler/ancestor Error search, timer forms beyond exact `PT1S`, addressless/operation-addressed/instantiating/data-bearing Receive Task, Message payload/key/global correlation/throw/flow or other Message Event loci, external/imported/deployed Call targets, Global Tasks, Call data/mapping/version/tenant/recursion/repetition, synchronous parser CPU isolation, non-UTF-8 decoder, source locations, general extension semantics, DI-preserving export, complete CMOF binding, deployment store
- multiple or mixed Message Start Events, Event Sub-Process start, explicit `isInterrupting`, referenced or repeated MessageEventDefinitions, payload, Message Flow execution, routing, buffering, correlation, or definition-version fanout
- An element on refusals over the document or checked graph, on unsupported values of consumed keys, or on nested event-definition and mapping-child failures that have no separately reviewed inventory. Those remain `unsupportedModel` records with `element: null`. Preserved material is retained only in the exact source bytes, with no query surface or public projection
- The whole BPMN data family, and foreign content at every undeclared locus. A mapped Service Task overlay may declare only exact inert expanded-name/element-type pairs; unconsumed attributes, wildcards, and whole-type exemptions reject

### Lean

#### Implemented

- Project-owned strict JSON parser with duplicate-key, unpaired-surrogate, and safe-integer rejection
- strict checked-graph, Semantic Process, and external scenario decoders with exact-key and closed-variant rejection
- executable JSON edge-case and Unicode scalar-order locks
- separate checked-process admission, Semantic Process validation, cross-artifact binding, canonical lowering, and exact lowering-equality owners
- separate kernel-decided conformance modules for admission/profile/binding/lowering and for runtime closure/evaluator facts, preserving the theorem surface while bounding each Lean compiler process independently
- generic scope-owned token, occurrence, wait, selected-branch, called-Process, and scoped-variable runtime with canonical public projection
- declarative `OperationStep`/`ProgramStep` and `EffectCompletionStep`, executable transitions, and evaluator soundness at each closed capsule's declared proof boundary
- independent decoding, lowering, execution traces, refusal or preservation facts, and non-laws for every closed family named in [the current claim](#current-claim); the three boundary-Timer proof boundaries remain explicit in their sections below
- cyclic-control-flow proofs for exact checked/program graph policy and lowering, full-cycle interception by the selected cut, general per-offered-token merge relation, unique-offer evaluator soundness, actual execution of every finite reviewed repeat/rework schedule followed by exit, actual-reachability active-unit bounds, automatic cut-DAG closure at no more than six operations, stale/wrong/future identity preservation, and excluded internal-cycle, fan-in, scope, and wait shapes
- Message Start proofs for strict checked/program/stimulus decoding, exact source-to-IL channel and root binding, distinct Message initiation, fresh root occurrence and outgoing-token production, wrong-operation refusal with exact state preservation, bounded closure to the existing User Task wait, and excluded second start or passive-subscription interpretations
- Timer Start proofs for strict checked/program/stimulus decoding, exact source-to-IL Process/Start Event/duration/output binding, distinct Timer initiation, fresh root occurrence and outgoing-token production, wrong-identity refusal with exact state preservation, exact closure bounds and stable User Task resumption, normalized post-initiation observation agreement with None and Message starts, and excluded non-`PT1S` or recurring interpretations
- Terminate End proofs for exact checked/program admission and lowering, reusable selected-root-retaining subtree cancellation, every represented owner family, aggregate End increment and unrelated-state preservation, root and nested completion, stale and multiplicity refusal, exact 5/3/2 closure bounds, strict decoding, and global-versus-incomplete cancellation non-laws
- configured Task proofs for strict source binding, distinct checked identity, exact checked/program admission, endpoint lowering to the existing Probe effect, normalized Service Task control-shape agreement, exact effect-to-User-Task closure, occurrence refusal, descriptor drift, and pass-through non-laws
- E2 proofs for exact optional metadata admission, source-independent lowering, committed wait and public projection, completion equivalence across arbitrary admitted metadata and submitted patches, refusal preservation, strict JSON identity, boundary-space and literal restrictions, metadata-free byte omission, and old-profile exclusion
- proved incident report/retry relations and evaluator soundness, exact wait suspension and restoration, public projection, quiescence blocking, resumability, runtime-context preservation, typed refusal, old-profile and cross-program fail-closed admission, strict JSON identity, and success/BPMN-Error separation
- bounded internal closure for one enabled operation or the exact admitted two-task pair, rejecting every other multiple-enabled shape
- one catalog-driven result emitter that consumes and echoes answer-free scenarios, with strict role decoders and independent cross-artifact validation
- the separately gated checked-source experiment with bounded structural, decomposition, reachability, and enabled-frontier results
- proved committed-transition trace/replay, control positions/deltas, nonpublication failures, and source-compiled TypeScript parity

#### Explicitly absent

- Optional vertex-count fuel adequacy and no-false-rejection theorem
- generalized arbitrary-cardinality or arbitrary-graph progress theorem beyond the implemented profile capability and targeted checks
- adopted checked-source semantics and run-level observational lowering-preservation proof
- either-target-fires and exactly-two enabledness at a two-token frontier
- generalized enabled-transition, supported-closure, admission, observation, and stimulus-list correspondence remain unresolved
- general multiple-enabled closure without an explicit semantic choice or checked commutation argument
- replay/host-attempt stability as a Lean proposition
- general or repeated scopes, nested/heterogeneous/decimal values, effect faults, catch-all/multi-handler/ancestor Error search, expression languages, or exceptional propagation beyond one direct parent
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
- registered cyclic-control-flow admission and execution with one shared frozen graph policy, a reusable nonempty Exclusive Merge contract, profile-local exact-three restriction, owner-preserving unique-offer execution, and zero/multiple-offer evaluator incompleteness kept distinct from the declarative relation
- registered Message Start admission and execution with a distinct exact-target stimulus, one fresh root occurrence, generic canonical nonempty outgoing-token production, profile-local exact-one output, and no subscription or payload
- registered Timer Start admission and execution with a distinct exact-target stimulus, one fresh root occurrence, generic canonical nonempty outgoing-token production, profile-local exact-one output, exact refusal and 2/1 closure bounds, stable User Task resumption, normalized cross-start observation equality, and no runtime Timer or clock state
- registered Terminate End admission and execution with no external stimulus, selected-occurrence-retaining subtree cancellation, exact higher-level preservation, aggregate End increment, unchanged scope completion, exact refusal, and 5/3/2 closure bounds
- registered configured Task admission and execution with exact checked descriptor binding, the existing payload-free Probe effect, effect-only initial exposure, occurrence-only refusal, trailing User Task continuation, and no runtime, stimulus, state, or observation widening
- exact Process-start installation and atomic User Task completion merge over the shared five-arm representation, with profile admission at deployment and live commands
- registered E2 metadata admission and independent preservation through checked User Task, ordinary operation, committed wait, and public projection, with passive completion, exact refusal preservation, strict wire values, and old-profile exclusion
- registered literal-generation incident report and exact retry transitions, private and public association validation, incident-aware quiescence and resumability, and pre-dispatch refusal of malformed or cross-program injected incident states
- adapter-facing projection, structural stimulus validation, command identity, effect-transport material, incremental deployment and advancement, and complete scenario evaluation
- executable complete-enabled-set closure classification and stable-state-resumability checks, with ambiguity refusal for every multiple-enabled shape except one exact pair of independent User Task waits, plus malformed-topology and stranded-state witnesses
- traced committed transitions/replay and fail-closed control-position projection, with unchanged canonical observations and Lean parity

#### Explicitly absent

- I/O, byte-level parser, Temporal SDK, CIB dependency, JUEL/XPath/FEEL/script grammar or evaluation, conditional-evaluation receipts, form schema or validation, general BPMN state model, raw source-binding interpretation, effect execution or transport digest, integer/list execution outside exact M6 User Task completion, nested or heterogeneous values, general mapping expressions or scope nesting, Call data or generalized definition graphs, general faults or Error propagation beyond one direct parent, timer forms or races beyond the exact capsule, semantically material nondeterministic scheduling, arbitrary graph execution

### CIB oracle

#### Implemented

- Distinct pinned CIB Seven `2.2.0` and `2.0.0` embedded runner profiles
- exact deploy, start, public query, task or Message delivery, timer control, job execution, and completion probes for every CIB-backed family named in [the current claim](#current-claim)
- controlled epoch time, stale-command rejection, multiple-task projection, Process-variable mapping, effect retry, scope completion, and direct-parent Error propagation
- raw Process, task, subscription, timer, job, history, effect, and mapping observations retained as release-specific content-bound evidence
- retained actual Java Boolean Process-variable observations and canonical tagged Boolean projection for the exact completion profile
- verifier reconstruction of canonical status, logical time, variables, waits, interactions, and semantic instance identity from those raw observations
- reconstruction deliberately reuses the Java projector's ordering and raw-binding translation, so it checks raw-to-canonical consistency rather than independently deriving projection semantics
- phase-zero public-service probes for start and completion data, Service Task binding and retry, direct-Message Receive Task, Sub-Process Error propagation, and both product-neutral mapped Service Task host relations
- public-service E2 raw evidence retains one candidate-group identity link and one typed Form Service field independently of completion
- a separate configured successor engine bundle projects one exact retries-zero public job plus its self-rooted `failedJob` incident partner to one literal-generation-1 semantic incident, partitions that job out of `openEffects`, and resets the same public job for one retry before successful completion
- incident-specific raw diagnostics, exact profile/schedule alignment, strict job/incident association validation, retained evidence, and mutations for missing, duplicate, mismatched, disabled, and old-profile facts
- one exact incident-cancellation successor that requires the matching retries-zero public job and self-rooted incident partner, invokes public root deletion through private CIB identity, and projects typed cancelled state only from zero live state, exact `EXTERNALLY_TERMINATED` root history, and preserved committed Process data
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
- a second canonical semantic incident, general Management Service retry policy, exception/cause projection, or cancellation beyond the exact incident-gated root command
- Product 2 assignment, inbox, authorization, claiming, rendering, validation, or form submission behavior

### Temporal adapter

#### Implemented

- One semantic-lifetime Workflow receiving the start stimulus and admitted Semantic Process program
- typed `started | rejected` production start after separate semantic and host-capability admission, before Workflow creation
- external Worker and client lifecycle over caller-supplied connection and Task Queue settings, with collision-resistant content-derived Workflow and command identities
- one core-owned semantic loop with committed-state Query projection, User Task Update ingress, payload-free Message Signal ingress, durable Timer wakeup, bounded effect Activity, and retained result recovery
- exact duplicate coalescing, changed-content conflict, semantic refusal, process-closed and process-unknown separation, and committed-state-only acknowledgement
- durable hosting for every closed family named in [the current claim](#current-claim), keeping embedded and called Process work inside one Workflow rather than assigning BPMN meaning to Child Workflows
- passive pre-start host admission for the registered cycle program's `mergeExclusive`; its finite live witness reuses the existing User Task Update, survives Worker replacement between activations, recovers the accepted result, refuses a stale occurrence without changing Query state, takes both back-edges and the default exit, observes no Continue-As-New suggestion, and replays the exact fetched history without adding a Workflow scheduler, wait, command, Timer, or Activity mechanism
- family-parameterized boundary-deadline scheduling with distinct typed shared-activation refusals, plus the managed Event-Based Gateway race and passive Message subscription class
- Worker replacement, accepted-result recovery, exact Query and history assertions, replay, cleanup, and a separately bundled semantic or host-bypass mutation for each distinct mechanism
- canonical Process start and completion data, effect transport, public enabled-interaction and task-detail projection, validated terminal receipts, and the repository command's strict external-runtime configuration
- one live product example per distinct host mechanism, with reused mechanisms checked without a Temporal service and optional time-skipping calibration outside default verification
- direct `client.start` hosting for exact registered Message Start identity through the ordinary Workflow start input, with wrong Interface Operation rejection before Workflow creation, service acceptance while no Worker polls, later User Task completion, no Signal Event, exact history replay, and a test-owned Signal-With-Start discriminator
- test-owned one-action Temporal Schedule hosting for the registered Timer Start profile, with pre-Schedule zero-create refusal, Worker absence through the due occurrence, an exact stored Workflow-ID base kept distinct from the opaque service-returned Workflow/Run identity, base-as-execution refusal, exact downstream User Task completion, ten-event history inspection, action exhaustion, stored-action and direct-start mutations, and replay
- passive hosting for the registered Terminate End profile through existing User Task Updates, including Worker replacement after Trigger, committed-result recovery, Outer-only Query, stale Sibling refusal with exact state preservation, terminal completion, 20-event history inspection and replay, plus a test-owned Workflow whose wrong global cancellation closes instead of publishing Outer
- configured Task hosting through the existing Probe Activity and User Task Update path, including Worker replacement during the active Activity attempt, idempotent result reconciliation, exact terminal state, history inspection and replay, plus a test-owned effect bypass that exposes the User Task early
- registered Boolean completion through the existing Update path, with Worker replacement, old-profile refusal then valid completion, tagged projections, history/replay, and stringification/outside-core mutations
- registered User Task assignment/form metadata through the existing Query and Update path, with Worker replacement, exact passive projection, Boolean completion, metadata-free terminal state, history/replay, old-profile control, a Query-omission mutation, and a same-task source field-type variation bound in the Workflow-start program and Query
- registered Service Task incident hosting with an unchanged bare semantic Activity result union, exact successor-only one-attempt policy, host-only `technicalFailure`, Workflow-derived report command, committed incident Query, content-bound retained retry Update, exact effect restoration, Worker replacement, terminal result recovery, two-command race, typed post-retry host failure, history assertions, and replay
- registered incident-cancellation hosting with the shared one-attempt Activity/report policy, content-bound exact-root/exact-incident Update, Worker replacement while the incident is open, retained accepted-result recovery, typed cancelled receipt through ordinary Workflow completion, distinct late `processClosed`, preserved committed data, history and replay, and native-termination/completed-receipt mutations
- a Workflow revision accumulator/cursor Query, strict producer validation, representation-free client, opaque-locator engine API, and real retention evidence covering positive cursors, Worker replacement, terminal retrieval, repeated activation identity, pure Query history stability, and exact replay

#### Explicitly absent

- retained result beyond Temporal retention
- production canonical-observation API
- protocol that imposes caller order on concurrent distinct commands
- semantic policy copies in the Workflow
- Message payloads, key-based/global correlation, modeled Message throw, and cross-Workflow Message routing
- Message ingress broker/router, definition-version fanout, or multi-target publication receipt
- committed Event History fixtures
- any new Temporal primitive for User Task metadata
- a second semantic incident, arbitrary retry count or backoff, exception/cause projection, cancellation beyond the exact incident-gated root command, or Product 2 incident ingress
- patch branches
- legacy representation fallback
- production history baseline
- general Worker versioning
- expression evaluation beyond pure Simple Boolean v1
- integer or String-list values outside exact M6 User Task completion, nested or heterogeneous values, or general effect faults/Error propagation beyond the direct-parent internal slice
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
- exact Message Start agreement across Lean, the core, and Temporal with CIB absent, plus Interface Operation, instance-identity, and Signal-With-Start discriminators
- exact Timer Start agreement across Lean, the core, and Temporal with CIB absent, plus Start Event/instance-identity, stored-action, direct-start, and returned-execution-identity discriminators
- three exact Terminate End schedules across Lean, the core, and Temporal with CIB absent, plus source, checked-to-IL, regional-cancellation, stale-command, and supplied-instance mutation discriminators
- one exact configured Task schedule across Lean, the core, and Temporal with CIB absent, plus binding-drift and premature-User-Task-exposure mutation discriminators
- one exact Boolean User Task completion schedule across CIB, Lean, the core, and Temporal, plus Boolean-to-string mutation and live outside-core/stringification discriminators
- one exact User Task assignment/form metadata schedule across CIB, Lean, the core, and Temporal, plus candidate, field-key, field-type, source-derived-projection, live source field-type, and live Query-omission discriminators
- one exact Service Task incident schedule across CIB, Lean, the core, and Temporal, plus raw job/incident association, nested effect identity, checked/IL profile-only equivalence, technical-result routing, same-occurrence restoration, target substitution, post-retry host failure, and distinct-command race discriminators
- one exact Service Task incident-cancellation schedule across CIB, Lean, the core, and Temporal, plus public job/incident partner, historic-state, preserved-data, exact root/generation/owner, Retry-before-Cancel, completed-state, definition-drift, schedule, target-substitution, native-termination, and completed-receipt discriminators
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
- implemented bounded mechanisms cover sequential User Task lifecycle/refusal, per-incoming-flow parallel synchronization, one exact Simple Boolean divergent Exclusive Gateway, one structured two-condition-plus-default Inclusive Gateway split and paired selected-subset join, one exact operation-addressed Message-versus-`PT1S` Event-Based Gateway race with bounded durable refinement, one exact Intermediate Catch Timer, one operation-addressed payload-free Intermediate Catch Message subscription, one direct-Message payload-free Receive Task, bounded successful Service Task execution, one exact configured external-effect Task extension, bounded string/null input/output mapping, one exact-code attached interrupting Service Task Error route, ordinary one-level embedded Sub-Process completion, one direct-parent exact-code Error End propagation with regional cancellation, and one exact nested Terminate End that cancels only its containing Sub-Process occurrence before ordinary parent continuation

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

The complete prepared pipeline enforces the cross-cutting CIB, Lean, core, Temporal, mutation, replay, and teardown invariants defined by [TESTING-SPEC.md](TESTING-SPEC.md#complete-differentialrefinement-pipeline). Exact counts and latest measurements belong to the generated report and [PLAN.md](PLAN.md).

## Nearest unsupported claim

One nearest boundary per family. The owning capsule holds the full exclusion set.

- **Call Activity:** a second or repeated invocation of the same called Process. Deployment or version and tenant resolution, mappings, per-instance data, recursion, exceptional completion, cancellation, and Temporal Child Workflow identity stay outside. See [the capsule](capsules/CALL-ACTIVITY-SPEC.md).
- **Message Start:** one external publication matching multiple independent Message Start Events or definition versions. Routing, fanout, selected-start identity, and retry-transparent exactly-once policy stay outside. See [the capsule](capsules/MESSAGE-START-EVENT-SPEC.md).
- **Timer Start:** one external resolved occurrence for the exact top-level registered `PT1S` profile is implemented and evidence-closed with an answer-free scenario, runnable example, differential evidence, and a live one-action Schedule witness using the opaque service-returned execution identity. Recurrence, calendar forms, multiple starts, Schedule lifecycle, Product 2 scheduling, and silent latest-definition retargeting stay outside. See the [specification](capsules/TIMER-START-EVENT-SPEC.md).
- **Terminate End:** one exact nested Terminate End cancels only its containing embedded Sub-Process occurrence and then reuses ordinary parent continuation. Termination inside a called child Process is outside because it must compose selected-scope cancellation with Call return while preserving concurrent caller work. See the [specification](capsules/TERMINATE-END-EVENT-SPEC.md).
- **Receive Task:** an addressless or operation-addressed, instantiating, data-bearing, correlated, or repeated Receive Task. See [the capsule](capsules/RECEIVE-TASK-MESSAGE-SPEC.md).
- **Sub-Process boundary Timer:** a deadline on a Sub-Process holding more than one child task. That is where this profile's single-child coincidence between the child's last consumed token and scope quiescence stops holding, so the withdrawal rule stated over quiescence becomes separately falsifiable rather than accidentally correct. See [the capsule](capsules/SUBPROCESS-BOUNDARY-TIMER-SPEC.md).
- **Non-interrupting boundary Timer:** a deadline that fires more than once, which `timeCycle` admits and Table 10.91 contemplates. A second firing makes the element-identity-to-activation join ambiguous, so a capsule admitting repetition must add the occurrence record rather than inherit the argument. See [the capsule](capsules/NON-INTERRUPTING-BOUNDARY-TIMER-SPEC.md).
- **Error:** handler search beyond one exact match attached to the directly enclosing embedded Sub-Process. Catch-all matching, multiple candidates, ancestor propagation, unmatched outcomes, Event Sub-Processes, payload mapping, and concurrent command races stay outside. See [the capsule](capsules/SUBPROCESS-ERROR-PROPAGATION-SPEC.md).
- **Expressions:** conditional routing beyond the exact Simple Boolean profile. JUEL remains demand-driven, deferred, and separately classified.
- **Service Task incidents:** one literal-generation-1 report/retry account and one successor-only incident-gated hosting-root cancellation are implemented across CIB, Lean, the core, and Temporal. Product 2 implements bounded operations without semantic authority. A second incident, arbitrary retry policy, exception data, general or native cancellation, compensation, and arbitrary repair remain outside.
- **Unsupported across families:** arbitrary serial composition, arbitrary graph progress, repeated or nested scope activation, cycles outside the exact registered root-scope User Task profile, concurrent Multi-Merge execution, Standard Loop Characteristics, multi-instance, Message payload, key, and global correlation, compensation, and general Event semantics.

**A12 adoption.** The optional adoption lane admits the exact external `CreateDocument.bpmn` bytes through the product-neutral mapped-success profile plus a content-bound data-only overlay. Its current oracle proves the two project-authored adoption projections equal the selected frozen generation outside the approved profile/overlay identity translation. The frozen manifest at immutable target `02330ad` derives the complete A12-specific baseline set plus the original validator, projector, and effect-projection roots independently of its own entries. Closure correction `8d6ea1a` is approved, and the [handoff](../adoption/a12/current/README.md#resume-point-for-a-future-a12-add-on) records how future product-3 work resumes.

The closed exact-model product count remains **zero** because no external EUPL-1.2 model and Java delegate have executed through an A12-owned add-on. This is optional adoption evidence, not the primary BPMN coverage measure or product-1 implementation. The active Simple Boolean language matches none of the retained A12 JUEL sources and claims zero adoption coverage.

**Closed prerequisite.** Cross-language wire hardening: schemas cap every current integer at `9007199254740991`, canonical identifiers use exact Unicode scalar-value ordering with no normalization, and strict byte readers reject duplicate decoded keys and unpaired surrogates.

**Strongest unresolved proof claim.** Full observational checked-source-to-program-run preservation. [The bounded experiment](experiments/CHECKED-SOURCE-RELATION-EXPERIMENT.md) retains a provisional direct account, a renamed positional-lowering discriminator, and accepted bounded structural and frontier results, but no run theorem. Production work uses the targeted preservation boundary in [the IL specification](SEMANTIC-PROCESS-IL-SPEC.md#lean-specification-and-proof-obligations); the general theorem reopens only when a second capsule needs the same proposition.
