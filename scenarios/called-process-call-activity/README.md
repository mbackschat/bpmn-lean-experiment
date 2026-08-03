# Called-Process Call Activity scenario

This directory contains the exact admitted two-Process BPMN source and one [answer-free schedule](scenario.json) for the [bounded Call Activity specification](../../docs/capsules/CALL-ACTIVITY-SPEC.md). The caller invokes the called Process, the scenario completes `CalledTask` with the derived called semantic Process-instance ID, then completes `CallerTask` with the original caller/root ID.

Lean, the independent TypeScript semantic core, and Temporal are the execution targets. CIB Seven is retained only as provenance for a deferred feasibility seed and for the existing User Task interaction boundary; this scenario has no CIB execution target or retained CIB evidence. No expected result appears in target input.
