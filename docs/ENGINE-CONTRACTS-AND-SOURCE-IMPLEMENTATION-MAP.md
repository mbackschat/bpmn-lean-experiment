# Engine contracts and source implementation map

This detail map owns exact current wire, semantic-profile, checked-source, Semantic Process IL, and source-admission status. Root routing and cross-area claims remain in [`implementation-status-router`](IMPLEMENTATION-MAP.md).

## Current boundary

Exact BPMN bytes are captured, admitted under a guarded profile into a project-owned checked graph, and lowered deterministically into the Semantic Process IL. Current profiles remain bounded, versioned, and fail closed; unsupported source is rejected or preserved only where a reviewed profile says so. The first interchange composition profile combines the existing CIB Seven User Task Process-data surface with the existing standard-notation preservation capability without changing the executed projection.

The registered sequential Multi-Instance profile admits one exact schema-valid batch-review source into one closed checked node and one `awaitSequentialMultiInstanceUserTask` operation with exact data associations, one lifetime Timer arm, fixed limits, and exact natural and interrupted schedules. The same profile identity is execution-admitted across source, Lean, the TypeScript core, the differential pipeline, Product 1, and the registered corpus.

The registered parallel Multi-Instance profile admits the same direct String collection graph with explicit parallel `All` behavior, exact Simple Boolean completion condition, and one outer-lifetime Timer. It lowers to paired parallel entry/completion operations, preserves indexed identity independently of completion order, and is registered with exact all-complete, first-complete, and Timer-interrupted schedules.

The registered Activity data-input profile admits one exact invoice-review source whose User Task carries one required scalar `DataInput`, one `InputSet`, one empty `OutputSet`, and one direct `DataInputAssociation` from one Process `Property`. It lowers to one `dataInputUserTask` checked node and one `awaitDataInputUserTask` operation, and is registered with exact present-string, explicit-null, and absent-source scenarios.

The registered Activity data-output profile admits one exact credit-underwriting source whose User Task carries one required scalar `DataOutput`, one `OutputSet` referencing it, one empty `InputSet`, and one direct `DataOutputAssociation` into one Process `Property`. It lowers to one `dataOutputUserTask` checked node and one `awaitDataOutputUserTask` operation, and is registered with exact supplied-string, supplied-null, and omitted-output scenarios.

The implemented Message payload catch profile admits one exact operation-addressed Intermediate Catch Message Event whose Message and Event DataOutput resolve to the same scalar ItemDefinition object, whose required OutputSet and direct association resolve by object identity, and whose target is one distinct Process Property. It lowers to a distinct `payloadMessageCatchEvent` checked node and `awaitPayloadMessage` operation; Lean and the independently written TypeScript core execute the reviewed account, and the strict shared and Lean codecs preserve its additive wire shapes. Three registered answer-free scenarios distinguish a supplied scalar, explicit null, and an absent payload across the full Lean/core/Temporal pipeline, and one retained whole model binds the same exact compiler path. CIB Message behavior remains unselected.

The Message key-correlation implementation has reached its mandatory pre-host semantic checkpoint. One exact source reader resolves the definitional Collaboration, Participants, Conversation, Message Flows, one CorrelationKey/CorrelationProperty, one Process CorrelationSubscription and binding, one scalar Process Property, and exact payload/Process-property selectors by parser-graph identity. It lowers to distinct `correlatedPayloadMessageCatchEvent` and `awaitCorrelatedPayloadMessage` arms, and strict checked/program/stimulus/interaction/publication contracts carry the complete definition-global address and target revalidation facts. Independent checkpoint review approved correction target `1ce28ed5`; no profile is registered and no Temporal ingress, scenario, corpus, or closure claim is present.

The independently approved boundary Compensation retention checkpoint adds one optional strict Program declaration for a flat root scope, canonically ordered explicit handler targets, and count/canonical-byte limits. The declaration is validated against exact ordinary, sequential Multi-Instance, or parallel Multi-Instance User Task operations, and those existing runtime producers consume it through private completion facts. The independently approved Compensation Event Sub-Process snapshot checkpoint adds a separate optional Program declaration for canonical parent/handler targets and record/byte limits plus an optional hidden Runtime collection of provisional or promoted parent-context records. Strict shared and Lean readers preserve omission for every old Program and state.

The checkpoint-only Compensation source profile now consumes that parser-graph provenance for the travel-booking Process. It admits a distinct global synchronous throw node and closed checked Compensation declaration, including two boundary subjects, one dormant Event Sub-Process subject, one direct restored Process binding, one direct subject dependency, and jointly satisfiable fixed limits. TypeScript lowers the checked value to the existing retention, snapshot, execution, and `triggerCompensation` Program contracts; Lean independently decodes, admits, lowers, and binds the complete checked artifact. Both semantic accounts derive the required String start binding from that Program and reject malformed or prospectively over-capacity starts before state creation. The checkpoint identity remains outside the product profile registry, and Product 1 still rejects the lowered Program as `compensationSchedulerUnavailable` before Workflow start.

The registered interrupting Activity boundary Message profile admits one exact omission-only, payload-free Message Boundary Event on one User Task under identity `bpmn-2.0.2-activity-boundary-message-draft`. It adds the strict checked `messageBoundaryEvent` and IL `awaitMessageBoundedUserTask` arms, exact source reference and attachment validation, deterministic lowering with distinct normal and boundary outputs, empty external value domains, and two answer-free schedules over the same exact source bytes. The independently closure-reviewed profile, differential cases, retained whole model, capability row, and Product 2 disclosure are evidence-closed.

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
- exhaustive schema-depth CIB fidelity classification for all twelve top-level state fields and every nested field, with exact schema/table path equality rejecting any top-level or nested omission
- required `openMessageSubscriptions`, `openTimers`, and separate `openEffects`
- typed `deliverMessage`, `fireTimer`, and `completeEffect`
- strict checked `messageBoundaryEvent` and Semantic Process `awaitMessageBoundedUserTask` schema arms for the registered Activity boundary Message profile
- strict checkpoint-only `correlatedPayloadMessageCatchEvent`, `awaitCorrelatedPayloadMessage`, `deliverCorrelatedPayloadMessage`, complete `CorrelatedMessageAddress`, and global correlated-payload interaction/publication arms
- strict checkpoint-only `globalSynchronousCompensationThrowEvent` and optional checked `compensation` arms, preserving the selected subjects, dormant handler, bodies, restored endpoint identities, dependency, and fixed limits while remaining physically absent from older artifacts
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
- Every registered profile has an exhaustive fail-closed value domain at Process start, User Task completion, and effect completion. Each nonempty cell is declared by an exact surface-specific feature atom except four legacy artifacts whose unchanged digests come from the cyclic-control-flow baseline and whose READMEs carry exact surface-and-kind declarations
- CIB-backed profiles pin exact oracle revisions and content-bound retained evidence; standards-only profiles declare no CIB execution target
- definition-scope and operation-kind cardinalities are checked per profile, separately from topology-independent graph validation
- one registered Message Start capability requires one `initiateMessage` output and a matching exact Message-start stimulus
- one registered Timer Start capability requires one `initiateTimer` output, normalized duration `1000`, and a matching exact Timer-start stimulus
- one registered Terminate End capability fixes the exact nested definition-scope, operation-kind, and control-place cardinalities without adding an external stimulus
- immutable CIB artifact status freezes only evidence calibration, not a production deployment or history baseline
- one registered successor profile selects the predecessor-equivalent Service Task shape, literal-generation incident transition family, configured CIB failed-job incident projection, and one exact retry schedule while preserving predecessor checked-graph and IL content modulo profile identity
- one registered interchange successor selects the CIB Seven User Task Process-data value domain and the standard-notation preservation capability while retaining predecessor checked-graph and IL content modulo exact source and profile identity; both predecessor profiles remain narrower
- one registered standards-only parallel Multi-Instance profile selects explicit parallel `All`, exact `stringEquals(completionPolicy,"first")`, the direct String collection graph, one outer `PT5S` Timer, and the fixed 16-item/512-byte/8,192-canonical-byte bounds without selecting CIB execution
- one registered standards-only Activity data-input profile selects one required scalar `DataInput`, one direct `DataInputAssociation` from one Process `Property`, an empty `OutputSet`, and a String-or-null Process-start value domain, with an empty User Task completion domain and no CIB execution target
- one registered standards-only Activity data-output profile selects one required scalar `DataOutput`, one direct `DataOutputAssociation` into one Process `Property`, an empty `InputSet`, and a String-or-null User Task completion value domain, with an empty Process-start domain and no CIB execution target
- one registered standards-only Activity boundary Message profile selects the exact empty Process-start and User Task-completion value domains without a CIB Message Boundary target
- one unregistered checkpoint-only Compensation profile admits its exact checked and Program shapes plus one Program-derived String Process-start binding in both semantic accounts; prospective production snapshot and first-frontier capacity checks precede state creation, and it has no scenario, capability, CIB target, or hosted execution

### Semantic Process IL

- Implemented draft spec for a checked source-facing graph
- required closed `InternalSchedulingMode` with `rejectObservableChoice` and reserved `requireChoiceSchedule`; every existing source profile lowers explicitly to reject mode, while no profile yet admits scheduled choice
- current JSON Schemas and boundary validators for typed `initiate`, `initiateMessage`, `initiateTimer`, `enterScope`, `invokeProcess`, `returnProcess`, `awaitUserTask`, `awaitDataInputUserTask`, `awaitSequentialMultiInstanceUserTask`, `awaitParallelMultiInstanceUserTask`, `completeParallelMultiInstanceUserTask`, `awaitTimer`, `awaitMessage`, `awaitEventRace`, `awaitEffect`, `duplicate`, `synchronize`, `mergeExclusive`, `choose`, `selectMany`, `synchronizeSelected`, `throwError`, `terminateScope`, `reachNoneEnd`, and `completeScope` operations
- checkpoint-only checked/program support for `correlatedPayloadMessageCatchEvent` and `awaitCorrelatedPayloadMessage`, preserving the exact channel, key/property identities, and context-specific scalar selectors without registering an execution profile
- checkpoint-only checked Compensation declaration and global synchronous throw node, with strict shared-schema and Lean decoding, exact dormant-scope/profile admission, and deterministic lowering to the existing optional `compensationActivityRetention`, `compensationEventSubProcessSnapshots`, `compensationExecution`, and `triggerCompensation` contracts; no product profile is registered
- `choose` carries exactly two declaration-ordered typed Simple Boolean candidates and one distinct default
- `selectMany` carries two canonically ordered typed Simple Boolean candidates plus one default, each retaining its branch-local expected join input and one split-derived selection key; `synchronizeSelected` waits for the selected subset without changing `synchronize`
- `awaitEventRace` carries one named operation-addressed Message arm and one named exact-`PT1S` Timer arm with their configuration-flow origins, catch identities, and distinct winner outputs; its configuration Flows are not control places
- `awaitMessageBoundedUserTask` carries one User Task body and one operation-addressed payload-free Message handler with distinct normal and boundary outputs under one Activity-owned operation
- `mergeExclusive` carries a canonical nonempty input collection and one output, with reusable per-offered-token declarative pass-through and a unique-offer executable subset; only the registered cycle profile fixes its input count at three
- ordinary `awaitUserTask.task` carries exact optional passive E2 metadata under the registered assignment/form profile; bounded and monitored User Task operations remain unchanged
- deterministic TypeScript lowerer and independent Lean decoder/lowerer preserve admitted scope ownership, condition, mapping, route, and exact source data
- exact Message Start lowering preserves Process, Start Event, Interface, Interface Operation, input Message, and every validated outgoing-flow identity; reusable `initiateMessage` admits canonical nonempty outputs while the registered capability fixes one
- exact Timer Start lowering preserves Process, Start Event, `PT1S -> 1000`, and every validated outgoing-flow identity; reusable `initiateTimer` admits canonical nonempty outputs while the registered capability fixes one
- exact Terminate End lowering preserves End Event origin, incoming control place, and containing definition scope while producing no continuation output
- exact sequential Multi-Instance lowering preserves the outer User Task, complete input/output role graph, normal route, one attached `PT5S` lifetime-Timer route, and fixed profile limits without carrying runtime counters, snapshots, task occurrences, or output slots
- exact parallel Multi-Instance lowering preserves that direct role graph, the Simple Boolean completion expression and binding, normal and Timer routes, and fixed profile limits without carrying runtime controllers, child occurrences, or result slots
- independent sequential, bounded-parallel, exact-timer, Timer/User Task composition, operation-addressed Intermediate Catch Message and direct-Message Receive Task subscriptions, payload-free effect, mapped-success Service Task, mapped-boundary-Error Service Task, Simple Boolean conditional evaluation, ordinary embedded Sub-Process completion, direct-parent Sub-Process Error propagation, bounded called-Process invocation/return, and registered resumption-bounded cycle execution
- generic Lean relation/evaluator including choice, effect-completion, and operation-step soundness, laws, and non-laws
- separately gated frozen checked-source experiment

### BPMN source

- Exact byte capture and SHA-256
- UTF-8/security preflight
- private `bpmn-moddle@10.0.0` import
- warning/reference-loss rejection
- bounded machine-readable Compensation calibration for `IntermediateThrowEvent`, `CompensateEventDefinition`, `Association`, Process artifact containment, Activity `isForCompensation`, and Compensation event wait/activity references; these facts arm reference and Boolean-preservation infrastructure but add no source admission or semantic interpretation
- bounded compilers for the sequential User Task, balanced parallel, exact `PT1S` timer, profile-parameterized finite acyclic Timer/User Task composition, operation-addressed payload-free Intermediate Catch Message in both Message/User Task orders, one direct-Message payload-free Receive Task, one top-level operation-addressed payload-free Message Start Event, one top-level exact `PT1S` Timer Start Event, one exact operation-addressed Message-versus-`PT1S` Event-Based Gateway configuration, payload-free Service Task, one exact configured Task extension, and bounded mapped-success and mapped-boundary-Error Service Task shapes
- bounded compilers for the exact two-condition-plus-default Simple Boolean Exclusive Gateway, one exact resumption-bounded User Task cycle with an identity-only converging Exclusive Gateway, one structured two-condition-plus-default Inclusive Gateway split/direct-User-Task/join region, one-level ordinary embedded Sub-Process completion, one direct exact-code Sub-Process Error-propagation shape, one exact nested Terminate End shape with omitted or parser-safe false `triggeredByEvent`, and one exact namespace-qualified in-document called Process
- one exact sequential Multi-Instance User Task compiler for the reviewed batch-review graph, two ItemDefinitions, four DataObject/DataObjectReference declarations, reciprocal IO sets, four direct associations, explicit sequential `All` behavior, and one interrupting `PT5S` outer-lifetime Timer; the registered standards-only profile executes the exact lowered operation
- one exact parallel Multi-Instance User Task compiler for the reviewed parallel-risk-review graph, the same direct role structure, explicit parallel `All`, one exact Simple Boolean completion condition, one `completionPolicy` start binding, and one interrupting `PT5S` outer-lifetime Timer
- one exact direct Activity data-input compiler for the reviewed invoice-review graph: one Process `Property`, one required scalar `DataInput` carrying only `id` and `name`, one `InputSet` referencing exactly it, one empty `OutputSet`, and one `DataInputAssociation` whose `sourceRef` and `targetRef` resolve by object identity in the parser graph rather than by name
- one exact direct Activity data-output compiler for the reviewed credit-underwriting graph, mirroring the input reader's object-identity resolution in the opposite direction: the Activity-owned `DataOutput` is the association's `sourceRef` and the Process `Property` is its `targetRef`, the `InputSet` is the empty one, and `optionalOutputRefs`, `whileExecutingOutputRefs`, and `inputSetRefs` are required absent because each would change what "required" means for the single declared member
- one exact checkpoint-only Message key-correlation reader for the reviewed settlement-confirmation graph, including parser-graph identity for every Collaboration, Conversation, Message Flow, correlation, subscription, binding, Message, ItemDefinition, and Process Property reference; exact `payload` and `property:<id>` scalar paths; and deterministic lowering to the distinct correlated catch arm
- one exact checkpoint-only Compensation compiler built on the private provenance reader: it resolves a direct root global synchronous throw, two boundary-handler triples, one contained Compensation Event Sub-Process parent/handler pair, the direct restored Property-to-DataInput binding, and one direct Sequence Flow dependency by parser-object identity; inline and resolved-reference Compensation definitions normalize to the same semantic fields, `associationDirection`, boundary cancellation, catch completion, and Compensation Start interruption do not classify meaning, and targeted or asynchronous throws, unresolved or ambiguous edges, unmarked handlers, wider graphs, and handler participation in normal Sequence Flow refuse before lowering
- one registered compiler for an omission-only interrupting, payload-free Message Boundary Event on one User Task, resolving `attachedToRef`, `messageRef`, and `operationRef` through the parser graph and refusing explicit `cancelActivity`, payload, misattachment, a mismatched definition chain, or a second handler
- one registered E2 source reader for exact URI-expanded `candidateGroups` plus one exact `formData/formField`, including local or root alternate prefixes, quote-aware raw duplicate-attribute parser-erasure refusal across quoted delimiters and line terminators, exact boundary-space and literal restrictions, checked-to-IL metadata binding, and physical omission on metadata-free tasks
- reusable checked-source scope ownership, reference, arity, scope-local reachability, co-reachability, and profile-selected whole-graph or User-Task-cut acyclicity validation separated from profile mechanism/cardinality capability
- explicit expression-language admission, strict five-form parsing, exact checked-body retention, and process-level Sequence Flow declaration order independent of gateway reference order
- exact source/profile admission maps built-in or overlay-supplied source bindings to profile-owned neutral effect descriptors while checked graphs retain only generic conditions, mappings, route/reference metadata, resolved Message channels, names, and source-overlay identity
- BPMNDI/modeler metadata remains outside semantics
- one internal standard-notation capability shared by two registered profiles classifies parsed material three ways through [a closed recursive classifier](../packages/bpmn-source/src/preserved-element-classification.ts): a container is preserved only when every descendant is, references are excluded from the walk so a preserved shape may point at an executed element, and each preservation-enabled source reaches its independently authored twin's checked graph and program once exact-source identity is normalized away. Standard Definitions `name`, `exporter`, and `exporterVersion` remain only in the retained exact source bytes and do not enter the checked graph, Semantic Process program, runtime state, or public observation
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

**Implemented and green.** [The compiler](../packages/bpmn-source/src/compile.ts) refuses, on the exact decoded source, any occurrence of a `Boolean`-typed attribute whose lexeme the coercion does not preserve. `0` is admitted and `1` is not, which is the disagreement rather than a canonicality rule; an entity-encoded spelling of a valid boolean is refused as well, and that over-rejection is recorded rather than fixed. The attribute set derives from the metamodel manifest's `Boolean` properties rather than a list, so a boolean added to the bounded calibration is covered before a source reader can depend on it; the Compensation checkpoint therefore cannot admit ambiguous `isForCompensation`, `waitForCompletion`, `cancelActivity`, or `isInterrupting` values through parser coercion.

**Owner-confirmed on 2026-08-07.** Refusing only the disagreement is what keeps the Event-Based Gateway specification's admitted `instantiate="0"` valid. Enumerated defaults stay outside the rule, because BPMN 2.0.2's own machine-readable artifacts disagree on the only such literal.

## Explicitly absent

### Wire contracts

- Parallel legacy schemas, migration readers, compatibility switches, general assertion language
- negative, fractional, unsafe, nested, heterogeneous, or other values; integer use outside M6 completion; String-list use outside M6 completion and the exact profile-gated sequential and parallel Multi-Instance Process-start bindings
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

- General BPMN compiler, arbitrary graph admission or scope nesting, cycles outside the exact registered User Task cycle profile, concurrent Multi-Merge execution, Standard Loop Characteristics, Multi-Instance beyond the exact registered slices, other Exclusive Gateway topology/cardinality, general FormalExpression/JUEL/XPath, Service Task/data/error bindings beyond the approved shapes, catch-all/multi-handler/ancestor Error search, timers beyond each family's exact `PT5S` or `PT1S` lexeme, external/imported/deployed Call targets, Global Tasks, Call data/mapping/version/tenant/recursion/repetition, synchronous parser CPU isolation, non-UTF-8 decoding, source locations, general extension semantics, DI-preserving export, complete CMOF binding, and deployment storage
- Compensation source/profile admission beyond the exact checkpoint topology, targeted or asynchronous throws, wider handler bodies or mappings, other dependency graphs, and every registered Compensation capability; the implemented checkpoint establishes no live execution or product support
- addressless, operation-addressed, instantiating, or data-bearing Receive Task; Message payload beyond the exact one-output catch profile and one checkpoint-only correlated source; Message key/global correlation beyond that checkpoint; modeled throw; Message Flow execution; and other Message Event loci
- Message Boundary forms beyond the exact registered Activity profile
- multiple or mixed Message Start Events, Event Sub-Process start, explicit `isInterrupting`, referenced or repeated MessageEventDefinitions, payload, Message Flow execution, routing, buffering, correlation, or definition-version fanout
- An element on refusals over the document or checked graph, on unsupported values of consumed keys, or on nested event-definition and mapping-child failures that have no separately reviewed inventory. Those remain `unsupportedModel` records with `element: null`. Preserved material is retained only in the exact source bytes, with no query surface or public projection
- The whole BPMN data family, and foreign content at every undeclared locus. A mapped Service Task overlay may declare only exact inert expanded-name/element-type pairs; unconsumed attributes, wildcards, and whole-type exemptions reject

## Evidence owners

The schema and artifact catalogs under [`contracts/`](../contracts/README.md) and [`profiles/`](../profiles/README.md), source-package tests, [Semantic Process IL specification](SEMANTIC-PROCESS-IL-SPEC.md), [BPMN requirement ledger](BPMN-REQUIREMENT-LEDGER.md), and owning semantic capsules bind these claims. Exact gate method remains in [TESTING-SPEC.md](TESTING-SPEC.md).

## Nearest unsupported claims

- **Interchange breadth:** the closure-reviewed first named profile composes standard Diagram Interchange, lanes, definitional Collaboration presentation, documentation, selected artifacts, and standard Definitions metadata with the existing CIB Seven User Task Process-data account. Broader safe inert metadata and additional executable profiles remain separate reviewed additions; CIB runtime metadata still requires an explicitly selected compatibility need.
- **Process Execution closure:** refresh the requirement ledger, CIB `2.2.0` breadth inventory, and deduplicated corpus after every semantic closure, then select the next reusable gap by normative dependency, semantic risk, and practical reach. The remaining program includes definition and import closure, general Process and Sequence Flow composition, Activity and Task lifecycle breadth, remaining Gateway and Event behavior, arbitrary scope nesting, data and expression coverage, Collaboration and Message Flow, and the line-by-line requirement extraction required before any Process Execution Conformance percentage or claim exists.
- **Source admission:** a general BPMN compiler, arbitrary graph and scope admission, general expressions, correlation beyond the exact checkpoint-only scalar path, broader data, imported Call targets, and DI-preserving export remain absent. The exact exclusions stay in the implemented/absent inventory above and the owning capsules.
- **Wire contract:** parallel legacy schemas, migration readers, compatibility switches, a general assertion language, wider numeric domains, and identifier normalization remain absent.
