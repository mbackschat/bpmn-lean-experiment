# CIB Seven 2.2.0 User Task interaction spike profile

This draft profile extends the Milestone 0 calibration surface only far enough to observe one semantic User Task occurrence and complete it by its structured semantic identity.

The [profile artifact](profile.json) pins the same CIB Seven `v2.2.0` oracle and execution environment as the first spike profile. It adds exact open-task projection and task-instance completion while explicitly excluding assignment, authorization, forms, variables, Search Attributes, a global task inbox, and repeated task occurrences.

Its profile-document schema remains `0.1.0`; the new semantic meaning is identified by `cibseven-2.2.0-spike.2`, while its scenarios and canonical traces use their independent `0.2.0` schemas.

The governing interpretation and evidence boundaries are in the [User Task interaction semantic capsule](../../docs/capsules/USER-TASK-INTERACTION.md).

Its status remains `draft`. Results are calibration evidence only and must not be reported as an immutable CIB compatibility profile or BPMN Process Execution Conformance.
