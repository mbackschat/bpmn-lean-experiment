# Parallel fork/join draft profile

This draft profile selects the normative bounded meaning of one Parallel Gateway fork, two distinct simultaneous User Tasks, and one balanced Parallel Gateway join. It requires per-incoming-Sequence-Flow synchronization, exact one-token-per-input consumption, preserved excess multiplicity, deterministic semantic task projection, and both external completion orders.

The [profile artifact](profile.json) pins the same CIB Seven `2.2.0` environment used by the sequential draft so that balanced behavior can be observed reproducibly. CIB is an observation producer for this profile, not its compatibility authority. The selected meaning comes from BPMN 2.0.2 and the owner-approved [parallel fork/join capsule](../../docs/capsules/PARALLEL-FORK-JOIN-PROPOSAL.md).

Candidate deviation [`CIB-DEV-0001`](../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-dev-0001--parallel-join-activates-from-duplicate-arrivals-through-one-incoming-flow) remains prominent. The balanced A/B target cannot distinguish CIB's count-based implementation from the normative per-incoming-flow rule, so agreement on these scenarios must not be reported as general CIB parallel compatibility.

Its status remains `draft`. Results must not be reported as immutable CIB compatibility or BPMN Process Execution Conformance.
