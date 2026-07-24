# BPMN XML ingestion decision

## Status

**Accepted and implemented on 2026-07-24.**

The approved direct runtime dependency is [`bpmn-moddle@10.0.0`](https://www.npmjs.com/package/bpmn-moddle), isolated in the new [`@bpmn-lean/bpmn-source`](../packages/bpmn-source/README.md) workspace package. Lean, the pure TypeScript semantic core, and the Temporal Workflow package remain independent of the parser.

The bounded evidence behind this decision is recorded in [the BPMN XML ingestion spike](experiments/BPMN-XML-INGESTION-SPIKE.md). Adoption changes only the source-ingestion boundary and the existing sequential capsule’s executable input; it does not approve a general executable IR, new BPMN behavior, CIB extensions, export, or a conformance claim.

## Decision

Use `bpmn-moddle@10.0.0` to construct a BPMN-metamodel-aware structural view during deployment. Preserve the exact original bytes and their SHA-256 digest as the source identity. Treat the moddle object graph as a derived structural view, never as the source of record or as executable semantic authority.

```text
untrusted BPMN bytes
        │
        ├──────────────► immutable source bytes + SHA-256
        │
        ▼
bounded XML security and encoding preflight
        │
        ▼
bpmn-moddle structural import
        │
        ├──────────────► normalized project diagnostics
        │
        ▼
profile-independent static admission
        │
        ▼
versioned project-owned executable IR
        │
        ├──────────────► Lean / TypeScript differential semantics
        └──────────────► Temporal Workflow input by content identity
```

Parsing and compilation happen outside Temporal Workflow execution. The Workflow receives immutable executable IR plus source/profile/compiler identities, not raw XML or moddle objects. The semantic core consumes only project-owned serializable IR and remains dependency-free.

`bpmn-moddle.toXML` is available for bounded interchange experiments but is not part of deployment or execution. Serializer output must never replace the original source bytes.

## Normative artifacts and semantic authority

The project targets [BPMN 2.0.2](https://www.omg.org/spec/BPMN/2.0.2), not the superseded BPMN 2.0 inventory. OMG’s 2.0.2 catalog points to the same normative machine-readable CMOF, XSD, and XSLT artifacts listed for 2.0. Their roles remain distinct:

| Source | Normative content | Project use | Does not establish |
|---|---|---|---|
| BPMN20, BPMNDI, DC, DI, and Infrastructure CMOF | Abstract metamodel packages, classes, inheritance, properties, associations, multiplicities, containment, and defaults | Versioned metamodel facts, structural coverage, source-model checks, and Lean well-formedness boundaries | XML lexical form or operational execution behavior |
| BPMN20, BPMNDI, DC, DI, and Semantic XSD | Concrete XML elements, attributes, namespaces, types, occurrence constraints, and schema composition | XML validation, negative import tests, and interchange qualification | Every cross-reference rule, deployment admission, or token semantics |
| `BPMN20-FromXMI.xslt` | Normative XMI-to-BPMN-XML transformation route | Transformation reference and future exchange-format test input | Production parsing or execution meaning |
| Specification prose, tables, figures, and issue dispositions | Static constraints, Process Execution Conformance obligations, Activity lifecycle, and operational behavior | Profile clauses, Lean transition semantics, CIB interpretation decisions, and semantic test witnesses | A directly executable formal model without project interpretation |

The machine-readable artifacts constrain the source language. The prose and issue dispositions constrain its operational meaning:

```text
                         OMG BPMN 2.0.2
                    ┌──────────┼────────────┐
                    │          │            │
                  CMOF      XSD/XSLT   prose/figures/issues
                    │          │            │
                    ▼          ▼            ▼
          metamodel facts   XML checks   semantic clauses
                    │          │            │
                    ├──────────┴────┐       │
                    ▼               ▼       ▼
           structural source model ──► executable IR
                                               │
                               ┌───────────────┼──────────────┐
                               ▼               ▼              ▼
                         Lean semantics   TypeScript core   Temporal host
```

The CMOF path can justify facts such as type inheritance, reference targets, ownership, multiplicity, and defaults. It cannot generate the meaning of traversing a Sequence Flow, joining a gateway, interrupting an Activity, completing a scope, or handling compensation. Those definitions come from the operational sources and explicit profile decisions.

### CMOF-derived metamodel facts

The implemented use of CMOF is a versioned, bounded metamodel manifest rather than a second hand-written BPMN type hierarchy. The first [tracked manifest](../packages/bpmn-source/src/bpmn-2.0.2-m0-metamodel.json) retains:

- exact BPMN 2.0.2 artifact identity;
- the qualified moddle type names consumed by the compiler;
- twelve classes and their direct generalizations;
- eight properties and their value types;
- lower and upper multiplicities;
- containment versus cross-reference distinctions;
- the specified Start Event default;
- explicit included and absent coverage.

A future reusable manifest may additionally need complete package/namespace identity, association opposites, enumerations, and the rest of the metamodel. Those fields are not claimed by this first slice.

That manifest can drive importer validation, supported/unsupported coverage, property-preservation tests, the TypeScript source projection, and the static well-formedness layer admitted into Lean. It remains build-time specification data; neither the pure semantic core nor a Temporal Workflow parses CMOF.

Lean should formalize the smallest reviewed executable fragment over checked source facts. CMOF justifies the structural premises—for example that a Sequence Flow has admitted source and target Flow Nodes—while Lean defines and proves the operational consequences. A full generated CMOF mirror would add large amounts of diagram, interchange, and modeling structure without supplying the missing execution semantics.

The first ingestion slice therefore does not generate complete TypeScript or Lean bindings. It records only the twelve class/generalization facts and eight property facts consumed by the sequential User Task compiler, including the Flow Element name type, reference targets, multiplicities, containment, and the Start Event default, and explicitly records absent coverage. The maintained checker compares the manifest’s exact source digest and every recorded fact with the ignored normative `BPMN20.cmof` when that corpus is locally available. The XML-facing compiler separately tests that the XSD-optional User Task name becomes `null` when omitted. A second semantic consumer must demonstrate the reusable manifest shape before the project generalizes its extraction machinery.

## Why `bpmn-moddle`

`bpmn-moddle` supplies the BPMN, BPMNDI, DI, and DC descriptors, metamodel-aware element construction, QName/namespace handling, ID indexing, reference resolution, generic extension-element representation, and import warnings. Rebuilding those mechanisms on a generic XML parser would add a second BPMN metamodel implementation before the project reaches operational semantics.

The library does not define BPMN execution behavior. It therefore fits the architecture better than importing another JavaScript workflow engine or CIB Seven’s Java model/PVM types. Its output still requires project-owned validation and compilation.

The exact `v10.0.0` source tag’s BPMN20, BPMNDI, DC, and DI CMOF resources are XML-canonical-identical to the project’s official BPMN 2.0.2 machine-readable corpus. The five XSD resources shipped in the npm package are content-identical to the official BPMN20, BPMNDI, DC, DI, and Semantic XSDs after CRLF normalization. This is strong metamodel-input evidence, but the official artifacts remain normative; the first runtime mapping is covered only by the bounded manifest and compiler tests and must be extended with each new consumer.

| Candidate | Decision | Reason |
|---|---|---|
| `bpmn-moddle@10.0.0` | Adopt | BPMN-specific structural import and round-trip support with a small MIT graph; widely exercised namespace, reference, DI, and extension behavior |
| Generic XML parser plus project-owned BPMN binding | Reject for the first ingestion slice | Would require early reimplementation of descriptors, type inheritance, QName handling, reference resolution, defaults, extensions, and DI |
| CIB Seven Java Model API as production importer | Reject | Couples deployment to the compatibility oracle, leaks external types across the language boundary, and makes CIB’s model account accidental authority |
| Generated TypeScript bindings from XSD/CMOF | Defer | Generation, schema mapping, reference resolution, extension policy, and generated-code maintenance are larger than the first concrete consumer |

## Preservation policy

“Source preserving” has several levels. This decision guarantees exact bytes and a content identity; it does not pretend that the library’s normalized graph preserves XML lexical form.

| Surface | Required policy |
|---|---|
| Exact source | Retain the original bytes unchanged and compute SHA-256 before decoding or parsing |
| Encoding | Record the declared encoding and actual decoder; never silently treat a non-UTF-8 declaration as UTF-8 |
| XML lexical details | Comments, whitespace, attribute order, prefix spelling, unused namespace declarations, and declaration formatting remain available only in the original bytes |
| BPMN structure | Use the derived moddle view for typed elements, declared order, IDs, references, BPMNDI/DI/DC, and registered attributes |
| Foreign extensions | Retain exact bytes regardless of parser support; retain the generic structural view when `bpmn-moddle` exposes it; unsupported extension meaning blocks executable admission when it can affect behavior |
| Parser warnings | Normalize and retain every warning; source capture may succeed, but executable admission is blocked by default |
| Round trip | Compare project-owned structural projections and explicitly declared preservation properties; never require or claim byte identity |
| Source locations | The library exposes line/column mainly in warning text, not a general stable location map; do not invent locations or claim source-range preservation |
| Temporal history | Store only content-addressed admitted IR and required identities in Workflow input/history; archive source bytes outside Workflow history |

The package does not export raw moddle objects as a public cross-package contract. It exposes project-owned source identity, defensive exact-byte copies, normalized diagnostics, and the smallest compilation boundary needed by the sequential User Task capsule. The external object graph remains private to the ingestion package.

## Admission and security policy

`bpmn-moddle` imports in lax mode and can return a structural result with warnings after discarding or normalizing invalid content. The project must therefore distinguish:

1. **source capture** — exact bytes and identity were retained;
2. **structural import** — a BPMN definitions graph was produced;
3. **static admission** — all required references and supported constructs passed project checks;
4. **profile admission** — the selected semantic profile defines every behavior needed for execution;
5. **execution** — versioned IR was accepted by the semantic core.

Any parser warning blocks static admission until a project rule explicitly classifies that warning as safe for the declared profile. The first implementation uses one stable `parserWarning` diagnostic code with the upstream message as evidence rather than a growing set of message-string special cases.

The importer accepts bytes plus a required caller-provided byte limit and parser Promise-settlement deadline. It rejects a DTD/DOCTYPE before structural parsing. The published parser probe did not resolve internal or external entities, but it accepted a bare DOCTYPE without warning; the explicit preflight avoids relying on that incidental behavior. Parsing untrusted large models is synchronous inside the library, so the current deadline cannot preempt blocked CPU work and a production upload boundary must eventually isolate parsing in a bounded Worker or process.

Encoding support remains an explicit open compatibility boundary. Six pinned MIWG files declare ISO-8859-1, while `bpmn-moddle` reports that encoding as unsupported and falls back to UTF-8. The ingestion package must not hide that warning. A later capsule can add a reviewed byte decoder and feed a derived UTF-8 parse buffer while retaining original bytes, declared encoding, and transformation provenance.

## Exact dependency and license audit

The lockfile and installed package manifests on 2026-07-24 resolve the adopted production graph as follows:

| Package | Role | License | Published unpacked size |
|---|---|---|---:|
| `bpmn-moddle@10.0.0` | Direct BPMN structural importer | MIT | 555,342 bytes |
| `moddle@8.2.0` | Metamodel object system | MIT | 220,418 bytes |
| `moddle-xml@12.1.0` | Metamodel-aware XML reader/writer | MIT | 134,799 bytes |
| `min-dash@5.1.0` | Shared small utilities | MIT | 29,119 bytes |
| `saxen@11.1.0` | Streaming XML tokenizer | MIT | 159,671 bytes |

The five-package production graph totals 1,099,349 published unpacked bytes. None is deprecated. Registry manifests contain no `preinstall`, `install`, or `postinstall` script. The final lockfile retains the exact approved direct version and tarball integrity; installation passed the repository supply-chain policy.

The exact `bpmn-moddle@10.0.0` tarball integrity is `sha512-vXePD5jkatcILmM3zwJG/m6IIHIghTGB7WvgcdEraEw8E8VdJHrTgrvBUhbzqaXJpnsGQz15QS936xeBY6l9aA==`.

The published package has no TypeScript declarations. `@types/bpmn-moddle@10.0.0` exists under MIT, but its `warnings` declaration is `string[]` while the runtime returns warning objects with `message` and sometimes reference metadata. The project did not add that known-inaccurate declaration package. The ingestion package owns a narrow declaration for only the imported constructor and parse boundary, then validates and projects returned values before they cross into project-owned types. The inspected upstream `main` tree is adding generated declarations, so a future published upgrade can remove this local seam after its actual runtime types are audited.

All adopted packages are compatible with the repository’s MIT license. They remain external packages and are not vendored or relicensed.

## Removal and upgrade cost

The dependency is isolated to one workspace package. Removing it deletes that package’s parser adapter and lockfile entries; the semantic core, Lean theory, scenario contract, comparator, and Temporal Workflow remain unchanged. Project-owned source identity, diagnostics, and executable IR contracts prevent moddle objects from becoming persistence or public API types.

Upgrades require rerunning the warning, preservation, security, MIWG, and structural-projection gates. A changed serializer output alone is not a semantic-core change. A changed element graph, reference outcome, warning set, default value, or extension projection is an ingestion compatibility change and must receive a new compiler/importer identity.

## Implemented first slice

The completed red/green slice is intentionally smaller than a general BPMN compiler:

1. create `@bpmn-lean/bpmn-source` with no dependency leak into the semantic core or Temporal adapter;
2. add red tests for exact byte/hash identity, the current sequential fixture, warning-blocked admission, DOCTYPE rejection, and a meaningful lost-reference mutation;
3. add exactly `bpmn-moddle@10.0.0` and inspect the resulting lockfile/license/script graph;
4. implement bounded import and a private moddle adapter;
5. project only the source facts needed to compile the existing None Start → User Task → None End model;
6. reject every unsupported BPMN element or extension at compile time rather than dropping it;
7. compile versioned, serializable IR v0.2 carrying source/profile/compiler identity plus the admitted User Task ID and optional name;
8. make the current TypeScript and Temporal paths consume that IR without changing the canonical behavior;
9. the optional local interchange gate inspects all 21 models at pinned MIWG revision `cb2629519cee6280ab521f99dc46a9815a221a35` without copying their CC-BY files: fourteen reach `unsupportedModel`, six are explicitly blocked as `unsupportedEncoding`, and one is blocked by `parserWarning`;
10. the complete differential/refinement pipeline now compiles the exact source before the core and Temporal targets, reports the IR identity, preserves four-target agreement and the seeded disagreement, replays new and retained histories, and remains within the existing performance budgets.

This slice does not add BPMN export, a general metamodel schema, all encoding support, CIB extension semantics, or any new executable BPMN feature.
