# Addressless Receive Task scenario

This [parcel handover](process.bpmn) waits at a Receive Task that names no Message until the courier's scanner resumes it by its published occurrence. The [addressless Receive Task proposal](../../docs/capsules/ADDRESSLESS-RECEIVE-TASK-PROPOSAL.md) owns its semantics, exclusions and evidence lanes; the [CIB probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenAddresslessReceiveTaskProbeTest.java) calibrates CIB's execution-signal realization on it.

The [answer-free scenario](scenario.json) starts the handover, resumes the wait with the occurrence-addressed unspecified delivery, then sends a stale delivery to the consumed occurrence. The [named-delivery scenario](named-delivery-first.scenario.json) instead delivers a named Message to the same wait, which the account refuses.
