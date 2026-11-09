# Concurrent mapped Calls sources

This directory contains the exact BPMN 2.0.2 sources of the [concurrent mapped Calls specification](../../docs/kernel/semantics/WORK-SEMANTICS-SPEC.md). Each places Call Activities with `camunda:in` and `camunda:out` mappings on concurrent Parallel branches of the embedded completion profile, so every call reads its inputs from, and writes its outputs to, its own caller occurrence's chain.

- The [supplier onboarding source](supplier-onboarding.bpmn) forks into a Financial review and a Compliance review Sub-Process. Each declares a local file and a pending verdict, prepares the file and then asks one reusable Expert opinion Process, the financial call mapping the file in as `dossier` and `opinion` out to the verdict, the compliance call mapping it in as `screeningFile` and `finding` out. Each review publishes its verdict to the Process before the supplier is approved.
- The [travel request source](travel-request.bpmn) forks straight into a Budget check Call, a Visa check Call and a Booking Sub-Process whose local budget starts from the pre-approved budget. Each Call maps the traveller in; Budget check maps its confirmed budget out to `approvedBudget` and Visa check its decision to `visaStatus`.

The differential discovers these answer-free schedules from this directory through [scenario discovery](../../packages/differential/test/scenario-discovery.ts) and runs each on every kernel target:

- [Supplier, compliance expert first](supplier-compliance-first.scenario.json) prepares both files, refuses each expert's patch of the other Call's output, the financial task under the compliance identity and the compliance task after its return, and lets the compliance expert answer before the financial one.
- [Supplier, financial expert first](supplier-financial-first.scenario.json) lets the financial expert revise its `dossier` and answer first, so only its review's verdict reaches the Process, and refuses the compliance task under the caller's identity.
- [Travel request](travel-request.scenario.json) starts with the approved budget and no traveller, so one Start batch invokes both checks and enters Booking, then the budget check confirms a lower budget and the visa check grants the visa.
