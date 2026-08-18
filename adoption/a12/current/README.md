# Current A12 adoption evidence

This optional generation applies the current data-only source-overlay contract to the two preserved project-authored A12-shaped fixtures. Each scenario selects a product-neutral engine profile and content-binds the exact overlay identity. The fixtures remain outside all product registries, builds, examples, and runtime packages.

The exact external A12 Workflows checkout remains read-only and is inspected only through the separate adoption gate. These project-authored fixtures are not copies of that EUPL-1.2 source and do not constitute an A12 add-on, handler implementation, migration, or distribution.

## Resume point for a future A12 add-on

The boundary is ready for calibration, but a deployable A12 add-on is not implemented here. Production adoption starts in a separate A12-owned repository after the BPM platform publishes its supported compile, start, observe, and command contract. The current [`compileBpmnToSemanticProcess`](../../../packages/bpmn-source/README.md) and [`ExternalTemporalRuntime.connect`](../../../packages/temporal-adapter/README.md) surfaces demonstrate the technical seam; they are not a substitute for the narrowed product-2 package and API boundary that [`implementation-status-owner:BPM-PLATFORM`](../../../docs/BPM-PLATFORM-IMPLEMENTATION-MAP.md#explicitly-absent) still records as absent.

Resume in this order:

1. Provision the exact evidence inputs with `./scripts/setup-external-sources.sh adoption`, then run `./scripts/test-a12-adoption.sh`. This proves the retained calibration state only; it does not prove a deployable add-on.
2. Select one exact A12 model and classify each unsupported fact against the [A12 compatibility ledger](../../../docs/research/A12-WORKFLOWS-COMPATIBILITY-LEDGER.md). A missing reusable BPMN mechanism or reviewed CIB relationship returns to the MIT engine as a neutral requirement. An A12 binding, handler, façade, blueprint, or migration concern stays in product 3.
3. In the A12-owned repository, create a source-overlay artifact conforming to the engine's closed [overlay schema](../../../contracts/schemas/bpmn-source-overlay.schema.json). Bind its exact ID, SHA-256, bytes, and selected neutral semantic profile through `SourceOverlaySelection`. Use these two current overlay artifacts as examples, not as production registrations or code to copy into core.
4. Implement A12 effect handlers behind the neutral `EffectActivities.executeBpmnEffect` contract, keyed by the profile-owned protocol and operation. Preserve the engine-issued idempotency key and return only the typed success or business-error result the semantic core validates. Do not expose `DelegateExecution`, A12 service objects, or product state to the Workflow or semantic core.
5. Implement A12-owned profile/overlay migration, the `ProcessEngineClient` façade replacement, and the Workflows-enabled full-stack-template integration. The legacy profile identity may translate only to the reviewed neutral profile plus exact overlay identity; no production reader accepts the frozen legacy artifacts.
6. Close adoption with exact-source admission, real handler execution, façade behavior, and blueprint integration for the selected model. Compare the resulting checked graph, Semantic Process program, canonical result, and CIB host projection against the frozen generation outside the approved identity translation. Only this end-to-end lane may increase the ledger's closed exact-model product count.

Keep the [legacy generation](../legacy/README.md) read-only. If continuing work appears to require editing it, importing the external A12 checkout, registering an A12 profile in the engine, or adding an A12-specific compiler or Workflow branch, stop and reclassify the work because it has crossed the product or licence boundary.
