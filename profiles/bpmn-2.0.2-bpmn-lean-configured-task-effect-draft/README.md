# BPMN 2.0.2 BPMN Lean configured Task effect draft profile

The [profile artifact](profile.json) selects one exact BPMN Lean `taskDefinition` binding by expanded namespace and handler type. It preserves the Task as `configuredTask` in checked source and lowers only that binding to the existing Activity/Probe `awaitEffect` operation with empty input and output mappings and no BPMN Error route.

BPMN 2.0.2 Clauses 7.7, 8.3.3, 10.3, 10.3.3.1, 13.3.2, and 13.3.3 plus Table 10.4 are the normative authority. The exact extension source, distinction from plain Abstract Task, profile binding, evidence, and exclusions belong to the [configured Task extension specification](../../docs/capsules/CONFIGURED-GENERIC-TASK-SPEC.md).

`CIB-AGR-0001` and `CIB-OP-0001` apply only to the unchanged trailing User Task and occurrence-mapping surfaces. This standards-and-project-extension profile selects no CIB configured Task target or retained CIB evidence.
