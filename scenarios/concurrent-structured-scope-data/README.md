# Concurrent structured scope data sources

The [concurrent structured scope data specification](../../docs/capsules/CONCURRENT-STRUCTURED-SCOPE-DATA-SPEC.md#separating-witnesses) owns the bounded account. Both retained project-authored models run under the [nested scope-data profile](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json) with Parallel forks inside Sub-Process bodies, each with its own exact source overlay.

| Model | Journey |
|---|---|
| [Order fulfilment](order-fulfilment.bpmn) with [handlers](order-fulfilment-overlay.json) | *Fulfil order* forks into *Pick stock* and *Plan shipment*, each declaring its own copy of the structured `order`. *Pick items* snapshots its arguments when armed, so a later *Review route* write of `instructions` leaves the open snapshot unchanged; *Rate shipment*'s one result reaches *Fulfil order*'s `label` and the Process `carrierQuote`, which *Notify customer* reads after the join. |
| [Loan assessment](loan-assessment.bpmn) with [handlers](loan-assessment-overlay.json) | *Assess application* forks into *Credit check* and *Collateral valuation*, each copying the structured application into its own `dossier` and asking the one *Expert review* Process through its own mapped Call. *Prepare valuation* amends only its own dossier, and each opinion lands in its own declared local. The model has no Service Task, so its overlay binds no handler. |

The [source test](../../packages/bpmn-source/test/concurrent-structured-scope-data-source.test.ts) compiles both models as concurrent Programs of the profile and locks the refused one-fact mutations; the [runtime test](../../packages/bpmn-source/test/concurrent-structured-scope-data-runtime.test.ts) reads every frame, snapshot and Process value of both schedules of each model in committed state.

Four answer-free schedules are registered as standards-only pipeline cases by the [pipeline cases](../../packages/differential/test/concurrent-structured-scope-data-pipeline-cases.ts), each with one seeded mutation:

- [Order, Review route first](order-review-first.scenario.json) refuses a *Review route* completion that writes *Pick stock*'s `packing`, then completes *Review route* with `instructions` as the Map `{handling: "fragile"}` and a rerouted shipment while *Pick items* is open, so *Pick items* keeps its `standard` arming snapshot. Its mutation rewrites that open snapshot to the Map, as rewriting open snapshots on a frame write would.
- [Order, Pick items first](order-pick-first.scenario.json) returns two equal parcels from *Pick items* before *Review route* completes, so the Process `shippedParcels` keeps both. Its mutation leaves one parcel, as deduplicating list members would.
- [Loan, valuation expert first](loan-valuation-first.scenario.json) returns the valuation opinion while the credit expert still waits, so *Collateral valuation* publishes its surveyed `valuationFile` before the join. Its mutation keeps `valuationFile` out of the Process, as deferring branch outputs to the join would.
- [Loan, credit expert first](loan-credit-first.scenario.json) returns the credit opinion first, so the Process `creditFile` carries the applicant's present-null `employer`. Its mutation drops that entry, as dropping present-null Map entries would.
