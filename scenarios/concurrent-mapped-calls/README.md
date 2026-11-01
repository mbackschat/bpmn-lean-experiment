# Concurrent mapped Calls sources

This directory contains the exact BPMN 2.0.2 sources of the [concurrent mapped Calls proposal](../../docs/capsules/CONCURRENT-MAPPED-CALLS-PROPOSAL.md). Each places Call Activities with `camunda:in` and `camunda:out` mappings on concurrent Parallel branches of the embedded completion profile, so every call reads its inputs from, and writes its outputs to, its own caller occurrence's chain.

- The [supplier onboarding source](supplier-onboarding.bpmn) forks into a Financial review and a Compliance review Sub-Process. Each declares a local file and a pending verdict, prepares the file and then asks one reusable Expert opinion Process, the financial call mapping the file in as `dossier` and `opinion` out to the verdict, the compliance call mapping it in as `screeningFile` and `finding` out. Each review publishes its verdict to the Process before the supplier is approved.
- The [travel request source](travel-request.bpmn) forks straight into a Budget check Call, a Visa check Call and a Booking Sub-Process whose local budget starts from the pre-approved budget. Each Call maps the traveller in; Budget check maps its confirmed budget out to `approvedBudget` and Visa check its decision to `visaStatus`.

The focused [source test](../../packages/bpmn-source/test/concurrent-mapped-calls-source.test.ts) compiles both sources as data-bearing Programs, derives their required and optional Start names and locks the refused source mutations.
