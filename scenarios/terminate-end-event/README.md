# Terminate End Event scenarios

This directory contains the project-authored BPMN fixture and three answer-free schedules for the [Terminate End Event capsule](../../docs/capsules/TERMINATE-END-EVENT-PROPOSAL.md). The BPMN bytes are identical to the source-admission fixture.

[Trigger first](trigger-first.scenario.json) starts with Trigger and Sibling active, completes Trigger to cancel Sibling and expose only Outer, then completes Outer. [Sibling first](sibling-first.scenario.json) completes Sibling, leaves Trigger active, completes Trigger to expose only Outer, then completes Outer. The [stale Sibling schedule](stale-sibling-after-termination.scenario.json) completes Trigger and then proves that the captured canceled Sibling occurrence is rejected. A rejected command terminates its answer-free schedule under the existing scenario outcome contract.

The [draft profile](../../profiles/bpmn-2.0.2-terminate-end-event-draft/README.md) selects BPMN 2.0.2 as semantic authority. The scenarios select no CIB Terminate target or retained CIB evidence; their CIB provenance names only the already reviewed User Task, parallel, ordinary Sub-Process completion, and occurrence-mapping surfaces reused by the profile.
