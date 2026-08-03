# Simple Boolean Exclusive Gateway scenario

This directory contains one [answer-free BPMN 2.0.2 standards-profile witness](scenario.json) for the [Exclusive Gateway conditional routing capsule](../../docs/capsules/EXCLUSIVE-GATEWAY-CONDITION-SPEC.md). Process-level Sequence Flow declaration order lists `Flow_First` before `Flow_Second`, while the gateway's `<outgoing>` references deliberately list default, second, then first. The first condition is literal `true`; the unevaluated second condition reads an absent Process binding.

The scenario starts the Process, observes only `Task_First`, completes that exact occurrence, and reaches Process completion. Lean, the independent TypeScript semantic core, and Temporal consume the same exact source/profile identity. No expected result is present in the target input.

CIB Seven appears only in provenance for the separately classified declaration-order and first-true/default calibration. CIB does not understand the project-owned Simple Boolean language URI, does not run this scenario, and supplies no retained result or expression-truth evidence for it.
