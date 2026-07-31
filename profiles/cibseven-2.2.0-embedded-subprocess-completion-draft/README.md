# CIB Seven 2.2.0 ordinary embedded Sub-Process completion draft profile

This draft profile selects one ordinary embedded Sub-Process with one child definition scope, a two-way Parallel Gateway fork, two distinct child User Tasks ending independently, quiescent child-scope completion, and one enclosing User Task after the scope.

The [profile artifact](profile.json) pins CIB Seven `2.2.0` at the reviewed source revision and the same controlled environment as the other `2.2.0` public-service observations. BPMN 2.0.2 supplies the semantic authority. Registered agreement `CIB-AGR-0007` records that the pinned CIB engine exposes the same bounded public lifecycle for the project-authored fixture in both child-completion orders; it does not make CIB's internal scope algorithm authoritative.

The profile reuses `CIB-AGR-0001`, `CIB-AGR-0002`, and `CIB-OP-0001` only for Process lifecycle, active User Task discovery/completion, and generated-host-task mapping to an exact semantic occurrence. The governing boundaries are in the [ordinary embedded Sub-Process completion specification](../../docs/capsules/EMBEDDED-SUBPROCESS-COMPLETION-SPEC.md) and [CIB–BPMN relationship register](../../docs/CIB-BPMN-RELATION-REGISTER.md).

Arbitrary nesting, repeated scope activation, Event Sub-Processes, boundary handling, Error propagation, Terminate End Events, child-local data, loops, multi-instance, Call Activities, transactions, compensation, public scope projection, human-task product features, and every other unlisted BPMN feature remain excluded.

Its status remains `draft`. Results must not be reported as general CIB Sub-Process compatibility or BPMN Process Execution Conformance.
