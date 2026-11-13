# Concurrent scope data sources

This directory contains the exact BPMN 2.0.2 sources and handler overlays of the [concurrent scope data specification](../../docs/kernel/semantics/DATA-SEMANTICS-SPEC.md). Each places scope-local data in concurrently live Sub-Process occurrences, so every read, write, input and output resolves through the occurrence that performs it.

- The [claim damage assessment source](claim-damage-assessment.bpmn) handles a claim whose vehicle and property inspections merge into Price damage, so two occurrences of that Sub-Process are live at once. Each declares a pending estimate and a null adjuster, assesses the damage and fetches rates with its own values, and outputs its estimate to the Process. Its [handler overlay](claim-damage-assessment-handlers.json) binds the rate lookup handler.
- The [facility inspection source](facility-inspection.bpmn) opens an Inspection that declares the shared findings and an outer result, then forks straight into an Electrical check that shadows the result with a literal and a Fire safety check that reads the outer result. Each check records findings and outputs its own result to the Process, and Summarize maps findings and both results after the join. Its [handler overlay](facility-inspection-handlers.json) binds the summary handler.

The differential discovers these answer-free schedules from this directory through [scenario discovery](../../packages/differential/test/scenario-discovery.ts) and runs each on every kernel target:

- [Claim, Fetch rates 1 first](claim-fetch-one-first.scenario.json) enters both Price damage occurrences, completes the first assessment unchanged and the second with an estimate of 4200, then fetches rates for the first occurrence before the second, so the Process keeps 4200.
- [Claim, Fetch rates 2 first](claim-fetch-two-first.scenario.json) fetches in the reverse order, so the Process keeps the first occurrence's pending estimate.
- [Facility inspection](facility-inspection.scenario.json) records the electrical findings and result, then the fire-safety findings without a result, so Summarize receives the later findings and the outer initial result.
