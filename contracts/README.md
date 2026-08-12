# Shared wire contracts

This directory owns language-neutral JSON Schemas for artifacts and canonical values that cross Java, Lean, TypeScript, and harness boundaries. Schemas define transport shape; semantic profiles and capsules define meaning.

## Evolution policy

The project is pre-release and keeps exactly one current representation of each wire contract. A breaking contract change replaces its producers, consumers, fixtures, schemas, and tests atomically. Parallel legacy readers, embedded format counters, compatibility switches, migration functions, and retained Temporal history baselines are deliberately absent until a first durable release boundary is approved.

Each document has a stable structural discriminator such as `semanticProfile`, `scenario`, or `cibSevenScenarioEvidence`. JSON Schema `$id` identifies the current schema itself. A semantic profile’s `id` identifies its reviewed behavioral meaning and declared normative or executable-oracle authority; changing that meaning or authority requires a new profile identity even when the JSON shape is unchanged.

This separation avoids routing every consumer through document-version switches while preserving the identity that actually matters to semantic claims. When production persistence or an immutable Temporal history baseline exists, compatibility must be designed from concrete retained artifacts and explicit migration/replay tests rather than speculative early formats.

## Artifact roles

| Artifact | Identity and responsibility |
|---|---|
| Semantic profile | Stable `kind`; versioned semantic `id`; exactly one normative authority or pinned executable oracle/configuration; selected feature surface, observation boundary, CIB–BPMN relationship references, and optional exact-source-binding-to-neutral-effect registrations |
| BPMN source overlay | Stable `kind`; exact ID and byte digest; one selected semantic profile; alternate source bindings restricted to that profile's existing descriptors; exact inert expanded-name declarations; no executable extension |
| Scenario | Stable `kind`; answer-free model/profile identity, one closed first stimulus chosen from manual Process start or an exact resolved Message or Timer Start trigger, later User Task completion, timer firing, Message delivery, and effect-result stimuli, requested observations, and provenance |
| Canonical result | Outcome plus canonical observation trace including semantic task, Message subscription, timer, and effect occurrences and canonical Process variables; no target-specific host data |
| CIB evidence | Stable `kind`; content digests for exact profile and scenario bytes; pinned producer and projection identity; raw runtime/history state-query, task, timer, effect, and mapping observations plus canonical result |
| Checked BPMN graph | Current `checkedProcess` contract; source-facing admitted graph with exact source/profile identity, identity-only Message and exact-duration Timer Start nodes, identity-only Terminate End, a distinct configured Task identity-plus-descriptor arm, resolved closed `operationMessage \| directMessage` channels, profile-owned neutral effect descriptors, identity-only Exclusive Merge, exact Inclusive split/join pairing, exact divergent Event-Based Gateway identity, and one resolved Call Activity/called-Process identity, with no raw extension, Camunda/A12 binding, or runtime semantics |
| Semantic Process program | Current `semanticProcess` contract; compiler/source/profile identity, typed control places and operations including channel-bound `initiateMessage`, duration-bound `initiateTimer`, and no-output containing-scope `terminateScope`, the same closed Message channel, neutral effect descriptors, reusable nonempty `mergeExclusive` inputs, selected-branch split/join contracts, one named Message/Timer race operation, and one paired called-Process invocation/return, with no mutable runtime state |
| Pipeline report | Stable `kind`; ephemeral verification report, provenance, comparisons, replay count, isolation, and timings |

Neutral scenarios contain no expected answer. CIB evidence is a separate immutable verifier input bound to the exact scenario and profile bytes. Target runners never receive it, and ordinary verification never regenerates it.

Schema validation is a boundary guard, not correspondence evidence. The maintained Ajv Draft 2020-12 gate validates artifacts, checks content identities and known CIB–BPMN relationships, and includes answer-smuggling, stale-evidence, and invalid-projection mutations. CIB calibration, Lean laws, TypeScript behavior, Temporal refinement, and differential comparison remain separate claim lanes.

## Exact scalar and JSON boundary

Every wire integer represented as a JavaScript `number` is an integer in the inclusive range `0..9007199254740991`, with stricter positive minima where the field requires one. Schemas state both bounds, and TypeScript, Lean, and the CIB adapter reject values outside them rather than rounding or narrowing them.

Canonical identifiers are exact, non-normalized strings of Unicode scalar values. Their order is lexicographic by scalar value, not JavaScript UTF-16 code units, Java `String.compareTo`, locale, UTF-8 bytes, or normalized text. Canonically ordered arrays use this comparison. Canonically equivalent Unicode spellings remain distinct unless a future contract explicitly changes the identity domain.

Wire readers reject duplicate object keys after escape decoding and reject unpaired surrogate encodings. Unknown or missing fields, values outside closed enums, `null` where absence is required, absence where an explicit nullable field is required, non-integral numbers, and non-canonical array order are all boundary errors. This strictness applies before typed semantic decoding; ordinary parser behavior that overwrites a duplicate key or replaces an invalid surrogate is not authoritative.

## Portable semantic assertions

A target scenario contains only admitted model/profile identity and explicit semantic inputs. The shared value union recognizes exact tagged string, null, and primitive Boolean arms, while profile-aware execution decides which surface may use each arm. `startProcess.initialVariables` remains string/null for every current and checkpoint profile; only the unregistered M3 checkpoint admits Boolean on User Task completion. Target runners produce canonical results without receiving expected outcomes, rule verdicts, oracle traces, or comparison tolerances.

Portable assertions are verifier-side claims over canonical results or relations between results. A future assertion artifact must bind the exact scenario content digest, semantic profile, applicable canonical observation contract, and stable rule identifiers. A general assertion language remains deferred until repeated semantic capsules demonstrate the smallest useful contract.

## Schemas

- [semantic-profile.schema.json](schemas/semantic-profile.schema.json) validates current draft profiles with exactly one normative or executable-oracle authority.
- [bpmn-source-overlay.schema.json](schemas/bpmn-source-overlay.schema.json) validates the closed data-only source overlay shape; byte limits, strict JSON decoding, canonical order, uniqueness, profile equality, and descriptor membership are enforced by the source boundary.
- [scenario.schema.json](schemas/scenario.schema.json) validates every registered answer-free target scenario. The registered scenarios and their capsule families are owned by the artifact registry and differential catalog, and this document deliberately does not restate that inventory: a copied list drifts silently, and the guarded catalogs already reject an unregistered scenario.
- [canonical-result.schema.json](schemas/canonical-result.schema.json) validates the current canonical outcome and trace.
- [cibseven-evidence.schema.json](schemas/cibseven-evidence.schema.json) validates the content-bound retained CIB evidence envelope.
- [checked-process.schema.json](schemas/checked-process.schema.json) validates the admitted source-facing graph contract.
- [semantic-process.schema.json](schemas/semantic-process.schema.json) validates the immutable Semantic Process definition contract.

The checked BPMN graph and Semantic Process schemas freeze the artifact boundaries from [the Semantic Process IL spec](../docs/SEMANTIC-PROCESS-IL-SPEC.md). The bounded source compiler produces both artifacts after structural graph and exact profile-capability admission has resolved operation-addressed Message definition chains or one direct Receive Task Message, definition-scope ownership, exact direct-parent Error handlers, identity-only Exclusive Merge endpoints, structured Inclusive split/task/join correspondence, exact Event-Based Gateway configuration-flow/catch correspondence, one namespace-qualified in-document called Process, raw Service Task bindings, and the exact configured Task extension binding. Every admitted path consumes only the Semantic Process program, with no per-family exception. The schemas validate transport shape; they do not establish raw source translation, lowering correspondence, or operational semantics.
