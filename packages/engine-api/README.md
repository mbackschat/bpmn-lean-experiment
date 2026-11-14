# Engine API

`@bpmn-lean/engine-api` is Product 1's narrow entry point for Product 2. It exposes compilation, start preparation and recovery, committed observation, scheduling, Message Start, Message publication and population results, human-work commands, and incident operations without exposing Semantic Process programs or Temporal SDK identities. Accepted compilation projects complete target-free correlated Message capabilities from the immutable program, and the independently approved definition-scoped publication operation retains semantic, capacity, and infrastructure outcomes without exposing candidate or host identity.

## What you can do

Use the approved API from the Product 2 engine gateway to compile exact source, start an exact deployed definition, observe published engine facts, and submit content-bound commands. Process-local commands use opaque Process locators. Message publication (`publishEngineMessage`) addresses a channel or a Message name with typed criteria, payload, variables, business key, mode and an optional definition selector, and answers the population's resolution, or a typed refusal when the population refuses the publication before accepting it; `observeEnginePopulationResult` reads a settled population command back by its command identifier. Callers never supply a candidate locator or target; a reached or started instance comes back as an opaque Process locator, never a Workflow handle, Run ID, Event History, or private semantic anchor. Product 2's definition-scoped correlation publishes through it with an engine-projected complete semantic definition address, a caller-owned command identity, and payload. The bounded Product 2 binding is implemented and independently closure-reviewed.

Product 1 compilation and exact-definition direct-start requests accept an optional `sourceOverlay: { id, sha256, bytes } | null`; omission selects `null`. They snapshot the selected identity and bytes before asynchronous work and publish `definition.sourceOverlay: { id, sha256 } | null` alongside Process and profile identity. Preparation and prepared start bind that selection into the existing complete-Program intent; recovery compares the retained intent. Schedule and Message Start recompilation capture and validate the same selection; their current profiles reject nonnull overlays before host creation instead of silently discarding them. The [source-overlay contract](../../docs/A12-ADD-ON-BOUNDARY-SPEC.md#public-source-overlay-contract) owns validation and profile restrictions. Compilation acceptance remains separate from Temporal hosting qualification.

## Quick start

```sh
./scripts/pnpm.sh --filter @bpmn-lean/engine-api test
```

## Learn more

- [Architecture](../../docs/ARCHITECTURE.md#product-2-dependency-direction) owns the cross-product dependency boundary.
- [Production lifecycle specification](../../docs/TEMPORAL-PROCESS-LIFECYCLE-SPEC.md) owns durable start, command, and recovery behavior.
- [publication and observation semantics](../../docs/kernel/semantics/PUBLICATION-AND-OBSERVATION-SEMANTICS-SPEC.md) owns the published execution contract.
- [population semantics](../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md) owns the complete address, exact-cardinality result, retry, capacity, and target-exposure contract.
- [Structured Human Work specification](../../docs/BPM-PLATFORM-STRUCTURED-HUMAN-WORK-SPEC.md) owns the M6 completion-value boundary; this package derives that payload from the shared semantic contract and detaches caller storage without defining a second value union.
- The [kernel status map](../../docs/kernel/KERNEL-STATUS-MAP.md) records what the kernel implements and its [hosting evidence](../../docs/kernel/KERNEL-STATUS-MAP.md#assurance-and-adoption).
