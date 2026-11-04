# Addressless Receive Task scenario

This [parcel handover](process.bpmn) waits at a Receive Task that names no Message until the courier's scanner resumes it by its published occurrence. The [addressless Receive Task specification](../../docs/capsules/ADDRESSLESS-RECEIVE-TASK-SPEC.md) owns its semantics, exclusions and evidence lanes; the [CIB probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenAddresslessReceiveTaskProbeTest.java) calibrates CIB's execution-signal realization on it.

The [answer-free scenario](scenario.json) starts the handover and resumes the wait with the occurrence-addressed unspecified delivery; the hosted target cannot observe a command after the Workflow closes, so the stale second delivery is a core and Lean witness only. The [named-delivery scenario](named-delivery-first.scenario.json) instead delivers a named Message to the same wait, which the account refuses.
