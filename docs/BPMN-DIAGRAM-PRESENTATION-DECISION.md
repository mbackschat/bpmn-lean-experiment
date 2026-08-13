# BPMN diagram presentation decision

## Status

**Implemented.** This decision selects embedded BPMN DI plus an exact-source-digest-bound generated presentation sidecar for BPM platform diagrams. The context-cold information-architecture reviewer approved the final corrected contract at `c3f6671`. The implementation is a non-semantic Product 2 increment covered by the presentation-foundation, Definitions, public-contract, server, web, package-boundary, source-hygiene, and platform-harness gates. It does not change BPMN source admission, checked Process meaning, Semantic Process IL, runtime state, or Temporal execution.

## Context

The execution pipeline correctly admits BPMN source that has no BPMN DI because diagram coordinates are not execution semantics. The M3 browser review nevertheless showed that a registered human-work model without DI produces an empty presentation and leaves users unable to understand the Process they are starting or the task they are completing.

Adding coordinates to the admitted XML would change exact source bytes merely to satisfy a downstream presentation concern. Drawing a second project-specific graph from Semantic Process IL would duplicate BPMN presentation semantics and lose compatibility with the selected `bpmn-js` viewer. Generating layout on every browser render would make presentation nondeterministic, move provenance into the client, and repeat work.

## Decision

A definition diagram resolves in this order:

1. Use usable BPMN DI already embedded in the exact admitted BPMN XML.
2. Otherwise use a persisted sidecar whose `sourceSha256` exactly equals the admitted source digest.
3. Otherwise generate one sidecar through the selected deterministic layout adapter, persist it, and return it on subsequent reads.
4. Treat a stale, malformed, differently bound, corrupt, or digest-invalid stored sidecar as an integrity failure. It blocks presentation until an explicit repair removes or replaces it; an ordinary read never regenerates over corruption.

The source BPMN XML remains the only admitted and executable source. The sidecar is presentation data and never enters BPMN source import, checked graph construction, Semantic Process IL, the semantic core, the Temporal Workflow, CIB evidence, or definition identity.

## Sidecar contract

The logical sidecar is a closed immutable record:

```ts
type BpmnDiagramPresentationSidecar = DeepReadonly<{
  schemaEpoch: 1;
  sourceSha256: string;
  diagramInterchangeSha256: string;
  presentationSha256: string;
  provenance: {
    kind: "generated";
    generatorId: "bpmn-auto-layout";
    generatorVersion: "1.3.0";
    effectiveGeneratorSha256: string;
  };
  diagramInterchangeXml: string;
}>;
```

`diagramInterchangeXml` contains one namespace-self-contained BPMNDiagram subtree. Its root carries the exact `bpmndi`, `dc`, and `di` namespace bindings required by its descendants, regardless of which prefixes the admitted source declared. Its SHA-256 is computed over its exact UTF-8 bytes. The resolver inserts that subtree immediately before the exact admitted source's closing `definitions` tag without reserializing or replacing any source byte, then validates the complete composed XML with a namespace-strict parser and computes `presentationSha256` over the exact resolved UTF-8 presentation. The original source bytes must remain an ordered byte-for-byte subsequence separated only by the inserted DI subtree. Persisting only DI makes non-DI preservation structural rather than a trust claim about the generator's reserialized output. The adapter still parses the generated candidate and proves that every generated DI reference resolves to an existing exact source ID and that the selected Process, flow nodes, and Sequence Flows have the required plane, shapes, and edges before extracting the subtree. A sidecar is equivalent only when every closed field, all three digests, and all exact UTF-8 payload bytes match.

The sidecar's durable storage representation belongs to the Definitions module. It is not a public filesystem-path contract. The HTTP response exposes presentation bytes and provenance, never the private storage location.

The public closed response is:

```ts
type ResolvedBpmnDiagramPresentation = DeepReadonly<{
  schemaEpoch: 1;
  definition: DeployedDefinitionVersion;
  sourceSha256: string;
  presentationSha256: string;
  provenance:
    | { kind: "source" }
    | {
        kind: "generated";
        generatorId: "bpmn-auto-layout";
        generatorVersion: "1.3.0";
        effectiveGeneratorSha256: string;
      };
  presentationBpmnXml: string;
}>;
```

It is returned by `GET /api/v1/definitions/{processId}/versions/{version}/presentation`. Source provenance is explicit rather than inferred from absence of a generated field. The server recomputes `sourceSha256` from the admitted artifact before resolution. The strict client compares that value to `definition.source.sha256`, recomputes `presentationSha256` from the returned UTF-8 presentation, refuses recursive extras/private fields, and binds `definition` to the requested exact version. Returning a second copy of source bytes merely so the browser can hash them is rejected as redundant.

## Generation lifecycle

Generation is invoked by the Definitions presentation service after semantic admission and durable definition identity are known. The Product 2 presentation foundation owns the adapter and its presentation-only parser graph; Definitions owns the durable record and public route. The durable key is `{schemaEpoch, sourceSha256, effectiveGeneratorSha256}`. `effectiveGeneratorSha256` binds adapter epoch 1 plus the complete output-affecting locked graph: `bpmn-auto-layout@1.3.0`, `bpmn-moddle@10.0.0`, `moddle@8.2.0`, `moddle-xml@12.1.0`, `min-dash@5.1.0`, and `saxen@11.1.0`. An SQLite `BEGIN IMMEDIATE` insert-or-compare transaction makes generation idempotent across independent connections: an equivalent candidate reuses the winner, while any field or byte conflict is an integrity failure.

Generation runs in a killable worker with bounded source and output bytes. The deadline terminates that worker, rather than racing a Promise on the blocked main thread. A crash or termination before commit leaves no row and restart may generate again; after commit restart must reuse and revalidate the exact row. An existing corrupt row blocks automatic regeneration so ordinary reads cannot silently rewrite forensic evidence.

The browser never generates layout. It requests one resolved presentation and renders it through `bpmn-js`. The UI identifies source-owned versus generated layout and keeps the viewer attribution visible.

## External modeller handoff

The sidecar is an internal storage and provenance format, not a standalone modeller interchange file. Existing BPMN modelers generally open one complete BPMN XML document containing both the semantic model and BPMN DI, so they are not expected to understand this repository's sidecar record.

The Definitions Diagram tab therefore provides **Download diagrammed BPMN**. It downloads `presentationBpmnXml` as `application/bpmn+xml`, whether the DI came from the admitted source or from a generated sidecar. The generated arm is the exact admitted BPMN XML plus the validated namespace-self-contained BPMNDiagram subtree. It is a complete derived BPMN document that can be opened in standards-oriented modelers such as the Camunda Modeler or other BPMN DI-capable tools. The UI labels it as a derived presentation copy, not the admitted source.

After a modeller edits or saves the downloaded document, its bytes and authorship have changed. Importing it back into this platform creates and admits a new definition version through the ordinary BPMN source boundary; it never overwrites the original admitted artifact or mutates its sidecar in place. A modeller-saved document with usable embedded DI then resolves through the source-owned arm on that new version. This round trip is the recommended path for replacing generated layout with deliberately authored layout.

Downloading the raw DI subtree as if it were a complete BPMN model is excluded. A future layout-only editor could emit a replacement sidecar only if it preserves the same digest, namespace, reference, validation, and insert-or-compare contract, but no such public editing surface is selected for M3.

Every definition registered in the M3 showcase must resolve either source DI or a valid sidecar. Future registered models without source DI must either be supported by the selected generator or supply source DI before they can satisfy the platform diagram acceptance gate. Failure to produce presentation does not reinterpret or reject otherwise admitted engine source, but it blocks claiming complete platform presentation for that definition.

## Selected generator

Use [`bpmn-auto-layout@1.3.0`](https://github.com/bpmn-io/bpmn-auto-layout/tree/v1.3.0) behind a small Product 2 presentation-foundation adapter. It is MIT-licensed, produces BPMN DI from BPMN XML, and belongs to the same `bpmn-io` representation ecosystem as the selected viewer. This is a presentation-only exception to the semantic parser boundary: raw moddle objects and generator diagnostics remain private to the adapter, no parser type or generated non-DI model escapes, and the adapter has no semantic authority. `@bpmn-lean/bpmn-source`, Lean, semantic-core, engine APIs, and Temporal remain byte-unchanged by presentation generation.

The generated arm deliberately supports exactly one root Process composed of the ordinary flow-node and Sequence Flow shapes exercised by the M3 human-work model. Multiple root Processes, collaborations, participants, message flows, collapsed or expanded Sub-Processes, Call Activities requiring another root plane, groups, text annotations, associations, and data artifacts require usable source DI and otherwise fail closed. The repository's two-root Call Activity source is the retained negative. Extending generator coverage is a presentation task and must not modify semantic admission to fit the generator.

Source DI is usable when the selected executable Process has exactly one BPMNPlane bound to its exact ID; every displayed flow node has exactly one finite positive-bounds BPMNShape; every displayed Sequence Flow has exactly one BPMNEdge with at least two finite waypoints; and all DI references resolve to exact source IDs. Duplicate diagram IDs, duplicate coverage, a plane for a different root, non-finite geometry, or missing required coverage makes source DI unusable. Source-owned diagrams may contain other valid presentation elements, but the task highlight still requires its exact element in the imported registry.

## Alternatives

| Alternative | Decision | Rationale |
|---|---|---|
| Require source BPMN DI for every executable model | Rejected | Presentation coordinates must not become an engine admission requirement |
| Mutate the admitted source by inserting generated DI | Rejected | It changes exact source identity and confuses authored source with a derivative |
| Generate layout in each browser session | Rejected | It repeats work, weakens deterministic provenance, and makes the client a diagram producer |
| Draw a custom SVG from checked Process data or Semantic Process IL | Rejected | It duplicates BPMN presentation logic and risks treating an execution representation as authored source |
| Store an unbound diagram by Process ID or definition version | Rejected | The diagram could silently drift from exact source bytes |
| Persist an exact-digest sidecar generated once | Selected | It preserves source identity, supports the existing viewer, and makes provenance testable |

## Integrity and security

The presentation boundary decodes a closed sidecar, recomputes all digests, validates DI-to-source references and coverage, and refuses recursive extra or private fields at its public transport. Generation has bounded input/output sizes and an OS-terminable per-call deadline. A generator exception or timeout is a presentation failure, never a semantic outcome.

The renderer treats BPMN text and generated DI as untrusted presentation input under its existing viewer boundary. Sidecar provenance must not include host paths, internal database keys, Workflow IDs, or generator logs.

## Acceptance

Focused evidence must prove:

1. source-owned DI wins and no sidecar is generated;
2. the exact metadata-only M3 model gets namespace-valid composed XML, a valid generated sidecar, and a rendered diagram while retaining every admitted source byte in order;
3. the same source digest is idempotent across restart and across two independent SQLite connections;
4. a one-byte semantic source change cannot reuse the old sidecar;
5. a changed source digest, DI digest, presentation digest, provenance value, effective-generator identity, or DI XML is rejected;
6. a conflicting independent-connection candidate and a corrupt retained row fail closed without replacement;
7. a genuinely stalled worker is terminated at the deadline without modifying admitted source or engine identity;
8. generated output can contribute only validated DI and cannot change any non-DI source byte;
9. the two-root Call Activity and every other excluded construct fail closed without source DI;
10. the UI visibly distinguishes source DI from generated layout and renders an honest unavailable task diagram when exact host binding is insufficient;
11. every registered M3 showcase definition resolves a diagram.
12. the Definitions Diagram tab downloads the exact resolved complete BPMN XML, labels generated output as a derived presentation copy, and never exposes the raw sidecar as a modeller file.

## Related owners

- [BPM platform UI/UX and information-architecture research](research/BPM-PLATFORM-UI-UX-INFORMATION-ARCHITECTURE-RESEARCH.md) owns the diagram-as-orientation product finding.
- [BPM platform information architecture proposal](BPM-PLATFORM-INFORMATION-ARCHITECTURE-PROPOSAL.md) owns where definitions and task diagrams appear.
- [BPM platform UI design proposal](BPM-PLATFORM-UI-DESIGN-PROPOSAL.md) owns diagram sizing, loading, failure, and provenance presentation.
- [BPMN XML ingestion decision](BPMN-XML-INGESTION-DECISION.md) owns exact admitted source and parser boundaries.
- [Architecture](ARCHITECTURE.md#user-interface) owns package direction and the selected viewer.
