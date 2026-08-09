# A12 add-on boundary specification

## Status

Implemented and evidence-closed. Owner-approved proposal correction `8ae9b66`, semantic-checkpoint correction `398719b`, and closure correction `8d6ea1a` establish the stable boundary below. The MIT engine and platform contain no A12-specific production decision. A12-specific material is retained only as optional adoption evidence and a future separately owned add-on input.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `a44689e` | `fork-turns-none` | `approve-with-required-edits` | `8ae9b66` |
| Semantic checkpoint | `aa83b2f` | `fork-turns-none` | `approve-with-required-edits` | `398719b` |
| Closure | `8d6ea1a` | `checkpoint-reviewer-warm` | `approve` | `not-required` |

The closure reviewer used the approved checkpoint reviewer under warm continuity manifest `7756b73d6ff524adfca493f43c78e7d038a092607b834da494e1435fd141b6fc`. Rejected closure target `9a56f19` is historical. Correction `8d6ea1a` closed its four findings without changing the selected account, public contract, exclusions, or evidence strategy. The full proposal and review chronology remain in the [archived proposal](archived/A12-ADD-ON-BOUNDARY-PROPOSAL.md).

## Product boundary

Product 1 retains the reusable semantic mechanisms established by the two original vertical slices: string/null values, literal input mapping, Activity-local result patches, local-variable output mapping, mapped successful effects, typed BPMN Error results, exact-code interrupting boundary routing, and the selected CIB caught-path mapping order. Their engine-owned profiles, fixtures, operations, Lean rules, TypeScript behavior, and Temporal witnesses are product-neutral.

A12-specific material is downstream adoption evidence. It is not exported by an engine package, selected by built-in compilation dispatch, admitted by an engine-owned A12 profile ID, executed by the default product catalog, or recognized by a Lean, semantic-core, or Temporal branch. The exact external checkout remains optional and read-only under the separate `adoption` scope.

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
| BPMN and CIB meaning | Owns closed product-neutral profiles and all semantic mechanisms | Consumes only published engine results | Selects an engine profile and defines no BPMN meaning |
| Source extension | Validates one closed data-only overlay schema and compiles supported generic source shapes | Stores the selected overlay identity and submits it with exact bytes | Supplies A12 binding tokens and inert metadata declarations |
| External effects | Publishes neutral effect descriptors and validates typed results | Hosts configured Workers and routes no semantic state around the engine | Supplies A12 handlers behind the neutral Worker contract |
| Models and migration | Contains product-neutral fixtures | Provides upload, storage, admission, and execution services | Owns A12 models, rewrites, compatibility dispositions, and migration |
| Evidence | Retains generic CIB, Lean, core, Temporal, and differential evidence | Supplies showcase acceptance | Owns exact A12 product acceptance; this repository retains optional read-only calibration evidence |

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

The engine accepts an overlay only when the compile request names it by exact ID and SHA-256 and supplies the exact matching bytes. It rejects an ID, digest, or `semanticProfile` mismatch before structural projection. It enforces a 65,536-byte limit before hashing and decoding.

Engine semantic-profile artifacts retain `effectBindings`. Each profile owns its built-in source bindings and the exact closed set of allowed neutral effect descriptors. An overlay may supply alternate source bindings only, and every descriptor must exactly match one already present in the selected profile. A descriptor allowed only by another profile rejects.

`inertAttributes` is a closed expanded-name policy. Both overlay fields are source-admission facts, not semantic behavior. An overlay cannot select a checked-node kind, Semantic Process operation, transition, result shape, host behavior, or descriptor outside the selected profile.

The overlay schema has `additionalProperties: false`, at most 64 `effectBindings`, at most 64 `inertAttributes`, nonempty scalar strings of at most 1,024 Unicode scalar values, and `id` and `semanticProfile` strings of at most 256 Unicode scalar values. Duplicate JSON keys, unpaired surrogates, duplicate source bindings, and duplicate expanded-name/locus pairs reject.

Canonical order uses the exact unnormalized Unicode-scalar sequence. Effect bindings sort by `source.implementation`, with `null` before strings, then `source.delegateExpression`, `descriptor.protocol`, and `descriptor.operation`. Inert attributes sort by `elementType`, `expandedName.namespaceUri`, and `expandedName.localName`. The schema contains no function, module path, executable expression, regular expression, wildcard namespace, wildcard element type, default allow rule, or arbitrary property bag.

## Identity and compilation contract

Compilation selects exactly one engine-owned `semanticProfile` and zero or one registered `sourceOverlay`. `sourceOverlay.semanticProfile` must exactly equal the selected profile. Exact BPMN bytes, semantic-profile identity, overlay identity and digest, and compiler identity jointly determine the admitted definition.

Checked graphs, Semantic Process programs, scenario BPMN identities, canonical result provenance, completed-process receipts, and effect-transport identity retain `sourceOverlay: SourceOverlayIdentity | null`. Lean, the semantic core, and Temporal compare and preserve this identity but never branch on the overlay ID.

The generic compiler reads supported Camunda/CIB extension structures, validates the bounded mapping and boundary-Error forms against the selected engine profile, and lowers them to existing neutral descriptors and mapping data. The overlay supplies only exact source bindings and inert-attribute declarations.

The built-in compilation registry contains only engine-owned profile readers and the generic fallback. Overlay lookup occurs within the mandatory admission policy, so an overlay cannot bypass reference validation, foreign-attribute classification, per-element diagnostics, checked-graph validation, or lowering validation.

## Product-neutral profiles

Two product-neutral CIB Seven `2.0.0` profiles own the retained behavior:

- a bounded mapped-success Service Task profile with one literal string input, one Activity-local string result, and one simple local-variable output mapping;
- a bounded mapped-boundary-Error Service Task profile with the existing string/null patch, caught-path output mapping, exact-code interrupting route, and trailing User Task.

Their project-authored fixtures use neutral identities, names, values, Error code, handler tokens, and built-in source bindings. Their profile-owned `effectBindings` define the descriptors an optional overlay may reference. Product fixtures, profiles, diagnostics, Lean, the semantic core, Temporal branches, and examples contain no A12 business decision.

The neutral profiles use fresh CIB relationship entries and evidence. Existing A12-specific relationship entries and evidence remain adoption evidence and are not relabeled as generic proof.

The non-A12 payload-free Service Task profile and BPMN source remain byte-identical to immutable baseline `02330ad0f980a5fc282cc0aa93600a9632b86c3e`. Its scenario adds only `bpmn.sourceOverlay: null`, and its evidence changes only by rebinding the resulting scenario SHA-256.

## Preserved A12 evidence

The optional adoption root contains two separate generations.

The frozen legacy generation binds to immutable pre-extraction target `02330ad0f980a5fc282cc0aa93600a9632b86c3e`. It retains the two legacy profiles, scenarios, project-authored source fixtures, CIB evidence, source-admission calibration, Lean and TypeScript fixtures, Temporal fixtures, and Java probe material byte-for-byte. A manifest records original paths, retained paths, and SHA-256 values. Current product registries and validators do not enumerate or accept this generation.

The current generation contains overlay-aware scenarios and evidence using current schemas, neutral profile identities, and exact overlay identities. Current validators accept this generation. Exact A12 source is read only from the pinned external checkout.

The optional adoption gate runs the baseline validator and projector in an isolated Git export, validates the current generation with current tooling, and compares checked graphs, Semantic Process operations, canonical observations, and CIB host projections after one declared translation from a legacy A12 profile identity to a neutral profile plus overlay identity. No field outside that identity translation may differ.

No production package exports an A12 overlay artifact. No product registry enumerates one. The complete MIT product gate needs neither an A12 checkout nor an A12 overlay. The separate [future adoption handoff](../adoption/a12/current/README.md#resume-point-for-a-future-a12-add-on) owns the exact sequence for resuming this material in an A12-owned repository.

## Invariant matrix

| Fact | Product-neutral engine profiles | Retained A12 adoption evidence | Future external A12 add-on |
|---|---|---|---|
| May select existing engine semantic mechanisms | Required | Required through the overlay contract | Required |
| May add a semantic mechanism or operation | No | No | No |
| May supply exact source binding tokens | Built-in profile binding only | Alternate binding only | Alternate binding only |
| May supply inert expanded-name attributes | Built-in neutral fixture only | Yes, through the overlay | Yes |
| May inject a reader, lowerer, validator, or Workflow | No | No | No |
| May contain A12 business literals | No | Yes | Yes |
| Participates in the default product catalog | Yes | No | No |
| Participates in the optional adoption lane | No | Yes | Product-owned |
| Defines BPMN or CIB meaning | Engine profile only | No | No |

## Required, optional, and excluded

Required:

- product production paths remain free of A12 identities and business decisions;
- mapped-success and mapped-boundary-Error mechanisms remain product-neutral;
- overlay identity remains content-bound through checked source, Semantic Process, scenario, receipt, transport, and evidence provenance;
- every overlay-selected compilation retains parser-warning, reference-target, foreign-content, per-element diagnostic, checked-graph, lowering, and profile-capability enforcement;
- product builds and runtimes remain independent of the optional adoption root;
- the frozen legacy generation remains byte-bound to immutable baseline `02330ad`.

Optional:

- A12-named research, provenance, and adoption evidence may remain in this repository;
- exact external A12 admission may run as an explicitly selected local calibration lane;
- a future separately distributed product may register multiple overlays against one engine profile within the closed schema and limits.

Excluded:

- publishing an A12 add-on from this repository;
- importing A12/EUPL source, dependencies, generated code, or runtime artifacts into products 1 or 2;
- executable plug-ins, compiler callbacks, user JavaScript, dynamic modules, or generated semantic code;
- overlay-defined BPMN meaning, checked shapes, operation kinds, transitions, observations, retry policy, Temporal orchestration, or proof claims;
- general JUEL, arbitrary Camunda extensions, arbitrary mappings, arbitrary Service Task bindings, or broader A12 compatibility;
- production aliases or legacy readers for the frozen generation.

## Temporal hosting and refinement

No semantic transition family changes. The mapped success and typed BPMN Error results, Activity-local patch validation, output mapping, Error matching, cancellation, command identity, and canonical observations remain core-owned.

The Temporal adapter receives only a neutral committed effect descriptor and arguments. A configured Worker may implement that effect. Overlay bytes never become executable Workflow policy. Attempts, retries, Worker replacement, cancellation, and replay remain host steps around the unchanged semantic wait.

Overlay identity participates in immutable program, receipt, and effect-transport material. Live Temporal evidence proves that different overlay identity changes the transport key while identical overlay bytes execute and replay exactly with the same canonical semantic result.

## Closure evidence

| Claim | Executable evidence | Limit |
|---|---|---|
| Product source has no A12-specific decision or optional-root dependency | [`a12-boundary.test.ts`](../scripts/a12-boundary.test.ts) derives the inventory from baseline `02330ad`, scans complete product and script-catalog closure, and seeds private literals, an add-on reader, and optional-root imports | Research, provenance, guard fixtures, and adoption evidence may retain A12 material |
| Overlay admission is data-only, content-bound, profile-owned, and bounded | [`source-overlay-admission.test.ts`](../packages/bpmn-source/test/source-overlay-admission.test.ts) covers exact identity and bytes, profile/descriptor isolation, closed shape, ordering, duplicates, Unicode, and resource limits | Only the two reviewed mapped Service Task source shapes and closed mapping forms are supported |
| Overlay identity changes provenance and transport, not semantics | Lean and TypeScript mapped-success checks plus [`mapped-success-temporal-tests.ts`](../packages/temporal-adapter/test/mapped-success-temporal-tests.ts) retain non-null identity, discriminate transport keys, execute a live Activity, compare the canonical result, and replay | Finite checked non-interference, not a universal proof |
| Checked and Semantic Process artifacts preserve the exact Error route | [`contract-definition-artifacts.test.ts`](../scripts/contract-definition-artifacts.test.ts) rejects independent and coherently renamed route fields and binds output to the checked Sequence Flow | Broader handler search and non-direct handlers remain outside the profile |
| No retained A12 evidence or payload-free Service Task artifact was silently discarded | [`a12-preservation.test.ts`](../scripts/a12-preservation.test.ts) verifies fixed-root frozen closure and the payload-free byte/wire-only guarantee | Current A12 artifacts are calibration evidence, not a production add-on |
| The MIT product is independent of the A12 checkout | Default verification selects no adoption input; the explicit adoption scope fails closed on a missing or changed checkout | Exact A12 source evidence belongs only to the separate adoption gate |

## Claim boundary and stop conditions

The established claim is that products 1 and 2 contain no A12-specific production decision while the reusable mapping and boundary-Error mechanisms and project-authored calibration evidence remain available behind a closed data-only overlay boundary.

The nearest unsupported claim is a deployable A12 add-on. Product 2 has no published package/API boundary, and product 3 has no production overlay registry, handlers, façade adapter, migration, or Workflows-enabled blueprint integration. The closed exact-model product count remains zero.

Stop for owner direction if preserving a generic mechanism requires an A12 business literal in Lean, the semantic core, or Temporal; if an overlay must inject executable code or semantic shapes; if exact evidence cannot remain separate from EUPL material; if a neutral profile must broaden mappings, expressions, bindings, Error behavior, or topology; if default verification needs the external A12 checkout; or if a new dependency is required.
