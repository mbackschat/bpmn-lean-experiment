# Embedded Sub-Process Error propagation scenarios

This directory contains the project-authored BPMN fixture and three answer-free schedules for the [direct-parent Error propagation capsule](../../docs/capsules/SUBPROCESS-ERROR-PROPAGATION-SPEC.md).

[Trigger first](trigger-first.scenario.json) completes `Trigger Error` while `Sibling Work` remains active, observes only `Recover`, and completes the recovered route. [Sibling first](sibling-first.scenario.json) reaches the sibling None End before completing `Trigger Error`, then observes the same public recovery result and completes it. The [stale sibling schedule](stale-sibling-after-error.scenario.json) completes `Trigger Error` and then proves that the canceled Sibling Work occurrence is rejected without changing the committed recovery state. A rejected command terminates its answer-free schedule under the existing scenario outcome contract.

The [draft profile](../../profiles/cibseven-2.2.0-subprocess-error-propagation-draft/README.md) selects exact-code, direct-parent, single-handler propagation and records bounded public-lifecycle agreement with pinned CIB Seven `2.2.0`. Expected results remain verifier-owned content-bound evidence and never enter either target runner.
