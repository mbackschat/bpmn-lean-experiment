# BPMN diagram presentation decision

## Status

**Owner-directed draft for independent review.** This decision proposes embedded BPMN DI plus an exact-source-digest-bound generated presentation sidecar for BPM platform diagrams. Owner direction approves the design for review, but implementation remains paused at this decision boundary. It does not change BPMN source admission, checked Process meaning, Semantic Process IL, runtime state, or Temporal execution.

## Context

The execution pipeline correctly admits BPMN source that has no BPMN DI because diagram coordinates are not execution semantics. The M3 browser review nevertheless showed that a registered human-work model without DI produces an empty presentation and leaves users unable to understand the Process they are starting or the task they are completing.

Adding coordinates to the admitted XML would change exact source bytes merely to satisfy a downstream presentation concern. Drawing a second project-specific graph from Semantic Process IL would duplicate BPMN presentation semantics and lose compatibility with the selected `bpmn-js` viewer. Generating layout on every browser render would make presentation nondeterministic, move provenance into the client, and repeat work.

## Decision

A definition diagram resolves in this order:

1. Use usable BPMN DI already embedded in the exact admitted BPMN XML.
2. Otherwise use a persisted sidecar whose `sourceSha256` exactly equals the admitted source digest.
3. Otherwise generate one sidecar through the selected deterministic layout adapter, persist it, and return it on subsequent reads.
4. Reject a stale, malformed, differently bound, or digest-invalid sidecar. Never try it as a best-effort fallback.

The source BPMN XML remains the only admitted and executable source. The sidecar is presentation data and never enters BPMN source import, checked graph construction, Semantic Process IL, the semantic core, the Temporal Workflow, CIB evidence, or definition identity.

## Sidecar contract

The logical sidecar is a closed immutable record:

```ts
type BpmnDiagramPresentationSidecar = DeepReadonly<{
  schemaEpoch: 1;
  sourceSha256: string;
  presentationSha256: string;
  provenance: {
    kind: "generated";
    generatorId: "bpmn-auto-layout";
    generatorVersion: "1.3.0";
  };
  presentationBpmnXml: string;
}>;
```

`presentationBpmnXml` is a rendering derivative that contains the exact semantic model plus generated BPMN DI needed by the existing viewer. `presentationSha256` binds the returned bytes. A sidecar is equivalent only when every closed field and both digests match exactly.

The sidecar's durable storage representation belongs to the Definitions module. It is not a public filesystem-path contract. The HTTP response exposes presentation bytes and provenance, never the private storage location.

## Generation lifecycle

Generation occurs at the Definitions presentation boundary after semantic admission and durable definition identity are known. It is idempotent for one exact source digest. Concurrent equivalent generation converges on one equivalent sidecar; conflicting output for the same generator identity and source digest is an integrity failure.

The browser never generates layout. It requests one resolved presentation and renders it through `bpmn-js`. The UI identifies source-owned versus generated layout and keeps the viewer attribution visible.

Every definition registered in the M3 showcase must resolve either source DI or a valid sidecar. Future registered models without source DI must either be supported by the selected generator or supply source DI before they can satisfy the platform diagram acceptance gate. Failure to produce presentation does not reinterpret or reject otherwise admitted engine source, but it blocks claiming complete platform presentation for that definition.

## Selected generator

Use [`bpmn-auto-layout@1.3.0`](https://github.com/bpmn-io/bpmn-auto-layout/tree/v1.3.0) behind a small Definitions-owned adapter. It is MIT-licensed, produces BPMN DI from BPMN XML, and belongs to the same `bpmn-io` representation ecosystem as the selected viewer.

Its documented limitations include incomplete collaboration and artifact layout and simplified behavior for some advanced constructs. The adapter must fail closed on an unsupported or timed-out input. Extending generator coverage is a presentation task and must not modify semantic admission to fit the generator.

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

The presentation boundary decodes a closed sidecar, recomputes both digests, and refuses recursive extra or private fields at its public transport. Generation has a bounded input size and an explicit per-call deadline. A generator exception or timeout is a presentation failure, never a semantic outcome.

The renderer treats BPMN text and generated DI as untrusted presentation input under its existing viewer boundary. Sidecar provenance must not include host paths, internal database keys, Workflow IDs, or generator logs.

## Acceptance

Focused evidence must prove:

1. source-owned DI wins and no sidecar is generated;
2. a metadata-only M3 model gets a valid generated sidecar and renders a diagram;
3. the same source digest is idempotent across restart;
4. a one-byte semantic source change cannot reuse the old sidecar;
5. a changed source digest, presentation digest, provenance value, or generated XML is rejected;
6. unsupported or timed-out generation does not modify admitted source or engine identity;
7. the UI visibly distinguishes source DI from generated layout;
8. every registered M3 showcase definition resolves a diagram.

## Related owners

- [BPM platform UI/UX and information-architecture research](research/BPM-PLATFORM-UI-UX-INFORMATION-ARCHITECTURE-RESEARCH.md) owns the diagram-as-orientation product finding.
- [BPM platform information architecture proposal](BPM-PLATFORM-INFORMATION-ARCHITECTURE-PROPOSAL.md) owns where definitions and task diagrams appear.
- [BPM platform UI design proposal](BPM-PLATFORM-UI-DESIGN-PROPOSAL.md) owns diagram sizing, loading, failure, and provenance presentation.
- [BPMN XML ingestion decision](BPMN-XML-INGESTION-DECISION.md) owns exact admitted source and parser boundaries.
- [Architecture](ARCHITECTURE.md#user-interface) owns package direction and the selected viewer.
