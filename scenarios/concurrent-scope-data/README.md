# Concurrent scope data sources

This directory contains the exact BPMN 2.0.2 sources and handler overlays of the [concurrent scope data proposal](../../docs/capsules/CONCURRENT-SCOPE-DATA-PROPOSAL.md). Each places scope-local data in concurrently live Sub-Process occurrences of the embedded completion profile, so every read, write, input and output resolves through the occurrence that performs it.

- The [facility inspection source](facility-inspection.bpmn) opens an Inspection that declares the shared findings and an outer result, then forks straight into an Electrical check that shadows the result with a literal and a Fire safety check that reads the outer result. Each check records findings and outputs its own result to the Process, and Summarize maps findings and both results after the join. Its [handler overlay](facility-inspection-handlers.json) binds the summary handler.

The focused [source test](../../packages/bpmn-source/test/concurrent-scope-data-source.test.ts) compiles the source as a data-bearing Program, derives its required Start names and locks the refused source mutations.
