# BPMN source ingestion

`@bpmn-lean/bpmn-source` is the deployment-time boundary between untrusted BPMN XML and the dependency-free [TypeScript semantic core](../semantic-core/README.md). It retains defensive copies of exact bytes, computes SHA-256 identity before decoding, performs bounded security and encoding checks, imports a private metamodel-aware graph with `bpmn-moddle@10.0.0`, normalizes diagnostics, projects an admitted checked BPMN graph, and lowers that graph into a project-owned serializable Semantic Process program.

The bounded compiler applies profile-selected mechanism/cardinality capability to a reusable checked-graph validator for references, node arity, reachability, co-reachability, and either whole-graph or resumption-cut acyclicity. It accepts the reviewed sequential User Task, balanced two-branch Parallel Gateway, exact `PT1S` Timer, finite acyclic Timer/User Task and Message/User Task compositions, one exact resumption-bounded User Task cycle, the exact direct-Message Receive Task semantic checkpoint, one top-level payload-free Message Start Event followed by a User Task and None End, payload-free and bounded mapped Service Tasks, Simple Boolean Exclusive Gateway, structured Inclusive Gateway, bounded Event-Based Gateway, ordinary embedded Sub-Process, direct-parent Sub-Process Error propagation, and one exact namespace-qualified in-document called Process. The checked graph preserves BPMN node and Sequence Flow identities, exact conditions and mappings, definition-scope ownership, explicit boundary/Error End identity and attachment, the timer's exact `PT1S` literal, the complete MessageEventDefinition → Interface Operation → input Message reference chain for both passive catch and Message Start, the Receive Task's resolved direct Message ID, the Call Activity's resolved called Process ID, and nullable source-overlay identity. The Message Start lowerer copies that exact channel and derives canonical distinct `initiateMessage` outputs from the complete validated outgoing Sequence Flow set. The cycle profile classifies its converging Exclusive Gateway as identity-only checked source and derives the canonical nonempty `mergeExclusive` inputs solely from validated Sequence Flow endpoints. Raw namespace/QName validation remains source-only. The required root Message, Interface, and Operation names are validated but deliberately do not cross the checked-source boundary. The lowerer emits the current typed Semantic Process operations with one control place per ordinary admitted Sequence Flow plus the reviewed virtual completion edges. Optional User Task names preserve omission as `null`. Every parser warning blocks admission, and unsupported elements or properties are rejected instead of discarded. Raw moddle objects never cross the package boundary.

```ts
const compilation = await compileBpmnToSemanticProcess({
  bytes,
  sourceId: scenario.bpmn.id,
  sourceOverlay: null,
  expectedSha256: scenario.bpmn.sha256,
  semanticProfile: scenario.profile,
  limits: {
    maxBytes: 1024 * 1024,
    parserDeadlineMs: 1_000,
  },
});

switch (compilation.status) {
  case BpmnCompilationStatus.Accepted:
    return runScenario(scenario, compilation.semanticProcess);
  case BpmnCompilationStatus.Rejected:
    throw new Error(JSON.stringify(compilation.diagnostics));
}
```

A refused compilation reports a list rather than one message. A refusal decided by **classification**, whether the selected profile executes an element, preserves it, or rejects it, carries a `BpmnSourceElement` naming its nullable BPMN `id`, its parsed `$type`, the containment path that locates it when the source gave it no `id`, the property or extension attribute the reason names, and the `BpmnAdmissionCapability` the profile would have to gain. The generic compiler and the three readers for one selected model shape classify unsupported own properties on selected executed flow elements before projection. One closed profile/type key inventory supplies both that classifier and every top-level projector predicate, while unsupported values, nested children, topology, and cardinality remain with their existing structural owners. Classification refusals are collected across loci rather than returned at the first one, deduplicated, and ordered by containment path with array indices compared as numbers, so an identical source yields an identical storable list. Refusals stated over the whole document or over the checked graph, including encoding, the root multiset, connectivity, arity, and profile cardinalities, carry `element: null`, because naming one element there would be a location the compiler cannot justify. Each parser warning is normalized into the same record and located when the parser names the referring element, so a file with four malformed references reports four.

One closed [compilation dispatch registry](src/compilation-dispatch.ts) pairs the generic fallback, the two product-neutral mapped Service Task profiles, and the Call Activity profile with engine-owned readers and mandatory admission policies. The mapped profiles may consume one content-bound [data-only source overlay](../../contracts/schemas/bpmn-source-overlay.schema.json). An overlay may add alternate exact source bindings only for the selected profile's existing descriptor and may declare exact inert expanded-name loci; it cannot add a reader, checked-node kind, operation, transition, or host behavior. A registry-derived test compares the complete accepted or rejected public result with immutable pre-refactor projections for every entry, so a new reader requires its own adversarial case and a behavior change cannot pass as a dispatch refactor.

Two rules decide a **malformed** source rather than a profile boundary, and both block before classification runs, because a document whose own references do not resolve to the kinds their properties declare cannot be exhaustively classified. Parser warnings are one. The other is the reference-target-type rule, which takes no profile parameter and is applied once above the profile dispatch for exactly that reason; both still report the same located per-element record.

The parser deadline bounds Promise settlement but cannot preempt synchronous parser CPU. Production handling of untrusted uploads still requires Worker or process isolation.

The bounded [CMOF-derived manifest](src/bpmn-2.0.2-semantic-process-metamodel.json) records only the types, inheritance, references, multiplicities, containment, and defaults consumed by this compiler. The local checker compares those facts with the exact external normative `BPMN20.cmof`; absence is an infrastructure failure, never a skipped or reduced metamodel lane. It does not claim a complete BPMN metamodel or operational semantics.

Run the focused gate:

```sh
./scripts/pnpm.sh run test:bpmn-source
```

Run the optional pinned MIWG interchange observation gate:

```sh
./scripts/pnpm.sh run test:miwg
```

MIWG files remain in their external CC-BY checkout. The gate classifies structural/profile admission without copying fixtures or claiming execution conformance.
