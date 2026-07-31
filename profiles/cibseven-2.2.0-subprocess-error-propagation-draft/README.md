# CIB Seven 2.2.0 embedded Sub-Process Error propagation draft profile

This draft profile selects one ordinary embedded Sub-Process in which an exact-code Error End Event is caught by the single interrupting boundary Error attached to that Sub-Process. Catching removes the child scope occurrence and its unfinished sibling User Task, preserves the root Process, and exposes one outer recovery User Task.

The [profile artifact](profile.json) pins CIB Seven `2.2.0` at the reviewed source revision and the controlled public-service environment. BPMN 2.0.2 supplies semantic authority. Registered agreement `CIB-AGR-0008` records the bounded public lifecycle for the project-authored fixture in both child-command orders; it does not make CIB's handler search, execution tree, or hidden cancellation mechanics authoritative.

The profile reuses `CIB-AGR-0001`, `CIB-AGR-0002`, and `CIB-OP-0001` only for Process lifecycle, active User Task discovery/completion, and host-task mapping to exact semantic occurrences. In the stale schedule, `CIB-AGR-0008` owns only the recovery-state prefix and sibling disappearance; `CIB-OP-0001` owns the mapping from the removed generated host task and its refusal to the project stale semantic occurrence/result. The governing boundaries are in the [Error propagation capsule](../../docs/capsules/SUBPROCESS-ERROR-PROPAGATION-SPEC.md) and [CIB–BPMN relationship register](../../docs/CIB-BPMN-RELATION-REGISTER.md).

Catch-all or multiple handlers, ancestor search, unresolved Errors, arbitrary nesting, repeated activation, Event Sub-Processes, Error payloads, compensation, termination, concurrency races, and every other unlisted BPMN feature remain excluded.

Its status remains `draft`. Results must not be reported as general CIB Error compatibility or BPMN Process Execution Conformance.
