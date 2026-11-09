# Concurrent structured scope data sources

The [concurrent structured scope data specification](../../docs/kernel/semantics/DATA-SEMANTICS-SPEC.md) owns the bounded account. Both retained project-authored models run under the [nested scope-data profile](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json) with Parallel forks inside Sub-Process bodies, each with its own exact source overlay.

| Model | Journey |
|---|---|
| [Order fulfilment](order-fulfilment.bpmn) with [handlers](order-fulfilment-overlay.json) | *Fulfil order* forks into *Pick stock* and *Plan shipment*, each declaring its own copy of the structured `order`. *Pick items* snapshots its arguments when armed, so a later *Review route* write of `instructions` leaves the open snapshot unchanged; *Rate shipment*'s one result reaches *Fulfil order*'s `label` and the Process `carrierQuote`, which *Notify customer* reads after the join. |
| [Loan assessment](loan-assessment.bpmn) with [handlers](loan-assessment-overlay.json) | *Assess application* forks into *Credit check* and *Collateral valuation*, each copying the structured application into its own `dossier` and asking the one *Expert review* Process through its own mapped Call. *Prepare valuation* amends only its own dossier, and each opinion lands in its own declared local. The model has no Service Task, so its overlay binds no handler. |

The differential discovers these answer-free schedules from this directory through [scenario discovery](../../packages/differential/test/scenario-discovery.ts) and runs each on every kernel target:

- [Order, Review route first](order-review-first.scenario.json) refuses a *Review route* completion that writes *Pick stock*'s `packing`, then completes *Review route* with `instructions` as the Map `{handling: "fragile"}` and a rerouted shipment while *Pick items* is open, so *Pick items* keeps its `standard` arming snapshot.
- [Order, Pick items first](order-pick-first.scenario.json) returns two equal parcels from *Pick items* before *Review route* completes, so the Process `shippedParcels` keeps both.
- [Loan, valuation expert first](loan-valuation-first.scenario.json) returns the valuation opinion while the credit expert still waits, so *Collateral valuation* publishes its surveyed `valuationFile` before the join.
- [Loan, credit expert first](loan-credit-first.scenario.json) returns the credit opinion first, so the Process `creditFile` carries the applicant's present-null `employer`.
