# Engine contracts and source implementation map

This detail map owns exact current wire, semantic-profile, checked-source, Semantic Process IL, and source-admission status. Root routing and cross-area claims remain in [`implementation-status-router`](IMPLEMENTATION-MAP.md).

## Current boundary

Exact BPMN bytes are captured, admitted under a guarded profile into a project-owned checked graph, and lowered deterministically into the Semantic Process IL. Current profiles remain bounded, versioned, and fail closed; unsupported source is rejected or preserved only where a reviewed profile says so.

## Implemented

### Wire contracts

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

### Semantic profile

- Every registered profile is a guarded artifact with exact authority, selected features, observation boundary, exclusions, environment, and reviewed CIB relationship IDs where applicable
- CIB-backed profiles pin exact oracle revisions and content-bound retained evidence; standards-only profiles declare no CIB execution target
- definition-scope and operation-kind cardinalities are checked per profile, separately from topology-independent graph validation
- one registered Message Start capability requires one `initiateMessage` output and a matching exact Message-start stimulus
- one registered Timer Start capability requires one `initiateTimer` output, normalized duration `1000`, and a matching exact Timer-start stimulus
- one registered Terminate End capability fixes the exact nested definition-scope, operation-kind, and control-place cardinalities without adding an external stimulus
- immutable CIB artifact status freezes only evidence calibration, not a production deployment or history baseline
- one registered successor profile selects the predecessor-equivalent Service Task shape, literal-generation incident transition family, configured CIB failed-job incident projection, and one exact retry schedule while preserving predecessor checked-graph and IL content modulo profile identity

### Semantic Process IL

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

### BPMN source

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

### Boolean attribute coercion at source admission

This section owns a cross-cutting admission rule that no single capsule owns, because it spans five requirement rows.

`bpmn-moddle` reduces every `xsd:boolean` attribute to `value === "true"` and reports no warning. `xs:boolean` admits `true`, `false`, `1`, and `0`; the coercion agrees on three and maps `1` to false where the type means *true*. Whether that inversion is safe depends on the comparison direction: a reader requiring `true` refuses a coerced value, while a reader admitting on the coerced value is fooled by a lexeme meaning *true*. Three readers did the latter, so `triggeredByEvent="1"` admitted an Event Sub-Process as an ordinary embedded Sub-Process, and `instantiate="1"` admitted an instantiating Event-Based Gateway and Receive Task as non-instantiating.

**Implemented and green.** [The compiler](../packages/bpmn-source/src/compile.ts) refuses, on the exact decoded source, any occurrence of a `Boolean`-typed attribute whose lexeme the coercion does not preserve. `0` is admitted and `1` is not, which is the disagreement rather than a canonicality rule; an entity-encoded spelling of a valid boolean is refused as well, and that over-rejection is recorded rather than fixed. The attribute set derives from the metamodel manifest's `Boolean` properties rather than a list, so a boolean added to the manifest is covered when it is added.

**Owner-confirmed on 2026-08-07.** Refusing only the disagreement is what keeps the Event-Based Gateway specification's admitted `instantiate="0"` valid. Enumerated defaults stay outside the rule, because BPMN 2.0.2's own machine-readable artifacts disagree on the only such literal.

## Explicitly absent

### Wire contracts

- Parallel legacy schemas, migration readers, compatibility switches, general assertion language
- negative, fractional, unsafe, nested, heterogeneous, or other values; integer/list use outside M6 completion
- wider or decimal numeric domain
- identifier normalization or locale-sensitive ordering

### Semantic profile

- general CIB parallel compatibility beyond the exact metadata composition
- first production compatibility baseline
- full requirement classification
- approved gap interpretations beyond the reviewed slices
- confirmed deviations beyond the visible `CIB-DEV-0001` candidate
- multiple or mixed Message Start Events, payload, external publication routing, definition-version fanout, or retry-transparent start receipt
- Product 2 Timer Start schedule lifecycle, version activation, public management, recurrence, and calendar forms

### Semantic Process IL

- Adopted checked-source operational relation and full observational preservation proof
- general mapping expression, JUEL evaluation request or receipt, general condition language/cardinality, variable, effect payload/fault, catch-all or multi-handler Error search, or propagation beyond one direct parent

### BPMN source

- General BPMN compiler, arbitrary graph admission or scope nesting, cycles outside the exact registered User Task cycle profile, concurrent Multi-Merge execution, Standard Loop Characteristics, multi-instance, other Exclusive Gateway topology/cardinality, general FormalExpression/JUEL/XPath, Service Task/data/error bindings beyond the approved exact shapes, catch-all/multi-handler/ancestor Error search, timer forms beyond exact `PT1S`, addressless/operation-addressed/instantiating/data-bearing Receive Task, Message payload/key/global correlation/throw/flow or other Message Event loci, external/imported/deployed Call targets, Global Tasks, Call data/mapping/version/tenant/recursion/repetition, synchronous parser CPU isolation, non-UTF-8 decoder, source locations, general extension semantics, DI-preserving export, complete CMOF binding, deployment store
- multiple or mixed Message Start Events, Event Sub-Process start, explicit `isInterrupting`, referenced or repeated MessageEventDefinitions, payload, Message Flow execution, routing, buffering, correlation, or definition-version fanout
- An element on refusals over the document or checked graph, on unsupported values of consumed keys, or on nested event-definition and mapping-child failures that have no separately reviewed inventory. Those remain `unsupportedModel` records with `element: null`. Preserved material is retained only in the exact source bytes, with no query surface or public projection
- The whole BPMN data family, and foreign content at every undeclared locus. A mapped Service Task overlay may declare only exact inert expanded-name/element-type pairs; unconsumed attributes, wildcards, and whole-type exemptions reject

## Evidence owners

The schema and artifact catalogs under [`contracts/`](../contracts/README.md) and [`profiles/`](../profiles/README.md), source-package tests, [Semantic Process IL specification](SEMANTIC-PROCESS-IL-SPEC.md), [BPMN requirement ledger](BPMN-REQUIREMENT-LEDGER.md), and owning semantic capsules bind these claims. Exact gate method remains in [TESTING-SPEC.md](TESTING-SPEC.md).

## Nearest unsupported claims

- **High-leverage interchange admission:** apply the measured 80/20 tranche to standard Diagram Interchange, lanes, definitional Collaboration presentation, documentation, and safe inert metadata that currently block several independent candidate families. Classify each source fact as execute, preserve, or reject. Preservation must prove semantic non-interference, and CIB runtime metadata enters only through an explicitly selected compatibility need. This improves real-model admission without treating presentation or vendor metadata as executable BPMN meaning.
- **Process Execution closure:** refresh the requirement ledger, CIB `2.2.0` breadth inventory, and deduplicated corpus after every semantic closure, then select the next reusable gap by normative dependency, semantic risk, and practical reach. The remaining program includes definition and import closure, general Process and Sequence Flow composition, Activity and Task lifecycle breadth, remaining Gateway and Event behavior, arbitrary scope nesting, data and expression coverage, Collaboration and Message Flow, and the line-by-line requirement extraction required before any Process Execution Conformance percentage or claim exists.
- **Source admission:** a general BPMN compiler, arbitrary graph and scope admission, general expressions, data, correlation, imported Call targets, and DI-preserving export remain absent. The exact exclusions stay in the implemented/absent inventory above and the owning capsules.
- **Wire contract:** parallel legacy schemas, migration readers, compatibility switches, a general assertion language, wider numeric domains, and identifier normalization remain absent.
