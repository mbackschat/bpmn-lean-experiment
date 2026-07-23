# CIB Seven 2.2.0 Milestone 0 spike profile

This directory identifies the mutable calibration profile used by the fast full-pipeline walking skeleton.

The [profile artifact](profile.json) pins CIB Seven `v2.2.0`, the intended embedded environment, the single sequential User Task feature surface, the canonical observation boundary, and the exclusions approved for Milestone 0.

Its status is `draft`. M0.2 has calibrated the first trace against the pinned engine and environment, but results using this profile remain calibration evidence only and must not be reported as an immutable CIB compatibility profile or as BPMN Process Execution Conformance.

The profile remains mutable while the Lean and TypeScript consumers establish the smallest common contract around the calibrated CIB result. Any later immutable profile must preserve or explicitly version the exact observable behavior and environment established by [M0.2](../../docs/MILESTONE-0-FAST-PIPELINE.md).
