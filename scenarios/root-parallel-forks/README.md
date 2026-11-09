# Root Parallel forks scenarios

The [root Parallel forks specification](../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md) owns the bounded account; the model is a witness for the [nested scope-data profile](../../profiles/cibseven-2.2.0-scope-chain/profile.json), with an exact source overlay binding its one Service Task to a caller-supplied Activity handler.

The [employee onboarding](employee-onboarding.bpmn) with its [handler](employee-onboarding-overlay.json) forks its Process root at *Start onboarding*. One branch prepares the workstation and orders a laptop, whose Service Task reads the structured `employee` and writes `assetTag` and `onboardingStage`; the other runs the Sub-Process *Collect documents*, which copies `employee` into its local `record`, lets *Confirm documents* amend it and copies it back out with its own `onboardingStage`. *Onboarding ready* joins both before *Hold welcome meeting*.

The [concurrent structured scope data probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenConcurrentStructuredScopeDataProbeTest.java) calibrates the two schedules CIB Seven `2.2.0` realizes.

The differential discovers these answer-free schedules from this directory through [scenario discovery](../../packages/differential/test/scenario-discovery.ts) and runs each on every kernel target:

- [Documents while the laptop order is open](onboarding-documents-while-laptop-open.scenario.json) prepares the workstation, then confirms the documents with an amended department while *Order laptop* is open, so the open order keeps the first `employee`.
- [Documents first](onboarding-documents-first.scenario.json) confirms the documents before the workstation is prepared, so *Order laptop* is armed with the amended `employee`.
- [Laptop first](onboarding-laptop-first.scenario.json) completes the laptop order before the documents, so the documents' `onboardingStage` is written last and stays.
