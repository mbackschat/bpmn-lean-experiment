# CIB Seven 2.2.0 Intermediate Catch Timer profile

The [immutable profile artifact](profile.json) selects one private executable `None Start Event → Intermediate Catch Timer Event with literal PT1S → None End Event` Process under CIB Seven `2.2.0`, Java 21, H2, a controlled clock, and disabled automatic job execution.

The profile claims only the reviewed wait, due-date, eligibility, and completion agreement recorded as `CIB-AGR-0004` under configuration `CIB-CFG-0001`. The job due-date delta is adapter-derived from the fixed clock epoch; the timer wait, ineligibility before due time, eligibility at due time, and due transition are engine-observed.

All other timer forms, expressions, races, cancellation, boundary attachment, repeated timers, messages, Activities, and broad BPMN or CIB compatibility remain excluded.
