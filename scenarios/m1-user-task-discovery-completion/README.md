# User Task discovery and completion scenario

This scenario reuses the exact content-addressed BPMN resource from the [Milestone 0 sequential User Task scenario](../m0-sequential-user-task/README.md). It adds a structured semantic task-instance identity, an exact open-task projection, and completion by that full identity.

The successful trace observes one active task named `Approve` with Process-instance identity `Instance_1`, BPMN element identity `UserTask_Approve`, and activation ordinal `1`. It then completes that exact occurrence and observes Process completion.

Focused Lean, CIB, TypeScript, and Temporal tests supply the negative witnesses. A command with the correct element ID but activation ordinal `2` is rejected without state change, and repeated Temporal delivery of one command ID does not apply the semantic transition twice.

The contract and exclusions are owned by the [User Task discovery and completion capsule](../../docs/USER-TASK-DISCOVERY-COMPLETION-CAPSULE.md).
