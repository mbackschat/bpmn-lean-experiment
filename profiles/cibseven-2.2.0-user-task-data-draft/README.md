# CIB Seven 2.2.0 User Task data draft profile

This draft profile selects only enough behavior to observe one active semantic User Task occurrence, complete that exact occurrence with a canonical string/null Process-variable patch, and complete a sequential private executable Process.

The [profile artifact](profile.json) pins CIB Seven `2.2.0` at the reviewed source revision, Java 21, H2, controlled time, disabled automatic job execution, and the declared history configuration. It selects exact open-task projection, task-occurrence completion, and the bounded public-service create/overwrite/preserve string/null Process-variable merge while excluding assignment, authorization, forms, task-local or richer variables, deletion, Search Attributes, a global inbox, repeated task occurrences, concurrency, and every other unlisted BPMN feature.

Its stable relationship references connect the selected meaning to bounded lifecycle and User Task agreement (`CIB-AGR-0001`, `CIB-AGR-0002`), the completion-data extension (`CIB-EXT-0005`), the host-task identity mapping (`CIB-OP-0001`), and the pinned oracle configuration (`CIB-CFG-0001`). The governing evidence and limits are in the [CIB–BPMN relationship register](../../docs/CIB-BPMN-RELATION-REGISTER.md), [User Task interaction capsule](../../docs/capsules/USER-TASK-INTERACTION-SPEC.md), and [completion-data specification](../../docs/capsules/USER-TASK-COMPLETION-DATA-SPEC.md).

Its status remains `draft`. Results must not be reported as immutable CIB compatibility or BPMN Process Execution Conformance.
