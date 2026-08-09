# A12 add-on boundary proposal

## Status

Draft material correction after the rejected first semantic checkpoint. The owner directed that A12-specific work be preserved but moved out of the core product and that the resulting boundary prepare for a later separately owned add-on. The prior approval does not authorize the revised payload-free Service Task preservation guarantee below; that correction requires a new context-cold proposal review and owner approval before implementation resumes.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `59bcefc` | `fork-turns-none` | `reject` | `not-required` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

The original proposal review used two correction rounds. The context-cold review of `8e46a2e` required a profile-owned descriptor allowlist, preservation of the existing non-A12 Service Task profile and BPMN source, separate frozen and current evidence generations, fresh neutral CIB relationships, and complete guard and preservation obligations. Correction `6bbcf42` closed those findings on substance but left the preservation baseline unnamed. Correction `4619b74` bound every legacy oracle and manifest to immutable pre-extraction target `02330ad`, and the same reviewer approved that proposal version. Semantic-checkpoint target `59bcefc` was rejected because the shared Semantic Process schema retained A12 constants, the frozen dependency closure was incomplete, and the proposal's four-artifact byte-preservation guarantee conflicted with the mandatory wire replacement. The first two findings implement the previously selected contract; the third requires the material correction reviewed here.

## Question

How can the MIT BPMN engine and platform contain no A12-specific production decision while preserving the implemented CreateDocument and boundary-Error work as evidence and allowing a future separate A12-owned product to bind exact A12 source and handlers through a narrow add-on surface?

The correction must resolve the current mismatch between the product division and the implementation. A12 Workflows is product 3, but A12 profile identities, exact business literals, exact model topology, binding tokens, and result values currently participate in BPMN admission, Lean profile admission, semantic-core profile checks, Temporal probe behavior, registered profiles, and the default differential catalog.

## Recommended boundary

Product 1 retains the reusable semantic mechanisms already established by the two vertical slices: string/null values, literal input mapping, Activity-local result patches, local-variable output mapping, mapped successful effects, typed BPMN Error results, exact-code interrupting boundary routing, and the selected CIB caught-path mapping order. Their engine-owned profiles, fixtures, operations, Lean rules, TypeScript behavior, and Temporal witnesses become product-neutral.

A12-specific material becomes downstream adoption evidence. It is not exported by an engine package, selected by a built-in compilation dispatch, admitted by an engine-owned semantic profile ID, executed by the default product catalog, or recognized by a Lean, semantic-core, or Temporal branch. The exact external checkout remains optional and read-only under the existing `adoption` scope.

A future A12-owned add-on may provide data-only source overlays and effect handlers while consuming products 1 and 2. It may not provide a compiler callback, checked graph, lowerer, Semantic Process operation, semantic transition, canonical projection, or Temporal Workflow implementation.

```text
separate A12-owned product
  source-overlay artifacts + effect handlers + migration
                    |
                    v
MIT BPM platform public contract
                    |
                    v
product-neutral source overlay boundary
                    |
                    v
MIT engine profiles -> checked graph -> Semantic Process -> semantic core -> Temporal
```

## Product ownership

| Surface | Product 1, MIT engine | Product 2, MIT platform | Product 3, separate A12 add-on |
|---|---|---|---|
| BPMN and CIB meaning | Owns closed product-neutral profiles and all semantic mechanisms | Consumes only published engine results | Selects an engine profile; defines no BPMN meaning |
| Source extension | Validates one closed data-only overlay schema and compiles supported generic source shapes | Stores the selected overlay identity and submits it with exact bytes | Supplies A12 binding tokens and inert metadata declarations |
| External effects | Publishes neutral effect descriptors and validates typed results | Hosts configured Workers and routes no semantic state around the engine | Supplies A12 handlers behind the neutral Worker contract |
| Models and migration | Contains product-neutral fixtures | Provides upload, storage, admission, and execution services | Owns A12 models, rewrites, compatibility dispositions, and migration |
| Evidence | Retains generic CIB, Lean, core, Temporal, and differential evidence | Supplies showcase acceptance | Owns exact A12 product acceptance; this repository may retain optional read-only calibration evidence |

## Public source-overlay contract

The source overlay is a deeply immutable, JSON-serializable artifact. It selects no semantic operation family. It binds exact source tokens and inert source metadata only to capabilities already admitted by one engine-owned semantic profile.

```ts
type BpmnSourceOverlay = DeepReadonly<{
  kind: "bpmnSourceOverlay";
  id: string;
  semanticProfile: string;
  effectBindings: Array<{
    source: {
      implementation: string | null;
      delegateExpression: string;
    };
    descriptor: {
      protocol: string;
      operation: string;
    };
  }>;
  inertAttributes: Array<{
    elementType: string;
    expandedName: {
      namespaceUri: string;
      localName: string;
    };
  }>;
}>;

type SourceOverlayIdentity = DeepReadonly<{
  id: string;
  sha256: string;
}>;
```

The engine accepts an overlay only when the compile request names a registered overlay by exact ID and SHA-256 and supplies the exact matching bytes. It rejects an ID, digest, or `semanticProfile` mismatch before structural projection. The engine enforces a 65,536-byte limit before calculating SHA-256 and before decoding.

`effectBindings` remains in engine semantic-profile artifacts. It owns both the built-in engine source bindings and the exact closed set of allowed neutral effect descriptors for that profile. An overlay supplies alternate source bindings only. Every overlay descriptor must exactly equal a descriptor already present in the selected profile's `effectBindings`; a descriptor allowed only by another profile rejects. This preserves the existing non-A12 payload-free Service Task profile artifact and BPMN source fixture byte-for-byte and gives them no overlay or successor identity. The scenario remains semantically overlay-free but receives the mandatory `sourceOverlay: null` wire field, and its retained evidence changes only by rebinding the resulting scenario digest.

`inertAttributes` is the closed expanded-name policy previously planned only for the CreateDocument reader. Both overlay fields are source admission facts, not semantic behavior. An overlay cannot select a checked-node kind, Semantic Process operation, transition, result shape, host behavior, or descriptor outside the selected profile.

The overlay schema has `additionalProperties: false`; at most 64 `effectBindings`; at most 64 `inertAttributes`; nonempty scalar strings of at most 1,024 Unicode scalar values; and `id` and `semanticProfile` strings of at most 256 Unicode scalar values. Duplicate JSON object keys and unpaired surrogates reject at the shared wire boundary. Duplicate source bindings reject even when their descriptors differ, and duplicate expanded-name/locus pairs reject.

Canonical order uses the exact, unnormalized Unicode-scalar sequence as the comparator. Effect bindings sort by `source.implementation`, with `null` before strings, then `source.delegateExpression`, `descriptor.protocol`, and `descriptor.operation`. Inert attributes sort by `elementType`, `expandedName.namespaceUri`, and `expandedName.localName`. The schema contains no function, module path, executable expression, regular expression, wildcard namespace, wildcard element type, default allow rule, or arbitrary property bag.

## Identity and compilation contract

Compilation selects exactly one engine-owned `semanticProfile` and zero or one registered `sourceOverlay`. `sourceOverlay.semanticProfile` must exactly equal the selected profile. Exact BPMN bytes, semantic-profile identity, overlay identity and digest, and compiler identity jointly determine the admitted definition.

Checked graphs and Semantic Process programs add `sourceOverlay: SourceOverlayIdentity | null` beside the existing source/profile identity. Canonical result provenance and effect-transport identity preserve the same value. Lean, the semantic core, and Temporal retain and compare this identity but never branch on the overlay ID.

The generic compiler, not the overlay, reads supported Camunda/CIB extension structures. It parses the currently established bounded mapping forms and boundary-Error structures, validates them against the selected engine profile, and lowers them to the existing neutral descriptors and mapping data. The overlay only supplies the exact source binding and inert-attribute declarations that the generic compiler cannot infer as engine meaning.

The built-in compilation registry contains only engine-owned profile readers and the generic fallback. Overlay lookup occurs inside the mandatory admission policy selected by that registry, so neither a missing overlay policy nor an add-on-specific reader can bypass reference validation, foreign-attribute classification, per-element diagnostics, checked-graph validation, or lowering validation.

## Product-neutral replacement profiles

The exact current semantic behavior moves to two product-neutral CIB Seven `2.0.0` profiles:

- a bounded mapped-success Service Task profile with one literal string input, one Activity-local string result, and one simple local-variable output mapping;
- a bounded mapped-boundary-Error Service Task profile with the existing string/null patch, caught-path output mapping, exact-code interrupting route, and trailing User Task.

Their project-authored fixtures use neutral element IDs, mapping names, values, Error code, effect-handler tokens, and built-in source bindings. Their built-in `effectBindings` own the descriptors that an optional overlay may reference. No production fixture, profile ID, capability key, diagnostic, Lean namespace, semantic-core test subject, Temporal source branch, or example plan contains `A12`, `CreateDocument`, `createDocumentDelegate`, `createRelationshipLinkDelegate`, `RelationshipModel`, `LinkLimitReachedError`, or another A12 business literal.

Every CIB relationship selected by either neutral profile receives a fresh relationship-register entry and fresh evidence at the neutral claim boundary. Neither neutral profile selects an existing exact A12 relationship ID. The existing A12-specific relationship entries and immutable evidence remain retained as adoption evidence and are not relabeled as generic proof. The existing non-A12 payload-free Service Task profile keeps its current identity, bytes, relationship IDs, and BPMN source bytes. Its scenario adds only `sourceOverlay: null`, and its evidence changes only at the content-bound scenario digest required by that field.

## Preserved A12 evidence

Preserved evidence has two explicitly separate generations.

The immutable pre-extraction target is `02330ad0f980a5fc282cc0aa93600a9632b86c3e`. The frozen export, legacy manifest, original validator and projector, and preservation oracle all bind to that exact commit.

The frozen legacy generation contains the two existing A12 profile artifacts, scenarios, project-authored source fixtures, retained CIB evidence, exact source-admission calibration, Lean fixtures, TypeScript fixtures, Temporal fixtures, and Java probe material under one optional adoption-evidence root. Every byte remains unchanged. A manifest records every original path, new path, and SHA-256. Current profile and scenario registries do not enumerate this generation, and current validators do not accept it. It is a pre-extraction baseline, not a production compatibility reader.

The current adoption generation contains overlay-aware scenarios and evidence using the current schemas, a neutral semantic-profile identity, and exact overlay identity. Current validators accept only this generation. It also continues to read exact A12 source only from the pinned external checkout.

The optional `adoption` gate validates and projects the frozen generation with the exact pre-extraction target's original tooling in an isolated Git export, validates the current generation with current tooling, and compares their neutral checked graphs, Semantic Process operations, canonical observations, and CIB host projections after applying one explicit translation from the legacy semantic-profile identity to the neutral semantic-profile plus overlay identity. It does not add a parallel legacy reader to production or current validation code.

No production package exports the retained A12 overlay artifacts. No product-1 profile or scenario registry enumerates them. The complete MIT product gate runs without an A12 checkout or A12 overlay while still running the product-boundary guard that proves the production roots do not depend on the optional evidence root.

This repository does not implement the production A12 add-on, handlers, façades, migration, or packaging. The retained overlay artifacts are compatibility evidence for the extension contract. Product 3 owns any distributable or deployable A12 realization.

## Required invariant matrix

| Fact | Product-neutral engine profiles | Retained A12 adoption evidence | Future external A12 add-on |
|---|---|---|---|
| May select existing engine semantic mechanisms | Required | Required through the overlay contract | Required |
| May add a semantic mechanism or operation | No | No | No |
| May supply exact source binding tokens | Built-in profile binding only | Yes, optional alternate binding only | Yes, alternate binding only |
| May supply inert expanded-name attributes | Built-in neutral fixture only | Yes, through the overlay | Yes |
| May inject a reader, lowerer, validator, or Workflow | No | No | No |
| May contain A12 business literals | No | Yes | Yes |
| Participates in the default product catalog | Yes | No | No |
| Participates in the optional adoption lane | No | Yes | Product-owned |
| Defines BPMN or CIB meaning | Engine profile only | No | No |

## Required, optional, and excluded

Required:

- remove A12-specific identities and business literals from all product-1 production decision paths;
- preserve the implemented mapping and boundary-Error semantic mechanisms under product-neutral profiles;
- preserve the frozen legacy A12 generation byte-for-byte and create a distinct current overlay-aware adoption generation;
- replace exact A12 readers with generic engine-owned source projection plus the closed data-only overlay;
- content-bind overlay identity through checked source, Semantic Process, transport, and evidence provenance;
- retain parser-warning, reference-target, foreign-content, per-element diagnostic, checked-graph, lowering, and profile-capability enforcement for every overlay-selected compilation;
- make the default product build, profile catalog, scenario catalog, Lean umbrella, semantic-core runtime, and Temporal runtime independent of the adoption root;
- add an executable guard over the complete product-source and built-in artifact inventories rather than a hand-maintained subset.

Optional:

- keep A12-named research, provenance, and optional evidence documentation in this repository;
- retain exact external A12 admission as an explicitly selected local calibration lane;
- allow a future separately distributed product to register more than one overlay against the same engine profile, within the closed schema and resource bounds.

Excluded:

- deleting the existing A12 code or evidence merely to make a search green;
- publishing an A12 add-on from this repository;
- importing A12/EUPL source, dependencies, generated code, or runtime artifacts into products 1 or 2;
- an executable plug-in API, arbitrary compiler callback, user-supplied JavaScript, dynamic module loading, or code generation;
- overlay-defined BPMN meaning, checked-graph shapes, operation kinds, transitions, canonical observations, retry policy, Temporal orchestration, or proof claims;
- general JUEL, arbitrary Camunda extensions, arbitrary mappings, arbitrary Service Task bindings, or broader A12 compatibility;
- compatibility aliases or parallel production readers for the frozen legacy generation after the atomic pre-release replacement.

## Separating evidence and guards

The first red guard scans every production source file, built-in profile artifact, registered product scenario, product example, and Lean umbrella transitively, including their complete import and catalog dependency closure. Its closed forbidden production-decision inventory is a manifest generated from the legacy profiles, scenarios, source fixtures, production identifiers, and catalog registrations at the immutable pre-extraction target. The guard fails if regeneration changes that manifest, so removing a name from a hand-maintained list cannot hide a remaining dependency.

The manifest includes at least the exact profile IDs, claims, source IDs, and scenario IDs; `urn:bpmn-lean:a12-delegate:v1`; `urn:bpmn-lean:a12:create-document`; `createDocumentDelegate`; `createRelationshipLinkDelegate`; `A12CreateDocument`; `a12CreateDocument`; `A12BoundaryError`; `a12BoundaryError`; `CreateDocument`; `createDocumentDelegateTemplate`; `documentModelName`; `MyDocumentModel`; `myDocumentReference`; `newDocRef`; `CreateRelationshipLinkTask`; `relationshipModel`; `RelationshipModel`; `relationshipLinkId`; `newLinkId`; `LinkLimitReachedError`; `Error_LinkLimitReached`; `BoundaryEvent_LinkLimitReached`; `ErrorEventDefinition_LinkLimitReached`; and `ExpectedUserTaskAfterBPMNError`, together with their exact current XML names and generated operation, scope, and fixture identifiers. Those values are allowed only in the optional adoption-evidence root, research and provenance documentation, and the guard's own adversarial fixtures. Moving one file while leaving another profile switch, probe predicate, fixture, registry entry, or transitive import therefore remains red.

The source-overlay decoder receives adversarial artifacts containing a reader module path, an extra operation descriptor, a wildcard attribute, a duplicate expanded name, duplicate source bindings that point to different descriptors, a descriptor registered only by another profile, an overlay/profile mismatch, an unknown property, an overlong scalar, an oversized byte payload, and an oversized entry set. Every mutation rejects before structural projection.

The compilation-dispatch guard seeds an add-on-specific reader into production source and must fail. It also compiles one overlay-selected model carrying both an unsupported foreign attribute and an unsupported executable node, proving that generic multi-finding classification remains intact.

The retained A12 adoption oracle is bound to the immutable pre-extraction target. It runs that target's original validator and projector in an isolated Git export, compares frozen source and evidence bytes and digests byte-for-byte, then compares the legacy projections with current adoption projections after one explicit identity translation from the old A12 semantic profile to the new neutral semantic profile plus overlay identity. No field outside that declared identity translation may differ.

A separate payload-free Service Task preservation oracle compares the current profile, BPMN source, scenario, and CIB evidence with immutable target `02330ad0f980a5fc282cc0aa93600a9632b86c3e`. It requires exact profile and BPMN byte equality. For the scenario it permits only the addition of `bpmn.sourceOverlay: null`; for the evidence it permits only the corresponding scenario SHA-256 rebinding. Every other byte or projected field must remain equal.

An inert-attribute non-interference pair differs only by one declared inert attribute in its exact BPMN source. The source identity changes and the overlay identity remains equal. After normalizing only source identity, the checked graph and Semantic Process program are equal, and canonical runtime behavior is exactly equal.

The preservation gate also asserts unchanged command closure, unchanged multiple-enabled-state facts, and unchanged stable-wait facts for both neutral programs. Program-shape equality locks the absence of a new concurrent or multiple-enabled state. The Lean lane is `checked`, not proved: exact decoder, lowering, identity, and finite non-interference projections are checked, while no semantic transition family or new proof claim is introduced.

The product-only oracle builds and runs the default catalog with the adoption root made unavailable. A seeded import from any product package, Lean umbrella, profile registry, scenario registry, or example registry to that root must fail.

The nearest wrong account is a general plug-in registry that appears to move A12 out of core but allows the add-on to emit a checked graph or Semantic Process program. Its in-memory seeded callback must reach an explicit rejection or compile-time impossibility, rather than merely remaining unused by the retained fixture.

## Temporal hosting and refinement preflight

No semantic transition family changes. The mapped success and mapped BPMN Error results, Activity-local patch validation, output mapping, Error match, cancellation, command identity, and canonical observations remain core-owned and keep their existing state relation.

The Temporal adapter receives only a neutral committed effect descriptor and arguments. A configured Worker may implement that effect, but an overlay never enters Workflow code as executable policy. Attempts, retries, Worker replacement, cancellation, and replay remain host steps around the unchanged semantic wait.

The current CreateDocument- and relationship-specific probe branches are replaced by a registration-driven neutral test Worker whose result is selected by exact engine-owned descriptor plus committed arguments. Product-specific Worker registrations belong to the future add-on. An unknown registration fails as infrastructure and cannot fabricate a semantic result.

Adding overlay identity to the immutable program and effect-transport material is an atomic pre-release wire replacement. No production Event History baseline exists, so no compatibility branch or Workflow patch marker is retained. The focused Temporal evidence must show that overlay identity changes transport identity while identical overlay bytes replay exactly.

The smallest refinement witness runs a neutral mapped-success fixture and a neutral mapped-boundary-Error fixture through live Temporal Activities and replays both histories. The nearest adapter counterexample substitutes an A12-specific argument predicate or result literal in product source; the product-boundary guard and descriptor-registration mutation both fail it.

## Versioning and review consequences

The old A12 semantic-profile IDs remain immutable identities only inside the frozen legacy evidence generation and leave the built-in semantic-profile registry. The two new product-neutral profiles receive new IDs because their source surface and claim boundary differ. Current public checked-process, Semantic Process, scenario, evidence, transport, and report artifacts use the overlay-identity shape atomically; no alias maps an old A12 profile ID to a new profile, and no current validator accepts the frozen legacy schemas. The existing non-A12 payload-free Service Task profile and BPMN source keep their current identities and bytes; its scenario and evidence use the exact bounded wire-only changes above.

This changes semantic profile identity, source admission, shared wire identity, default catalog membership, and the product boundary. It therefore requires context-cold proposal review, a semantic checkpoint review after the first complete green cross-language replacement, and cold closure review unless the approved checkpoint reviewer qualifies for guarded warm continuity.

## Producers and consumers affected

The atomic change reaches the semantic-profile and checked-process schemas, profile/scenario/evidence registries, BPMN source admission and lowering, Lean profile admission and fixtures, semantic-core profile validation and tests, Temporal effect transport/probe/tests, CIB projection/evidence harnesses, differential catalog, runner examples, adoption tooling, documentation owners, and infrastructure guards.

The proposal does not prescribe file-by-file implementation sequencing. The implementation boundary is complete only when every product source and built-in artifact is product-neutral, every retained A12 artifact is manifest-bound under the optional adoption root, and both the product-only and adoption oracles are green.

## Stop conditions

Stop for owner direction if preserving the selected generic semantic mechanisms requires an A12 business literal in Lean, the semantic core, or Temporal; if the overlay must inject executable code or semantic shapes; if exact A12 evidence cannot be retained without copying or depending on EUPL material; if a generic profile would broaden mappings, expressions, bindings, Error behavior, or topology beyond the two approved mechanisms; if the default product gate requires the external A12 checkout; if the identity split cannot be made atomic across every wire consumer; or if the change requires a new dependency.

## Owner decisions after review

The recommended decisions are to adopt the product ownership table, the data-only overlay contract, the two product-neutral replacement profiles, optional retained A12 evidence, the closed no-executable-extension rule, and the atomic identity split. The owner is also asked to approve the revised payload-free Service Task preservation guarantee: the profile artifact and BPMN source remain byte-identical to `02330ad0f980a5fc282cc0aa93600a9632b86c3e`, the scenario may add only `bpmn.sourceOverlay: null`, and the evidence may change only by rebinding the corresponding scenario SHA-256. The rationale is that these decisions preserve all implemented semantic value and calibration evidence while making product 3 a true downstream consumer rather than a hidden source of product-1 branches.
