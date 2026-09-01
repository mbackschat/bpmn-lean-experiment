import BpmnSemantics.CompensationEventSubProcessSnapshotLifecycleIntegrationConformance
import BpmnSemantics.CompensationEventSubProcessSnapshotRootClosureConformance
import BpmnSemantics.CompensationEventSubProcessSnapshotErrorInterruptionConformance
import BpmnSemantics.CompensationEventSubProcessSnapshotAtomicityConformance

/-! # Compensation Event Sub-Process snapshot integration checkpoint

Aggregate target for the split lifecycle, root closure, Error interruption, and atomic-refusal
evidence. The split is a resource boundary: each kernel-decided evidence family compiles in its
own process under the unchanged hard ceiling.
-/
