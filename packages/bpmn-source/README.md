# BPMN source ingestion

`@bpmn-lean/bpmn-source` is the deployment-time boundary between untrusted BPMN XML and the dependency-free [TypeScript semantic core](../semantic-core/README.md). It retains defensive copies of exact bytes, computes SHA-256 identity before decoding, performs bounded security and encoding checks, imports a private metamodel-aware graph with `bpmn-moddle@10.0.0`, normalizes diagnostics, projects an admitted checked BPMN graph, and lowers that graph into a project-owned serializable Semantic Process program.

The bounded compiler applies profile-selected mechanism/cardinality capability to a reusable checked-graph validator for references, node arity, reachability, co-reachability, and either whole-graph or resumption-cut acyclicity. It accepts the reviewed sequential User Task, balanced two-branch Parallel Gateway, exact `PT1S` Timer, finite acyclic compositions, one resumption-bounded cycle, selected Message and Start forms, the registered scope, effect, gateway, Call, Terminate, configured Task, and Boolean completion profiles. The Boolean profile compiles to the existing sequential checked graph and IL unchanged; value-domain admission remains in the semantic core. The configured Task profile alone selects `bpmn:Task` under its exact extension binding; every other profile keeps the element-located plain-Task refusal. The checked graph preserves admitted source identities, references, conditions, mappings, scope ownership, and exact source/profile identity. Raw moddle objects never cross the package boundary.

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

The bounded [machine-readable metamodel manifest](src/bpmn-2.0.2-semantic-process-metamodel.json) records only the types, inheritance, references, multiplicities, containment, defaults, and extension wrapper facts consumed by this compiler. The local checker compares CMOF-owned facts with exact external `BPMN20.cmof` and the inherited `BaseElement.extensionElements` singleton plus wildcard with exact external `Semantic.xsd`; absence of either source is an infrastructure failure, never a skipped or reduced lane. It does not claim a complete BPMN metamodel or operational semantics.

The package gate also compiles the exact registered Parallel Gateway source and compares its TypeScript committed-transition trace and current public token/scope positions with the independently encoded Lean result. The oracle rejects dropped, swapped, duplicated, or independently changed operation identity, kind, origin, owner, delta, and current-position facts while leaving the established scenario-result wire unchanged.

Run the focused gate:

```sh
./scripts/pnpm.sh run test:bpmn-source
```

Run the optional pinned MIWG interchange observation gate:

```sh
./scripts/pnpm.sh run test:miwg
```

MIWG files remain in their external CC-BY checkout. The gate classifies structural/profile admission without copying fixtures or claiming execution conformance.
