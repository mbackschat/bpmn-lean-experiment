# Concurrent structured scope data sources

The [concurrent structured scope data proposal](../../docs/capsules/CONCURRENT-STRUCTURED-SCOPE-DATA-PROPOSAL.md#separating-witnesses) owns the bounded account. Both retained project-authored models run under the [nested scope-data profile](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json) with Parallel forks inside Sub-Process bodies, each with its own exact source overlay.

| Model | Journey |
|---|---|
| [Order fulfilment](order-fulfilment.bpmn) with [handlers](order-fulfilment-overlay.json) | *Fulfil order* forks into *Pick stock* and *Plan shipment*, each declaring its own copy of the structured `order`. *Pick items* snapshots its arguments when armed, so a later *Review route* write of `instructions` leaves the open snapshot unchanged; *Rate shipment*'s one result reaches *Fulfil order*'s `label` and the Process `carrierQuote`, which *Notify customer* reads after the join. |
| [Loan assessment](loan-assessment.bpmn) with [handlers](loan-assessment-overlay.json) | *Assess application* forks into *Credit check* and *Collateral valuation*, each copying the structured application into its own `dossier` and asking the one *Expert review* Process through its own mapped Call. *Prepare valuation* amends only its own dossier, and each opinion lands in its own declared local. The model has no Service Task, so its overlay binds no handler. |

The [source test](../../packages/bpmn-source/test/concurrent-structured-scope-data-source.test.ts) compiles both models as concurrent Programs of the profile and locks the refused one-fact mutations; the [runtime test](../../packages/bpmn-source/test/concurrent-structured-scope-data-runtime.test.ts) reads every frame, snapshot and Process value of both schedules of each model in committed state.
