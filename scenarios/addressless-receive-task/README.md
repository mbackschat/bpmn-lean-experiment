# Addressless Receive Task scenario

This [parcel handover](process.bpmn) waits at a Receive Task that names no Message until the courier's scanner resumes it by its published occurrence. The [addressless Receive Task proposal](../../docs/capsules/ADDRESSLESS-RECEIVE-TASK-PROPOSAL.md) owns its semantics, exclusions and evidence lanes; the [CIB probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenAddresslessReceiveTaskProbeTest.java) calibrates CIB's execution-signal realization on it.
