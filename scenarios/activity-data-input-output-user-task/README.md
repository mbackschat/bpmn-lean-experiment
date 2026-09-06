# Activity data-input/output User Task scenarios

This directory contains the exact BPMN 2.0.2 claim-assessment source for the [Activity data-input/output mediation specification](../../docs/capsules/ACTIVITY-DATA-INPUT-OUTPUT-MEDIATION-SPEC.md). The User Task declares one required scalar `DataInput` in one `InputSet`, one required scalar `DataOutput` in one `OutputSet`, and two direct associations connecting distinct Process-owned Properties to the two ends of one Activity lifetime.

The [registered profile](../../profiles/bpmn-2.0.2-activity-data-input-output-user-task-draft/README.md) binds four answer-free schedules to these exact source bytes:

- [Present input and output](present.scenario.json): copy `claim-4711` into the open task and route the submitted `approve` decision into the Process Property on completion.
- [Explicit null](null.scenario.json): treat null as an available input and a supplied output, preserving it at both lifecycle boundaries.
- [Absent input](absent.scenario.json): start with no Process binding and retain the incoming token without arming a task or Activity-local scope.
- [Omitted output](omitted.scenario.json): refuse an empty completion while preserving the open task and its copied input.

The two Properties, data items, and associations use distinct identifiers so parser-reference resolution, copied-input publication, submitted-output matching, and association-routed Process writes cannot agree by name coincidence. The model carries no CIB Data Association target; the profile's CIB relationships cover only the reused User Task lifecycle and exact occurrence-addressed completion boundary.
